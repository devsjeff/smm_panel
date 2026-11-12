import { Router } from 'express';
import { OrderStatus, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma, Decimal } from '../db';
import { isProd } from '../env';
import { encrypt } from '../lib/crypto';
import { HttpError, paged, pageQuery } from '../lib/http';
import { requireAdmin, requireAuth } from '../middleware/auth';
import { enqueueDispatch, maintenanceQueue } from '../queues';
import {
  computeRate,
  getDefaultMarkup,
  refreshProviderBalance,
  repriceAll,
  setDefaultMarkup,
  syncProviderServices,
} from '../services/catalog';
import { OPEN_STATUSES, settleOrder } from '../services/orders';
import { ProviderError } from '../services/providerClient';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

const markup = z.coerce.number().min(0).max(10000);

// ---------- Overview ----------

adminRouter.get('/stats', async (_req, res) => {
  const [users, byStatus, money, completed, pendingDeposits, needsReview, providers] = await Promise.all([
    prisma.user.count(),
    prisma.order.groupBy({ by: ['status'], _count: true }),
    prisma.order.aggregate({ _sum: { charge: true, refundedAmount: true } }),
    prisma.order.aggregate({ where: { status: 'COMPLETED' }, _sum: { charge: true, cost: true } }),
    prisma.depositRequest.count({ where: { status: 'PENDING' } }),
    prisma.order.count({ where: { needsReview: true } }),
    prisma.provider.findMany({
      select: { id: true, name: true, balance: true, currency: true, isActive: true, lastError: true },
    }),
  ]);
  res.json({
    users,
    orders: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
    revenue: new Decimal(money._sum.charge ?? 0).sub(money._sum.refundedAmount ?? 0),
    completedProfit: new Decimal(completed._sum.charge ?? 0).sub(completed._sum.cost ?? 0),
    pendingDeposits,
    needsReview,
    providers,
  });
});

// ---------- Providers ----------

const providerBody = z.object({
  name: z.string().trim().min(1).max(100),
  apiUrl: z
    .string()
    .trim()
    .url()
    .refine((u) => (isProd ? u.startsWith('https://') : /^https?:\/\//.test(u)), 'must be an https URL'),
  apiKey: z.string().trim().min(1).max(500),
  isActive: z.boolean().default(true),
  markupPercent: markup.nullable().default(null),
});

const providerSelect = {
  id: true,
  name: true,
  apiUrl: true,
  isActive: true,
  markupPercent: true,
  balance: true,
  currency: true,
  lastSyncedAt: true,
  lastError: true,
  _count: { select: { services: true } },
} as const;

adminRouter.get('/providers', async (_req, res) => {
  res.json(await prisma.provider.findMany({ orderBy: { createdAt: 'asc' }, select: providerSelect }));
});

adminRouter.post('/providers', async (req, res) => {
  const { apiKey, ...body } = providerBody.parse(req.body);
  const provider = await prisma.provider.create({
    data: { ...body, apiKeyEnc: encrypt(apiKey) },
    select: providerSelect,
  });
  res.status(201).json(provider);
});

adminRouter.patch('/providers/:id', async (req, res) => {
  const { apiKey, ...body } = providerBody.partial().parse(req.body);
  const provider = await prisma.provider.update({
    where: { id: req.params.id },
    data: { ...body, ...(apiKey ? { apiKeyEnc: encrypt(apiKey) } : {}) },
    select: providerSelect,
  });
  if (body.markupPercent !== undefined) await repriceAll();
  res.json(provider);
});

function providerFailure(e: unknown): never {
  if (e instanceof ProviderError) throw new HttpError(502, `Provider: ${e.message}`);
  throw e;
}

adminRouter.post('/providers/:id/sync', async (req, res) => {
  const result = await syncProviderServices(req.params.id).catch(providerFailure);
  res.json(result);
});

adminRouter.post('/providers/:id/balance', async (req, res) => {
  const p = await refreshProviderBalance(req.params.id).catch(providerFailure);
  res.json({ balance: p.balance, currency: p.currency });
});

// ---------- Services & pricing ----------

adminRouter.get('/services', async (req, res) => {
  const q = pageQuery
    .extend({ search: z.string().trim().optional(), providerId: z.string().optional() })
    .parse(req.query);
  const where: Prisma.ServiceWhereInput = {
    providerId: q.providerId || undefined,
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: 'insensitive' } },
            { category: { name: { contains: q.search, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.service.findMany({
      where,
      orderBy: { id: 'asc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { category: { select: { name: true } }, provider: { select: { name: true, markupPercent: true } } },
    }),
    prisma.service.count({ where }),
  ]);
  res.json(paged(items, total, q.page, q.pageSize));
});

adminRouter.patch('/services/:id', async (req, res) => {
  const body = z
    .object({ isActive: z.boolean().optional(), customMarkupPercent: markup.nullable().optional() })
    .parse(req.body);
  const id = Number(req.params.id);
  const current = await prisma.service.findUnique({ where: { id }, include: { provider: true } });
  if (!current) throw new HttpError(404, 'Service not found');

  const data: Prisma.ServiceUpdateInput = { isActive: body.isActive };
  if (body.customMarkupPercent !== undefined) {
    const effective = body.customMarkupPercent ?? current.provider.markupPercent ?? (await getDefaultMarkup());
    data.customMarkupPercent = body.customMarkupPercent;
    data.rate = computeRate(current.providerRate, effective);
  }
  res.json(await prisma.service.update({ where: { id }, data }));
});

adminRouter.get('/settings', async (_req, res) => {
  res.json({ defaultMarkupPercent: await getDefaultMarkup() });
});

adminRouter.put('/settings', async (req, res) => {
  const body = z.object({ defaultMarkupPercent: markup }).parse(req.body);
  await setDefaultMarkup(body.defaultMarkupPercent);
  const repriced = await repriceAll();
  res.json({ defaultMarkupPercent: body.defaultMarkupPercent, repriced });
});

adminRouter.post('/sync-all', async (_req, res) => {
  await maintenanceQueue.add('service-sync', { kind: 'service-sync' }, { removeOnComplete: 50, removeOnFail: 100 });
  res.json({ queued: true });
});

// ---------- Orders ----------

adminRouter.get('/orders', async (req, res) => {
  const q = pageQuery
    .extend({
      status: z.nativeEnum(OrderStatus).optional(),
      review: z.enum(['1']).optional(),
      search: z.string().trim().optional(),
    })
    .parse(req.query);
  const idSearch = q.search && /^\d+$/.test(q.search) ? Number(q.search) : undefined;
  const where: Prisma.OrderWhereInput = {
    status: q.status,
    needsReview: q.review ? true : undefined,
    ...(q.search
      ? {
          OR: [
            ...(idSearch ? [{ id: idSearch }] : []),
            { link: { contains: q.search, mode: 'insensitive' as const } },
            { user: { email: { contains: q.search, mode: 'insensitive' as const } } },
            { providerOrderId: q.search },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        user: { select: { email: true } },
        service: { select: { name: true } },
        provider: { select: { name: true } },
      },
    }),
    prisma.order.count({ where }),
  ]);
  res.json(paged(items, total, q.page, q.pageSize));
});

// Cancel an open order and give the customer all their money back.
adminRouter.post('/orders/:id/refund', async (req, res) => {
  const done = await settleOrder(Number(req.params.id), 'CANCELED', { error: 'Canceled by admin' });
  if (!done) throw new HttpError(409, 'Order is already closed');
  res.json({ ok: true });
});

// Re-send an order that never got a provider order id. Only do this after
// checking on the provider's panel that the order was NOT created there.
adminRouter.post('/orders/:id/retry', async (req, res) => {
  const id = Number(req.params.id);
  const reset = await prisma.order.updateMany({
    where: { id, status: { in: ['PENDING', 'PROCESSING'] }, providerOrderId: null },
    data: { status: 'PENDING', needsReview: false, error: null },
  });
  if (reset.count === 0) throw new HttpError(409, 'Order cannot be retried');
  await enqueueDispatch(id, `-r${Date.now()}`);
  res.json({ ok: true });
});

// The order did reach the provider: attach its id so status sync takes over.
adminRouter.post('/orders/:id/attach', async (req, res) => {
  const body = z.object({ providerOrderId: z.string().trim().min(1).max(100) }).parse(req.body);
  const updated = await prisma.order.updateMany({
    where: { id: Number(req.params.id), status: { in: OPEN_STATUSES }, providerOrderId: null },
    data: { providerOrderId: body.providerOrderId, status: 'IN_PROGRESS', needsReview: false, error: null },
  });
  if (updated.count === 0) throw new HttpError(409, 'Order cannot be attached');
  res.json({ ok: true });
});

// ---------- Users ----------

adminRouter.get('/users', async (req, res) => {
  const q = pageQuery.extend({ search: z.string().trim().optional() }).parse(req.query);
  const where: Prisma.UserWhereInput = q.search
    ? {
        OR: [
          { email: { contains: q.search, mode: 'insensitive' } },
          { name: { contains: q.search, mode: 'insensitive' } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        balance: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
    }),
    prisma.user.count({ where }),
  ]);
  res.json(paged(items, total, q.page, q.pageSize));
});

adminRouter.patch('/users/:id', async (req, res) => {
  const body = z
    .object({ status: z.enum(['ACTIVE', 'BANNED']).optional(), role: z.enum(['USER', 'ADMIN']).optional() })
    .parse(req.body);
  if (req.params.id === req.user!.id) throw new HttpError(400, 'You cannot change your own account here');
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: body,
    select: { id: true, status: true, role: true },
  });
  res.json(user);
});

adminRouter.post('/users/:id/adjust', async (req, res) => {
  const body = z
    .object({
      amount: z.coerce.number().refine((n) => n !== 0 && Math.abs(n) <= 100000, 'must be non-zero'),
      note: z.string().trim().min(3).max(200),
    })
    .parse(req.body);
  const amount = new Decimal(body.amount).toDecimalPlaces(5);
  const userId = req.params.id;
  const balance = await prisma.$transaction(async (tx) => {
    // Guarded update: a debit can never push the balance below zero.
    const changed = await tx.user.updateMany({
      where: { id: userId, ...(amount.lt(0) ? { balance: { gte: amount.abs() } } : {}) },
      data: { balance: { increment: amount } },
    });
    if (changed.count === 0) throw new HttpError(400, 'User not found or balance too low');
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } });
    await tx.transaction.create({
      data: {
        userId,
        type: 'ADJUSTMENT',
        amount,
        balanceAfter: user.balance,
        note: body.note,
        reference: `admin:${req.user!.id}`,
      },
    });
    return user.balance;
  });
  res.json({ balance });
});

// ---------- Deposits ----------

adminRouter.get('/deposits', async (req, res) => {
  const q = pageQuery.extend({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional() }).parse(req.query);
  const where = { status: q.status };
  const [items, total] = await Promise.all([
    prisma.depositRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { user: { select: { email: true } } },
    }),
    prisma.depositRequest.count({ where }),
  ]);
  res.json(paged(items, total, q.page, q.pageSize));
});

adminRouter.post('/deposits/:id/approve', async (req, res) => {
  const id = req.params.id;
  await prisma.$transaction(async (tx) => {
    // Flip PENDING -> APPROVED first; a double click can only win once.
    const claimed = await tx.depositRequest.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'APPROVED', reviewedAt: new Date() },
    });
    if (claimed.count === 0) throw new HttpError(409, 'Deposit was already reviewed');
    const dep = await tx.depositRequest.findUniqueOrThrow({ where: { id } });
    const user = await tx.user.update({
      where: { id: dep.userId },
      data: { balance: { increment: dep.amount } },
      select: { balance: true },
    });
    await tx.transaction.create({
      data: {
        userId: dep.userId,
        type: 'DEPOSIT',
        amount: dep.amount,
        balanceAfter: user.balance,
        reference: `deposit:${dep.id}`,
        note: `${dep.method} deposit (${dep.reference})`,
      },
    });
  });
  res.json({ ok: true });
});

adminRouter.post('/deposits/:id/reject', async (req, res) => {
  const body = z.object({ note: z.string().trim().max(200).optional() }).parse(req.body ?? {});
  const claimed = await prisma.depositRequest.updateMany({
    where: { id: req.params.id, status: 'PENDING' },
    data: { status: 'REJECTED', reviewedAt: new Date(), adminNote: body.note },
  });
  if (claimed.count === 0) throw new HttpError(409, 'Deposit was already reviewed');
  res.json({ ok: true });
});

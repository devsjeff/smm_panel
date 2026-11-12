import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { OrderStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma, Decimal } from '../db';
import { HttpError, paged, pageQuery } from '../lib/http';
import { requireAuth } from '../middleware/auth';
import { placeOrder } from '../services/orders';

export const userRouter = Router();
userRouter.use(requireAuth);

// Never expose provider cost, provider ids or internal errors to customers.
const orderSelect = {
  id: true,
  link: true,
  quantity: true,
  charge: true,
  refundedAmount: true,
  status: true,
  startCount: true,
  remains: true,
  createdAt: true,
  service: { select: { id: true, name: true } },
} as const;

userRouter.get('/services', async (_req, res) => {
  const categories = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [{ sort: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      services: {
        where: { isActive: true, providerAvailable: true, provider: { isActive: true } },
        orderBy: { rate: 'asc' },
        select: { id: true, name: true, type: true, rate: true, min: true, max: true, refill: true, cancel: true },
      },
    },
  });
  res.json(categories.filter((c) => c.services.length > 0));
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user!.id,
  standardHeaders: true,
  legacyHeaders: false,
});

userRouter.post('/orders', orderLimiter, async (req, res) => {
  const body = z
    .object({
      serviceId: z.coerce.number().int().positive(),
      link: z.string().trim().url('must be a full URL starting with https://').max(500),
      quantity: z.coerce.number().int().positive(),
    })
    .parse(req.body);
  if (!/^https?:\/\//i.test(body.link)) throw new HttpError(400, 'link: must start with http(s)://');
  const order = await placeOrder(req.user!.id, body);
  res.status(201).json({ id: order.id, charge: order.charge, status: order.status });
});

userRouter.get('/orders', async (req, res) => {
  const q = pageQuery.extend({ status: z.nativeEnum(OrderStatus).optional() }).parse(req.query);
  const where = { userId: req.user!.id, status: q.status };
  const [items, total] = await Promise.all([
    prisma.order.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: orderSelect,
    }),
    prisma.order.count({ where }),
  ]);
  res.json(paged(items, total, q.page, q.pageSize));
});

userRouter.get('/dashboard', async (req, res) => {
  const userId = req.user!.id;
  const [user, byStatus, spent, recent] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } }),
    prisma.order.groupBy({ by: ['status'], where: { userId }, _count: true }),
    prisma.order.aggregate({ where: { userId }, _sum: { charge: true, refundedAmount: true } }),
    prisma.order.findMany({ where: { userId }, orderBy: { id: 'desc' }, take: 5, select: orderSelect }),
  ]);
  const counts = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
  const active = (counts.PENDING ?? 0) + (counts.PROCESSING ?? 0) + (counts.IN_PROGRESS ?? 0);
  res.json({
    balance: user.balance,
    totalOrders: byStatus.reduce((n, s) => n + s._count, 0),
    activeOrders: active,
    completedOrders: counts.COMPLETED ?? 0,
    totalSpent: new Decimal(spent._sum.charge ?? 0).sub(spent._sum.refundedAmount ?? 0),
    recent,
  });
});

userRouter.get('/wallet', async (req, res) => {
  const q = pageQuery.parse(req.query);
  const userId = req.user!.id;
  const [user, items, total, deposits] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } }),
    prisma.transaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: { id: true, type: true, amount: true, balanceAfter: true, note: true, orderId: true, createdAt: true },
    }),
    prisma.transaction.count({ where: { userId } }),
    prisma.depositRequest.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, amount: true, method: true, reference: true, status: true, adminNote: true, createdAt: true },
    }),
  ]);
  res.json({ balance: user.balance, transactions: paged(items, total, q.page, q.pageSize), deposits });
});

userRouter.post('/wallet/deposits', async (req, res) => {
  const body = z
    .object({
      amount: z.coerce.number().positive().max(100000),
      method: z.string().trim().min(1).max(50),
      reference: z.string().trim().min(3).max(200),
    })
    .parse(req.body);
  const pending = await prisma.depositRequest.count({ where: { userId: req.user!.id, status: 'PENDING' } });
  if (pending >= 3) throw new HttpError(429, 'You already have 3 deposits waiting for review');
  const dep = await prisma.depositRequest.create({ data: { userId: req.user!.id, ...body } });
  res.status(201).json({ id: dep.id });
});

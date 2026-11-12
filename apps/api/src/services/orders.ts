import { OrderStatus } from '@prisma/client';
import { prisma, Decimal } from '../db';
import { HttpError } from '../lib/http';
import { log } from '../lib/log';
import { enqueueDispatch } from '../queues';

export const OPEN_STATUSES: OrderStatus[] = ['PENDING', 'PROCESSING', 'IN_PROGRESS'];

/**
 * Charge the wallet and create the order in ONE database transaction.
 * The balance check and the debit are a single conditional UPDATE, so two
 * simultaneous orders can never both spend the same money.
 */
export async function placeOrder(userId: string, input: { serviceId: number; link: string; quantity: number }) {
  const service = await prisma.service.findUnique({
    where: { id: input.serviceId },
    include: { provider: { select: { isActive: true } }, category: { select: { isActive: true } } },
  });
  if (
    !service ||
    !service.isActive ||
    !service.providerAvailable ||
    !service.provider.isActive ||
    !service.category.isActive
  ) {
    throw new HttpError(404, 'Service is not available');
  }
  if (input.quantity < service.min || input.quantity > service.max) {
    throw new HttpError(400, `Quantity must be between ${service.min} and ${service.max}`);
  }

  const charge = service.rate.mul(input.quantity).div(1000).toDecimalPlaces(5, Decimal.ROUND_UP);
  const cost = service.providerRate.mul(input.quantity).div(1000).toDecimalPlaces(5, Decimal.ROUND_UP);
  if (charge.lte(0)) throw new HttpError(400, 'Service has no price set');

  const order = await prisma.$transaction(async (tx) => {
    const debited = await tx.user.updateMany({
      where: { id: userId, status: 'ACTIVE', balance: { gte: charge } },
      data: { balance: { decrement: charge } },
    });
    if (debited.count === 0) throw new HttpError(402, 'Insufficient balance');
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { balance: true } });

    const created = await tx.order.create({
      data: {
        userId,
        serviceId: service.id,
        providerId: service.providerId,
        link: input.link,
        quantity: input.quantity,
        charge,
        cost,
      },
    });
    await tx.transaction.create({
      data: {
        userId,
        type: 'ORDER',
        amount: charge.neg(),
        balanceAfter: user.balance,
        orderId: created.id,
        note: `Order #${created.id}`,
      },
    });
    return created;
  });

  // Enqueue only after commit. If Redis is down the order stays PENDING and the
  // worker's sweeper picks it up, so the customer is never charged for nothing.
  try {
    await enqueueDispatch(order.id);
  } catch (e) {
    log.warn({ orderId: order.id, err: e }, 'enqueue failed, sweeper will retry');
  }
  return order;
}

/**
 * Close an open order with a refund. Idempotent: the status flip is a guarded
 * UPDATE (only one caller wins) and Transaction has a unique (orderId, REFUND).
 */
export async function settleOrder(
  orderId: number,
  final: 'CANCELED' | 'FAILED' | 'PARTIAL',
  opts: { remains?: number; error?: string; providerStatus?: string } = {},
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } });
    if (!order) return false;

    let refund = order.charge;
    let remains = order.quantity;
    if (final === 'PARTIAL') {
      remains = Math.min(Math.max(opts.remains ?? 0, 0), order.quantity);
      refund = order.charge.mul(remains).div(order.quantity).toDecimalPlaces(5, Decimal.ROUND_DOWN);
    }

    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: { in: OPEN_STATUSES } },
      data: {
        status: final,
        remains,
        refundedAmount: refund,
        needsReview: false,
        error: opts.error?.slice(0, 300) ?? null,
        providerStatus: opts.providerStatus ?? order.providerStatus,
        lastSyncedAt: new Date(),
      },
    });
    if (claimed.count === 0) return false;

    if (refund.gt(0)) {
      const user = await tx.user.update({
        where: { id: order.userId },
        data: { balance: { increment: refund } },
        select: { balance: true },
      });
      await tx.transaction.create({
        data: {
          userId: order.userId,
          type: 'REFUND',
          amount: refund,
          balanceAfter: user.balance,
          orderId,
          note: `${final === 'PARTIAL' ? 'Partial refund' : 'Refund'} for order #${orderId}`,
        },
      });
    }
    return true;
  });
}

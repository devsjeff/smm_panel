import { Job, UnrecoverableError, Worker } from 'bullmq';
import { env } from './env';
import { prisma } from './db';
import { log } from './lib/log';
import {
  DISPATCH_QUEUE,
  MAINTENANCE_QUEUE,
  MaintenanceJob,
  enqueueDispatch,
  maintenanceQueue,
  redisConnection,
} from './queues';
import { refreshProviderBalance, syncProviderServices } from './services/catalog';
import { settleOrder } from './services/orders';
import { ProviderClient, ProviderError } from './services/providerClient';

// ---------- 1. Send orders to the provider ----------

async function dispatch(job: Job<{ orderId: number }>) {
  const { orderId } = job.data;

  // Claim the order. If another job already took it (duplicate enqueue, retry
  // racing the sweeper) this matches zero rows and we stop: no double order.
  const claimed = await prisma.order.updateMany({
    where: { id: orderId, status: 'PENDING', providerOrderId: null },
    data: { status: 'PROCESSING', attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return;

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { service: true, provider: true },
  });

  let providerOrderId: string;
  try {
    providerOrderId = await ProviderClient.from(order.provider).addOrder(
      order.service.providerServiceId,
      order.link,
      order.quantity,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);

    if (e instanceof ProviderError && e.kind === 'rejected') {
      await settleOrder(orderId, 'FAILED', { error: message });
      log.warn({ orderId, message }, 'provider rejected order, refunded');
      return;
    }
    if (e instanceof ProviderError && e.kind === 'unreachable') {
      const lastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      if (lastAttempt) {
        await settleOrder(orderId, 'FAILED', { error: 'Provider unreachable' });
        log.error({ orderId }, 'provider unreachable after retries, refunded');
        return;
      }
      await prisma.order.update({ where: { id: orderId }, data: { status: 'PENDING', error: message } });
      throw e; // BullMQ retries with exponential backoff
    }
    // Timeout or garbage response: the provider may or may not have created the
    // order. Retrying could buy it twice, refunding could give it away for free.
    await prisma.order.update({ where: { id: orderId }, data: { needsReview: true, error: message.slice(0, 300) } });
    log.error({ orderId, message }, 'dispatch outcome unknown, flagged for review');
    throw new UnrecoverableError(message);
  }

  try {
    await prisma.order.update({
      where: { id: orderId },
      data: { providerOrderId, status: 'IN_PROGRESS', providerStatus: 'Pending', error: null },
    });
  } catch (e) {
    // The provider has the order but we couldn't record it. Log the id loudly so
    // it can be attached by hand; the sweeper will flag the order for review.
    log.fatal({ orderId, providerOrderId, err: e }, 'order placed at provider but DB update failed');
    throw new UnrecoverableError('DB update failed after provider accepted order');
  }
}

// ---------- 2. Poll provider for order status ----------

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
};

async function syncOrders() {
  const providers = await prisma.provider.findMany({ where: { orders: { some: { status: 'IN_PROGRESS' } } } });

  for (const provider of providers) {
    const open = await prisma.order.findMany({
      where: { providerId: provider.id, status: 'IN_PROGRESS', providerOrderId: { not: null } },
      orderBy: { lastSyncedAt: { sort: 'asc', nulls: 'first' } },
      take: 2000,
      select: { id: true, providerOrderId: true },
    });
    const client = ProviderClient.from(provider);

    for (let i = 0; i < open.length; i += 100) {
      const chunk = open.slice(i, i + 100);
      let result;
      try {
        result = await client.statuses(chunk.map((o) => o.providerOrderId!));
      } catch (e) {
        log.warn({ provider: provider.name, err: (e as Error).message }, 'status sync failed, will retry next cycle');
        break;
      }

      for (const order of chunk) {
        const s = result[order.providerOrderId!];
        if (!s || s.error || !s.status) {
          await prisma.order.update({
            where: { id: order.id },
            data: { lastSyncedAt: new Date(), error: s?.error ? `Status: ${String(s.error).slice(0, 200)}` : undefined },
          });
          continue;
        }
        const status = s.status.trim().toLowerCase();
        const remains = num(s.remains);

        if (status === 'completed') {
          await prisma.order.updateMany({
            where: { id: order.id, status: 'IN_PROGRESS' },
            data: {
              status: 'COMPLETED',
              providerStatus: s.status,
              remains: 0,
              startCount: num(s.start_count),
              lastSyncedAt: new Date(),
              error: null,
            },
          });
        } else if (status === 'partial') {
          await settleOrder(order.id, 'PARTIAL', { remains, providerStatus: s.status });
        } else if (status === 'canceled' || status === 'cancelled' || status === 'refunded') {
          await settleOrder(order.id, 'CANCELED', { providerStatus: s.status });
        } else {
          await prisma.order.updateMany({
            where: { id: order.id, status: 'IN_PROGRESS' },
            data: { providerStatus: s.status, remains, startCount: num(s.start_count), lastSyncedAt: new Date() },
          });
        }
      }
    }
  }
}

// ---------- 3. Sweeper: nothing stays stuck silently ----------

async function sweep() {
  const now = Date.now();

  // Charged but never dispatched (Redis was down at order time, job lost...).
  const stale = await prisma.order.findMany({
    where: { status: 'PENDING', providerOrderId: null, updatedAt: { lt: new Date(now - 3 * 60 * 1000) } },
    select: { id: true },
    take: 500,
  });
  for (const o of stale) await enqueueDispatch(o.id, `-s${now}`);
  if (stale.length) log.warn({ count: stale.length }, 're-enqueued stale pending orders');

  // Worker died mid-dispatch: outcome unknown, a human has to look.
  const stuck = await prisma.order.updateMany({
    where: {
      status: 'PROCESSING',
      providerOrderId: null,
      needsReview: false,
      updatedAt: { lt: new Date(now - 10 * 60 * 1000) },
    },
    data: { needsReview: true, error: 'Dispatch interrupted: check the provider panel' },
  });
  if (stuck.count) log.error({ count: stuck.count }, 'orders stuck in PROCESSING flagged for review');
}

async function maintenance(job: Job<MaintenanceJob>) {
  switch (job.data.kind) {
    case 'order-sync':
      await syncOrders();
      await sweep();
      return;
    case 'service-sync': {
      const providers = await prisma.provider.findMany({
        where: { isActive: true, id: job.data.providerId },
        select: { id: true, name: true },
      });
      for (const p of providers) {
        await syncProviderServices(p.id).catch((e) => log.error({ provider: p.name, err: e.message }, 'service sync failed'));
      }
      return;
    }
    case 'balance-check': {
      const providers = await prisma.provider.findMany({ where: { isActive: true }, select: { id: true, name: true } });
      for (const p of providers) {
        await refreshProviderBalance(p.id).catch((e) => log.warn({ provider: p.name, err: e.message }, 'balance check failed'));
      }
      return;
    }
  }
}

// ---------- Boot ----------

async function main() {
  const dispatchWorker = new Worker(DISPATCH_QUEUE, dispatch, {
    connection: redisConnection(),
    concurrency: env.DISPATCH_CONCURRENCY,
  });
  const maintenanceWorker = new Worker(MAINTENANCE_QUEUE, maintenance, {
    connection: redisConnection(),
    concurrency: 1,
  });
  for (const w of [dispatchWorker, maintenanceWorker]) {
    w.on('failed', (job, err) => log.warn({ queue: w.name, jobId: job?.id, err: err.message }, 'job failed'));
    w.on('error', (err) => log.error({ queue: w.name, err: err.message }, 'worker error'));
  }

  await maintenanceQueue.waitUntilReady();
  const keep = { removeOnComplete: 20, removeOnFail: 100 };
  await maintenanceQueue.upsertJobScheduler(
    'order-sync',
    { every: env.ORDER_SYNC_INTERVAL_SECONDS * 1000 },
    { name: 'order-sync', data: { kind: 'order-sync' }, opts: keep },
  );
  await maintenanceQueue.upsertJobScheduler(
    'service-sync',
    { every: env.SERVICE_SYNC_INTERVAL_MINUTES * 60 * 1000 },
    { name: 'service-sync', data: { kind: 'service-sync' }, opts: keep },
  );
  await maintenanceQueue.upsertJobScheduler(
    'balance-check',
    { every: 10 * 60 * 1000 },
    { name: 'balance-check', data: { kind: 'balance-check' }, opts: keep },
  );
  log.info(`worker started (order sync every ${env.ORDER_SYNC_INTERVAL_SECONDS}s)`);

  const shutdown = async () => {
    // Lets in-flight provider calls finish so no order is left half-dispatched.
    await Promise.all([dispatchWorker.close(), maintenanceWorker.close()]);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((e) => {
  log.fatal(e, 'worker failed to start');
  process.exit(1);
});

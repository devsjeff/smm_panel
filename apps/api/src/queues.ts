import { Queue } from 'bullmq';
import { env } from './env';

/**
 * failFast = API side: if Redis is down, queue.add() throws immediately instead of
 * hanging the HTTP request. The worker's sweeper re-enqueues anything that was missed.
 */
export function redisConnection(failFast = false) {
  const u = new URL(env.REDIS_URL);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    tls: u.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
    enableOfflineQueue: !failFast,
  };
}

export const DISPATCH_QUEUE = 'order-dispatch';
export const MAINTENANCE_QUEUE = 'maintenance';

export type MaintenanceJob =
  | { kind: 'order-sync' }
  | { kind: 'service-sync'; providerId?: string }
  | { kind: 'balance-check' };

export const dispatchQueue = new Queue<{ orderId: number }>(DISPATCH_QUEUE, {
  connection: redisConnection(true),
});
export const maintenanceQueue = new Queue<MaintenanceJob>(MAINTENANCE_QUEUE, {
  connection: redisConnection(true),
});
// Without a listener, ioredis connection errors crash the process.
dispatchQueue.on('error', () => {});
maintenanceQueue.on('error', () => {});

export async function enqueueDispatch(orderId: number, suffix = '') {
  await dispatchQueue.add(
    'dispatch',
    { orderId },
    {
      jobId: `order-${orderId}${suffix}`,
      attempts: 5,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  );
}

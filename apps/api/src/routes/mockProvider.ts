import express, { Router } from 'express';

/**
 * Fake SMM API v2 provider for local testing (ENABLE_MOCK_PROVIDER=true).
 * Orders go Pending -> In progress -> Completed over ~90 seconds.
 * Put "partial" or "cancel" in the order link to test refunds, "reject" to test a failed order.
 */
export const mockProviderRouter = Router();

const services = [
  { service: 1, name: 'Followers - Standard', category: 'Mock Network A', rate: '0.90', min: 100, max: 50000 },
  { service: 2, name: 'Followers - Premium (refill)', category: 'Mock Network A', rate: '2.40', min: 50, max: 20000, refill: true },
  { service: 3, name: 'Likes - Fast', category: 'Mock Network A', rate: '0.35', min: 50, max: 100000 },
  { service: 4, name: 'Views - Instant', category: 'Mock Network B', rate: '0.08', min: 500, max: 1000000 },
  { service: 5, name: 'Subscribers - Slow', category: 'Mock Network B', rate: '6.50', min: 100, max: 5000, cancel: true },
  { service: 6, name: 'Comments - Random', category: 'Mock Network B', rate: '12.00', min: 10, max: 1000 },
].map((s) => ({ type: 'Default', refill: false, cancel: false, ...s }));

const orders = new Map<string, { link: string; quantity: number; createdAt: number }>();
let nextId = 1000;

function statusOf(o: { link: string; quantity: number; createdAt: number }) {
  const age = (Date.now() - o.createdAt) / 1000;
  const base = { charge: '0.00', start_count: '120', currency: 'USD' };
  if (age < 30) return { ...base, status: 'Pending', remains: String(o.quantity) };
  if (age < 90) return { ...base, status: 'In progress', remains: String(Math.floor(o.quantity / 2)) };
  if (o.link.includes('partial')) return { ...base, status: 'Partial', remains: String(Math.floor(o.quantity / 4)) };
  if (o.link.includes('cancel')) return { ...base, status: 'Canceled', remains: String(o.quantity) };
  return { ...base, status: 'Completed', remains: '0' };
}

mockProviderRouter.post('/', express.urlencoded({ extended: false }), (req, res) => {
  const { key, action, service, link, quantity, order, orders: ids } = req.body ?? {};
  if (!key) return void res.json({ error: 'Invalid API key' });

  switch (action) {
    case 'services':
      return void res.json(services);
    case 'balance':
      return void res.json({ balance: '250.00', currency: 'USD' });
    case 'add': {
      const svc = services.find((s) => String(s.service) === String(service));
      const qty = Number(quantity);
      if (!svc) return void res.json({ error: 'Incorrect service ID' });
      if (!link || !(qty >= svc.min && qty <= svc.max)) return void res.json({ error: 'Incorrect quantity or link' });
      if (String(link).includes('reject')) return void res.json({ error: 'Link is not supported' });
      const id = String(nextId++);
      orders.set(id, { link: String(link), quantity: qty, createdAt: Date.now() });
      return void res.json({ order: Number(id) });
    }
    case 'status': {
      if (ids) {
        const out: Record<string, unknown> = {};
        for (const id of String(ids).split(',')) {
          const o = orders.get(id);
          out[id] = o ? statusOf(o) : { error: 'Incorrect order ID' };
        }
        return void res.json(out);
      }
      const o = orders.get(String(order));
      return void res.json(o ? statusOf(o) : { error: 'Incorrect order ID' });
    }
    default:
      return void res.json({ error: 'Incorrect request' });
  }
});

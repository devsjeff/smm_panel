'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Card, Field, Notice, PageHeader } from '@/components/ui';
import { api, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Category } from '@/lib/types';

export default function NewOrderPage() {
  const { user, money, refresh } = useSession();
  const { data: categories, error: loadError, loading } = useApi<Category[]>('/services');

  const [categoryId, setCategoryId] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [link, setLink] = useState('');
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<number | null>(null);

  // Preselect from /new-order?service=ID (link on the services page), else the first service.
  useEffect(() => {
    if (!categories?.length || serviceId) return;
    const wanted = new URLSearchParams(window.location.search).get('service');
    const cat = categories.find((c) => c.services.some((s) => String(s.id) === wanted)) ?? categories[0];
    const svc = cat.services.find((s) => String(s.id) === wanted) ?? cat.services[0];
    setCategoryId(cat.id);
    setServiceId(String(svc.id));
  }, [categories, serviceId]);

  const category = categories?.find((c) => c.id === categoryId);
  const service = category?.services.find((s) => String(s.id) === serviceId);
  const qty = Number(quantity);
  const qtyValid = !!service && Number.isInteger(qty) && qty >= service.min && qty <= service.max;
  // Estimate only: the server computes the real charge.
  const charge = useMemo(() => (service && qty > 0 ? (Number(service.rate) * qty) / 1000 : 0), [service, qty]);
  const short = charge > Number(user.balance);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!service) return;
    setBusy(true);
    setError(null);
    setPlaced(null);
    try {
      const res = await api<{ id: number }>('/orders', { body: { serviceId: service.id, link, quantity: qty } });
      setPlaced(res.id);
      setLink('');
      setQuantity('');
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="New order" sub="Pick a service, paste the link, choose a quantity" />

      {loadError && <Notice>{loadError}</Notice>}
      {loading && !categories && <p className="text-sm text-muted">Loading...</p>}
      {categories?.length === 0 && <Notice tone="amber">No services are available yet. Please check back soon.</Notice>}

      {categories && categories.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card>
            <form onSubmit={submit} className="space-y-4 p-5">
              {placed && (
                <Notice tone="green">
                  Order #{placed} placed.{' '}
                  <Link href="/orders" className="font-medium underline">
                    Track it
                  </Link>
                </Notice>
              )}
              {error && <Notice>{error}</Notice>}

              <Field label="Category">
                <select
                  className="input"
                  value={categoryId}
                  onChange={(e) => {
                    const cat = categories.find((c) => c.id === e.target.value)!;
                    setCategoryId(cat.id);
                    setServiceId(String(cat.services[0].id));
                  }}
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Service">
                <select className="input" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
                  {category?.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} - {s.name} - {money(s.rate)} per 1,000
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Link">
                <input
                  className="input"
                  type="url"
                  placeholder="https://"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  required
                  maxLength={500}
                />
              </Field>

              <Field
                label="Quantity"
                hint={service ? `Min ${service.min.toLocaleString()} - Max ${service.max.toLocaleString()}` : undefined}
              >
                <input
                  className="input num"
                  type="number"
                  inputMode="numeric"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min={service?.min}
                  max={service?.max}
                  step={1}
                  required
                />
              </Field>

              <button className="btn btn-primary w-full" disabled={busy || !qtyValid || short}>
                {busy ? 'Placing order...' : `Place order${charge > 0 ? ` - ${money(charge)}` : ''}`}
              </button>
            </form>
          </Card>

          <Card title="Summary" className="h-fit">
            <dl className="space-y-3 p-4 text-sm">
              <Row label="Rate per 1,000" value={service ? money(service.rate) : '-'} />
              <Row label="Quantity" value={qty > 0 ? qty.toLocaleString() : '-'} />
              <Row label="Charge" value={charge > 0 ? money(charge) : '-'} strong />
              <div className="border-t border-line pt-3">
                <Row label="Your balance" value={money(user.balance)} />
              </div>
              {short && (
                <Notice tone="amber">
                  Not enough balance.{' '}
                  <Link href="/wallet" className="font-medium underline">
                    Add funds
                  </Link>
                </Notice>
              )}
              {service && (service.refill || service.cancel) && (
                <p className="text-xs text-muted">
                  {[service.refill && 'Refill available', service.cancel && 'Can be canceled'].filter(Boolean).join(' - ')}
                </p>
              )}
            </dl>
          </Card>
        </div>
      )}
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className={`num ${strong ? 'text-base font-semibold' : ''}`}>{value}</dd>
    </div>
  );
}

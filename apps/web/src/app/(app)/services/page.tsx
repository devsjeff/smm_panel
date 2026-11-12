'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Badge, Card, Notice, PageHeader } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Category } from '@/lib/types';

export default function ServicesPage() {
  const { money } = useSession();
  const { data, error, loading } = useApi<Category[]>('/services');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? [])
      .filter((c) => !categoryId || c.id === categoryId)
      .map((c) => ({ ...c, services: c.services.filter((s) => !q || s.name.toLowerCase().includes(q) || String(s.id) === q) }))
      .filter((c) => c.services.length > 0);
  }, [data, search, categoryId]);

  return (
    <>
      <PageHeader title="Services" sub="Prices are per 1,000">
        <select className="input w-auto max-w-56" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">All categories</option>
          {data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input className="input w-56" placeholder="Search by name or ID" value={search} onChange={(e) => setSearch(e.target.value)} />
      </PageHeader>

      {error && <Notice>{error}</Notice>}
      {loading && !data && <p className="text-sm text-muted">Loading...</p>}
      {data && visible.length === 0 && (
        <p className="text-sm text-muted">{data.length === 0 ? 'No services are available yet.' : 'Nothing matches your search.'}</p>
      )}

      <div className="space-y-5">
        {visible.map((c) => (
          <Card key={c.id} title={c.name}>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    <th className="th w-16">ID</th>
                    <th className="th">Service</th>
                    <th className="th text-right">Rate / 1,000</th>
                    <th className="th text-right">Min</th>
                    <th className="th text-right">Max</th>
                    <th className="th" />
                  </tr>
                </thead>
                <tbody>
                  {c.services.map((s) => (
                    <tr key={s.id}>
                      <td className="td num text-muted">{s.id}</td>
                      <td className="td">
                        {s.name}{' '}
                        {s.refill && <Badge tone="green">Refill</Badge>} {s.cancel && <Badge tone="blue">Cancel</Badge>}
                      </td>
                      <td className="td num text-right font-medium">{money(s.rate)}</td>
                      <td className="td num text-right text-muted">{s.min.toLocaleString()}</td>
                      <td className="td num text-right text-muted">{s.max.toLocaleString()}</td>
                      <td className="td text-right">
                        <Link href={`/new-order?service=${s.id}`} className="btn btn-sm">
                          Order
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

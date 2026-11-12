'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { Badge, Card, Notice, PageHeader, Pager, TableState } from '@/components/ui';
import { api, qs, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { AdminService, Paged } from '@/lib/types';

export default function AdminServicesPage() {
  const { money } = useSession();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<AdminService>>(`/admin/services${qs({ search: query, page })}`);
  const settings = useApi<{ defaultMarkupPercent: number }>('/admin/settings');

  const [markup, setMarkup] = useState('');
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (settings.data) setMarkup(String(settings.data.defaultMarkupPercent));
  }, [settings.data]);

  async function act(fn: () => Promise<string | void>) {
    setBusy(true);
    setMessage(null);
    try {
      const text = await fn();
      if (text) setMessage({ tone: 'green', text });
      reload();
    } catch (err) {
      setMessage({ tone: 'red', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function saveDefault(e: FormEvent) {
    e.preventDefault();
    act(async () => {
      const r = await api<{ repriced: number }>('/admin/settings', { method: 'PUT', body: { defaultMarkupPercent: Number(markup) } });
      return `Default markup saved. ${r.repriced} services repriced.`;
    });
  }

  function editMarkup(s: AdminService) {
    const input = window.prompt(
      `Markup % for "${s.name}"\nLeave empty to use the provider/default markup.`,
      s.customMarkupPercent ?? '',
    );
    if (input === null) return;
    const value = input.trim() === '' ? null : Number(input);
    if (value !== null && !(value >= 0)) return setMessage({ tone: 'red', text: 'Markup must be a number of 0 or more.' });
    act(() => api(`/admin/services/${s.id}`, { method: 'PATCH', body: { customMarkupPercent: value } }).then(() => undefined));
  }

  return (
    <>
      <PageHeader title="Services & pricing" sub="Your price = provider rate + markup. Service markup beats provider markup beats default.">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
            setPage(1);
          }}
        >
          <input className="input w-56" placeholder="Search name or category" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn">Search</button>
        </form>
      </PageHeader>

      <Card className="mb-5">
        <form onSubmit={saveDefault} className="flex flex-wrap items-end gap-3 p-4">
          <label className="block">
            <span className="label">Default markup %</span>
            <input className="input num w-32" type="number" min="0" step="0.01" value={markup} onChange={(e) => setMarkup(e.target.value)} required />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            Save and reprice
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => act(async () => {
              await api('/admin/sync-all', { method: 'POST' });
              return 'Sync queued for all active providers. Refresh in a minute.';
            })}
          >
            Sync all providers
          </button>
        </form>
      </Card>

      {message && (
        <div className="mb-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      <Card>
        <TableState loading={loading} error={error} empty={!data?.items.length} emptyText="No services. Add a provider and sync it.">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">ID</th>
                <th className="th">Service</th>
                <th className="th">Provider</th>
                <th className="th text-right">Cost</th>
                <th className="th text-right">Markup</th>
                <th className="th text-right">Price</th>
                <th className="th">Status</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((s) => (
                <tr key={s.id}>
                  <td className="td num text-muted">{s.id}</td>
                  <td className="td max-w-80">
                    <div className="truncate" title={s.name}>{s.name}</div>
                    <div className="truncate text-xs text-muted">{s.category.name}</div>
                  </td>
                  <td className="td whitespace-nowrap text-muted">
                    {s.provider.name} #{s.providerServiceId}
                  </td>
                  <td className="td num text-right text-muted">{money(s.providerRate)}</td>
                  <td className="td num text-right">
                    <button className="cursor-pointer underline decoration-dotted" onClick={() => editMarkup(s)} title="Change markup">
                      {s.customMarkupPercent !== null
                        ? `${Number(s.customMarkupPercent)}%`
                        : s.provider.markupPercent !== null
                          ? `${Number(s.provider.markupPercent)}% (provider)`
                          : 'default'}
                    </button>
                  </td>
                  <td className="td num text-right font-medium">{money(s.rate)}</td>
                  <td className="td">
                    {!s.providerAvailable ? (
                      <Badge tone="red">Removed by provider</Badge>
                    ) : s.isActive ? (
                      <Badge tone="green">On sale</Badge>
                    ) : (
                      <Badge>Hidden</Badge>
                    )}
                  </td>
                  <td className="td text-right">
                    <button
                      className="btn btn-sm"
                      disabled={busy}
                      onClick={() => act(() => api(`/admin/services/${s.id}`, { method: 'PATCH', body: { isActive: !s.isActive } }).then(() => undefined))}
                    >
                      {s.isActive ? 'Hide' : 'Show'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableState>
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </Card>
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { Badge, Card, fmtDate, Notice, ORDER_STATUSES, orderStatusLabel, PageHeader, Pager, StatusBadge, TableState } from '@/components/ui';
import { api, qs, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { AdminOrder, Paged } from '@/lib/types';

const OPEN = ['PENDING', 'PROCESSING', 'IN_PROGRESS'];

export default function AdminOrdersPage() {
  const { money } = useSession();
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('');
  const [review, setReview] = useState(false);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Filters can arrive from links on the overview page.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    setStatus(sp.get('status') ?? '');
    setReview(sp.get('review') === '1');
    setReady(true);
  }, []);

  const { data, error, loading, reload } = useApi<Paged<AdminOrder>>(
    ready ? `/admin/orders${qs({ status, review: review ? 1 : undefined, search: query, page })}` : null,
  );

  async function act(path: string, body: unknown, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await api(path, { method: 'POST', body });
      setMessage({ tone: 'green', text: done });
      reload();
    } catch (err) {
      setMessage({ tone: 'red', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function refund(o: AdminOrder) {
    if (!window.confirm(`Cancel order #${o.id} and refund ${money(o.charge)} to ${o.user.email}?\n\nThis does not cancel it at the provider.`)) return;
    act(`/admin/orders/${o.id}/refund`, {}, `Order #${o.id} canceled and refunded.`);
  }
  function retry(o: AdminOrder) {
    if (!window.confirm(`Send order #${o.id} to the provider again?\n\nOnly do this if you checked the provider panel and the order is NOT there, otherwise it is bought twice.`)) return;
    act(`/admin/orders/${o.id}/retry`, {}, `Order #${o.id} queued again.`);
  }
  function attach(o: AdminOrder) {
    const id = window.prompt(`Provider order ID for order #${o.id} (from the provider panel):`);
    if (!id?.trim()) return;
    act(`/admin/orders/${o.id}/attach`, { providerOrderId: id.trim() }, `Order #${o.id} linked to provider order ${id.trim()}.`);
  }

  return (
    <>
      <PageHeader title="All orders">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={review}
            onChange={(e) => {
              setReview(e.target.checked);
              setPage(1);
            }}
          />
          Needs review
        </label>
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {orderStatusLabel(s)}
            </option>
          ))}
        </select>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
            setPage(1);
          }}
        >
          <input className="input w-52" placeholder="ID, email or link" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn">Search</button>
        </form>
      </PageHeader>

      {message && (
        <div className="mb-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      <Card>
        <TableState loading={loading || !ready} error={error} empty={!data?.items.length} emptyText="No orders match.">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">ID</th>
                <th className="th">Customer</th>
                <th className="th">Service / link</th>
                <th className="th text-right">Qty</th>
                <th className="th text-right">Charge / cost</th>
                <th className="th">Provider</th>
                <th className="th">Status</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((o) => {
                const open = OPEN.includes(o.status);
                const undispatched = open && !o.providerOrderId && (o.needsReview || o.status === 'PROCESSING');
                return (
                  <tr key={o.id}>
                    <td className="td num text-muted">
                      #{o.id}
                      <div className="text-xs whitespace-nowrap">{fmtDate(o.createdAt)}</div>
                    </td>
                    <td className="td max-w-44 truncate" title={o.user.email}>
                      {o.user.email}
                    </td>
                    <td className="td max-w-64">
                      <div className="truncate" title={o.service.name}>{o.service.name}</div>
                      <div className="truncate text-xs text-muted" title={o.link}>{o.link}</div>
                    </td>
                    <td className="td num text-right">
                      {o.quantity.toLocaleString()}
                      {o.remains !== null && <div className="text-xs text-muted">{o.remains} left</div>}
                    </td>
                    <td className="td num text-right">
                      {money(o.charge)}
                      <div className="text-xs text-muted">{money(o.cost)}</div>
                      {Number(o.refundedAmount) > 0 && <div className="text-xs text-emerald-700">-{money(o.refundedAmount)}</div>}
                    </td>
                    <td className="td whitespace-nowrap text-muted">
                      {o.provider.name}
                      <div className="num text-xs">{o.providerOrderId ? `#${o.providerOrderId}` : 'not sent'}</div>
                    </td>
                    <td className="td max-w-52">
                      <StatusBadge status={o.status} /> {o.needsReview && <Badge tone="amber">Review</Badge>}
                      {o.error && <div className="mt-1 text-xs break-words text-red-700">{o.error}</div>}
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-1.5">
                        {undispatched && (
                          <>
                            <button className="btn btn-sm" disabled={busy} onClick={() => retry(o)}>
                              Resend
                            </button>
                            <button className="btn btn-sm" disabled={busy} onClick={() => attach(o)}>
                              Link ID
                            </button>
                          </>
                        )}
                        {open && (
                          <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => refund(o)}>
                            Refund
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableState>
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </Card>
    </>
  );
}

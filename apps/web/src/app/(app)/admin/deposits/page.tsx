'use client';

import { useState } from 'react';
import { Badge, Card, fmtDate, Notice, PageHeader, Pager, TableState } from '@/components/ui';
import { api, qs, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { AdminDeposit, Paged } from '@/lib/types';

const tone = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' } as const;

export default function AdminDepositsPage() {
  const { money } = useSession();
  const [status, setStatus] = useState('PENDING');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<AdminDeposit>>(`/admin/deposits${qs({ status, page })}`);
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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

  function approve(d: AdminDeposit) {
    if (!window.confirm(`Credit ${money(d.amount)} to ${d.user.email}?\n\nOnly approve after you see the payment (${d.method}, ref ${d.reference}) in your own account.`)) return;
    act(`/admin/deposits/${d.id}/approve`, {}, `${money(d.amount)} credited to ${d.user.email}.`);
  }
  function reject(d: AdminDeposit) {
    const note = window.prompt(`Reject deposit from ${d.user.email}?\nReason (shown to the customer, optional):`);
    if (note === null) return;
    act(`/admin/deposits/${d.id}/reject`, { note: note.trim() || undefined }, 'Deposit rejected.');
  }

  return (
    <>
      <PageHeader title="Deposits" sub="Check each payment in your own account before approving">
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="PENDING">Waiting for review</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
          <option value="">All</option>
        </select>
      </PageHeader>

      {message && (
        <div className="mb-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      <Card>
        <TableState loading={loading} error={error} empty={!data?.items.length} emptyText="Nothing here.">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Requested</th>
                <th className="th">Customer</th>
                <th className="th text-right">Amount</th>
                <th className="th">Method</th>
                <th className="th">Reference</th>
                <th className="th">Status</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((d) => (
                <tr key={d.id}>
                  <td className="td whitespace-nowrap text-muted">{fmtDate(d.createdAt)}</td>
                  <td className="td max-w-52 truncate" title={d.user.email}>
                    {d.user.email}
                  </td>
                  <td className="td num text-right font-medium">{money(d.amount)}</td>
                  <td className="td">{d.method}</td>
                  <td className="td max-w-56 break-all">{d.reference}</td>
                  <td className="td">
                    <Badge tone={tone[d.status]}>{d.status.toLowerCase()}</Badge>
                    {d.adminNote && <div className="mt-1 text-xs text-muted">{d.adminNote}</div>}
                  </td>
                  <td className="td">
                    {d.status === 'PENDING' && (
                      <div className="flex justify-end gap-1.5">
                        <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => approve(d)}>
                          Approve
                        </button>
                        <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => reject(d)}>
                          Reject
                        </button>
                      </div>
                    )}
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

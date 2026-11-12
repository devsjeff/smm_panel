'use client';

import { useState } from 'react';
import { Badge, Card, fmtDate, Notice, PageHeader, Pager, TableState } from '@/components/ui';
import { api, qs, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { AdminUser, Paged } from '@/lib/types';

export default function AdminUsersPage() {
  const { user: me, money } = useSession();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<AdminUser>>(`/admin/users${qs({ search: query, page })}`);
  const [message, setMessage] = useState<{ tone: 'green' | 'red'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setMessage(null);
    try {
      await fn();
      setMessage({ tone: 'green', text: done });
      reload();
    } catch (err) {
      setMessage({ tone: 'red', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  function adjust(u: AdminUser) {
    const raw = window.prompt(`Adjust balance for ${u.email}\nCurrent: ${money(u.balance)}\n\nAmount to add (use a minus sign to remove):`);
    if (raw === null) return;
    const amount = Number(raw);
    if (!amount) return setMessage({ tone: 'red', text: 'Enter a non-zero number.' });
    const note = window.prompt('Reason (shown in the customer transaction history):');
    if (!note?.trim()) return;
    act(() => api(`/admin/users/${u.id}/adjust`, { body: { amount, note: note.trim() } }), `Balance of ${u.email} adjusted by ${money(amount)}.`);
  }

  function toggleBan(u: AdminUser) {
    const ban = u.status === 'ACTIVE';
    if (ban && !window.confirm(`Suspend ${u.email}? They will be signed out and cannot order.`)) return;
    act(
      () => api(`/admin/users/${u.id}`, { method: 'PATCH', body: { status: ban ? 'BANNED' : 'ACTIVE' } }),
      `${u.email} ${ban ? 'suspended' : 'reactivated'}.`,
    );
  }

  return (
    <>
      <PageHeader title="Users">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search);
            setPage(1);
          }}
        >
          <input className="input w-56" placeholder="Search email or name" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn">Search</button>
        </form>
      </PageHeader>

      {message && (
        <div className="mb-4">
          <Notice tone={message.tone}>{message.text}</Notice>
        </div>
      )}

      <Card>
        <TableState loading={loading} error={error} empty={!data?.items.length} emptyText="No users found.">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">User</th>
                <th className="th">Role</th>
                <th className="th text-right">Balance</th>
                <th className="th text-right">Orders</th>
                <th className="th">Joined</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody>
              {data?.items.map((u) => (
                <tr key={u.id}>
                  <td className="td max-w-64">
                    <div className="truncate font-medium">{u.name}</div>
                    <div className="truncate text-xs text-muted">{u.email}</div>
                  </td>
                  <td className="td">
                    <Badge tone={u.role === 'ADMIN' ? 'blue' : 'gray'}>{u.role === 'ADMIN' ? 'Admin' : 'Customer'}</Badge>{' '}
                    {u.status === 'BANNED' && <Badge tone="red">Suspended</Badge>}
                  </td>
                  <td className="td num text-right font-medium">{money(u.balance)}</td>
                  <td className="td num text-right text-muted">{u._count.orders.toLocaleString()}</td>
                  <td className="td whitespace-nowrap text-muted">{fmtDate(u.createdAt)}</td>
                  <td className="td">
                    <div className="flex justify-end gap-1.5">
                      <button className="btn btn-sm" disabled={busy} onClick={() => adjust(u)}>
                        Adjust balance
                      </button>
                      {u.id !== me.id && (
                        <button className="btn btn-sm btn-danger" disabled={busy} onClick={() => toggleBan(u)}>
                          {u.status === 'ACTIVE' ? 'Suspend' : 'Reactivate'}
                        </button>
                      )}
                    </div>
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

'use client';

import { useState, type FormEvent } from 'react';
import { Badge, Card, Field, fmtDate, Notice, PageHeader, Pager, Stat, TableState } from '@/components/ui';
import { api, qs, useApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Wallet } from '@/lib/types';

const depositTone = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'red' } as const;
const txLabel = { DEPOSIT: 'Deposit', ORDER: 'Order', REFUND: 'Refund', ADJUSTMENT: 'Adjustment' };

export default function WalletPage() {
  const { money } = useSession();
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Wallet>(`/wallet${qs({ page })}`);

  const [form, setForm] = useState({ amount: '', method: 'Bank transfer', reference: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFormError(null);
    setSent(false);
    try {
      await api('/wallet/deposits', { body: form });
      setSent(true);
      setForm({ ...form, amount: '', reference: '' });
      reload();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Wallet" sub="Add funds and see every movement on your balance" />

      <div className="grid gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
        <div className="space-y-5">
          <Stat label="Balance" value={money(data?.balance)} />

          <Card title="Add funds">
            <form onSubmit={submit} className="space-y-4 p-4">
              <p className="text-xs text-muted">
                Send your payment, then submit the details here. Your balance is credited once the payment is confirmed.
              </p>
              {sent && <Notice tone="green">Request sent. It will be reviewed shortly.</Notice>}
              {formError && <Notice>{formError}</Notice>}
              <Field label="Amount">
                <input
                  className="input num"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                />
              </Field>
              <Field label="Payment method">
                <input
                  className="input"
                  value={form.method}
                  onChange={(e) => setForm({ ...form, method: e.target.value })}
                  required
                  maxLength={50}
                />
              </Field>
              <Field label="Transaction reference" hint="The ID or reference from your payment">
                <input
                  className="input"
                  value={form.reference}
                  onChange={(e) => setForm({ ...form, reference: e.target.value })}
                  required
                  minLength={3}
                  maxLength={200}
                />
              </Field>
              <button className="btn btn-primary w-full" disabled={busy}>
                {busy ? 'Sending...' : 'Submit deposit'}
              </button>
            </form>
          </Card>

          {!!data?.deposits.length && (
            <Card title="Deposit requests">
              <ul>
                {data.deposits.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3 text-sm last:border-0">
                    <div className="min-w-0">
                      <div className="num font-medium">{money(d.amount)}</div>
                      <div className="truncate text-xs text-muted">
                        {d.method} - {fmtDate(d.createdAt)}
                      </div>
                      {d.adminNote && <div className="text-xs text-red-700">{d.adminNote}</div>}
                    </div>
                    <Badge tone={depositTone[d.status]}>{d.status.toLowerCase()}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <Card title="Transaction history" className="h-fit">
          <TableState loading={loading} error={error} empty={!data?.transactions.items.length} emptyText="No transactions yet.">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="th">Date</th>
                  <th className="th">Type</th>
                  <th className="th">Details</th>
                  <th className="th text-right">Amount</th>
                  <th className="th text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                {data?.transactions.items.map((t) => {
                  const credit = Number(t.amount) >= 0;
                  return (
                    <tr key={t.id}>
                      <td className="td whitespace-nowrap text-muted">{fmtDate(t.createdAt)}</td>
                      <td className="td">{txLabel[t.type]}</td>
                      <td className="td max-w-64 truncate text-muted" title={t.note ?? ''}>
                        {t.note ?? '-'}
                      </td>
                      <td className={`td num text-right font-medium ${credit ? 'text-emerald-700' : ''}`}>
                        {credit ? '+' : '-'}
                        {money(Math.abs(Number(t.amount)))}
                      </td>
                      <td className="td num text-right text-muted">{money(t.balanceAfter)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableState>
          {data && <Pager page={data.transactions.page} pages={data.transactions.pages} onPage={setPage} />}
        </Card>
      </div>
    </>
  );
}

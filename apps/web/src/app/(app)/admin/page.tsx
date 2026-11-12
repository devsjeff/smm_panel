'use client';

import Link from 'next/link';
import { Badge, Card, Notice, ORDER_STATUSES, orderStatusLabel, PageHeader, Stat } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { AdminStats } from '@/lib/types';

export default function AdminOverviewPage() {
  const { money } = useSession();
  const { data, error } = useApi<AdminStats>('/admin/stats');

  if (error) return <Notice>{error}</Notice>;
  const totalOrders = data ? Object.values(data.orders).reduce((a, b) => a + (b ?? 0), 0) : 0;

  return (
    <>
      <PageHeader title="Admin overview" />

      {!!data?.needsReview && (
        <div className="mb-4">
          <Notice tone="amber">
            {data.needsReview} order{data.needsReview > 1 ? 's' : ''} could not be confirmed with the provider and need a
            decision.{' '}
            <Link href="/admin/orders?review=1" className="font-medium underline">
              Review now
            </Link>
          </Notice>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Revenue" value={data ? money(data.revenue) : '-'} hint="Charges minus refunds" />
        <Stat label="Profit" value={data ? money(data.completedProfit) : '-'} hint="On completed orders" />
        <Stat label="Users" value={data?.users ?? '-'} />
        <Stat
          label="Deposits to review"
          value={data?.pendingDeposits ?? '-'}
          hint={data?.pendingDeposits ? 'Waiting for approval' : undefined}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <Card title={`Orders (${totalOrders.toLocaleString()})`}>
          <ul className="p-2">
            {ORDER_STATUSES.map((s) => (
              <li key={s} className="flex items-center justify-between px-2 py-1.5 text-sm">
                <Link href={`/admin/orders?status=${s}`} className="text-muted hover:text-ink hover:underline">
                  {orderStatusLabel(s)}
                </Link>
                <span className="num font-medium">{(data?.orders[s] ?? 0).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card
          title="Providers"
          action={
            <Link href="/admin/providers" className="text-xs font-medium text-brand underline">
              Manage
            </Link>
          }
        >
          {data && data.providers.length === 0 && (
            <p className="p-4 text-sm text-muted">No providers yet. Add one to load services.</p>
          )}
          <ul>
            {data?.providers.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-3 text-sm last:border-0">
                <div className="min-w-0">
                  <div className="font-medium">{p.name}</div>
                  {p.lastError && <div className="truncate text-xs text-red-700">{p.lastError}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="num">{p.balance === null ? '-' : `${Number(p.balance).toFixed(2)} ${p.currency ?? ''}`}</span>
                  {!p.isActive && <Badge>Off</Badge>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

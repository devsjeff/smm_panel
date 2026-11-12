'use client';

import Link from 'next/link';
import { OrdersTable } from '@/components/OrdersTable';
import { Card, PageHeader, Stat, TableState } from '@/components/ui';
import { useApi } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Dashboard } from '@/lib/types';

export default function DashboardPage() {
  const { user, money } = useSession();
  const { data, error, loading } = useApi<Dashboard>('/dashboard');

  return (
    <>
      <PageHeader title={`Hi, ${user.name}`} sub="Your account at a glance">
        <Link href="/wallet" className="btn">
          Add funds
        </Link>
        <Link href="/new-order" className="btn btn-primary">
          New order
        </Link>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Balance" value={money(data?.balance ?? user.balance)} />
        <Stat label="Active orders" value={data?.activeOrders ?? '-'} />
        <Stat label="Completed orders" value={data?.completedOrders ?? '-'} hint={data ? `${data.totalOrders} total` : undefined} />
        <Stat label="Total spent" value={data ? money(data.totalSpent) : '-'} hint="After refunds" />
      </div>

      <Card
        title="Recent orders"
        className="mt-6"
        action={
          <Link href="/orders" className="text-xs font-medium text-brand underline">
            View all
          </Link>
        }
      >
        <TableState loading={loading} error={error} empty={!data?.recent.length} emptyText="No orders yet. Place your first one.">
          <OrdersTable orders={data?.recent ?? []} />
        </TableState>
      </Card>
    </>
  );
}

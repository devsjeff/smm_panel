'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { OrdersTable } from '@/components/OrdersTable';
import { Card, ORDER_STATUSES, orderStatusLabel, PageHeader, Pager, TableState } from '@/components/ui';
import { qs, useApi } from '@/lib/api';
import type { Order, Paged } from '@/lib/types';

export default function OrdersPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<Order>>(`/orders${qs({ status, page })}`);

  // Statuses change in the background (worker syncs every minute).
  useEffect(() => {
    const t = setInterval(reload, 30000);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <>
      <PageHeader title="Orders" sub="Statuses update automatically">
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
        <Link href="/new-order" className="btn btn-primary">
          New order
        </Link>
      </PageHeader>
      <Card>
        <TableState loading={loading} error={error} empty={!data?.items.length} emptyText="No orders found.">
          <OrdersTable orders={data?.items ?? []} />
        </TableState>
        {data && <Pager page={data.page} pages={data.pages} onPage={setPage} />}
      </Card>
    </>
  );
}

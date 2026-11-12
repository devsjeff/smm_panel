'use client';

import { useSession } from '@/lib/session';
import type { Order } from '@/lib/types';
import { fmtDate, StatusBadge } from './ui';

export function OrdersTable({ orders }: { orders: Order[] }) {
  const { money } = useSession();
  return (
    <table className="w-full">
      <thead>
        <tr>
          <th className="th">ID</th>
          <th className="th">Service</th>
          <th className="th">Link</th>
          <th className="th text-right">Quantity</th>
          <th className="th text-right">Remains</th>
          <th className="th text-right">Charge</th>
          <th className="th">Status</th>
          <th className="th">Placed</th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id}>
            <td className="td num text-muted">#{o.id}</td>
            <td className="td max-w-64 truncate" title={o.service.name}>
              {o.service.name}
            </td>
            <td className="td max-w-52 truncate text-muted" title={o.link}>
              {o.link}
            </td>
            <td className="td num text-right">{o.quantity.toLocaleString()}</td>
            <td className="td num text-right text-muted">{o.remains ?? '-'}</td>
            <td className="td num text-right">
              {money(o.charge)}
              {Number(o.refundedAmount) > 0 && (
                <div className="text-xs text-emerald-700">{money(o.refundedAmount)} refunded</div>
              )}
            </td>
            <td className="td">
              <StatusBadge status={o.status} />
            </td>
            <td className="td whitespace-nowrap text-muted">{fmtDate(o.createdAt)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

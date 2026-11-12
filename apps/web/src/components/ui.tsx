'use client';

import type { ReactNode } from 'react';
import type { OrderStatus } from '@/lib/types';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('card', className)}>
      {title && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card px-4 py-4">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="num mt-1.5 text-2xl font-semibold tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

const tones = {
  gray: 'bg-stone-100 text-stone-700',
  blue: 'bg-sky-50 text-sky-800',
  green: 'bg-emerald-50 text-emerald-800',
  amber: 'bg-amber-50 text-amber-800',
  red: 'bg-red-50 text-red-700',
};

export function Badge({ tone = 'gray', children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return (
    <span className={cx('inline-block rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone])}>
      {children}
    </span>
  );
}

const statusTone: Record<OrderStatus, keyof typeof tones> = {
  PENDING: 'gray',
  PROCESSING: 'gray',
  IN_PROGRESS: 'blue',
  COMPLETED: 'green',
  PARTIAL: 'amber',
  CANCELED: 'red',
  FAILED: 'red',
};
const statusLabel: Record<OrderStatus, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  PARTIAL: 'Partial',
  CANCELED: 'Canceled',
  FAILED: 'Failed',
};
export const ORDER_STATUSES = Object.keys(statusLabel) as OrderStatus[];
export const orderStatusLabel = (s: OrderStatus) => statusLabel[s];

export function StatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={statusTone[status]}>{statusLabel[status]}</Badge>;
}

export function Notice({ tone = 'red', children }: { tone?: 'red' | 'green' | 'amber'; children: ReactNode }) {
  const cls = {
    red: 'border-red-200 bg-red-50 text-red-800',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
  }[tone];
  return <div className={cx('rounded-lg border px-3 py-2 text-sm', cls)}>{children}</div>;
}

/** Wraps a table: handles loading / error / empty and scrolls sideways on small screens. */
export function TableState({
  loading,
  error,
  empty,
  emptyText,
  children,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  if (error) return <div className="p-4"><Notice>{error}</Notice></div>;
  if (loading && empty) return <div className="p-6 text-sm text-muted">Loading...</div>;
  if (empty) return <div className="p-6 text-sm text-muted">{emptyText}</div>;
  return <div className="overflow-x-auto">{children}</div>;
}

export function Pager({ page, pages, onPage }: { page: number; pages: number; onPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-3 text-sm text-muted">
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Previous
      </button>
      <span className="num">
        {page} / {pages}
      </span>
      <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '-';

'use client';

import { createContext, useContext } from 'react';
import type { Me } from './types';

type Session = { user: Me; refresh: () => void; money: (v: string | number | null | undefined) => string };

export const SessionContext = createContext<Session | null>(null);

export function useSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside the app layout');
  return s;
}

export function makeMoney(currency: string) {
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 5,
    });
  } catch {
    fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
  }
  return (v: string | number | null | undefined) => (v === null || v === undefined ? '-' : fmt.format(Number(v)));
}

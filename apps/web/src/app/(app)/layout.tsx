'use client';

import { useMemo, type ReactNode } from 'react';
import { Shell } from '@/components/Shell';
import { Notice } from '@/components/ui';
import { useApi } from '@/lib/api';
import { makeMoney, SessionContext } from '@/lib/session';
import type { Me } from '@/lib/types';

export default function AppLayout({ children }: { children: ReactNode }) {
  // A 401 here redirects to /login inside api().
  const { data: user, error, reload } = useApi<Me>('/auth/me');
  const session = useMemo(
    () => (user ? { user, refresh: reload, money: makeMoney(user.currency) } : null),
    [user, reload],
  );

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-sm text-muted">
        {error ? <Notice>Could not reach the server: {error}</Notice> : 'Loading...'}
      </div>
    );
  }
  return (
    <SessionContext.Provider value={session}>
      <Shell>{children}</Shell>
    </SessionContext.Provider>
  );
}

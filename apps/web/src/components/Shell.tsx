'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { cx } from './ui';

export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || 'SMM Panel';

const userNav = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/new-order', label: 'New order' },
  { href: '/orders', label: 'Orders' },
  { href: '/services', label: 'Services' },
  { href: '/wallet', label: 'Wallet' },
];
const adminNav = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/deposits', label: 'Deposits' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/services', label: 'Services & pricing' },
  { href: '/admin/providers', label: 'Providers' },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, money } = useSession();
  const pathname = usePathname();

  const link = (item: { href: string; label: string }) => {
    const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cx(
          'rounded-lg px-3 py-2 text-sm whitespace-nowrap transition',
          active ? 'bg-white/10 font-medium text-white' : 'text-white/65 hover:bg-white/5 hover:text-white',
        )}
      >
        {item.label}
      </Link>
    );
  };

  async function logout() {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-ink text-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:shrink-0 md:flex-col">
        <div className="flex items-center justify-between px-5 py-4">
          <Link href="/dashboard" className="text-base font-semibold tracking-tight">
            {SITE_NAME}
          </Link>
          <span className="num rounded-md bg-white/10 px-2 py-1 text-xs md:hidden">{money(user.balance)}</span>
        </div>

        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-y-auto">
          {userNav.map(link)}
          {user.role === 'ADMIN' && (
            <>
              <div className="hidden px-3 pt-5 pb-1 text-[11px] font-medium tracking-wide text-white/40 uppercase md:block">
                Admin
              </div>
              {adminNav.map(link)}
            </>
          )}
        </nav>

        <div className="hidden border-t border-white/10 px-5 py-4 md:block">
          <div className="text-xs text-white/50">Balance</div>
          <div className="num text-lg font-semibold">{money(user.balance)}</div>
          <div className="mt-3 truncate text-xs text-white/60" title={user.email}>
            {user.email}
          </div>
          <button onClick={logout} className="mt-2 cursor-pointer text-xs text-white/60 underline hover:text-white">
            Sign out
          </button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
        <button onClick={logout} className="mt-8 cursor-pointer text-xs text-muted underline md:hidden">
          Sign out ({user.email})
        </button>
      </main>
    </div>
  );
}

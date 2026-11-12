'use client';

import type { ReactNode } from 'react';
import { Notice } from '@/components/ui';
import { useSession } from '@/lib/session';

// Cosmetic only: the API enforces the admin role on every /api/admin request.
export default function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = useSession();
  if (user.role !== 'ADMIN') return <Notice>This area is for administrators.</Notice>;
  return <>{children}</>;
}

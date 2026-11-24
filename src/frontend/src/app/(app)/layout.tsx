import type { ReactNode } from 'react';
import AppShell from '@/components/AppShell';

// Shared shell for the authenticated area (/lookup, /dashboard); URLs are unchanged by the route group.
export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

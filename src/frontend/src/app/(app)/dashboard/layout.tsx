import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Watchlist — KapiTrace',
  description: 'Indicadores monitorados na sua conta.',
};

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return children;
}

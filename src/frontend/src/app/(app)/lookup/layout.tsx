import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'Consulta — KapiTrace',
  description: 'Consulta de reputação de IPs, domínios e hashes com score unificado.',
};

export default function LookupLayout({ children }: { children: ReactNode }) {
  return children;
}

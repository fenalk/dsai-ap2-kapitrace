import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/Toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'KapiTrace — Threat Intelligence & IP Reputation',
  description:
    'Plataforma de inteligência de ameaças: reputação de IPs, domínios e hashes com score unificado a partir de fontes externas.',
  keywords: ['threat intelligence', 'IP reputation', 'cybersecurity', 'malware analysis', 'domain reputation'],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#070b14',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}

import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger' | 'risk-low' | 'risk-suspicious' | 'risk-high' | 'risk-critical';

export default function Badge({ tone = 'neutral', children, className }: { tone?: BadgeTone; children: ReactNode; className?: string }) {
  return <span className={['badge', `badge-${tone}`, className].filter(Boolean).join(' ')}>{children}</span>;
}

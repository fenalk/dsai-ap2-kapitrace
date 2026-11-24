import type { ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

export type AlertTone = 'info' | 'success' | 'warning' | 'danger';

const icons: Record<AlertTone, IconName> = { info: 'info', success: 'check-circle', warning: 'warning', danger: 'alert-circle' };

interface AlertProps {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Defaults to "alert" for danger (interrupts) and "status" for the rest (polite). */
  role?: 'alert' | 'status' | 'none';
  'data-testid'?: string;
}

export default function Alert({ tone = 'info', title, children, className, role, ...rest }: AlertProps) {
  const resolvedRole = role ?? (tone === 'danger' ? 'alert' : 'status');
  return (
    <div className={['alert', `alert-${tone}`, className].filter(Boolean).join(' ')} role={resolvedRole === 'none' ? undefined : resolvedRole} data-testid={rest['data-testid']}>
      <Icon name={icons[tone]} />
      <div className="alert-body">
        {title && <p className="alert-title">{title}</p>}
        {children}
      </div>
    </div>
  );
}

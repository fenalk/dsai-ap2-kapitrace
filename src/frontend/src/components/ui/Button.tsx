import Link from 'next/link';
import type { ButtonHTMLAttributes, ComponentProps } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface StyleProps { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; iconOnly?: boolean }

/** Class list shared by <button> and links styled as buttons. */
export function buttonClass({ variant = 'primary', size = 'md', block, iconOnly }: StyleProps = {}, extra?: string): string {
  return ['btn', `btn-${variant}`, size !== 'md' && `btn-${size}`, block && 'btn-block', iconOnly && 'btn-icon', extra].filter(Boolean).join(' ');
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & StyleProps & { loading?: boolean };

/** Button with a loading state: stays disabled and announces itself as busy. */
export function Button({ variant, size, block, iconOnly, loading = false, className, disabled, type = 'button', children, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={buttonClass({ variant, size, block, iconOnly }, [loading && 'is-loading', className].filter(Boolean).join(' ') || undefined)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & StyleProps;

export function ButtonLink({ variant, size, block, iconOnly, className, ...props }: ButtonLinkProps) {
  return <Link {...props} className={buttonClass({ variant, size, block, iconOnly }, className)} />;
}

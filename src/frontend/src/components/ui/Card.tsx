import type { HTMLAttributes, ReactNode } from 'react';

type CardProps = HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article' | 'li'; interactive?: boolean };

export default function Card({ as: Tag = 'div', interactive, className, ...props }: CardProps) {
  return <Tag {...props} className={['card', interactive && 'card-interactive', className].filter(Boolean).join(' ')} />;
}

/** Card heading row: small uppercase title and optional actions on the right. */
export function CardHeader({ title, actions, level = 2 }: { title: ReactNode; actions?: ReactNode; level?: 2 | 3 }) {
  const Heading = level === 2 ? 'h2' : 'h3';
  return <div className="card-header"><Heading className="card-title">{title}</Heading>{actions}</div>;
}

import type { CSSProperties } from 'react';

/** Placeholder block while content loads; hidden from assistive technology (announce loading elsewhere). */
export default function Skeleton({ width, height, circle, className }: { width?: CSSProperties['width']; height?: CSSProperties['height']; circle?: boolean; className?: string }) {
  return <span aria-hidden="true" className={['skeleton', circle && 'skeleton-circle', className].filter(Boolean).join(' ')} style={{ width, height }} />;
}

/** A few text lines of decreasing width. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return <span className="skeleton-stack" aria-hidden="true">{Array.from({ length: lines }, (_, index) => <Skeleton key={index} width={`${100 - index * 15}%`} />)}</span>;
}

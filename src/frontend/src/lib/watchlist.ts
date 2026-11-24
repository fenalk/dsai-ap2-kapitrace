// Pure watchlist rules (SPEC-FDE 006, F5): no React, no I/O.
import type { WatchlistItem } from './api';

export type WatchlistFilter = 'all' | 'ip' | 'domain' | 'hash';
export const watchlistFilters: { value: WatchlistFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'ip', label: 'IP' },
  { value: 'domain', label: 'Domínio' },
  { value: 'hash', label: 'Hash' },
];

const typeLabels: Record<string, string> = { ip: 'IP', domain: 'Domínio', hash: 'Hash', email: 'Email' };
/** Display name of an item type; unknown types stay as stored. */
export const watchlistTypeLabel = (type: string): string => typeLabels[type] ?? type;

/** Local filter by type and case-insensitive text in the value (F5.2). Keeps the original order. */
export function filterWatchlist(items: readonly WatchlistItem[], type: WatchlistFilter, text: string): WatchlistItem[] {
  const needle = text.trim().toLowerCase();
  return items.filter(item => (type === 'all' || item.itemType === type) && (!needle || item.itemValue.toLowerCase().includes(needle)));
}

/** Number of items per filter option, for the counters next to each option. */
export function countByFilter(items: readonly WatchlistItem[]): Record<WatchlistFilter, number> {
  const counts: Record<WatchlistFilter, number> = { all: items.length, ip: 0, domain: 0, hash: 0 };
  for (const item of items) if (item.itemType === 'ip' || item.itemType === 'domain' || item.itemType === 'hash') counts[item.itemType]++;
  return counts;
}

/**
 * Address that repeats the lookup of an item (F5.3); /lookup runs it on open (F2.2).
 * Null for types without a lookup (email): no button that does nothing.
 */
export function lookupHref(item: Pick<WatchlistItem, 'itemType' | 'itemValue'>): string | null {
  if (item.itemType !== 'ip' && item.itemType !== 'domain' && item.itemType !== 'hash') return null;
  return `/lookup?${new URLSearchParams({ type: item.itemType, q: item.itemValue }).toString()}`;
}

/** Puts an item back at `index` (clamped), replacing nothing; used to undo a removal or a failed DELETE (F5.4). */
export function restoreItem(items: readonly WatchlistItem[], item: WatchlistItem, index: number): WatchlistItem[] {
  if (items.some(current => current.id === item.id)) return [...items];
  const position = Math.min(Math.max(0, index), items.length);
  return [...items.slice(0, position), item, ...items.slice(position)];
}

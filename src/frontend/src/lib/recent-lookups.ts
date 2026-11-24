'use client';
// Recent successful lookups of this session (SPEC-FDE 006, F4.14). Memory only, like lib/session.ts:
// never written to localStorage/sessionStorage. lib/session.ts calls clearRecentLookups() whenever the token
// changes (sign out, expiry, another login), so this module registers no listener of its own at import time.
import type { LookupType } from './lookup-messages';

export interface RecentLookup { type: LookupType; indicator: string }
export const MAX_RECENT_LOOKUPS = 8;

/** Newest first, without repeating the same type+indicator, at most `max` entries. Pure. */
export function addRecentLookup(list: readonly RecentLookup[], entry: RecentLookup, max = MAX_RECENT_LOOKUPS): RecentLookup[] {
  const rest = list.filter(item => item.type !== entry.type || item.indicator !== entry.indicator);
  return [entry, ...rest].slice(0, max);
}

const empty: RecentLookup[] = [];
let entries: RecentLookup[] = empty;
const listeners = new Set<() => void>();
function notify(): void { for (const listener of listeners) listener(); }

export const getRecentLookups = (): RecentLookup[] => entries;
export const serverRecentLookups = (): RecentLookup[] => empty;
export function subscribeRecentLookups(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
/** Called by the lookup screen, which only renders with a session. */
export function rememberLookup(entry: RecentLookup): void {
  entries = addRecentLookup(entries, entry);
  notify();
}
/** Drops every entry; called by lib/session.ts when the session token changes. */
export function clearRecentLookups(): void {
  if (entries.length === 0) return;
  entries = empty;
  notify();
}

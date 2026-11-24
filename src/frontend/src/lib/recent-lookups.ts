'use client';
// Recent successful lookups of this session (SPEC-FDE 006, F4.14). Memory only, like lib/session.ts:
// never written to localStorage/sessionStorage, and dropped whenever the session token changes (sign out, expiry, other login).
import type { LookupType } from './lookup-messages';
import { getSessionToken, subscribeSession } from './session';

export interface RecentLookup { type: LookupType; indicator: string }
export const MAX_RECENT_LOOKUPS = 8;

/** Newest first, without repeating the same type+indicator, at most `max` entries. Pure. */
export function addRecentLookup(list: readonly RecentLookup[], entry: RecentLookup, max = MAX_RECENT_LOOKUPS): RecentLookup[] {
  const rest = list.filter(item => item.type !== entry.type || item.indicator !== entry.indicator);
  return [entry, ...rest].slice(0, max);
}

const empty: RecentLookup[] = [];
let entries: RecentLookup[] = empty;
let owner = getSessionToken();
const listeners = new Set<() => void>();
function notify(): void { for (const listener of listeners) listener(); }

subscribeSession(() => {
  const current = getSessionToken();
  if (current === owner) return;
  owner = current;
  if (entries.length === 0) return;
  entries = empty;
  notify();
});

export const getRecentLookups = (): RecentLookup[] => entries;
export const serverRecentLookups = (): RecentLookup[] => empty;
export function subscribeRecentLookups(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function rememberLookup(entry: RecentLookup): void {
  const current = getSessionToken();
  if (current === null) return;
  // Never mix entries of two sessions, even if a change was not observed yet.
  if (current !== owner) { owner = current; entries = empty; }
  entries = addRecentLookup(entries, entry);
  notify();
}

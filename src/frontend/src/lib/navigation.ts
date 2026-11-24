// Pure navigation rules (no React, no I/O) for SPEC-FDE 006 F2: kept here so they are unit-testable.

export type SessionEndReason = 'logout' | 'expired' | null;
export type NavKey = 'watchlist' | 'ip' | 'domain' | 'hash';

const DEFAULT_AFTER_LOGIN = '/lookup';
const BASE = 'http://kapitrace.invalid';

/**
 * Returns `raw` only when it is an internal path that is safe to navigate to after login (F2.1):
 * starts with a single "/", stays on this origin, has no control characters and does not point back to /login.
 */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('\\')) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  let url: URL;
  try { url = new URL(raw, BASE); } catch { return null; }
  if (url.origin !== BASE) return null;
  if (url.pathname === '/login' || url.pathname.startsWith('/login/')) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Where to go after a successful login. */
export function afterLoginPath(next: string | null | undefined): string {
  return safeNextPath(next) ?? DEFAULT_AFTER_LOGIN;
}

/**
 * Login URL used when an authenticated screen has no session (F2.1, F2.4, F2.5):
 * - logout: no destination, shows "Você saiu";
 * - expired (401): keeps the destination and shows "Sessão expirada";
 * - otherwise: keeps the destination.
 */
export function loginRedirect(currentPath: string, reason: SessionEndReason): string {
  if (reason === 'logout') return '/login?saiu=1';
  const params = new URLSearchParams();
  const next = safeNextPath(currentPath);
  if (next) params.set('next', next);
  if (reason === 'expired') params.set('expirou', '1');
  const query = params.toString();
  return query ? `/login?${query}` : '/login';
}

export interface LoginNotice { tone: 'info' | 'warning'; text: string }

/** Informational message at the top of /login, derived from the query string. */
export function loginNotice(params: { get(name: string): string | null }): LoginNotice | null {
  if (params.get('expirou') === '1') return { tone: 'warning', text: 'Sua sessão expirou. Entre novamente.' };
  if (params.get('saiu') === '1') return { tone: 'info', text: 'Você saiu da sua conta.' };
  return null;
}

/** Navigation item that matches the current screen (F2.3); lookup without a valid type is IP. */
export function activeNavKey(pathname: string, type: string | null): NavKey | null {
  if (pathname === '/dashboard') return 'watchlist';
  if (pathname === '/lookup') return type === 'domain' || type === 'hash' ? type : 'ip';
  return null;
}

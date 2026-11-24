'use client';
import type { SessionEndReason } from './navigation';
// Private module state: never persisted, serialized into HTML or logged.
let token: string | null = null;
let endReason: SessionEndReason = null;
const listeners = new Set<() => void>();
export const getSessionToken = (): string | null => token;
export const hasSession = (): boolean => token !== null;
export const serverSessionSnapshot = (): boolean => false;
/** Why the last session ended ("logout", "expired") or null; tells RequireSession which login message to show. */
export const getSessionEndReason = (): SessionEndReason => endReason;
export const serverEndReasonSnapshot = (): SessionEndReason => null;
export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function notify(): void { for (const listener of listeners) listener(); }
export function setSessionToken(value: string | null): void {
  if (value !== null && (typeof value !== 'string' || value.length > 8192 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value))) {
    throw new Error('Resposta de autenticação inválida.');
  }
  token = value;
  endReason = null;
  // Clear only the previous implementation's known key, without reading it.
  if (typeof window !== 'undefined') {
    try { window.sessionStorage.removeItem('kapitrace.session'); window.localStorage.removeItem('kapitrace.session'); } catch { /* Storage can be disabled; memory session still works. */ }
  }
  notify();
}
function endSession(reason: Exclude<SessionEndReason, null>): void {
  if (token === null) return;
  token = null;
  endReason = reason;
  notify();
}
/** The user chose to leave (F2.4). */
export function signOut(): void { endSession('logout'); }
/** The server rejected the token (401). Only the token that failed is cleared, never a newer login. */
export function expireSession(failedToken: string | null): void {
  if (failedToken !== null && token === failedToken) endSession('expired');
}
/**
 * E-mail claim of the current token, for display only. The signature is NOT checked here (the server does that),
 * so the value is never used for authorization or any other decision; anything that is not a plain e-mail is dropped.
 */
export function getSessionEmail(): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')), char => char.charCodeAt(0));
    const claims: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const email = claims && typeof claims === 'object' ? (claims as Record<string, unknown>).email : null;
    return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  } catch { return null; }
}

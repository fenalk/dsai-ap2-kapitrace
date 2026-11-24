'use client';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { getSessionEndReason, hasSession, subscribeSession, serverSessionSnapshot, serverEndReasonSnapshot } from '../lib/session';
import { loginRedirect } from '../lib/navigation';

/**
 * Guards authenticated screens. Without a session it sends the user to /login, keeping the current
 * address as `next` (F2.1) and passing why the session ended: logout (F2.4) or expired token (F2.5).
 */
export default function RequireSession({ children }: { children: ReactNode }) {
  const authenticated = useSyncExternalStore(subscribeSession, hasSession, serverSessionSnapshot);
  // The end reason is read from the same store so the redirect never uses a stale value.
  const endReason = useSyncExternalStore(subscribeSession, getSessionEndReason, serverEndReasonSnapshot);
  const router = useRouter();
  useEffect(() => {
    if (authenticated) return;
    // window is only read here, after hydration; server and first client render both show the fallback below.
    router.replace(loginRedirect(`${window.location.pathname}${window.location.search}`, endReason));
  }, [authenticated, endReason, router]);
  return authenticated ? children : <p className="page-content" role="status">Entre na sua conta para continuar.</p>;
}

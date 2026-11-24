'use client';
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { getSessionEmail, signOut, subscribeSession } from '@/lib/session';
import Icon from './ui/Icon';

const noEmailOnServer = (): string | null => null;

/**
 * Account disclosure in the top bar (F2.4): shows who is signed in and the "Sair" action.
 * Closed, the panel is `hidden` (not focusable, not announced), as a disclosure should be; opening it exposes "Sair".
 */
export default function UserMenu() {
  const email = useSyncExternalStore(subscribeSession, getSessionEmail, noEmailOnServer);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown); };
  }, [open]);

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn btn-ghost user-menu-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(value => !value)}
      >
        <Icon name="user" />
        <span className="user-menu-label">Conta</span>
      </button>
      <div id={panelId} className="user-menu-panel" hidden={!open}>
        {email && <p className="user-menu-email"><span className="text-muted">Conectado como</span><strong>{email}</strong></p>}
        <button type="button" className="btn btn-ghost btn-block user-menu-signout" onClick={() => { setOpen(false); signOut(); }}>
          <Icon name="logout" />Sair
        </button>
      </div>
    </div>
  );
}

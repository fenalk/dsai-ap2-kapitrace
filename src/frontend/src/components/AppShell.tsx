'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import Icon, { type IconName } from './ui/Icon';

interface NavItem { label: string; href: string; icon: IconName; section: string }

const navItems: NavItem[] = [
  { label: 'Watchlist', href: '/dashboard', icon: 'eye', section: 'Principal' },
  { label: 'IP Lookup', href: '/lookup?type=ip', icon: 'globe', section: 'Inteligência' },
  { label: 'Domain Lookup', href: '/lookup?type=domain', icon: 'link', section: 'Inteligência' },
  { label: 'Hash Lookup', href: '/lookup?type=hash', icon: 'hash', section: 'Inteligência' },
];
const sections = ['Principal', 'Inteligência'];
const DESKTOP_QUERY = '(min-width: 768px)';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Authenticated layout (SPEC-FDE 006, F1.5): fixed sidebar on desktop, icon-only sidebar on tablet,
 * top bar plus navigation drawer on mobile. Breakpoints live in globals.css.
 */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) toggleRef.current?.focus();
  }, []);

  // While the drawer is open: focus moves into it, Tab stays inside, Esc closes it.
  useEffect(() => {
    if (!open) return;
    const sidebar = sidebarRef.current;
    // Wait one frame so the drawer is visible (it is visibility:hidden while closed) before moving focus.
    const frame = window.requestAnimationFrame(() => sidebar?.querySelector<HTMLElement>(FOCUSABLE)?.focus());
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); close(true); return; }
      if (event.key !== 'Tab' || !sidebar) return;
      const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => { window.cancelAnimationFrame(frame); document.removeEventListener('keydown', onKeyDown); };
  }, [open, close]);

  // Growing past the mobile breakpoint closes the drawer, so no hidden modal state is left behind.
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = (event: MediaQueryListEvent) => { if (event.matches) setOpen(false); };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  function closeOnNavigate(event: MouseEvent<HTMLElement>) {
    if ((event.target as HTMLElement).closest('a')) setOpen(false);
  }

  return (
    <div className={open ? 'app-shell drawer-open' : 'app-shell'}>
      <a className="skip-link" href="#conteudo">Pular para o conteúdo</a>

      <aside
        id="app-sidebar"
        ref={sidebarRef}
        className="sidebar"
        aria-label="Navegação principal"
        role={open ? 'dialog' : undefined}
        aria-modal={open || undefined}
        onClick={closeOnNavigate}
      >
        <div className="sidebar-brand">
          <Link href="/" className="brand" title="KapiTrace">
            <span className="brand-mark"><Icon name="shield" /></span>
            <span className="brand-name">KapiTrace</span>
          </Link>
          <button type="button" className="btn btn-ghost btn-icon drawer-close" aria-label="Fechar menu" onClick={() => close(true)}>
            <Icon name="close" />
          </button>
        </div>

        <nav className="sidebar-nav">
          {sections.map(section => (
            <div key={section}>
              <div className="sidebar-section-label">{section}</div>
              {navItems.filter(item => item.section === section).map(item => (
                <Link key={item.href} href={item.href} title={item.label} className={`sidebar-link ${pathname === item.href ? 'active' : ''}`}>
                  <Icon name={item.icon} />
                  <span className="sidebar-link-label">{item.label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <span className="status-dot" aria-hidden="true" />
          <span className="sidebar-footer-text">Fontes conforme configuração</span>
        </div>
      </aside>

      {open && <div className="drawer-backdrop" aria-hidden="true" onClick={() => close(false)} />}

      <div className="app-main">
        <header className="app-topbar">
          <div className="app-topbar-start">
            <button
              ref={toggleRef}
              type="button"
              className="btn btn-ghost btn-icon menu-toggle"
              aria-label="Abrir menu"
              aria-expanded={open}
              aria-controls="app-sidebar"
              onClick={() => setOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <Link href="/" className="brand">
              <span className="brand-mark"><Icon name="shield" /></span>
              <span className="brand-name">KapiTrace</span>
            </Link>
            <Link href="/lookup" className="topbar-secondary">Consultar indicador</Link>
          </div>
          <div className="topbar-actions">
            <Link href="/dashboard" className="topbar-secondary">Watchlist</Link>
            <Link href="/login">Entrar</Link>
          </div>
        </header>
        <main id="conteudo" tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}

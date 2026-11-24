'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Icon, { type IconName } from './Icon';

export type ToastTone = 'success' | 'danger' | 'info';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** Milliseconds before it closes on its own (default 5000). */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

interface ToastEntry extends Required<Pick<ToastOptions, 'message' | 'tone' | 'duration'>> { id: number; action?: ToastOptions['action'] }

const icons: Record<ToastTone, IconName> = { success: 'check-circle', danger: 'alert-circle', info: 'info' };
const MAX_TOASTS = 3;

interface ToastApi { show: (options: ToastOptions) => number; dismiss: (id: number) => void }
const ToastContext = createContext<ToastApi | null>(null);

/** Shows short confirmations (role="status", polite) at the bottom right. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => setToasts(current => current.filter(toast => toast.id !== id)), []);
  const show = useCallback((options: ToastOptions) => {
    const entry: ToastEntry = { id: ++nextId.current, message: options.message, tone: options.tone ?? 'success', duration: options.duration ?? 5000, action: options.action };
    setToasts(current => [...current, entry].slice(-MAX_TOASTS));
    return entry.id;
  }, []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toasts.map(toast => <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />)}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: ToastEntry; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);
  return (
    <div className={`toast toast-${toast.tone}`} data-testid="toast">
      <Icon name={icons[toast.tone]} />
      <span className="toast-message">{toast.message}</span>
      {toast.action && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { toast.action?.onClick(); onDismiss(toast.id); }}>{toast.action.label}</button>}
      <button type="button" className="btn btn-ghost btn-sm btn-icon" aria-label="Fechar aviso" onClick={() => onDismiss(toast.id)}><Icon name="close" /></button>
    </div>
  );
}

const missingProvider = (): never => { throw new Error('Toast hooks must be used inside <ToastProvider>.'); };

/** Shows a toast and returns its id (for useDismissToast). */
export function useToast(): (options: ToastOptions) => number {
  return useContext(ToastContext)?.show ?? missingProvider;
}

/** Closes a toast before its time, e.g. when its action no longer applies. Unknown ids are ignored. */
export function useDismissToast(): (id: number) => void {
  return useContext(ToastContext)?.dismiss ?? missingProvider;
}

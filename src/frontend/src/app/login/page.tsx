'use client';
import Link from 'next/link';
import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { setSessionToken } from '@/lib/session';
import { afterLoginPath, loginNotice } from '@/lib/navigation';
import Alert from '@/components/ui/Alert';
import Icon from '@/components/ui/Icon';
import Tabs from '@/components/ui/Tabs';

type Mode = 'login' | 'register';
const modes = [{ value: 'login' as const, label: 'Entrar' }, { value: 'register' as const, label: 'Criar conta' }];

// SPEC-FDE 006 F3: visual only. Error texts and field rules belong to SPEC-FDE 002/003 and are unchanged here.
function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const notice = loginNotice(params);
  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const register = mode === 'register';

  // F3.3: first field focused on open. Tab changes move focus in changeMode (only when clicked).
  useEffect(() => { emailRef.current?.focus(); }, []);

  function changeMode(next: Mode, source: 'keyboard' | 'pointer') {
    if (next === mode) return;
    // The password goes back to hidden whenever the context changes.
    setMode(next); setError(''); setShowPassword(false);
    // Keyboard users stay on the tab list (arrow navigation); a click goes straight to the first field.
    if (source === 'pointer') window.requestAnimationFrame(() => (next === 'register' ? nameRef : emailRef).current?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const credentials = { email: String(form.get('email')), password: String(form.get('password')) };
    setError(''); setLoading(true); setShowPassword(false);
    setSessionToken(null);
    try {
      if (register) await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ ...credentials, name: String(form.get('name') || '') }) });
      const result = await api<{ token: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
      if (typeof result.token !== 'string') throw new Error('Resposta de autenticação inválida.');
      setSessionToken(result.token);
      // F2.1: back to where the user was (only internal paths are accepted).
      router.replace(afterLoginPath(params.get('next')));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Falha na autenticação'); }
    finally { setLoading(false); }
  }

  return (
    <div className="auth-page">
      <main className="auth-card">
        <div className="auth-logo">
          <Link href="/" className="brand auth-brand" aria-label="KapiTrace — página inicial">
            <span className="brand-mark"><Icon name="shield" /></span>
            <span className="brand-name">KapiTrace</span>
          </Link>
          <h1>{register ? 'Crie sua conta' : 'Acesse sua conta'}</h1>
          <p>{register ? 'Cadastre-se para consultar indicadores e manter uma watchlist.' : 'Consulte IPs, domínios e hashes e acompanhe sua watchlist.'}</p>
        </div>

        <Tabs items={modes} value={mode} onChange={changeMode} label="Acesso" controls="auth-panel" idPrefix="auth-tab" className="auth-tabs" />

        {notice && !error && <Alert tone={notice.tone} role="status">{notice.text}</Alert>}

        <form className="auth-form" id="auth-panel" role="tabpanel" aria-labelledby={`auth-tab-${mode}`} onSubmit={submit}>
          {register && (
            <div className="field">
              <label className="field-label" htmlFor="name">Nome</label>
              <input ref={nameRef} className="input" id="name" name="name" autoComplete="name" />
            </div>
          )}
          <div className="field">
            <label className="field-label" htmlFor="email">Email</label>
            <input ref={emailRef} className="input" id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="password">Senha</label>
            <div className="input-adorned">
              <input
                className="input"
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={8}
                required
              />
              <button
                type="button"
                className="input-adornment"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                aria-controls="password"
                onClick={() => setShowPassword(value => !value)}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} />
              </button>
            </div>
          </div>
          {error && <Alert tone="danger">{error}</Alert>}
          <button className={loading ? 'btn btn-primary btn-lg btn-block is-loading' : 'btn btn-primary btn-lg btn-block'} type="submit" disabled={loading} aria-busy={loading || undefined}>
            {loading ? 'Aguarde…' : register ? 'Criar conta e entrar' : 'Entrar'}
          </button>
        </form>

        <p className="auth-footer"><Link href="/">← Voltar para o início</Link></p>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<p className="auth-page" role="status">Carregando…</p>}><LoginContent /></Suspense>;
}

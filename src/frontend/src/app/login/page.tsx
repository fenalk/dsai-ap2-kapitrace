'use client';
import Link from 'next/link';
import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { setSessionToken } from '@/lib/session';
import { afterLoginPath, loginNotice } from '@/lib/navigation';
import { isInvalidCredentials, loginFailureMessage, validateLogin, type LoginFieldErrors, type LoginFields } from '@/lib/login-messages';
import Alert from '@/components/ui/Alert';
import Icon from '@/components/ui/Icon';
import Tabs from '@/components/ui/Tabs';

type Mode = 'login' | 'register';
const modes = [{ value: 'login' as const, label: 'Entrar' }, { value: 'register' as const, label: 'Criar conta' }];

// SPEC-FDE 006 F3: visual. SPEC-FDE 002: login error texts and field rules (sign-up rules belong to SPEC-FDE 003).
function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const notice = loginNotice(params);
  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [loading, setLoading] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const register = mode === 'register';

  // F3.3: first field focused on open (required by the SPEC, also on touch screens, where it opens the
  // virtual keyboard). preventScroll keeps the page from jumping. Tab changes move focus in changeMode.
  useEffect(() => { emailRef.current?.focus({ preventScroll: true }); }, []);

  function changeMode(next: Mode, source: 'keyboard' | 'pointer') {
    if (next === mode) return;
    // The password goes back to hidden whenever the context changes.
    setMode(next); setError(''); setFieldErrors({}); setShowPassword(false);
    // Keyboard users stay on the tab list (arrow navigation); a click goes straight to the first field.
    if (source === 'pointer') window.requestAnimationFrame(() => (next === 'register' ? nameRef : emailRef).current?.focus());
  }

  function clearFieldError(field: keyof LoginFields) {
    setFieldErrors(current => (current[field] ? { ...current, [field]: undefined } : current));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const credentials: LoginFields = { email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') };
    setError(''); setShowPassword(false);
    if (!register) {
      // E2: nothing is sent while a field is invalid; focus goes to the first one.
      const errors = validateLogin(credentials);
      setFieldErrors(errors);
      if (errors.email || errors.password) { (errors.email ? emailRef : passwordRef).current?.focus(); return; }
    }
    setLoading(true);
    setSessionToken(null);
    try {
      if (register) {
        // Sign-up failures still show the server text (SPEC-FDE 003). The "never show server text" rule of
        // SPEC-FDE 002 covers the "Entrar" mode and the login request made after a successful sign-up.
        try { await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ ...credentials, name: String(form.get('name') || '') }) }); }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Falha na autenticação'); return; }
      }
      const result = await api<{ token: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
      if (typeof result.token !== 'string') throw new Error('Invalid authentication response');
      setSessionToken(result.token);
      // F2.1: back to where the user was (only internal paths are accepted).
      router.replace(afterLoginPath(params.get('next')));
    } catch (failure) {
      // E1: the text comes from the kind of failure, never from the server body.
      setError(loginFailureMessage(failure));
      if (isInvalidCredentials(failure) && passwordRef.current) {
        // E3: same treatment for unknown email and wrong password; the email is kept.
        passwordRef.current.value = '';
        passwordRef.current.focus();
      }
    } finally { setLoading(false); }
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

        <form className="auth-form" id="auth-panel" role="tabpanel" aria-labelledby={`auth-tab-${mode}`} onSubmit={submit} noValidate={!register}>
          {register && (
            <div className="field">
              <label className="field-label" htmlFor="name">Nome</label>
              <input ref={nameRef} className="input" id="name" name="name" autoComplete="name" />
            </div>
          )}
          <div className="field">
            <label className="field-label" htmlFor="email">Email</label>
            <input
              ref={emailRef}
              className="input"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
              onChange={() => clearFieldError('email')}
            />
            {fieldErrors.email && <p className="field-error" id="email-error">{fieldErrors.email}</p>}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="password">Senha</label>
            <div className="input-adorned">
              <input
                ref={passwordRef}
                className="input"
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={register ? 'new-password' : 'current-password'}
                minLength={register ? 8 : undefined}
                required
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={fieldErrors.password ? 'password-error' : undefined}
                onChange={() => clearFieldError('password')}
              />
              <button
                type="button"
                className="input-adornment"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword(value => !value)}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} />
              </button>
            </div>
            {fieldErrors.password && <p className="field-error" id="password-error">{fieldErrors.password}</p>}
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

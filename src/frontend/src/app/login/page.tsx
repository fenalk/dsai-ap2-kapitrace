'use client';
import Link from 'next/link';
import { Suspense, useEffect, useRef, useState, type FocusEvent, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { setSessionToken } from '@/lib/session';
import { afterLoginPath, loginNotice } from '@/lib/navigation';
import { isInvalidCredentials, loginFailureMessage, validateLogin, type LoginFields } from '@/lib/login-messages';
import {
  EMAIL_MAX, NAME_MAX, PASSWORD_MAX, passwordRuleMet, registerFailure, registerMessages, validateRegister, validateRegisterField,
  type RegisterField, type RegisterFieldErrors
} from '@/lib/register-messages';
import Alert from '@/components/ui/Alert';
import Icon from '@/components/ui/Icon';
import Tabs from '@/components/ui/Tabs';

type Mode = 'login' | 'register';
const modes = [{ value: 'login' as const, label: 'Entrar' }, { value: 'register' as const, label: 'Criar conta' }];

/** The asterisk is visual only: the input carries `required` for assistive technologies. */
function Required() {
  return <span className="field-required" aria-hidden="true"> *</span>;
}

// SPEC-FDE 006 F3: visual. SPEC-FDE 002: login error texts and field rules. SPEC-FDE 003: sign-up rules and texts.
function LoginContent() {
  const router = useRouter();
  const params = useSearchParams();
  const notice = loginNotice(params);
  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [partial, setPartial] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [passwordLength, setPasswordLength] = useState(0);
  const [loading, setLoading] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  // Fields the user has typed in: an untouched empty field is not flagged just because focus passed through it.
  const edited = useRef(new Set<RegisterField>());
  const register = mode === 'register';
  const refs = { name: nameRef, email: emailRef, password: passwordRef };

  // F3.3: first field focused on open (required by the SPEC, also on touch screens, where it opens the
  // virtual keyboard). preventScroll keeps the page from jumping. Tab changes move focus in changeMode.
  useEffect(() => { emailRef.current?.focus({ preventScroll: true }); }, []);

  function changeMode(next: Mode, source: 'keyboard' | 'pointer') {
    if (next === mode) return;
    // The password goes back to hidden whenever the context changes.
    setMode(next); setError(''); setPartial(false); setFieldErrors({}); setShowPassword(false);
    edited.current.clear();
    // Keyboard users stay on the tab list (arrow navigation); a click goes straight to the first field.
    if (source === 'pointer') window.requestAnimationFrame(() => (next === 'register' ? nameRef : emailRef).current?.focus());
  }

  function changed(field: RegisterField) {
    edited.current.add(field);
    setFieldErrors(current => (current[field] ? { ...current, [field]: undefined } : current));
  }

  // SPEC-FDE 003 E2: sign-up fields are checked when they lose focus.
  function blurred(field: RegisterField, event: FocusEvent<HTMLInputElement>) {
    if (!register || !edited.current.has(field)) return;
    const message = validateRegisterField(field, event.currentTarget.value);
    setFieldErrors(current => ({ ...current, [field]: message }));
  }

  function clearPassword() {
    if (passwordRef.current) passwordRef.current.value = '';
    setPasswordLength(0);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const credentials: LoginFields = { email: String(form.get('email') ?? ''), password: String(form.get('password') ?? '') };
    const name = String(form.get('name') ?? '').trim();
    setError(''); setPartial(false); setShowPassword(false);
    // SPEC-FDE 002 E2 / SPEC-FDE 003 E2: nothing is sent while a field is invalid; focus goes to the first one.
    const errors: RegisterFieldErrors = register ? validateRegister({ ...credentials, name }) : validateLogin(credentials);
    setFieldErrors(errors);
    const firstInvalid = (['name', 'email', 'password'] as const).find(field => errors[field]);
    if (firstInvalid) { refs[firstInvalid].current?.focus(); return; }
    setLoading(true);
    setSessionToken(null);
    try {
      if (register) {
        try { await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ ...credentials, name }) }); }
        catch (failure) {
          // SPEC-FDE 003 E4: the text depends on the kind of failure, never on the server's message.
          const { field, text } = registerFailure(failure);
          if (field) { setFieldErrors({ [field]: text }); refs[field].current?.focus(); }
          else setError(text);
          return;
        }
        try {
          const result = await api<{ token: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
          if (typeof result.token !== 'string') throw new Error('Invalid authentication response');
          setSessionToken(result.token);
        } catch {
          // E5: the account exists now. Going to "Entrar" keeps the user from trying to create it again.
          setMode('login'); setPartial(true); clearPassword(); edited.current.clear();
          window.requestAnimationFrame(() => passwordRef.current?.focus());
          return;
        }
      } else {
        const result = await api<{ token: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify(credentials) });
        if (typeof result.token !== 'string') throw new Error('Invalid authentication response');
        setSessionToken(result.token);
      }
      // F2.1: back to where the user was (only internal paths are accepted).
      router.replace(afterLoginPath(params.get('next')));
    } catch (failure) {
      // SPEC-FDE 002 E1: the text comes from the kind of failure, never from the server body.
      setError(loginFailureMessage(failure));
      if (isInvalidCredentials(failure) && passwordRef.current) {
        // E3: same treatment for unknown email and wrong password; the email is kept.
        clearPassword();
        passwordRef.current.focus();
      }
    } finally { setLoading(false); }
  }

  const ruleMet = passwordRuleMet(passwordLength);
  const describedBy = (...ids: (string | false | undefined)[]) => ids.filter(Boolean).join(' ') || undefined;

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

        {notice && !error && !partial && <Alert tone={notice.tone} role="status">{notice.text}</Alert>}
        {partial && <Alert tone="warning" role="alert" data-testid="register-partial">{registerMessages.partial}</Alert>}

        <form className="auth-form" id="auth-panel" role="tabpanel" aria-labelledby={`auth-tab-${mode}`} onSubmit={submit} noValidate>
          {register && <p className="field-hint auth-required-legend" data-testid="required-legend">* obrigatório</p>}
          {register && (
            <div className="field">
              <label className="field-label" htmlFor="name">Nome (opcional)</label>
              <input
                ref={nameRef}
                className="input"
                id="name"
                name="name"
                autoComplete="name"
                maxLength={NAME_MAX}
                aria-invalid={fieldErrors.name ? true : undefined}
                aria-describedby={describedBy(fieldErrors.name && 'name-error')}
                onChange={() => changed('name')}
                onBlur={event => blurred('name', event)}
              />
              {fieldErrors.name && <p className="field-error" id="name-error">{fieldErrors.name}</p>}
            </div>
          )}
          <div className="field">
            <label className="field-label" htmlFor="email">Email{register && <Required />}</label>
            <input
              ref={emailRef}
              className="input"
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              maxLength={register ? EMAIL_MAX : undefined}
              required
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={describedBy(fieldErrors.email && 'email-error')}
              onChange={() => changed('email')}
              onBlur={event => blurred('email', event)}
            />
            {fieldErrors.email && <p className="field-error" id="email-error">{fieldErrors.email}</p>}
          </div>
          <div className="field">
            <label className="field-label" htmlFor="password">Senha{register && <Required />}</label>
            <div className="input-adorned">
              <input
                ref={passwordRef}
                className="input"
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={register ? 'new-password' : 'current-password'}
                maxLength={register ? PASSWORD_MAX : undefined}
                required
                aria-invalid={fieldErrors.password ? true : undefined}
                aria-describedby={describedBy(register && 'password-rule', fieldErrors.password && 'password-error')}
                onChange={event => { changed('password'); setPasswordLength(event.currentTarget.value.length); }}
                onBlur={event => blurred('password', event)}
              />
              <button
                type="button"
                className="input-adornment"
                aria-pressed={showPassword}
                aria-controls="password"
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                onClick={() => setShowPassword(value => !value)}
              >
                <Icon name={showPassword ? 'eye-off' : 'eye'} />
              </button>
            </div>
            {register && (
              // E3: the state is told by icon and text, not by color alone.
              <p className={ruleMet ? 'password-rule is-met' : 'password-rule'} id="password-rule" data-testid="password-rule" data-met={ruleMet}>
                <Icon name={ruleMet ? 'check-circle' : 'info'} />
                <span>{registerMessages.passwordRule}{ruleMet && <strong> {registerMessages.passwordRuleMet}</strong>}</span>
              </p>
            )}
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

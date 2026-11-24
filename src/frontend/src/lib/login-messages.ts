// SPEC-FDE 002: login error texts and client-side field rules. Pure functions, no React and no I/O.
// Scope: the "Entrar" mode only. Sign-up still shows its own messages until SPEC-FDE 003.
import { ApiError, NetworkError } from './api';

export interface LoginFields { email: string; password: string }
export type LoginFieldErrors = Partial<Record<keyof LoginFields, string>>;

// Must match the login checks in src/backend/src/modules/auth/auth.controller.ts (email > 254, password > 1024,
// same email pattern). tests/integration/login-contract.test.ts fails if client and server diverge.
const EMAIL_MAX = 254;
const PASSWORD_MAX = 1024;
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const loginMessages = {
  emailRequired: 'Informe seu email.',
  emailInvalid: 'Informe um email válido, por exemplo nome@empresa.com.',
  passwordRequired: 'Informe sua senha.',
  passwordTooLong: `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`,
  badRequest: 'Verifique o email e a senha informados e tente novamente.',
  invalidCredentials: 'Email ou senha incorretos. Confira os dados e tente novamente.',
  // Deliberately longer than NetworkError's default text, which the other screens keep (tests/unit/login-messages.test.ts).
  network: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.',
  unexpected: 'Não foi possível entrar agora. Tente novamente em alguns instantes. Se o problema continuar, contate o administrador.'
} as const;

/** E2: validated before any request. An empty result means the form can be sent. */
export function validateLogin({ email, password }: LoginFields): LoginFieldErrors {
  const errors: LoginFieldErrors = {};
  const trimmed = email.trim();
  if (!trimmed) errors.email = loginMessages.emailRequired;
  else if (trimmed.length > EMAIL_MAX || !EMAIL_FORMAT.test(trimmed)) errors.email = loginMessages.emailInvalid;
  if (!password) errors.password = loginMessages.passwordRequired;
  else if (password.length > PASSWORD_MAX) errors.password = loginMessages.passwordTooLong;
  return errors;
}

function waitText(seconds: number): string {
  if (seconds <= 120) return `${seconds} ${seconds === 1 ? 'segundo' : 'segundos'}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minutos`;
}

/** E1: the text depends only on the kind of failure, never on the server's message (CA7). */
export function loginFailureMessage(failure: unknown): string {
  if (failure instanceof NetworkError) return loginMessages.network;
  if (failure instanceof ApiError) {
    if (failure.status === 401) return loginMessages.invalidCredentials;
    if (failure.status === 400) return loginMessages.badRequest;
    if (failure.status === 429) {
      return failure.retryAfter ? `Muitas tentativas. Aguarde ${waitText(failure.retryAfter)} e tente novamente.` : 'Muitas tentativas. Aguarde alguns instantes e tente novamente.';
    }
  }
  // 5xx, other statuses, non-JSON body or a response without a valid token.
  return loginMessages.unexpected;
}

/** 401 sends the user back to the password, which is cleared; the email is kept (E3). */
export function isInvalidCredentials(failure: unknown): boolean {
  return failure instanceof ApiError && failure.status === 401;
}

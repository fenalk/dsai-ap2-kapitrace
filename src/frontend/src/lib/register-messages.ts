// SPEC-FDE 003: sign-up field rules (E2) and server error texts (E4, E5). Pure functions, no React and no I/O.
import { ApiError, NetworkError } from './api';
import { EMAIL_FORMAT, EMAIL_MAX, PASSWORD_MAX, loginMessages } from './login-messages';

// Must match register in src/backend/src/modules/auth/auth.controller.ts (E7).
// tests/integration/register-contract.test.ts fails if client and server diverge.
export const NAME_MAX = 100;
export const PASSWORD_MIN = 8;
export { EMAIL_MAX, PASSWORD_MAX };

export interface RegisterFields { name: string; email: string; password: string }
export type RegisterField = keyof RegisterFields;
export type RegisterFieldErrors = Partial<Record<RegisterField, string>>;

export const registerMessages = {
  nameTooLong: `O nome pode ter no máximo ${NAME_MAX} caracteres.`,
  emailRequired: 'Informe seu email.',
  emailInvalid: 'Informe um email válido, por exemplo nome@empresa.com.',
  passwordRequired: 'Informe uma senha.',
  passwordTooShort: `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`,
  passwordTooLong: `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`,
  passwordRule: `Mínimo de ${PASSWORD_MIN} caracteres.`,
  passwordRuleMet: 'Atendido.',
  serverEmailInvalid: 'Informe um email válido.',
  accountExists: "Não foi possível criar a conta com este email. Se você já tem cadastro, use a aba 'Entrar' para acessar.",
  badRequest: 'Verifique os dados informados.',
  unexpected: 'Não foi possível criar a conta agora. Tente novamente em alguns instantes.',
  network: loginMessages.network,
  partial: 'Conta criada. Não foi possível entrar automaticamente; entre com seu email e senha.'
} as const;

/** Rule of a single field, so it can run on blur (E2). */
export function validateRegisterField(field: RegisterField, value: string): string | undefined {
  if (field === 'name') return value.trim().length > NAME_MAX ? registerMessages.nameTooLong : undefined;
  if (field === 'email') {
    const trimmed = value.trim();
    if (!trimmed) return registerMessages.emailRequired;
    return trimmed.length > EMAIL_MAX || !EMAIL_FORMAT.test(trimmed) ? registerMessages.emailInvalid : undefined;
  }
  if (!value) return registerMessages.passwordRequired;
  if (value.length < PASSWORD_MIN) return registerMessages.passwordTooShort;
  return value.length > PASSWORD_MAX ? registerMessages.passwordTooLong : undefined;
}

/** E2: validated before any request. An empty result means the form can be sent. */
export function validateRegister(fields: RegisterFields): RegisterFieldErrors {
  const errors: RegisterFieldErrors = {};
  for (const field of ['name', 'email', 'password'] as const) {
    const error = validateRegisterField(field, fields[field]);
    if (error) errors[field] = error;
  }
  return errors;
}

/** E3: the password rule shown under the field, from the typed length (the value itself is not kept in state). */
export function passwordRuleMet(length: number): boolean {
  return length >= PASSWORD_MIN;
}

// The backend texts are used only as mapping keys (E4). If one changes, the generic 400 text is shown.
const serverFieldErrors: Record<string, { field: RegisterField; text: string }> = {
  'Valid email address is required': { field: 'email', text: registerMessages.serverEmailInvalid },
  'Password must be at least 8 characters long': { field: 'password', text: registerMessages.passwordTooShort },
  // E7: the field maxLength prevents these on screen; a direct or altered client still gets the field text.
  [`Password must be at most ${PASSWORD_MAX} characters long`]: { field: 'password', text: registerMessages.passwordTooLong },
  [`Name must be at most ${NAME_MAX} characters long`]: { field: 'name', text: registerMessages.nameTooLong }
};

/** E4: field or general text for a failed sign-up, never the server's own message. */
export function registerFailure(failure: unknown): { field?: RegisterField; text: string } {
  if (failure instanceof NetworkError) return { text: registerMessages.network };
  if (failure instanceof ApiError && failure.status === 400) {
    const key = typeof failure.body.error === 'string' ? failure.body.error : '';
    if (key === 'User already exists') return { text: registerMessages.accountExists };
    return serverFieldErrors[key] ?? { text: registerMessages.badRequest };
  }
  // 5xx, other statuses or an invalid response.
  return { text: registerMessages.unexpected };
}

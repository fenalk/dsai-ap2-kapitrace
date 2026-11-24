// SPEC-FDE 002 — login error texts (E1, CA7) and client-side field rules (E2, CA3, CA4).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, NetworkError } from '../../src/frontend/src/lib/api';
import { isInvalidCredentials, loginFailureMessage, loginMessages, validateLogin } from '../../src/frontend/src/lib/login-messages';

const http = (status: number, error: string, retryAfter: number | null = null) => new ApiError(error, status, { error }, retryAfter);
const english = /Invalid|required|failed|Login|Too many|Error|\(\d{3}\)/;

describe('SPEC-FDE 002 login messages', () => {
  it('maps each kind of failure to a fixed Portuguese text, never the server message (E1, CA7)', () => {
    assert.equal(loginFailureMessage(http(401, 'Invalid credentials')), 'Email ou senha incorretos. Confira os dados e tente novamente.');
    assert.equal(loginFailureMessage(http(400, 'Email and password are required')), 'Verifique o email e a senha informados e tente novamente.');
    assert.equal(loginFailureMessage(new NetworkError()), 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.');
    for (const failure of [http(500, 'Login failed'), http(503, 'Service Unavailable'), http(418, 'teapot'), new Error('Resposta inválida do servidor. Tente novamente.'), new Error('Invalid authentication response'), 'raw', null]) {
      assert.equal(loginFailureMessage(failure), loginMessages.unexpected);
    }
    for (const failure of [http(401, 'Invalid credentials'), http(400, 'Bad Request'), http(429, 'Too many login attempts', 30), http(500, 'Login failed at db.internal')]) {
      const text = loginFailureMessage(failure);
      assert.doesNotMatch(text, english, text);
      assert.ok(!text.includes(failure.message));
    }
  });

  it('tells how long to wait after too many attempts', () => {
    assert.equal(loginFailureMessage(http(429, 'Too many login attempts', 1)), 'Muitas tentativas. Aguarde 1 segundo e tente novamente.');
    assert.equal(loginFailureMessage(http(429, 'Too many login attempts', 45)), 'Muitas tentativas. Aguarde 45 segundos e tente novamente.');
    assert.equal(loginFailureMessage(http(429, 'Too many login attempts', 900)), 'Muitas tentativas. Aguarde 15 minutos e tente novamente.');
    assert.equal(loginFailureMessage(http(429, 'Too many login attempts')), 'Muitas tentativas. Aguarde alguns instantes e tente novamente.');
  });

  it('only 401 sends the user back to the password (CA1, CA2)', () => {
    assert.equal(isInvalidCredentials(http(401, 'Invalid credentials')), true);
    for (const failure of [http(400, 'x'), http(429, 'x'), http(500, 'x'), new NetworkError(), new Error('x')]) assert.equal(isInvalidCredentials(failure), false);
  });

  it('validates required fields, email format and backend limits before sending (E2, CA3, CA4)', () => {
    assert.deepEqual(validateLogin({ email: '', password: '' }), { email: 'Informe seu email.', password: 'Informe sua senha.' });
    assert.deepEqual(validateLogin({ email: '   ', password: 'x' }), { email: 'Informe seu email.' });
    for (const email of ['nome@', 'nome', '@empresa.com', 'nome@empresa', 'a b@empresa.com', `${'a'.repeat(250)}@x.com`]) {
      assert.deepEqual(validateLogin({ email, password: 'x' }), { email: 'Informe um email válido, por exemplo nome@empresa.com.' }, email);
    }
    assert.deepEqual(validateLogin({ email: 'nome@empresa.com', password: 'x'.repeat(1025) }), { password: 'A senha pode ter no máximo 1024 caracteres.' });
    // Login does not apply the sign-up rule of 8 characters: the server answers with the generic 401.
    assert.deepEqual(validateLogin({ email: ' Nome@Empresa.com ', password: 'curta' }), {});
  });
});

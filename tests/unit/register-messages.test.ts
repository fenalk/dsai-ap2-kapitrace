// SPEC-FDE 003 — sign-up field rules (E2, CA2, CA3, CA8), password rule (E3, CA4) and server texts (E4, CA6).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, NetworkError } from '../../src/frontend/src/lib/api';
import { passwordRuleMet, registerFailure, registerMessages, validateRegister, validateRegisterField } from '../../src/frontend/src/lib/register-messages';

const http = (status: number, error: string) => new ApiError(error, status, { error }, null);
const english = /Valid|required|exists|failed|Password|characters|Error|\(\d{3}\)/;

describe('SPEC-FDE 003 sign-up rules', () => {
  it('reports empty required fields in Portuguese and leaves the name optional (CA2)', () => {
    assert.deepEqual(validateRegister({ name: '', email: '', password: '' }), { email: 'Informe seu email.', password: 'Informe uma senha.' });
    assert.deepEqual(validateRegister({ name: '   ', email: '  ', password: '' }), { email: 'Informe seu email.', password: 'Informe uma senha.' });
  });

  it('checks the email format, the 8-character minimum and the backend limits (CA3, CA8)', () => {
    for (const email of ['nome@', 'nome', 'nome@empresa', 'a b@empresa.com', `${'a'.repeat(250)}@x.com`]) {
      assert.equal(validateRegisterField('email', email), 'Informe um email válido, por exemplo nome@empresa.com.', email);
    }
    assert.equal(validateRegisterField('password', '1234567'), 'A senha precisa ter pelo menos 8 caracteres.');
    assert.equal(validateRegisterField('password', '12345678'), undefined);
    assert.equal(validateRegisterField('password', 'p'.repeat(1024)), undefined);
    assert.equal(validateRegisterField('password', 'p'.repeat(1025)), 'A senha pode ter no máximo 1024 caracteres.');
    assert.equal(validateRegisterField('name', ` ${'n'.repeat(100)} `), undefined);
    assert.equal(validateRegisterField('name', 'n'.repeat(101)), 'O nome pode ter no máximo 100 caracteres.');
    assert.deepEqual(validateRegister({ name: 'Ana', email: ' Ana@Empresa.com ', password: '12345678' }), {});
  });

  it('meets the password rule exactly at 8 characters (CA4)', () => {
    assert.equal(passwordRuleMet(7), false);
    assert.equal(passwordRuleMet(8), true);
    assert.equal(registerMessages.passwordRule, 'Mínimo de 8 caracteres.');
  });

  it('maps server failures to fixed Portuguese texts, never the server message (E4, CA6)', () => {
    assert.deepEqual(registerFailure(http(400, 'Valid email address is required')), { field: 'email', text: 'Informe um email válido.' });
    assert.deepEqual(registerFailure(http(400, 'Password must be at least 8 characters long')), { field: 'password', text: 'A senha precisa ter pelo menos 8 caracteres.' });
    assert.deepEqual(registerFailure(http(400, 'User already exists')), { text: registerMessages.accountExists });
    // A changed or new backend text falls back to the generic 400.
    for (const error of ['Password must be at most 1024 characters long', 'Name must be at most 100 characters long', 'Email is invalid']) {
      assert.deepEqual(registerFailure(http(400, error)), { text: 'Verifique os dados informados.' }, error);
    }
    assert.deepEqual(registerFailure(new NetworkError()), { text: 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.' });
    for (const failure of [http(500, 'Registration failed'), http(503, 'Service Unavailable'), new Error('Resposta inválida do servidor. Tente novamente.'), null]) {
      assert.deepEqual(registerFailure(failure), { text: 'Não foi possível criar a conta agora. Tente novamente em alguns instantes.' });
    }
    for (const text of Object.values(registerMessages)) assert.doesNotMatch(text, english, text);
  });

  it('uses the "Entrar" tab name in the existing-account hint', () => {
    assert.match(registerMessages.accountExists, /aba 'Entrar'/);
  });
});

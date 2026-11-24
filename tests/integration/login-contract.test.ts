// SPEC-FDE 002 — contract between the client-side login rules (lib/login-messages.ts) and the backend login.
// At each boundary the client must accept exactly what the server accepts (401 for unknown credentials)
// and reject exactly what the server rejects (400), so neither side blocks what the other allows.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestServer } from '../test-helper';
import { validateLogin } from '../../src/frontend/src/lib/login-messages';

const domain = '@empresa.com';
const emailOf = (length: number) => `${'a'.repeat(length - domain.length)}${domain}`;
const cases: { label: string; email: string; password: string }[] = [
  { label: 'email with 254 characters', email: emailOf(254), password: 'WrongTestOnly-2026!' },
  { label: 'email with 255 characters', email: emailOf(255), password: 'WrongTestOnly-2026!' },
  { label: 'password with 1024 characters', email: 'contract@empresa.com', password: 'p'.repeat(1024) },
  { label: 'password with 1025 characters', email: 'contract@empresa.com', password: 'p'.repeat(1025) },
  { label: 'email without domain dot', email: 'nome@empresa', password: 'WrongTestOnly-2026!' },
  { label: 'email with spaces around it', email: '  contract@empresa.com  ', password: 'WrongTestOnly-2026!' },
  { label: 'empty password', email: 'contract@empresa.com', password: '' }
];

describe('Login rules contract: client validation matches the backend (SPEC-FDE 002)', () => {
  let server: TestServer;
  before(async () => { server = await startTestServer(); });
  after(async () => { await server.close(); });

  for (const { label, email, password } of cases) {
    it(label, async () => {
      const res = await server.fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      assert.ok([400, 401].includes(res.status), `unexpected status ${res.status}`);
      const clientAccepts = Object.keys(validateLogin({ email, password })).length === 0;
      assert.equal(clientAccepts, res.status === 401, `client ${clientAccepts ? 'accepts' : 'rejects'}, server answered ${res.status}`);
    });
  }
});

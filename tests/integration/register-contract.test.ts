// SPEC-FDE 003 — contract between the client-side sign-up rules (lib/register-messages.ts) and the backend register.
// At each boundary the client must accept exactly what the server accepts (201) and reject exactly what it
// rejects (400), so neither side blocks what the other allows (E2, E7, CA11).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestServer } from '../test-helper';
import { validateRegister } from '../../src/frontend/src/lib/register-messages';

let sequence = 0;
const emailOf = (length: number) => {
  const domain = `@r${Date.now()}${++sequence}.com`;
  return `${'a'.repeat(length - domain.length)}${domain}`;
};
const unique = () => `contract-${Date.now()}-${++sequence}@empresa.com`;
const password = 'RegisterTestOnly-2026!';
const cases: { label: string; name: string; email: () => string; password: string }[] = [
  { label: 'email with 254 characters', name: '', email: () => emailOf(254), password },
  { label: 'email with 255 characters', name: '', email: () => emailOf(255), password },
  { label: 'password with 7 characters', name: '', email: unique, password: 'p'.repeat(7) },
  { label: 'password with 8 characters', name: '', email: unique, password: 'p'.repeat(8) },
  { label: 'password with 1024 characters', name: '', email: unique, password: 'p'.repeat(1024) },
  { label: 'password with 1025 characters', name: '', email: unique, password: 'p'.repeat(1025) },
  { label: 'name with 100 characters', name: 'n'.repeat(100), email: unique, password },
  { label: 'name with 101 characters', name: 'n'.repeat(101), email: unique, password },
  { label: 'email without domain dot', name: '', email: () => 'nome@empresa', password }
];

describe('Sign-up rules contract: client validation matches the backend (SPEC-FDE 003)', () => {
  let server: TestServer;
  before(async () => { server = await startTestServer(); });
  after(async () => { await server.close(); });

  for (const { label, name, email: makeEmail, password: secret } of cases) {
    it(label, async () => {
      const email = makeEmail();
      const res = await server.fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password: secret }) });
      assert.ok([201, 400].includes(res.status), `unexpected status ${res.status}`);
      const clientAccepts = Object.keys(validateRegister({ name, email, password: secret })).length === 0;
      assert.equal(clientAccepts, res.status === 201, `client ${clientAccepts ? 'accepts' : 'rejects'}, server answered ${res.status}`);
    });
  }
});

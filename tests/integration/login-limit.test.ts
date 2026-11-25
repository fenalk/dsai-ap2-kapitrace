// SPEC-FDE 007 — failed-login limit (E1) and equivalent timing for unknown emails (E2).
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, type TestServer } from '../test-helper';
import { resetLoginLimits } from '../../src/backend/src/middleware/login-limit';

const settings = ['LOGIN_MAX_FAILURES_PER_ACCOUNT', 'LOGIN_MAX_FAILURES_PER_IP', 'LOGIN_WINDOW_SECONDS'];
const password = 'CorrectHorseBattery9';
let sequence = 0;
const newEmail = () => `limit_${Date.now()}_${++sequence}@kapitrace.sec`;

describe('Login attempt limit and timing (SPEC-FDE 007)', () => {
  let server: TestServer;
  const original = Object.fromEntries(settings.map(name => [name, process.env[name]]));
  const login = (email: unknown, secret: unknown, headers: Record<string, string> = {}) => server.fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ email, password: secret })
  });
  const register = async () => {
    const email = newEmail();
    const res = await server.fetch('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    assert.equal(res.status, 201);
    return email;
  };
  const limitsTo = (account: number, ip: number, windowSeconds = 900) => {
    process.env.LOGIN_MAX_FAILURES_PER_ACCOUNT = String(account);
    process.env.LOGIN_MAX_FAILURES_PER_IP = String(ip);
    process.env.LOGIN_WINDOW_SECONDS = String(windowSeconds);
  };

  before(async () => { server = await startTestServer(); });
  after(async () => {
    for (const [name, value] of Object.entries(original)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
    await server.close();
  });
  beforeEach(() => { resetLoginLimits(); limitsTo(3, 100); });

  it('blocks an account after the limit, even with the right password, with Retry-After (CA1, CA2)', async () => {
    const email = await register();
    for (let i = 0; i < 3; i++) assert.equal((await login(email, 'wrong-password')).status, 401);
    const blocked = await login(email, password);
    assert.equal(blocked.status, 429);
    assert.deepEqual(await blocked.json(), { error: 'Too many login attempts' });
    const wait = Number(blocked.headers.get('retry-after'));
    assert.ok(Number.isInteger(wait) && wait >= 1 && wait <= 900, `Retry-After ${wait}`);
    assert.equal(blocked.headers.get('cache-control'), 'no-store');
    // Another account from the same IP is not affected by this account's key.
    const other = await register();
    assert.equal((await login(other, password)).status, 200);
  });

  it('blocks an IP that fails across many emails (CA3)', async () => {
    limitsTo(100, 4);
    for (let i = 0; i < 4; i++) assert.equal((await login(newEmail(), 'wrong-password')).status, 401);
    assert.equal((await login(newEmail(), 'wrong-password')).status, 429);
    assert.equal((await login(await register(), password)).status, 429);
  });

  it('a success clears the account counter (CA4)', async () => {
    const email = await register();
    for (let i = 0; i < 2; i++) assert.equal((await login(email, 'wrong-password')).status, 401);
    assert.equal((await login(email, password)).status, 200);
    for (let i = 0; i < 2; i++) assert.equal((await login(email, 'wrong-password')).status, 401);
    assert.equal((await login(email, password)).status, 200);
  });

  it('unblocks when the window ends (CA5)', async () => {
    limitsTo(1, 100, 1);
    const email = await register();
    assert.equal((await login(email, 'wrong-password')).status, 401);
    assert.equal((await login(email, password)).status, 429);
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.equal((await login(email, password)).status, 200);
  });

  it('does not count malformed requests (CA6)', async () => {
    limitsTo(1, 1);
    const email = await register();
    for (const body of [[email, ''], ['not-an-email', password], [email, 'x'.repeat(1025)], [42, password]] as const) {
      assert.equal((await login(body[0], body[1])).status, 400);
    }
    assert.equal((await login(email, password)).status, 200);
  });

  it('exposes Retry-After to the browser on 429 (CA7)', async () => {
    const email = await register();
    for (let i = 0; i < 3; i++) await login(email, 'wrong-password');
    const blocked = await login(email, password, { Origin: 'http://localhost:3000' });
    assert.equal(blocked.status, 429);
    assert.match(blocked.headers.get('access-control-expose-headers') || '', /Retry-After/i);
  });

  it('parallel failures cannot exceed the limit', async () => {
    const email = await register();
    const statuses = (await Promise.all(Array.from({ length: 8 }, () => login(email, 'wrong-password')))).map(res => res.status);
    assert.equal(statuses.filter(status => status === 401).length, 3);
    assert.equal(statuses.filter(status => status === 429).length, 5);
  });

  it('answers unknown email and wrong password the same way, in equivalent time (CA8, CA9)', async () => {
    limitsTo(1000, 100000);
    const email = await register();
    const missing = await login(newEmail(), 'wrong-password');
    const wrong = await login(email, 'wrong-password');
    assert.equal(missing.status, 401); assert.equal(wrong.status, 401);
    assert.deepEqual(await missing.json(), await wrong.json());
    assert.equal(missing.headers.get('content-type'), wrong.headers.get('content-type'));
    const timed = async (target: string) => { const start = performance.now(); await (await login(target, 'wrong-password')).text(); return performance.now() - start; };
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const missingTimes: number[] = []; const wrongTimes: number[] = [];
    for (let i = 0; i < 5; i++) { missingTimes.push(await timed(newEmail())); wrongTimes.push(await timed(email)); }
    assert.ok(median(missingTimes) >= 0.5 * median(wrongTimes), `unknown ${median(missingTimes).toFixed(1)}ms vs wrong ${median(wrongTimes).toFixed(1)}ms`);
  });
});

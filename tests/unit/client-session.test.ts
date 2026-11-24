import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { api, AuthenticationError } from '../../src/frontend/src/lib/api';
import { setSessionToken, getSessionToken, hasSession, subscribeSession, serverSessionSnapshot, signOut, expireSession, getSessionEndReason, getSessionEmail } from '../../src/frontend/src/lib/session';
import { signTestJwt, testClaims } from '../jwt-fixtures';
const nativeFetch = globalThis.fetch;
const token = signTestJwt(testClaims(), randomBytes(48).toString('hex'));
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
describe('Client session and mandatory Bearer transport', () => {
  beforeEach(() => setSessionToken(null));
  afterEach(() => { globalThis.fetch = nativeFetch; setSessionToken(null); });
  it('keeps a private memory session, reports no server session and notifies/unsubscribes', () => {
    let updates = 0;
    const unsubscribe = subscribeSession(() => updates++);
    setSessionToken(token); assert.equal(hasSession(), true); assert.equal(serverSessionSnapshot(), false); assert.equal(updates, 1);
    unsubscribe(); setSessionToken(null); assert.equal(hasSession(), false); assert.equal(updates, 1);
    assert.throws(() => setSessionToken('not-a-token'));
  });
  it('does not call protected endpoints without a token', async () => {
    let calls = 0;
    globalThis.fetch = async () => { calls++; return json({}); };
    for (const path of ['/api/lookup/ip/8.8.8.8','/api/watchlist','/api/auth/refresh','/api/lookup?type=ip']) await assert.rejects(api(path), AuthenticationError);
    assert.equal(calls, 0);
  });
  it('injects the current token automatically and replaces divergent caller headers', async () => {
    setSessionToken(token);
    let calls = 0;
    globalThis.fetch = async (_input, init) => {
      calls++;
      assert.ok(new Headers(init?.headers).get('Authorization') === `Bearer ${token}`, 'Expected current memory-session Bearer');
      assert.equal(init?.cache, 'no-store');
      return json({ ok: true });
    };
    for (const path of ['/api/lookup/ip/8.8.8.8','/api/watchlist','/api/auth/refresh']) assert.deepEqual(await api(path, { headers: { Authorization: 'Bearer stale-placeholder' } }), { ok: true });
    assert.equal(calls, 3);
  });
  it('clears memory on protected 401 even when body is invalid JSON', async () => {
    setSessionToken(token);
    globalThis.fetch = async () => new Response('invalid JSON', { status: 401 });
    await assert.rejects(api('/api/lookup/ip/8.8.8.8'), AuthenticationError);
    assert.equal(hasSession(), false);
  });
  it('does not clear a newer login when an older request returns 401', async () => {
    setSessionToken(token);
    let complete: (response: Response) => void;
    globalThis.fetch = () => new Promise(resolve => { complete = resolve; });
    const request = api('/api/watchlist');
    const current = signTestJwt(testClaims({ id: 'new-login-user' }), randomBytes(48).toString('hex'));
    setSessionToken(current);
    complete!(json({}, 401));
    await assert.rejects(request, AuthenticationError);
    assert.ok(getSessionToken() === current, 'New session must survive an old request failure');
  });
  it('retains session for network, rate limits and server failures', async () => {
    setSessionToken(token);
    for (const status of [429,500,503]) {
      globalThis.fetch = async () => json({ error: 'Temporary failure' }, status);
      await assert.rejects(api('/api/watchlist'));
      assert.ok(getSessionToken() === token);
    }
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    await assert.rejects(api('/api/watchlist'), /Não foi possível conectar/);
    assert.ok(getSessionToken() === token);
  });
  it('records why the session ended: logout, expired token, or a new login (SPEC-FDE 006 F2.4/F2.5)', async () => {
    setSessionToken(token);
    assert.equal(getSessionEndReason(), null);
    signOut();
    assert.equal(hasSession(), false);
    assert.equal(getSessionEndReason(), 'logout');
    setSessionToken(token);
    assert.equal(getSessionEndReason(), null);
    globalThis.fetch = async () => json({ error: 'Unauthorized' }, 401);
    await assert.rejects(api('/api/watchlist'), AuthenticationError);
    assert.equal(getSessionEndReason(), 'expired');
    signOut();
    assert.equal(getSessionEndReason(), 'expired', 'Signing out without a session keeps the previous reason');
  });
  it('expires only the token that failed', () => {
    setSessionToken(token);
    expireSession('aaa.bbb.ccc');
    assert.ok(getSessionToken() === token);
    expireSession(null);
    assert.ok(getSessionToken() === token);
    expireSession(token);
    assert.equal(hasSession(), false);
  });
  it('reads the e-mail claim for display and tolerates malformed payloads', () => {
    assert.equal(getSessionEmail(), null);
    setSessionToken(token);
    assert.equal(getSessionEmail(), 'unit@example.com');
    const accented = signTestJwt(testClaims({ email: 'análise@example.com' }), randomBytes(48).toString('hex'));
    setSessionToken(accented);
    assert.equal(getSessionEmail(), 'análise@example.com');
    setSessionToken('e30.bm90LWpzb24.c2ln');
    assert.equal(getSessionEmail(), null);
    setSessionToken(signTestJwt(testClaims({ email: 42 }), 'k'));
    assert.equal(getSessionEmail(), null);
    // Unsigned display value: anything that is not a plain e-mail is dropped.
    for (const forged of ['<b>admin</b>', 'two words@example.com', 'no-at-sign', 'x@nodot']) {
      setSessionToken(signTestJwt(testClaims({ email: forged }), 'k'));
      assert.equal(getSessionEmail(), null, forged);
    }
  });
  it('allows login without existing session and handles malformed JSON', async () => {
    globalThis.fetch = async (_input, init) => { assert.equal(new Headers(init?.headers).has('Authorization'), false); return json({ success: true }); };
    assert.deepEqual(await api('/api/auth/login', { method: 'POST', body: '{}' }), { success: true });
    globalThis.fetch = async () => new Response('not JSON');
    await assert.rejects(api('/api/auth/login'), /Resposta inválida/);
  });
});

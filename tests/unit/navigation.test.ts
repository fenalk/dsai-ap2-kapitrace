import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { activeNavKey, afterLoginPath, loginNotice, loginRedirect, safeNextPath } from '../../src/frontend/src/lib/navigation';

// SPEC-FDE 006 F2: navigation and session-redirect rules of the frontend.
describe('safeNextPath (F2.1)', () => {
  it('accepts internal paths with query and hash', () => {
    assert.equal(safeNextPath('/lookup?type=ip&q=8.8.8.8'), '/lookup?type=ip&q=8.8.8.8');
    assert.equal(safeNextPath('/dashboard'), '/dashboard');
    assert.equal(safeNextPath('/lookup#resultado'), '/lookup#resultado');
  });
  it('rejects external, protocol-relative, backslash and scheme destinations', () => {
    for (const value of ['https://evil.example/', '//evil.example/path', '/\\evil.example', '\\\\evil.example', 'javascript:alert(1)', 'lookup', ' /lookup']) {
      assert.equal(safeNextPath(value), null, value);
    }
  });
  it('rejects control characters, empty, oversized and non-string values', () => {
    assert.equal(safeNextPath('/lookup\n//evil'), null);
    assert.equal(safeNextPath('/look\tup'), null);
    assert.equal(safeNextPath(''), null);
    assert.equal(safeNextPath(`/${'a'.repeat(2048)}`), null);
    assert.equal(safeNextPath(null), null);
    assert.equal(safeNextPath(undefined), null);
  });
  it('never sends the user back to /login', () => {
    assert.equal(safeNextPath('/login'), null);
    assert.equal(safeNextPath('/login?next=/lookup'), null);
    assert.equal(safeNextPath('/login/'), null);
  });
  it('falls back to /lookup after login', () => {
    assert.equal(afterLoginPath('/dashboard'), '/dashboard');
    assert.equal(afterLoginPath('https://evil.example'), '/lookup');
    assert.equal(afterLoginPath(null), '/lookup');
  });
});

describe('loginRedirect (F2.1, F2.4, F2.5)', () => {
  it('keeps the destination when there is no session', () => {
    assert.equal(loginRedirect('/lookup?type=ip&q=8.8.8.8', null), `/login?next=${encodeURIComponent('/lookup?type=ip&q=8.8.8.8')}`);
  });
  it('marks an expired session and keeps the destination', () => {
    const url = new URL(loginRedirect('/dashboard', 'expired'), 'http://local');
    assert.equal(url.pathname, '/login');
    assert.equal(url.searchParams.get('next'), '/dashboard');
    assert.equal(url.searchParams.get('expirou'), '1');
  });
  it('drops the destination on logout', () => {
    assert.equal(loginRedirect('/dashboard', 'logout'), '/login?saiu=1');
  });
  it('omits an unsafe destination', () => {
    assert.equal(loginRedirect('//evil.example', null), '/login');
  });
});

describe('loginNotice', () => {
  const params = (query: string) => new URLSearchParams(query);
  it('informs logout and warns about expiration, expiration first', () => {
    assert.deepEqual(loginNotice(params('saiu=1')), { tone: 'info', text: 'Você saiu da sua conta.' });
    assert.deepEqual(loginNotice(params('expirou=1&next=%2Flookup')), { tone: 'warning', text: 'Sua sessão expirou. Entre novamente.' });
    assert.equal(loginNotice(params('saiu=1&expirou=1'))?.tone, 'warning');
    assert.equal(loginNotice(params('')), null);
    assert.equal(loginNotice(params('saiu=true')), null);
  });
});

describe('activeNavKey (F2.3)', () => {
  it('maps the current screen to one navigation item', () => {
    assert.equal(activeNavKey('/dashboard', null), 'watchlist');
    assert.equal(activeNavKey('/lookup', 'domain'), 'domain');
    assert.equal(activeNavKey('/lookup', 'hash'), 'hash');
    assert.equal(activeNavKey('/lookup', 'ip'), 'ip');
    assert.equal(activeNavKey('/lookup', null), 'ip');
    assert.equal(activeNavKey('/lookup', 'email'), 'ip');
    assert.equal(activeNavKey('/login', null), null);
    assert.equal(activeNavKey('/', 'domain'), null);
  });
});

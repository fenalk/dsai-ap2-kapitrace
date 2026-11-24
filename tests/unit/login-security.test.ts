// SPEC-FDE 007 — sanitized auth error logs (CA10) and login limit configuration (CA11).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { format_route_error } from '../../src/backend/src/shared/error-log';
import { setting } from '../../src/backend/src/shared/config';

describe('SPEC-FDE 007 login security helpers', () => {
  it('logs only the route, error name and code (CA10)', () => {
    const error = Object.assign(new Error('Can not reach database at db.internal:5432 password=fake-secret'), {
      name: 'PrismaClientInitializationError', code: 'P1001', meta: { target: 'User.email', host: 'db.internal' }
    });
    const line = format_route_error('auth.login', error);
    assert.equal(line, 'auth.login failed: PrismaClientInitializationError code=P1001');
    for (const leaked of ['db.internal', 'fake-secret', 'User.email', 'at ']) assert.ok(!line.includes(leaked), leaked);
  });

  it('falls back to a generic category for unexpected or unsafe values', () => {
    assert.equal(format_route_error('auth.register', 'raw string with secret'), 'auth.register failed: Error');
    assert.equal(format_route_error('auth.refresh', null), 'auth.refresh failed: Error');
    assert.equal(format_route_error('auth.login', { name: 'x\nInjected: line', code: 'P2002; DROP' }), 'auth.login failed: Error');
    assert.equal(format_route_error('auth.login', { name: 'TypeError', code: 42 }), 'auth.login failed: TypeError');
  });

  it('rejects invalid login limit settings without echoing the value (CA11)', () => {
    const original = process.env.LOGIN_WINDOW_SECONDS;
    try {
      for (const value of ['0', 'abc', '86401', '1.5']) {
        process.env.LOGIN_WINDOW_SECONDS = value;
        assert.throws(() => setting('LOGIN_WINDOW_SECONDS', 900, 1, 86400),
          (error: unknown) => error instanceof Error && error.message === 'Invalid configuration: LOGIN_WINDOW_SECONDS');
      }
      delete process.env.LOGIN_WINDOW_SECONDS;
      assert.equal(setting('LOGIN_WINDOW_SECONDS', 900, 1, 86400), 900);
    } finally {
      if (original === undefined) delete process.env.LOGIN_WINDOW_SECONDS; else process.env.LOGIN_WINDOW_SECONDS = original;
    }
  });
});

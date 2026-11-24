import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { detectIndicatorType, normalizeIndicator, refang, sentValueNotice } from '../../src/frontend/src/lib/indicator';
import { coveragePercent, expiryText, groupSources, originLabel, relativeTime, retryDelay, riskBand } from '../../src/frontend/src/lib/lookup-result';
import { addRecentLookup, getRecentLookups, rememberLookup, MAX_RECENT_LOOKUPS } from '../../src/frontend/src/lib/recent-lookups';
import { setSessionToken, signOut } from '../../src/frontend/src/lib/session';
import { signTestJwt, testClaims } from '../jwt-fixtures';

const sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// SPEC-FDE 006 F4.1: type detection while typing.
describe('detectIndicatorType (F4.1)', () => {
  it('detects IPv4, IPv6 and URLs whose host is an IP as IP', () => {
    for (const value of ['8.8.8.8', ' 1.1.1.1 ', '2001:4860:4860::8888', '8.8.8[.]8', 'http://8.8.8.8:8080/x', 'https://[2001:db8::1]/']) assert.equal(detectIndicatorType(value), 'ip', value);
  });
  it('detects MD5, SHA-1 and SHA-256 as hash', () => {
    for (const value of ['d41d8cd98f00b204e9800998ecf8427e', 'da39a3ee5e6b4b0d3255bfef95601890afd80709', sha256, sha256.toUpperCase()]) assert.equal(detectIndicatorType(value), 'hash', value);
  });
  it('treats everything else, including URLs with a name, as domain', () => {
    for (const value of ['example.com', 'hxxps://Exemplo[.]com/path', 'https://user:pass@sub.example.org:8443/a?b', 'abc', '']) assert.equal(detectIndicatorType(value), 'domain', value);
  });
  it('does not take a URL scheme for an IPv6 colon', () => {
    assert.equal(detectIndicatorType('https://example.com'), 'domain');
  });
});

// SPEC-FDE 006 F4.2: normalization before sending (frontend only).
describe('normalizeIndicator (F4.2)', () => {
  it('refangs the usual notations', () => {
    assert.equal(refang('8.8.8[.]8'), '8.8.8.8');
    assert.equal(refang('a(.)b{.}c[dot]d[DOT]e'), 'a.b.c.d.e');
    assert.equal(refang('hxxp://x'), 'http://x');
    assert.equal(refang('HXXPS[:]//x'), 'https://x');
  });
  it('reduces a URL to its host, without port, credentials or brackets', () => {
    assert.equal(normalizeIndicator('hxxps://Exemplo[.]com/path', 'domain'), 'exemplo.com');
    assert.equal(normalizeIndicator('https://user:pass@Sub.Example.org:8443/a?b#c', 'domain'), 'sub.example.org');
    assert.equal(normalizeIndicator('http://8.8.8.8:8080/x', 'ip'), '8.8.8.8');
    assert.equal(normalizeIndicator('https://[2001:db8::1]:443/', 'ip'), '2001:db8::1');
  });
  it('lower-cases domains and drops the trailing dot, trims every type', () => {
    assert.equal(normalizeIndicator('  Example.COM.  ', 'domain'), 'example.com');
    assert.equal(normalizeIndicator(' 8.8.8.8 ', 'ip'), '8.8.8.8');
    assert.equal(normalizeIndicator(` ${sha256.toUpperCase()} `, 'hash'), sha256.toUpperCase());
  });
  it('leaves invalid values for the backend to reject', () => {
    assert.equal(normalizeIndicator('999.1.2.3', 'ip'), '999.1.2.3');
    assert.equal(normalizeIndicator('http://', 'domain'), 'http://');
  });
  it('announces the sent value only when it differs from what was typed', () => {
    assert.equal(sentValueNotice('hxxps://Exemplo[.]com/path', 'domain'), 'exemplo.com');
    assert.equal(sentValueNotice('  8.8.8.8 ', 'ip'), null);
    assert.equal(sentValueNotice('example.com', 'domain'), null);
    assert.equal(sentValueNotice('   ', 'domain'), null);
  });
});

// SPEC-FDE 006 F4.6/F4.7: risk band, Portuguese label and description.
describe('riskBand (F4.6/F4.7)', () => {
  it('maps each riskLevel to its band and Portuguese label', () => {
    assert.deepEqual([riskBand('LOW'), riskBand('SUSPICIOUS'), riskBand('HIGH'), riskBand('CRITICAL')].map(band => [band?.tone, band?.label]), [['low', 'Baixo'], ['suspicious', 'Suspeito'], ['high', 'Alto'], ['critical', 'Crítico']]);
  });
  it('has a Portuguese description for every band and nothing for unknown or missing levels', () => {
    for (const level of ['LOW', 'SUSPICIOUS', 'HIGH', 'CRITICAL']) assert.match(riskBand(level)!.description, /evidência|sinais/);
    assert.equal(riskBand(null), null);
    assert.equal(riskBand(undefined), null);
    assert.equal(riskBand('UNKNOWN'), null);
  });
});

// SPEC-FDE 006 F4.8/F4.9: coverage, origin and dates.
describe('result facts (F4.8/F4.9)', () => {
  it('never turns a missing analysis into 0%', () => {
    assert.equal(coveragePercent(null), null);
    assert.equal(coveragePercent(undefined), null);
    assert.equal(coveragePercent({ confidencePercentage: Number.NaN }), null);
    assert.equal(coveragePercent({ confidencePercentage: 0 }), 0);
    assert.equal(coveragePercent({ confidencePercentage: 66.6 }), 67);
    assert.equal(coveragePercent({ confidencePercentage: 140 }), 100);
  });
  it('labels the origin and keeps unknown values as they are', () => {
    assert.equal(originLabel('api'), 'Consulta nova');
    assert.equal(originLabel('cache'), 'Do cache');
    assert.equal(originLabel('other'), 'other');
  });
  it('formats relative time in the past and in the future', () => {
    const now = Date.parse('2026-11-24T12:00:00Z');
    const at = (ms: number) => new Date(now + ms).toISOString();
    assert.equal(relativeTime(at(-30_000), now), 'agora');
    assert.equal(relativeTime(at(-5 * 60_000), now), 'há 5 min');
    assert.equal(relativeTime(at(-(3 * 3600_000 + 40 * 60_000)), now), 'há 3 h');
    assert.equal(relativeTime(at(21 * 3600_000), now), 'em 21 h');
    assert.equal(relativeTime(at(-3 * 86400_000), now), 'há 3 d');
    assert.equal(relativeTime('not a date', now), null);
  });
  it('describes the validity of the cached result', () => {
    const now = Date.parse('2026-11-24T12:00:00Z');
    assert.equal(expiryText(new Date(now + 21 * 3600_000).toISOString(), now), 'expira em 21 h');
    assert.equal(expiryText(new Date(now - 2 * 3600_000).toISOString(), now), 'expirou há 2 h');
    assert.equal(expiryText(new Date(now + 10_000).toISOString(), now), 'expira agora');
    assert.equal(expiryText('', now), null);
  });
});

// SPEC-FDE 006 F4.10: sources grouped by state, in a fixed order.
describe('groupSources (F4.10)', () => {
  it('orders groups as data, failed, not configured, not applicable and drops empty ones', () => {
    const groups = groupSources([
      { name: 'URLSCAN', status: 'not_applicable' }, { name: 'SHODAN', status: 'timeout' }, { name: 'OTX', status: 'not_configured' },
      { name: 'VIRUSTOTAL', status: 'not_found' }, { name: 'ABUSEIPDB', status: 'ok' }, { name: 'GREYNOISE', status: 'rate_limited' }
    ]);
    assert.deepEqual(groups.map(group => [group.key, group.label, group.sources.map(source => source.name)]), [
      ['data', 'Com dados', ['VIRUSTOTAL', 'ABUSEIPDB']],
      ['failed', 'Falharam', ['SHODAN', 'GREYNOISE']],
      ['not_configured', 'Não configuradas', ['OTX']],
      ['not_applicable', 'Não aplicáveis', ['URLSCAN']]
    ]);
    assert.deepEqual(groupSources([{ name: 'ABUSEIPDB', status: 'ok' }]).map(group => group.key), ['data']);
    assert.deepEqual(groupSources([]), []);
  });
});

// SPEC-FDE 006 F4.5: how long "Analisar" stays disabled.
describe('retryDelay (F4.5)', () => {
  it('uses Retry-After on 429 and 503', () => {
    assert.equal(retryDelay(429, 120), 120);
    assert.equal(retryDelay(503, 30, [{ name: 'VIRUSTOTAL', status: 'rate_limited', retryAfter: 90 }]), 30);
  });
  it('falls back to the shortest retryAfter of the sources', () => {
    assert.equal(retryDelay(503, null, [{ name: 'A', status: 'rate_limited', retryAfter: 90 }, { name: 'B', status: 'rate_limited', retryAfter: 45.2 }, { name: 'C', status: 'ok' }]), 46);
  });
  it('has no wait without a hint or for other statuses', () => {
    assert.equal(retryDelay(503, null, [{ name: 'A', status: 'timeout' }]), null);
    assert.equal(retryDelay(429, null), null);
    assert.equal(retryDelay(400, 120), null);
    assert.equal(retryDelay(500, 120), null);
  });
  it('caps absurd waits at 24 h', () => {
    assert.equal(retryDelay(429, 10 ** 9), 86400);
  });
});

// SPEC-FDE 006 F4.14: recent lookups, memory only and bound to the session.
describe('recent lookups (F4.14)', () => {
  afterEach(() => setSessionToken(null));
  it('keeps the newest first, without duplicates, up to 8', () => {
    let list = addRecentLookup([], { type: 'ip', indicator: '8.8.8.8' });
    list = addRecentLookup(list, { type: 'domain', indicator: 'example.com' });
    list = addRecentLookup(list, { type: 'ip', indicator: '8.8.8.8' });
    assert.deepEqual(list.map(item => item.indicator), ['8.8.8.8', 'example.com']);
    assert.equal(addRecentLookup(list, { type: 'domain', indicator: '8.8.8.8' }).length, 3, 'same value with another type is another entry');
    for (let index = 0; index < 20; index++) list = addRecentLookup(list, { type: 'ip', indicator: `1.1.1.${index}` });
    assert.equal(list.length, MAX_RECENT_LOOKUPS);
    assert.equal(list[0].indicator, '1.1.1.19');
  });
  it('remembers only with a session and forgets on sign out or another login', () => {
    const secret = randomBytes(48).toString('hex');
    rememberLookup({ type: 'ip', indicator: '8.8.8.8' });
    assert.deepEqual(getRecentLookups(), []);
    setSessionToken(signTestJwt(testClaims(), secret));
    rememberLookup({ type: 'ip', indicator: '8.8.8.8' });
    assert.equal(getRecentLookups().length, 1);
    signOut();
    assert.deepEqual(getRecentLookups(), []);
    setSessionToken(signTestJwt(testClaims(), secret));
    rememberLookup({ type: 'hash', indicator: sha256 });
    setSessionToken(signTestJwt({ ...testClaims(), email: 'other@example.com' }, secret));
    assert.deepEqual(getRecentLookups(), []);
  });
});

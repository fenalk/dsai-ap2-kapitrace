import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { describeDetails, missingSources, sourceTone, statusText, unavailableMessage, validationMessage } from '../../src/frontend/src/lib/lookup-messages';
import { api, ApiError } from '../../src/frontend/src/lib/api';
import { configuredProviders } from '../../src/backend/src/shared/config';
const nativeFetch = globalThis.fetch;

describe('Lookup presentation (SPEC-FDE 001)', () => {
  afterEach(() => { globalThis.fetch = nativeFetch; });
  it('labels AbuseIPDB and VirusTotal details in Portuguese and keeps unknown keys', () => {
    assert.deepEqual(describeDetails('ABUSEIPDB', { abuseConfidenceScore: 77, totalReports: 12, country: 'US', isp: 'Example ISP' }), ['Confiança de abuso: 77%', 'Denúncias (90 dias): 12', 'País: US', 'Provedor (ISP): Example ISP']);
    assert.deepEqual(describeDetails('VIRUSTOTAL', { malicious: 5, engines: 90, country: 'US', asn: 15169, organization: 'Google LLC', fileType: undefined, extra: 'x' }), ['Detecções maliciosas: 5 de 90 motores', 'País: US', 'ASN: 15169', 'Organização: Google LLC', 'extra: x']);
    assert.deepEqual(describeDetails('VIRUSTOTAL', { malicious: 0, engines: 0 }), ['Detecções maliciosas: 0 de 0 motores']);
    assert.deepEqual(describeDetails('SHODAN', { ports: [22, 443], criticalCves: [] }), ['ports: 22, 443']);
  });
  it('distinguishes consulted, not configured, not applicable and failed sources', () => {
    assert.equal(sourceTone('ok'), 'ok'); assert.equal(sourceTone('not_found'), 'ok');
    assert.equal(sourceTone('not_configured'), 'not_configured'); assert.equal(sourceTone('not_applicable'), 'not_applicable');
    for (const status of ['rate_limited', 'timeout', 'unavailable', 'invalid_response']) assert.equal(sourceTone(status), 'failed');
    assert.equal(statusText({ name: 'VIRUSTOTAL', status: 'rate_limited', retryAfter: 15 }), 'Limite de consultas — tente em 15 s');
    assert.equal(statusText({ name: 'VIRUSTOTAL', status: 'not_found' }), 'Sem registro');
    assert.deepEqual(missingSources([{ name: 'A', status: 'ok' }, { name: 'B', status: 'not_applicable' }, { name: 'C', status: 'rate_limited' }]).map(source => source.name), ['C']);
  });
  it('explains 503 by cause without mentioning a score', () => {
    const notConfigured = [{ name: 'ABUSEIPDB', status: 'not_applicable' }, { name: 'VIRUSTOTAL', status: 'not_configured' }];
    assert.equal(unavailableMessage(notConfigured, null), 'Nenhuma fonte de inteligência está configurada no servidor. Contate o administrador.');
    const limited = [{ name: 'VIRUSTOTAL', status: 'rate_limited', retryAfter: 40 }, { name: 'OTX', status: 'not_configured' }];
    assert.equal(unavailableMessage(limited, 120), 'Limite de consultas do provedor atingido. Tente novamente em 120 s.');
    assert.equal(unavailableMessage(limited, null), 'Limite de consultas do provedor atingido. Tente novamente em 40 s.');
    assert.equal(unavailableMessage([{ name: 'VIRUSTOTAL', status: 'timeout' }], null), 'As fontes de inteligência não responderam. Tente novamente em instantes.');
  });
  it('translates validation errors by type', () => {
    assert.equal(validationMessage('ip', 'Only public IP addresses can be queried'), 'Apenas IPs públicos podem ser consultados.');
    assert.match(validationMessage('hash', 'Invalid indicator or unsupported type'), /^Hash inválido: use MD5 \(32\), SHA-1 \(40\) ou SHA-256 \(64\)/);
    assert.match(validationMessage('domain', 'Invalid domain'), /^Domínio inválido/);
    assert.match(validationMessage('ip', 'Invalid indicator or unsupported type'), /^IP inválido/);
  });
  it('exposes status, body and Retry-After on API errors', async () => {
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Threat intelligence currently unavailable', sources: [] }), { status: 503, headers: { 'Content-Type': 'application/json', 'Retry-After': '30' } });
    await assert.rejects(api('/api/auth/login', { method: 'POST', body: '{}' }), (error: unknown) => error instanceof ApiError && error.status === 503 && error.retryAfter === 30 && Array.isArray(error.body.sources) && error.message === 'Threat intelligence currently unavailable');
  });
  it('reports configured provider names only', () => {
    const keys = ['ABUSEIPDB_API_KEY', 'VIRUSTOTAL_API_KEY', 'SHODAN_API_KEY', 'GREYNOISE_API_KEY', 'OTX_API_KEY', 'URLSCAN_API_KEY', 'IPINFO_TOKEN'];
    const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
    try {
      for (const key of keys) delete process.env[key];
      process.env.ABUSEIPDB_API_KEY = 'test-only-key'; process.env.VIRUSTOTAL_API_KEY = 'test-only-key'; process.env.SHODAN_API_KEY = '   ';
      const names = configuredProviders();
      assert.deepEqual(names, ['ABUSEIPDB', 'VIRUSTOTAL']);
      assert.ok(!names.join().includes('test-only-key'));
    } finally { for (const [key, value] of Object.entries(original)) if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  });
});

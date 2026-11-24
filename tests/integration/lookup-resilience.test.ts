import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, loginTestUser, withBearer, prisma, type TestServer } from '../test-helper';
import { calls, responses, json, resetFixtures } from '../http-fixtures';
import { resetHttpState } from '../../src/backend/src/modules/intelligence/http';
const host = 'www.virustotal.com';
const keys = ['ABUSEIPDB_API_KEY','VIRUSTOTAL_API_KEY','SHODAN_API_KEY','GREYNOISE_API_KEY','OTX_API_KEY','URLSCAN_API_KEY','IPINFO_TOKEN'];
let sequence = 0;
const domain = () => `resilience-${++sequence}.example.com`;
describe('Lookup resilience at external HTTP boundary', () => {
  let server: TestServer;
  let lookup: TestServer['fetch'];
  // beforeEach rewrites provider settings; restore the original environment after the suite.
  const settings = [...keys, 'EXTERNAL_API_TIMEOUT_MS', 'LOOKUP_DEADLINE_MS', 'VIRUSTOTAL_MIN_INTERVAL_MS', 'EXTERNAL_API_MAX_CONCURRENCY', 'LOOKUP_REQUESTS_PER_MINUTE'];
  const original = Object.fromEntries(settings.map(name => [name, process.env[name]]));
  before(async () => { server = await startTestServer();
    lookup = withBearer(server, await loginTestUser(server)); });
  after(async () => {
    for (const [name, value] of Object.entries(original)) if (value === undefined) delete process.env[name]; else process.env[name] = value;
    await server.close();
  });
  beforeEach(() => {
    resetFixtures(); resetHttpState();
    for (const key of keys) delete process.env[key];
    process.env.VIRUSTOTAL_API_KEY = 'test-only-key';
    process.env.EXTERNAL_API_TIMEOUT_MS = '5000';
    process.env.LOOKUP_DEADLINE_MS = '10000';
    process.env.VIRUSTOTAL_MIN_INTERVAL_MS = '0';
    process.env.EXTERNAL_API_MAX_CONCURRENCY = '8';
    process.env.LOOKUP_REQUESTS_PER_MINUTE = '10000';
  });
  it('uses one outbound request for concurrent identical misses, and none on HIT', async () => {
    const indicator = domain();
    responses.set(host, async () => { await new Promise(resolve => setTimeout(resolve, 40)); return json({ data: { attributes: { last_analysis_stats: { malicious: 1, harmless: 1 } } } }); });
    const results = await Promise.all(Array.from({ length: 8 }, () => lookup(`/api/lookup/domain/${indicator}`)));
    for (const res of results) assert.equal(res.status, 200);
    assert.equal(calls.length, 1);
    const first = await results[0].json();
    const hit = await (await lookup(`/api/lookup/domain/${indicator}`)).json();
    assert.equal(calls.length, 1);
    assert.equal(hit.source, 'cache'); assert.deepEqual(hit.analysis, first.analysis);
  });
  it('ignores mock-era/corrupt caches and refreshes expired real caches', async () => {
    const indicator = domain();
    await prisma.domainCache.create({ data: { domain: indicator, threatScore: 99, data: '{broken' } });
    const fresh = await (await lookup(`/api/lookup/domain/${indicator}`)).json();
    assert.equal(fresh.source, 'api'); assert.equal(fresh.threatScore, 80);
    const row = await prisma.domainCache.findUniqueOrThrow({ where: { domain: indicator } });
    const data = JSON.parse(row.data);
    data.cachedAt = new Date(Date.now() - 600000).toISOString(); data.expiresAt = new Date(Date.now() - 1000).toISOString();
    await prisma.domainCache.update({ where: { domain: indicator }, data: { data: JSON.stringify(data) } });
    assert.equal((await (await lookup(`/api/lookup/domain/${indicator}`)).json()).source, 'api');
    assert.equal(calls.length, 2);
    await prisma.domainCache.update({ where: { domain: indicator }, data: { data: JSON.stringify({ factors: {}, threatScore: 99 }) } });
    assert.equal((await (await lookup(`/api/lookup/domain/${indicator}`)).json()).threatScore, 80);
    assert.equal(calls.length, 3);
  });
  it('serves stale real data without renewing timestamp, but refuses data older than 48h', async () => {
    const indicator = domain();
    await lookup(`/api/lookup/domain/${indicator}`);
    const row = await prisma.domainCache.findUniqueOrThrow({ where: { domain: indicator } });
    const data = JSON.parse(row.data);
    data.cachedAt = new Date(Date.now() - 600000).toISOString(); data.expiresAt = new Date(Date.now() - 1000).toISOString();
    await prisma.domainCache.update({ where: { domain: indicator }, data: { data: JSON.stringify(data) } });
    responses.set(host, () => json({}, 429, { 'Retry-After': '60' }));
    const stale = await (await lookup(`/api/lookup/domain/${indicator}`)).json();
    assert.equal(stale.stale, true); assert.equal(stale.source, 'cache'); assert.equal(stale.threatScore, 80); assert.equal(stale.cachedAt, data.cachedAt);
    assert.equal((await prisma.domainCache.findUniqueOrThrow({ where: { domain: indicator } })).data, JSON.stringify(data));
    data.cachedAt = new Date(Date.now() - 49 * 3600000).toISOString(); data.expiresAt = new Date(Date.now() - 48 * 3600000).toISOString();
    await prisma.domainCache.update({ where: { domain: indicator }, data: { data: JSON.stringify(data) } });
    assert.equal((await lookup(`/api/lookup/domain/${indicator}`)).status, 503);
  });
  it('returns 503 without credentials rather than generating a mock score', async () => {
    delete process.env.VIRUSTOTAL_API_KEY;
    const res = await lookup(`/api/lookup/domain/${domain()}`);
    assert.equal(res.status, 503); assert.equal((await res.json()).threatScore, null); assert.equal(calls.length, 0);
  });
  it('with only AbuseIPDB and VirusTotal configured: assesses IP, reports 503 sources, Retry-After and CORS exposure', async () => {
    process.env.ABUSEIPDB_API_KEY = 'test-only-key';
    const ip = await lookup('/api/lookup/ip/8.8.8.8');
    const body = await ip.json();
    assert.equal(ip.status, 200);
    const status = (sources: { name: string; status: string }[], name: string) => sources.find(source => source.name === name)?.status;
    assert.equal(status(body.sources, 'ABUSEIPDB'), 'ok'); assert.equal(status(body.sources, 'VIRUSTOTAL'), 'ok');
    assert.equal(body.sources.find((source: { name: string }) => source.name === 'ABUSEIPDB').details.abuseConfidenceScore, 80);
    assert.ok(Number.isFinite(body.threatScore) && body.threatScore >= 0 && body.threatScore <= 100);
    // D1 option B: unconfigured sources stay listed and lower confidence, but the result is not partial and gets the 24h TTL.
    assert.equal(body.partial, false); assert.equal(status(body.sources, 'SHODAN'), 'not_configured');
    assert.ok(body.analysis.confidencePercentage < 100);
    assert.equal(Date.parse(body.expiresAt) - Date.parse(body.cachedAt), 86400000);
    assert.deepEqual([...new Set(calls.map(url => url.hostname))].sort(), ['api.abuseipdb.com', 'www.virustotal.com']);
    responses.set(host, () => json({}, 429, { 'Retry-After': '90' }));
    const limited = await lookup(`/api/lookup/domain/${domain()}`, { headers: { Origin: 'http://localhost:3000' } });
    assert.equal(limited.status, 503); assert.equal(limited.headers.get('retry-after'), '90');
    assert.match(limited.headers.get('access-control-expose-headers') || '', /Retry-After/i);
    const failure = await limited.json();
    assert.equal(failure.threatScore, null);
    assert.equal(status(failure.sources, 'VIRUSTOTAL'), 'rate_limited'); assert.equal(status(failure.sources, 'ABUSEIPDB'), 'not_applicable');
    assert.equal(failure.sources.find((source: { name: string }) => source.name === 'VIRUSTOTAL').retryAfter, 90);
    delete process.env.ABUSEIPDB_API_KEY; delete process.env.VIRUSTOTAL_API_KEY;
    const none = await lookup('/api/lookup/ip/9.9.9.9');
    const empty = await none.json();
    assert.equal(none.status, 503); assert.equal(none.headers.get('retry-after'), null); assert.equal(empty.threatScore, null);
    assert.ok(empty.sources.every((source: { status: string }) => ['not_configured', 'not_applicable'].includes(source.status)));
    assert.equal(status(empty.sources, 'ABUSEIPDB'), 'not_configured'); assert.equal(status(empty.sources, 'VIRUSTOTAL'), 'not_configured');
  });
  it('honors 429 cooldown and Retry-After without retrying', async () => {
    responses.set(host, () => json({}, 429, { 'Retry-After': '120' }));
    const first = await lookup(`/api/lookup/domain/${domain()}`);
    assert.equal(first.status, 503); assert.equal(first.headers.get('retry-after'), '120');
    const next = await lookup(`/api/lookup/domain/${domain()}`);
    assert.equal(next.status, 503); assert.equal(calls.length, 1);
  });
  it('does not retry authentication failure or treat missing IOC as benign', async () => {
    responses.set(host, () => json({}, 401));
    assert.equal((await lookup(`/api/lookup/domain/${domain()}`)).status, 503); assert.equal(calls.length, 1);
    responses.set(host, () => json({}, 404));
    const indicator = domain();
    const body = await (await lookup(`/api/lookup/domain/${indicator}`)).json();
    assert.equal(body.threatScore, null); assert.equal(body.riskLevel, null); assert.equal(body.assessmentStatus, 'insufficient_data');
    assert.equal(await prisma.domainCache.findUnique({ where: { domain: indicator } }), null);
  });
  it('retries transient 502 once and stops after the retry budget', async () => {
    let attempts = 0;
    responses.set(host, () => ++attempts === 1 ? json({}, 502) : json({ data: { attributes: { last_analysis_stats: { malicious: 8, harmless: 2 } } } }));
    assert.equal((await lookup(`/api/lookup/domain/${domain()}`)).status, 200); assert.equal(attempts, 2);
    responses.set(host, () => json({}, 504)); resetFixtures(); responses.set(host, () => json({}, 504));
    assert.equal((await lookup(`/api/lookup/domain/${domain()}`)).status, 503); assert.equal(calls.length, 2);
  });
  it('aborts stalled requests within deadline and releases single-flight state', async () => {
    process.env.EXTERNAL_API_TIMEOUT_MS = '20'; process.env.LOOKUP_DEADLINE_MS = '50';
    let aborted = false;
    responses.set(host, (_url, init) => new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('cancelled')); }, { once: true })));
    const indicator = domain();
    const res = await lookup(`/api/lookup/domain/${indicator}`);
    assert.equal(res.status, 503); assert.equal(aborted, true);
    assert.equal((await res.json()).sources.find((source: { name: string }) => source.name === 'VIRUSTOTAL').status, 'timeout');
    responses.clear();
    assert.equal((await lookup(`/api/lookup/domain/${indicator}`)).status, 200);
  });
  it('rejects malformed/oversized JSON and keeps valid partial evidence', async () => {
    for (const response of [new Response('not json', { headers: { 'content-type': 'application/json' } }), json({ invalid: true }), new Response('x'.repeat(1024*1024+1), { headers: { 'content-type': 'application/json' } })]) {
      responses.set(host, () => response);
      assert.equal((await lookup(`/api/lookup/domain/${domain()}`)).status, 503);
    }
    process.env.ABUSEIPDB_API_KEY = 'test-only-key';
    const response = await lookup('/api/lookup/ip/8.8.4.4');
    const body = await response.json();
    assert.equal(response.status, 200); assert.equal(body.partial, true); assert.equal(body.threatScore, 80); assert.equal(body.analysis.confidencePercentage, 35);
    assert.equal(Date.parse(body.expiresAt)-Date.parse(body.cachedAt), 300000);
  });
  it('skips GreyNoise for IPv6 and uses canonical cache keys', async () => {
    process.env.GREYNOISE_API_KEY = 'test-only-key';
    const first = await (await lookup('/api/lookup/ip/2001:4860:0000:0000:0000:0000:0000:8888')).json();
    assert.equal(first.sources.find((source: { name: string }) => source.name === 'GREYNOISE').status, 'not_applicable');
    const second = await (await lookup('/api/lookup/ip/2001:4860::8888')).json();
    assert.equal(second.source, 'cache'); assert.equal(calls.length, 1);
  });
  it('rejects unsupported types and private IPs before external HTTP', async () => {
    for (const path of ['/email/a@example.com','/unknown/example.com','/ip/10.0.0.1','/ip/::ffff:7f00:1','/domain/example.com%00']) assert.equal((await lookup(`/api/lookup${path}`)).status, 400);
    assert.equal(calls.length, 0);
  });
  it('limits public request volume', async () => {
    process.env.LOOKUP_REQUESTS_PER_MINUTE = '1';
    const result = await lookup(`/api/lookup/domain/${domain()}`);
    assert.equal(result.status, 429); assert.ok(result.headers.get('retry-after')); assert.equal(calls.length, 0);
  });
});

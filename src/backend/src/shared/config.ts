// Node's native environment loader is run by server.ts before app imports.
export function setting(name: string, fallback: number, min = 1, max = 604800000): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`Invalid configuration: ${name}`);
  }
  return value;
}
export function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters');
  return secret;
}
/** Environment variable holding each provider credential. */
export const PROVIDER_KEYS = { ABUSEIPDB: 'ABUSEIPDB_API_KEY', VIRUSTOTAL: 'VIRUSTOTAL_API_KEY', SHODAN: 'SHODAN_API_KEY', GREYNOISE: 'GREYNOISE_API_KEY', OTX: 'OTX_API_KEY', URLSCAN: 'URLSCAN_API_KEY', IPINFO: 'IPINFO_TOKEN' } as const;
/** Provider names with a non-empty credential; never returns values, lengths or prefixes. */
export function configuredProviders(): string[] {
  return Object.entries(PROVIDER_KEYS).filter(([, key]) => Boolean(process.env[key]?.trim())).map(([name]) => name);
}
export function validateConfig(): void {
  jwtSecret();
  databaseUrl();
  if (process.env.DIRECT_URL) databaseUrl('DIRECT_URL');
  setting('PORT', 4000, 1, 65535);
  setting('EXTERNAL_API_TIMEOUT_MS', 5000, 1, 60000);
  setting('LOOKUP_DEADLINE_MS', 10000, 1, 120000);
  setting('EXTERNAL_API_MAX_RETRIES', 1, 0, 1);
  setting('EXTERNAL_API_MAX_CONCURRENCY', 8, 1, 64);
  setting('LOOKUP_REQUESTS_PER_MINUTE', 30, 1, 10000);
  setting('LOGIN_MAX_FAILURES_PER_ACCOUNT', 5, 1, 1000);
  setting('LOGIN_MAX_FAILURES_PER_IP', 20, 1, 100000);
  setting('LOGIN_WINDOW_SECONDS', 900, 1, 86400);
  for (const name of ['LOOKUP_CACHE_TTL_SECONDS', 'LOOKUP_PARTIAL_CACHE_TTL_SECONDS', 'LOOKUP_STALE_MAX_AGE_SECONDS']) setting(name, 86400, 1, 604800);
  for (const name of ['ABUSEIPDB', 'VIRUSTOTAL', 'SHODAN', 'GREYNOISE', 'OTX', 'URLSCAN', 'IPINFO']) setting(`${name}_MIN_INTERVAL_MS`, 1000, 0, 86400000);
}

/** Validate without putting a credential or connection string into an error. */
export function databaseUrl(name: 'DATABASE_URL' | 'DIRECT_URL' = 'DATABASE_URL'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be configured for PostgreSQL`);
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`Invalid PostgreSQL configuration: ${name}`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || url.pathname.length <= 1 || url.hash) {
    throw new Error(`Invalid PostgreSQL configuration: ${name}`);
  }
  if (/\.supabase\.(com|co)$/.test(url.hostname)) {
    if (!['require', 'verify-ca', 'verify-full'].includes(url.searchParams.get('sslmode') || '')) throw new Error(`${name} requires TLS for Supabase`);
    if (url.port === '6543' && (name === 'DIRECT_URL' || url.searchParams.get('pgbouncer') !== 'true')) {
      throw new Error(name === 'DIRECT_URL' ? 'DIRECT_URL must use direct or session mode' : 'DATABASE_URL requires pgbouncer=true for transaction mode');
    }
  }
  return value;
}

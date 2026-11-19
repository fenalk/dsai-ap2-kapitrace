// Pure presentation rules for the lookup screen (no React, no I/O): keeps texts testable.
export type LookupType = 'ip' | 'domain' | 'hash';
export interface SourceInfo { name: string; status: string; details?: Record<string, unknown>; retryAfter?: number }
export type SourceTone = 'ok' | 'not_configured' | 'not_applicable' | 'failed';

export const providerNames: Record<string, string> = { ABUSEIPDB: 'AbuseIPDB', VIRUSTOTAL: 'VirusTotal', SHODAN: 'Shodan', GREYNOISE: 'GreyNoise', OTX: 'AlienVault OTX', URLSCAN: 'URLScan', IPINFO: 'IPInfo' };
export const statusLabels: Record<string, string> = { ok: 'Consultada', not_found: 'Sem registro', not_configured: 'Não configurada', not_applicable: 'Não aplicável', rate_limited: 'Limite de consultas', timeout: 'Tempo esgotado', unavailable: 'Indisponível', invalid_response: 'Resposta inválida' };

export const providerName = (name: string): string => providerNames[name] ?? name;

/** Groups statuses into the four visual states required by the SPEC. not_found is a valid answer, not a failure. */
export function sourceTone(status: string): SourceTone {
  if (status === 'ok' || status === 'not_found') return 'ok';
  if (status === 'not_configured' || status === 'not_applicable') return status;
  return 'failed';
}

export function statusText(source: SourceInfo): string {
  const label = statusLabels[source.status] ?? source.status;
  return source.retryAfter ? `${label} — tente em ${source.retryAfter} s` : label;
}

const formatValue = (value: unknown): string => Array.isArray(value) ? value.join(', ') : String(value);
const present = (value: unknown): boolean => value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0);
const commonLabels: Record<string, string> = { country: 'País', organization: 'Organização', asn: 'ASN' };
const detailLabels: Record<string, Record<string, (value: unknown) => string>> = {
  ABUSEIPDB: {
    abuseConfidenceScore: value => `Confiança de abuso: ${formatValue(value)}%`,
    totalReports: value => `Denúncias (90 dias): ${formatValue(value)}`,
    country: value => `País: ${formatValue(value)}`,
    isp: value => `Provedor (ISP): ${formatValue(value)}`
  },
  VIRUSTOTAL: {
    country: value => `País: ${formatValue(value)}`,
    asn: value => `ASN: ${formatValue(value)}`,
    organization: value => `Organização: ${formatValue(value)}`,
    fileType: value => `Tipo de arquivo: ${formatValue(value)}`
  }
};

/** Turns provider details into readable lines; unknown keys stay visible with their original name. */
export function describeDetails(name: string, details: Record<string, unknown> = {}): string[] {
  const entries = Object.entries(details).filter(([, value]) => present(value));
  const lines: string[] = [];
  const known = detailLabels[name] ?? {};
  if (name === 'VIRUSTOTAL' && present(details.malicious) && present(details.engines)) lines.push(`Detecções maliciosas: ${formatValue(details.malicious)} de ${formatValue(details.engines)} motores`);
  for (const [key, value] of entries) {
    if (name === 'VIRUSTOTAL' && (key === 'malicious' || key === 'engines') && present(details.malicious) && present(details.engines)) continue;
    if (known[key]) lines.push(known[key](value));
    else if (commonLabels[key]) lines.push(`${commonLabels[key]}: ${formatValue(value)}`);
    else lines.push(`${key}: ${formatValue(value)}`);
  }
  return lines;
}

/** Applicable sources that did not deliver evidence, used in the partial result notice. */
export function missingSources(sources: SourceInfo[]): SourceInfo[] {
  return sources.filter(source => source.status !== 'ok' && source.status !== 'not_applicable');
}

/** 503 message: says what happened and what to do. Never mentions a score. */
export function unavailableMessage(sources: SourceInfo[], retryAfter: number | null): string {
  const applicable = sources.filter(source => source.status !== 'not_applicable');
  if (applicable.length > 0 && applicable.every(source => source.status === 'not_configured')) return 'Nenhuma fonte de inteligência está configurada no servidor. Contate o administrador.';
  const limited = applicable.filter(source => source.status === 'rate_limited');
  if (limited.length) {
    const fromSources = Math.min(...limited.map(source => source.retryAfter ?? Infinity));
    const seconds = retryAfter ?? (Number.isFinite(fromSources) ? fromSources : null);
    return seconds ? `Limite de consultas do provedor atingido. Tente novamente em ${seconds} s.` : 'Limite de consultas do provedor atingido. Tente novamente em instantes.';
  }
  return 'As fontes de inteligência não responderam. Tente novamente em instantes.';
}

/** Backend validation messages stay in English (contract); the screen translates by indicator type. */
export function validationMessage(type: LookupType, message: string): string {
  if (/only public ip/i.test(message)) return 'Apenas IPs públicos podem ser consultados.';
  if (type === 'ip') return 'IP inválido: informe um endereço IPv4 ou IPv6 público (ex.: 8.8.8.8).';
  if (type === 'domain') return 'Domínio inválido: informe um nome como example.com, com até 253 caracteres.';
  return 'Hash inválido: use MD5 (32), SHA-1 (40) ou SHA-256 (64) caracteres hexadecimais.';
}

/** Lookup rate limit (429 from our own API). */
export function requestLimitMessage(retryAfter: number | null): string {
  return retryAfter ? `Muitas consultas em pouco tempo. Tente novamente em ${retryAfter} s.` : 'Muitas consultas em pouco tempo. Tente novamente em instantes.';
}

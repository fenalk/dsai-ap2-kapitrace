// Pure presentation rules for a lookup result (SPEC-FDE 006, F4.5–F4.10): no React, no I/O.
import { sourceTone, type SourceInfo } from './lookup-messages';

export type RiskTone = 'low' | 'suspicious' | 'high' | 'critical';
export interface RiskBand { tone: RiskTone; label: string; description: string }

// The backend keeps riskDescription in English (contract); the screen picks the Portuguese text by riskLevel (F4.7).
const bands: Record<string, RiskBand> = {
  LOW: { tone: 'low', label: 'Baixo', description: 'As fontes consultadas trazem pouca ou nenhuma evidência de atividade maliciosa.' },
  SUSPICIOUS: { tone: 'suspicious', label: 'Suspeito', description: 'Há sinais de atividade suspeita. Investigue antes de confiar neste indicador.' },
  HIGH: { tone: 'high', label: 'Alto', description: 'Há evidência consistente de atividade maliciosa. Considere bloquear ou monitorar.' },
  CRITICAL: { tone: 'critical', label: 'Crítico', description: 'Há evidência forte de atividade maliciosa. Trate como ameaça ativa.' },
};

/** Band, Portuguese label and description for riskLevel (F4.6/F4.7); null when there is no known level. */
export function riskBand(riskLevel: string | null | undefined): RiskBand | null {
  return riskLevel ? bands[riskLevel] ?? null : null;
}

/** Readable origin (F4.9); the raw value stays in data-source. */
export function originLabel(source: string): string {
  if (source === 'api') return 'Consulta nova';
  if (source === 'cache') return 'Do cache';
  return source;
}

/** Coverage percentage clamped to 0–100, or null when there is no analysis (F4.8: never "0%" for missing data). */
export function coveragePercent(analysis: { confidencePercentage: number } | null | undefined): number | null {
  const value = analysis?.confidencePercentage;
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, Math.round(value))) : null;
}

/** "há 3 h", "em 21 h", "agora": distance between `iso` and `now`, rounded down. Null for an invalid date. */
export function relativeTime(iso: string, now: number): string | null {
  const target = Date.parse(iso);
  if (!Number.isFinite(target)) return null;
  const diff = target - now;
  const seconds = Math.floor(Math.abs(diff) / 1000);
  if (seconds < 60) return 'agora';
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const amount = minutes < 60 ? `${minutes} min` : hours < 48 ? `${hours} h` : `${days} d`;
  return diff < 0 ? `há ${amount}` : `em ${amount}`;
}

/** Validity of the cached result: "expira em 21 h" or "expirou há 2 h". */
export function expiryText(iso: string, now: number): string | null {
  const relative = relativeTime(iso, now);
  if (!relative) return null;
  if (relative === 'agora') return 'expira agora';
  return Date.parse(iso) > now ? `expira ${relative}` : `expirou ${relative}`;
}

export type SourceGroupKey = 'data' | 'failed' | 'not_configured' | 'not_applicable';
export interface SourceGroup { key: SourceGroupKey; label: string; sources: SourceInfo[] }

const groupOrder: { key: SourceGroupKey; label: string }[] = [
  { key: 'data', label: 'Com dados' },
  { key: 'failed', label: 'Falharam' },
  { key: 'not_configured', label: 'Não configuradas' },
  { key: 'not_applicable', label: 'Não aplicáveis' },
];

/** Sources grouped by state in the order of F4.10 (ok/not_found, failed, not configured, not applicable); empty groups are left out. */
export function groupSources(sources: SourceInfo[]): SourceGroup[] {
  const keyOf = (source: SourceInfo): SourceGroupKey => {
    const tone = sourceTone(source.status);
    return tone === 'ok' ? 'data' : tone;
  };
  return groupOrder
    .map(group => ({ ...group, sources: sources.filter(source => keyOf(source) === group.key) }))
    .filter(group => group.sources.length > 0);
}

/**
 * Seconds the "Analisar" button stays disabled after an error (F4.5): only for 429/503,
 * from Retry-After or, without it, the shortest retryAfter reported by a source. Capped at 24 h.
 */
export function retryDelay(status: number, retryAfter: number | null, sources: SourceInfo[] = []): number | null {
  if (status !== 429 && status !== 503) return null;
  const fromSources = Math.min(...sources.map(source => source.retryAfter).filter((value): value is number => typeof value === 'number' && value > 0));
  const seconds = retryAfter ?? (Number.isFinite(fromSources) ? fromSources : null);
  return seconds && seconds > 0 ? Math.min(Math.ceil(seconds), 86400) : null;
}

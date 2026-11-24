'use client';
import { useEffect, useRef, useState } from 'react';
import { describeDetails, providerName, sourceTone, statusText, type SourceInfo } from '@/lib/lookup-messages';
import { groupSources, riskBand } from '@/lib/lookup-result';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import Skeleton, { SkeletonText } from '@/components/ui/Skeleton';

const RADIUS = 52;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** ThreatScore ring (F4.6): filled up to the score with the band colour; null score leaves the ring empty. */
export function ScoreGauge({ score, riskLevel }: { score: number | null; riskLevel: string | null }) {
  const band = riskBand(riskLevel);
  const value = score === null ? null : Math.min(100, Math.max(0, score));
  const label = value === null ? 'ThreatScore: sem pontuação' : `ThreatScore ${value} de 100${band ? `, risco ${band.label.toLowerCase()}` : ''}`;
  return (
    <div className={['score-gauge', band ? `gauge-${band.tone}` : 'gauge-none'].join(' ')} role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle className="score-gauge-track" cx="60" cy="60" r={RADIUS} />
        {value !== null && value > 0 && (
          <circle
            className="score-gauge-value"
            cx="60"
            cy="60"
            r={RADIUS}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - value / 100)}
          />
        )}
      </svg>
      <div className={value === null ? 'threat-score threat-score-empty' : 'threat-score'} data-testid="threat-score">{value ?? 'Sem pontuação'}</div>
    </div>
  );
}

/** Evidence coverage as a bar (F4.8); without analysis it is "—" and no bar at all. */
export function CoverageBar({ percent }: { percent: number | null }) {
  return (
    <div className="coverage" data-testid="coverage">
      <div className="coverage-head"><span>Cobertura de evidências</span><strong>{percent === null ? '—' : `${percent}%`}</strong></div>
      {percent !== null && (
        <div className="coverage-bar" role="progressbar" aria-label="Cobertura de evidências" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
          <span style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

export function SourceList({ sources }: { sources: SourceInfo[] }) {
  return (
    <ul className="source-list">
      {sources.map(source => (
        <li className={`source-item source-${sourceTone(source.status)}`} key={source.name} data-testid={`source-${source.name}`} data-status={source.status}>
          <strong>{providerName(source.name)}</strong>
          <p className="source-status">{statusText(source)}</p>
          {describeDetails(source.name, source.details).map(line => <p className="text-dim" key={line}>{line}</p>)}
        </li>
      ))}
    </ul>
  );
}

/** Sources grouped by state with counts (F4.10); not applicable ones are collapsed. */
export function SourceGroups({ sources }: { sources: SourceInfo[] }) {
  return (
    <div className="source-groups">
      {groupSources(sources).map(group => group.key === 'not_applicable'
        ? (
          <details key={group.key} className="source-group" data-group={group.key}>
            <summary className="source-group-title">{group.label} <span className="source-group-count">{group.sources.length}</span></summary>
            <SourceList sources={group.sources} />
          </details>
        )
        : (
          <section key={group.key} className="source-group" data-group={group.key}>
            <h3 className="source-group-title">{group.label} <span className="source-group-count">{group.sources.length}</span></h3>
            <SourceList sources={group.sources} />
          </section>
        ))}
    </div>
  );
}

/** Placeholder with the shape of the result cards while the lookup runs (F4.4). */
export function ResultSkeleton() {
  return (
    <div className="result-grid" aria-hidden="true" data-testid="lookup-skeleton">
      <div className="result-sidebar">
        <Card className="result-score-card"><Skeleton width="40%" /><Skeleton circle width={120} height={120} className="skeleton-gauge" /><SkeletonText lines={2} /></Card>
        <Card><Skeleton width="50%" /><Skeleton height={40} /></Card>
      </div>
      <div className="result-main">
        <Card><Skeleton width="35%" /><Skeleton height={24} /><SkeletonText lines={3} /></Card>
        <Card><Skeleton width="45%" /><SkeletonText lines={4} /></Card>
      </div>
    </div>
  );
}

/** Copies a value; shows "Copiado" for a moment and fails silently when the clipboard is blocked (F4.12). */
export function CopyButton({ value, label = 'Copiar indicador' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch { /* Clipboard unavailable or denied: nothing to tell the user beyond the unchanged button. */ }
  }
  return (
    <button type="button" className="btn btn-ghost btn-sm copy-button" onClick={copy} aria-label={copied ? 'Copiado' : label} data-testid="copy-indicator">
      <Icon name={copied ? 'check' : 'copy'} />
      <span aria-hidden="true">{copied ? 'Copiado' : 'Copiar'}</span>
    </button>
  );
}

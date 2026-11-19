'use client';
import Link from 'next/link';
import { Suspense, useRef, useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, ApiError } from '../../lib/api';
import { describeDetails, missingSources, providerName, requestLimitMessage, sourceTone, statusText, unavailableMessage, validationMessage, type LookupType, type SourceInfo } from '../../lib/lookup-messages';
import RequireSession from '../../components/RequireSession';

interface LookupResult {
  indicator: string; type: LookupType; threatScore: number | null; riskLevel: string | null;
  source: string; stale: boolean; partial: boolean; assessmentStatus: string;
  cachedAt: string; expiresAt: string; sources: SourceInfo[];
  analysis: { confidencePercentage: number; riskDescription: string } | null;
}
interface LookupError { message: string; sources?: SourceInfo[] }
function lookupError(failure: unknown, type: LookupType): LookupError {
  if (failure instanceof ApiError) {
    const sources = Array.isArray(failure.body.sources) ? failure.body.sources as SourceInfo[] : undefined;
    if (failure.status === 503 && sources) return { message: unavailableMessage(sources, failure.retryAfter), sources };
    if (failure.status === 400 && failure.body.error === 'Validation Error') return { message: validationMessage(type, failure.message) };
    if (failure.status === 429) return { message: requestLimitMessage(failure.retryAfter) };
    if (failure.status === 503) return { message: 'O servidor está sobrecarregado. Tente novamente em instantes.' };
  }
  return { message: failure instanceof Error ? failure.message : 'Falha na busca' };
}
function SourceList({ sources }: { sources: SourceInfo[] }) {
  return <ul className="source-list">{sources.map(source => <li className={`source-item source-${sourceTone(source.status)}`} key={source.name} data-testid={`source-${source.name}`} data-status={source.status}><div><strong>{providerName(source.name)}</strong><p className="source-status">{statusText(source)}</p>{describeDetails(source.name, source.details).map(line => <p className="text-dim" key={line}>{line}</p>)}</div></li>)}</ul>;
}
function LookupContent() {
  const params = useSearchParams();
  const router = useRouter();
  const selected = params.get('type');
  const type: LookupType = selected === 'domain' || selected === 'hash' ? selected : 'ip';
  const [query, setQuery] = useState(params.get('q') || '');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<LookupError | null>(null);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const generation = useRef(0);
  async function search(event: FormEvent) {
    event.preventDefault();
    const current = ++generation.current;
    setError(null); setNotice(''); setResult(null); setLoading(true);
    try {
      const data = await api<LookupResult>(`/api/lookup/${type}/${encodeURIComponent(query.trim())}`);
      if (current === generation.current) setResult(data);
    } catch (failure) { if (current === generation.current) setError(lookupError(failure, type)); }
    finally { if (current === generation.current) setLoading(false); }
  }
  async function addToWatchlist() {
    if (!result) return;
    setAdding(true); setError(null); setNotice('');
    try {
      await api('/api/watchlist', { method: 'POST', body: JSON.stringify({ itemValue: result.indicator, itemType: result.type }) });
      setNotice('Indicador adicionado à watchlist.');
    } catch (failure) { setError({ message: failure instanceof Error ? failure.message : 'Falha ao adicionar' }); }
    finally { setAdding(false); }
  }
  return <div className="page-content">
    <div className="lookup-hero"><h1>Threat Intelligence Lookup</h1><p>Consulte relatórios existentes de IPs, domínios e hashes.</p>
      <div className="lookup-type-tabs">{(['ip', 'domain', 'hash'] as const).map(value => <button key={value} className={`lookup-type-tab ${type === value ? 'active' : ''}`} disabled={loading} onClick={() => { generation.current++; router.push(`/lookup?type=${value}`); setResult(null); setError(null); setNotice(''); }}>{value.toUpperCase()}</button>)}<span className="text-dim">Email: integração ainda indisponível</span></div>
      <form className="search-hero" onSubmit={search}><input aria-label="Indicador" required maxLength={512} value={query} onChange={event => setQuery(event.target.value)} placeholder={type === 'ip' ? '8.8.8.8' : type === 'domain' ? 'example.com' : 'MD5, SHA-1 ou SHA-256'} /><button className="btn btn-primary" disabled={loading} type="submit">{loading ? 'Consultando…' : 'Analisar'}</button></form>
    </div>
    {error && <div className="card" data-testid="lookup-error"><p role="alert">{error.message}</p>{error.sources && <><h2>Situação das fontes</h2><SourceList sources={error.sources} /></>}</div>}{notice && <p role="status">{notice}</p>}
    {result && result.type === type && <div className="result-grid" data-testid="lookup-result"><div className="result-sidebar">
      <div className="card result-score-card"><h2>ThreatScore</h2><div className="threat-score" data-testid="threat-score">{result.threatScore ?? 'Sem pontuação'}</div><p>{result.riskLevel ?? 'Dados insuficientes'}</p><p>Cobertura de evidências: {result.analysis?.confidencePercentage ?? 0}%</p></div>
      <div className="card"><h2>Fontes consultadas</h2><SourceList sources={result.sources} /></div>
    </div><div className="result-main"><div className="card"><h2>Indicador analisado</h2><code>{result.indicator}</code><p>Origem: <span data-testid="lookup-source">{result.source}</span></p><p>Coletado: {new Date(result.cachedAt).toLocaleString()}</p>
      {result.stale && <p role="status">Dados antigos: as fontes não forneceram uma nova avaliação. A pontuação usa a coleta anterior.</p>}
      {result.partial && <p role="status" data-testid="partial-notice">Resultado parcial: sem dados de {missingSources(result.sources).map(source => `${providerName(source.name)} (${statusText(source)})`).join(', ') || 'algumas fontes'}.</p>}
      {result.assessmentStatus === 'insufficient_data' && <p>Não há evidência suficiente para calcular reputação.</p>}
      <p>{result.analysis?.riskDescription}</p>
    </div><div className="card"><button className="btn btn-primary" onClick={addToWatchlist} disabled={adding}>{adding ? 'Adicionando…' : 'Adicionar à Watchlist'}</button><Link className="btn btn-ghost" href="/dashboard">Gerenciar watchlist</Link><Link className="btn btn-ghost" href="/login">Entrar</Link></div></div></div>}
  </div>;
}

export default function LookupPage() {
  return <RequireSession><Suspense fallback={<p role="status">Carregando busca…</p>}><LookupContent /></Suspense></RequireSession>;
}

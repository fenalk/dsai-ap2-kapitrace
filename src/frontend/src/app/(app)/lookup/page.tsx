'use client';
import Link from 'next/link';
import { Suspense, useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, ApiError, type WatchlistItem } from '@/lib/api';
import { formatWait, partialNotice, requestLimitMessage, unavailableMessage, validationMessage, type LookupType, type SourceInfo } from '@/lib/lookup-messages';
import { detectIndicatorType, normalizeIndicator, sentValueNotice } from '@/lib/indicator';
import { coveragePercent, expiryText, originLabel, relativeTime, retryDelay, riskBand } from '@/lib/lookup-result';
import { getRecentLookups, rememberLookup, serverRecentLookups, subscribeRecentLookups } from '@/lib/recent-lookups';
import { hasSession } from '@/lib/session';
import RequireSession from '@/components/RequireSession';
import Alert from '@/components/ui/Alert';
import Badge from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import Card, { CardHeader } from '@/components/ui/Card';
import Icon, { type IconName } from '@/components/ui/Icon';
import { useToast } from '@/components/ui/Toast';
import { CopyButton, CoverageBar, ResultSkeleton, ScoreGauge, SourceGroups } from '@/components/lookup/ResultParts';

interface LookupResult {
  indicator: string; type: LookupType; threatScore: number | null; riskLevel: string | null;
  source: string; stale: boolean; partial: boolean; assessmentStatus: string;
  cachedAt: string; expiresAt: string; sources: SourceInfo[];
  analysis: { confidencePercentage: number; riskDescription: string } | null;
}
interface LookupError { message: string; sources?: SourceInfo[]; retryIn: number | null }
type WatchState = 'checking' | 'absent' | 'present' | 'adding';

const types: { value: LookupType; label: string; icon: IconName }[] = [
  { value: 'ip', label: 'IP', icon: 'globe' },
  { value: 'domain', label: 'Domínio', icon: 'link' },
  { value: 'hash', label: 'Hash', icon: 'hash' },
];
const typeName: Record<LookupType, string> = { ip: 'IP', domain: 'Domínio', hash: 'Hash' };
const WATCHLIST_CHECK_TIMEOUT_MS = 3000;
// Wall clock read only in event handlers and timers, never while rendering.
const clock = (): number => Date.now();
const parseType = (value: string | null): LookupType | null => value === 'ip' || value === 'domain' || value === 'hash' ? value : null;

function lookupError(failure: unknown, type: LookupType): LookupError {
  if (failure instanceof ApiError) {
    const sources = Array.isArray(failure.body.sources) ? failure.body.sources as SourceInfo[] : undefined;
    const retryIn = retryDelay(failure.status, failure.retryAfter, sources);
    if (failure.status === 503 && sources) return { message: unavailableMessage(sources, failure.retryAfter), sources, retryIn };
    if (failure.status === 400 && failure.body.error === 'Validation Error') return { message: validationMessage(type, failure.message), retryIn };
    if (failure.status === 429) return { message: requestLimitMessage(failure.retryAfter), retryIn };
    if (failure.status === 503) return { message: 'O servidor está sobrecarregado. Tente novamente em instantes.', retryIn };
  }
  return { message: failure instanceof Error ? failure.message : 'Falha na busca', retryIn: null };
}

/** Date relative to now, with the full date in the tooltip and in <time dateTime> (F4.9). */
function When({ iso, now, text }: { iso: string; now: number; text: (relative: string) => string }) {
  const relative = relativeTime(iso, now);
  const date = new Date(iso);
  if (!relative || Number.isNaN(date.getTime())) return null;
  return <time dateTime={iso} title={date.toLocaleString('pt-BR')}>{text(relative)}</time>;
}

function LookupContent() {
  const params = useSearchParams();
  const toast = useToast();
  const urlType = parseType(params.get('type'));
  const [query, setQuery] = useState(params.get('q') || '');
  // F4.1: a type chosen by hand (or pre-selected by ?type=) wins until the field changes again.
  const [manualType, setManualType] = useState<LookupType | null>(urlType);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [error, setError] = useState<LookupError | null>(null);
  const [loading, setLoading] = useState(false);
  const [watch, setWatch] = useState<WatchState>('checking');
  const [addError, setAddError] = useState('');
  const [now, setNow] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  // F6.1: after each lookup, focus goes to the result title or to the error, so keyboard and screen reader users land on it.
  const [focusRequest, setFocusRequest] = useState<{ target: 'result' | 'error'; id: number } | null>(null);
  const recent = useSyncExternalStore(subscribeRecentLookups, getRecentLookups, serverRecentLookups);
  const generation = useRef(0);
  const autoSearched = useRef<string | null>(null);

  useEffect(() => {
    if (!focusRequest) return;
    document.getElementById(focusRequest.target === 'result' ? 'lookup-result-title' : 'lookup-error')?.focus();
  }, [focusRequest]);
  const appliedUrlType = useRef(urlType);

  const type: LookupType = manualType ?? (query.trim() ? detectIndicatorType(query) : 'ip');
  const sentAs = sentValueNotice(query, type);
  const waitSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const coolingDown = waitSeconds > 0;

  // Clock for the countdown (every second) and for relative dates of a shown result (every 30 s).
  useEffect(() => {
    if (!coolingDown && !result) return;
    const timer = window.setInterval(() => setNow(clock()), coolingDown ? 1000 : 30000);
    return () => window.clearInterval(timer);
  }, [coolingDown, result]);

  // F4.13: "Adicionar" waits for this check so it does not create a duplicate, but never for long:
  // after WATCHLIST_CHECK_TIMEOUT_MS (or any failure) the button is released and the backend accepts the item anyway.
  async function checkWatchlist(found: LookupResult, current: number) {
    setWatch('checking');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), WATCHLIST_CHECK_TIMEOUT_MS);
    try {
      const items = await api<WatchlistItem[]>('/api/watchlist', { signal: controller.signal });
      if (current !== generation.current) return;
      const listed = Array.isArray(items) && items.some(item => item.itemType === found.type && item.itemValue === found.indicator);
      setWatch(listed ? 'present' : 'absent');
    } catch {
      if (current === generation.current) setWatch('absent');
    } finally { window.clearTimeout(timer); }
  }

  async function runSearch(raw: string, searchType: LookupType) {
    const indicator = normalizeIndicator(raw, searchType);
    if (!indicator) return;
    const current = ++generation.current;
    setError(null); setAddError(''); setResult(null); setLoading(true);
    try {
      const data = await api<LookupResult>(`/api/lookup/${searchType}/${encodeURIComponent(indicator)}`);
      if (current !== generation.current) return;
      setNow(clock());
      setResult(data);
      setFocusRequest(previous => ({ target: 'result', id: (previous?.id ?? 0) + 1 }));
      // An answer that arrives after sign out must not seed the next session's list (F4.14).
      if (hasSession()) rememberLookup({ type: data.type, indicator: data.indicator });
      void checkWatchlist(data, current);
    } catch (failure) {
      if (current !== generation.current) return;
      const failureInfo = lookupError(failure, searchType);
      setError(failureInfo);
      setFocusRequest(previous => ({ target: 'error', id: (previous?.id ?? 0) + 1 }));
      if (failureInfo.retryIn) {
        const started = clock();
        setNow(started);
        setCooldownUntil(started + failureInfo.retryIn * 1000);
      }
    } finally { if (current === generation.current) setLoading(false); }
  }

  function search(event: FormEvent) {
    event.preventDefault();
    if (loading || coolingDown) return;
    void runSearch(query, type);
  }

  function searchAgain(indicator: string, searchType: LookupType) {
    if (loading || coolingDown) return;
    setQuery(indicator); setManualType(searchType);
    void runSearch(indicator, searchType);
  }

  // F4.3: the navigation shortcuts (?type=) pre-select the type; a stale answer for the previous screen is dropped.
  const applyAddressType = useEffectEvent((next: LookupType | null) => {
    generation.current++;
    setManualType(next); setResult(null); setError(null); setAddError(''); setLoading(false);
  });
  useEffect(() => {
    if (appliedUrlType.current === urlType) return;
    appliedUrlType.current = urlType;
    applyAddressType(urlType);
  }, [urlType]);

  // F2.2: opening an address with ?q= (landing, login redirect, watchlist) runs the lookup once for that address;
  // re-renders of the same type+q do not repeat it. useEffectEvent is stable API since React 19.2 (package.json pins 19.2.x).
  const searchFromAddress = useEffectEvent((indicator: string) => {
    const addressType = urlType ?? detectIndicatorType(indicator);
    setQuery(indicator); setManualType(addressType);
    void runSearch(indicator, addressType);
  });
  const addressQuery = params.get('q')?.trim() ?? '';
  useEffect(() => {
    if (!addressQuery) return;
    const key = `${urlType}:${addressQuery}`;
    if (autoSearched.current === key) return;
    autoSearched.current = key;
    searchFromAddress(addressQuery);
  }, [urlType, addressQuery]);

  async function addToWatchlist() {
    if (!result || watch !== 'absent') return;
    const current = generation.current;
    setWatch('adding'); setAddError('');
    try {
      await api('/api/watchlist', { method: 'POST', body: JSON.stringify({ itemValue: result.indicator, itemType: result.type }) });
      if (current === generation.current) setWatch('present');
      toast({ message: 'Indicador adicionado à watchlist.' });
    } catch (failure) {
      if (current !== generation.current) return;
      setWatch('absent');
      setAddError(failure instanceof Error ? failure.message : 'Falha ao adicionar');
    }
  }

  const band = result ? riskBand(result.riskLevel) : null;
  const coverage = result ? coveragePercent(result.analysis) : null;
  const submitLabel = coolingDown ? `Aguarde ${formatWait(waitSeconds)}` : loading ? 'Consultando…' : 'Analisar';

  return <div className="page-content">
    <div className="lookup-hero">
      <h1>Threat Intelligence Lookup</h1>
      <p>Consulte relatórios existentes de IPs, domínios e hashes. Cole o indicador: o tipo é detectado sozinho.</p>
      <form className="lookup-form" onSubmit={search}>
        <div className="search-hero">
          <span className="search-hero-icon"><Icon name="search" /></span>
          <input
            aria-label="Indicador"
            aria-describedby="lookup-input-hint"
            required
            maxLength={512}
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={event => { setQuery(event.target.value); setManualType(null); }}
            placeholder="IP, domínio, URL ou hash (MD5, SHA-1, SHA-256)"
          />
          <Button type="submit" loading={loading} disabled={coolingDown} data-testid="lookup-submit">{submitLabel}</Button>
        </div>
        <div className="lookup-options">
          <fieldset className="type-picker">
            <legend className="visually-hidden">Tipo do indicador</legend>
            {types.map(option => (
              <label key={option.value} className={option.value === type ? 'type-chip selected' : 'type-chip'}>
                <input type="radio" name="indicator-type" value={option.value} checked={option.value === type} onChange={() => setManualType(option.value)} />
                <Icon name={option.icon} />{option.label}
              </label>
            ))}
          </fieldset>
          <span className="text-dim lookup-email-note">Email: integração ainda indisponível</span>
        </div>
        <p className="field-hint lookup-hint" id="lookup-input-hint" data-testid="type-hint">
          {manualType ? `Tipo selecionado: ${typeName[type]}.` : query.trim() ? `Tipo detectado: ${typeName[type]}. Você pode trocá-lo acima.` : 'Aceita indicadores "defanged", como 8.8.8[.]8 ou hxxps://exemplo[.]com.'}
        </p>
        {sentAs && <p className="field-hint lookup-sent-as" data-testid="sent-value">Consultando como: <code>{sentAs}</code></p>}
      </form>
      {recent.length > 0 && (
        <nav className="recent-lookups" aria-label="Consultas recentes" data-testid="recent-lookups">
          <span className="recent-lookups-label">Consultas recentes</span>
          <ul className="cluster" role="list">
            {recent.map(item => (
              <li key={`${item.type}:${item.indicator}`}>
                <button type="button" className="recent-chip" disabled={loading || coolingDown} onClick={() => searchAgain(item.indicator, item.type)} title={`Consultar ${item.indicator} de novo`}>
                  <span className="recent-chip-type">{typeName[item.type]}</span><code>{item.indicator}</code>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>

    {loading && <>
      <p className="lookup-wait" role="status" data-testid="lookup-loading">A consulta pode levar até 10 s.</p>
      <ResultSkeleton />
    </>}

    {error && <Card data-testid="lookup-error" id="lookup-error" tabIndex={-1} className="focus-target">
      <Alert tone="danger"><p>{error.message}</p></Alert>
      {error.sources && <><CardHeader title="Situação das fontes" /><SourceGroups sources={error.sources} /></>}
    </Card>}

    {result && <h2 id="lookup-result-title" className="result-title focus-target" tabIndex={-1}>Resultado para <code>{result.indicator}</code></h2>}
    {result && <div className="result-grid" data-testid="lookup-result">
      <div className="result-sidebar">
        <Card className="result-score-card">
          <CardHeader title="ThreatScore" />
          <ScoreGauge score={result.threatScore} riskLevel={result.riskLevel} />
          {band
            ? <Badge tone={`risk-${band.tone}`} className="risk-badge"><span data-testid="risk-label">Risco {band.label.toLowerCase()}</span></Badge>
            : <p className="text-muted" data-testid="risk-label">Dados insuficientes</p>}
          <CoverageBar percent={coverage} />
        </Card>
        <Card>
          <CardHeader title="Watchlist" />
          {watch === 'present'
            ? <>
              <Button variant="secondary" block disabled data-testid="watchlist-status"><Icon name="check" />Na watchlist</Button>
              <Link href="/dashboard" className="watchlist-link">Abrir watchlist <Icon name="arrow-right" /></Link>
            </>
            : <>
              <Button block onClick={addToWatchlist} loading={watch === 'checking' || watch === 'adding'} data-testid="watchlist-status">
                <Icon name="eye" />{watch === 'adding' ? 'Adicionando…' : 'Adicionar à Watchlist'}
              </Button>
              <Link href="/dashboard" className="watchlist-link">Gerenciar watchlist <Icon name="arrow-right" /></Link>
            </>}
          {addError && <Alert tone="danger">{addError}</Alert>}
        </Card>
      </div>
      <div className="result-main">
        <Card>
          <CardHeader title="Indicador analisado" actions={<CopyButton value={result.indicator} />} />
          <p className="result-indicator"><Badge tone="accent">{typeName[result.type]}</Badge><code>{result.indicator}</code></p>
          <dl className="result-facts">
            <div><dt>Origem</dt><dd><span data-testid="lookup-source" data-source={result.source}>{originLabel(result.source)}</span></dd></div>
            <div><dt>Coleta</dt><dd><When iso={result.cachedAt} now={now} text={relative => relative === 'agora' ? 'agora mesmo' : relative} /></dd></div>
            <div><dt>Validade</dt><dd><When iso={result.expiresAt} now={now} text={() => expiryText(result.expiresAt, now) ?? ''} /></dd></div>
          </dl>
          {band && <p className="result-description" data-testid="risk-description">{band.description}</p>}
          {result.stale && <Alert tone="danger" role="status" title="Dados antigos" data-testid="stale-notice"><p>As fontes não forneceram uma nova avaliação. A pontuação usa a coleta anterior.</p></Alert>}
          {result.partial && <Alert tone="warning" data-testid="partial-notice"><p>{partialNotice(result.sources)}</p></Alert>}
          {result.assessmentStatus === 'insufficient_data' && <Alert tone="info" data-testid="insufficient-notice"><p>Não há evidência suficiente para calcular reputação.</p></Alert>}
        </Card>
        <Card>
          <CardHeader title="Fontes consultadas" />
          <SourceGroups sources={result.sources} />
        </Card>
      </div>
    </div>}
  </div>;
}

export default function LookupPage() {
  return <RequireSession><Suspense fallback={<p role="status">Carregando busca…</p>}><LookupContent /></Suspense></RequireSession>;
}

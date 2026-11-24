'use client';
import { useEffect, useRef, useState } from 'react';
import { api, type WatchlistItem } from '@/lib/api';
import { countByFilter, filterWatchlist, lookupHref, restoreItem, watchlistFilters, watchlistTypeLabel, type WatchlistFilter } from '@/lib/watchlist';
import RequireSession from '@/components/RequireSession';
import Alert from '@/components/ui/Alert';
import Badge from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Icon from '@/components/ui/Icon';
import Skeleton from '@/components/ui/Skeleton';
import { useDismissToast, useToast } from '@/components/ui/Toast';

const UNDO_WINDOW_MS = 6000;
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
const message = (failure: unknown, fallback: string): string => failure instanceof Error ? failure.message : fallback;

/** Inclusion date, short on screen and complete in <time dateTime>/title. */
function AddedAt({ iso }: { iso?: string }) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return <span className="text-dim">—</span>;
  return <time dateTime={iso} title={date.toLocaleString('pt-BR')}>{dateFormat.format(date)}</time>;
}

function LoadingRows() {
  return (
    <Card className="watchlist-loading" aria-hidden="true" data-testid="watchlist-loading">
      {Array.from({ length: 3 }, (_, index) => (
        <div className="watchlist-loading-row" key={index}><Skeleton width={56} height={22} /><Skeleton height={18} /><Skeleton width={96} height={18} /></div>
      ))}
    </Card>
  );
}

function WatchlistContent() {
  const toast = useToast();
  const dismissToast = useDismissToast();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<WatchlistFilter>('all');
  const [text, setText] = useState('');
  // Outcome of each DELETE in flight, so "Desfazer" never re-adds an item whose removal failed (it is already back).
  const deletions = useRef(new Map<string, Promise<boolean>>());

  useEffect(() => {
    let active = true;
    api<WatchlistItem[]>('/api/watchlist')
      .then(data => { if (active) { setItems(Array.isArray(data) ? data : []); setLoadError(''); } })
      .catch(failure => { if (active) setLoadError(message(failure, 'Falha ao carregar a watchlist')); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  function retry() {
    setLoading(true); setLoadError('');
    setReloadKey(key => key + 1);
  }

  async function undo(item: WatchlistItem, index: number) {
    const removed = await deletions.current.get(item.id);
    deletions.current.delete(item.id);
    if (removed === false) return;
    try {
      const created = await api<WatchlistItem>('/api/watchlist', { method: 'POST', body: JSON.stringify({ itemValue: item.itemValue, itemType: item.itemType }) });
      setItems(current => restoreItem(current, created && typeof created.id === 'string' ? created : item, index));
      toast({ message: 'Item devolvido à watchlist.', tone: 'info' });
    } catch (failure) {
      setActionError(`Não foi possível desfazer a remoção de ${item.itemValue}: ${message(failure, 'falha ao adicionar')}`);
    }
  }

  // F5.4: optimistic removal with a 6 s "Desfazer"; a failed DELETE puts the item back, shows the error and closes
  // the toast (its action no longer applies). The index is the one at click time; restoreItem clamps it, so after
  // other removals the item comes back close to, not necessarily at, its old place.
  function remove(item: WatchlistItem) {
    const index = items.findIndex(current => current.id === item.id);
    setActionError('');
    setItems(current => current.filter(entry => entry.id !== item.id));
    let toastId: number | null = null;
    const deletion = api(`/api/watchlist/${encodeURIComponent(item.id)}`, { method: 'DELETE' }).then(
      () => true,
      failure => {
        setItems(current => restoreItem(current, item, index));
        setActionError(`Não foi possível remover ${item.itemValue}: ${message(failure, 'falha ao remover')}`);
        if (toastId !== null) dismissToast(toastId);
        return false;
      }
    );
    deletions.current.set(item.id, deletion);
    // Past the undo window nobody can ask for this outcome any more.
    window.setTimeout(() => { if (deletions.current.get(item.id) === deletion) deletions.current.delete(item.id); }, UNDO_WINDOW_MS + 1000);
    toastId = toast({ message: 'Removido', tone: 'info', duration: UNDO_WINDOW_MS, action: { label: 'Desfazer', onClick: () => { void undo(item, index); } } });
  }

  const counts = countByFilter(items);
  const visible = filterWatchlist(items, filter, text);
  const filtered = filter !== 'all' || text.trim() !== '';

  return <div className="page-content">
    <div className="page-header">
      <div><h1>Watchlist</h1><p>Indicadores monitorados na sua conta.</p></div>
      <ButtonLink href="/lookup"><Icon name="search" />Consultar indicador</ButtonLink>
    </div>

    {actionError && <Alert tone="danger" data-testid="watchlist-error"><p>{actionError}</p></Alert>}

    {loading && <><p className="visually-hidden" role="status">Carregando watchlist…</p><LoadingRows /></>}

    {!loading && loadError && <Alert tone="danger" title="Não foi possível carregar a watchlist" data-testid="watchlist-error">
      <p>{loadError}</p>
      <Button variant="secondary" size="sm" onClick={retry}><Icon name="refresh" />Tentar novamente</Button>
    </Alert>}

    {!loading && !loadError && items.length === 0 && <Card>
      <EmptyState icon="eye" title="Nenhum indicador monitorado" action={<ButtonLink href="/lookup"><Icon name="search" />Consultar indicador</ButtonLink>}>
        Consulte um IP, domínio ou hash e use &quot;Adicionar à Watchlist&quot; no resultado para acompanhá-lo aqui.
      </EmptyState>
    </Card>}

    {!loading && !loadError && items.length > 0 && <>
      <div className="watchlist-toolbar">
        <fieldset className="type-picker">
          <legend className="visually-hidden">Filtrar por tipo</legend>
          {watchlistFilters.map(option => (
            <label key={option.value} className={option.value === filter ? 'type-chip selected' : 'type-chip'}>
              <input type="radio" name="watchlist-filter" value={option.value} checked={option.value === filter} onChange={() => setFilter(option.value)} />
              {option.label}<span className="type-chip-count">{counts[option.value]}</span>
            </label>
          ))}
        </fieldset>
        <div className="watchlist-search">
          <Icon name="search" />
          <input className="input" type="search" aria-label="Buscar no valor" placeholder="Buscar no valor" value={text} onChange={event => setText(event.target.value)} maxLength={512} />
        </div>
      </div>
      <p className="text-muted watchlist-summary" aria-live="polite" data-testid="watchlist-summary">
        {filtered ? `${visible.length} de ${items.length} ${items.length === 1 ? 'item' : 'itens'}` : `${items.length} ${items.length === 1 ? 'item' : 'itens'}`}
      </p>

      {visible.length === 0
        ? <Card>
          <EmptyState icon="search" title="Nenhum item encontrado" action={<Button variant="secondary" onClick={() => { setFilter('all'); setText(''); }}>Limpar filtros</Button>}>
            Nenhum indicador da sua watchlist corresponde ao filtro.
          </EmptyState>
        </Card>
        : <Card className="watchlist-card">
          <table className="watchlist-table" data-testid="watchlist">
            <caption className="visually-hidden">Indicadores monitorados</caption>
            <thead><tr><th scope="col">Tipo</th><th scope="col">Valor</th><th scope="col">Incluído em</th><th scope="col"><span className="visually-hidden">Ações</span></th></tr></thead>
            <tbody>
              {visible.map(item => {
                const href = lookupHref(item);
                return (
                  <tr key={item.id} data-testid="watchlist-item" data-type={item.itemType}>
                    <td className="watchlist-type"><Badge tone="accent">{watchlistTypeLabel(item.itemType)}</Badge></td>
                    <td className="watchlist-value"><code>{item.itemValue}</code></td>
                    <td className="watchlist-date" data-label="Incluído em"><AddedAt iso={item.createdAt} /></td>
                    <td className="watchlist-actions">
                      {href
                        ? <ButtonLink href={href} variant="secondary" size="sm" aria-label={`Consultar ${item.itemValue}`} data-testid="watchlist-lookup"><Icon name="search" />Consultar</ButtonLink>
                        : <span className="text-dim watchlist-unavailable">Consulta indisponível</span>}
                      <Button variant="ghost" size="sm" onClick={() => remove(item)} aria-label={`Remover ${item.itemValue}`}><Icon name="trash" />Remover</Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>}
    </>}
  </div>;
}

export default function DashboardPage() {
  return <RequireSession><WatchlistContent /></RequireSession>;
}

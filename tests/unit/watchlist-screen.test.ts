import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countByFilter, filterWatchlist, lookupHref, restoreItem, watchlistTypeLabel } from '../../src/frontend/src/lib/watchlist';
import type { WatchlistItem } from '../../src/frontend/src/lib/api';

const sha256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const items: WatchlistItem[] = [
  { id: '1', itemType: 'ip', itemValue: '8.8.8.8' },
  { id: '2', itemType: 'domain', itemValue: 'Example.com' },
  { id: '3', itemType: 'hash', itemValue: sha256 },
  { id: '4', itemType: 'email', itemValue: 'a@example.com' },
  { id: '5', itemType: 'ip', itemValue: '8.8.8.8' }
];
const ids = (list: WatchlistItem[]) => list.map(item => item.id);

// SPEC-FDE 006 F5.2: local filter by type and text.
describe('filterWatchlist (F5.2)', () => {
  it('filters by type and keeps the original order', () => {
    assert.deepEqual(ids(filterWatchlist(items, 'all', '')), ['1', '2', '3', '4', '5']);
    assert.deepEqual(ids(filterWatchlist(items, 'ip', '')), ['1', '5']);
    assert.deepEqual(ids(filterWatchlist(items, 'hash', '')), ['3']);
  });
  it('searches the value case-insensitively and ignores surrounding spaces', () => {
    assert.deepEqual(ids(filterWatchlist(items, 'all', '  EXAMPLE ')), ['2', '4']);
    assert.deepEqual(ids(filterWatchlist(items, 'domain', 'example')), ['2']);
    assert.deepEqual(ids(filterWatchlist(items, 'all', 'e3b0c4')), ['3']);
    assert.deepEqual(filterWatchlist(items, 'ip', 'example'), []);
  });
  it('counts items per option; email only in "Todos"', () => {
    assert.deepEqual(countByFilter(items), { all: 5, ip: 2, domain: 1, hash: 1 });
    assert.deepEqual(countByFilter([]), { all: 0, ip: 0, domain: 0, hash: 0 });
  });
});

// SPEC-FDE 006 F5.3: "Consultar" opens /lookup with type and value.
describe('lookupHref (F5.3)', () => {
  it('builds an encoded /lookup address for the queryable types', () => {
    assert.equal(lookupHref({ itemType: 'ip', itemValue: '8.8.8.8' }), '/lookup?type=ip&q=8.8.8.8');
    assert.equal(lookupHref({ itemType: 'ip', itemValue: '2001:db8::1' }), '/lookup?type=ip&q=2001%3Adb8%3A%3A1');
    assert.equal(lookupHref({ itemType: 'hash', itemValue: sha256 }), `/lookup?type=hash&q=${sha256}`);
  });
  it('has no address for types without a lookup', () => {
    assert.equal(lookupHref({ itemType: 'email', itemValue: 'a@example.com' }), null);
    assert.equal(lookupHref({ itemType: 'other', itemValue: 'x' }), null);
  });
  it('labels types in Portuguese and keeps unknown ones', () => {
    assert.deepEqual(['ip', 'domain', 'hash', 'email', 'other'].map(watchlistTypeLabel), ['IP', 'Domínio', 'Hash', 'Email', 'other']);
  });
});

// SPEC-FDE 006 F5.4: an item comes back to where it was.
describe('restoreItem (F5.4)', () => {
  it('puts the item back at its index, clamped to the list', () => {
    const rest = items.filter(item => item.id !== '3');
    assert.deepEqual(ids(restoreItem(rest, items[2], 2)), ['1', '2', '3', '4', '5']);
    assert.deepEqual(ids(restoreItem(rest, items[2], 99)), ['1', '2', '4', '5', '3']);
    assert.deepEqual(ids(restoreItem(rest, items[2], -1)), ['3', '1', '2', '4', '5']);
  });
  it('does not duplicate an item that is already there', () => {
    assert.deepEqual(ids(restoreItem(items, items[0], 3)), ['1', '2', '3', '4', '5']);
  });
});

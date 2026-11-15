import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ListingAdvertisement } from '@estate-erp/api-client';
import { adTableColumns, clampAdColumnWidth, getAdTableLayout, parseAdTablePreferences, sortPropertyAdRows, type PropertyAdRow, type AdTableSort } from '../src/renderer/routes/_authenticated/properties/-components/property-ad-table-state';

function row(id: string, fields: Partial<ListingAdvertisement> = {}, trade = 'sale'): PropertyAdRow {
  return { listing: { transactionType: trade }, advertisement: {
    id, channel: 'esiljang', status: 'active', advertisedPrice: null, advertisedDeposit: null,
    advertisedMonthlyRent: null, startedAt: null, memo: null, url: null, ...fields,
  } as ListingAdvertisement };
}
const ids = (rows: PropertyAdRow[], sort: AdTableSort) => sortPropertyAdRows(rows, sort).map(r => r.advertisement.id);

describe('advertisement table sorting', () => {
  it('sorts raw ad amounts numerically, retains zero, keeps missing last and ties stable', () => {
    const rows = [row('missing'), row('large', { advertisedPrice: 100000 }), row('small', { advertisedDeposit: 90000 }), row('equal', { advertisedPrice: 90000 }), row('zero', { advertisedDeposit: 0 })];
    assert.deepEqual(ids(rows, { column: 'price', direction: 'asc' }), ['zero', 'small', 'equal', 'large', 'missing']);
    assert.deepEqual(ids(rows, { column: 'price', direction: 'desc' }), ['large', 'small', 'equal', 'zero', 'missing']);
    assert.deepEqual(ids(rows, null), ['missing', 'large', 'small', 'equal', 'zero']);
  });
  it('sorts monthly rent separately and dates chronologically across years', () => {
    const rows = [row('missing'), row('new', { advertisedMonthlyRent: 180, startedAt: '2026-01-01' }), row('old', { advertisedMonthlyRent: 0, startedAt: '2025-12-31' }), row('invalid', { startedAt: 'invalid' })];
    assert.deepEqual(ids(rows, { column: 'monthlyRent', direction: 'asc' }), ['old', 'new', 'missing', 'invalid']);
    assert.deepEqual(ids(rows, { column: 'startedAt', direction: 'desc' }), ['new', 'old', 'missing', 'invalid']);
  });
  it('sorts visible Korean labels and preserves source order when sorting is cleared', () => {
    const rows = [row('e', { channel: 'esiljang' }), row('b', { channel: 'budongsanbank' }), row('unknown', { channel: '채널 10' }), row('two', { channel: '채널 2' })];
    assert.deepEqual(ids(rows, { column: 'channel', direction: 'asc' }), ['b', 'e', 'two', 'unknown']);
    assert.deepEqual(ids(rows, null), ['e', 'b', 'unknown', 'two']);
  });
  it('sorts trade, status, memo and original URL independently', () => {
    const rows = [row('end', { status: 'ended', memo: '나', url: 'https://example.test/10' }, 'jeonse'), row('active', { memo: '가', url: 'https://example.test/2' }, 'monthly'), row('empty')];
    assert.deepEqual(ids(rows, { column: 'trade', direction: 'asc' }), ['empty', 'active', 'end']);
    assert.deepEqual(ids(rows, { column: 'status', direction: 'asc' }), ['active', 'empty', 'end']);
    assert.deepEqual(ids(rows, { column: 'memo', direction: 'desc' }), ['end', 'active', 'empty']);
    assert.deepEqual(ids(rows, { column: 'url', direction: 'asc' }), ['active', 'end', 'empty']);
  });
});

describe('advertisement column preferences', () => {
  it('bounds persisted widths and rejects stale or malformed settings', () => {
    const parsed = parseAdTablePreferences(JSON.stringify({ widths: { price: 1, memo: 9000, channel: '200', deleted: 100 }, sort: { column: 'price', direction: 'desc' } }));
    assert.deepEqual(parsed, { widths: { price: 130, memo: 1200 }, sort: { column: 'price', direction: 'desc' } });
    for (const raw of ['broken', 'null', '[]', '{"sort":{"column":"__proto__","direction":"asc"}}']) assert.deepEqual(parseAdTablePreferences(raw), { widths: {}, sort: null });
    assert.equal(clampAdColumnWidth('price', NaN), 180);
  });
  it('keeps the memo flexible until resizing freezes measured column widths', () => {
    const initial = getAdTableLayout({});
    assert.equal(initial.width, undefined);
    assert.match(initial.gridTemplateColumns, /minmax\(180px, 1fr\)/);
    assert.equal(initial.minWidth, 1054);
    const measured = Object.fromEntries(adTableColumns.map(c => [c.id, c.id === 'memo' ? 400 : c.width]));
    const resized = getAdTableLayout({ ...measured, price: 220 });
    assert.doesNotMatch(resized.gridTemplateColumns, /minmax/);
    assert.equal(resized.width, 1314);
    assert.equal(resized.minWidth, 1314);
  });
});

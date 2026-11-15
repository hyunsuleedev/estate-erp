import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clampCompetitorColumnWidth, competitorTableColumns, competitorTableStorageKey, getCompetitorTableLayout,
  parseCompetitorTablePreferences, sortCompetitorRows, type CompetitorTableRow, type CompetitorTableSort,
} from '../src/renderer/routes/_authenticated/properties/-my-ads/my-ads-competitor-table-state';

function row(id: string, fields: Partial<CompetitorTableRow> = {}): CompetitorTableRow {
  return {
    id, ranking: null, realtorName: null, primaryAmount: null, monthlyRent: null, floorInfo: null,
    floorExposureMode: 'unknown', articleConfirmYmd: null, seango: false, epju: false,
    priceRelation: 'unknown', isAhead: false, ...fields,
  };
}
const ids = (rows: CompetitorTableRow[], sort: CompetitorTableSort) => sortCompetitorRows(rows, sort).map(r => r.id);

describe('competitor table sorting', () => {
  it('sorts ranks numerically, keeps missing last in both directions and restores source order', () => {
    const rows = [row('missing'), row('ten', { ranking: 10 }), row('two', { ranking: 2 }), row('first', { ranking: 1 })];
    assert.deepEqual(ids(rows, { column: 'rank', direction: 'asc' }), ['first', 'two', 'ten', 'missing']);
    assert.deepEqual(ids(rows, { column: 'rank', direction: 'desc' }), ['ten', 'two', 'first', 'missing']);
    assert.deepEqual(ids(rows, null), ['missing', 'ten', 'two', 'first']);
  });
  it('sorts raw amounts, retains zero, breaks monthly deposit ties by rent and keeps ties stable', () => {
    const rows = [
      row('missing'), row('large', { primaryAmount: 100000 }), row('zero', { primaryAmount: 0 }),
      row('rent150', { primaryAmount: 5000, monthlyRent: 150 }), row('rent90', { primaryAmount: 5000, monthlyRent: 90 }),
      row('rentOnly', { monthlyRent: 120 }), row('sameA', { primaryAmount: 70000 }), row('sameB', { primaryAmount: 70000 }),
    ];
    assert.deepEqual(ids(rows, { column: 'price', direction: 'asc' }), ['zero', 'rent90', 'rent150', 'sameA', 'sameB', 'large', 'rentOnly', 'missing']);
    assert.deepEqual(ids(rows, { column: 'price', direction: 'desc' }), ['large', 'sameA', 'sameB', 'rent150', 'rent90', 'zero', 'rentOnly', 'missing']);
  });
  it('sorts confirmation dates chronologically across years and ignores malformed dates', () => {
    const rows = [row('bad', { articleConfirmYmd: '2026-01' }), row('new', { articleConfirmYmd: '20260102' }), row('old', { articleConfirmYmd: '20251231' }), row('none')];
    assert.deepEqual(ids(rows, { column: 'confirmedAt', direction: 'asc' }), ['old', 'new', 'bad', 'none']);
    assert.deepEqual(ids(rows, { column: 'confirmedAt', direction: 'desc' }), ['new', 'old', 'bad', 'none']);
  });
  it('sorts Korean realtor names with numeric collation and treats blank names as missing', () => {
    const rows = [row('blank', { realtorName: '  ' }), row('ten', { realtorName: '공인중개사 10' }), row('ga', { realtorName: '가람부동산' }), row('two', { realtorName: '공인중개사 2' })];
    assert.deepEqual(ids(rows, { column: 'realtor', direction: 'asc' }), ['ga', 'two', 'ten', 'blank']);
    assert.deepEqual(ids(rows, { column: 'realtor', direction: 'desc' }), ['ten', 'two', 'ga', 'blank']);
  });
  it('sorts floor exposure by exact floors first, then 저·중·고 bands, then unknown', () => {
    const rows = [
      row('none'), row('high', { floorInfo: '고/25', floorExposureMode: 'band' }), row('twelve', { floorInfo: '12/25', floorExposureMode: 'exact' }),
      row('low', { floorInfo: '저/25', floorExposureMode: 'band' }), row('basement', { floorInfo: 'B1/25', floorExposureMode: 'exact' }),
      row('three', { floorInfo: '3층/25', floorExposureMode: 'exact' }), row('odd', { floorInfo: '탑층', floorExposureMode: 'unknown' }),
    ];
    assert.deepEqual(ids(rows, { column: 'floor', direction: 'asc' }), ['basement', 'three', 'twelve', 'low', 'high', 'odd', 'none']);
    assert.deepEqual(ids(rows, { column: 'floor', direction: 'desc' }), ['odd', 'high', 'low', 'twelve', 'three', 'basement', 'none']);
  });
  it('sorts paid options by weight and leaves rows without options last', () => {
    const rows = [row('none'), row('epju', { epju: true }), row('both', { seango: true, epju: true }), row('seango', { seango: true })];
    assert.deepEqual(ids(rows, { column: 'options', direction: 'asc' }), ['epju', 'seango', 'both', 'none']);
    assert.deepEqual(ids(rows, { column: 'options', direction: 'desc' }), ['both', 'seango', 'epju', 'none']);
  });
  it('orders the comparison from cheaper to pricier, ahead first within a relation, unknown last', () => {
    const rows = [
      row('unknown', { priceRelation: 'unknown', isAhead: true }), row('higher', { priceRelation: 'higher' }), row('mine', { priceRelation: 'mine' }),
      row('lowerBehind', { priceRelation: 'lower' }), row('lowerAhead', { priceRelation: 'lower', isAhead: true }),
      row('same', { priceRelation: 'same' }), row('other', { priceRelation: 'incomparable' }),
    ];
    assert.deepEqual(ids(rows, { column: 'comparison', direction: 'asc' }), ['lowerAhead', 'lowerBehind', 'mine', 'same', 'higher', 'other', 'unknown']);
    assert.deepEqual(ids(rows, { column: 'comparison', direction: 'desc' }), ['other', 'higher', 'same', 'mine', 'lowerBehind', 'lowerAhead', 'unknown']);
  });
});

describe('competitor table preferences', () => {
  it('scopes storage per office and user', () => {
    assert.equal(competitorTableStorageKey('office-1', 'user-1'), 'estate:my-ads-competitor-table:v1:office-1:user-1');
  });
  it('bounds persisted widths and rejects stale or malformed settings', () => {
    const parsed = parseCompetitorTablePreferences(JSON.stringify({
      widths: { price: 1, realtor: 9000, rank: '200', deleted: 100, floor: Number.NaN }, sort: { column: 'confirmedAt', direction: 'desc' },
    }));
    assert.deepEqual(parsed, { widths: { price: 120, realtor: 1200 }, sort: { column: 'confirmedAt', direction: 'desc' } });
    for (const raw of [null, 'broken', 'null', '[]', '"text"', '{"sort":{"column":"__proto__","direction":"asc"}}', '{"sort":{"column":"rank","direction":"up"}}', '{"sort":{"column":"memo","direction":"asc"}}']) {
      assert.deepEqual(parseCompetitorTablePreferences(raw), { widths: {}, sort: null });
    }
    assert.equal(clampCompetitorColumnWidth('price', NaN), 180);
    assert.equal(clampCompetitorColumnWidth('rank', 70.6), 71);
  });
  it('keeps the realtor column flexible until resizing freezes measured widths', () => {
    const initial = getCompetitorTableLayout({});
    assert.equal(initial.width, undefined);
    assert.equal(initial.gridTemplateColumns, '76px minmax(200px, 1fr) 180px 124px 104px 128px 148px');
    assert.equal(initial.minWidth, 960);
    assert.equal(competitorTableColumns.reduce((sum, c) => sum + c.width, 0), 960);
    // 한 열을 끌면 공유 머리글이 실제 표시 폭을 모두 재서 저장한다.
    const measured = Object.fromEntries(competitorTableColumns.map(c => [c.id, c.id === 'realtor' ? 420 : c.width]));
    const resized = getCompetitorTableLayout({ ...measured, price: 220 });
    assert.doesNotMatch(resized.gridTemplateColumns, /minmax/);
    assert.equal(resized.width, 1220);
    assert.equal(resized.minWidth, 1220);
    // 중개사 열만 기본으로 되돌리면 다시 남는 폭을 차지한다.
    const withoutRealtor: Record<string, number> = { ...measured, price: 220 };
    delete withoutRealtor.realtor;
    const reset = getCompetitorTableLayout(withoutRealtor);
    assert.equal(reset.width, undefined);
    assert.match(reset.gridTemplateColumns, /minmax\(200px, 1fr\)/);
    assert.equal(reset.minWidth, 1000);
  });
});

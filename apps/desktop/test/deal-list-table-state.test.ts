import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Deal } from '@estate-erp/api-client';
import {
  getDealPropertyCells,
  sortDealTableRows,
} from '../src/renderer/routes/_authenticated/deals/-deal-list-table-state';

const referenceDate = new Date('2026-11-15T12:00:00');
function deal(id: string, unit: string | null, price: number): Deal {
  return {
    id,
    agreedPrice: price,
    property: {
      site: { name: ' 고덕그라시움 ' },
      unit: { name: unit, dong: { name: '101', isPlaceholder: false } },
    },
  } as Deal;
}

describe('deal list property table', () => {
  it('keeps site, dong and unit separate and omits placeholder buildings', () => {
    const row = deal('one', '3401', 10000);
    assert.deepEqual(getDealPropertyCells(row), {
      site: '고덕그라시움',
      dong: '101',
      unit: '3401',
    });
    row.property!.unit!.dong!.isPlaceholder = true;
    assert.deepEqual(getDealPropertyCells(row), {
      site: '고덕그라시움',
      dong: null,
      unit: '3401',
    });
    assert.deepEqual(getDealPropertyCells({ id: 'external' } as Deal), {
      site: null,
      dong: null,
      unit: null,
    });
  });

  it('sorts unit numbers naturally and leaves missing values last in either direction', () => {
    const rows = [
      deal('ten', '10', 20),
      deal('missing', null, 10),
      deal('two', '2', 30),
    ];
    assert.deepEqual(
      sortDealTableRows(rows, [{ id: 'unit', desc: false }], referenceDate).map(
        (r) => r.id,
      ),
      ['two', 'ten', 'missing'],
    );
    assert.deepEqual(
      sortDealTableRows(rows, [{ id: 'unit', desc: true }], referenceDate).map(
        (r) => r.id,
      ),
      ['ten', 'two', 'missing'],
    );
    assert.deepEqual(
      rows.map((r) => r.id),
      ['ten', 'missing', 'two'],
    );
  });

  it('sorts amounts numerically and restores the supplied workflow order when cleared', () => {
    const rows = [deal('high', '1', 10000), deal('low', '2', 900)];
    assert.deepEqual(
      sortDealTableRows(
        rows,
        [{ id: 'amount', desc: false }],
        referenceDate,
      ).map((r) => r.id),
      ['low', 'high'],
    );
    assert.equal(sortDealTableRows(rows, [], referenceDate), rows);
  });
});

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { movePropertyCell, resolvePropertyCell } from '../src/renderer/routes/_authenticated/properties/-property-cell-navigation';

describe('property listing cell navigation', () => {
  const rows = [
    { id: 'before', listings: [{ id: 'before-sale' }] },
    { id: 'group', listings: [{ id: 'sale' }, { id: 'lease' }, { id: 'rent' }] },
    { id: 'after', listings: [{ id: 'after-rent' }] },
  ];
  const columns = [
    { id: 'site', listingCell: false },
    { id: 'price', listingCell: true },
    { id: 'monthlyRent', listingCell: true },
    { id: 'moveInAvailable', listingCell: true },
    { id: 'memo', listingCell: false },
  ];
  const cell = { rowId: 'group', columnId: 'price', listingId: 'lease' };

  it('moves down/up through each transaction before leaving the virtual group', () => {
    assert.deepEqual(movePropertyCell(cell, rows, columns, 'down'), { ...cell, listingId: 'rent' });
    assert.deepEqual(movePropertyCell(cell, rows, columns, 'up'), { ...cell, listingId: 'sale' });
    assert.deepEqual(movePropertyCell({ ...cell, listingId: 'rent' }, rows, columns, 'down'), {
      rowId: 'after', columnId: 'price', listingId: 'after-rent',
    });
    assert.deepEqual(movePropertyCell({ rowId: 'after', columnId: 'price' }, rows, columns, 'up'), {
      ...cell, listingId: 'rent',
    });
  });

  it('keeps the same listing across price, empty rent, date and merged cells', () => {
    const rent = movePropertyCell(cell, rows, columns, 'next')!;
    assert.deepEqual(rent, { ...cell, columnId: 'monthlyRent' });
    const date = movePropertyCell(rent, rows, columns, 'next')!;
    const memo = movePropertyCell(date, rows, columns, 'next')!;
    assert.deepEqual(memo, { ...cell, columnId: 'memo' });
    assert.deepEqual(movePropertyCell(memo, rows, columns, 'previous'), date);
    const site = movePropertyCell(cell, rows, columns, 'previous')!;
    assert.deepEqual(movePropertyCell(site, rows, columns, 'next'), cell);
    assert.deepEqual(movePropertyCell(site, rows, columns, 'down'), { rowId: 'after', columnId: 'site' });
  });

  it('uses stable IDs after sorting and skips hidden columns', () => {
    const reordered = [rows[2], { ...rows[1], listings: [...rows[1].listings].reverse() }, rows[0]];
    assert.deepEqual(movePropertyCell(cell, reordered, columns, 'current'), cell);
    assert.deepEqual(movePropertyCell(cell, reordered, columns, 'down'), { ...cell, listingId: 'sale' });
    assert.deepEqual(movePropertyCell(cell, rows, columns.filter((column) => column.id !== 'monthlyRent'), 'next'), {
      ...cell, columnId: 'moveInAvailable',
    });
    assert.equal(resolvePropertyCell(cell, rows.slice(2), columns), null);
    assert.equal(resolvePropertyCell(cell, rows, columns.filter((column) => column.id !== 'price')), null);
    assert.equal(resolvePropertyCell(cell, [{ id: 'group', listings: [{ id: 'sale' }] }], columns), null);
  });

  it('handles single, empty, first and last groups without losing selection', () => {
    const first = { rowId: 'before', columnId: 'price', listingId: 'before-sale' };
    assert.deepEqual(movePropertyCell(first, rows, columns, 'up'), first);
    const last = { rowId: 'after', columnId: 'price', listingId: 'after-rent' };
    assert.deepEqual(movePropertyCell(last, rows, columns, 'down'), last);
    const emptyRows = [...rows, { id: 'empty', listings: [] }];
    const empty = { rowId: 'empty', columnId: 'price' };
    assert.deepEqual(movePropertyCell(last, emptyRows, columns, 'down'), empty);
    assert.deepEqual(movePropertyCell(empty, emptyRows, columns, 'up'), last);
    assert.deepEqual(resolvePropertyCell({ rowId: 'group', columnId: 'price' }, rows, columns), {
      ...cell, listingId: 'sale',
    });
  });
});

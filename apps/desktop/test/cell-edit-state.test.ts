import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ApiError } from '@estate-erp/api-client';
import {
  CellDraftStore,
  moveTableCell,
  parseCellNumber,
} from '../src/renderer/components/data-table/cell-edit-state';

describe('cell number validation', () => {
  it('distinguishes an explicit clear from zero and formatted amounts', () => {
    assert.deepEqual(parseCellNumber('  ', 0), { valid: true, value: null });
    assert.deepEqual(parseCellNumber('0', 0), { valid: true, value: 0 });
    assert.deepEqual(parseCellNumber('158,000', 0), {
      valid: true,
      value: 158000,
    });
    assert.deepEqual(parseCellNumber('１，０００', 0), {
      valid: true,
      value: 1000,
    });
    assert.deepEqual(parseCellNumber('12.5', 0), { valid: true, value: 12.5 });
  });
  it('never converts invalid money into a deletion or nonfinite payload', () => {
    for (const raw of [
      '1,00',
      '15억',
      'NaN',
      'Infinity',
      '1e309',
      '0x10',
      '--1',
      '-1',
      '9007199254740992',
    ]) {
      assert.equal(parseCellNumber(raw, 0).valid, false, raw);
    }
    assert.deepEqual(parseCellNumber('-1.5'), { valid: true, value: -1.5 });
  });
});

describe('cell save recovery', () => {
  it('retains the raw draft through a failed save and retries without retyping', async () => {
    const store = new CellDraftStore();
    store.patch('memo', { text: '첫 줄\n둘째 줄' });
    assert.equal(
      await store.save('memo', async () => {
        throw new Error('offline');
      }),
      false,
    );
    assert.equal(store.get('memo')?.text, '첫 줄\n둘째 줄');
    assert.match(store.get('memo')?.error ?? '', /입력은 유지/);
    assert.equal(store.get('memo')?.saving, false);
    assert.equal(await store.save('memo', async () => undefined), true);
    assert.equal(store.get('memo')?.error, undefined);
    assert.equal(store.get('memo')?.text, '첫 줄\n둘째 줄');
  });
  it('prevents duplicate requests while preserving an in-flight draft', async () => {
    const store = new CellDraftStore();
    store.patch('price', { text: '1,000' });
    let resolve!: () => void;
    let writes = 0;
    const first = store.save('price', () => {
      writes++;
      return new Promise<void>((done) => {
        resolve = done;
      });
    });
    assert.equal(store.get('price')?.saving, true);
    assert.equal(
      await store.save('price', () => {
        writes++;
      }),
      false,
    );
    assert.equal(writes, 1);
    resolve();
    assert.equal(await first, true);
    assert.equal(store.get('price')?.text, '1,000');
  });
  it('preserves validation failures and explains conflicts separately', async () => {
    const store = new CellDraftStore();
    store.patch('memo', { text: 'keep' });
    assert.equal(await store.save('memo', () => false), false);
    assert.equal(store.get('memo')?.text, 'keep');
    await store.save('memo', () => {
      throw new ApiError(409, { message: 'Concurrent edit' });
    });
    assert.match(store.get('memo')?.error ?? '', /다른 사용자가 수정/);
  });
  it('isolates providers and only removes the cancelled cell', () => {
    const first = new CellDraftStore(),
      second = new CellDraftStore();
    first.patch('a', { text: 'one' });
    first.patch('b', { text: 'two' });
    second.patch('a', { text: 'other table' });
    first.delete('a');
    assert.equal(first.get('b')?.text, 'two');
    assert.equal(second.get('a')?.text, 'other table');
  });
});

describe('table cell navigation', () => {
  const cell = { rowId: 'b', columnId: 'price' };
  it('uses stable IDs after sorting and skips hidden columns', () => {
    assert.deepEqual(
      moveTableCell(cell, ['c', 'b', 'a'], ['site', 'price', 'memo'], 'down'),
      { rowId: 'a', columnId: 'price' },
    );
    assert.deepEqual(
      moveTableCell(cell, ['a', 'b'], ['site', 'price', 'memo'], 'next'),
      { rowId: 'b', columnId: 'memo' },
    );
    assert.equal(moveTableCell(cell, ['a'], ['price'], 'current'), null);
    assert.equal(moveTableCell(cell, ['b'], ['memo'], 'current'), null);
  });
  it('keeps the last row and column selected at the table edge', () => {
    assert.deepEqual(
      moveTableCell(cell, ['a', 'b'], ['site', 'price'], 'down'),
      cell,
    );
    assert.deepEqual(
      moveTableCell(cell, ['a', 'b'], ['site', 'price'], 'next'),
      cell,
    );
    assert.deepEqual(
      moveTableCell(cell, ['a', 'b'], ['site', 'price'], 'previous'),
      { rowId: 'b', columnId: 'site' },
    );
  });
});

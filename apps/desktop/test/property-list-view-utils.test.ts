import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getListingPrimaryPrice,
  getMoveInAvailability,
} from '../src/renderer/routes/_authenticated/properties/-property-list-view-utils';

describe('desktop property list view utilities', () => {
  it('reads a jeonse amount from price, not the monthly deposit field', () => {
    assert.equal(
      getListingPrimaryPrice({
        transactionType: 'jeonse',
        price: 101058,
        deposit: null,
      }),
      101058,
    );
  });

  it('uses a quiet neutral pill for known move-in availability', () => {
    assert.deepEqual(getMoveInAvailability({ moveInAvailableType: 'immediate' }), {
      label: '즉시',
      detail: null,
      className: 'bg-neutral-soft text-neutral-strong',
    });
  });

  it('shows unknown move-in availability as a quiet dash, like other empty cells', () => {
    assert.deepEqual(getMoveInAvailability({ moveInAvailableType: 'unknown' }), {
      label: '-',
      detail: null,
      className: 'px-0 text-muted-foreground',
    });
  });
});

describe('row updated date', () => {
  it('takes the most recent change among the intake and its deal terms', async () => {
    const loaded = (await import(
      '../src/renderer/routes/_authenticated/properties/-property-list-view-utils.ts'
    )) as unknown as Record<string, unknown>;
    const { getRowUpdatedAt } = (loaded.default ?? loaded) as {
      getRowUpdatedAt: (intake: string | null | undefined, listings: Array<{ updatedAt?: string | null }>) => string | null;
    };
    // 가격을 고치면 거래 조건이, 메모 · 확인은 의뢰가 바뀐다 — 어느 쪽이든 가장 최근 것이 수정일이다
    assert.equal(
      getRowUpdatedAt('2026-11-20T00:00:00.000Z', [
        { updatedAt: '2026-11-25T03:00:00.000Z' },
        { updatedAt: '2026-11-10T00:00:00.000Z' },
      ]),
      '2026-11-25T03:00:00.000Z',
    );
    assert.equal(
      getRowUpdatedAt('2026-11-27T00:00:00.000Z', [{ updatedAt: '2026-11-25T03:00:00.000Z' }]),
      '2026-11-27T00:00:00.000Z',
    );
    // 읽을 수 없는 값은 건너뛰고, 하나도 없으면 null
    assert.equal(getRowUpdatedAt('not a date', [{ updatedAt: null }, {}]), null);
    assert.equal(getRowUpdatedAt(null, [{ updatedAt: '2026-11-01T00:00:00.000Z' }]), '2026-11-01T00:00:00.000Z');
  });
});


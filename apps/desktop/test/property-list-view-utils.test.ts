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

  it('reserves the warning pill for move-in availability that needs confirmation', () => {
    assert.deepEqual(getMoveInAvailability({ moveInAvailableType: 'unknown' }), {
      label: '확인 필요',
      detail: null,
      className: 'bg-warning-soft text-warning-strong',
    });
  });
});

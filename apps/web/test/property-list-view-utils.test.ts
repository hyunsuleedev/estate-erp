import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getMoveInAvailability,
  getTenantPhoneLine,
} from '../src/routes/_authenticated/properties/-property-list-view-utils';

describe('property list view utilities', () => {
  it('shows only the date range for move-in range availability', () => {
    const summary = getMoveInAvailability({
      moveInAvailableType: 'range',
      moveInAvailableFrom: '2026-05-01T00:00:00.000Z',
      moveInAvailableTo: '2026-05-31T00:00:00.000Z',
    });

    assert.equal(summary.label, '5. 1.~5. 31.');
    assert.equal(summary.detail, null);
  });

  it('puts tenant lease expiry next to the phone number', () => {
    assert.equal(
      getTenantPhoneLine({
        contact: { phone: '010-1234-5678' },
        contractEnd: '2026-08-31T00:00:00.000Z',
      }),
      '010-1234-5678 · 만기 8. 31.',
    );
  });
});

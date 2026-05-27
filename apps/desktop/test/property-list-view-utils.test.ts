import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getListingIntakeStatusOptions } from '../src/renderer/routes/_authenticated/properties/-property-list-view-utils';

describe('desktop property list view utilities', () => {
  it('uses Listing status options for ListingIntake status choices in the property table', () => {
    assert.deepEqual(getListingIntakeStatusOptions(), [
      { label: '미확인', value: 'unverified' },
      { label: '활성', value: 'active' },
      { label: '거래중', value: 'in_contract' },
      { label: '보류', value: 'hold' },
      { label: '종료', value: 'done' },
    ]);
  });
});

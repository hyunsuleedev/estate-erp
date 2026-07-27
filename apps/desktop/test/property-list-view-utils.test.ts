import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { getMoveInAvailability } from '../src/renderer/routes/_authenticated/properties/-property-list-view-utils';

describe('desktop property list view utilities', () => {
  it('keeps the desktop pill palette for move-in availability', () => {
    assert.deepEqual(getMoveInAvailability({ moveInAvailableType: 'immediate' }), {
      label: '즉시',
      detail: null,
      className: 'bg-[#eef3ed] text-[#44745a]',
    });
  });
});

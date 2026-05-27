import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getNewPropertySuccessTabAction,
  toggleTransactionType,
} from '../src/renderer/routes/_authenticated/properties/-new-property-view-utils';

describe('desktop new property view utilities', () => {
  it('opens the created property detail tab and closes the registration tab after save', () => {
    assert.deepEqual(
      getNewPropertySuccessTabAction({
        propertyId: 'property-1',
        registrationTabId: 'registration-tab',
      }),
      {
        detailRoute: '/properties/property-1',
        closeTabId: 'registration-tab',
      },
    );
  });

  it('toggles transaction types while keeping at least one selected', () => {
    assert.deepEqual(toggleTransactionType(['sale'], 'jeonse'), ['sale', 'jeonse']);
    assert.deepEqual(toggleTransactionType(['sale', 'jeonse'], 'sale'), ['jeonse']);
    assert.deepEqual(toggleTransactionType(['sale'], 'sale'), ['sale']);
  });
});

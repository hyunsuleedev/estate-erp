import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getActiveDealListingIndex,
  getListingAvailability,
  getListingRowAvailability,
  planListingStatusChange,
} from '../src/renderer/lib/listing-status';

describe('desktop listing availability', () => {
  it('derives the four listing states without a stored status column', () => {
    assert.equal(
      getListingAvailability({
        intake: { lifecycleStatus: 'open' },
        deals: [],
      }),
      'available',
    );
    assert.equal(
      getListingAvailability({
        isPaused: true,
        intake: { lifecycleStatus: 'open' },
        deals: [],
      }),
      'paused',
    );
    assert.equal(
      getListingAvailability({
        intake: { lifecycleStatus: 'open' },
        deals: [{ stage: 'preparing' }],
      }),
      'in_contract',
    );
    assert.equal(
      getListingAvailability({
        intake: { lifecycleStatus: 'open' },
        deals: [{ stage: 'completed' }],
      }),
      'closed',
    );
  });

  it('keeps a multi-transaction row available while one option remains usable', () => {
    const completedListing = {
      intake: { lifecycleStatus: 'open' },
      deals: [{ stage: 'completed' }],
    };
    const availableListing = {
      intake: { lifecycleStatus: 'open' },
      deals: [],
    };

    assert.equal(
      getListingRowAvailability(
        { lifecycleStatus: 'open' },
        [completedListing, availableListing],
      ),
      'available',
    );
    assert.deepEqual(
      planListingStatusChange(
        'available',
        'in_contract',
        [completedListing, availableListing],
      ),
      {
        kind: 'startDeal',
        candidates: [availableListing],
      },
    );
  });

  it('locates the one listing occupied by the active Deal', () => {
    assert.equal(
      getActiveDealListingIndex([
        { deals: [{ stage: 'completed' }] },
        { deals: [{ stage: 'contracted' }] },
        { deals: [] },
      ]),
      1,
    );
    assert.equal(
      getActiveDealListingIndex([
        { deals: [{ stage: 'completed' }] },
        { deals: [] },
      ]),
      -1,
    );
  });

  it('requires confirmation when closing a row with active Deals', () => {
    const listings = [
      {
        intake: { lifecycleStatus: 'open' },
        deals: [{ stage: 'preparing' }, { stage: 'contracted' }],
      },
      {
        intake: { lifecycleStatus: 'open' },
        deals: [],
      },
    ];

    assert.deepEqual(
      planListingStatusChange('in_contract', 'closed', listings),
      { kind: 'closeWithActiveDeals', activeDealCount: 2 },
    );
    assert.deepEqual(
      planListingStatusChange('in_contract', 'paused', listings),
      { kind: 'blocked', reason: 'activeDeal' },
    );
  });

  it('requires confirmation before reopening a manually closed intake', () => {
    const listing = {
      intake: { lifecycleStatus: 'closed' },
      deals: [],
    };

    assert.deepEqual(
      planListingStatusChange('closed', 'available', [listing]),
      {
        kind: 'reviewResume',
        canResume: true,
        completedListingCount: 0,
        resumableListingCount: 1,
      },
    );
    assert.deepEqual(
      planListingStatusChange('closed', 'paused', [listing]),
      {
        kind: 'reviewResume',
        canResume: true,
        completedListingCount: 0,
        resumableListingCount: 1,
      },
    );
  });

  it('does not reopen a completed Deal as paused', () => {
    const listing = {
      intake: { lifecycleStatus: 'open' },
      deals: [{ stage: 'completed' }],
    };

    assert.deepEqual(
      planListingStatusChange('closed', 'paused', [listing]),
      {
        kind: 'reviewResume',
        canResume: false,
        completedListingCount: 1,
        resumableListingCount: 0,
      },
    );
  });
});

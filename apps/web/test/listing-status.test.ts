import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getIntakeConfirmationState,
  getListingAvailability,
  getListingRowAvailability,
  isListingOccupied,
  planListingStatusChange,
} from '../src/lib/listing-status';

describe('listing status derivation', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');

  it('keeps confirmation states disjoint and gives no-answer precedence', () => {
    assert.equal(
      getIntakeConfirmationState(
        {
          lifecycleStatus: 'open',
          lastVerifiedAt: null,
          lastCheckResult: 'no_answer',
          nextConfirmAt: '2026-07-20T00:00:00.000Z',
        },
        now,
      ),
      'no_answer',
    );
    assert.equal(
      getIntakeConfirmationState(
        {
          lifecycleStatus: 'open',
          lastVerifiedAt: null,
          lastCheckResult: null,
          nextConfirmAt: null,
        },
        now,
      ),
      'unverified',
    );
  });

  it('marks verified, non-closed intakes overdue after nextConfirmAt', () => {
    assert.equal(
      getIntakeConfirmationState(
        {
          lifecycleStatus: 'open',
          lastVerifiedAt: '2026-07-01T00:00:00.000Z',
          lastCheckResult: 'alive',
          nextConfirmAt: '2026-07-23T00:00:00.000Z',
        },
        now,
      ),
      'overdue',
    );
    assert.equal(
      getIntakeConfirmationState(
        {
          lifecycleStatus: 'closed',
          lastVerifiedAt: '2026-07-01T00:00:00.000Z',
          lastCheckResult: 'alive',
          nextConfirmAt: '2026-07-23T00:00:00.000Z',
        },
        now,
      ),
      'verified',
    );
  });

  it('maps a completed Deal to closed before other derived states', () => {
    assert.equal(
      getListingAvailability({
        isPaused: true,
        intake: { lifecycleStatus: 'closed' },
        deals: [{ stage: 'preContract' }, { stage: 'completed' }],
      }),
      'closed',
    );
    assert.equal(
      getListingAvailability({
        isPaused: true,
        intake: { lifecycleStatus: 'closed' },
        deals: [{ stage: 'settling' }],
      }),
      'in_contract',
    );
  });

  it('derives closed, paused, and available without storing them on Listing', () => {
    assert.equal(
      getListingAvailability({
        isPaused: true,
        intake: { lifecycleStatus: 'closed' },
        deals: [],
      }),
      'closed',
    );
    assert.equal(
      getListingAvailability({
        isPaused: false,
        intake: { lifecycleStatus: 'hold' },
        deals: [],
      }),
      'paused',
    );
    assert.equal(
      getListingAvailability({
        isPaused: false,
        intake: { lifecycleStatus: 'open' },
        deals: [],
      }),
      'available',
    );
  });

  it('treats a newly-created active Deal as in-contract', () => {
    assert.equal(
      getListingAvailability({
        intake: { lifecycleStatus: 'open' },
        deals: [{ stage: 'preparing' }],
      }),
      'in_contract',
    );
    assert.equal(
      isListingOccupied({
        intake: { lifecycleStatus: 'open' },
        deals: [{ stage: 'preparing' }],
      }),
      true,
    );
  });

  it('opens Deal creation for a remaining Listing when the row is already in-contract', () => {
    const occupiedListing = {
      intake: { lifecycleStatus: 'open' },
      deals: [{ stage: 'preparing' }],
    };
    const availableListing = {
      intake: { lifecycleStatus: 'open' },
      deals: [],
    };

    assert.deepEqual(
      planListingStatusChange(
        'in_contract',
        'in_contract',
        [occupiedListing, availableListing],
      ),
      {
        kind: 'startDeal',
        candidates: [availableListing],
      },
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
      planListingStatusChange('in_contract', 'available', listings),
      { kind: 'blocked', reason: 'activeDeal' },
    );
  });

  it('shows a one-Listing row as closed when its Deal is completed', () => {
    const listing = {
      intake: { lifecycleStatus: 'open' },
      deals: [{ stage: 'completed' }],
    };

    assert.equal(
      getListingRowAvailability({ lifecycleStatus: 'open' }, [listing]),
      'closed',
    );
    assert.deepEqual(
      planListingStatusChange('closed', 'in_contract', [listing]),
      {
        kind: 'blocked',
        reason: 'completedDeal',
      },
    );
    assert.deepEqual(
      planListingStatusChange('closed', 'available', [listing]),
      {
        kind: 'reviewResume',
        canResume: false,
        completedListingCount: 1,
        resumableListingCount: 0,
      },
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
  });

  it('keeps a multi-Listing row available when another option remains usable', () => {
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
});

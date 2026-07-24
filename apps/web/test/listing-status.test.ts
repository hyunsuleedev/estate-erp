import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  getIntakeConfirmationState,
  getListingAvailability,
  isListingOccupied,
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

  it('uses Deal completion before in-contract, lifecycle, and pause state', () => {
    assert.equal(
      getListingAvailability({
        isPaused: true,
        intake: { lifecycleStatus: 'closed' },
        deals: [{ stage: 'preContract' }, { stage: 'completed' }],
      }),
      'completed',
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

  it('does not treat non-occupying Deal stages as occupied', () => {
    assert.equal(
      isListingOccupied({
        intake: { lifecycleStatus: 'open' },
        deals: [{ stage: 'negotiating' }],
      }),
      false,
    );
  });
});

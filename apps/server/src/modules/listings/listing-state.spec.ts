import {
  buildIntakeConfirmationWhere,
  buildListingAvailabilityWhere,
  getIntakeConfirmationState,
} from './listing-state';

describe('listing state query predicates', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');

  it('keeps unverified and no-answer confirmation filters disjoint', () => {
    expect(buildIntakeConfirmationWhere('unverified', now)).toEqual({
      lastVerifiedAt: null,
      OR: [
        { lastCheckResult: null },
        { lastCheckResult: { not: 'no_answer' } },
      ],
    });
    expect(buildIntakeConfirmationWhere('no_answer', now)).toEqual({
      lastCheckResult: 'no_answer',
    });
  });

  it('requires a prior verification for the overdue state', () => {
    expect(buildIntakeConfirmationWhere('overdue', now)).toEqual({
      lifecycleStatus: { not: 'closed' },
      lastVerifiedAt: { not: null },
      OR: [
        { lastCheckResult: null },
        { lastCheckResult: { not: 'no_answer' } },
      ],
      nextConfirmAt: { lt: now },
    });
  });

  it('derives the same confirmation state used by match progression guards', () => {
    expect(
      getIntakeConfirmationState(
        {
          lifecycleStatus: 'open',
          lastVerifiedAt: null,
          lastCheckResult: null,
          nextConfirmAt: null,
        },
        now,
      ),
    ).toBe('unverified');

    expect(
      getIntakeConfirmationState(
        {
          lifecycleStatus: 'open',
          lastVerifiedAt: new Date('2026-07-20T12:00:00.000Z'),
          lastCheckResult: 'alive',
          nextConfirmAt: new Date('2026-07-23T12:00:00.000Z'),
        },
        now,
      ),
    ).toBe('overdue');

    expect(
      getIntakeConfirmationState(
        {
          lifecycleStatus: 'open',
          lastVerifiedAt: new Date('2026-07-24T11:00:00.000Z'),
          lastCheckResult: 'alive',
          nextConfirmAt: new Date('2026-07-25T12:00:00.000Z'),
        },
        now,
      ),
    ).toBe('verified');
  });

  it('excludes completed Deals from the in-contract availability filter', () => {
    expect(buildListingAvailabilityWhere('in_contract')).toEqual({
      AND: [
        {
          deals: {
            some: {
              isCancelled: false,
              stage: {
                in: [
                  'preparing',
                  'preContract',
                  'contracted',
                  'settling',
                ],
              },
            },
          },
        },
        {
          deals: {
            none: {
              isCancelled: false,
              stage: { in: ['completed', 'closed'] },
            },
          },
        },
      ],
    });
  });

  it('merges completed Deals and a closed intake into closed availability', () => {
    expect(buildListingAvailabilityWhere('closed')).toEqual({
      OR: [
        {
          deals: {
            some: {
              isCancelled: false,
              stage: { in: ['completed', 'closed'] },
            },
          },
        },
        {
          AND: [
            {
              intake: {
                lifecycleStatus: 'closed',
              },
            },
            {
              deals: {
                none: {
                  isCancelled: false,
                  stage: {
                    in: [
                      'preparing',
                      'preContract',
                      'contracted',
                      'settling',
                      'completed',
                      'closed',
                    ],
                  },
                },
              },
            },
          ],
        },
      ],
    });
  });

  it('does not classify a closed intake as paused', () => {
    expect(buildListingAvailabilityWhere('paused')).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          {
            intake: {
              lifecycleStatus: {
                in: ['open', 'hold'],
              },
            },
          },
        ]),
      }),
    );
  });
});

import {
  buildIntakeConfirmationWhere,
  buildListingAvailabilityWhere,
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

  it('excludes completed Deals from the in-contract availability filter', () => {
    expect(buildListingAvailabilityWhere('in_contract')).toEqual({
      AND: [
        {
          deals: {
            some: {
              isCancelled: false,
              stage: { in: ['preContract', 'contracted', 'settling'] },
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

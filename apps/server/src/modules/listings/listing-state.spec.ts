import {
  buildIntakeConfirmationWhere,
  buildListingAvailabilityWhere,
  getIntakeConfirmationState,
} from './listing-state';

describe('listing state query predicates', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');

  it('filters the three confirmation states by the verified date and the next check date only', () => {
    // 부재중은 상태가 아니다: 연락이 안 된 매물은 확인된 적이 있느냐에 따라 미확인이거나 기한 지남 · 확인됨이다
    expect(buildIntakeConfirmationWhere('unverified', now)).toEqual({ lastVerifiedAt: null });
    expect(buildIntakeConfirmationWhere('overdue', now)).toEqual({
      lifecycleStatus: { not: 'closed' },
      lastVerifiedAt: { not: null },
      nextConfirmAt: { lt: now },
    });
    // 닫힌 의뢰는 기한이 지나도 "기한 지남"이 아니다 (getIntakeConfirmationState와 같다)
    expect(buildIntakeConfirmationWhere('verified', now)).toEqual({
      lastVerifiedAt: { not: null },
      OR: [{ lifecycleStatus: 'closed' }, { nextConfirmAt: null }, { nextConfirmAt: { gte: now } }],
    });
  });

  it('does not treat an unanswered call as a state of its own', () => {
    // 예전 기록에 no_answer가 남아 있어도 확인된 날과 기한으로만 본다
    expect(
      getIntakeConfirmationState(
        { lifecycleStatus: 'open', lastVerifiedAt: null, lastCheckResult: 'no_answer', nextConfirmAt: null },
        now,
      ),
    ).toBe('unverified');
    expect(
      getIntakeConfirmationState(
        {
          lifecycleStatus: 'open',
          lastVerifiedAt: new Date('2026-07-20T12:00:00.000Z'),
          lastCheckResult: 'no_answer',
          nextConfirmAt: new Date('2099-01-01T00:00:00.000Z'),
        },
        now,
      ),
    ).toBe('verified');
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

import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MatchesService } from './matches.service';

function buildMatch(
  stage: string,
  intake: Partial<{
    lifecycleStatus: string;
    lifecycleChangedAt: Date;
    lifecycleChangedBy: string;
    closedReason: string | null;
    lastCheckedAt: Date | null;
    lastVerifiedAt: Date | null;
    lastCheckResult: string | null;
    nextConfirmAt: Date | null;
  }> = {},
) {
  return {
    id: 'match-1',
    officeId: 'office-1',
    listingId: 'listing-1',
    buyerReqId: 'buyer-1',
    stage,
    closedFromStage: null as string | null,
    memo: null as string | null,
    createdAt: new Date('2026-08-01T09:00:00.000Z'),
    updatedAt: new Date('2026-08-01T09:00:00.000Z'),
    listing: {
      id: 'listing-1',
      isPaused: false,
      intake: {
        lifecycleStatus: 'open',
        lifecycleChangedAt: new Date('2026-08-01T08:00:00.000Z'),
        lifecycleChangedBy: 'user',
        closedReason: null,
        lastCheckedAt: new Date('2026-08-01T08:30:00.000Z'),
        lastVerifiedAt: new Date('2026-08-01T08:30:00.000Z'),
        lastCheckResult: 'alive',
        nextConfirmAt: new Date('2099-08-02T08:30:00.000Z'),
        ...intake,
      },
      deals: [],
      property: {
        id: 'property-1',
        site: null,
        unit: null,
        propertyContacts: [],
      },
    },
    buyerRequirement: null,
    calendarEvents: [],
    deals: [],
  };
}

function setup(match: ReturnType<typeof buildMatch>) {
  const prisma = {
    match: {
      findFirst: jest.fn().mockResolvedValue(match),
      update: jest.fn().mockImplementation(({ data }) => ({
        ...match,
        ...data,
      })),
    },
  };

  return {
    prisma,
    service: new MatchesService(prisma as never),
  };
}

describe('MatchesService stage progression', () => {
  it('records the current stage when a match is closed', async () => {
    const { service, prisma } = setup(buildMatch('viewing'));

    await service.updateStage('match-1', 'office-1', {
      stage: 'closed',
    });

    expect(prisma.match.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stage: 'closed',
          closedFromStage: 'viewing',
          // 직접 종료는 거래 취소 시 되살리기 대상이 아니다
          closedReason: 'manual',
          closedByDealId: null,
        }),
      }),
    );
  });

  it('clears the recorded failure stage when a closed match is reopened', async () => {
    const closedMatch = {
      ...buildMatch('closed'),
      closedFromStage: 'viewing',
    };
    const { service, prisma } = setup(closedMatch);

    await service.updateStage('match-1', 'office-1', {
      stage: 'viewing',
    });

    expect(prisma.match.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          stage: 'viewing',
          closedFromStage: null,
          closedReason: null,
          closedByDealId: null,
        }),
      }),
    );
  });

  it('blocks customer interest until the listing has a current confirmation', async () => {
    const { service, prisma } = setup(
      buildMatch('suggested', {
        lastCheckedAt: null,
        lastVerifiedAt: null,
        lastCheckResult: null,
        nextConfirmAt: null,
      }),
    );

    await expect(
      service.updateStage('match-1', 'office-1', {
        stage: 'buyerInterested',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        '매물 확인을 완료한 뒤 고객 관심 단계로 이동할 수 있습니다',
      ),
    );
    expect(prisma.match.update).not.toHaveBeenCalled();
  });

  it('normalizes a legacy customer-contact value before saving', async () => {
    const { service, prisma } = setup(buildMatch('suggested'));

    const result = await service.updateStage('match-1', 'office-1', {
      stage: 'buyerContacted',
    });

    expect(prisma.match.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: 'buyerInterested' }),
      }),
    );
    expect(result.stage).toBe('buyerInterested');
  });

  it('lets a match enter viewing without going through viewing confirmation', async () => {
    const { service, prisma } = setup(buildMatch('buyerInterested'));

    const result = await service.updateStage('match-1', 'office-1', {
      stage: 'viewing',
    });

    expect(prisma.match.update).toHaveBeenCalled();
    expect(result.stage).toBe('viewing');
  });

  it('allows the confirmed viewing to advance into viewing', async () => {
    const { service, prisma } = setup(buildMatch('viewingConfirmed'));

    const result = await service.updateStage('match-1', 'office-1', {
      stage: 'viewing',
    });

    expect(prisma.match.update).toHaveBeenCalled();
    expect(result.stage).toBe('viewing');
  });

  // 임장 없이 계약으로 가는 경우가 있어 단계 순서를 강제하지 않는다
  it('allows skipping forward stages', async () => {
    const { service, prisma } = setup(buildMatch('buyerInterested'));

    const result = await service.updateStage('match-1', 'office-1', {
      stage: 'negotiating',
    });

    expect(prisma.match.update).toHaveBeenCalled();
    expect(result.stage).toBe('negotiating');
  });

  it('still blocks skipping past buyer interest when the listing is not verified', async () => {
    const { service, prisma } = setup(
      buildMatch('suggested', { lastVerifiedAt: null, lastCheckedAt: null, lastCheckResult: null }),
    );

    await expect(
      service.updateStage('match-1', 'office-1', { stage: 'negotiating' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.match.update).not.toHaveBeenCalled();
  });
});

describe('MatchesService agreed terms', () => {
  it('changes only the fields that were sent and keeps the stage', async () => {
    const { service, prisma } = setup(buildMatch('negotiating'));

    await service.updateAgreedTerms('match-1', 'office-1', {
      agreedPrice: 315000,
      agreedMoveInDate: '2027-02-20',
    });

    const { data } = prisma.match.update.mock.calls[0][0];
    expect(data.agreedPrice).toBe(315000);
    expect(data.agreedMoveInDate).toEqual(new Date('2027-02-20'));
    expect(data.agreedDeposit).toBeUndefined();
    expect(data.agreedMonthlyRent).toBeUndefined();
    expect(data).not.toHaveProperty('stage');
  });

  it('clears a field when null is sent', async () => {
    const { service, prisma } = setup(buildMatch('negotiating'));

    await service.updateAgreedTerms('match-1', 'office-1', {
      agreedPrice: null,
      agreedMoveInDate: null,
    });

    const { data } = prisma.match.update.mock.calls[0][0];
    expect(data.agreedPrice).toBeNull();
    expect(data.agreedMoveInDate).toBeNull();
  });

  it('accepts terms before the negotiating stage', async () => {
    const { service, prisma } = setup(buildMatch('buyerInterested'));

    await service.updateAgreedTerms('match-1', 'office-1', { agreedPrice: 300000 });

    expect(prisma.match.update).toHaveBeenCalled();
  });

  it('refuses to change terms after the match became a deal', async () => {
    const { service, prisma } = setup(buildMatch('dealCreated'));

    await expect(
      service.updateAgreedTerms('match-1', 'office-1', { agreedPrice: 300000 }),
    ).rejects.toThrow(ConflictException);
    expect(prisma.match.update).not.toHaveBeenCalled();
  });

  it('rejects an unreadable move-in date', async () => {
    const { service, prisma } = setup(buildMatch('negotiating'));

    await expect(
      service.updateAgreedTerms('match-1', 'office-1', { agreedMoveInDate: '내년 봄' }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.match.update).not.toHaveBeenCalled();
  });
});

describe('MatchesService memo updates', () => {
  it('updates only memo and applies optimistic concurrency without writing stage', async () => {
    const match = buildMatch('viewing');
    const { service, prisma } = setup(match);

    await service.updateMemo('match-1', 'office-1', {
      memo: '방문 전 주차 확인',
      expectedUpdatedAt: '2026-08-01T09:00:00.000Z',
    });

    expect(prisma.match.update).toHaveBeenCalledWith({
      where: {
        id: 'match-1',
        officeId: 'office-1',
        updatedAt: new Date('2026-08-01T09:00:00.000Z'),
      },
      data: { memo: '방문 전 주차 확인' },
      include: expect.any(Object),
    });
    expect(prisma.match.update.mock.calls[0]?.[0].data).not.toHaveProperty(
      'stage',
    );
  });

  it('allows clearing memo without changing stage', async () => {
    const { service, prisma } = setup({
      ...buildMatch('negotiating'),
      memo: '삭제할 메모',
    });

    await service.updateMemo('match-1', 'office-1', { memo: null });

    expect(prisma.match.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'match-1', officeId: 'office-1' },
        data: { memo: null },
      }),
    );
  });

  it('rejects a stale memo update and preserves the current record', async () => {
    const { service, prisma } = setup(buildMatch('viewingConfirmed'));
    prisma.match.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.updateMemo('match-1', 'office-1', {
        memo: '오래된 화면의 메모',
        expectedUpdatedAt: '2026-08-01T08:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.match.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { memo: '오래된 화면의 메모' },
      }),
    );
  });

  it('rejects an invalid optimistic concurrency timestamp before writing', async () => {
    const { service, prisma } = setup(buildMatch('suggested'));

    await expect(
      service.updateMemo('match-1', 'office-1', {
        memo: '메모',
        expectedUpdatedAt: 'not-a-date',
      }),
    ).rejects.toThrow(
      new BadRequestException('수정 시각 형식이 올바르지 않습니다.'),
    );

    expect(prisma.match.update).not.toHaveBeenCalled();
  });
});

describe('MatchesService read-only after deal conversion', () => {
  it('refuses to move a converted match while its deal is still active', async () => {
    const converted = {
      ...buildMatch('dealCreated'),
      deals: [{ id: 'deal-1', stage: 'preparing', isCancelled: false }],
    };
    const { service, prisma } = setup(converted as never);

    await expect(
      service.updateStage('match-1', 'office-1', { stage: 'suggested' }),
    ).rejects.toThrow('거래로 전환한 매칭이라 단계를 바꿀 수 없습니다');
    await expect(
      service.updateStage('match-1', 'office-1', { stage: 'closed' }),
    ).rejects.toThrow('거래로 전환한 매칭이라');
    expect(prisma.match.update).not.toHaveBeenCalled();
  });

  it('lets a converted match move once its deal is cancelled', async () => {
    const converted = {
      ...buildMatch('dealCreated'),
      deals: [{ id: 'deal-1', stage: 'preparing', isCancelled: true }],
    };
    const { service, prisma } = setup(converted as never);

    await service.updateStage('match-1', 'office-1', { stage: 'negotiating' });

    expect(prisma.match.update).toHaveBeenCalled();
  });
});

describe('MatchesService completed buyer', () => {
  it('does not reopen a match of a completed buyer requirement, but still lets it close', async () => {
    const closed = {
      ...buildMatch('closed'),
      closedFromStage: 'viewing',
      buyerRequirement: { status: 'completed', buyerIntake: { contacts: [] } },
    };
    const { service, prisma } = setup(closed as never);

    await expect(
      service.updateStage('match-1', 'office-1', { stage: 'viewing' }),
    ).rejects.toThrow('완료한 희망 조건의 매칭입니다');
    expect(prisma.match.update).not.toHaveBeenCalled();
  });
});

describe('MatchesService closed buyer intake', () => {
  it('does not move or reopen a match whose buyer intake is closed', async () => {
    const match = {
      ...buildMatch('viewing'),
      buyerRequirement: {
        status: 'active',
        buyerIntake: { lifecycleStatus: 'closed', contacts: [] },
      },
    };
    const { service, prisma } = setup(match as never);

    await expect(
      service.updateStage('match-1', 'office-1', { stage: 'negotiating' }),
    ).rejects.toThrow('종료한 구매 의뢰의 매칭입니다');
    expect(prisma.match.update).not.toHaveBeenCalled();
  });

  it('refuses to link a listing to a requirement of a closed buyer intake', async () => {
    const prisma = {
      listing: {
        findFirst: jest.fn().mockResolvedValue({ id: 'l1', intake: { lifecycleStatus: 'open' } }),
      },
      buyerRequirement: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'r1',
          status: 'active',
          buyerIntake: { lifecycleStatus: 'closed' },
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new MatchesService(prisma as never);

    await expect(
      service.create('office-1', { listingId: 'l1', buyerReqId: 'r1' }),
    ).rejects.toThrow('종료한 구매 의뢰의 희망 조건입니다');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('MatchesService deal-created stage', () => {
  it('refuses to move a match to dealCreated without a linked deal and returns the terms to confirm', async () => {
    const match = buildMatch('negotiating');
    const { service, prisma } = setup({
      ...match,
      agreedPrice: 156000,
      listing: { ...match.listing, transactionType: 'sale', price: 158000 },
    } as never);

    const error = await service
      .updateStage('match-1', 'office-1', { stage: 'dealCreated' })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({
      dealDraft: {
        matchId: 'match-1',
        listingId: 'listing-1',
        transactionType: 'sale',
        agreedPrice: 156000,
        priceSource: 'match',
      },
    });
    expect(prisma.match.update).not.toHaveBeenCalled();
  });

  it('lets a match catch up to dealCreated when its deal already exists', async () => {
    const { service, prisma } = setup({
      ...buildMatch('negotiating'),
      deals: [{ id: 'deal-1', stage: 'preparing', isCancelled: false, createdAt: new Date() }],
    } as never);

    await service.updateStage('match-1', 'office-1', { stage: 'dealCreated' });

    expect(prisma.match.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stage: 'dealCreated' }) }),
    );
  });
});

import { BadRequestException } from '@nestjs/common';
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
    memo: null,
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

  it('requires viewing confirmation before entering the viewing stage', async () => {
    const { service, prisma } = setup(buildMatch('buyerInterested'));

    await expect(
      service.updateStage('match-1', 'office-1', { stage: 'viewing' }),
    ).rejects.toThrow(
      new BadRequestException(
        '집주인·점유자의 임장 가능 확인을 먼저 완료해 주세요',
      ),
    );
    expect(prisma.match.update).not.toHaveBeenCalled();
  });

  it('allows the confirmed viewing to advance into viewing', async () => {
    const { service, prisma } = setup(buildMatch('viewingConfirmed'));

    const result = await service.updateStage('match-1', 'office-1', {
      stage: 'viewing',
    });

    expect(prisma.match.update).toHaveBeenCalled();
    expect(result.stage).toBe('viewing');
  });

  it('does not allow skipping multiple forward stages', async () => {
    const { service, prisma } = setup(buildMatch('buyerInterested'));

    await expect(
      service.updateStage('match-1', 'office-1', { stage: 'negotiating' }),
    ).rejects.toThrow(
      new BadRequestException('현재 단계의 다음 업무를 먼저 완료해 주세요'),
    );
    expect(prisma.match.update).not.toHaveBeenCalled();
  });
});

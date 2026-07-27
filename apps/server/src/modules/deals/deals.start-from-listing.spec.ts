import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { DealsService } from './deals.service';

describe('DealsService 상태 토글 Deal 생성', () => {
  const pausedListing = {
    id: 'listing-1',
    transactionType: 'sale',
    isPaused: true,
    intake: {
      id: 'intake-1',
      lifecycleStatus: 'hold',
    },
    property: {
      site: { type: 'apartment' },
    },
  };

  it('보류 해제와 Deal 생성을 한 트랜잭션에서 처리한다', async () => {
    const tx = {
      listing: {
        findFirst: jest.fn().mockResolvedValue(pausedListing),
        update: jest.fn().mockResolvedValue({ id: 'listing-1' }),
      },
      listingIntake: {
        update: jest.fn().mockResolvedValue({ id: 'intake-1' }),
      },
      deal: {
        create: jest.fn().mockResolvedValue({ id: 'deal-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'deal-1',
          listing: { property: null },
          commissionPayments: [],
        }),
      },
    };
    const prisma = {
      listing: {
        findFirst: jest.fn().mockResolvedValue(pausedListing),
      },
      $transaction: jest.fn(
        (callback: (client: typeof tx) => unknown) => callback(tx),
      ),
    } as unknown as PrismaService;
    const service = new DealsService(prisma);

    await service.create('office-1', {
      listingId: 'listing-1',
      resumeListing: true,
    });

    expect(tx.listingIntake.update).toHaveBeenCalledWith({
      where: { id: 'intake-1' },
      data: expect.objectContaining({
        lifecycleStatus: 'open',
        lifecycleChangedBy: 'user',
        closedReason: null,
      }),
    });
    expect(tx.listing.update).toHaveBeenCalledWith({
      where: { id: 'listing-1' },
      data: { isPaused: false },
    });
    expect(tx.deal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          listingId: 'listing-1',
          transactionType: 'sale',
        }),
      }),
    );
  });

  it('종료된 의뢰는 resumeListing으로도 Deal을 시작하지 못한다', async () => {
    const prisma = {
      listing: {
        findFirst: jest.fn().mockResolvedValue({
          ...pausedListing,
          intake: {
            ...pausedListing.intake,
            lifecycleStatus: 'closed',
          },
        }),
      },
    } as unknown as PrismaService;
    const service = new DealsService(prisma);

    await expect(
      service.create('office-1', {
        listingId: 'listing-1',
        resumeListing: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

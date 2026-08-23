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
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'deal-1' }),
        findUnique: jest.fn().mockResolvedValue({
          id: 'deal-1',
          listing: { property: null },
          commissionPayments: [],
        }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      listing: {
        findFirst: jest.fn().mockResolvedValue(pausedListing),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
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
          stage: 'preparing',
          transactionType: 'sale',
        }),
      }),
    );
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.deal.findFirst.mock.invocationCallOrder[0],
    );
    expect(tx.deal.findFirst.mock.invocationCallOrder[0]).toBeLessThan(
      tx.deal.create.mock.invocationCallOrder[0],
    );
  });

  it('같은 의뢰의 다른 Listing에 진행 Deal이 있으면 새 Deal 생성을 거부한다', async () => {
    const listing = {
      ...pausedListing,
      isPaused: false,
      intake: { ...pausedListing.intake, lifecycleStatus: 'open' },
    };
    const tx = {
      deal: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'deal-2', stage: 'settling' }),
        create: jest.fn(),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = {
      listing: { findFirst: jest.fn().mockResolvedValue(listing) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    } as unknown as PrismaService;
    const service = new DealsService(prisma);

    await expect(
      service.create('office-1', { listingId: 'listing-1' }),
    ).rejects.toThrow('이 의뢰에 이미 진행 중인 거래가 있습니다');

    expect(tx.deal.findFirst).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
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
        listing: { intakeId: 'intake-1' },
      },
      select: { id: true, stage: true },
    });
    expect(tx.deal.create).not.toHaveBeenCalled();
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

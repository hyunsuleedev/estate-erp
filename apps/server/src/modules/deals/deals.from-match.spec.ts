import { BadRequestException, ConflictException } from '@nestjs/common';
import type { PrismaService } from '../../prisma/prisma.service';
import { DealsService } from './deals.service';

const MATCH_ID = '11111111-1111-4111-8111-111111111111';

function setup(match: Record<string, unknown> | null) {
  const tx = {
    deal: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'deal-1' }),
      findUnique: jest.fn().mockResolvedValue({
        id: 'deal-1',
        listing: { property: null },
        commissionPayments: [],
      }),
    },
    match: {
      findFirst: jest.fn().mockResolvedValue({ buyerRequirement: { buyerIntakeId: 'intake-b' } }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $executeRaw: jest.fn().mockResolvedValue(1),
  };
  const prisma = {
    listing: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'listing-1',
        transactionType: 'sale',
        isPaused: false,
        intake: { id: 'intake-1', lifecycleStatus: 'open' },
        property: { site: { type: 'apartment' } },
      }),
    },
    match: { findFirst: jest.fn().mockResolvedValue(match) },
    $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  } as unknown as PrismaService;
  return { service: new DealsService(prisma), tx };
}

const sourceMatch = (listingId: string) => ({
  listingId,
  stage: 'negotiating',
  buyerRequirement: {
    status: 'active',
    buyerIntake: { lifecycleStatus: 'open', contacts: [{ contactId: 'buyer-1' }] },
  },
  listing: { property: { propertyContacts: [{ contactId: 'owner-1' }] } },
});

describe('DealsService 매칭에서 거래 만들기', () => {
  it('거래를 만들면서 매칭을 거래 전환으로 옮기고 당사자를 채운다', async () => {
    const { service, tx } = setup(sourceMatch('listing-1'));

    await service.create('office-1', { listingId: 'listing-1', matchId: MATCH_ID });

    expect(tx.deal.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          matchId: MATCH_ID,
          buyerContactId: 'buyer-1',
          sellerContactId: 'owner-1',
        }),
      }),
    );
    expect(tx.match.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: MATCH_ID, officeId: 'office-1', stage: { not: 'closed' } }),
      data: { stage: 'dealCreated' },
    });
  });

  it('다른 매물의 매칭은 붙이지 않는다', async () => {
    const { service, tx } = setup(sourceMatch('listing-other'));

    await expect(
      service.create('office-1', { listingId: 'listing-1', matchId: MATCH_ID }),
    ).rejects.toThrow(BadRequestException);
    expect(tx.deal.create).not.toHaveBeenCalled();
  });

  it('종료한 매칭으로는 거래를 만들지 않는다', async () => {
    const { service, tx } = setup({ ...sourceMatch('listing-1'), stage: 'closed' });

    await expect(
      service.create('office-1', { listingId: 'listing-1', matchId: MATCH_ID }),
    ).rejects.toThrow(ConflictException);
    expect(tx.deal.create).not.toHaveBeenCalled();
  });

  it('확인한 뒤 그사이 종료된 매칭은 되살리지 않고 거래를 되돌린다', async () => {
    const { service, tx } = setup(sourceMatch('listing-1'));
    tx.match.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.create('office-1', { listingId: 'listing-1', matchId: MATCH_ID }),
    ).rejects.toThrow(ConflictException);
  });

  it('매칭 없이 만든 거래는 매칭을 건드리지 않는다', async () => {
    const { service, tx } = setup(null);

    await service.create('office-1', { listingId: 'listing-1' });

    expect(tx.deal.create).toHaveBeenCalled();
    expect(tx.match.updateMany).not.toHaveBeenCalled();
  });
});

describe('DealsService 실시간 신호', () => {
  it('거래를 만든 뒤 그 집과 의뢰를 실어 신호를 보낸다', async () => {
    const { service: _unused, tx } = setup(sourceMatch('listing-1'));
    void _unused;
    const emitDealUpdated = jest.fn();
    const prisma = {
      listing: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'listing-1',
          transactionType: 'sale',
          isPaused: false,
          intake: { id: 'intake-1', lifecycleStatus: 'open' },
          property: { site: { type: 'apartment' } },
        }),
      },
      match: { findFirst: jest.fn().mockResolvedValue(sourceMatch('listing-1')) },
      deal: {
        findFirst: jest.fn().mockResolvedValue({ listing: { propertyId: 'property-1', intakeId: 'intake-1' } }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    } as unknown as PrismaService;
    const service = new DealsService(prisma, { emitDealUpdated } as never);

    await service.create('office-1', { listingId: 'listing-1', matchId: MATCH_ID });

    expect(emitDealUpdated).toHaveBeenCalledWith({
      officeId: 'office-1',
      dealId: 'deal-1',
      propertyId: 'property-1',
      intakeId: 'intake-1',
    });
    // 저장(거래 만들기)이 끝난 뒤에 보낸다
    expect(tx.deal.create.mock.invocationCallOrder[0]).toBeLessThan(emitDealUpdated.mock.invocationCallOrder[0]);
  });
});

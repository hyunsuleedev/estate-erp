import { ListingIntakesService } from './listing-intakes.service';

describe('ListingIntakesService', () => {
  function createService() {
    const tx = {
      listingIntake: {
        update: jest.fn().mockResolvedValue({ id: 'intake-1' }),
        updateMany: jest.fn(),
      },
      consultation: {
        create: jest.fn().mockResolvedValue({ id: 'consultation-1' }),
      },
    };
    const prisma = {
      listingIntake: {
        findFirst: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      consultation: {
        create: jest.fn(),
      },
      $transaction: jest.fn(async (fn) => fn(tx)),
    };
    const listings = {};
    const service = new ListingIntakesService(prisma as never, listings as never);

    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'intake-1',
      confirmStatus: 'alive',
      confirmedAt: '2026-05-19T00:00:00.000Z',
      nextConfirmAt: '2026-05-26T00:00:00.000Z',
      lastConfirmConsultationId: 'consultation-1',
    } as never);

    return { prisma, service, tx };
  }

  it('rejects a stale intake update when expectedUpdatedAt no longer matches', async () => {
    const { prisma, service } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      status: 'active',
      updatedAt: new Date('2026-05-20T01:00:00.000Z'),
    });
    prisma.listingIntake.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('intake-1', 'office-1', {
        status: 'paused',
        expectedUpdatedAt: '2026-05-20T00:00:00.000Z',
      }),
    ).rejects.toThrow('다른 사용자가 먼저 수정했습니다.');

    expect(prisma.listingIntake.update).not.toHaveBeenCalled();
  });

  it('accepts Listing status values when updating ListingIntake status', async () => {
    const { prisma, service } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      status: 'unverified',
      updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    });
    prisma.listingIntake.update.mockResolvedValue({ id: 'intake-1' });

    await service.updateStatus('intake-1', 'office-1', 'verified');

    expect(prisma.listingIntake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'verified' }),
      }),
    );
  });

  it('creates new intakes as unverified by default', async () => {
    const { prisma, service } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue(null);
    prisma.listingIntake.update.mockResolvedValue({ id: 'intake-1' });
    (prisma as any).property = {
      findFirst: jest.fn().mockResolvedValue({ id: 'property-1' }),
    };
    (prisma as any).partnerBroker = {
      findFirst: jest.fn(),
    };
    const tx = {
      listingIntake: {
        create: jest.fn().mockResolvedValue({ id: 'intake-1' }),
      },
      listing: {
        create: jest.fn(),
      },
    };
    prisma.$transaction.mockImplementationOnce(async (fn) => fn(tx));

    await service.create('office-1', {
      propertyId: 'property-1',
    });

    expect(tx.listingIntake.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'unverified' }),
      }),
    );
  });

  it('records a successful intake confirmation on the intake and consultation history', async () => {
    const { prisma, service, tx } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      confirmedAt: null,
      property: {
        propertyContacts: [
          { contactId: 'owner-1', isPrimary: true, role: 'owner' },
        ],
      },
    });

    const result = await service.confirm('intake-1', 'office-1', 'user-1', {
      result: 'alive',
      channel: 'phone',
      memo: '가격 그대로 유지',
      checkedAt: '2026-05-19T00:00:00.000Z',
    });

    expect(tx.consultation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          officeId: 'office-1',
          createdById: 'user-1',
          contactId: 'owner-1',
          propertyId: 'property-1',
          listingIntakeId: 'intake-1',
          purpose: 'listing_confirm',
          type: 'phone',
          content: '[매물확인] 살아있음\n가격 그대로 유지',
        }),
      }),
    );
    expect(tx.listingIntake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'intake-1' },
        data: expect.objectContaining({
          confirmStatus: 'alive',
          confirmedAt: new Date('2026-05-19T00:00:00.000Z'),
          nextConfirmAt: new Date('2026-05-26T00:00:00.000Z'),
          lastConfirmMemo: '가격 그대로 유지',
          lastConfirmConsultationId: 'consultation-1',
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'intake-1',
        confirmStatus: 'alive',
      }),
    );
  });

  it('rejects a stale intake confirmation when expectedUpdatedAt no longer matches', async () => {
    const { prisma, service, tx } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      status: 'active',
      confirmedAt: null,
      property: { propertyContacts: [] },
    });
    tx.listingIntake.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.confirm('intake-1', 'office-1', 'user-1', {
        result: 'alive',
        channel: 'phone',
        expectedUpdatedAt: '2026-05-20T00:00:00.000Z',
      }),
    ).rejects.toThrow('다른 사용자가 먼저 수정했습니다.');

    expect(tx.listingIntake.update).not.toHaveBeenCalled();
  });
});

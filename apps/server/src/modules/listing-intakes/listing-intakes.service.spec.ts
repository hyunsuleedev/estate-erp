import { ListingIntakesService } from './listing-intakes.service';

describe('ListingIntakesService', () => {
  function createService() {
    const tx = {
      listingIntake: {
        create: jest.fn().mockResolvedValue({ id: 'intake-1' }),
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
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      property: {
        findFirst: jest.fn(),
      },
      partnerBroker: {
        findFirst: jest.fn(),
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
      confirmedAt: '2026-05-19T00:00:00.000Z',
      nextConfirmAt: '2026-05-26T00:00:00.000Z',
    } as never);

    return { prisma, service, tx };
  }

  it('sorts intakes by receivedAt descending by default', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1');

    expect(prisma.listingIntake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { receivedAt: 'desc' },
      }),
    );
  });

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
        status: 'hold',
        expectedUpdatedAt: '2026-05-20T00:00:00.000Z',
      }),
    ).rejects.toThrow('다른 사용자가 먼저 수정했습니다.');

    expect(prisma.listingIntake.update).not.toHaveBeenCalled();
  });

  it('accepts active as the open ListingIntake status', async () => {
    const { prisma, service } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      status: 'unverified',
      updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    });
    prisma.listingIntake.update.mockResolvedValue({ id: 'intake-1' });

    await service.updateStatus('intake-1', 'office-1', 'active');

    expect(prisma.listingIntake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('rejects verified as a ListingIntake status', async () => {
    const { prisma, service } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      status: 'unverified',
      updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    });

    await expect(
      service.updateStatus('intake-1', 'office-1', 'verified'),
    ).rejects.toThrow('Invalid ListingIntake status');

    expect(prisma.listingIntake.update).not.toHaveBeenCalled();
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

  it('emits a realtime intake update after creating an intake', async () => {
    const { prisma, tx } = createService();
    const realtime = {
      emitListingIntakeUpdated: jest.fn(),
    };
    const service = new ListingIntakesService(
      prisma as never,
      {} as never,
      realtime as never,
    );
    jest.spyOn(service, 'findOne').mockResolvedValue({
      id: 'intake-1',
      propertyId: 'property-1',
    } as never);
    prisma.property.findFirst.mockResolvedValue({ id: 'property-1' });
    prisma.listingIntake.findFirst.mockResolvedValue(null);
    tx.listingIntake.create.mockResolvedValue({ id: 'intake-1' });

    await service.create('office-1', {
      propertyId: 'property-1',
    });

    expect(realtime.emitListingIntakeUpdated).toHaveBeenCalledWith({
      officeId: 'office-1',
      intakeId: 'intake-1',
      propertyId: 'property-1',
    });
  });

  it('records confirmation timing on the intake and detail in consultation history', async () => {
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
        data: {
          status: undefined,
          confirmedAt: new Date('2026-05-19T00:00:00.000Z'),
          nextConfirmAt: new Date('2026-05-26T00:00:00.000Z'),
        },
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'intake-1',
        confirmedAt: '2026-05-19T00:00:00.000Z',
      }),
    );
  });

  it('rejects a stale intake confirmation when expectedUpdatedAt no longer matches', async () => {
    const { prisma, service, tx } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      status: 'hold',
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

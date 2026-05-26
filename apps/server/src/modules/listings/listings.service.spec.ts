import { ConflictException } from '@nestjs/common';
import { ListingsService } from './listings.service';

jest.mock('@estate-erp/shared', () => ({
  CheckStatus: {
    UNVERIFIED: 'unverified',
    VERIFIED: 'verified',
    IN_CONTRACT: 'in_contract',
    HOLD: 'hold',
    DONE: 'done',
  },
  TransactionType: {
    SALE: 'sale',
    JEONSE: 'jeonse',
    MONTHLY: 'monthly',
  },
}));

describe('ListingsService', () => {
  function createService() {
    const prisma = {
      property: {
        findFirst: jest.fn(),
      },
      listing: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      listingIntake: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    return {
      prisma,
      service: new ListingsService(prisma as never),
    };
  }

  it('creates an active intake when creating the first listing for a property', async () => {
    const { prisma, service } = createService();
    prisma.property.findFirst.mockResolvedValue({ id: 'property-1' });
    prisma.listingIntake.findFirst.mockResolvedValue(null);
    prisma.listingIntake.create.mockResolvedValue({ id: 'intake-1' });
    prisma.listing.findFirst.mockResolvedValue(null);
    prisma.listing.create.mockResolvedValue({ id: 'listing-1' });

    await service.create('office-1', {
      propertyId: 'property-1',
      transactionType: 'sale',
      price: 150000,
    });

    expect(prisma.listingIntake.create).toHaveBeenCalledWith({
      data: {
        officeId: 'office-1',
        propertyId: 'property-1',
      },
      select: { id: true },
    });
    expect(prisma.listing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          intakeId: 'intake-1',
          propertyId: 'property-1',
          transactionType: 'sale',
          price: 150000,
        }),
      }),
    );
  });

  it('adds a new transaction option to the existing active intake', async () => {
    const { prisma, service } = createService();
    prisma.property.findFirst.mockResolvedValue({ id: 'property-1' });
    prisma.listingIntake.findFirst.mockResolvedValue({ id: 'intake-1' });
    prisma.listing.findFirst.mockResolvedValue(null);
    prisma.listing.create.mockResolvedValue({ id: 'listing-2' });

    await service.create('office-1', {
      propertyId: 'property-1',
      transactionType: 'jeonse',
      price: 90000,
    });

    expect(prisma.listingIntake.create).not.toHaveBeenCalled();
    expect(prisma.listing.findFirst).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        intakeId: 'intake-1',
        transactionType: 'jeonse',
      },
      select: { id: true },
    });
    expect(prisma.listing.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          intakeId: 'intake-1',
          transactionType: 'jeonse',
        }),
      }),
    );
  });

  it('rejects creating a duplicate transaction type for the same active intake', async () => {
    const { prisma, service } = createService();
    prisma.property.findFirst.mockResolvedValue({ id: 'property-1' });
    prisma.listingIntake.findFirst.mockResolvedValue({ id: 'intake-1' });
    prisma.listing.findFirst.mockResolvedValue({ id: 'listing-1' });
    prisma.listing.create.mockResolvedValue({ id: 'listing-2' });

    await expect(
      service.create('office-1', {
        propertyId: 'property-1',
        transactionType: 'sale',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.listing.create).not.toHaveBeenCalled();
    expect(prisma.listing.findFirst).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        intakeId: 'intake-1',
        transactionType: 'sale',
      },
      select: { id: true },
    });
  });

  it('rejects changing a listing to a transaction type that already exists on the property', async () => {
    const { prisma, service } = createService();
    prisma.listing.findFirst
      .mockResolvedValueOnce({
        id: 'listing-1',
        officeId: 'office-1',
        propertyId: 'property-1',
        intakeId: 'intake-1',
        transactionType: 'jeonse',
        checkStatus: 'unverified',
      })
      .mockResolvedValueOnce({ id: 'listing-2' });
    prisma.listing.update.mockResolvedValue({ id: 'listing-1' });

    await expect(
      service.update('listing-1', 'office-1', { transactionType: 'sale' }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.listing.update).not.toHaveBeenCalled();
  });

  it('emits a realtime listing update after updating a listing', async () => {
    const { prisma } = createService();
    const realtime = {
      emitListingUpdated: jest.fn(),
    };
    const service = new ListingsService(prisma as never, realtime as never);
    const updatedListing = {
      id: 'listing-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      intakeId: 'intake-1',
      transactionType: 'sale',
      checkStatus: 'verified',
    };
    prisma.listing.findFirst.mockResolvedValue({
      ...updatedListing,
      checkStatus: 'unverified',
    });
    prisma.listing.update.mockResolvedValue(updatedListing);

    await service.update('listing-1', 'office-1', { checkStatus: 'verified' });

    expect(realtime.emitListingUpdated).toHaveBeenCalledWith({
      officeId: 'office-1',
      listingId: 'listing-1',
      propertyId: 'property-1',
      intakeId: 'intake-1',
    });
  });

  it('rejects a stale listing update when expectedUpdatedAt no longer matches', async () => {
    const { prisma, service } = createService();
    prisma.listing.findFirst.mockResolvedValue({
      id: 'listing-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      intakeId: 'intake-1',
      transactionType: 'sale',
      checkStatus: 'unverified',
      updatedAt: new Date('2026-05-20T01:00:00.000Z'),
    });
    prisma.listing.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('listing-1', 'office-1', {
        price: 270000,
        expectedUpdatedAt: '2026-05-20T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.listing.update).not.toHaveBeenCalled();
  });

  it('returns distinct filter sites from visible listings with counts', async () => {
    const { prisma, service } = createService();
    prisma.listing.findMany.mockResolvedValue([
      {
        propertyId: 'property-2',
        property: {
          site: {
            id: 'site-2',
            name: '힐스테이트',
            type: 'apartment',
            roadAddress: null,
            jibunAddress: '서울시 강동구',
          },
        },
      },
      {
        propertyId: 'property-1',
        property: {
          site: {
            id: 'site-1',
            name: '고덕그라시움',
            type: 'apartment',
            roadAddress: '서울시 강동구 고덕로',
            jibunAddress: null,
          },
        },
      },
      {
        propertyId: 'property-1',
        property: {
          site: {
            id: 'site-1',
            name: '고덕그라시움',
            type: 'apartment',
            roadAddress: '서울시 강동구 고덕로',
            jibunAddress: null,
          },
        },
      },
    ]);

    await expect(service.findFilterSites('office-1')).resolves.toEqual([
      {
        id: 'site-1',
        name: '고덕그라시움',
        type: 'apartment',
        roadAddress: '서울시 강동구 고덕로',
        jibunAddress: null,
        listingCount: 2,
        propertyCount: 1,
      },
      {
        id: 'site-2',
        name: '힐스테이트',
        type: 'apartment',
        roadAddress: null,
        jibunAddress: '서울시 강동구',
        listingCount: 1,
        propertyCount: 1,
      },
    ]);

    expect(prisma.listing.findMany).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        isHidden: false,
      },
      select: {
        propertyId: true,
        property: {
          select: {
            site: {
              select: {
                id: true,
                name: true,
                type: true,
                roadAddress: true,
                jibunAddress: true,
              },
            },
          },
        },
      },
    });
  });

  it('loads tenant and advertisement records for property list rows', async () => {
    const { prisma, service } = createService();
    prisma.listing.findMany.mockResolvedValue([]);
    prisma.listing.count.mockResolvedValue(0);

    await service.findAll('office-1');

    expect(prisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          advertisements: expect.objectContaining({
            orderBy: { createdAt: 'desc' },
            take: 5,
          }),
          property: expect.objectContaining({
            include: expect.objectContaining({
              tenants: expect.objectContaining({
                include: {
                  contact: expect.objectContaining({
                    include: expect.objectContaining({
                      phones: expect.any(Object),
                    }),
                  }),
                },
                orderBy: { createdAt: 'desc' },
              }),
              listings: expect.objectContaining({
                select: expect.objectContaining({
                  moveInAvailableType: true,
                  moveInAvailableFrom: true,
                  moveInAvailableTo: true,
                  isJointBrokerageRequired: true,
                  jointBrokeragePartnerId: true,
                  jointBrokeragePartner: expect.objectContaining({
                    select: { id: true, name: true, phone: true },
                  }),
                  advertisements: expect.objectContaining({
                    orderBy: { createdAt: 'desc' },
                    take: 5,
                  }),
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });
});

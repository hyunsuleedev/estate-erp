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
        create: jest.fn(),
        update: jest.fn(),
      },
    };

    return {
      prisma,
      service: new ListingsService(prisma as never),
    };
  }

  it('rejects creating a duplicate transaction type for the same property', async () => {
    const { prisma, service } = createService();
    prisma.property.findFirst.mockResolvedValue({ id: 'property-1' });
    prisma.listing.findFirst.mockResolvedValue({ id: 'listing-1' });
    prisma.listing.create.mockResolvedValue({ id: 'listing-2' });

    await expect(
      service.create('office-1', {
        propertyId: 'property-1',
        transactionType: 'sale',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.listing.create).not.toHaveBeenCalled();
  });

  it('rejects changing a listing to a transaction type that already exists on the property', async () => {
    const { prisma, service } = createService();
    prisma.listing.findFirst
      .mockResolvedValueOnce({
        id: 'listing-1',
        officeId: 'office-1',
        propertyId: 'property-1',
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
});

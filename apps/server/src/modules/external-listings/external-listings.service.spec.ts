import { ExternalListingsService } from './external-listings.service';

describe('ExternalListingsService', () => {
  function createService() {
    const prisma = {
      externalListingGroup: {
        findMany: jest.fn(),
      },
      officeAdvertisement: {
        findMany: jest.fn(),
      },
    };

    return {
      prisma,
      service: new ExternalListingsService(prisma as never),
    };
  }

  it('adds the latest own-ad publication date and ranking to each group', async () => {
    const { prisma, service } = createService();
    prisma.externalListingGroup.findMany.mockResolvedValue([
      {
        id: 'group-1',
        transactionType: 'sale',
        mainExternalListing: {
          ranking: 8,
          verificationTypeCode: 'OWNER',
        },
        listings: [
          {
            id: 'listing-1',
            source: 'naver',
            articleNo: '100',
            price: 210000,
            deposit: null,
            monthlyRent: null,
            transactionType: 'sale',
            articleConfirmYmd: '20260710',
            verificationTypeCode: 'OWNER',
            ranking: 8,
            seango: false,
            epju: false,
          },
        ],
        _count: { listings: 1 },
      },
    ]);
    prisma.officeAdvertisement.findMany.mockResolvedValue([
      {
        source: 'naver',
        articleNo: '100',
        articleConfirmYmd: '20260721',
        ranking: 2,
      },
    ]);

    const [group] = await service.findAllGroups('office-1', {
      transactionType: 'sale',
    });

    expect(group).toMatchObject({
      id: 'group-1',
      ownAdvertisementYmd: '20260721',
      offerRanking: 2,
      ownerVerified: true,
    });
    expect(prisma.officeAdvertisement.findMany).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        isMine: true,
        isActive: true,
        articleNo: { in: ['100'] },
      },
      select: {
        articleNo: true,
        articleConfirmYmd: true,
        ranking: true,
      },
    });
  });

  it('keeps the demo ranking when no own advertisement is linked', async () => {
    const { prisma, service } = createService();
    prisma.externalListingGroup.findMany.mockResolvedValue([
      {
        id: 'group-demo',
        transactionType: 'sale',
        mainExternalListing: {
          ranking: 4,
          verificationTypeCode: null,
        },
        listings: [
          {
            id: 'listing-demo',
            source: 'naver',
            articleNo: 'demo-1',
            price: 180000,
            deposit: null,
            monthlyRent: null,
            transactionType: 'sale',
            articleConfirmYmd: '20260710',
            verificationTypeCode: null,
            ranking: 4,
            seango: false,
            epju: false,
          },
        ],
        _count: { listings: 1 },
      },
    ]);
    prisma.officeAdvertisement.findMany.mockResolvedValue([]);

    const [group] = await service.findAllGroups('office-1', {
      transactionType: 'sale',
    });

    expect(group).toMatchObject({
      id: 'group-demo',
      ownAdvertisementYmd: null,
      offerRanking: 4,
    });
  });
});

import { OfficeAdvertisementsService } from './office-advertisements.service';

describe('OfficeAdvertisementsService', () => {
  function createService() {
    const prisma = {
      officeAdvertisementGroup: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      officeAdvertisement: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
        findMany: jest.fn(),
      },
      listingAdvertisement: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    return {
      prisma,
      service: new OfficeAdvertisementsService(prisma as never),
    };
  }

  it('returns Naver comparison snapshots scoped to the office', async () => {
    const { prisma, service } = createService();
    prisma.officeAdvertisementGroup.findMany.mockResolvedValue([
      { id: 'group-1' },
    ]);
    prisma.officeAdvertisementGroup.count.mockResolvedValue(1);

    const result = await service.findAllGroups('office-1', {
      search: '2412345678',
      page: 1,
      limit: 50,
    });

    expect(result).toEqual({
      items: [{ id: 'group-1' }],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    expect(prisma.officeAdvertisementGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ officeId: 'office-1' }]),
        }),
        orderBy: { lastSeenAt: 'desc' },
        skip: 0,
        take: 50,
      }),
    );
  });

  it('stores a comparison directly under the canonical ListingAdvertisement', async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({
      id: 'listing-ad-1',
      naverArticleNo: '100',
      listing: { transactionType: 'sale' },
    });
    prisma.officeAdvertisementGroup.findUnique.mockResolvedValue(null);
    prisma.officeAdvertisementGroup.create.mockResolvedValue({
      id: 'group-1',
    });
    prisma.officeAdvertisement.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.officeAdvertisement.upsert
      .mockResolvedValueOnce({ id: 'ad-own' })
      .mockResolvedValueOnce({ id: 'ad-related' });
    prisma.officeAdvertisement.deleteMany.mockResolvedValue({ count: 0 });
    prisma.officeAdvertisement.findMany.mockResolvedValue([
      {
        isMine: true,
        price: 150000,
        deposit: null,
        monthlyRent: null,
      },
      {
        isMine: false,
        price: 149000,
        deposit: null,
        monthlyRent: null,
      },
    ]);
    prisma.officeAdvertisementGroup.update.mockResolvedValue({
      id: 'group-1',
    });
    prisma.listingAdvertisement.update.mockResolvedValue({
      id: 'listing-ad-1',
    });

    const result = await service.batchUpsert('office-1', {
      groups: [
        {
          listingAdvertisementId: 'listing-ad-1',
          advertisements: [
            {
              articleNo: '100',
              isMine: true,
              isMain: true,
              price: 150000,
              floorInfo: '중/25',
              verificationTypeCode: 'OWNER',
            },
            {
              articleNo: '101',
              realtorName: '타부동산',
              price: 149000,
              floorInfo: '12/25',
              verificationTypeCode: 'PHONE',
            },
          ],
        },
      ],
    });

    expect(result).toMatchObject({
      groupsReceived: 1,
      groupsCreated: 1,
      advertisementsCreated: 2,
      errors: [],
    });
    expect(prisma.officeAdvertisementGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        officeId: 'office-1',
        listingAdvertisementId: 'listing-ad-1',
      }),
      select: { id: true },
    });
    expect(prisma.officeAdvertisementGroup.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: expect.anything(),
        }),
      }),
    );
    expect(prisma.officeAdvertisement.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({
          floorInfo: '중/25',
          floorExposureMode: 'band',
          verificationTypeCode: 'OWNER',
        }),
      }),
    );
    expect(prisma.officeAdvertisement.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({
          floorInfo: '12/25',
          floorExposureMode: 'exact',
          verificationTypeCode: 'PHONE',
        }),
      }),
    );
    expect(prisma.officeAdvertisement.findMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1', isActive: true },
      select: {
        isMine: true,
        price: true,
        deposit: true,
        monthlyRent: true,
      },
    });
    expect(prisma.officeAdvertisementGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: expect.objectContaining({
        ownPrice: 150000,
        relatedCount: 1,
        relatedPriceMin: 149000,
        relatedPriceMax: 149000,
      }),
    });
    expect(prisma.listingAdvertisement.update).toHaveBeenCalledWith({
      where: { id: 'listing-ad-1' },
      data: { lastCheckedAt: expect.any(Date) },
    });
  });

  it('rejects comparison data that does not contain the exact Naver article', async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({
      id: 'listing-ad-1',
      naverArticleNo: '100',
      listing: { transactionType: 'sale' },
    });

    const result = await service.batchUpsert('office-1', {
      groups: [
        {
          listingAdvertisementId: 'listing-ad-1',
          advertisements: [{ articleNo: '999', price: 150000 }],
        },
      ],
    });

    expect(result.errors).toEqual([
      expect.objectContaining({
        articleNo: '999',
        message: expect.stringContaining('exact naverArticleNo'),
      }),
    ]);
    expect(prisma.officeAdvertisementGroup.create).not.toHaveBeenCalled();
  });

  it('reuses the one comparison group owned by a ListingAdvertisement', async () => {
    const { prisma, service } = createService();
    prisma.listingAdvertisement.findFirst.mockResolvedValue({
      id: 'listing-ad-1',
      naverArticleNo: '100',
      listing: { transactionType: 'sale' },
    });
    prisma.officeAdvertisementGroup.findUnique.mockResolvedValue({
      id: 'group-existing',
    });
    prisma.officeAdvertisement.findUnique.mockResolvedValue({ id: 'ad-own' });
    prisma.officeAdvertisement.upsert.mockResolvedValue({ id: 'ad-own' });
    prisma.officeAdvertisement.deleteMany.mockResolvedValue({ count: 0 });
    prisma.officeAdvertisement.findMany.mockResolvedValue([
      {
        isMine: true,
        price: 150000,
        deposit: null,
        monthlyRent: null,
      },
    ]);
    prisma.officeAdvertisementGroup.update.mockResolvedValue({
      id: 'group-existing',
    });
    prisma.listingAdvertisement.update.mockResolvedValue({
      id: 'listing-ad-1',
    });

    const result = await service.batchUpsert('office-1', {
      groups: [
        {
          listingAdvertisementId: 'listing-ad-1',
          advertisements: [{ articleNo: '100', isMine: true, price: 150000 }],
        },
      ],
    });

    expect(result.groupsReused).toBe(1);
    expect(result.groupsCreated).toBe(0);
    expect(prisma.officeAdvertisementGroup.create).not.toHaveBeenCalled();
  });

  it('does not flatten monthly deposit and rent into a scalar minimum', async () => {
    const { prisma, service } = createService();
    prisma.officeAdvertisement.findMany.mockResolvedValue([
      {
        isMine: true,
        price: null,
        deposit: 5000,
        monthlyRent: 180,
      },
      {
        isMine: false,
        price: null,
        deposit: 4000,
        monthlyRent: 200,
      },
    ]);
    prisma.officeAdvertisementGroup.update.mockResolvedValue({
      id: 'group-1',
    });

    await (
      service as unknown as {
        refreshGroupAggregates: (
          groupId: string,
          transactionType: string,
        ) => Promise<void>;
      }
    ).refreshGroupAggregates('group-1', 'monthly');

    expect(prisma.officeAdvertisementGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: {
        ownPrice: null,
        ownDeposit: 5000,
        ownMonthlyRent: 180,
        relatedCount: 1,
        relatedPriceMin: null,
        relatedPriceMax: null,
      },
    });
  });
});

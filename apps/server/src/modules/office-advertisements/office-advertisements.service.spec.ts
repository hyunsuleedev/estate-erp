import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OfficeAdvertisementsService } from './office-advertisements.service';

jest.mock('@estate-erp/shared', () => ({
  ListingAdvertisementChannel: {
    NAVER: 'naver',
  },
  ListingAdvertisementSource: {
    EXTERNAL_OBSERVED: 'external_observed',
  },
}));

describe('OfficeAdvertisementsService', () => {
  function createService() {
    const prisma = {
      officeAdvertisementGroup: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      officeAdvertisement: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        findMany: jest.fn(),
      },
      listing: {
        findFirst: jest.fn(),
      },
      listingAdvertisement: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    return {
      prisma,
      service: new OfficeAdvertisementsService(prisma as never),
    };
  }

  it('returns grouped office advertisements for the office', async () => {
    const { prisma, service } = createService();
    prisma.officeAdvertisementGroup.findMany.mockResolvedValue([{ id: 'group-1' }]);
    prisma.officeAdvertisementGroup.count.mockResolvedValue(1);

    const result = await service.findAllGroups('office-1', {
      source: 'naver',
      status: 'needs_unit_confirmation',
      page: 1,
      limit: 50,
    });

    expect(result).toEqual({
      items: [{ id: 'group-1' }],
      pagination: { page: 1, limit: 50, total: 1, totalPages: 1 },
    });
    expect(prisma.officeAdvertisementGroup.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          AND: [
            { officeId: 'office-1' },
            { source: 'naver' },
            { status: 'needs_unit_confirmation' },
          ],
        },
        orderBy: { lastSeenAt: 'desc' },
        skip: 0,
        take: 50,
      }),
    );
  });

  it('rejects invalid group status filters', async () => {
    const { service } = createService();

    await expect(
      service.findAllGroups('office-1', { status: 'bogus' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('batch upserts a new own ad group with related advertisements', async () => {
    const { prisma, service } = createService();
    prisma.officeAdvertisement.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    prisma.officeAdvertisementGroup.create.mockResolvedValue({ id: 'group-1' });
    prisma.officeAdvertisement.upsert
      .mockResolvedValueOnce({
        id: 'ad-own',
        isMine: true,
        price: 150000,
        deposit: null,
        monthlyRent: null,
      })
      .mockResolvedValueOnce({
        id: 'ad-related',
        isMine: false,
        price: 149000,
        deposit: null,
        monthlyRent: null,
      });
    prisma.officeAdvertisement.findMany.mockResolvedValue([
      { id: 'ad-own', isMine: true, price: 150000, deposit: null, monthlyRent: null },
      { id: 'ad-related', isMine: false, price: 149000, deposit: null, monthlyRent: null },
    ]);
    prisma.officeAdvertisementGroup.update.mockResolvedValue({ id: 'group-1' });

    const result = await service.batchUpsert('office-1', {
      source: 'naver',
      groups: [
        {
          siteName: '고덕그라시움',
          dongHint: '137',
          transactionType: 'sale',
          advertisements: [
            {
              articleNo: '100',
              isMine: true,
              isMain: true,
              price: 150000,
            },
            {
              articleNo: '101',
              realtorName: '타부동산',
              price: 149000,
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
        source: 'naver',
        siteName: '고덕그라시움',
        dongHint: '137',
      }),
      select: { id: true },
    });
    expect(prisma.officeAdvertisement.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.officeAdvertisementGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: expect.objectContaining({
        ownPrice: 150000,
        relatedCount: 1,
        relatedPriceMin: 149000,
        relatedPriceMax: 149000,
      }),
    });
  });

  it('reuses an existing group when the main advertisement already exists', async () => {
    const { prisma, service } = createService();
    prisma.officeAdvertisement.findUnique
      .mockResolvedValueOnce({ groupId: 'group-existing' })
      .mockResolvedValueOnce({ id: 'ad-own' });
    prisma.officeAdvertisement.upsert.mockResolvedValue({
      id: 'ad-own',
      isMine: true,
      price: 150000,
      deposit: null,
      monthlyRent: null,
    });
    prisma.officeAdvertisement.findMany.mockResolvedValue([
      { id: 'ad-own', isMine: true, price: 150000, deposit: null, monthlyRent: null },
    ]);
    prisma.officeAdvertisementGroup.update.mockResolvedValue({ id: 'group-existing' });

    const result = await service.batchUpsert('office-1', {
      source: 'naver',
      groups: [
        {
          advertisements: [{ articleNo: '100', isMine: true, price: 150000 }],
        },
      ],
    });

    expect(result.groupsReused).toBe(1);
    expect(result.groupsCreated).toBe(0);
    expect(prisma.officeAdvertisementGroup.create).not.toHaveBeenCalled();
  });

  it('links a group to an owned listing and creates a listing advertisement', async () => {
    const { prisma, service } = createService();
    prisma.officeAdvertisementGroup.findFirst.mockResolvedValue({
      id: 'group-1',
      officeId: 'office-1',
      memo: '네이버 내 광고',
      hoHint: null,
      mainAdvertisement: {
        articleNo: '100',
        sourceUrl: 'https://m.land.naver.com/article/info/100',
        cpPcArticleUrl: 'https://land.naver.com/article/100',
        price: 150000,
        deposit: null,
        monthlyRent: null,
        articleConfirmYmd: '20260526',
      },
    });
    prisma.listing.findFirst.mockResolvedValue({
      id: 'listing-1',
      transactionType: 'sale',
      price: 150000,
      deposit: null,
      monthlyRent: null,
    });
    prisma.listingAdvertisement.findFirst.mockResolvedValue(null);
    prisma.listingAdvertisement.create.mockResolvedValue({ id: 'listing-ad-1' });
    prisma.officeAdvertisementGroup.update.mockResolvedValue({ id: 'group-1', status: 'linked' });

    const result = await service.linkGroupToListing('group-1', 'office-1', {
      listingId: 'listing-1',
      hoHint: '702',
    });

    expect(result).toEqual({ id: 'group-1', status: 'linked' });
    expect(prisma.listingAdvertisement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        officeId: 'office-1',
        listingId: 'listing-1',
        channel: 'naver',
        source: 'external_observed',
        externalAdId: '100',
        url: 'https://land.naver.com/article/100',
      }),
      select: { id: true },
    });
    expect(prisma.officeAdvertisementGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: expect.objectContaining({
        listingId: 'listing-1',
        listingAdvertisementId: 'listing-ad-1',
        hoHint: '702',
        status: 'linked',
      }),
      include: expect.any(Object),
    });
  });

  it('rejects linking a group to a listing from another office', async () => {
    const { prisma, service } = createService();
    prisma.officeAdvertisementGroup.findFirst.mockResolvedValue({
      id: 'group-1',
      mainAdvertisement: null,
    });
    prisma.listing.findFirst.mockResolvedValue(null);

    await expect(
      service.linkGroupToListing('group-1', 'office-1', { listingId: 'other-listing' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.listingAdvertisement.create).not.toHaveBeenCalled();
  });
});

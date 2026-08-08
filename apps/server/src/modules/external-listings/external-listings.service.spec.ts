import { ExternalListingsService } from './external-listings.service';

describe('ExternalListingsService', () => {
  function createService() {
    const prisma = {
      externalListingGroup: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      externalListing: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      externalListingSnapshotSession: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      site: {
        findFirst: jest.fn(),
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

  it('classifies groups as new, added, or existing against the latest collection session', async () => {
    const { prisma, service } = createService();
    const sessionStartedAt = new Date('2026-07-31T09:00:00.000Z');
    const beforeSession = new Date('2026-07-30T09:00:00.000Z');
    const duringSession = new Date('2026-07-31T09:05:00.000Z');
    const listingBase = {
      source: 'naver',
      price: 180000,
      deposit: null,
      monthlyRent: null,
      transactionType: 'sale',
      articleConfirmYmd: '20260731',
      verificationTypeCode: null,
      ranking: null,
      seango: false,
      epju: false,
    };

    prisma.externalListingGroup.findMany.mockResolvedValue([
      {
        id: 'group-new',
        siteId: 'site-1',
        transactionType: 'sale',
        firstSeenAt: duringSession,
        mainExternalListing: null,
        listings: [
          {
            ...listingBase,
            id: 'listing-new',
            articleNo: 'new-1',
            firstSeenAt: duringSession,
          },
        ],
        _count: { listings: 1 },
      },
      {
        id: 'group-added',
        siteId: 'site-1',
        transactionType: 'sale',
        firstSeenAt: beforeSession,
        mainExternalListing: null,
        listings: [
          {
            ...listingBase,
            id: 'listing-old-sibling',
            articleNo: 'old-1',
            firstSeenAt: beforeSession,
          },
          {
            ...listingBase,
            id: 'listing-added',
            articleNo: 'added-1',
            firstSeenAt: duringSession,
          },
        ],
        _count: { listings: 2 },
      },
      {
        id: 'group-existing',
        siteId: 'site-1',
        transactionType: 'sale',
        firstSeenAt: beforeSession,
        mainExternalListing: null,
        listings: [
          {
            ...listingBase,
            id: 'listing-existing',
            articleNo: 'existing-1',
            firstSeenAt: beforeSession,
          },
        ],
        _count: { listings: 1 },
      },
    ]);
    prisma.externalListingSnapshotSession.findMany.mockResolvedValue([
      {
        siteId: 'site-1',
        transactionType: 'sale',
        startedAt: sessionStartedAt,
      },
    ]);
    prisma.officeAdvertisement.findMany.mockResolvedValue([]);

    const groups = await service.findAllGroups('office-1', {
      transactionType: 'sale',
    });

    expect(groups.map((group) => [group.id, group.discoveryStatus])).toEqual([
      ['group-new', 'new'],
      ['group-added', 'added'],
      ['group-existing', 'existing'],
    ]);
    expect(
      prisma.externalListingSnapshotSession.findMany,
    ).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        status: { in: ['active', 'completed'] },
        OR: [{ siteId: 'site-1', transactionType: 'sale' }],
      },
      select: {
        siteId: true,
        transactionType: true,
        startedAt: true,
      },
      orderBy: { startedAt: 'desc' },
    });
  });

  it('stores a trimmed ho string without resolving a Unit', async () => {
    const { prisma, service } = createService();
    prisma.externalListingGroup.findFirst.mockResolvedValue({
      id: 'group-1',
      siteId: 'site-1',
    });
    prisma.externalListingGroup.update.mockResolvedValue({
      id: 'group-1',
      ho: '1503호',
    });

    await service.updateGroup('group-1', 'office-1', { ho: ' 1503호 ' });

    expect(prisma.externalListingGroup.update).toHaveBeenCalledWith({
      where: { id: 'group-1' },
      data: { ho: '1503호' },
      include: {
        site: true,
        mainExternalListing: true,
      },
    });
  });

  it('creates text-only ho groups as verified and rejects the removed matched status', async () => {
    const { prisma, service } = createService();
    prisma.site.findFirst.mockResolvedValue({ id: 'site-1' });
    prisma.externalListingSnapshotSession.findFirst.mockResolvedValue(null);
    prisma.externalListing.findMany.mockResolvedValue([]);
    prisma.externalListingGroup.create.mockResolvedValue({ id: 'group-1' });
    prisma.externalListing.create.mockResolvedValue({ id: 'listing-1' });
    prisma.externalListingGroup.findUnique.mockResolvedValue({
      mainExternalListingId: null,
    });
    prisma.externalListingGroup.update.mockResolvedValue({});

    const result = await service.batchUpsert('office-1', {
      source: 'manual',
      siteId: 'site-1',
      transactionType: 'sale',
      listings: [{ articleNo: 'manual-1', ho: ' 1503호 ' }],
    });

    expect(result).toMatchObject({
      created: 1,
      groupsCreated: 1,
      errors: [],
    });
    expect(prisma.externalListingGroup.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ho: '1503호',
        status: 'verified',
      }),
    });

    prisma.externalListingGroup.findFirst.mockResolvedValue({
      id: 'group-1',
      siteId: 'site-1',
    });
    await expect(
      service.updateGroup('group-1', 'office-1', { status: 'matched' }),
    ).rejects.toThrow('Invalid status');
  });
});

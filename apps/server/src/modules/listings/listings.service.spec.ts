import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ListingsService } from './listings.service';

jest.mock('@estate-erp/shared', () => ({
  IntakeLifecycleStatus: {
    OPEN: 'open',
    HOLD: 'hold',
    CLOSED: 'closed',
  },
  NON_CLOSED_INTAKE_LIFECYCLE_STATUSES: ['open', 'hold'],
  IntakeCheckResult: {
    ALIVE: 'alive',
    PRICE_CHANGED: 'price_changed',
    UNAVAILABLE: 'unavailable',
    NO_ANSWER: 'no_answer',
    PENDING: 'pending',
  },
  IntakeConfirmationState: {
    UNVERIFIED: 'unverified',
    VERIFIED: 'verified',
    OVERDUE: 'overdue',
    NO_ANSWER: 'no_answer',
  },
  ListingAvailability: {
    AVAILABLE: 'available',
    PAUSED: 'paused',
    IN_CONTRACT: 'in_contract',
    CLOSED: 'closed',
  },
  ListingAdvertisementStatus: {
    ACTIVE: 'active',
    ENDED: 'ended',
  },
  IN_CONTRACT_DEAL_STAGES: ['preparing', 'preContract', 'contracted', 'settling'],
  OCCUPYING_DEAL_STAGES: ['preparing', 'preContract', 'contracted', 'settling', 'completed', 'closed'],
  DONE_DEAL_STAGES: ['completed', 'closed'],
  TransactionType: {
    SALE: 'sale',
    JEONSE: 'jeonse',
    MONTHLY: 'monthly',
  },
  MaintenanceFeeInclude: {
    WATER: 'water',
    ELECTRICITY: 'electricity',
    GAS: 'gas',
    INTERNET: 'internet',
    TV: 'tv',
    CLEANING: 'cleaning',
    PARKING: 'parking',
    HEATING: 'heating',
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
        delete: jest.fn(),
      },
      listingIntake: {
        findFirst: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({
          _max: { casePriorityRank: null },
        }),
      },
      propertyContact: {
        findMany: jest.fn().mockResolvedValue([
          {
            contactId: 'owner-1',
            role: 'owner',
            isPrimary: true,
          },
        ]),
      },
      brokerageCase: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'case-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
      brokerageCaseParticipant: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    // 인터랙티브 트랜잭션은 tx 로 prisma mock 자신을 넘겨 공유한다.
    prisma.$transaction.mockImplementation(
      async (input: unknown) =>
        typeof input === 'function'
          ? (input as (tx: typeof prisma) => Promise<unknown>)(prisma)
          : Promise.all(input as Array<Promise<unknown>>),
    );

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
        brokerageCaseId: 'case-1',
        casePriorityRank: 1,
        propertyId: 'property-1',
        lifecycleChangedAt: expect.any(Date),
        lifecycleChangedBy: 'user',
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
      price: 160000,
    };
    prisma.listing.findFirst.mockResolvedValue({
      ...updatedListing,
      price: 150000,
    });
    prisma.listing.update.mockResolvedValue(updatedListing);

    await service.update('listing-1', 'office-1', { price: 160000 });

    expect(realtime.emitListingUpdated).toHaveBeenCalledWith({
      officeId: 'office-1',
      listingId: 'listing-1',
      propertyId: 'property-1',
      intakeId: 'intake-1',
    });
  });

  it('emits a realtime listing update after creating a listing', async () => {
    const { prisma } = createService();
    const realtime = {
      emitListingUpdated: jest.fn(),
    };
    const service = new ListingsService(prisma as never, realtime as never);
    const createdListing = {
      id: 'listing-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      intakeId: 'intake-1',
      transactionType: 'sale',
    };
    prisma.property.findFirst.mockResolvedValue({ id: 'property-1' });
    prisma.listingIntake.findFirst.mockResolvedValue({ id: 'intake-1' });
    prisma.listing.findFirst.mockResolvedValue(null);
    prisma.listing.create.mockResolvedValue(createdListing);

    await service.create('office-1', {
      propertyId: 'property-1',
      transactionType: 'sale',
      price: 150000,
    });

    expect(realtime.emitListingUpdated).toHaveBeenCalledWith({
      officeId: 'office-1',
      listingId: 'listing-1',
      propertyId: 'property-1',
      intakeId: 'intake-1',
    });
  });

  it('emits a realtime listing update after deleting a listing', async () => {
    const { prisma } = createService();
    const realtime = {
      emitListingUpdated: jest.fn(),
    };
    const service = new ListingsService(prisma as never, realtime as never);
    const listing = {
      id: 'listing-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      intakeId: 'intake-1',
      transactionType: 'sale',
    };
    prisma.listing.findFirst.mockResolvedValue(listing);
    prisma.listing.delete.mockResolvedValue(listing);

    await service.remove('listing-1', 'office-1');

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
      updatedAt: new Date('2026-05-20T01:00:00.000Z'),
    });
    prisma.listing.update.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Record not found', {
        code: 'P2025',
        clientVersion: 'test',
      }),
    );

    await expect(
      service.update('listing-1', 'office-1', {
        price: 270000,
        expectedUpdatedAt: '2026-05-20T00:00:00.000Z',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(prisma.listing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'listing-1',
          officeId: 'office-1',
          updatedAt: new Date('2026-05-20T00:00:00.000Z'),
        },
      }),
    );
    expect(prisma.listing.updateMany).not.toHaveBeenCalled();
  });

  it('uses a single-row optimistic update so price history middleware receives the changed row', async () => {
    const { prisma, service } = createService();
    const updatedListing = {
      id: 'listing-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      intakeId: 'intake-1',
      transactionType: 'sale',
      price: 270000,
      updatedAt: new Date('2026-05-20T02:00:00.000Z'),
    };
    prisma.listing.findFirst.mockResolvedValue({
      ...updatedListing,
      price: 275000,
      updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    });
    prisma.listing.update.mockResolvedValue(updatedListing);

    await expect(
      service.update('listing-1', 'office-1', {
        price: 270000,
        expectedUpdatedAt: '2026-05-20T00:00:00.000Z',
      }),
    ).resolves.toBe(updatedListing);

    expect(prisma.listing.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'listing-1',
          officeId: 'office-1',
          updatedAt: new Date('2026-05-20T00:00:00.000Z'),
        },
        data: { price: 270000 },
      }),
    );
    expect(prisma.listing.updateMany).not.toHaveBeenCalled();
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
        // 단지 필터 카운트도 기본 목록과 같은 기준 (종결되지 않은 의뢰만)
        intake: {
          lifecycleStatus: { in: ['open', 'hold'] },
        },
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

  it('skips listings without a usable site when building filter sites', async () => {
    const { prisma, service } = createService();
    prisma.listing.findMany.mockResolvedValue([
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
        propertyId: 'property-without-site',
        property: {
          site: null,
        },
      },
      {
        propertyId: 'property-without-relation',
        property: null,
      },
    ]);

    await expect(service.findFilterSites('office-1')).resolves.toEqual([
      {
        id: 'site-1',
        name: '고덕그라시움',
        type: 'apartment',
        roadAddress: '서울시 강동구 고덕로',
        jibunAddress: null,
        listingCount: 1,
        propertyCount: 1,
      },
    ]);
  });

  it('excludes listings of closed intakes from the default list', async () => {
    const { prisma, service } = createService();
    prisma.listing.findMany.mockResolvedValue([]);
    prisma.listing.count.mockResolvedValue(0);

    await service.findAll('office-1');

    expect(prisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              intake: {
                lifecycleStatus: { in: ['open', 'hold'] },
              },
            },
          ]),
        }),
      }),
    );
  });

  it('filters buyer candidates by supply area with unit-type fallback', async () => {
    const { prisma, service } = createService();
    prisma.listing.findMany.mockResolvedValue([]);
    prisma.listing.count.mockResolvedValue(0);

    await service.findAll('office-1', { areaMin: 99.17, areaMax: 112.4 });

    expect(prisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              property: {
                unit: {
                  OR: [
                    { supplyAreaM2: { gte: 99.17, lte: 112.4 } },
                    {
                      supplyAreaM2: null,
                      siteUnitType: {
                        supplyAreaM2: { gte: 99.17, lte: 112.4 },
                      },
                    },
                  ],
                },
              },
            },
          ]),
        }),
      }),
    );
  });

  it('shows closed intakes when explicitly filtered or includeClosed is set', async () => {
    const { prisma, service } = createService();
    prisma.listing.findMany.mockResolvedValue([]);
    prisma.listing.count.mockResolvedValue(0);

    await service.findAll('office-1', {
      intakeLifecycleStatus: 'closed',
    });
    expect(prisma.listing.findMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { intake: { lifecycleStatus: 'closed' } },
          ]),
        }),
      }),
    );

    await service.findAll('office-1', { includeClosed: true });
    // includeClosed: 의뢰 상태 필터 자체가 빠진다
    const lastWhere = prisma.listing.findMany.mock.calls.at(-1)[0].where;
    expect(JSON.stringify(lastWhere)).not.toContain('intake');
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
            where: { status: 'active' },
            orderBy: { createdAt: 'desc' },
          }),
          _count: {
            select: {
              matches: true,
              advertisements: { where: { status: 'active' } },
            },
          },
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
                  isPaused: true,
                  deals: expect.objectContaining({
                    select: { id: true, stage: true, stageChangedAt: true },
                  }),
                  advertisements: expect.objectContaining({
                    where: { status: 'active' },
                    orderBy: { createdAt: 'desc' },
                  }),
                  _count: {
                    select: {
                      matches: true,
                      advertisements: { where: { status: 'active' } },
                    },
                  },
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it('exposes current advertisements without mixing in publication history', async () => {
    const { prisma, service } = createService();
    const activeAdvertisement = {
      id: 'ad-active',
      channel: 'naver',
      status: 'active',
    };
    prisma.listing.findMany.mockResolvedValue([
      {
        id: 'listing-1',
        advertisements: [activeAdvertisement],
        _count: { matches: 3, advertisements: 1 },
        property: {
          listings: [
            {
              id: 'listing-1',
              advertisements: [activeAdvertisement],
              _count: { matches: 3, advertisements: 1 },
            },
          ],
        },
      },
    ]);
    prisma.listing.count.mockResolvedValue(1);

    const result = await service.findAll('office-1');
    const listing = result.items[0] as Record<string, unknown>;
    const sibling = (listing.property as { listings: Record<string, unknown>[] })
      .listings[0];

    expect(listing).toMatchObject({
      activeAdvertisementCount: 1,
      activeAdvertisements: [activeAdvertisement],
      _count: { matches: 3 },
    });
    expect(listing).not.toHaveProperty('advertisements');
    expect(sibling).toMatchObject({
      activeAdvertisementCount: 1,
      activeAdvertisements: [activeAdvertisement],
      _count: { matches: 3 },
    });
    expect(sibling).not.toHaveProperty('advertisements');
  });

  it('keeps the full advertisement publication history in detail responses', async () => {
    const { prisma, service } = createService();
    prisma.listing.findFirst.mockResolvedValue({ id: 'listing-1' });

    await service.findOne('listing-1', 'office-1');

    const args = prisma.listing.findFirst.mock.calls[0][0];
    expect(args.include.advertisements).toEqual({
      orderBy: { createdAt: 'desc' },
    });
    expect(args.include.property.include.listings.include.advertisements).toEqual(
      { orderBy: { createdAt: 'desc' } },
    );
  });
});

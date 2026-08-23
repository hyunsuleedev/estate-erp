import { ListingIntakesService } from './listing-intakes.service';

describe('ListingIntakesService', () => {
  function createService() {
    const tx = {
      listingIntake: {
        create: jest.fn().mockResolvedValue({ id: 'intake-1' }),
        findFirst: jest.fn(),
        aggregate: jest.fn().mockResolvedValue({
          _max: { casePriorityRank: null },
        }),
        update: jest.fn().mockResolvedValue({ id: 'intake-1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
      deal: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      consultation: {
        create: jest.fn().mockResolvedValue({ id: 'consultation-1' }),
      },
      $executeRaw: jest.fn().mockResolvedValue(0),
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
      lastCheckedAt: '2026-05-19T00:00:00.000Z',
      lastVerifiedAt: '2026-05-19T00:00:00.000Z',
      lastCheckResult: 'alive',
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

  it('uses a narrowed select for list queries', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1');

    const args = prisma.listingIntake.findMany.mock.calls[0][0];
    expect(args).toHaveProperty('select');
    expect(args).not.toHaveProperty('include');
    expect(args.select.property.select.site.select).toEqual(
      expect.objectContaining({
        id: true,
        name: true,
        type: true,
        roadAddress: true,
        jibunAddress: true,
      }),
    );
    expect(args.select.property.select.site.select).not.toHaveProperty('metadata');
    expect(args.select.listings.select._count).toEqual({
      select: {
        matches: true,
        advertisements: { where: { status: 'active' } },
      },
    });
    expect(args.select.listings.select.advertisements.where).toEqual({
      status: 'active',
    });
    expect(args.select.listings.select.advertisements).not.toHaveProperty(
      'take',
    );
    expect(args.select.listings.select.advertisements.select).toEqual({
      id: true,
      channel: true,
      status: true,
      advertisedPrice: true,
      advertisedDeposit: true,
      advertisedMonthlyRent: true,
      startedAt: true,
      url: true,
      createdAt: true,
    });
  });

  it('exposes active advertisements separately from advertisement history', async () => {
    const { prisma, service } = createService();
    const activeAdvertisement = {
      id: 'ad-active',
      channel: 'naver',
      status: 'active',
    };
    prisma.listingIntake.findMany.mockResolvedValue([
      {
        id: 'intake-1',
        listings: [
          {
            id: 'listing-1',
            advertisements: [activeAdvertisement],
            _count: { matches: 2, advertisements: 1 },
          },
        ],
      },
    ]);

    const result = await service.findAll('office-1');
    const listing = (
      result.items[0] as { listings: Array<Record<string, unknown>> }
    ).listings[0];

    expect(listing).toMatchObject({
      activeAdvertisementCount: 1,
      activeAdvertisements: [activeAdvertisement],
      _count: { matches: 2 },
    });
    expect(listing).not.toHaveProperty('advertisements');
  });

  it('includes ordered price histories for listings in the detail view', () => {
    const { service } = createService();
    const detailInclude = (
      service as unknown as {
        buildDetailInclude: () => {
          listings: {
            include: {
              advertisements: {
                orderBy: { createdAt: 'desc' };
              };
              priceHistories: {
                orderBy: { createdAt: 'desc' };
              };
            };
          };
        };
      }
    ).buildDetailInclude();

    expect(detailInclude.listings.include.priceHistories).toEqual({
      orderBy: { createdAt: 'desc' },
    });
    expect(detailInclude.listings.include.advertisements).toEqual({
      orderBy: { createdAt: 'desc' },
    });
  });

  it('uses limit plus one instead of count for list pagination', async () => {
    const { prisma, service } = createService();
    prisma.listingIntake.findMany.mockResolvedValue([
      { id: 'intake-1' },
      { id: 'intake-2' },
      { id: 'intake-3' },
    ]);

    const result = await service.findAll('office-1', { limit: 2 });

    expect(prisma.listingIntake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 3,
      }),
    );
    expect(prisma.listingIntake.count).not.toHaveBeenCalled();
    expect(result.items).toHaveLength(2);
    expect(result.pagination).toEqual({
      page: 1,
      limit: 2,
      hasNextPage: true,
      total: null,
      totalPages: null,
    });
  });

  it('sorts the full filtered intake set by the displayed listing price', async () => {
    const { prisma, service } = createService();
    const candidate = (id: string, price: number, receivedAt: string) => ({
      id,
      lifecycleStatus: 'open',
      receivedAt: new Date(receivedAt),
      lastCheckedAt: null,
      lastVerifiedAt: null,
      memo: null,
      createdAt: new Date(receivedAt),
      updatedAt: new Date(receivedAt),
      property: { site: { name: '고덕그라시움' }, unit: null },
      listings: [
        {
          transactionType: 'sale',
          price,
          deposit: null,
          monthlyRent: null,
          loanAmount: null,
          moveInAvailableType: 'immediate',
          moveInAvailableFrom: null,
          moveInAvailableTo: null,
          isPaused: false,
          updatedAt: new Date(receivedAt),
          deals: [],
          _count: { matches: 0 },
          advertisements: [],
        },
      ],
    });

    prisma.listingIntake.findMany
      .mockResolvedValueOnce([
        candidate('expensive', 300000, '2026-08-01T00:00:00.000Z'),
        candidate('cheap', 100000, '2026-07-01T00:00:00.000Z'),
      ])
      // DB의 IN 조회 반환 순서와 무관하게 정렬된 ID 순서를 복원해야 한다.
      .mockResolvedValueOnce([{ id: 'expensive' }, { id: 'cheap' }]);

    const result = await service.findAll('office-1', {
      sortBy: 'price',
      sortOrder: 'asc',
      limit: 2,
    });

    expect(result.items.map((item) => item.id)).toEqual([
      'cheap',
      'expensive',
    ]);
    expect(prisma.listingIntake.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: { in: ['cheap', 'expensive'] } },
      }),
    );
  });

  it('sorts by the displayed supply area with the unit-type fallback', async () => {
    const { prisma, service } = createService();
    const candidate = (
      id: string,
      supplyAreaM2: number | null,
      unitTypeSupplyAreaM2: number,
    ) => ({
      id,
      lifecycleStatus: 'open',
      receivedAt: new Date('2026-08-01T00:00:00.000Z'),
      lastCheckedAt: null,
      lastVerifiedAt: null,
      memo: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      property: {
        site: { name: '고덕그라시움' },
        unit: {
          name: '101호',
          exclusiveAreaM2: null,
          supplyAreaM2,
          dong: { name: '101동' },
          siteUnitType: {
            name: '84A',
            exclusiveAreaM2: null,
            supplyAreaM2: unitTypeSupplyAreaM2,
          },
        },
      },
      listings: [],
    });

    prisma.listingIntake.findMany
      .mockResolvedValueOnce([
        candidate('fallback', null, 112.4),
        candidate('unit-value', 99.2, 130),
      ])
      .mockResolvedValueOnce([{ id: 'unit-value' }, { id: 'fallback' }]);

    const result = await service.findAll('office-1', {
      sortBy: 'supplyArea',
      sortOrder: 'asc',
      limit: 2,
    });

    expect(result.items.map((item) => item.id)).toEqual([
      'unit-value',
      'fallback',
    ]);
    expect(prisma.listingIntake.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: { id: { in: ['unit-value', 'fallback'] } },
      }),
    );
  });

  it('sorts by active advertisement count instead of stored publication rows', async () => {
    const { prisma, service } = createService();
    const candidate = (
      id: string,
      activeAdvertisementCount: number,
      advertisements: Array<{ status: string }>,
    ) => ({
      id,
      lifecycleStatus: 'open',
      receivedAt: new Date('2026-08-01T00:00:00.000Z'),
      lastCheckedAt: null,
      lastVerifiedAt: null,
      memo: null,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      property: { site: { name: '고덕그라시움' }, unit: null },
      listings: [
        {
          transactionType: 'sale',
          price: 150000,
          deposit: null,
          monthlyRent: null,
          loanAmount: null,
          moveInAvailableType: 'immediate',
          moveInAvailableFrom: null,
          moveInAvailableTo: null,
          isPaused: false,
          updatedAt: new Date('2026-08-01T00:00:00.000Z'),
          deals: [],
          _count: {
            matches: 0,
            advertisements: activeAdvertisementCount,
          },
          advertisements,
        },
      ],
    });

    prisma.listingIntake.findMany
      .mockResolvedValueOnce([
        candidate('a-ended-only', 0, [{ status: 'ended' }]),
        candidate('z-currently-active', 1, [{ status: 'active' }]),
      ])
      .mockResolvedValueOnce([
        { id: 'z-currently-active' },
        { id: 'a-ended-only' },
      ]);

    const result = await service.findAll('office-1', {
      sortBy: 'advertisement',
      sortOrder: 'desc',
      limit: 2,
    });

    expect(result.items.map((item) => item.id)).toEqual([
      'z-currently-active',
      'a-ended-only',
    ]);
  });

  it('filters by advertisement presence', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1', { hasAdvertisement: true });

    expect(prisma.listingIntake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              listings: {
                some: {
                  advertisements: { some: { status: "active" } },
                },
              },
            },
          ]),
        }),
      }),
    );
  });

  it('filters by advertisement absence', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1', { hasAdvertisement: false });

    expect(prisma.listingIntake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              listings: {
                none: {
                  advertisements: { some: { status: "active" } },
                },
              },
            },
          ]),
        }),
      }),
    );
  });

  it('filters by multiple derived listing availabilities', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1', {
      availabilities: ['available', 'paused'],
    });

    expect(prisma.listingIntake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              listings: {
                some: expect.objectContaining({
                  OR: [expect.any(Object), expect.any(Object)],
                }),
              },
            },
          ]),
        }),
      }),
    );
  });

  it('filters by multiple site types', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1', {
      siteTypes: ['apartment', 'villa'],
    });

    expect(prisma.listingIntake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              property: {
                site: {
                  type: { in: ['apartment', 'villa'] },
                },
              },
            },
          ]),
        }),
      }),
    );
  });

  it('filters map listings by derived availability', async () => {
    const { prisma, service } = createService();

    await service.findMapIntakes('office-1', {
      availability: 'in_contract',
    });

    const args = prisma.listingIntake.findMany.mock.calls[0][0];
    expect(args.where).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          {
            listings: {
              some: expect.objectContaining({
                AND: expect.arrayContaining([
                  expect.objectContaining({
                    deals: expect.objectContaining({ some: expect.any(Object) }),
                  }),
                ]),
              }),
            },
          },
        ]),
      }),
    );
    expect(args.select.listings.where).toEqual(
      expect.objectContaining({
        AND: expect.arrayContaining([
          expect.objectContaining({
            deals: expect.objectContaining({ some: expect.any(Object) }),
          }),
        ]),
      }),
    );
  });

  it('filters by joint brokerage absence on the intake (single source of truth)', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1', { isJointBrokerage: false });

    expect(prisma.listingIntake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ isJointBrokerageRequired: false }),
          ]),
        }),
      }),
    );
  });

  it('filters dong and unit as separate typed terms', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1', { dong: '101', unit: '1004' });

    expect(prisma.listingIntake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              property: {
                unit: {
                  AND: [
                    {
                      dong: {
                        name: { equals: '101', mode: 'insensitive' },
                      },
                    },
                    {
                      name: { equals: '1004', mode: 'insensitive' },
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

  it('filters by province code through site legal-dong hierarchy', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1', {
      provinceCode: '11',
    });

    expect(prisma.listingIntake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              property: {
                site: {
                  ward: {
                    district: {
                      provinceCode: '11',
                    },
                  },
                },
              },
            },
          ]),
        }),
      }),
    );
  });

  it('filters by district code through site legal-dong hierarchy', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1', {
      districtCode: '11740',
    });

    expect(prisma.listingIntake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              property: {
                site: {
                  ward: {
                    districtCode: '11740',
                  },
                },
              },
            },
          ]),
        }),
      }),
    );
  });

  it('filters by multiple site ids', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1', {
      siteIds: ['site-1', 'site-2'],
    });

    expect(prisma.listingIntake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              property: {
                siteId: { in: ['site-1', 'site-2'] },
                site: {},
              },
            },
          ]),
        }),
      }),
    );
  });

  it('filters exact room and bathroom counts with Unit-first fallback semantics', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1', {
      roomCount: 2,
      bathRoomCount: 1,
    });

    expect(prisma.listingIntake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              property: {
                unit: {
                  OR: [
                    { roomCount: 2 },
                    {
                      roomCount: null,
                      siteUnitType: { roomCount: 2 },
                    },
                  ],
                },
              },
            },
            {
              property: {
                unit: {
                  OR: [
                    { bathRoomCount: 1 },
                    {
                      bathRoomCount: null,
                      siteUnitType: { bathRoomCount: 1 },
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

  it('filters minimum room and bathroom counts without bypassing a Unit override', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1', {
      roomCountMin: 4,
      bathRoomCountMin: 3,
    });

    const args = prisma.listingIntake.findMany.mock.calls[0][0];
    expect(args.where.AND).toEqual(
      expect.arrayContaining([
        {
          property: {
            unit: {
              OR: [
                { roomCount: { gte: 4 } },
                {
                  roomCount: null,
                  siteUnitType: { roomCount: { gte: 4 } },
                },
              ],
            },
          },
        },
        {
          property: {
            unit: {
              OR: [
                { bathRoomCount: { gte: 3 } },
                {
                  bathRoomCount: null,
                  siteUnitType: { bathRoomCount: { gte: 3 } },
                },
              ],
            },
          },
        },
      ]),
    );
  });

  it('rejects invalid or ambiguous room and bathroom count filters', async () => {
    const { service } = createService();

    await expect(
      service.findAll('office-1', { roomCount: -1 }),
    ).rejects.toThrow('roomCount must be a non-negative integer');
    await expect(
      service.findAll('office-1', { bathRoomCount: 1.5 }),
    ).rejects.toThrow('bathRoomCount must be a non-negative integer');
    await expect(
      service.findAll('office-1', { roomCount: 3, roomCountMin: 4 }),
    ).rejects.toThrow('Use either roomCount or roomCountMin');
  });

  it('uses ward code as the most specific region filter', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1', {
      provinceCode: '11',
      districtCode: '11740',
      wardCode: '1174010100',
    });

    expect(prisma.listingIntake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              property: {
                site: {
                  wardCode: '1174010100',
                },
              },
            },
          ]),
        }),
      }),
    );
  });

  it('filters by move-in available date range', async () => {
    const { prisma, service } = createService();

    await service.findAll('office-1', {
      moveInFrom: '2026-06-01',
      moveInTo: '2026-06-30',
    });

    expect(prisma.listingIntake.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              listings: {
                some: expect.objectContaining({
                  moveInAvailableFrom: {
                    gte: new Date('2026-06-01'),
                    lte: new Date('2026-06-30'),
                  },
                }),
              },
            },
          ]),
        }),
      }),
    );
  });

  it('rejects a stale intake update when expectedUpdatedAt no longer matches', async () => {
    const { prisma, service } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      lifecycleStatus: 'open',
      closedReason: null,
      updatedAt: new Date('2026-05-20T01:00:00.000Z'),
    });
    prisma.listingIntake.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.update('intake-1', 'office-1', {
        lifecycleStatus: 'hold',
        expectedUpdatedAt: '2026-05-20T00:00:00.000Z',
      }),
    ).rejects.toThrow('다른 사용자가 먼저 수정했습니다.');

    expect(prisma.listingIntake.update).not.toHaveBeenCalled();
  });

  it('moves an open intake to hold and stamps lifecycle metadata', async () => {
    const { prisma, service } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      lifecycleStatus: 'open',
      closedReason: null,
      updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    });
    prisma.listingIntake.update.mockResolvedValue({ id: 'intake-1' });

    await service.updateLifecycleStatus('intake-1', 'office-1', 'hold');

    expect(prisma.listingIntake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lifecycleStatus: 'hold',
          lifecycleChangedAt: expect.any(Date),
          lifecycleChangedBy: 'user',
          closedReason: null,
        }),
      }),
    );
  });

  it('closes an intake and cancels its active Deals in one transaction', async () => {
    const { service, tx } = createService();
    tx.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      propertyId: 'property-1',
      lifecycleStatus: 'open',
    });

    await service.closeWithActiveDeals(
      'intake-1',
      'office-1',
      'external_deal_completed',
      '2026-05-20T00:00:00.000Z',
    );

    expect(tx.listingIntake.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'intake-1',
        officeId: 'office-1',
        updatedAt: new Date('2026-05-20T00:00:00.000Z'),
      },
      data: {
        lifecycleStatus: 'closed',
        lifecycleChangedAt: expect.any(Date),
        lifecycleChangedBy: 'user',
        closedReason: 'external_deal_completed',
      },
    });
    expect(tx.deal.updateMany).toHaveBeenCalledWith({
      where: {
        officeId: 'office-1',
        isCancelled: false,
        stage: {
          in: ['preparing', 'preContract', 'contracted', 'settling'],
        },
        listing: { intakeId: 'intake-1' },
      },
      data: {
        isCancelled: true,
        cancelledAt: expect.any(Date),
        cancelledBy: 'office',
        cancelReason:
          '매물 종료와 함께 취소 처리 (external_deal_completed)',
      },
    });
  });

  it('does not cancel a Deal when the intake version is stale', async () => {
    const { service, tx } = createService();
    tx.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      propertyId: 'property-1',
      lifecycleStatus: 'open',
    });
    tx.listingIntake.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.closeWithActiveDeals(
        'intake-1',
        'office-1',
        'withdrawn',
        '2026-05-20T00:00:00.000Z',
      ),
    ).rejects.toThrow('다른 사용자가 먼저 수정했습니다.');

    expect(tx.deal.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a confirmation value as a lifecycle status', async () => {
    const { prisma, service } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      lifecycleStatus: 'open',
      closedReason: null,
      updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    });

    await expect(
      service.updateLifecycleStatus('intake-1', 'office-1', 'verified'),
    ).rejects.toThrow('Invalid ListingIntake lifecycle status');

    expect(prisma.listingIntake.update).not.toHaveBeenCalled();
  });

  it('allows reopening a closed intake directly into hold', async () => {
    const { prisma, service } = createService();
    prisma.listingIntake.findFirst
      .mockResolvedValueOnce({
        id: 'intake-1',
        officeId: 'office-1',
        propertyId: 'property-1',
        lifecycleStatus: 'closed',
        closedReason: 'other',
        updatedAt: new Date('2026-05-20T00:00:00.000Z'),
      })
      .mockResolvedValueOnce(null);
    prisma.listingIntake.update.mockResolvedValue({ id: 'intake-1' });

    await service.updateLifecycleStatus('intake-1', 'office-1', 'hold');

    expect(prisma.listingIntake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lifecycleStatus: 'hold',
          lifecycleChangedAt: expect.any(Date),
          lifecycleChangedBy: 'user',
          closedReason: null,
        }),
      }),
    );
  });

  it('allows reopening a closed intake when no other non-closed intake exists', async () => {
    const { prisma, service } = createService();
    prisma.listingIntake.findFirst
      // update() 대상 조회
      .mockResolvedValueOnce({
        id: 'intake-1',
        officeId: 'office-1',
        propertyId: 'property-1',
        lifecycleStatus: 'closed',
        closedReason: 'withdrawn',
        updatedAt: new Date('2026-05-20T00:00:00.000Z'),
      })
      // assertNoNonClosedIntake — 같은 Property 의 다른 활성 의뢰 없음
      .mockResolvedValueOnce(null);
    prisma.listingIntake.update.mockResolvedValue({ id: 'intake-1' });

    await service.updateLifecycleStatus('intake-1', 'office-1', 'open');

    expect(prisma.listingIntake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lifecycleStatus: 'open',
          lifecycleChangedAt: expect.any(Date),
          closedReason: null,
        }),
      }),
    );
  });

  it('rejects reopening when another non-closed intake exists on the property', async () => {
    const { prisma, service } = createService();
    prisma.listingIntake.findFirst
      .mockResolvedValueOnce({
        id: 'intake-1',
        officeId: 'office-1',
        propertyId: 'property-1',
        lifecycleStatus: 'closed',
        closedReason: 'withdrawn',
        updatedAt: new Date('2026-05-20T00:00:00.000Z'),
      })
      // 같은 Property 에 이미 non-closed 의뢰 존재
      .mockResolvedValueOnce({ id: 'intake-2' });

    await expect(
      service.updateLifecycleStatus('intake-1', 'office-1', 'open'),
    ).rejects.toThrow('활성 의뢰를 하나만');

    expect(prisma.listingIntake.update).not.toHaveBeenCalled();
  });

  it('promotes lifecycleChangedBy when the user re-affirms an auto-closed intake', async () => {
    // Deal 자동화가 closed 처리('system:deal')한 의뢰에 사용자가 다시 "종결" 을
    // 명시하면 — 값이 같아 no-op 이라도 — 주체가 user 로 승격되어
    // 이후 Deal 취소의 자동 복구 대상에서 빠져야 한다.
    const { prisma, service } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      lifecycleStatus: 'closed',
      lifecycleChangedBy: 'system:deal',
      closedReason: 'deal_completed',
      updatedAt: new Date('2026-05-20T00:00:00.000Z'),
    });
    prisma.listingIntake.update.mockResolvedValue({ id: 'intake-1' });

    await service.updateLifecycleStatus(
      'intake-1',
      'office-1',
      'closed',
      'deal_completed',
    );

    expect(prisma.listingIntake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lifecycleStatus: 'closed',
          lifecycleChangedBy: 'user',
          // 값이 안 바뀌었으므로 전이 시각은 갱신하지 않는다
          lifecycleChangedAt: undefined,
        }),
      }),
    );
  });

  it("promotes lifecycleChangedBy on an 'unavailable' confirmation of an already-closed intake", async () => {
    const { prisma, service, tx } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      lifecycleStatus: 'closed',
      lifecycleChangedBy: 'system:deal',
      closedReason: 'deal_completed',
      lastVerifiedAt: null,
      property: { propertyContacts: [] },
    });

    await service.confirm('intake-1', 'office-1', 'user-1', {
      result: 'unavailable',
      channel: 'phone',
    });

    expect(tx.listingIntake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lifecycleStatus: 'closed',
          lifecycleChangedBy: 'user',
          closedReason: 'unavailable',
          lastCheckResult: 'unavailable',
        }),
      }),
    );
  });

  it('records an external contract separately from an internal Deal completion', async () => {
    const { prisma, service, tx } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      lifecycleStatus: 'open',
      lifecycleChangedBy: 'user',
      closedReason: null,
      lastVerifiedAt: null,
      property: { propertyContacts: [] },
    });

    await service.confirm('intake-1', 'office-1', 'user-1', {
      result: 'unavailable',
      closedReason: 'external_deal_completed',
      channel: 'phone',
    });

    expect(tx.listingIntake.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lifecycleStatus: 'closed',
          lifecycleChangedBy: 'user',
          closedReason: 'external_deal_completed',
          lastCheckResult: 'unavailable',
        }),
      }),
    );
  });

  it('records a generic close reason without describing the listing as unavailable', async () => {
    const { prisma, service, tx } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      lifecycleStatus: 'open',
      lifecycleChangedBy: 'user',
      closedReason: null,
      lastVerifiedAt: null,
      property: {
        propertyContacts: [
          { contactId: 'owner-1', isPrimary: true, role: 'owner' },
        ],
      },
    });

    await service.confirm('intake-1', 'office-1', 'user-1', {
      result: 'unavailable',
      closedReason: 'other',
      channel: 'phone',
    });

    expect(tx.consultation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          content: '[매물확인] 기타 사유로 의뢰 종료',
        }),
      }),
    );
  });

  it('creates a new open intake even when the property has no contacts', async () => {
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
        aggregate: jest.fn().mockResolvedValue({
          _max: { casePriorityRank: null },
        }),
      },
      listing: {
        create: jest.fn(),
      },
      propertyContact: {
        findMany: jest.fn().mockResolvedValue([]),
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
      $executeRaw: jest.fn().mockResolvedValue(0),
    };
    prisma.$transaction.mockImplementationOnce(async (fn) => fn(tx));

    await service.create('office-1', {
      propertyId: 'property-1',
    });

    expect(tx.listingIntake.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lifecycleStatus: 'open',
          lifecycleChangedAt: expect.any(Date),
          lifecycleChangedBy: 'user',
          closedReason: null,
          lastVerifiedAt: undefined,
        }),
      }),
    );
    expect(tx.brokerageCaseParticipant.create).not.toHaveBeenCalled();
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
      lifecycleStatus: 'open',
      closedReason: null,
      lastVerifiedAt: null,
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
          lifecycleStatus: 'open',
          lifecycleChangedAt: undefined,
          lifecycleChangedBy: undefined,
          closedReason: undefined,
          lastCheckedAt: new Date('2026-05-19T00:00:00.000Z'),
          lastVerifiedAt: new Date('2026-05-19T00:00:00.000Z'),
          lastCheckResult: 'alive',
          nextConfirmAt: new Date('2026-05-26T00:00:00.000Z'),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'intake-1',
        lastVerifiedAt: '2026-05-19T00:00:00.000Z',
      }),
    );
  });

  it('rejects a stale intake confirmation when expectedUpdatedAt no longer matches', async () => {
    const { prisma, service, tx } = createService();
    prisma.listingIntake.findFirst.mockResolvedValue({
      id: 'intake-1',
      officeId: 'office-1',
      propertyId: 'property-1',
      lifecycleStatus: 'hold',
      closedReason: null,
      lastVerifiedAt: null,
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

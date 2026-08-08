import {
  BrokerageCasesService,
  hasBuyerRequirementLedgerFilters,
  type BrokerageCaseLedgerQuery,
} from './brokerage-cases.service';

const OFFICE_ID = '00000000-0000-4000-8000-000000000001';
const CASE_ID = '00000000-0000-4000-8000-000000000002';
const MATCHING_REQUIREMENT_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_REQUIREMENT_ID = '00000000-0000-4000-8000-000000000004';

function createPrismaMock(idRows: unknown[] = [], cases: unknown[] = []) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(idRows),
    brokerageCase: {
      findMany: jest.fn().mockResolvedValue(cases),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

describe('BrokerageCasesService buyer ledger filters', () => {
  it('구매고객 필터만 BuyerRequirement 필터 활성화로 판정한다', () => {
    expect(hasBuyerRequirementLedgerFilters({})).toBe(false);
    expect(hasBuyerRequirementLedgerFilters({ status: '   ' })).toBe(false);
    expect(
      hasBuyerRequirementLedgerFilters({
        search: '김고객',
        mode: 'supply',
        supplyPriceMin: 50000,
      }),
    ).toBe(false);

    const buyerFilterQueries: BrokerageCaseLedgerQuery[] = [
      { status: 'active' },
      { urgency: 'urgent' },
      { transactionType: 'sale' },
      { assignedToId: 'employee-1' },
      { preferredSiteIds: 'site-1' },
      { provinceCodes: '11' },
      { districtCodes: '11740' },
      { wardCodes: '1174010100' },
      { priceMin: 50000 },
      { priceMax: 120000 },
      { depositMin: 10000 },
      { depositMax: 30000 },
      { monthlyRentMin: 100 },
      { monthlyRentMax: 250 },
      { areaMin: 66 },
      { areaMax: 132 },
      { nextContactAfter: '2026-08-10' },
      { nextContactBefore: '2026-08-20' },
      { moveInAfter: '2026-09-01' },
      { moveInBefore: '2026-09-30' },
    ];

    for (const query of buyerFilterQueries) {
      expect(hasBuyerRequirementLedgerFilters(query)).toBe(true);
    }
  });

  it('전체 구매고객 조건을 buyer_matches에 적용하고 납품 보기에도 구매요건 존재를 요구한다', async () => {
    const prisma = createPrismaMock();
    const service = new BrokerageCasesService(prisma as never);

    await service.findLedger(OFFICE_ID, {
      mode: 'supply',
      status: 'active,matched',
      urgency: 'urgent,normal',
      transactionType: 'sale,monthly',
      assignedToId: '00000000-0000-4000-8000-000000000005',
      preferredSiteIds: '00000000-0000-4000-8000-000000000006',
      provinceCodes: '11',
      districtCodes: '11740',
      wardCodes: '1174010100',
      priceMin: 50000,
      priceMax: 120000,
      depositMin: 10000,
      depositMax: 30000,
      monthlyRentMin: 100,
      monthlyRentMax: 250,
      areaMin: 66,
      areaMax: 132,
      nextContactAfter: '2026-08-10',
      nextContactBefore: '2026-08-20',
      moveInAfter: '2026-09-01',
      moveInBefore: '2026-09-30',
    });

    const sql = prisma.$queryRaw.mock.calls[0][0] as {
      strings: readonly string[];
    };
    const queryText = sql.strings.join('?');

    expect(queryText).toContain('br."status" IN');
    expect(queryText).toContain('br."urgency" IN');
    expect(queryText).toContain('br."transaction_type" IN');
    expect(queryText).toContain('br."assigned_to_id"::text IN');
    expect(queryText).toContain('FROM "buyer_requirement_sites"');
    expect(queryText).toContain('FROM "buyer_requirement_regions"');
    expect(queryText).toContain('br."price_max"');
    expect(queryText).toContain('br."price_min"');
    expect(queryText).toContain('br."deposit_max"');
    expect(queryText).toContain('br."deposit_min"');
    expect(queryText).toContain('br."monthly_rent_max"');
    expect(queryText).toContain('br."monthly_rent_min"');
    expect(queryText).toContain('br."area_max"');
    expect(queryText).toContain('br."area_min"');
    expect(queryText).toContain('br."next_contact_date"');
    expect(queryText).toContain('br."move_in_date"');
    expect(queryText).toContain('listing_totals.intent_count > 0');
    expect(queryText).toContain('buyer_totals.intent_count > 0');
    expect(queryText).toContain(
      'eligible.buyer_requirement_ids AS "buyerRequirementIds"',
    );
  });

  it('구매고객 필터가 없으면 납품 전용 케이스를 계속 허용한다', async () => {
    const prisma = createPrismaMock();
    const service = new BrokerageCasesService(prisma as never);

    await service.findLedger(OFFICE_ID, { mode: 'supply' });

    const sql = prisma.$queryRaw.mock.calls[0][0] as {
      strings: readonly string[];
    };
    const queryText = sql.strings.join('?');
    expect(queryText).toContain('listing_totals.intent_count > 0');
    expect(queryText).not.toContain('buyer_totals.intent_count > 0');
  });

  it('필터와 일치한 구매요건 행만 남기고 같은 케이스의 납품 행은 유지한다', async () => {
    const requirement = (id: string) => ({
      id,
      priorityRank: 1,
      status: 'active',
      urgency: 'normal',
      transactionType: 'sale',
      priceMin: 50000,
      priceMax: 120000,
      depositMin: null,
      depositMax: null,
      monthlyRentMin: null,
      monthlyRentMax: null,
      areaMin: null,
      areaMax: null,
      moveInDate: null,
      lastContactDate: null,
      nextContactDate: null,
      memo: null,
      assignedTo: null,
      preferredSites: [],
      preferredRegions: [],
      _count: { matches: 0 },
    });
    const brokerageCase = {
      id: CASE_ID,
      title: null,
      memo: null,
      archivedAt: null,
      createdAt: new Date('2026-08-08T10:00:00.000Z'),
      updatedAt: new Date('2026-08-08T10:00:00.000Z'),
      participants: [],
      buyerIntakes: [
        {
          id: 'buyer-intake-1',
          casePriorityRank: 1,
          lifecycleStatus: 'open',
          receivedAt: new Date('2026-08-08T10:00:00.000Z'),
          requirements: [
            requirement(MATCHING_REQUIREMENT_ID),
            requirement(OTHER_REQUIREMENT_ID),
          ],
        },
      ],
      listingIntakes: [
        {
          id: 'listing-intake-1',
          casePriorityRank: 2,
          lifecycleStatus: 'open',
          receivedAt: new Date('2026-08-08T10:00:00.000Z'),
          memo: null,
          property: {
            id: 'property-1',
            site: {
              id: 'site-1',
              name: '테스트 단지',
              ward: {
                name: '성내동',
                district: { name: '강동구' },
              },
            },
            unit: null,
          },
          listings: [
            {
              id: 'listing-1',
              transactionType: 'sale',
              price: 90000,
              deposit: null,
              monthlyRent: null,
              isPaused: false,
              memo: null,
              _count: { matches: 0 },
            },
          ],
        },
      ],
      dependencies: [],
    };
    const prisma = createPrismaMock(
      [
        {
          id: CASE_ID,
          buyerRequirementIds: [MATCHING_REQUIREMENT_ID],
          total: 1n,
        },
      ],
      [brokerageCase],
    );
    const service = new BrokerageCasesService(prisma as never);

    const result = await service.findLedger(OFFICE_ID, { priceMin: 50000 });

    expect(result.items).toHaveLength(1);
    expect(
      result.items[0].demandIntents.map((item) => item.requirementId),
    ).toEqual([MATCHING_REQUIREMENT_ID]);
    expect(result.items[0].supplyIntents.map((item) => item.listingId)).toEqual(
      ['listing-1'],
    );
  });
});

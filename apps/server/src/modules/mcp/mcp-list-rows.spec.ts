import { toLightList, toListingRow, toPropertyRow } from './mcp-list-rows';

const site = {
  id: 'site-1',
  name: '고덕그라시움',
  type: 'apartment',
  roadAddress: null,
  jibunAddress: '서울 강동구 고덕동 693',
  lat: '37.5',
  lng: '127.1',
  totalUnits: 4932,
  ward: { code: '1174010200', name: '고덕동' },
};
const unit = {
  id: 'unit-1',
  name: '3404',
  floor: 34,
  floorLabel: null,
  supplyAreaM2: null,
  exclusiveAreaM2: null,
  roomCount: null,
  bathRoomCount: null,
  dong: { id: 'dong-1', name: '101', isPlaceholder: false, registerPk: null },
  siteUnitType: {
    id: 'type-1',
    name: '153A',
    supplyAreaM2: '153.91',
    exclusiveAreaM2: '113.22',
    roomCount: 4,
    bathRoomCount: 2,
    floorPlanUrls: null,
  },
};
const advertisement = {
  id: 'ad-1',
  officeId: 'office-1',
  channel: 'esiljang',
  status: 'active',
  advertisedPrice: null,
  advertisedDeposit: 108000,
  naverArticleNo: '9900000004',
  naverUrl: 'https://example.test/a',
  startedAt: '2026-11-10T00:00:00.000Z',
  rawJibunAddress: null,
  memo: '광고 메모',
  changeRequests: [],
};
const deal = {
  id: 'deal-1',
  stage: 'contracted',
  stageChangedAt: '2026-11-18T00:00:00.000Z',
  agreedPrice: 108000,
  agreedDeposit: null,
  agreedMonthlyRent: null,
};
const owner = {
  id: 'pc-1',
  officeId: 'office-1',
  contactId: 'contact-1',
  role: 'owner',
  isPrimary: true,
  isResident: false,
  status: 'active',
  memo: '연결 메모',
  contact: {
    id: 'contact-1',
    name: '김소유',
    email: 'owner@example.test',
    memo: '연락처 메모',
    phone: '010-1111-2222',
    phones: [{ id: 'phone-1', phone: '010-1111-2222', isPrimary: true }],
  },
};

/** 서비스(ListingIntakesService.findAll)가 주는 매물 한 줄: 의뢰 + 그 안의 거래 조건들 */
function term(overrides: Record<string, unknown> = {}) {
  return {
    id: 'term-1',
    officeId: 'office-1',
    propertyId: 'property-1',
    intakeId: 'intake-1',
    transactionType: 'jeonse',
    price: 108000,
    deposit: null,
    monthlyRent: null,
    maintenanceFee: 20,
    maintenanceFeeIncludes: ['water'],
    loanAmount: null,
    premium: null,
    moveInAvailableType: 'immediate',
    moveInAvailableFrom: null,
    moveInAvailableTo: null,
    isPaused: false,
    memo: '로열층',
    createdAt: '2026-11-15T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
    deals: [deal],
    activeAdvertisements: [advertisement],
    activeAdvertisementCount: 1,
    _count: { matches: 3 },
    ...overrides,
  };
}

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: 'intake-1',
    officeId: 'office-1',
    propertyId: 'property-1',
    lifecycleStatus: 'open',
    lifecycleChangedAt: '2026-11-10T00:00:00.000Z',
    lifecycleChangedBy: 'user',
    closedReason: null,
    receivedAt: '2026-11-10T00:00:00.000Z',
    lastCheckedAt: '2026-11-15T00:00:00.000Z',
    lastVerifiedAt: '2026-11-15T00:00:00.000Z',
    lastCheckResult: 'alive',
    isJointBrokerageRequired: false,
    jointBrokeragePartnerId: null,
    jointBrokeragePartner: null,
    occupancyStatus: 'tenant',
    nextConfirmAt: '2026-11-22T00:00:00.000Z',
    memo: '매물 메모',
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-16T00:00:00.000Z',
    property: {
      id: 'property-1',
      officeId: 'office-1',
      siteId: 'site-1',
      unitId: 'unit-1',
      site,
      unit,
    },
    listings: [
      term(),
      term({
        id: 'term-2',
        transactionType: 'sale',
        price: 161000,
        maintenanceFee: null,
        moveInAvailableType: null,
        memo: null,
        deals: [],
        activeAdvertisements: [],
        _count: { matches: 0 },
      }),
    ],
    ...overrides,
  };
}

describe('MCP 목록의 가벼운 줄', () => {
  it('매물 한 줄에 어느 집 · 상태 · 확인된 날 · 거주 상태와, 조건마다 가격 · 거래 · 광고 요약을 싣는다', () => {
    expect(toListingRow(listing())).toEqual({
      id: 'intake-1',
      propertyId: 'property-1',
      lifecycleStatus: 'open',
      receivedAt: '2026-11-10T00:00:00.000Z',
      lastVerifiedAt: '2026-11-15T00:00:00.000Z',
      nextConfirmAt: '2026-11-22T00:00:00.000Z',
      occupancyStatus: 'tenant',
      memo: '매물 메모',
      createdAt: '2026-11-10T00:00:00.000Z',
      updatedAt: '2026-11-16T00:00:00.000Z',
      place: {
        siteId: 'site-1',
        siteName: '고덕그라시움',
        siteType: 'apartment',
        address: '서울 강동구 고덕동 693',
        unitId: 'unit-1',
        dong: '101',
        unit: '3404',
        floor: 34,
        supplyAreaM2: '153.91',
        exclusiveAreaM2: '113.22',
        unitType: '153A',
        roomCount: 4,
        bathRoomCount: 2,
      },
      terms: [
        {
          id: 'term-1',
          transactionType: 'jeonse',
          price: 108000,
          maintenanceFee: 20,
          moveInAvailableType: 'immediate',
          memo: '로열층',
          updatedAt: '2026-11-16T00:00:00.000Z',
          deals: [
            {
              id: 'deal-1',
              stage: 'contracted',
              stageChangedAt: '2026-11-18T00:00:00.000Z',
              agreedPrice: 108000,
            },
          ],
          activeAdvertisements: [
            {
              id: 'ad-1',
              channel: 'esiljang',
              status: 'active',
              advertisedDeposit: 108000,
              naverArticleNo: '9900000004',
              startedAt: '2026-11-10T00:00:00.000Z',
            },
          ],
          matchCount: 3,
        },
        {
          id: 'term-2',
          transactionType: 'sale',
          price: 161000,
          updatedAt: '2026-11-16T00:00:00.000Z',
        },
      ],
    });
  });

  it('한 줄이 원래 줄보다 훨씬 작다', () => {
    const heavy = listing();
    expect(JSON.stringify(toListingRow(heavy)).length).toBeLessThan(
      JSON.stringify(heavy).length / 2,
    );
  });

  it('호실에 적은 면적이 평형의 면적보다 먼저다', () => {
    const row = toListingRow(
      listing({
        property: {
          siteId: 'site-1',
          unitId: 'unit-1',
          site,
          unit: { ...unit, supplyAreaM2: '150.00', roomCount: 3 },
        },
      }),
    );
    expect(row.place).toMatchObject({ supplyAreaM2: '150.00', exclusiveAreaM2: '113.22', roomCount: 3 });
  });

  it('동 구분이 없는 건물은 동 이름을 싣지 않고, 단독주택·토지는 호실 없이도 된다', () => {
    const placeholder = toListingRow(
      listing({
        property: {
          siteId: 'site-1',
          unitId: 'unit-1',
          site,
          unit: { ...unit, dong: { id: 'dong-0', name: '본동', isPlaceholder: true } },
        },
      }),
    );
    expect(placeholder.place).not.toHaveProperty('dong');

    const house = toListingRow(
      listing({ property: { siteId: 'site-2', unitId: null, site: { ...site, id: 'site-2' }, unit: null } }),
    );
    expect(house.place).toEqual({
      siteId: 'site-2',
      siteName: '고덕그라시움',
      siteType: 'apartment',
      address: '서울 강동구 고덕동 693',
    });
  });

  it('멈춘 조건 · 공동중개 · 종료 사유처럼 보통과 다른 것은 싣는다', () => {
    const row = toListingRow(
      listing({
        lifecycleStatus: 'closed',
        closedReason: 'withdrawn',
        isJointBrokerageRequired: true,
        occupancyStatus: null,
        listings: [term({ isPaused: true, deals: [], activeAdvertisements: [], _count: { matches: 0 } })],
      }),
    );
    expect(row).toMatchObject({
      lifecycleStatus: 'closed',
      closedReason: 'withdrawn',
      isJointBrokerageRequired: true,
    });
    expect(row).not.toHaveProperty('occupancyStatus');
    const [only] = row.terms as Array<Record<string, unknown>>;
    expect(only.isPaused).toBe(true);
    expect(only).not.toHaveProperty('deals');
    expect(only).not.toHaveProperty('activeAdvertisements');
    expect(only).not.toHaveProperty('matchCount');
  });

  it('관리매물 한 줄에 어느 집 · 소유자 · 걸린 매물 · 임대차 요약을 싣는다', () => {
    const row = toPropertyRow({
      id: 'property-1',
      officeId: 'office-1',
      siteId: 'site-1',
      unitId: 'unit-1',
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
      site,
      unit,
      propertyContacts: [{ ...owner, isResident: true, status: 'ended' }],
      listings: [
        {
          id: 'listing-1',
          intakeId: 'intake-1',
          transactionType: 'monthly',
          price: null,
          deposit: 5000,
          monthlyRent: 250,
          isPaused: false,
          memo: '메모는 get_listing으로',
          intake: { lifecycleStatus: 'hold', lastCheckResult: 'alive' },
          deals: [deal],
        },
      ],
      leases: [
        {
          id: 'lease-1',
          officeId: 'office-1',
          status: 'active',
          deposit: 50000,
          monthlyRent: null,
          contractStart: '2025-03-01T00:00:00.000Z',
          contractEnd: '2027-02-28T00:00:00.000Z',
          memo: '임대차 메모',
          tenants: [
            { id: 'lt-1', contactId: 'contact-2', contact: { id: 'contact-2', name: '박세입', phone: '010-3333-4444', memo: 'x' } },
          ],
        },
      ],
      tenants: [{ id: 'lease-1' }],
    });

    expect(row).toEqual({
      id: 'property-1',
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
      place: expect.objectContaining({ siteName: '고덕그라시움', dong: '101', unit: '3404' }),
      contacts: [
        {
          contactId: 'contact-1',
          name: '김소유',
          phone: '010-1111-2222',
          role: 'owner',
          isPrimary: true,
          isResident: true,
          status: 'ended',
        },
      ],
      listings: [
        {
          id: 'listing-1',
          intakeId: 'intake-1',
          transactionType: 'monthly',
          deposit: 5000,
          monthlyRent: 250,
          intakeLifecycleStatus: 'hold',
          deals: [{ id: 'deal-1', stage: 'contracted' }],
        },
      ],
      leases: [
        {
          id: 'lease-1',
          status: 'active',
          deposit: 50000,
          contractStart: '2025-03-01T00:00:00.000Z',
          contractEnd: '2027-02-28T00:00:00.000Z',
          tenants: [{ contactId: 'contact-2', name: '박세입', phone: '010-3333-4444' }],
        },
      ],
    });
  });

  it('서비스가 준 그대로의 값(Date 시각, Decimal 면적)을 지우지 않는다', () => {
    // Prisma Decimal처럼 toJSON으로 글이 되는 값 객체
    const decimal = (text: string) => ({ d: [1], e: 1, s: 1, toJSON: () => text });
    const at = (iso: string) => new Date(iso);
    const heavy = listing({
      createdAt: at('2026-11-15T00:00:00.000Z'),
      updatedAt: at('2026-11-16T00:00:00.000Z'),
      nextConfirmAt: at('2026-11-22T00:00:00.000Z'),
      listings: [
        term({
          moveInAvailableFrom: at('2026-12-01T00:00:00.000Z'),
          deals: [{ ...deal, stageChangedAt: at('2026-11-18T00:00:00.000Z') }],
          activeAdvertisements: [{ ...advertisement, startedAt: at('2026-11-10T00:00:00.000Z') }],
        }),
      ],
      property: {
        siteId: 'site-1',
        unitId: 'unit-1',
        site,
        unit: {
          ...unit,
          siteUnitType: { ...unit.siteUnitType, supplyAreaM2: decimal('153.91'), exclusiveAreaM2: decimal('113.22') },
        },
      },
    });

    const row = JSON.parse(JSON.stringify(toListingRow(heavy)));
    expect(row).toMatchObject({
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-16T00:00:00.000Z',
      nextConfirmAt: '2026-11-22T00:00:00.000Z',
      terms: [
        {
          moveInAvailableFrom: '2026-12-01T00:00:00.000Z',
          deals: [{ stageChangedAt: '2026-11-18T00:00:00.000Z' }],
          activeAdvertisements: [{ startedAt: '2026-11-10T00:00:00.000Z' }],
        },
      ],
      place: { supplyAreaM2: '153.91', exclusiveAreaM2: '113.22' },
    });

    const property = JSON.parse(
      JSON.stringify(
        toPropertyRow({
          id: 'property-1',
          createdAt: at('2026-11-15T00:00:00.000Z'),
          updatedAt: at('2026-11-15T00:00:00.000Z'),
          site,
          unit,
          leases: [
            { id: 'lease-1', status: 'active', contractStart: at('2025-03-01T00:00:00.000Z'), contractEnd: at('2027-02-28T00:00:00.000Z') },
          ],
        }),
      ),
    );
    expect(property).toMatchObject({
      createdAt: '2026-11-15T00:00:00.000Z',
      updatedAt: '2026-11-15T00:00:00.000Z',
      leases: [{ contractStart: '2025-03-01T00:00:00.000Z', contractEnd: '2027-02-28T00:00:00.000Z' }],
    });
  });

  it('쪽 정보는 그대로 두고 줄만 바꾸며, 목록 모양이 아니면 손대지 않는다', () => {
    const pagination = { page: 2, limit: 20, total: 41, totalPages: 3 };
    const result = toLightList({ items: [listing()], pagination }, toListingRow);
    expect(result.pagination).toBe(pagination);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).not.toHaveProperty('property');

    expect(toLightList(undefined, toListingRow)).toBeUndefined();
    const other = { id: 'x', rows: [] };
    expect(toLightList(other, toListingRow)).toBe(other);
  });
});

import { BadRequestException } from '@nestjs/common';
import { BuyerRequirementsService } from './buyer-requirements.service';

const OFFICE_ID = '00000000-0000-4000-8000-000000000001';
const SITE_ID = '00000000-0000-4000-8000-0000000000a1';
const USER_ID = '00000000-0000-4000-8000-0000000000b1';

function requirement(id: string, name: string, priorityRank = 1) {
  return {
    id,
    officeId: OFFICE_ID,
    priorityRank,
    status: 'active',
    createdAt: new Date('2026-11-01T00:00:00.000Z'),
    buyerIntake: {
      contacts: [
        { contactId: `c-${id}`, isPrimary: true, contact: { id: `c-${id}`, name, phones: [] } },
      ],
    },
  };
}

function matchRow(id: string, buyerReqId: string, stage = 'suggested') {
  return {
    id,
    buyerReqId,
    stage,
    listing: {
      id: `l-${id}`,
      property: {
        id: `p-${id}`,
        propertyContacts: [
          {
            id: 'pc',
            role: 'owner',
            contact: { id: 'owner', name: '집주인', phones: [{ phone: '01011112222', isPrimary: true }] },
          },
        ],
      },
    },
  };
}

function setup(rows: ReturnType<typeof requirement>[] = [], matches: unknown[] = []) {
  const prisma = {
    buyerRequirement: {
      findMany: jest.fn(async (args: { where?: { id?: { in?: string[] } }; select?: unknown }) => {
        const ids = args.where?.id?.in;
        return ids ? rows.filter((row) => ids.includes(row.id)) : rows;
      }),
      count: jest.fn(async () => rows.length),
    },
    match: { findMany: jest.fn(async (_args: { where?: unknown }) => matches) },
    buyerRequirementRegion: {
      findMany: jest.fn(async (_args: { where?: unknown }): Promise<unknown[]> => []),
    },
    buyerRequirementSite: {
      findMany: jest.fn(async (_args: { where?: unknown }): Promise<unknown[]> => []),
    },
  };
  const service = new BuyerRequirementsService(prisma as never);
  const whereOf = () => prisma.buyerRequirement.findMany.mock.calls[0][0].where as Record<string, any>;
  return { prisma, service, whereOf };
}

describe('BuyerRequirementsService.findAll — 희망매물 목록의 서버 조건', () => {
  it('지역은 고른 곳과 그 아래만 본다: 강동구를 고르면 고덕동 손님은 걸리고 서울 전체 손님은 걸리지 않는다', async () => {
    const { service, whereOf } = setup();
    await service.findAll(OFFICE_ID, { locations: `region:11740,site:${SITE_ID}` });

    const [region, site] = whereOf().AND[0].OR;
    expect(site).toEqual({ preferredSites: { some: { siteId: SITE_ID } } });
    expect(region.preferredRegions.some.OR).toEqual([
      // 고덕동(1174010200)을 원하는 손님: 동 코드가 구 코드로 시작한다
      { wardCode: { startsWith: '11740' } },
      // 구까지만 정한 손님: 같은 구
      { wardCode: null, districtCode: { startsWith: '11740' } },
      // 시도까지만 정한 손님(서울 전체, 코드 11)은 '11740'으로 시작하지 않아 걸리지 않는다
      { wardCode: null, districtCode: null, provinceCode: { startsWith: '11740' } },
    ]);
  });

  it('틀린 꼴의 지역 · 단지 · 담당자는 DB에 넘기지 않고 400으로 답한다', async () => {
    const { service } = setup();
    await expect(service.findAll(OFFICE_ID, { locations: 'region:abc' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.findAll(OFFICE_ID, { locations: 'site:not-a-uuid' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.findAll(OFFICE_ID, { assignedToId: 'someone' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.findAll(OFFICE_ID, { budgetMin: Number.NaN })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('예산은 월세 조건이면 보증금과, 그 밖에는 매매가 · 전세가와 견준다', async () => {
    const { service, whereOf } = setup();
    await service.findAll(OFFICE_ID, { budgetMin: 200000, budgetMax: 250000 });

    const [min, max] = whereOf().AND;
    expect(min.OR[0].AND).toEqual([
      { transactionType: 'monthly' },
      { OR: [{ depositMax: null }, { depositMax: { gte: 200000 } }] },
    ]);
    // 거래유형을 정하지 않은 조건도 매매가 쪽으로 본다
    expect(min.OR[1].AND[0]).toEqual({
      OR: [{ transactionType: null }, { transactionType: { not: 'monthly' } }],
    });
    expect(min.OR[1].AND[1]).toEqual({ OR: [{ priceMax: null }, { priceMax: { gte: 200000 } }] });
    expect(max.OR[1].AND[1]).toEqual({ OR: [{ priceMin: null }, { priceMin: { lte: 250000 } }] });
  });

  it('담당자 none은 담당자가 없는 조건이다', async () => {
    const { service, whereOf } = setup();
    await service.findAll(OFFICE_ID, { assignedToId: `${USER_ID},none` });
    expect(whereOf().AND[0]).toEqual({
      OR: [{ assignedToId: null }, { assignedToId: { in: [USER_ID] } }],
    });
  });

  it('매칭 단계: 그 단계의 매칭이 있는 손님, none은 매칭이 없는 손님', async () => {
    const { service, whereOf } = setup();
    await service.findAll(OFFICE_ID, { matchStages: 'none,buyerInterested' });
    expect(whereOf().AND[0]).toEqual({
      OR: [
        // 이름이 바뀌기 전 값으로 저장된 매칭도 찾는다
        { matches: { some: { stage: { in: ['buyerInterested', 'buyerContacted'] } } } },
        { matches: { none: {} } },
      ],
    });
  });

  it('searchMatches: 낱말마다 손님 · 희망 지역 · 연결한 매물 어딘가에 있어야 한다', async () => {
    const { service, whereOf } = setup();
    await service.findAll(OFFICE_ID, { search: '그라시움 101동', searchMatches: true });

    const words = whereOf().AND;
    expect(words).toHaveLength(2);
    const text = JSON.stringify(words[1]);
    // "101동"으로 쳐도 이름을 "101"로 적어 둔 동을 찾는다
    expect(text).toContain('"dong":{"name":{"contains":"101"');
    expect(JSON.stringify(words[0])).toContain('"site":{"name":{"contains":"그라시움"');
    expect(JSON.stringify(words[0])).toContain('"ward":{"name":{"contains":"그라시움"');
  });

  it('검색과 단계를 함께 걸면 매물은 그 단계의 매칭에서만 찾는다', async () => {
    const { service, whereOf } = setup();
    await service.findAll(OFFICE_ID, {
      search: '래미안',
      searchMatches: true,
      matchStages: 'viewing,none',
    });
    // AND[0]은 단계 조건, AND[1]이 낱말. 종료한 래미안 매칭으로는 "래미안 + 임장"에 걸리지 않는다
    const inMatches = whereOf().AND[1].OR.find((clause: Record<string, unknown>) => 'matches' in clause);
    expect(inMatches.matches.some.stage).toEqual({ in: ['viewing'] });
  });

  it('searchMatches가 없으면 검색은 예전 그대로다 (다른 화면 · MCP)', async () => {
    const { service, whereOf } = setup();
    await service.findAll(OFFICE_ID, { search: '그라시움 101동' });
    expect(whereOf().AND).toHaveLength(1);
    expect(JSON.stringify(whereOf().AND[0])).not.toContain('matches');
  });

  it('이름순: 조건에 맞는 것 전체에서 차례를 정한 뒤 그 쪽만 받는다', async () => {
    const rows = [
      requirement('r-han', '한지우'),
      requirement('r-kang-2', '강수연', 2),
      requirement('r-kim', '김민준'),
      requirement('r-kang-1', '강수연', 1),
    ];
    const { service, prisma } = setup(rows);

    const first = await service.findAll(OFFICE_ID, { sortBy: 'name', limit: 3 });
    expect(first.items.map((item) => item.id)).toEqual(['r-kang-1', 'r-kang-2', 'r-kim']);
    expect(first.pagination).toEqual({ page: 1, limit: 3, total: 4, totalPages: 2 });
    // 온전한 줄은 그 쪽의 id로만 받는다 (같은 사무소로 좁혀서)
    expect(prisma.buyerRequirement.findMany.mock.calls[1][0].where).toEqual({
      officeId: OFFICE_ID,
      id: { in: ['r-kang-1', 'r-kang-2', 'r-kim'] },
    });

    const second = await service.findAll(OFFICE_ID, { sortBy: 'name', limit: 3, page: 2 });
    expect(second.items.map((item) => item.id)).toEqual(['r-han']);
  });

  it('expand=matches: 손님마다 그 손님의 매칭을 싣는다. 청하지 않으면 싣지 않는다', async () => {
    const rows = [requirement('r1', '가'), requirement('r2', '나')];
    const { service, prisma } = setup(rows, [matchRow('m1', 'r1'), matchRow('m2', 'r1', 'buyerContacted')]);

    const plain = await service.findAll(OFFICE_ID, {});
    expect(plain.items[0]).not.toHaveProperty('matches');
    expect(prisma.match.findMany).not.toHaveBeenCalled();

    const nested = (await service.findAll(OFFICE_ID, { expand: 'matches' })) as unknown as {
      items: Array<{ id: string; matches: Array<Record<string, any>> }>;
    };
    expect(prisma.match.findMany.mock.calls[0][0].where).toEqual({
      officeId: OFFICE_ID,
      buyerReqId: { in: ['r1', 'r2'] },
    });
    expect(nested.items[0].matches.map((match) => match.id)).toEqual(['m1', 'm2']);
    expect(nested.items[1].matches).toEqual([]);
    // 단계는 지금 이름으로, 집 바로 가기와 관련인의 대표 번호를 싣는다
    expect(nested.items[0].matches[1].stage).toBe('buyerInterested');
    expect(nested.items[0].matches[0].propertyId).toBe('p-m1');
    expect(nested.items[0].matches[0].listing.property.propertyContacts[0].contact).toEqual({
      id: 'owner',
      name: '집주인',
      phone: '01011112222',
    });
  });

  it('필터 선택지: 가장 좁은 지역 단위와 담당자 없음 여부', async () => {
    const { service, prisma } = setup([]);
    prisma.buyerRequirementRegion.findMany.mockResolvedValue([
      { provinceCode: '11', districtCode: '11740', wardCode: null, province: { name: '서울특별시' }, district: { name: '강동구' }, ward: null },
      { provinceCode: null, districtCode: null, wardCode: '1174010200', province: null, district: null, ward: { name: '고덕동' } },
    ] as never);
    prisma.buyerRequirementSite.findMany.mockResolvedValue([
      { siteId: SITE_ID, site: { name: '고덕그라시움' } },
    ] as never);
    prisma.buyerRequirement.findMany.mockResolvedValue([
      { assignedTo: { id: USER_ID, name: '이담당' } },
    ] as never);
    prisma.buyerRequirement.count.mockResolvedValue(2);

    expect(await service.findFilterOptions(OFFICE_ID, 'active,hold,weird')).toEqual({
      regions: [
        { code: '11740', name: '강동구' },
        { code: '1174010200', name: '고덕동' },
      ],
      sites: [{ id: SITE_ID, name: '고덕그라시움' }],
      assignees: [{ id: USER_ID, name: '이담당' }],
      hasUnassigned: true,
    });
    // 알 수 없는 상태 값은 버린다
    expect(prisma.buyerRequirementRegion.findMany.mock.calls[0][0].where).toEqual({
      buyerRequirement: { officeId: OFFICE_ID, status: { in: ['active', 'hold'] } },
    });
  });
});

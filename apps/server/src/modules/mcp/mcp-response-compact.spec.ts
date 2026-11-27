import { compactMcpResult } from './mcp-response-compact';

const site = {
  id: 'site-1',
  officeId: null,
  name: '고덕그라시움',
  type: 'apartment',
  wardCode: '1174010200',
  roadAddress: null,
  jibunAddress: '서울시 강동구 고덕동',
  lat: '37.5',
  lng: '127.1',
  totalUnits: 4932,
  createdAt: '2026-11-01T00:00:00.000Z',
};

describe('compactMcpResult', () => {
  it('조회한 대상 자체의 칸은 빈 값까지 그대로 둔다', () => {
    expect(compactMcpResult({ ...site })).toEqual(site);
  });

  it('딸린 단지와 동은 가리키는 칸만 남긴다', () => {
    const result = compactMcpResult({
      id: 'unit-1',
      name: '3401',
      site,
      dong: { id: 'dong-1', name: '101', isPlaceholder: false, registerPk: null, siteId: 'site-1' },
    });
    expect(result).toEqual({
      id: 'unit-1',
      name: '3401',
      site: {
        id: 'site-1',
        name: '고덕그라시움',
        type: 'apartment',
        jibunAddress: '서울시 강동구 고덕동',
      },
      dong: { id: 'dong-1', name: '101', isPlaceholder: false },
    });
  });

  it('딸린 객체의 빈 칸과 officeId는 빼고, 거짓·0·빈 글과 시각은 남긴다', () => {
    const result = compactMcpResult({
      id: 'deal-1',
      memo: null,
      contact: {
        id: 'c-1',
        officeId: 'o-1',
        name: '김',
        phone: null,
        isVip: false,
        visits: 0,
        note: '',
        createdAt: 'x',
        updatedAt: 'y',
      },
    });
    expect(result).toEqual({
      id: 'deal-1',
      memo: null,
      contact: {
        id: 'c-1',
        name: '김',
        isVip: false,
        visits: 0,
        note: '',
        createdAt: 'x',
        updatedAt: 'y',
      },
    });
  });

  it('한 줄 안에서 되풀이되는 큰 객체는 두 번째부터 처음 자리를 가리킨다', () => {
    const property = { id: 'p-1', memo: '가'.repeat(400), site };
    const result = compactMcpResult({
      id: 'm-1',
      listing: { id: 'l-1', property },
      property,
    }) as { listing: { property: { memo: string } }; property: unknown };
    expect(result.listing.property.memo).toHaveLength(400);
    expect(result.property).toEqual({ id: 'p-1', sameAs: 'listing.property' });
  });

  it('목록은 줄마다 따로 줄인다 — 다른 줄을 가리키지 않는다', () => {
    const property = { id: 'p-1', memo: '가'.repeat(400) };
    const rows = compactMcpResult({
      total: 2,
      data: [
        { id: 'm-1', property },
        { id: 'm-2', property },
      ],
    }) as { total: number; data: Array<{ property: { memo?: string } }> };
    expect(rows.total).toBe(2);
    expect(rows.data[0].property.memo).toHaveLength(400);
    expect(rows.data[1].property.memo).toHaveLength(400);
  });

  it('변경 기록의 긴 글은 앞부분만 남긴다', () => {
    const result = compactMcpResult({
      id: 'e-1',
      recentActivities: [
        {
          id: 'a-1',
          createdAt: '2026-11-26T11:17:34.509Z',
          changes: { description: { before: null, after: '나'.repeat(1000) } },
        },
      ],
    }) as {
      recentActivities: Array<{
        createdAt: string;
        changes: { description: { before: null; after: string } };
      }>;
    };
    // 활동이 일어난 때는 남는다
    expect(result.recentActivities[0].createdAt).toBe('2026-11-26T11:17:34.509Z');
    const { before, after } = result.recentActivities[0].changes.description;
    expect(before).toBeNull();
    expect(after.startsWith('나'.repeat(200))).toBe(true);
    expect(after.endsWith('…(전체 1000자)')).toBe(true);
  });

  it('날짜와 Decimal 같은 값 객체는 건드리지 않는다', () => {
    const at = new Date('2026-11-26T00:00:00.000Z');
    const amount = { toJSON: () => '12.5' };
    const result = compactMcpResult({ id: 'x', nested: { id: 'n', at, amount } }) as {
      nested: { at: Date; amount: unknown };
    };
    expect(result.nested.at).toBe(at);
    expect(result.nested.amount).toBe(amount);
  });
});

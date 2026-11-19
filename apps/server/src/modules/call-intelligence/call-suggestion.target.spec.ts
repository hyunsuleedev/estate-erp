import {
  diffListingPriceWrites,
  diffSuggestionBaseValues,
  parseSuggestionBaseValues,
  proposedListingPrices,
  readSuggestionBaseValues,
  suggestionTarget,
} from './call-suggestion.target';

const LISTING = '10000000-0000-4000-8000-000000000003';
const INTAKE = '10000000-0000-4000-8000-000000000002';
const REQUIREMENT = '10000000-0000-4000-8000-000000000006';
const MATCH = '10000000-0000-4000-8000-000000000007';

describe('suggestionTarget', () => {
  it('names what each suggestion is about', () => {
    expect(
      suggestionTarget('listing_confirm', { intakeId: INTAKE, result: 'alive', priceChanges: [], memo: null }),
    ).toEqual({ targetType: 'listing_intake', targetId: INTAKE });
    expect(
      suggestionTarget('buyer_requirement_update', { buyerReqId: REQUIREMENT, changes: {}, memoAppend: 'x' }),
    ).toEqual({ targetType: 'buyer_requirement', targetId: REQUIREMENT });
    expect(suggestionTarget('match_stage', { matchId: MATCH, stage: 'viewing' })).toEqual({
      targetType: 'match',
      targetId: MATCH,
    });
    expect(suggestionTarget('match_create', { listingId: LISTING, buyerReqId: REQUIREMENT, memo: null })).toEqual({
      targetType: 'listing',
      targetId: LISTING,
    });
    // 할 일은 가장 구체적인 연결 하나, 없으면 대상 없음
    expect(
      suggestionTarget('task', {
        title: 't',
        content: null,
        dueDate: null,
        priority: 'medium',
        listingId: null,
        propertyId: null,
        buyerReqId: REQUIREMENT,
        matchId: MATCH,
      }),
    ).toEqual({ targetType: 'match', targetId: MATCH });
    expect(
      suggestionTarget('task', {
        title: 't',
        content: null,
        dueDate: null,
        priority: 'medium',
        listingId: null,
        propertyId: null,
        buyerReqId: null,
        matchId: null,
      }),
    ).toBeNull();
    expect(suggestionTarget('buyer_requirement_create', { buyerIntakeId: null, memo: 'm' })).toBeNull();
  });
});

describe('readSuggestionBaseValues', () => {
  const client = {
    listing: {
      findMany: jest.fn().mockResolvedValue([{ id: LISTING, price: 158000, deposit: null, monthlyRent: 120 }]),
    },
    buyerRequirement: {
      findFirst: jest.fn().mockResolvedValue({
        priceMin: 120000,
        priceMax: 160000,
        areaMin: { toString: () => '84.9' },
        moveInDate: new Date('2027-01-15T00:00:00.000Z'),
        urgency: 'normal',
        siteTypes: ['villa', 'apartment'],
      }),
    },
    match: { findFirst: jest.fn().mockResolvedValue({ stage: 'suggested' }) },
  };

  it('remembers the values the suggestion could overwrite', async () => {
    expect(
      await readSuggestionBaseValues(client as never, 'office-1', 'listing_confirm', {
        intakeId: INTAKE,
        result: 'price_changed',
        priceChanges: [{ listingId: LISTING, price: 155000, deposit: null }],
        memo: null,
      }),
    ).toEqual({
      kind: 'listing_prices',
      // 가격 세 칸을 모두 기억한다 (고쳐서 반영할 때 다른 칸을 채워도 견줄 수 있게)
      listings: { [LISTING]: { price: 158000, deposit: null, monthlyRent: 120 } },
    });

    expect(
      await readSuggestionBaseValues(client as never, 'office-1', 'buyer_requirement_update', {
        buyerReqId: REQUIREMENT,
        changes: { priceMin: 150000, areaMin: 99, moveInDate: '2027-02-01', siteIds: ['s'], siteTypes: ['apartment'] },
        memoAppend: null,
      }),
    ).toEqual({
      kind: 'requirement_fields',
      // 희망 단지는 더하는 것이라 빠진다. 날짜는 날짜만, 면적은 숫자, 목록은 정렬해서
      fields: { priceMin: 120000, areaMin: 84.9, moveInDate: '2027-01-15', siteTypes: ['apartment', 'villa'] },
    });

    expect(
      await readSuggestionBaseValues(client as never, 'office-1', 'match_stage', { matchId: MATCH, stage: 'viewing' }),
    ).toEqual({ kind: 'match_stage', stage: 'suggested' });
  });

  it('has nothing to remember for suggestions that only create things', async () => {
    expect(
      await readSuggestionBaseValues(client as never, 'office-1', 'match_create', {
        listingId: LISTING,
        buyerReqId: REQUIREMENT,
        memo: null,
      }),
    ).toBeNull();
    expect(
      await readSuggestionBaseValues(client as never, 'office-1', 'listing_confirm', {
        intakeId: INTAKE,
        result: 'alive',
        priceChanges: [],
        memo: null,
      }),
    ).toBeNull();
  });
});

describe('diffSuggestionBaseValues', () => {
  it('lists what changed since the suggestion was made', () => {
    expect(
      diffSuggestionBaseValues(
        { kind: 'requirement_fields', fields: { priceMax: 160000, moveInDate: null, urgency: 'normal' } },
        { kind: 'requirement_fields', fields: { priceMax: 170000, moveInDate: '2027-03-01', urgency: 'normal' } },
      ),
    ).toEqual([
      { label: '매매가 상한', was: '160,000만원', now: '170,000만원' },
      { label: '입주일', was: '없음', now: '2027-03-01' },
    ]);
    expect(
      diffSuggestionBaseValues({ kind: 'match_stage', stage: 'suggested' }, { kind: 'match_stage', stage: 'viewing' }),
    ).toEqual([{ label: '매칭 단계', was: 'suggested', now: 'viewing' }]);
  });

  it('reports nothing when values are the same or the target can no longer be read', () => {
    const base = { kind: 'listing_prices' as const, listings: { [LISTING]: { price: 158000 } } };
    expect(diffSuggestionBaseValues(base, base)).toEqual([]);
    expect(diffSuggestionBaseValues(base, null)).toEqual([]);
    expect(diffSuggestionBaseValues(base, { kind: 'listing_prices', listings: {} })).toEqual([]);
  });

  it('forgives only the exact price an earlier attempt of ours wrote', () => {
    const base = { kind: 'listing_prices' as const, listings: { [LISTING]: { price: 158000 } } };
    const now = (price: number) => ({ kind: 'listing_prices' as const, listings: { [LISTING]: { price } } });
    expect(diffSuggestionBaseValues(base, now(155000), { [LISTING]: { price: 155000 } })).toEqual([]);
    expect(diffSuggestionBaseValues(base, now(153000), { [LISTING]: { price: 155000 } })).toHaveLength(1);
    expect(
      proposedListingPrices({
        intakeId: INTAKE,
        result: 'price_changed',
        priceChanges: [{ listingId: LISTING, price: 155000, deposit: null }],
        memo: null,
      }),
    ).toEqual({ [LISTING]: { price: 155000 } });
  });

  it('checks every price it is about to write, including ones it has no record for', () => {
    const base = { kind: 'listing_prices' as const, listings: { [LISTING]: { price: 158000, deposit: null, monthlyRent: null } } };
    const current = (price: number | null, deposit: number | null = null) => ({
      [LISTING]: { price, deposit, monthlyRent: null },
    });
    // 그대로면 통과
    expect(diffListingPriceWrites(base, current(158000), { [LISTING]: { price: 155000 } })).toEqual([]);
    // 그 사이 바뀜
    expect(diffListingPriceWrites(base, current(153000), { [LISTING]: { price: 155000 } })).toEqual([
      { label: '가격', was: '158,000만원', now: '153,000만원' },
    ]);
    // 이미 그 값이면 바꿀 것이 없다
    expect(diffListingPriceWrites(base, current(155000), { [LISTING]: { price: 155000 } })).toEqual([]);
    // 원래 값을 모르는 제안 · 모르는 매물 → 지금 값을 보여 주고 확인받는다
    expect(diffListingPriceWrites(null, current(158000), { [LISTING]: { price: 155000 } })).toEqual([
      { label: '가격', was: '기록 없음', now: '158,000만원' },
    ]);
    // 앞선 시도가 쓴 값은 우리 것이다
    expect(
      diffListingPriceWrites(null, current(155000, 4000), { [LISTING]: { price: 150000 } }, { [LISTING]: { price: 155000 } }),
    ).toEqual([]);
  });

  it('merges rows for the same listing so no field escapes the check', () => {
    const writes = proposedListingPrices({
      intakeId: INTAKE,
      result: 'price_changed',
      // 같은 매물이 두 줄로 나뉘어 온 경우: 보증금 줄이 가격 줄에 가려지면 안 된다
      priceChanges: [
        { listingId: LISTING, deposit: 5000 },
        { listingId: LISTING, price: 155000 },
      ],
      memo: null,
    });
    expect(writes).toEqual({ [LISTING]: { deposit: 5000, price: 155000 } });
    const base = { kind: 'listing_prices' as const, listings: { [LISTING]: { price: 158000, deposit: 3000, monthlyRent: null } } };
    expect(
      diffListingPriceWrites(base, { [LISTING]: { price: 158000, deposit: 4000, monthlyRent: null } }, writes),
    ).toEqual([{ label: '보증금', was: '3,000만원', now: '4,000만원' }]);
  });

  it('ignores stored JSON it does not recognize', () => {
    expect(parseSuggestionBaseValues({ kind: 'listing_prices', listings: {} })).not.toBeNull();
    expect(parseSuggestionBaseValues({ kind: 'something_else' })).toBeNull();
    expect(parseSuggestionBaseValues(null)).toBeNull();
    expect(parseSuggestionBaseValues([1])).toBeNull();
  });
});

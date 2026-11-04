import type { CallContext, RefEntry } from './call-context';
import { allowedNextMatchStages, formatManwon } from './call-context';
import { buildConsultationContent, parseCallAnalysis } from './call-analysis.parser';

const ids = {
  property: '10000000-0000-4000-8000-000000000001',
  intake: '10000000-0000-4000-8000-000000000002',
  listing: '10000000-0000-4000-8000-000000000003',
  otherListing: '10000000-0000-4000-8000-000000000004',
  buyerIntake: '10000000-0000-4000-8000-000000000005',
  requirement: '10000000-0000-4000-8000-000000000006',
  match: '10000000-0000-4000-8000-000000000007',
  site: '10000000-0000-4000-8000-000000000008',
};

function context(overrides: Partial<CallContext> = {}): CallContext {
  const refs = new Map<string, RefEntry>([
    ['P1', { kind: 'property', id: ids.property, label: '래미안 101동 3501호' }],
    ['I1', { kind: 'intake', id: ids.intake, label: '의뢰', propertyId: ids.property }],
    ['L1', { kind: 'listing', id: ids.listing, label: '매매', intakeId: ids.intake, propertyId: ids.property }],
    ['L2', { kind: 'listing', id: ids.otherListing, label: '다른 매물', intakeId: 'other-intake', propertyId: 'other' }],
    ['B1', { kind: 'buyerIntake', id: ids.buyerIntake, label: '구매 의뢰' }],
    ['R1', { kind: 'requirement', id: ids.requirement, label: '매매', buyerIntakeId: ids.buyerIntake }],
    [
      'M1',
      {
        kind: 'match',
        id: ids.match,
        label: '매칭',
        listingId: ids.otherListing,
        buyerReqId: ids.requirement,
        allowedStages: ['viewingConfirmed', 'closed'],
      },
    ],
    ['S1', { kind: 'site', id: ids.site, label: '고덕그라시움' }],
  ]);
  return {
    contactId: 'contact-1',
    contactName: '홍길동',
    refs,
    openMatchKeys: new Set([`${ids.otherListing}:${ids.requirement}`]),
    text: '',
    ...overrides,
  };
}

describe('call analysis parser', () => {
  it('turns refs into ids and drops suggestions pointing outside the given list', () => {
    const parsed = parseCallAnalysis(
      {
        summary: '집주인이 가격을 15억 5천으로 내렸다.',
        keyPoints: ['15억 5천으로 인하'],
        agentSpeaker: 1,
        links: { intakeRef: 'I1', listingRef: 'L1' },
        suggestions: [
          {
            type: 'listing_confirm',
            title: '래미안 101동 3501호 가격 인하 확인',
            evidence: '15억 5천까지는 해 드릴게요',
            data: { intakeRef: 'I1', result: 'price_changed', priceChanges: [{ listingRef: 'L1', price: 155000 }] },
          },
          { type: 'task', title: '없는 매물', data: { title: '없는 매물 확인', listingRef: 'L9' } },
          {
            type: 'listing_confirm',
            title: '다른 의뢰 매물',
            data: { intakeRef: 'I1', result: 'price_changed', priceChanges: [{ listingRef: 'L2', price: 1 }] },
          },
          { type: 'unknown', title: 'x' },
        ],
      },
      context(),
      [0, 1],
    );

    expect(parsed.suggestions).toEqual([
      {
        type: 'listing_confirm',
        title: '래미안 101동 3501호 가격 인하 확인',
        evidence: '15억 5천까지는 해 드릴게요',
        payload: {
          intakeId: ids.intake,
          result: 'price_changed',
          priceChanges: [{ listingId: ids.listing, price: 155000 }],
          memo: null,
        },
      },
    ]);
    expect(parsed.dropped.map((item) => item.reason)).toEqual([
      '알 수 없는 참조 L9',
      '다른 의뢰의 매물 가격입니다',
      '알 수 없는 제안 종류',
    ]);
    expect(parsed.agentSpeaker).toBe(1);
    expect(parsed.links).toMatchObject({
      listingId: ids.listing,
      listingIntakeId: ids.intake,
      propertyId: ids.property,
    });
  });

  it('drops contact-only suggestions when the caller is not a saved contact', () => {
    const parsed = parseCallAnalysis(
      {
        summary: '모르는 번호의 매물 문의',
        suggestions: [
          { type: 'buyer_requirement_create', title: '요청 추가', data: { transactionType: 'sale', priceMax: 120000 } },
          { type: 'task', title: '다시 전화', data: { title: '내일 다시 전화', dueDate: '2026-11-03' } },
        ],
      },
      context({ contactId: null, contactName: null }),
      [0, 1],
    );
    expect(parsed.suggestions.map((item) => item.type)).toEqual(['task']);
    expect(parsed.dropped).toEqual([{ type: 'buyer_requirement_create', reason: '연락처가 필요한 제안' }]);
  });

  it('skips matches that already exist and stages the match cannot move to', () => {
    const parsed = parseCallAnalysis(
      {
        summary: '손님이 그라시움 매물 임장을 원함',
        suggestions: [
          { type: 'match_create', title: '이미 있는 매칭', data: { requirementRef: 'R1', listingRef: 'L2' } },
          { type: 'match_create', title: '새 매칭', data: { requirementRef: 'R1', listingRef: 'L1' } },
          { type: 'match_stage', title: '협상으로 건너뜀', data: { matchRef: 'M1', stage: 'negotiating' } },
          { type: 'match_stage', title: '임장 가능 확인', data: { matchRef: 'M1', stage: 'viewingConfirmed' } },
        ],
      },
      context(),
      [0, 1],
    );
    expect(parsed.suggestions.map((item) => item.title)).toEqual(['새 매칭', '임장 가능 확인']);
    expect(parsed.dropped.map((item) => item.reason)).toEqual([
      '이미 진행 중인 매칭입니다',
      '지금 단계에서 갈 수 없는 매칭 단계입니다',
    ]);
  });

  it('converts 평 to m² and site refs to ids for requirement changes', () => {
    const parsed = parseCallAnalysis(
      {
        summary: '예산을 13억으로 올리고 그라시움도 보겠다고 함',
        links: { requirementRef: 'R1' },
        suggestions: [
          {
            type: 'buyer_requirement_update',
            title: '예산 13억으로 상향',
            data: { requirementRef: 'R1', priceMax: 130000, areaMinPyeong: 30, siteRefs: ['S1'], moveInDate: '2027-03' },
          },
        ],
      },
      context(),
      [0],
    );
    expect(parsed.suggestions[0].payload).toEqual({
      buyerReqId: ids.requirement,
      changes: { priceMax: 130000, areaMin: 99.17, siteIds: [ids.site], moveInDate: '2027-03-01' },
      memoAppend: null,
    });
    // 상담의 고객 요청 연결은 소속 구매 의뢰와 함께 넣는다
    expect(parsed.links).toMatchObject({ buyerReqId: ids.requirement, buyerIntakeId: ids.buyerIntake });
  });

  it('fails without a summary and ignores an unknown agent speaker', () => {
    expect(() => parseCallAnalysis({ suggestions: [] }, context(), [0])).toThrow('분석 결과에 요약이 없습니다');
    expect(parseCallAnalysis({ summary: '요약', agentSpeaker: 5 }, context(), [0, 1]).agentSpeaker).toBeNull();
  });

  it('formats consultation content and helpers', () => {
    expect(buildConsultationContent({ summary: '요약', keyPoints: ['가', '나'] })).toBe('요약\n· 가\n· 나');
    expect(formatManwon(158000)).toBe('15억 8,000만');
    expect(formatManwon(30000)).toBe('3억');
    expect(formatManwon(150)).toBe('150만');
    expect(allowedNextMatchStages('buyerInterested')).toEqual(['viewingConfirmed', 'closed']);
    expect(allowedNextMatchStages('negotiating')).toEqual(['closed']);
    expect(allowedNextMatchStages('dealCreated')).toEqual([]);
  });
});

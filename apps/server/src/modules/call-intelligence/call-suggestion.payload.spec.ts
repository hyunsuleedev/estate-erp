import { parseCallRecordingFileName } from '@estate-erp/shared';
import {
  normalizeDateOrDateTime,
  parseManwon,
  validateSuggestionPayload,
} from './call-suggestion.payload';

const ID = '11111111-1111-4111-8111-111111111111';
const ID2 = '22222222-2222-4222-8222-222222222222';

describe('call suggestion payload', () => {
  it('reads 만원 amounts from numbers and Korean money words', () => {
    expect(parseManwon(158000)).toBe(158000);
    expect(parseManwon('158,000')).toBe(158000);
    expect(parseManwon('15억 8천')).toBe(158000);
    expect(parseManwon('15억8,000만')).toBe(158000);
    expect(parseManwon('3억 5000')).toBe(35000);
    expect(parseManwon('150만')).toBe(150);
    expect(parseManwon('1억2천만')).toBe(12000);
    expect(parseManwon('삼억')).toBeNull();
    expect(parseManwon('만')).toBeNull();
    expect(parseManwon(-1)).toBeNull();
  });

  it('treats local times as Korean time and keeps date-only values', () => {
    expect(normalizeDateOrDateTime('2026-11-03T15:00', '시작')).toEqual({
      value: '2026-11-03T15:00:00+09:00',
      dateOnly: false,
    });
    expect(normalizeDateOrDateTime('2026-11-03', '시작')).toEqual({ value: '2026-11-03', dateOnly: true });
    // 이미 정리된 값이나 UTC 값도 같은 한국 시간 표기가 된다 (다시 검증해도 그대로)
    expect(normalizeDateOrDateTime('2026-11-03T15:00:00+09:00', '시작')?.value).toBe('2026-11-03T15:00:00+09:00');
    expect(normalizeDateOrDateTime('2026-11-03T06:00:00.000Z', '시작')?.value).toBe('2026-11-03T15:00:00+09:00');
    expect(validateSuggestionPayload('task', { title: 'x', dueDate: '2026-02-30' })).toEqual({
      ok: false,
      error: '마감일 날짜가 올바르지 않습니다',
    });
  });

  it('fills task defaults and rejects malformed ids', () => {
    expect(validateSuggestionPayload('task', { title: '  김OO님께 다시 전화  ' })).toEqual({
      ok: true,
      payload: {
        title: '김OO님께 다시 전화',
        content: null,
        dueDate: null,
        priority: 'medium',
        listingId: null,
        propertyId: null,
        buyerReqId: null,
        matchId: null,
      },
    });
    expect(validateSuggestionPayload('task', { title: 'x', listingId: 'L1' })).toEqual({
      ok: false,
      error: '매물 id가 올바르지 않습니다',
    });
  });

  it('makes a date-only calendar event all-day and checks the end time', () => {
    const allDay = validateSuggestionPayload('calendar_event', { title: '계약', start: '2026-11-05', end: '2026-11-05T18:00' });
    expect(allDay).toMatchObject({ ok: true, payload: { allDay: true, start: '2026-11-05', end: null } });

    expect(
      validateSuggestionPayload('calendar_event', {
        title: '임장',
        start: '2026-11-05T15:00',
        end: '2026-11-05T14:00',
      }),
    ).toEqual({ ok: false, error: '일정 종료 시각이 올바르지 않습니다' });
  });

  it('requires a real change for requirement updates and rejects inverted ranges', () => {
    expect(validateSuggestionPayload('buyer_requirement_update', { buyerReqId: ID, changes: {} })).toEqual({
      ok: false,
      error: '바뀐 조건이 없습니다',
    });
    expect(
      validateSuggestionPayload('buyer_requirement_update', {
        buyerReqId: ID,
        changes: { priceMin: 130000, priceMax: 120000 },
      }),
    ).toEqual({ ok: false, error: '매매가 최소값이 최대값보다 큽니다' });
    expect(
      validateSuggestionPayload('buyer_requirement_update', {
        buyerReqId: ID,
        changes: { priceMax: '13억', siteIds: [ID2, ID2] },
      }),
    ).toEqual({
      ok: true,
      payload: { buyerReqId: ID, changes: { priceMax: 130000, siteIds: [ID2] }, memoAppend: null },
    });
  });

  it('keeps price changes only for price_changed confirmations', () => {
    expect(
      validateSuggestionPayload('listing_confirm', { intakeId: ID, result: 'price_changed', priceChanges: [] }),
    ).toEqual({ ok: false, error: '가격 변경 확인에는 바뀐 가격이 필요합니다' });

    expect(
      validateSuggestionPayload('listing_confirm', {
        intakeId: ID,
        result: 'alive',
        priceChanges: [{ listingId: ID2, price: 150000 }],
      }),
    ).toEqual({ ok: true, payload: { intakeId: ID, result: 'alive', priceChanges: [], memo: null } });

    expect(
      validateSuggestionPayload('listing_confirm', {
        intakeId: ID,
        result: 'price_changed',
        priceChanges: [{ listingId: ID2, price: 155000, deposit: null }],
      }),
    ).toMatchObject({ ok: true, payload: { priceChanges: [{ listingId: ID2, price: 155000 }] } });
  });

  it('never lets a suggestion move a match into a deal', () => {
    expect(validateSuggestionPayload('match_stage', { matchId: ID, stage: 'dealCreated' })).toEqual({
      ok: false,
      error: '매칭 단계 값이 올바르지 않습니다',
    });
  });
});

describe('call recording file name', () => {
  it('reads the counterpart and Korean call time from Galaxy recording names', () => {
    expect(parseCallRecordingFileName('통화 녹음 010-1234-5678_241102_143012.m4a')).toEqual({
      counterpart: '010-1234-5678',
      phoneNumber: '01012345678',
      calledAt: new Date('2024-11-02T05:30:12.000Z'),
    });
    expect(parseCallRecordingFileName('통화 녹음 홍길동_241102_143012.m4a')).toMatchObject({
      counterpart: '홍길동',
      phoneNumber: null,
    });
    expect(parseCallRecordingFileName('Call recording +82 10-1234-5678_20241102143012.m4a')).toMatchObject({
      phoneNumber: '01012345678',
      calledAt: new Date('2024-11-02T05:30:12.000Z'),
    });
    expect(parseCallRecordingFileName('meeting.m4a')).toEqual({
      counterpart: 'meeting',
      phoneNumber: null,
      calledAt: null,
    });
  });
});

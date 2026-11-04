import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  describeSuggestion,
  formatManwonText,
  formatSuggestionWhen,
  splitKstDateTime,
  toKstValue,
} from '../src/renderer/routes/_authenticated/calls/-call-suggestion-format';

const callsDir = new URL('../src/renderer/routes/_authenticated/calls/', import.meta.url);
const read = (file: string) => readFileSync(new URL(file, callsDir), 'utf8');

describe('call suggestion format', () => {
  it('shows times in Korean time regardless of the stored offset', () => {
    assert.deepEqual(splitKstDateTime('2026-11-03T15:00:00+09:00'), { date: '2026-11-03', time: '15:00' });
    assert.deepEqual(splitKstDateTime('2026-11-03T06:00:00.000Z'), { date: '2026-11-03', time: '15:00' });
    assert.deepEqual(splitKstDateTime('2026-11-03'), { date: '2026-11-03', time: null });
    // 편집 중 값(오프셋 없음)은 이미 한국 시간 — 이 PC 시간대로 다시 바꾸지 않는다
    assert.deepEqual(splitKstDateTime('2026-11-03T16:30'), { date: '2026-11-03', time: '16:30' });
    assert.equal(toKstValue('2026-11-03', '16:30'), '2026-11-03T16:30:00+09:00');
    assert.equal(toKstValue('2026-11-03', null), '2026-11-03');
    assert.equal(formatSuggestionWhen('2026-11-03T15:00:00+09:00'), '11월 3일 (화) 오후 3:00');
    assert.equal(formatSuggestionWhen('2026-11-03T09:05:00+09:00'), '11월 3일 (화) 오전 9:05');
    assert.equal(formatSuggestionWhen('2026-11-03'), '11월 3일 (화)');
  });

  it('formats 만원 amounts', () => {
    assert.equal(formatManwonText(158000), '15억 8,000만');
    assert.equal(formatManwonText(30000), '3억');
    assert.equal(formatManwonText(150), '150만');
  });

  it('describes a calendar event with its target label', () => {
    assert.deepEqual(
      describeSuggestion(
        {
          type: 'calendar_event',
          payload: {
            title: '임장',
            start: '2026-11-04T15:00:00+09:00',
            end: '2026-11-04T16:00:00+09:00',
            allDay: false,
            eventType: 'viewing',
            description: null,
            listingId: 'listing-1',
            propertyId: null,
            matchId: null,
          },
        },
        { 'listing-1': '고덕그라시움 102동 1203호 · 매매 11억 5,000만' },
      ),
      ['임장 · 11월 4일 (수) 오후 3:00 ~ 오후 4:00', '고덕그라시움 102동 1203호 · 매매 11억 5,000만'],
    );
  });

  it('describes listing confirmations and requirement changes in broker terms', () => {
    assert.deepEqual(
      describeSuggestion(
        {
          type: 'listing_confirm',
          payload: {
            intakeId: 'intake-1',
            result: 'price_changed',
            priceChanges: [{ listingId: 'listing-1', price: 155000 }],
            memo: null,
          },
        },
        { 'intake-1': '래미안 101동 3501호 의뢰', 'listing-1': '래미안 101동 3501호 · 매매 15억 8,000만' },
      ),
      ['래미안 101동 3501호 의뢰', '가격 변경', '래미안 101동 3501호 · 매매 15억 8,000만 → 15억 5,000만'],
    );

    assert.deepEqual(
      describeSuggestion(
        {
          type: 'buyer_requirement_update',
          payload: {
            buyerReqId: 'req-1',
            changes: { transactionType: 'sale', priceMax: 130000, areaMin: 99.17, siteIds: ['site-1'] },
            memoAppend: '남향 선호',
          },
        },
        { 'req-1': '매매 요청 ~12억', 'site-1': '고덕그라시움' },
      ),
      ['매매 요청 ~12억', '→ 매매 13억 이하', '→ 30평 이상', '→ 희망 단지 고덕그라시움', '메모 추가: 남향 선호'],
    );
  });
});

describe('call suggestion UI wiring', () => {
  it('asks for confirmation instead of applying AI suggestions automatically', () => {
    const cards = read('-call-suggestions.tsx');
    assert.match(cards, /받아쓰기는 숫자·이름을 틀릴 수 있어요/);
    assert.match(cards, /acceptSuggestion\(suggestion\.id, payload\)/);
    assert.match(cards, /고쳐서 반영/);
    assert.match(cards, /통화 상대 연락처를 연결하면 반영할 수 있어요/);
    assert.match(cards, /restoreSuggestion/);
  });

  it('shows suggestions, analysis state and re-analysis in the call detail', () => {
    const sheet = read('-detail-sheet.tsx');
    assert.match(sheet, /<CallSuggestionList/);
    assert.match(sheet, /api\.callRecordings\.reanalyze\(item\.id\)/);
    assert.match(sheet, /받아쓰기에 실패했습니다/);
    assert.match(sheet, /AI 통화 요약/);
  });

  it('lets brokers upload phone recordings from the calls page', () => {
    const page = read('index.tsx');
    assert.match(page, /녹음 올리기/);
    assert.match(page, /<UploadRecordingDialog/);
    const dialog = read('-upload-recording-dialog.tsx');
    assert.match(dialog, /parseCallRecordingFileName\(next\.name\)/);
    assert.match(dialog, /readAudioDuration/);
  });
});

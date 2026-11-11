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
import {
  buildPrefillContent,
  computeTalkShares,
  directionLabel,
  findQuotedLine,
  findTranscriptMatches,
  pendingReason,
  speakerDisplayNames,
} from '../src/renderer/routes/_authenticated/calls/-call-utils';

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

  it('shows suggestions, analysis state and re-analysis in the call analysis panel', () => {
    const panel = read('-call-analysis-panel.tsx');
    assert.match(panel, /<CallSuggestionList/);
    assert.match(panel, /api\.callRecordings\.reanalyze\(recordingId\)/);
    assert.match(panel, /받아쓰기에 실패했습니다/);
    assert.match(panel, /AI 통화 요약/);
    // 통화 상세는 머리글·연락처 연결만 두고 같은 본문을 쓴다
    assert.match(read('-detail-sheet.tsx'), /<CallAnalysisPanel recordingId=\{item\.id\} initial=\{item\} \/>/);
  });

  it('lets brokers upload phone or visit recordings from the consultation analysis page', () => {
    const page = read('../consultations/index.tsx');
    assert.match(page, /녹음 올리기/);
    assert.match(page, /<UploadRecordingDialog/);
    // 올린 녹음은 바로 연다
    assert.match(page, /onUploaded=\{\(recording\) => selectCall\(recording\.id\)\}/);
    const dialog = read('-upload-recording-dialog.tsx');
    assert.match(dialog, /parseCallRecordingFileName\(next\.name\)/);
    assert.match(dialog, /readAudioDuration/);
    // 방문 상담 녹음은 type=visit으로 올려 방문 상담으로 남긴다
    assert.match(dialog, /type: kind,/);
    assert.match(dialog, /방문 상담/);
  });

  it('keeps calls inside 상담분석: one consultation list plus recordings waiting to become consultations', () => {
    const page = read('../consultations/index.tsx');
    assert.match(page, /title="상담분석"/);
    assert.doesNotMatch(page, /TabsTrigger|CallLedger/);
    assert.match(page, /<PendingRecordingsStrip onOpen=\{selectCall\} \/>/);
    // 녹음이 있는 상담·연결 대기 녹음은 넓은 시트(브리프 | 녹음·대화)로 연다
    assert.match(page, /className=\{selectedConsultation\?\.callRecordingId \? WIDE_SHEET : NARROW_SHEET\}/);
    assert.match(page, /<CallDetailSheet key=\{selectedCall\.id\} item=\{selectedCall\} \/>/);
    const strip = read('-pending-recordings.tsx');
    assert.match(strip, /api\.callRecordings\.list\(\{ unlinked: true, page: pageParam, limit: PAGE_SIZE \}\)/);
    // 통화 목록 화면이 없으니 오래된 대기 녹음도 끝까지 넘겨 볼 수 있어야 한다
    assert.match(strip, /useInfiniteQuery/);
    assert.match(strip, /query\.fetchNextPage\(\)/);
    // 불러오기 실패를 '대기 없음'과 구분한다
    assert.match(strip, /query\.isError && items\.length === 0/);
    assert.match(strip, /연결 대기 녹음을 불러오지 못했습니다/);
    assert.match(strip, /queryKey: \['consultations'\]/);
    // 예전 통화 주소는 상담분석으로 보낸다
    assert.match(read('index.tsx'), /redirect\(\{ to: '\/consultations' \}\)/);
    const detail = read('../consultations/-consultation-detail-sheet.tsx');
    assert.match(detail, /useState<DetailTab>\(recordingId \? 'analysis' : 'consultation'\)/);
    assert.match(detail, /<CallAnalysisPanel recordingId=\{recordingId\} showConsultations=\{false\} \/>/);
    assert.doesNotMatch(detail, /to="\/calls"/);
    const nav = readFileSync(new URL('../src/renderer/components/layout/nav-config.ts', import.meta.url), 'utf8');
    assert.match(nav, /path: "\/consultations",\n    label: "상담분석"/);
  });

  it('lays the analysis out as brief | recording and transcript, like call note apps', () => {
    const panel = read('-call-analysis-panel.tsx');
    assert.match(panel, /@container/);
    assert.match(panel, /@3xl:grid-cols-\[minmax\(0,1fr\)_minmax\(0,1fr\)\]/);
    assert.match(panel, /data-call-brief/);
    assert.match(panel, /data-call-transcript-pane/);
    assert.match(panel, /<TalkShareBar shares=\{talkShares\} \/>/);
    assert.match(panel, /nav\.jumpTo\(searchMatches\[next\], \{ play: false \}\)/);
    // 분석이 끝나면 상담 목록도 새로 불러온다
    assert.match(panel, /previousAnalysisStatus\.current === 'processing' && analysisStatus !== 'processing'/);
  });

  it('links analysis items and suggestion quotes back to the transcript', () => {
    const sheet = read('-call-analysis-panel.tsx');
    assert.match(sheet, /<EvidenceChips lines=\{point\.lines\}/);
    assert.match(sheet, /<EvidenceChips lines=\{fact\.lines\}/);
    assert.match(sheet, /원문을 듣고 확인하세요/);
    assert.match(sheet, /renderEvidenceLink=/);
    assert.match(sheet, /ref=\{nav\.audioRef\}/);
    const evidence = read('-call-evidence.tsx');
    assert.match(evidence, /audio\.currentTime = message\.startMs \/ 1000/);
  });
});

describe('finding the transcript line a suggestion quotes', () => {
  const messages = [
    { seq: 0, text: '안녕하세요, 그라시움 보러 왔어요.' },
    { seq: 1, text: '현금은 4억 2천… 아니 4억 5천이야.' },
    { seq: 2, text: '토요일 두 시에 보러 갈게요' },
  ];

  it('matches a quote inside a line, ignoring spaces and punctuation', () => {
    assert.equal(findQuotedLine(messages, '4억 5천이야'), 1);
    assert.equal(findQuotedLine(messages, '토요일 두시에 보러'), 2);
  });

  it('matches a line that sits inside a longer quote', () => {
    assert.equal(findQuotedLine(messages, '토요일 두 시에 보러 갈게요. 아이는 맡기고요'), 2);
  });

  it('returns null for missing, too short or unknown quotes', () => {
    assert.equal(findQuotedLine(messages, null), null);
    assert.equal(findQuotedLine(messages, '네'), null);
    assert.equal(findQuotedLine(messages, '계약금은 다음 주에'), null);
  });

  it('keeps the meaning of numbers when matching amounts', () => {
    const amounts = [
      { seq: 0, text: '그 집은 15억입니다.' },
      { seq: 1, text: '이 집은 1.5억입니다.' },
      { seq: 2, text: '관리비는 5,000원이에요.' },
      { seq: 3, text: '방은 3, 4개 정도요.' },
    ];
    // 소수점을 지워 15억 줄로 가면 안 된다
    assert.equal(findQuotedLine(amounts, '1.5억입니다'), 1);
    assert.equal(findQuotedLine(amounts, '15억입니다'), 0);
    // 더 긴 숫자의 일부(15억, 1.5억 안의 5억)로 맞추지 않는다
    assert.equal(findQuotedLine(amounts.slice(0, 2), '5억입니다'), null);
    // 천 단위 쉼표는 같은 숫자다
    assert.equal(findQuotedLine(amounts, '관리비는 5000원'), 2);
    // 숫자 사이의 쉼표·공백을 지워 34개로 만들지 않는다
    assert.equal(findQuotedLine(amounts, '방은 34개'), null);
  });

  it('does not guess when the quote is ambiguous or only a short line fits inside it', () => {
    const repeated = [
      { seq: 0, text: '사억 오천이요.' },
      { seq: 1, text: '네, 사억 오천이요.' },
      { seq: 2, text: '네, 알겠습니다.' },
      { seq: 3, text: '토요일 두 시 좋아요.' },
    ];
    assert.equal(findQuotedLine(repeated, '사억 오천이요'), null);
    assert.equal(findQuotedLine(repeated, '네 알겠습니다. 계약은 다음 달 초에 하기로 했어요'), null);
  });
});

describe('prefilling a consultation from a call', () => {
  it('keeps the things to verify that the analysis set aside', () => {
    const content = buildPrefillContent(
      {
        summary: '그라시움 84 매수 상담',
        keyPoints: ['84㎡ 방 3개'],
        checks: [
          { text: '단지명 확인 필요 — "그라시엄"으로 들림', lines: [3] },
          { text: '', lines: [] },
        ],
      },
      [],
    );
    assert.equal(
      content,
      '그라시움 84 매수 상담\n\n핵심 정보:\n- 84㎡ 방 3개\n\n확인 필요:\n- 단지명 확인 필요 — "그라시엄"으로 들림',
    );
  });

  it('falls back to the start of the conversation without an analysis', () => {
    const content = buildPrefillContent(null, [
      { seq: 0, speaker: 0, speakerLabel: null, text: '여보세요', startMs: 0, endMs: 0 },
    ]);
    assert.equal(content, '나: 여보세요');
  });
});

describe('transcript helpers', () => {
  const visit = [
    { seq: 0, speaker: 0, speakerLabel: '나', text: '어서 오세요', startMs: 0, endMs: 4000 },
    { seq: 1, speaker: 1, speakerLabel: '고객', text: '현금은 사억 이천이요', startMs: 4000, endMs: 7000 },
    { seq: 2, speaker: 2, speakerLabel: '고객', text: '사억 오천이지', startMs: 7000, endMs: 10000 },
  ];

  it('numbers speakers who share a label (a couple at a visit)', () => {
    assert.deepEqual([...speakerDisplayNames(visit).entries()], [
      [0, '나'],
      [1, '고객 1'],
      [2, '고객 2'],
    ]);
  });

  it('computes talk-time share and skips untimed transcripts', () => {
    assert.deepEqual(computeTalkShares(visit), [
      { speaker: 0, label: '나', percent: 40 },
      { speaker: 1, label: '고객 1', percent: 30 },
      { speaker: 2, label: '고객 2', percent: 30 },
    ]);
    assert.deepEqual(computeTalkShares(visit.map((m) => ({ ...m, startMs: 0, endMs: 0 }))), []);
  });

  it('finds lines that contain the search text', () => {
    assert.deepEqual(findTranscriptMatches(visit, '사억'), [1, 2]);
    assert.deepEqual(findTranscriptMatches(visit, '  '), []);
  });

  it('labels visit recordings and why a recording is still waiting', () => {
    assert.equal(directionLabel('visit'), '방문');
    assert.equal(directionLabel('outbound'), '발신');
    assert.equal(directionLabel('inbound'), '수신');
    assert.equal(pendingReason({ contact: null, sttStatus: 'processing', analysisStatus: 'none' }).label, '받아쓰는 중');
    assert.equal(pendingReason({ contact: null, sttStatus: 'completed', analysisStatus: 'completed' }).label, '연락처 연결 필요');
    assert.equal(pendingReason({ contact: {}, sttStatus: 'failed', analysisStatus: 'none' }).label, '받아쓰기 실패');
    assert.equal(pendingReason({ contact: {}, sttStatus: 'completed', analysisStatus: 'processing' }).label, '분석 중');
  });
});

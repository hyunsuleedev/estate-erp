import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  defaultIncludedRequirementRows,
  describeSuggestion,
  describeSuggestionEffect,
  isHeavySuggestion,
  pickRequirementFields,
  requirementFieldRows,
  suggestionGroupOf,
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

describe('call suggestion groups', () => {
  it('sorts suggestions by what they write, not into one kind of card', () => {
    assert.equal(suggestionGroupOf('task'), 'followUp');
    assert.equal(suggestionGroupOf('calendar_event'), 'followUp');
    assert.equal(suggestionGroupOf('buyer_requirement_create'), 'requirement');
    assert.equal(suggestionGroupOf('buyer_requirement_update'), 'requirement');
    assert.equal(suggestionGroupOf('match_create'), 'decision');
    assert.equal(suggestionGroupOf('match_stage'), 'decision');
    assert.equal(suggestionGroupOf('listing_confirm'), 'decision');
  });

  it('says what a decision will change, and flags the ones that close something', () => {
    const close = { type: 'match_stage' as const, payload: { matchId: 'm', stage: 'closed' as const } };
    const move = { type: 'match_stage' as const, payload: { matchId: 'm', stage: 'viewing' as const } };
    assert.match(describeSuggestionEffect(close) ?? '', /매칭을 종료합니다/);
    assert.match(describeSuggestionEffect(move) ?? '', /"임장"/);
    assert.equal(isHeavySuggestion(close), true);
    assert.equal(isHeavySuggestion(move), false);
    const gone = {
      type: 'listing_confirm' as const,
      payload: { intakeId: 'i', result: 'unavailable' as const, priceChanges: [], memo: null },
    };
    assert.match(describeSuggestionEffect(gone) ?? '', /의뢰를 종료합니다/);
    assert.equal(isHeavySuggestion(gone), true);
    assert.equal(describeSuggestionEffect({ type: 'task', payload: { title: 't' } as never }), null);
  });

  it('compares each requirement field with the saved value and only pre-checks blanks', () => {
    const fields = { priceMin: 150000, priceMax: 160000, areaMin: 99, moveInDate: '2027-01-15', urgency: 'urgent' as const };
    const current = { priceMin: 120000, priceMax: 160000, areaMin: null, areaMax: null, moveInDate: null, urgency: 'urgent' };
    const rows = requirementFieldRows(fields, {}, current, false);
    // 지금 값과 같은 줄(급한 정도)은 보이지 않는다
    assert.deepEqual(rows.map((row) => row.key), ['price', 'area', 'moveInDate']);
    const price = rows[0];
    assert.equal(price.current, '12억~16억');
    assert.equal(price.proposed, '15억~16억');
    assert.equal(price.changesExisting, true);
    assert.equal(rows[1].current, null);
    assert.equal(rows[1].changesExisting, false);
    // 빈 칸을 채우는 줄만 미리 체크한다 — 이미 있는 값을 바꾸는 줄은 사람이 고른다
    assert.deepEqual(defaultIncludedRequirementRows(rows), ['area', 'moveInDate']);
    // 뺀 줄의 값은 보내지 않는다 (최소·최대가 함께 빠진다)
    // 체크한 줄의 값만 보낸다: 뺀 줄(최소·최대 함께)도, 화면에 보이지 않은 줄(급한 정도)도 보내지 않는다
    assert.deepEqual(pickRequirementFields(fields, rows, ['area']), { areaMin: 99 });
    assert.deepEqual(pickRequirementFields(fields, rows, []), {});
    // 평으로는 같아 보여 숨긴 줄의 실제 값이 몰래 바뀌지 않는다
    const rounded = requirementFieldRows({ areaMin: 99, priceMax: 170000 }, {}, { areaMin: 100, priceMax: null }, false);
    assert.deepEqual(rounded.map((row) => row.key), ['price']);
    assert.deepEqual(pickRequirementFields({ areaMin: 99, priceMax: 170000 }, rounded, ['price']), { priceMax: 170000 });
  });

  it('keeps the transaction type when registering a new requirement', () => {
    const fields = { transactionType: 'jeonse' as const, depositMax: 60000, siteIds: ['s1'] };
    const rows = requirementFieldRows(fields, { s1: '고덕그라시움' }, null, true);
    assert.deepEqual(rows.map((row) => [row.key, row.proposed, row.locked]), [
      ['transactionType', '전세', true],
      ['deposit', '6억 이하', false],
      ['siteIds', '고덕그라시움 추가', false],
    ]);
    assert.deepEqual(defaultIncludedRequirementRows(rows), ['transactionType', 'deposit', 'siteIds']);
    assert.deepEqual(pickRequirementFields(fields, rows, []), { transactionType: 'jeonse' });
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
    // 무시 · 되돌리기도 상담 목록(상태, 작업 요청 보기)을 새로 불러온다
    assert.match(cards, /dismissSuggestion\(suggestion\.id\),[\s\S]*?onSuccess: \(\) => refreshSuggestionCounts\(\)/);
    assert.match(cards, /restoreSuggestion\(suggestion\.id\),\s*onSuccess: \(\) => refreshSuggestionCounts\(\)/);
    assert.match(cards, /SUGGESTION_COUNT_QUERY_KEYS = \[\['call-recordings'\], \['consultations'\], \['consultation'\]\]/);
    // 한 가지 카드가 아니라 쓰는 내용에 따라 세 가지로 보인다
    assert.match(cards, /<FollowUpRow suggestion=\{suggestion\}/);
    assert.match(cards, /<RequirementBlock suggestion=\{suggestion\}/);
    assert.match(cards, /<DecisionRow suggestion=\{suggestion\}/);
    // 버튼에는 "반영"이 아니라 누르면 일어나는 일을 적는다
    assert.match(cards, /\{SUGGESTION_ACTION_LABEL\[suggestion\.type\]\}/);
    // 희망조건은 지금 값을 읽어 와 견주고, 체크한 항목만 보낸다
    assert.match(cards, /api\.buyerRequirements\.findOne\(updatePayload\.buyerReqId\)/);
    assert.match(cards, /pickRequirementFields\(fields, rows, included\)/);
    // 값 고쳐서 반영도 체크한 줄에서만 시작한다
    assert.match(cards, /suggestion=\{\{ \.\.\.suggestion, payload: chosenPayload\(\) \}\}/);
    // 지금 값을 모르면 아무것도 미리 체크하지 않는다
    assert.match(cards, /picked \?\? \(currentUnknown \? \[\] : defaultIncludedRequirementRows\(rows\)\)/);
    assert.match(cards, /data-suggestion-effect/);
    // 제안한 뒤 값이 바뀌었으면 덮어쓰지 않고 차이를 보여 준 뒤, 사람이 다시 눌러야 반영한다
    assert.match(cards, /body\.code !== CALL_SUGGESTION_BASE_CHANGED/);
    assert.match(cards, /data-suggestion-base-changed/);
    assert.match(cards, /acceptSuggestion\(suggestion\.id, conflict\?\.payload, \{ force: true \}\)/);
  });

  it('shows suggestions, analysis state and re-analysis in the call analysis panel', () => {
    const panel = read('-call-analysis-panel.tsx');
    assert.match(panel, /<CallSuggestionList/);
    assert.match(panel, /api\.callRecordings\.reanalyze\(recordingId\)/);
    assert.match(panel, /받아쓰기에 실패했습니다/);
    assert.match(panel, /AI 통화 요약/);
    // 연결 대기 녹음의 옆 패널은 머리(누구와·언제·연락처)만 두고 같은 본문을 쓴다
    assert.match(read('../consultations/-recording-inspector.tsx'), /<CallAnalysisPanel recordingId=\{item\.id\} initial=\{item\} \/>/);
  });

  it('lets brokers upload phone or visit recordings from the consultation analysis page', () => {
    const page = read('../consultations/index.tsx');
    assert.match(page, /녹음 올리기/);
    assert.match(page, /<UploadRecordingDialog/);
    // 올리기 창은 바로 닫히고, 올리는 중인 녹음은 표의 줄로 보인다 (상태 "올리는 중")
    assert.match(page, /kind: 'uploading'/);
    assert.match(page, /label: '올리는 중'/);
    // 실패한 줄은 사라지지 않고 다시 올리거나 지울 수 있다
    assert.match(page, /label: '올리기 실패'/);
    assert.match(page, /retryUpload\(upload\.id, queryClient\)/);
    const store = read('-recording-upload-store.ts');
    assert.match(store, /api\.consultations\.createWithRecording\(\{/);
    // 올리는 중인 것은 다시 보내지도 지우지도 못한다 (녹음이 두 번 생기거나 올라간 줄 모르게 된다)
    assert.match(store, /if \(!upload \|\| upload\.status !== 'failed'\) return;/);
    assert.match(store, /item\.id !== id \|\| item\.status === 'uploading'/);
    // 올리는 동안에는 탭이 버려지거나 닫히지 않게 "저장 안 된 작업" 표식을 붙인다
    assert.match(store, /marker\.setAttribute\('data-native-tab-dirty', 'true'\)/);
    // 올리는 중인 탭은 닫히지도 않는다 (main의 탭 목록이 막고 알린다)
    assert.match(store, /marker\.setAttribute\('data-native-tab-transfer', 'true'\)/);
    assert.match(store, /syncUploadMarker\(get\(\)\.uploads\)/);
    // 실패해도 목록을 새로 불러온다 (응답만 못 받고 서버에는 올라갔을 수 있다)
    assert.match(store, /async \(error: unknown\) => \{[\s\S]*?invalidateQueries\(\{ queryKey: \['consultations'\] \}\)/);
    // 이미 녹음이 붙은 상담의 "붙이기 실패"는 지운다
    assert.match(page, /upload\?\.status === 'failed' && consultation\.callRecordingId\) dismissUpload\(upload\.id\)/);
    // 서버의 줄을 불러온 뒤에 "올리는 중" 줄을 지운다
    assert.ok(store.indexOf('invalidateQueries') < store.indexOf("uploads: state.uploads.filter((item) => item.id !== id) }"));
    const dialog = read('-upload-recording-dialog.tsx');
    assert.match(dialog, /parseCallRecordingFileName\(next\.name\)/);
    assert.match(dialog, /readAudioDuration/);
    // 방문 상담 녹음은 type=visit으로 올려 방문 상담으로 남긴다
    assert.match(dialog, /startUpload\(/);
    assert.match(store, /type: upload\.kind,/);
    assert.match(dialog, /방문 상담/);
  });

  it('keeps calls inside 상담분석: one consultation list plus recordings waiting to become consultations', () => {
    const page = read('../consultations/index.tsx');
    // 목록 화면에는 제목·설명을 두지 않는다. 화면 이름은 메뉴와 앱 탭이 알려 준다.
    assert.doesNotMatch(page, /PageHeader/);
    assert.doesNotMatch(page, /TabsTrigger|CallLedger/);
    // 보기 탭은 통화/방문으로 가르지 않는다 (둘 다 상담)
    const model = read('../consultations/-consultation-list-model.ts');
    assert.match(model, /\{ value: 'all', label: '전체' \}/);
    assert.doesNotMatch(model, /value: '(phone|visit|call)'/);
    // 상세는 옆 패널 하나다: 상담 줄도 연결 대기 녹음 줄도 같은 틀로 열고, 목록을 가리는 넓은 시트는 없다
    assert.match(page, /<ConsultationInspector/);
    assert.match(page, /<RecordingInspector\s+recordingId=\{callId\}/);
    assert.doesNotMatch(page, /<Sheet\b|WIDE_SHEET|CallDetailSheet|ConsultationDetailSheet/);
    const inspector = read('../consultations/-consultation-inspector.tsx');
    const recordingPanel = read('../consultations/-recording-inspector.tsx');
    assert.match(inspector, /export function ConsultationPanelShell/);
    assert.match(inspector, /<ConsultationPanelShell\s+focusKey=\{consultationId\}/);
    assert.match(recordingPanel, /<ConsultationPanelShell\s+focusKey=\{recordingId\}/);
    // 받아쓰기·업무 제안은 같은 패널의 분석 탭에서 본다
    assert.match(inspector, /<CallAnalysisPanel recordingId=\{recordingId\} showConsultations=\{false\} \/>/);
    assert.match(inspector, /data-open-transcript\s+onClick=\{\(\) => setView\('analysis'\)\}/);
    // 상담으로 전환하면 그 상담을 같은 패널에서 이어서 연다
    assert.match(page, /onConverted=\{openConvertedConsultation\}/);
    assert.match(read('-convert-dialog.tsx'), /onConverted\?\.\(consultation\)/);
    // 연결 대기 녹음은 따로 떼지 않고 같은 표의 줄로 놓는다 (사용자 결정 2026-11-17)
    assert.doesNotMatch(page, /PendingRecordingsStrip/);
    assert.match(page, /api\.callRecordings\.list\(\{ unlinked: true, page: pageParam, limit: PENDING_PAGE_SIZE \}\)/);
    assert.match(page, /mergeConsultationRows\(consultations, pendingVisible, \{/);
    // 누르면 같은 옆 패널에 녹음 상세(연락처 연결 · 상담 전환)가 열린다
    assert.match(page, /row\.kind === 'pending'\s*\? openCall\(row\.recording\.id\)\s*: openInspector\(row\.consultation\.id\)/);
    // 통화 목록 화면이 없으니 오래된 대기 녹음도 끝까지 불러온다
    assert.match(page, /hasMorePending && !isFetchingPending && !isPendingError\) void fetchMorePending\(\)/);
    assert.doesNotMatch(page, /MAX_PAGES/);
    // 불러오기 실패를 '대기 없음'과 구분한다
    assert.match(page, /연결 대기 녹음을 불러오지 못했습니다/);
    // 이어 불러오다 실패해도 화면에서 다시 시도할 수 있다
    assert.match(page, /data-pending-recordings-error/);
    assert.match(page, /onClick=\{\(\) => void retryPending\(\)\}/);
    assert.match(page, /pendingQuery\.hasNextPage \? pendingQuery\.fetchNextPage\(\) : pendingQuery\.refetch\(\)/);
    // 표에서 빠진 대기 녹음은 상담이 된 것 — 상담 목록을 새로 불러온다
    assert.match(page, /queryClient\.invalidateQueries\(\{ queryKey: \['consultations'\] \}\)/);
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

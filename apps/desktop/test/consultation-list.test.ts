import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  buildConsultationThread,
  consultationViewParams,
  formatConsultationWhen,
  formatRecordingLength,
  formatThreadGap,
  getConsultationChannel,
  getConsultationRecordingLength,
  getConsultationRecordingState,
  getConsultationRowStatus,
  getPendingRecordingStatus,
  getConsultationSummaryLine,
  filterPendingRecordings,
  hasOwnNote,
  mergeConsultationRows,
  viewShowsPendingRecordings,
  type ConsultationRecordingLike,
} from '../src/renderer/routes/_authenticated/consultations/-consultation-list-model';

const read = (name: string) =>
  readFileSync(
    new URL(`../src/renderer/routes/_authenticated/consultations/${name}`, import.meta.url),
    'utf8',
  );

function recording(patch: Partial<ConsultationRecordingLike> = {}): ConsultationRecordingLike {
  return {
    direction: 'inbound',
    durationSec: 754,
    hasFile: true,
    sttStatus: 'completed',
    analysisStatus: 'completed',
    summary: '전세 만기 전에 매도하고 싶다고 함',
    pendingSuggestionCount: 0,
    ...patch,
  };
}

describe('consultation list model', () => {
  it('maps view tabs to list filters without splitting calls from visits', () => {
    assert.deepEqual(consultationViewParams('all'), {});
    assert.deepEqual(consultationViewParams('recorded'), { recording: 'with' });
    // 작업 요청 보기: 낱말 추정이 아니라 처리하지 않은 제안이 있는 상담
    assert.deepEqual(consultationViewParams('actionRequired'), { suggestions: 'pending' });
    assert.deepEqual(consultationViewParams('pending'), {});
    assert.equal(viewShowsPendingRecordings('all'), true);
    assert.equal(viewShowsPendingRecordings('actionRequired'), true);
  });

  it('puts waiting recordings in the same table, in time order, without rows jumping as pages load', () => {
    const at = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString();
    const consultations = [
      { id: 'c3', createdAt: at(16, 14) },
      { id: 'c2', createdAt: at(15, 10) },
      { id: 'c1', createdAt: at(12, 9) },
    ];
    const recordings = [
      { id: 'r-new', calledAt: at(16, 9) },
      { id: 'r-mid', calledAt: at(14, 9) },
      { id: 'r-old', calledAt: at(1, 9) },
    ];
    const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id);

    // 상담을 다 불러왔으면 전부 섞인다
    assert.deepEqual(
      ids(mergeConsultationRows(consultations, recordings, { sortOrder: 'desc', hasMoreConsultations: false })),
      ['c3', 'call:r-new', 'c2', 'call:r-mid', 'c1', 'call:r-old'],
    );
    // 더 불러올 상담이 있으면, 아직 불러오지 않은 구간의 녹음은 그 구간이 올 때까지 미룬다
    assert.deepEqual(
      ids(mergeConsultationRows(consultations, recordings, { sortOrder: 'desc', hasMoreConsultations: true })),
      ['c3', 'call:r-new', 'c2', 'call:r-mid', 'c1'],
    );
    // 오래된 순
    assert.deepEqual(
      ids(mergeConsultationRows([...consultations].reverse(), recordings, { sortOrder: 'asc', hasMoreConsultations: true })),
      ['call:r-old', 'c1', 'call:r-mid', 'c2', 'call:r-new', 'c3'],
    );
    // 연결 대기 보기: 상담 없이 녹음만
    const only = mergeConsultationRows([], recordings, { sortOrder: 'desc', hasMoreConsultations: false });
    assert.deepEqual(ids(only), ['call:r-new', 'call:r-mid', 'call:r-old']);
    assert.equal(only[0].kind, 'pending');
  });

  it('applies the list filters to waiting recordings in every view', () => {
    const at = (day: number, hour: number) => new Date(2026, 10, day, hour).toISOString();
    const recordings = [
      { id: 'a', calledAt: at(16, 9), direction: 'inbound', phoneNumber: '01020010002', contact: { id: 'c1', name: '이서현' }, user: { id: 'u1' }, analysis: { summary: '전세 문의' } },
      { id: 'b', calledAt: at(10, 9), direction: 'visit', phoneNumber: '', contact: null, user: { id: 'u2' }, analysis: null },
      { id: 'c', calledAt: at(1, 9), direction: 'outbound', phoneNumber: '01000000081', contact: null, user: { id: 'u1' }, analysis: { summary: '잔금일 확정' } },
    ];
    const ids = (filters: Parameters<typeof filterPendingRecordings>[1]) =>
      filterPendingRecordings(recordings, filters).map((item) => item.id);

    assert.deepEqual(ids({}), ['a', 'b', 'c']);
    assert.deepEqual(ids({ contactId: 'c1' }), ['a']);
    assert.deepEqual(ids({ createdById: 'u2' }), ['b']);
    assert.deepEqual(ids({ type: 'visit' }), ['b']);
    assert.deepEqual(ids({ type: 'phone' }), ['a', 'c']);
    assert.deepEqual(ids({ type: 'online' }), []);
    assert.deepEqual(ids({ dateFrom: '2026-11-05', dateTo: '2026-11-10' }), ['b']);
    // 끝 날짜는 그날 끝까지 포함한다
    assert.deepEqual(ids({ dateTo: '2026-11-01' }), ['c']);
    assert.deepEqual(ids({ q: '잔금' }), ['c']);
    assert.deepEqual(ids({ q: '0000-0081' }), ['c']);
    assert.deepEqual(ids({ q: '이서현' }), ['a']);
    // 대기 녹음은 매물·의뢰에 연결돼 있지 않다: 연결을 요구하면 빠지고, 미연결에는 맞는다
    assert.deepEqual(ids({ quickFilter: 'property' }), []);
    assert.deepEqual(ids({ quickFilter: 'unlinked' }), ['a', 'b', 'c']);
    assert.deepEqual(ids({ hasPlaceFilter: true }), []);
  });

  it('names how the consultation happened, using the recording for call direction', () => {
    assert.deepEqual(getConsultationChannel({ type: 'visit', callRecording: null }), { kind: 'visit', label: '방문' });
    assert.equal(getConsultationChannel({ type: 'phone', callRecording: recording({ direction: 'outbound' }) }).label, '전화 발신');
    assert.equal(getConsultationChannel({ type: 'phone', callRecording: recording() }).label, '전화 수신');
    // 녹음이 없으면 방향을 모른다
    assert.equal(getConsultationChannel({ type: 'phone', callRecording: null }).label, '전화');
    // 방문 상담에 녹음이 붙어도 방문이다
    assert.equal(getConsultationChannel({ type: 'visit', callRecording: recording({ direction: 'visit' }) }).label, '방문');
  });

  it('tells progress and failure apart in the recording cell', () => {
    assert.deepEqual(getConsultationRecordingState({ callRecordingId: null, callRecording: null }), {
      tone: 'none',
      label: '',
      hint: '',
    });
    assert.equal(
      getConsultationRecordingState({ callRecordingId: 'r', callRecording: recording({ sttStatus: 'processing' }) }).label,
      '받아쓰는 중',
    );
    assert.equal(
      getConsultationRecordingState({ callRecordingId: 'r', callRecording: recording({ sttStatus: 'failed' }) }).tone,
      'failed',
    );
    assert.equal(
      getConsultationRecordingState({ callRecordingId: 'r', callRecording: recording({ analysisStatus: 'processing' }) }).label,
      '분석 중',
    );
    assert.equal(
      getConsultationRecordingState({ callRecordingId: 'r', callRecording: recording({ analysisStatus: 'failed' }) }).label,
      '분석 실패',
    );
    const ready = getConsultationRecordingState({
      callRecordingId: 'r',
      callRecording: recording({ pendingSuggestionCount: 2 }),
    });
    assert.equal(ready.tone, 'ready');
    assert.equal(ready.label, '12:34 · 제안 2');
    // 길이를 모르는 녹음(직접 올린 파일)도 빈 칸으로 두지 않는다
    assert.equal(
      getConsultationRecordingState({ callRecordingId: 'r', callRecording: recording({ durationSec: 0 }) }).label,
      '분석 완료',
    );
    // 예전 서버는 요약을 보내지 않는다 — 녹음이 있다는 것만 알린다
    assert.equal(getConsultationRecordingState({ callRecordingId: 'r' }).tone, 'unknown');
    assert.equal(formatRecordingLength(65), '1:05');
  });

  it('shows where each row is in the flow: transcribing → analysing → work requested → done', () => {
    const status = (patch: Partial<ConsultationRecordingLike>) =>
      getConsultationRowStatus({ callRecordingId: 'r', callRecording: recording(patch) });
    const pair = (value: { tone: string; label: string }) => [value.tone, value.label];

    assert.deepEqual(pair(status({ sttStatus: 'processing' })), ['busy', '받아쓰는 중']);
    assert.deepEqual(pair(status({ analysisStatus: 'processing' })), ['busy', '분석 중']);
    assert.deepEqual(pair(status({ analysisStatus: 'failed' })), ['failed', '분석 실패']);
    // 사람이 처리할 것이 있으면 "작업 요청" — 몇 건인지는 설명에 적는다 (상태 이름에 넣지 않는다)
    const requested = status({ pendingSuggestionCount: 2 });
    assert.deepEqual(pair(requested), ['todo', '작업 요청']);
    assert.match(requested.hint, /제안이 2건/);
    assert.deepEqual(pair(status({})), ['done', '완료']);
    // 분석까지 끝나야 완료다. 시작되지 않은 단계는 "대기"로 조용히 보인다
    assert.deepEqual(pair(status({ analysisStatus: 'none' })), ['quiet', '분석 대기']);
    assert.equal(status({ analysisStatus: 'none', pendingSuggestionCount: 3 }).label, '분석 대기');
    assert.deepEqual(pair(status({ sttStatus: 'unknown-state' })), ['quiet', '받아쓰기 대기']);
    // 녹음 없이 직접 적은 상담은 흐름이 없다
    assert.equal(getConsultationRowStatus({ callRecordingId: null, callRecording: null }).tone, 'none');

    // 아직 상담이 아닌 녹음도 같은 흐름 위에 놓는다
    const waiting = (patch: Partial<Parameters<typeof getPendingRecordingStatus>[0]>) =>
      getPendingRecordingStatus({
        hasContact: true,
        sttStatus: 'completed',
        analysisStatus: 'completed',
        pendingSuggestionCount: 0,
        ...patch,
      });
    assert.deepEqual(pair(waiting({ sttStatus: 'processing', hasContact: false })), ['busy', '받아쓰는 중']);
    assert.deepEqual(pair(waiting({ sttStatus: 'failed' })), ['failed', '받아쓰기 실패']);
    // 미등록 번호는 사람이 연락처를 이어 줘야 한다
    const unlinked = waiting({ hasContact: false });
    assert.deepEqual(pair(unlinked), ['todo', '작업 요청']);
    assert.match(unlinked.hint, /연락처/);
    assert.deepEqual(pair(waiting({ pendingSuggestionCount: 1 })), ['todo', '작업 요청']);
    // 상담 기록만 없는 것은 강조하지 않는다
    assert.deepEqual(pair(waiting({})), ['done', '완료']);
    assert.match(waiting({}).hint, /상담 기록은 없으며/);

    // 녹음 칸은 길이만
    assert.equal(getConsultationRecordingLength({ callRecordingId: 'r', callRecording: recording({ pendingSuggestionCount: 2 }) }), '12:34');
    assert.equal(getConsultationRecordingLength({ callRecordingId: 'r', callRecording: recording({ durationSec: 0 }) }), '있음');
    assert.equal(getConsultationRecordingLength({ callRecordingId: null, callRecording: null }), '');
  });

  it('separates AI summaries from what a person wrote, and never hides a person\'s note', () => {
    assert.deepEqual(getConsultationSummaryLine({ content: '직접 적은\n메모', callRecording: null }), {
      text: '직접 적은 메모',
      fromAi: false,
    });
    // 분석이 쓴 그대로인 자동 기록만 AI의 글로 본다
    const auto = { content: '전세 만기 전에 매도하고 싶다고 함\n핵심: 3월 만기', callRecording: recording({ contentIsAuto: true }) };
    assert.equal(hasOwnNote(auto), false);
    assert.deepEqual(getConsultationSummaryLine(auto), { text: '전세 만기 전에 매도하고 싶다고 함', fromAi: true });
    // 자동 기록에 메모를 덧붙였으면(요약으로 시작해도) 사람의 글이다 — 가리지 않는다
    const edited = {
      content: '전세 만기 전에 매도하고 싶다고 함\n(추가) 세입자와 통화 필요',
      callRecording: recording({ contentIsAuto: false }),
    };
    assert.equal(hasOwnNote(edited), true);
    assert.equal(getConsultationSummaryLine(edited).fromAi, false);
    assert.match(getConsultationSummaryLine(edited).text, /세입자와 통화 필요/);
    // 방문 메모에 녹음을 붙인 경우도 메모가 먼저다
    assert.equal(getConsultationSummaryLine({ content: '집 보러 오심. 남향 선호.', callRecording: recording() }).text, '집 보러 오심. 남향 선호.');
    // 예전 서버(값을 모름)에서는 사람의 글로 보고 그대로 보여 준다
    assert.equal(hasOwnNote({ content: '메모', callRecording: recording({ contentIsAuto: undefined }) }), true);
    assert.equal(hasOwnNote({ content: '  ', callRecording: null }), false);
  });

  it('formats when a consultation happened relative to today', () => {
    const now = new Date(2026, 10, 16, 15, 0);
    assert.equal(formatConsultationWhen(new Date(2026, 10, 16, 9, 5).toISOString(), now), '오늘 09:05');
    assert.equal(formatConsultationWhen(new Date(2026, 10, 15, 23, 50).toISOString(), now), '어제 23:50');
    assert.equal(formatConsultationWhen(new Date(2026, 10, 13, 16, 5).toISOString(), now), '11.13 (금) 16:05');
    assert.equal(formatConsultationWhen(new Date(2025, 11, 31, 10, 0).toISOString(), now), '25.12.31 (수) 10:00');
    assert.equal(formatConsultationWhen('not a date', now), '');
  });

  it('threads calls and visits of one customer in a single time order', () => {
    const items = [
      { id: 'call-1', createdAt: new Date(2026, 10, 1, 10, 0).toISOString() },
      { id: 'visit-1', createdAt: new Date(2026, 10, 4, 14, 0).toISOString() },
      { id: 'call-2', createdAt: new Date(2026, 10, 4, 18, 0).toISOString() },
    ];
    const thread = buildConsultationThread(items, 'visit-1');
    assert.deepEqual(thread.map((entry) => entry.item.id), ['call-2', 'visit-1', 'call-1']);
    assert.deepEqual(thread.map((entry) => entry.current), [false, true, false]);
    assert.deepEqual(thread.map((entry) => entry.gapLabel), [null, '같은 날', '3일 간격']);
    assert.equal(formatThreadGap(new Date(2026, 9, 1).toISOString(), new Date(2026, 9, 22).toISOString()), '3주 간격');
    assert.equal(formatThreadGap(new Date(2026, 5, 1).toISOString(), new Date(2026, 9, 1).toISOString()), '4개월 간격');
  });
});

describe('consultation analysis screen wiring', () => {
  it('opens a row in a side panel and keeps the transcript one step away', () => {
    const page = read('index.tsx');
    assert.match(page, /variant="notion"\s+propertyListTone\s+rowHeight=\{ROW_HEIGHT\}/);
    assert.match(page, /activateOnDoubleClick/);
    assert.match(page, /<RowOpenButton/);
    // 체크박스로 여러 줄을 골라 한 번에 지운다 (상담 기록만 — 녹음 줄은 건드리지 않는다)
    assert.match(page, /enableRowSelection\s+selectedRowIds=\{selectedRowIds\}/);
    assert.match(page, /selectionToolbarPlacement="bottom"/);
    // 지운 상담이 옆 패널에 열려 있었으면 닫고, 그 상담의 조회 결과도 버린다
    assert.match(page, /if \(consultationId && removedIds\.includes\(consultationId\)\) \{\s*setIsInspectorClosing\(false\);\s*selectConsultation\(null\);/);
    assert.match(page, /queryClient\.removeQueries\(\{ queryKey: \['consultation', id\] \}\)/);
    assert.match(page, /row\.kind === 'consultation' \? \[row\.consultation\] : \[\]/);
    assert.match(page, /Promise\.allSettled\(\s*consultations\.map\(\(consultation\) => api\.consultations\.remove\(consultation\.id\)\)/);
    // 등록된 고객은 관리단지 표와 같은 이름 배지로, 미등록 번호는 번호 그대로 보인다
    assert.match(page, /<ContactNameChip contactId=\{consultation\.contact\.id\} name=\{name\} \/>/);
    assert.match(page, /<ContactNameChip contactId=\{recording\.contact\.id\} name=\{name\} \/>/);
    // 표에는 "연결" 대신 "상태" 칸을 둔다 (사용자 결정 2026-11-17). 연결은 옆 패널에서 본다
    assert.match(page, /id: 'status'/);
    assert.doesNotMatch(page, /id: 'context'/);
    // 낱말로 추정하던 "후속" 칸은 없다
    assert.doesNotMatch(page, /id: 'outcome'|getConsultationOutcomeLabel/);
    assert.match(read('-consultation-inspector.tsx'), /<Section title="연결">/);
    // 받아쓰기·분석 중인 줄이 있으면 스스로 새로 고친다 (목록 밖에서 연 상담, 상담 흐름도)
    assert.match(page, /getConsultationRecordingState\(item\)\.tone === 'busy'/);
    assert.match(page, /getConsultationRecordingState\(query\.state\.data\)\.tone === 'busy' \? 8000 : false/);
    assert.match(read('-consultation-inspector.tsx'), /refetchInterval: \(query\) =>\s*query\.state\.data\?\.items\.some/);
    const inspector = read('-consultation-inspector.tsx');
    assert.match(inspector, /data-property-inspector/);
    assert.match(inspector, /data-open-transcript/);
    // 요약(AI)이 사람이 적은 글보다 먼저 온다
    assert.ok(inspector.indexOf('data-consultation-ai-summary') < inspector.indexOf('data-consultation-note'));
  });

  it('uses the same filter chips as the property list, with search beside the view tabs', () => {
    const bar = read('-consultation-filter-bar.tsx');
    // 매물관리 필터 줄과 같은 부품: 값이 걸린 필터만 파란 알약으로 뜬다
    assert.match(bar, /from '\.\.\/properties\/-components\/property-toolbar'/);
    for (const label of ['고객', '매물', '방식', '연결', '상담자', '기간']) {
      assert.match(bar, new RegExp(`<ToolbarFilterChip\\s+label="${label}"\\s+shape="soft"`));
    }
    // 상자·배지로 따로 늘어놓던 옛 필터 줄은 없다
    assert.doesNotMatch(bar, /QuickFilterButton|getConsultationFilterChips|bg-slate-50/);
    const page = read('index.tsx');
    assert.match(page, /<ToolbarPillSearch\s+value=\{filters\.q \?\? ''\}/);
    assert.match(page, /<ConsultationFilterBar\s+filters=\{filters\}\s+onFiltersChange=\{updateFilters\}\s+hasActiveFilters=/);
  });

  it('links one customer\'s calls and visits and lets a written consultation take a recording later', () => {
    const inspector = read('-consultation-inspector.tsx');
    assert.match(inspector, /api\.consultations\.findAll\(\{ contactId, limit: THREAD_LIMIT, sortOrder: 'desc' \}\)/);
    assert.match(inspector, /buildConsultationThread\(/);
    assert.match(inspector, /목록에서 이 고객만 보기/);
    assert.match(inspector, /data-attach-recording/);
    const dialog = readFileSync(
      new URL('../src/renderer/routes/_authenticated/calls/-upload-recording-dialog.tsx', import.meta.url),
      'utf8',
    );
    const store = readFileSync(
      new URL('../src/renderer/routes/_authenticated/calls/-recording-upload-store.ts', import.meta.url),
      'utf8',
    );
    assert.match(store, /api\.consultations\.attachRecording\(upload\.attachTo\.id, \{/);
    // 붙이는 녹음을 올리는 동안에는 그 상담의 옆 패널과 줄에서 진행을 본다
    assert.match(inspector, /data-attach-upload=\{attachUpload\.status\}/);
    assert.match(read('index.tsx'), /attachUploads\.has\(row\.original\.consultation\.id\)/);
    assert.match(dialog, /적어 둔 내용은 그대로 두고/);
  });
});

describe('consultation full page', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

  it('opens from the side panel like the property and deal panels', () => {
    const inspector = read('../src/renderer/routes/_authenticated/consultations/-consultation-inspector.tsx');
    const page = read('../src/renderer/routes/_authenticated/consultations/index.tsx');
    // 녹음이 없는 상담에도 확장 버튼이 있다
    assert.doesNotMatch(inspector, /showExpand=\{hasRecording\}/);
    assert.match(inspector, /onOpenTab\(consultation\.id\);\s*onClose\(false\);/);
    assert.match(page, /const route = `\/consultations\/\$\{id\}`;/);
    assert.match(page, /onOpenTab=\{openConsultationTab\}/);
  });

  it('has a route, a tab title, and reuses the wide detail as a page', () => {
    const route = read('../src/renderer/routes/_authenticated/consultations/$id.tsx');
    const detail = read('../src/renderer/routes/_authenticated/consultations/-consultation-detail-sheet.tsx');
    const meta = read('../src/common/tabs/routeMeta.ts');
    const tree = read('../src/renderer/routeTree.gen.ts');
    assert.match(route, /createFileRoute\('\/_authenticated\/consultations\/\$id'\)/);
    assert.match(route, /<ConsultationDetailSheet[\s\S]{0,80}layout="page"/);
    assert.ok(tree.includes("'/consultations/$id'"));
    assert.match(meta, /match: \/\^\\\/consultations\\\/\(\[\^\/\]\+\)\$\/,\s*meta: \(\) => \(\{ title: '상담 상세'/);
    // 시트의 제목 부품은 시트 밖에서 쓸 수 없다 — 전체 화면에서는 보통 제목으로 바꾼다
    assert.match(detail, /const Title = isPage \? 'h1' : SheetTitle;/);
  });
});

/**
 * 상담분석 목록의 계산: 보기 탭, 한 줄에 보이는 값, 한 고객의 상담 흐름.
 * 화면 부품과 떨어진 순수 함수만 둔다 (테스트가 직접 불러 쓴다).
 */

/** 목록 한 줄을 계산하는 데 필요한 만큼만 받는다 */
export interface ConsultationRowLike {
  id: string;
  type: string;
  content: string;
  createdAt: string;
  callRecordingId?: string | null;
  callRecording?: ConsultationRecordingLike | null;
}

export interface ConsultationRecordingLike {
  direction: string;
  durationSec: number;
  hasFile: boolean;
  sttStatus: string;
  analysisStatus: string;
  summary: string | null;
  pendingSuggestionCount: number;
  /** 상담 내용이 분석이 써 넣은 글 그대로인지. 서버가 알려 준다 */
  contentIsAuto?: boolean;
}

// ----------------------------------------------------------------
// 보기 탭
// ----------------------------------------------------------------

/**
 * 통화와 방문은 탭으로 가르지 않는다 (둘 다 상담이고 한 흐름에서 봐야 한다).
 * 탭은 "무엇을 하려고 보는가"로만 나눈다.
 * pending = 연결 대기 녹음만 (아직 상담 기록이 되지 못한 녹음을 몰아서 처리할 때).
 */
export type ConsultationView = 'all' | 'recorded' | 'actionRequired' | 'pending';

export const CONSULTATION_VIEWS: ReadonlyArray<{ value: ConsultationView; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'recorded', label: '녹음 있음' },
  { value: 'actionRequired', label: '작업 요청' },
  { value: 'pending', label: '연결 대기' },
];

export function consultationViewParams(view: ConsultationView): Record<string, string> {
  if (view === 'recorded') return { recording: 'with' };
  // 작업 요청: 사람이 처리할 것이 남은 상담 (아직 확인하지 않은 통화 분석 제안이 있다)
  if (view === 'actionRequired') return { suggestions: 'pending' };
  return {};
}

// ----------------------------------------------------------------
// 연결 대기 녹음을 상담과 같은 표에 놓기
// ----------------------------------------------------------------

/** 연결 대기 녹음도 표에 보이는 보기인지. 작업 요청 보기에는 그중 사람이 할 일이 있는 것만 보인다 */
export function viewShowsPendingRecordings(_view: ConsultationView): boolean {
  return true;
}

/** 목록에 걸린 조건 중 대기 녹음을 거르는 데 쓰는 것 */
export interface PendingRecordingFilters {
  q?: string | null;
  /** all | actionRequired | property | listingIntake | buyerRequirement | unlinked */
  quickFilter?: string;
  contactId?: string | null;
  hasPlaceFilter?: boolean;
  /** 상담 유형: phone | visit | online */
  type?: string | null;
  createdById?: string | null;
  /** YYYY-MM-DD */
  dateFrom?: string | null;
  dateTo?: string | null;
}

export interface PendingRecordingLike {
  id: string;
  calledAt: string;
  direction: string;
  phoneNumber: string;
  contact?: { id: string; name: string } | null;
  user?: { id: string } | null;
  analysis?: { summary?: string | null } | null;
}

/**
 * 상담 목록에 건 조건을 대기 녹음에도 똑같이 적용한다 (어느 보기에서든 조건을 무시하지 않는다).
 * 대기 녹음은 매물·의뢰·희망조건에 연결돼 있지 않으므로, 그런 연결을 요구하는 조건에는 맞지 않고
 * "미연결" 조건에는 모두 맞는다. 기간은 서버가 상담에 쓰는 것과 같은 경계로 본다.
 */
export function filterPendingRecordings<R extends PendingRecordingLike>(
  recordings: readonly R[],
  filters: PendingRecordingFilters,
): R[] {
  const quick = filters.quickFilter ?? 'all';
  // 매물·의뢰·구매요건에 연결된 상담만 / 후속 필요(상담 내용으로 판단) / 단지·동·호 조건 → 대기 녹음은 해당 없음
  if (quick !== 'all' && quick !== 'unlinked') return [];
  if (filters.hasPlaceFilter) return [];
  if (filters.type === 'online') return [];

  const q = (filters.q ?? '').trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const from = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null;
  const to = filters.dateTo ? new Date(`${filters.dateTo}T23:59:59.999`).getTime() : null;

  return recordings.filter((item) => {
    if (filters.contactId && item.contact?.id !== filters.contactId) return false;
    if (filters.createdById && item.user?.id !== filters.createdById) return false;
    if (filters.type === 'visit' && item.direction !== 'visit') return false;
    if (filters.type === 'phone' && item.direction === 'visit') return false;
    const at = new Date(item.calledAt).getTime();
    if (from !== null && !(at >= from)) return false;
    if (to !== null && !(at <= to)) return false;
    if (!q) return true;
    return (
      (item.contact?.name ?? '').toLowerCase().includes(q) ||
      (item.analysis?.summary ?? '').toLowerCase().includes(q) ||
      (digits.length >= 3 && item.phoneNumber.includes(digits))
    );
  });
}

export type ConsultationTableRow<C, R> =
  | { id: string; kind: 'consultation'; at: string; consultation: C }
  | { id: string; kind: 'pending'; at: string; recording: R };

/**
 * 상담과 연결 대기 녹음을 시간 순서 하나로 섞는다.
 *
 * 상담은 쪽 단위로 불러오므로, 아직 불러오지 않은 구간에 들어갈 녹음을 미리 끼워 넣으면
 * 다음 쪽이 올 때 그 위로 상담이 끼어들어 줄이 튄다. 그래서 상담이 더 남아 있는 동안에는
 * 지금까지 불러온 구간 안에 드는 녹음만 보이고, 나머지는 그 구간이 불려 올 때 나타난다.
 */
export function mergeConsultationRows<C extends { id: string; createdAt: string }, R extends { id: string; calledAt: string }>(
  consultations: readonly C[],
  recordings: readonly R[],
  options: { sortOrder: 'asc' | 'desc'; hasMoreConsultations: boolean },
): ConsultationTableRow<C, R>[] {
  const time = (value: string) => new Date(value).getTime();
  const direction = options.sortOrder === 'desc' ? -1 : 1;
  const last = consultations[consultations.length - 1];
  const edge = options.hasMoreConsultations && last ? time(last.createdAt) : null;
  const inLoadedRange = (at: string) =>
    edge === null || (options.sortOrder === 'desc' ? time(at) >= edge : time(at) <= edge);

  const rows: ConsultationTableRow<C, R>[] = [
    ...consultations.map((consultation) => ({
      id: consultation.id,
      kind: 'consultation' as const,
      at: consultation.createdAt,
      consultation,
    })),
    ...recordings
      .filter((recording) => inLoadedRange(recording.calledAt))
      // 상담과 녹음의 id가 겹치지 않게 앞에 표시를 붙인다
      .map((recording) => ({ id: `call:${recording.id}`, kind: 'pending' as const, at: recording.calledAt, recording })),
  ];
  // 같은 시각이면 원래 순서를 지킨다 (정렬이 안정적이다)
  return rows.sort((a, b) => (time(a.at) - time(b.at)) * direction);
}

// ----------------------------------------------------------------
// 방식 (전화 수신·발신 / 방문 / 온라인)
// ----------------------------------------------------------------

export type ConsultationChannelKind = 'inbound' | 'outbound' | 'phone' | 'visit' | 'online' | 'other';

export interface ConsultationChannel {
  kind: ConsultationChannelKind;
  label: string;
}

/** 녹음이 있으면 수신·발신까지 안다. 없으면 상담 유형만 안다. */
export function getConsultationChannel(row: Pick<ConsultationRowLike, 'type' | 'callRecording'>): ConsultationChannel {
  if (row.type === 'visit') return { kind: 'visit', label: '방문' };
  if (row.type === 'online') return { kind: 'online', label: '온라인' };
  if (row.type === 'phone') {
    const direction = row.callRecording?.direction;
    if (direction === 'outbound') return { kind: 'outbound', label: '전화 발신' };
    if (direction === 'inbound') return { kind: 'inbound', label: '전화 수신' };
    return { kind: 'phone', label: '전화' };
  }
  return { kind: 'other', label: row.type };
}

// ----------------------------------------------------------------
// 녹음 상태
// ----------------------------------------------------------------

export type ConsultationRecordingTone = 'none' | 'busy' | 'ready' | 'failed' | 'unknown';

export interface ConsultationRecordingState {
  tone: ConsultationRecordingTone;
  /** 칸에 적는 짧은 말. 녹음이 없으면 빈 글 */
  label: string;
  /** 올려 두면 보이는 설명 (왜 이 상태인지) */
  hint: string;
}

/**
 * 한 줄의 녹음 칸. 진행 중·실패는 이유를 함께 알려 준다
 * ("소리가 없다"와 "실패"를 구분하지 못하면 다시 올려야 하는지 알 수 없다).
 */
export function getConsultationRecordingState(
  row: Pick<ConsultationRowLike, 'callRecordingId' | 'callRecording'>,
): ConsultationRecordingState {
  const recording = row.callRecording;
  if (!recording) {
    // 녹음 id만 있고 요약이 없으면 예전 서버다 — 있다는 것만 알린다
    return row.callRecordingId
      ? { tone: 'unknown', label: '녹음', hint: '녹음이 붙어 있습니다. 열면 받아쓰기와 분석을 볼 수 있습니다.' }
      : { tone: 'none', label: '', hint: '' };
  }
  const duration = recording.durationSec > 0 ? formatRecordingLength(recording.durationSec) : '';
  if (recording.sttStatus === 'pending' || recording.sttStatus === 'processing') {
    return { tone: 'busy', label: '받아쓰는 중', hint: '녹음을 글로 옮기고 있습니다. 끝나면 분석이 이어집니다.' };
  }
  if (recording.sttStatus === 'failed') {
    return { tone: 'failed', label: '받아쓰기 실패', hint: '녹음을 글로 옮기지 못했습니다. 열어서 이유를 확인하세요.' };
  }
  if (recording.analysisStatus === 'processing') {
    return { tone: 'busy', label: '분석 중', hint: '받아쓰기는 끝났고 요약과 업무 제안을 만들고 있습니다.' };
  }
  if (recording.analysisStatus === 'failed') {
    return { tone: 'failed', label: '분석 실패', hint: '받아쓰기는 있지만 요약을 만들지 못했습니다. 열어서 다시 분석할 수 있습니다.' };
  }
  if (!recording.hasFile || recording.sttStatus === 'none') {
    return { tone: 'none', label: duration, hint: '통화 사실만 남아 있고 녹음 파일은 없습니다.' };
  }
  const pending = recording.pendingSuggestionCount;
  return {
    tone: 'ready',
    label: [duration, pending > 0 ? `제안 ${pending}` : ''].filter(Boolean).join(' · ') || '분석 완료',
    hint: pending > 0 ? `확인하지 않은 업무 제안이 ${pending}건 있습니다.` : '받아쓰기와 분석이 끝났습니다.',
  };
}

// ----------------------------------------------------------------
// 상태: 이 줄에 지금 무슨 일이 필요한가
// ----------------------------------------------------------------

/**
 * 상태는 한 줄이 흐름의 어디에 와 있는지를 말한다 (사용자 결정 2026-11-17):
 *   올리는 중 → 받아쓰는 중 → 분석 중 → 작업 요청 → 완료
 * 무엇을 해야 하는지(제안 몇 건, 연락처 연결)는 상태의 이름이 아니라 올려 두면 나오는 설명에 적는다.
 *
 * busy = 기다리면 된다 (올리는 중 · 받아쓰는 중 · 분석 중)
 * failed = 그 단계에서 멈췄다. 열어서 다시 해야 한다
 * todo = 작업 요청. 사람이 처리할 것이 있다
 * quiet = 다음 단계가 아직 시작되지 않았다 (받아쓰기 대기 · 분석 대기). 강조하지 않는다
 * done = 완료
 * none = 녹음 없이 직접 적은 상담 — 흐름이 없다
 */
export type ConsultationRowStatusTone = 'busy' | 'failed' | 'todo' | 'quiet' | 'done' | 'none';

export interface ConsultationRowStatus {
  tone: ConsultationRowStatusTone;
  label: string;
  hint: string;
}

const STATUS_WORK_REQUESTED = '작업 요청';
const STATUS_DONE = '완료';

/** 받아쓰기 · 분석 단계까지의 상태. 그 단계들이 끝났으면 null */
function processingStatus(recording: { sttStatus: string; analysisStatus: string }): ConsultationRowStatus | null {
  if (recording.sttStatus === 'pending' || recording.sttStatus === 'processing') {
    return { tone: 'busy', label: '받아쓰는 중', hint: '녹음을 글로 옮기고 있습니다. 끝나면 분석이 이어집니다.' };
  }
  if (recording.sttStatus === 'failed') {
    return { tone: 'failed', label: '받아쓰기 실패', hint: '녹음을 글로 옮기지 못했습니다. 열어서 이유를 확인하세요.' };
  }
  if (recording.sttStatus !== 'completed') {
    return { tone: 'quiet', label: '받아쓰기 대기', hint: '녹음은 있지만 아직 글로 옮기지 않았습니다.' };
  }
  if (recording.analysisStatus === 'processing') {
    return { tone: 'busy', label: '분석 중', hint: '받아쓰기는 끝났고 요약과 업무 제안을 만들고 있습니다.' };
  }
  if (recording.analysisStatus === 'failed') {
    return { tone: 'failed', label: '분석 실패', hint: '받아쓰기는 있지만 요약을 만들지 못했습니다. 열어서 다시 분석할 수 있습니다.' };
  }
  if (recording.analysisStatus !== 'completed') {
    return { tone: 'quiet', label: '분석 대기', hint: '받아쓰기만 있고 요약과 제안은 아직 없습니다. 열어서 분석할 수 있습니다.' };
  }
  return null;
}

/** 상담 한 줄의 상태 */
export function getConsultationRowStatus(
  row: Pick<ConsultationRowLike, 'callRecordingId' | 'callRecording'>,
): ConsultationRowStatus {
  const recording = row.callRecording;
  // 녹음이 없거나(직접 적은 상담), 통화 사실만 있거나, 예전 서버라 상태를 모른다
  if (!recording || !recording.hasFile || recording.sttStatus === 'none') {
    return { tone: 'none', label: '', hint: '' };
  }
  const processing = processingStatus(recording);
  if (processing) return processing;
  const pending = recording.pendingSuggestionCount;
  return pending > 0
    ? { tone: 'todo', label: STATUS_WORK_REQUESTED, hint: `확인할 업무 제안이 ${pending}건 있습니다. 열어서 처리하세요.` }
    : { tone: 'done', label: STATUS_DONE, hint: '받아쓰기와 분석이 끝났고 처리할 것이 없습니다.' };
}

/** 아직 상담 기록이 아닌 녹음의 상태. 같은 흐름 위에 놓는다 */
export function getPendingRecordingStatus(recording: {
  hasContact: boolean;
  sttStatus: string;
  analysisStatus: string;
  pendingSuggestionCount: number;
}): ConsultationRowStatus {
  const processing = processingStatus(recording);
  // 받아쓰는 중 · 실패는 연락처와 상관없이 그 단계가 먼저다
  if (processing && processing.tone !== 'quiet') return processing;
  // 연락처를 모르면 분석도 상담 기록도 그 사람 기준으로 만들 수 없다 — 사람이 이어 줘야 한다
  if (!recording.hasContact) {
    return {
      tone: 'todo',
      label: STATUS_WORK_REQUESTED,
      hint: '등록되지 않은 번호입니다. 열어서 연락처를 등록하거나 기존 연락처에 연결하세요.',
    };
  }
  if (processing) return processing;
  return recording.pendingSuggestionCount > 0
    ? {
        tone: 'todo',
        label: STATUS_WORK_REQUESTED,
        hint: `확인할 업무 제안이 ${recording.pendingSuggestionCount}건 있습니다. 열어서 처리하세요.`,
      }
    : { tone: 'done', label: STATUS_DONE, hint: '분석이 끝났습니다. 상담 기록은 없으며, 필요하면 열어서 상담으로 전환할 수 있습니다.' };
}

/**
 * 상태 설명은 표의 배지에 올려 두면 나오는 글이라 "열어서 …하세요"로 적혀 있다.
 * 이미 열린 옆 패널에서는 "열어서"를 빼고 보인다.
 */
export function getPanelStatusHint(hint: string): string {
  return hint.replaceAll('열어서 ', '');
}

/** 녹음 칸: 길이만 보인다 (상태는 상태 칸에 있다). 녹음이 없으면 빈 글 */
export function getConsultationRecordingLength(
  row: Pick<ConsultationRowLike, 'callRecordingId' | 'callRecording'>,
): string {
  const recording = row.callRecording;
  // 녹음 id만 있고 요약이 없으면 예전 서버다 — 있다는 것만 알린다
  if (!recording) return row.callRecordingId ? '있음' : '';
  if (recording.durationSec > 0) return formatRecordingLength(recording.durationSec);
  return recording.hasFile ? '있음' : '';
}

/** 754 → "12:34" */
export function formatRecordingLength(sec: number): string {
  const total = Math.max(0, Math.round(sec));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

// ----------------------------------------------------------------
// 내용 한 줄
// ----------------------------------------------------------------

export interface ConsultationSummaryLine {
  text: string;
  /** AI가 쓴 요약인지. 사람이 적은 글과 다르게 보여 준다 */
  fromAi: boolean;
}

function oneLine(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * 목록에 보일 한 줄. AI 요약이 있으면 그것을, 없으면 사람이 적은 내용을 쓴다.
 * 사람이 직접 적은 글이 있는 상담은 사람의 글을 먼저 보인다 (목록에서 메모가 요약에 가려지지 않게).
 */
export function getConsultationSummaryLine(
  row: Pick<ConsultationRowLike, 'content' | 'callRecording'>,
): ConsultationSummaryLine {
  const content = oneLine(row.content ?? '');
  if (content && hasOwnNote(row)) return { text: content, fromAi: false };
  const summary = row.callRecording?.summary ? oneLine(row.callRecording.summary) : '';
  if (summary) return { text: summary, fromAi: true };
  return { text: content, fromAi: Boolean(content) && row.callRecording?.contentIsAuto === true };
}

/**
 * 사람이 직접 적었거나 고친 내용인지.
 * 글의 생김새로 추측하지 않는다: 분석이 써 넣은 그대로라고 서버가 알려 준 경우에만 AI의 글로 본다.
 * (자동 기록에 메모를 덧붙이거나 요약으로 시작하는 글을 직접 적어도 사람의 글이다.)
 */
export function hasOwnNote(row: Pick<ConsultationRowLike, 'content' | 'callRecording'>): boolean {
  if (!oneLine(row.content ?? '')) return false;
  return row.callRecording?.contentIsAuto !== true;
}

// ----------------------------------------------------------------
// 일시
// ----------------------------------------------------------------

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

/** "오늘 14:20" · "어제 09:05" · "11.14 (금) 16:05" · 다른 해는 "25.11.14 (금) 16:05" */
export function formatConsultationWhen(value: string, now: Date = new Date()): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  const dayGap = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (dayGap === 0) return `오늘 ${time}`;
  if (dayGap === 1) return `어제 ${time}`;
  const day = `${date.getMonth() + 1}.${date.getDate()} (${WEEKDAYS[date.getDay()]})`;
  const year = date.getFullYear() === now.getFullYear() ? '' : `${String(date.getFullYear()).slice(2)}.`;
  return `${year}${day} ${time}`;
}

// ----------------------------------------------------------------
// 한 고객의 상담 흐름
// ----------------------------------------------------------------

export interface ConsultationThreadEntry<T> {
  item: T;
  current: boolean;
  /** 바로 앞(더 최근) 상담과의 간격. 맨 위 줄은 null */
  gapLabel: string | null;
}

/** 두 상담 사이의 간격: "같은 날" · "3일 간격" · "2주 간격" · "4개월 간격" */
export function formatThreadGap(earlier: string, later: string): string {
  const days = Math.round((startOfDay(new Date(later)) - startOfDay(new Date(earlier))) / 86_400_000);
  if (!Number.isFinite(days) || days <= 0) return '같은 날';
  if (days < 14) return `${days}일 간격`;
  if (days < 60) return `${Math.round(days / 7)}주 간격`;
  return `${Math.round(days / 30)}개월 간격`;
}

/**
 * 한 고객과 나눈 상담을 최근 것부터 놓고, 지금 보는 상담을 표시한다.
 * 통화와 방문을 가르지 않고 시간 순서 하나로 잇는다.
 */
export function buildConsultationThread<T extends { id: string; createdAt: string }>(
  items: readonly T[],
  currentId: string,
): ConsultationThreadEntry<T>[] {
  const sorted = [...items].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return sorted.map((item, index) => ({
    item,
    current: item.id === currentId,
    gapLabel: index === 0 ? null : formatThreadGap(item.createdAt, sorted[index - 1].createdAt),
  }));
}

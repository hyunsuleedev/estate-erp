import type {
  CallRecordingAnalysis,
  CallRecordingMessage,
  SttStatus,
} from '@estate-erp/api-client';

/** STT 상태 한국어 라벨 */
export const sttStatusLabel: Record<SttStatus, string> = {
  none: '녹음 없음',
  pending: '대기',
  processing: '처리 중',
  completed: '완료',
  failed: '실패',
};

/** STT 상태 뱃지 클래스 (시맨틱 토큰 기반) */
export const sttStatusClass: Record<SttStatus, string> = {
  none: 'bg-neutral-soft text-muted-foreground',
  pending: 'bg-info-soft text-info',
  processing: 'bg-warning-soft text-warning',
  completed: 'bg-success-soft text-success',
  failed: 'bg-destructive-soft text-destructive',
};

/** 통화 시간 "3:05" 표기 */
export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 부재중 휴리스틱 — 수신 && 5초 미만 (서버에 통화 결과 필드가 없어 추정).
 * 녹음 파일이 있으면 통화한 것이다 (직접 올린 녹음은 길이를 모를 수 있다).
 */
export function isMissedCall(
  direction: string,
  durationSec: number,
  fileName?: string | null,
): boolean {
  if (fileName) return false;
  return direction === 'inbound' && durationSec < 5;
}

/** 화자 라벨 — speakerLabel 우선, 없으면 speaker 0 = 나 / 그 외 = 고객 */
export function speakerLabelOf(
  speaker: number,
  speakerLabel: string | null,
): string {
  return speakerLabel ?? (speaker === 0 ? '나' : '고객');
}

/** STT 발화 구간 ms → "1:23" */
export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

/** 숫자 사이를 갈라 두는 표시. 공백·쉼표를 지워도 "3, 4개"가 "34개"가 되지 않게 한다 */
const NUMBER_GAP = '|';

/**
 * 띄어쓰기·문장부호 차이를 무시하고 비교하기 위한 정규화.
 * 숫자의 뜻은 지킨다: 소수점(1.5)은 남기고, 천 단위 쉼표(5,000)는 지우고, 그 밖에 숫자 사이를 가르던 공백·쉼표는 구분 표시로 바꾼다.
 */
function normalizeQuote(value: string) {
  return value
    .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
    .replace(/(\d)[\s,]+(?=\d)/g, `$1${NUMBER_GAP}`)
    .replace(/(?<!\d)\.|\.(?!\d)/g, '')
    .replace(/[\s,!?~…·'"“”‘’()-]/g, '');
}

const isNumberChar = (char: string | undefined) => char !== undefined && /[\d.]/.test(char);

/** 숫자로 시작·끝나는 조각이 더 긴 숫자의 일부(15억 안의 5억, 1.5억 안의 5억)로 맞춰지지 않게 경계를 확인한다 */
function includesWhole(haystack: string, needle: string) {
  const startsWithDigit = /^\d/.test(needle);
  const endsWithDigit = /\d$/.test(needle);
  for (let from = 0; ; ) {
    const index = haystack.indexOf(needle, from);
    if (index < 0) return false;
    const clashBefore = startsWithDigit && isNumberChar(haystack[index - 1]);
    const clashAfter = endsWithDigit && isNumberChar(haystack[index + needle.length]);
    if (!clashBefore && !clashAfter) return true;
    from = index + 1;
  }
}

/**
 * 제안의 근거 인용문이 들어 있는 받아쓰기 줄(seq). 확실하지 않으면 null.
 * - 인용문이 한 줄 안에 있으면 그 줄. 여러 줄에 같은 말이 있으면 어느 줄인지 몰라 null.
 * - 인용문이 여러 줄에 걸치면 인용문의 절반 이상을 차지하는 첫 줄. "네 알겠습니다" 같은 짧은 줄이 긴 인용문에 우연히 들어 맞는 것은 무시한다.
 * 잘못된 원문으로 안내하느니 링크를 달지 않는다.
 */
export function findQuotedLine(
  messages: Array<{ seq: number; text: string }>,
  quote: string | null,
): number | null {
  if (!quote) return null;
  const needle = normalizeQuote(quote);
  if (needle.length < 4) return null;
  const normalized = messages.map((message) => ({ seq: message.seq, text: normalizeQuote(message.text) }));

  const inside = normalized.filter((message) => includesWhole(message.text, needle));
  if (inside.length > 0) return inside.length === 1 ? inside[0].seq : null;

  const spanning = normalized.find(
    (message) => message.text.length * 2 >= needle.length && includesWhole(needle, message.text),
  );
  return spanning?.seq ?? null;
}

/**
 * 상담으로 전환할 때 채워 두는 본문: 요약 + 핵심 정보 + 확인할 점 + 다음 조치.
 * 확인할 점은 서버가 자동으로 남기는 상담 기록에도 들어간다 — 손으로 전환할 때도 빠뜨리지 않는다.
 * 분석이 없으면 대화 앞부분으로 대신한다.
 */
export function buildPrefillContent(
  analysis: CallRecordingAnalysis | null,
  messages: CallRecordingMessage[],
): string {
  const parts: string[] = [];

  if (analysis?.summary) parts.push(String(analysis.summary));

  const keyPoints = analysis?.keyPoints;
  if (Array.isArray(keyPoints) && keyPoints.length > 0) {
    parts.push(`핵심 정보:\n${keyPoints.map((k) => `- ${String(k)}`).join('\n')}`);
  }

  const checks = Array.isArray(analysis?.checks)
    ? analysis.checks.map((check) => check?.text).filter((text): text is string => Boolean(text))
    : [];
  if (checks.length > 0) {
    parts.push(`확인 필요:\n${checks.map((text) => `- ${text}`).join('\n')}`);
  }

  const nextActions = analysis?.nextActions;
  if (Array.isArray(nextActions) && nextActions.length > 0) {
    parts.push(`다음 조치:\n${nextActions.map((a) => `- ${String(a)}`).join('\n')}`);
  } else if (typeof nextActions === 'string' && nextActions.trim()) {
    parts.push(`다음 조치:\n- ${nextActions}`);
  }

  if (parts.length === 0 && messages.length > 0) {
    const lines = messages
      .slice(0, 12)
      .map((m) => `${speakerLabelOf(m.speaker, m.speakerLabel)}: ${m.text}`);
    if (messages.length > 12) lines.push('… (이하 생략)');
    parts.push(lines.join('\n'));
  }

  return parts.join('\n\n');
}

/**
 * 화자 이름: 저장된 라벨(나/고객)을 쓰고, 같은 이름이 여럿이면 번호를 붙인다 (방문 상담의 부부 → 고객 1, 고객 2).
 */
export function speakerDisplayNames(
  messages: Array<{ speaker: number; speakerLabel: string | null }>,
): Map<number, string> {
  const baseBySpeaker = new Map<number, string>();
  for (const message of messages) {
    if (!baseBySpeaker.has(message.speaker)) {
      baseBySpeaker.set(message.speaker, speakerLabelOf(message.speaker, message.speakerLabel));
    }
  }
  const speakers = [...baseBySpeaker.keys()].sort((a, b) => a - b);
  const names = new Map<number, string>();
  for (const speaker of speakers) {
    const base = baseBySpeaker.get(speaker)!;
    const same = speakers.filter((other) => baseBySpeaker.get(other) === base);
    names.set(speaker, same.length > 1 ? `${base} ${same.indexOf(speaker) + 1}` : base);
  }
  return names;
}

export interface TalkShare {
  speaker: number;
  label: string;
  percent: number;
}

/** 화자별 말한 시간 비율(%). 시각이 없는 받아쓰기만 있으면 빈 목록 */
export function computeTalkShares(
  messages: Array<{ speaker: number; speakerLabel: string | null; startMs: number; endMs: number }>,
): TalkShare[] {
  const names = speakerDisplayNames(messages);
  const totals = new Map<number, number>();
  for (const message of messages) {
    const spoken = message.endMs - message.startMs;
    if (spoken > 0) totals.set(message.speaker, (totals.get(message.speaker) ?? 0) + spoken);
  }
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0);
  if (total === 0) return [];
  return [...totals.entries()]
    .sort(([a], [b]) => a - b)
    .map(([speaker, spoken]) => ({
      speaker,
      label: names.get(speaker) ?? String(speaker),
      percent: Math.round((spoken / total) * 100),
    }));
}

/** 대화 검색: 검색어가 든 줄 번호(seq) 목록 */
export function findTranscriptMatches(messages: Array<{ seq: number; text: string }>, query: string): number[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  return messages.filter((message) => message.text.toLowerCase().includes(needle)).map((message) => message.seq);
}

/** 녹음 방향 라벨: 방문 상담 녹음은 통화가 아니다 */
export function directionLabel(direction: string): string {
  if (direction === 'visit') return '방문';
  return direction === 'outbound' ? '발신' : '수신';
}

/** 연결 대기 녹음이 아직 상담이 되지 못한 이유 */
export function pendingReason(item: {
  contact: unknown;
  sttStatus: string;
  analysisStatus: string;
}): { label: string; className: string; busy: boolean } {
  if (item.sttStatus === 'pending' || item.sttStatus === 'processing') {
    return { label: '받아쓰는 중', className: 'bg-info-soft text-info', busy: true };
  }
  if (item.sttStatus === 'failed') {
    return { label: '받아쓰기 실패', className: 'bg-destructive-soft text-destructive', busy: false };
  }
  if (item.analysisStatus === 'processing') {
    return { label: '분석 중', className: 'bg-violet-soft text-violet', busy: true };
  }
  if (!item.contact) {
    return { label: '연락처 연결 필요', className: 'bg-warning-soft text-warning-strong', busy: false };
  }
  if (item.analysisStatus === 'failed') {
    return { label: '분석 실패', className: 'bg-destructive-soft text-destructive', busy: false };
  }
  return { label: '상담 기록 없음', className: 'bg-neutral-soft text-muted-foreground', busy: false };
}

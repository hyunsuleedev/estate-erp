import type { SttStatus } from '@estate-erp/api-client';

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

/** 부재중 휴리스틱 — 수신 && 5초 미만 (서버에 통화 결과 필드가 없어 추정) */
export function isMissedCall(direction: string, durationSec: number): boolean {
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

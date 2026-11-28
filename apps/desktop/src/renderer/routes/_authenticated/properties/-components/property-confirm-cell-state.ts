import type { ListingIntake } from '@estate-erp/api-client';

/**
 * 매물관리 표의 "확인" 칸이 보여 줄 내용. React에 의존하지 않는다.
 *
 * 칸이 답하는 질문은 하나다: "이 매물이 아직 유효하다고 확인한 게 언제인가".
 * 윗줄은 확인된 날, 아랫줄은 그로부터 지난 날수, 색은 얼마나 오래됐는지다.
 * 그 밖의 것은 적지 않는다(사용자 결정 2026-11-28): 의뢰 종료는 옆의 매물 상태가 보여 주고,
 * 연락이 안 된 것(부재중)은 찍지 않는다. 예전 기록의 부재중 · 답변대기도 여기서는 보이지 않는다.
 */
export type ConfirmCellTone = 'none' | 'fresh' | 'aging' | 'stale';

export interface ConfirmCellModel {
  /** 확인된 지 얼마나 됐는지. 종료한 의뢰와 확인된 적 없는 의뢰는 'none'. */
  tone: ConfirmCellTone;
  /** 윗줄. 확인된 날, 없으면 "-". */
  date: string;
  /** 아랫줄. 비어 있을 수 있다. */
  relative: string;
  /** 종료한 의뢰. 다시 확인할 대상이 아니므로 확인 단추를 두지 않는다. */
  closed: boolean;
  /** 칸에 올렸을 때 보이는 풀어 쓴 설명. */
  title: string;
}

type ConfirmCellIntake = Pick<
  ListingIntake,
  | 'lifecycleStatus'
  | 'lastCheckedAt'
  | 'lastVerifiedAt'
  | 'lastCheckResult'
>;

const DAY_MS = 86_400_000;

function toTime(value?: string | null): number | null {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

function daysSince(time: number, now: number): number {
  return Math.max(0, Math.floor((now - time) / DAY_MS));
}

function agoLabel(time: number, now: number): string {
  const days = daysSince(time, now);
  return days === 0 ? '오늘' : `${days}일 전`;
}

function dateLabel(time: number): string {
  return new Date(time).toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  });
}

/** 7일 이내, 30일 이내, 그 뒤. 서버가 유효 확인 뒤 다음 확인일을 7일 뒤로 잡는 것과 맞춘 기준이다. */
export function confirmToneForDays(days: number | null): ConfirmCellTone {
  if (days == null) return 'none';
  if (days <= 7) return 'fresh';
  if (days <= 30) return 'aging';
  return 'stale';
}

export function getConfirmCellModel(
  intake: ConfirmCellIntake,
  now: number = Date.now(),
): ConfirmCellModel {
  const checkedAt = toTime(intake.lastCheckedAt);
  // 확인된 날이 비어 있는 옛 기록은, 마지막 시도가 유효 확인이었으면 그 시도한 날을 쓴다.
  const verifiedAt =
    toTime(intake.lastVerifiedAt) ??
    (intake.lastCheckResult === 'alive' ||
    intake.lastCheckResult === 'price_changed'
      ? checkedAt
      : null);
  const date = verifiedAt == null ? '-' : dateLabel(verifiedAt);
  const verifiedText =
    verifiedAt == null ? '확인된 적 없음' : `확인된 날 ${date}`;

  // 종료한 의뢰는 다시 확인할 대상이 아니다: 마지막으로 확인된 날만 남기고 단추를 두지 않는다
  if (intake.lifecycleStatus === 'closed') {
    return { tone: 'none', date, relative: '', closed: true, title: verifiedText };
  }

  return {
    tone: confirmToneForDays(
      verifiedAt == null ? null : daysSince(verifiedAt, now),
    ),
    date,
    relative: verifiedAt == null ? '' : agoLabel(verifiedAt, now),
    closed: false,
    title: verifiedText,
  };
}

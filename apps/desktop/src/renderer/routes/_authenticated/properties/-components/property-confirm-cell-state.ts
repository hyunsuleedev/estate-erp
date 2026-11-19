import type { ListingIntake } from '@estate-erp/api-client';

/**
 * 매물관리 표의 "확인" 칸이 보여 줄 내용. React에 의존하지 않는다.
 *
 * 칸이 답하는 질문은 "이 매물이 아직 유효하다고 확인한 게 언제인가"다. 그래서
 * - 윗줄 날짜와 색은 **확인된 날**(유효함·가격 변경으로 답을 들은 마지막 날)로 정한다.
 *   연락해 본 날(`lastCheckedAt`)로 정하면 전화를 안 받은 매물도 방금 확인한 것처럼 보인다.
 * - 아랫줄은 그 뒤의 시도가 유효 확인이 아니었으면 그 결과와 시도한 날을, 아니면 지난 날수를 적는다.
 *   방금 걸어 본 매물과 손대지 않은 매물이 구별된다.
 */
export type ConfirmCellTone = 'none' | 'fresh' | 'aging' | 'stale';

export interface ConfirmCellModel {
  /** 확인된 지 얼마나 됐는지. 종료한 의뢰와 확인된 적 없는 의뢰는 'none'. */
  tone: ConfirmCellTone;
  /** 윗줄. 확인된 날, 없으면 "-". */
  date: string;
  /** 아랫줄. 비어 있을 수 있다. */
  relative: string;
  /** 아랫줄이 지난 날수가 아니라 "마지막에 한 일"(부재중·답변대기·의뢰 종료)인지. */
  attempt: boolean;
  /** 종료한 의뢰. 다시 확인할 대상이 아니므로 확인 단추를 두지 않는다. */
  closed: boolean;
  /** 칸에 올렸을 때 보이는 풀어 쓴 설명. */
  title: string;
}

type ConfirmCellIntake = Pick<
  ListingIntake,
  | 'lifecycleStatus'
  | 'lifecycleChangedAt'
  | 'lastCheckedAt'
  | 'lastVerifiedAt'
  | 'lastCheckResult'
>;

const DAY_MS = 86_400_000;

/** 유효 확인이 아니었던 시도의 이름. 표에서 쓰는 말(getConfirmStatusMeta)과 같다. */
const ATTEMPT_LABEL: Record<string, string> = {
  no_answer: '부재중',
  pending: '답변대기',
};

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

  if (intake.lifecycleStatus === 'closed') {
    const closedAt = toTime(intake.lifecycleChangedAt);
    return {
      tone: 'none',
      date,
      relative:
        closedAt == null ? '의뢰 종료' : `의뢰 종료 · ${agoLabel(closedAt, now)}`,
      attempt: true,
      closed: true,
      title:
        closedAt == null
          ? `${verifiedText} · 의뢰 종료`
          : `${verifiedText} · ${dateLabel(closedAt)} 의뢰 종료`,
    };
  }

  const attemptLabel = intake.lastCheckResult
    ? ATTEMPT_LABEL[intake.lastCheckResult]
    : undefined;
  // 그 시도가 확인된 날보다 뒤일 때만 적는다(같은 시각이면 유효 확인이 마지막이다).
  const failedAttempt =
    attemptLabel != null &&
    checkedAt != null &&
    (verifiedAt == null || checkedAt > verifiedAt);

  if (failedAttempt) {
    return {
      tone: confirmToneForDays(
        verifiedAt == null ? null : daysSince(verifiedAt, now),
      ),
      date,
      relative: `${attemptLabel} · ${agoLabel(checkedAt, now)}`,
      attempt: true,
      closed: false,
      title: `${verifiedText} · 마지막 시도 ${dateLabel(checkedAt)} ${attemptLabel}`,
    };
  }

  return {
    tone: confirmToneForDays(
      verifiedAt == null ? null : daysSince(verifiedAt, now),
    ),
    date,
    relative: verifiedAt == null ? '' : agoLabel(verifiedAt, now),
    attempt: false,
    closed: false,
    title: verifiedText,
  };
}

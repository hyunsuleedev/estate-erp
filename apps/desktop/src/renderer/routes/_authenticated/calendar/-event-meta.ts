import {
  MATCH_CLOSED_REASON_LABELS,
  MatchStage,
  findDealThatOutlivedEvent,
  formatPlaceLabel,
  normalizeDealStage,
  type MatchClosedReason,
} from '@estate-erp/shared';
import type { CalendarEvent } from '@estate-erp/api-client';

import { formatMoney } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { isSameCalendarDate } from './-calendar-view-utils';

export type EventTypeMeta = {
  label: string;
  color: string;
};

/**
 * CalendarEvent.type별 라벨/기본 색상 (범례·필터·폼 공용).
 * app.css의 Notion 계열 시맨틱 토큰과 같은 원값을 사용한다.
 */
export const EVENT_TYPE_META: Record<string, EventTypeMeta> = {
  general: { label: '일반', color: '#787774' },
  viewing: { label: '임장', color: '#0f7b6c' },
  contract: { label: '계약', color: '#cb912f' },
  meeting: { label: '미팅', color: '#2383e2' },
  task: { label: '업무', color: '#6940a5' },
};

/**
 * 닫힌 매칭(손님이 다른 곳에서 구함·매물 의뢰 종료·직접 종료)에 걸린 앞날의 일정 — 이제 없는 약속이다.
 * 일정은 기록이라 지우지 않고, 볼 때마다 계산한다(매칭이 거래 취소로 되살아나면 다시 보통으로 보인다).
 * 지난 일정은 그때 있었던 일이므로 건드리지 않는다.
 */
export function getMatchClosure(
  event: Pick<CalendarEvent, 'match' | 'start' | 'end'>,
  now: Date = new Date(),
): { reasonLabel: string | null } | null {
  if (event.match?.stage !== MatchStage.CLOSED) return null;
  const end = new Date(event.end ?? event.start);
  if (Number.isNaN(end.getTime()) || end.getTime() < now.getTime()) return null;
  const reason = event.match.closedReason as MatchClosedReason | null | undefined;
  return { reasonLabel: reason ? (MATCH_CLOSED_REASON_LABELS[reason] ?? null) : null };
}

/**
 * 이미 끝난 거래의 앞날 일정 — 거래 전환 전에 잡아 둔 임장이, 그 거래가 잔금 완료 · 정산 종료까지 끝난 뒤에도
 * 날짜만 앞날로 남은 것. 약속이 깨진 것(매칭 종료)과 달리 줄을 긋지 않고 흐리게만 하고,
 * 대시보드의 '다가오는 일정' · 오늘 일정 수에서는 뺀다(받은 대금과 같은 처리).
 * 매칭 단계만 보고 판정하지 않는다: 고객 검토 · 협상 중의 재임장, 거래 전환 뒤에 잡은 약속(잔금 전 집 확인,
 * 잔금 뒤 약속)은 유효한 일정이다. 판정은 shared의 findDealThatOutlivedEvent — 거래를 만들기 전에 잡힌 일정만.
 * 지난 일정은 그때 있었던 일이므로 건드리지 않는다. 저장하지 않고 볼 때 계산한다.
 */
export function getEventSuperseded(
  event: Pick<CalendarEvent, 'match' | 'deal' | 'start' | 'end' | 'createdAt'>,
  now: Date = new Date(),
): { label: string } | null {
  const end = new Date(event.end ?? event.start);
  if (Number.isNaN(end.getTime()) || end.getTime() < now.getTime()) return null;
  const ended = findDealThatOutlivedEvent(event.createdAt, [event.deal, ...(event.match?.deals ?? [])]);
  return ended ? { label: getStatusMeta('dealStage', normalizeDealStage(ended.stage)).label } : null;
}

/** 앞으로 할 일로 세지 않는 일정: 닫힌 매칭(없는 약속) 또는 이미 다음 단계로 넘어간 일 */
export function isEventMoot(
  event: Pick<CalendarEvent, 'match' | 'deal' | 'start' | 'end' | 'createdAt'>,
  now: Date = new Date(),
): boolean {
  return Boolean(getMatchClosure(event, now) || getEventSuperseded(event, now));
}

export function getEventMeta(event: Pick<CalendarEvent, 'type'>) {
  return EVENT_TYPE_META[event.type] ?? EVENT_TYPE_META.general;
}

export function getEventColor(event: Pick<CalendarEvent, 'type' | 'color'>) {
  return event.color ?? getEventMeta(event).color;
}

export function withAlpha(color: string, alphaHex: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? `${color}${alphaHex}` : color;
}

export function getEventStatus(event: CalendarEvent) {
  const now = new Date();
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : start;

  // 이미 끝난 거래의 앞날 일정은 '예정'이라 하지 않는다
  const superseded = getEventSuperseded(event, now);
  if (superseded) {
    return { state: 'done', label: superseded.label, className: 'bg-muted text-muted-foreground' };
  }

  if (end < now) {
    // 끝난 시각이 지났을 뿐 '했다'는 기록은 아니다 — 완료라고 쓰지 않는다
    return { state: 'done', label: '지남', className: 'bg-muted text-muted-foreground' };
  }

  if (start <= now && now <= end) {
    return { state: 'active', label: '진행 중', className: 'bg-primary text-primary-foreground' };
  }

  const diffMinutes = Math.round((start.getTime() - now.getTime()) / 60_000);

  if (diffMinutes > 0 && diffMinutes <= 120) {
    return {
      state: 'soon',
      label: `${Math.ceil(diffMinutes / 60)}시간 후`,
      className: 'bg-warning-soft text-warning',
    };
  }

  return { state: 'upcoming', label: '예정', className: 'bg-muted text-muted-foreground' };
}

/** 연결한 매물의 "고덕그라시움 102동 2203호" — 화면 전체의 주소 기준(formatPlaceLabel). 같은 단지의 여러 호실을 구분한다. */
export function formatEventPlace(event: Pick<CalendarEvent, 'property'>): string {
  const property = event.property;
  if (!property?.site?.name) return '';
  return formatPlaceLabel({
    siteName: property.site.name,
    dongName: property.unit?.dong?.name,
    dongIsPlaceholder: property.unit?.dong?.isPlaceholder,
    unit: property.unit,
  });
}

/** 연결된 CRM 엔터티 요약 텍스트 (단계는 한글 라벨, 매물은 거래유형·가격 병기) */
export function formatEventContext(event: CalendarEvent) {
  const listingChunk = event.listing
    ? [
        getStatusMeta('transactionType', event.listing.transactionType).label,
        event.listing.price ? formatMoney(event.listing.price) : null,
      ]
        .filter(Boolean)
        .join(' ')
    : null;

  const place = formatEventPlace(event);
  const chunks = [
    place ? `매물 · ${place}` : null,
    listingChunk ? `매물조건 · ${listingChunk}` : null,
    event.contact?.name ? `연락처 · ${event.contact.name}` : null,
    event.match?.stage ? `매칭 · ${getStatusMeta('matchStage', event.match.stage).label}` : null,
    event.deal?.stage ? `거래 · ${getStatusMeta('dealStage', event.deal.stage).label}` : null,
    event.user?.name ? `${event.user.name} 담당` : null,
  ].filter(Boolean);

  return chunks.length > 0 ? chunks.join(' · ') : getEventMeta(event).label;
}

export function formatEventTimeRange(event: CalendarEvent) {
  if (event.allDay) return '종일';

  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : null;

  if (end && !isSameCalendarDate(start, end)) {
    return `${formatShortDateTime(start)} → ${formatShortDateTime(end)}`;
  }

  return end ? `${formatTime(event.start)} - ${formatTime(event.end as string)}` : formatTime(event.start);
}

export function formatTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatShortDateTime(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()} ${new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)}`;
}

export function formatMonthTitle(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

export function formatDayTitle(date: Date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

export function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', { weekday: 'long' }).format(date);
}

export function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
}

export function formatRelativeDay(date: Date) {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (isSameCalendarDate(date, today)) return '오늘';
  if (isSameCalendarDate(date, tomorrow)) return '내일';

  return formatWeekday(date);
}

export function formatDateRange(start: Date, end: Date) {
  if (isSameCalendarDate(start, end)) {
    return `${start.getMonth() + 1}월 ${start.getDate()}일`;
  }

  if (start.getMonth() === end.getMonth()) {
    return `${start.getMonth() + 1}월 ${start.getDate()}일 - ${end.getDate()}일`;
  }

  return `${start.getMonth() + 1}월 ${start.getDate()}일 - ${end.getMonth() + 1}월 ${end.getDate()}일`;
}

export function toDateTimeLocalInput(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function toDateInput(value: string | null | undefined) {
  if (!value) return '';
  return toDateTimeLocalInput(value).slice(0, 10);
}

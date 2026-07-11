import type { CalendarEvent } from '@estate-erp/api-client';

import { formatMoney } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { isSameCalendarDate } from './-calendar-view-utils';

export type EventTypeMeta = {
  label: string;
  color: string;
};

/** CalendarEvent.type별 라벨/기본 색상 (범례·필터·폼 공용) */
export const EVENT_TYPE_META: Record<string, EventTypeMeta> = {
  general: { label: '일반', color: '#64748b' },
  viewing: { label: '임장', color: '#10b981' },
  contract: { label: '계약', color: '#f59e0b' },
  meeting: { label: '미팅', color: '#3b82f6' },
  task: { label: '업무', color: '#8b5cf6' },
};

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

  if (end < now) {
    return { state: 'done', label: '완료', className: 'bg-success-soft text-success' };
  }

  if (start <= now && now <= end) {
    return { state: 'active', label: '진행중', className: 'bg-primary text-primary-foreground' };
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

  const chunks = [
    event.property?.site?.name ? `매물 · ${event.property.site.name}` : null,
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

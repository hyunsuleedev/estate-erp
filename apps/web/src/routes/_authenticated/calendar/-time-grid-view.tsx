import { Fragment, useMemo } from 'react';
import type { CalendarEvent } from '@estate-erp/api-client';

import { cn } from '@/lib/utils';
import {
  getHourSlots,
  getLocalDateKey,
  isMultiDayEvent,
  isSameCalendarDate,
} from './-calendar-view-utils';
import {
  formatEventContext,
  formatEventTimeRange,
  getEventColor,
  withAlpha,
} from './-event-meta';
import { WEEK_DAY_LABELS } from './-month-view';

/**
 * 주/일 타임그리드 — 종일·멀티데이 이벤트는 상단 all-day 영역에,
 * 시간 지정 이벤트는 시간 슬롯에 배치한다. 슬롯은 기본 09~18시에서
 * 이벤트가 있는 시간까지 자동 확장된다.
 */
export function TimeGridCalendarView({
  dates,
  eventsByDate,
  selectedDate,
  onCreate,
  onEdit,
  onSelectDate,
}: {
  dates: Date[];
  eventsByDate: Map<string, CalendarEvent[]>;
  selectedDate: Date;
  onCreate: (date: Date) => void;
  onEdit: (event: CalendarEvent) => void;
  onSelectDate: (date: Date) => void;
}) {
  const visibleEvents = useMemo(() => {
    const seen = new Map<string, CalendarEvent>();
    for (const date of dates) {
      for (const event of eventsByDate.get(getLocalDateKey(date)) ?? []) {
        seen.set(event.id, event);
      }
    }
    return [...seen.values()];
  }, [dates, eventsByDate]);

  const hourSlots = useMemo(() => getHourSlots(visibleEvents), [visibleEvents]);
  const hasAllDayRow = visibleEvents.some((event) => event.allDay || isMultiDayEvent(event));

  return (
    <div className="overflow-x-auto rounded-[12px] border border-border bg-background">
      <div
        className="grid"
        style={{
          // 76px 시간축 + 요일당 최소 128px. 1280px 뷰포트(콘텐츠 ~992px)에서
          // 가로 스크롤 없이 들어가고, 더 좁으면 컨테이너 안에서만 스크롤된다.
          gridTemplateColumns: `76px repeat(${dates.length}, minmax(128px, 1fr))`,
          minWidth: dates.length === 1 ? '480px' : '972px',
        }}
      >
        <div className="border-b border-r bg-muted/60 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          KST
        </div>
        {dates.map((date) => {
          const isToday = isSameCalendarDate(new Date(), date);
          const isSelected = isSameCalendarDate(selectedDate, date);
          const dayOfWeek = date.getDay();

          return (
            <button
              key={getLocalDateKey(date)}
              type="button"
              onClick={() => onSelectDate(date)}
              className={cn(
                'border-b border-r bg-muted/40 px-3 py-3 text-left transition-colors hover:bg-muted/70',
                isToday && 'bg-info-soft/50',
                isSelected && !isToday && 'bg-background',
              )}
            >
              <div
                className={cn(
                  'text-[10px] font-semibold tracking-[0.06em] text-muted-foreground',
                  dayOfWeek === 0 && 'text-destructive/80',
                  dayOfWeek === 6 && 'text-info/80',
                  isToday && 'text-info',
                )}
              >
                {WEEK_DAY_LABELS[dayOfWeek]}
                {isToday ? ' · 오늘' : ''}
              </div>
              <div className={cn('mt-1 text-lg font-semibold tabular-nums', isToday && 'text-info')}>
                {date.getDate()}
              </div>
              <div className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                {(eventsByDate.get(getLocalDateKey(date)) ?? []).length}건
              </div>
            </button>
          );
        })}

        {hasAllDayRow ? (
          <>
            <div className="border-b border-r bg-muted/40 px-2 py-2 text-right text-[10px] font-semibold text-muted-foreground">
              종일
            </div>
            {dates.map((date) => {
              const allDayEvents = (eventsByDate.get(getLocalDateKey(date)) ?? []).filter(
                (event) => event.allDay || isMultiDayEvent(event),
              );
              const isToday = isSameCalendarDate(new Date(), date);

              return (
                <div
                  key={`allday-${getLocalDateKey(date)}`}
                  className={cn('min-h-[44px] border-b border-r bg-background p-1.5', isToday && 'bg-info-soft/25')}
                >
                  <div className="space-y-1">
                    {allDayEvents.map((event) => {
                      const color = getEventColor(event);
                      return (
                        <button
                          key={event.id}
                          type="button"
                          title={`${formatEventTimeRange(event)} · ${event.title}`}
                          onClick={() => onEdit(event)}
                          className="block w-full truncate rounded-md border border-l-[3px] px-2 py-1 text-left text-[11px] font-semibold transition-colors hover:bg-background"
                          style={{ backgroundColor: withAlpha(color, '1F'), borderLeftColor: color }}
                        >
                          {event.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </>
        ) : null}

        {hourSlots.map((hour) => (
          <Fragment key={hour}>
            <div className="min-h-[86px] border-r border-t bg-muted/40 px-2 py-2 text-right text-[10px] tabular-nums text-muted-foreground">
              {String(hour).padStart(2, '0')}:00
            </div>
            {dates.map((date) => {
              const dayEvents = eventsByDate.get(getLocalDateKey(date)) ?? [];
              const hourEvents = dayEvents.filter(
                (event) =>
                  !event.allDay &&
                  !isMultiDayEvent(event) &&
                  new Date(event.start).getHours() === hour,
              );
              const isToday = isSameCalendarDate(new Date(), date);

              return (
                <div
                  key={`${getLocalDateKey(date)}-${hour}`}
                  className={cn(
                    'min-h-[86px] border-r border-t bg-background p-2',
                    isToday && 'bg-info-soft/25',
                  )}
                  onDoubleClick={() => {
                    const dateWithHour = new Date(date);
                    dateWithHour.setHours(hour, 0, 0, 0);
                    onCreate(dateWithHour);
                  }}
                >
                  <div className="space-y-1.5">
                    {hourEvents.map((event) => (
                      <WeekEventBlock key={event.id} event={event} onEdit={onEdit} />
                    ))}
                  </div>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function WeekEventBlock({
  event,
  onEdit,
}: {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
}) {
  const color = getEventColor(event);

  return (
    <button
      type="button"
      onClick={() => onEdit(event)}
      className="w-full rounded-md border border-l-[3px] px-2.5 py-2 text-left transition-colors hover:bg-background"
      style={{
        backgroundColor: withAlpha(color, '1F'),
        borderLeftColor: color,
      }}
    >
      <div className="truncate text-[11px] font-semibold text-foreground">{event.title}</div>
      {/* break-keep: 좁은 컬럼에서 한글 음절 중간 줄바꿈 방지 */}
      <div className="mt-0.5 break-keep text-[10px] tabular-nums text-muted-foreground">
        {formatEventTimeRange(event)}
      </div>
      <div className="mt-1 truncate text-[10px] text-muted-foreground">{formatEventContext(event)}</div>
    </button>
  );
}

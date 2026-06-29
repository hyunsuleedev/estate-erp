import { useNavigate } from '@tanstack/react-router';
import { CalendarPlus2, Landmark } from 'lucide-react';
import type { CalendarEvent } from '@estate-erp/api-client';

import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  buildMonthCells,
  getLocalDateKey,
  isSameCalendarDate,
} from './-calendar-view-utils';
import {
  formatDayTitle,
  formatEventContext,
  formatEventTimeRange,
  formatWeekday,
  getEventColor,
  withAlpha,
} from './-event-meta';
import { OVERLAY_META, type OverlayItem } from './-calendar-overlay';

export const WEEK_DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

export function MonthCalendarView({
  currentDate,
  selectedDate,
  eventsByDate,
  overlaysByDate,
  selectedDateEvents,
  onCreate,
  onEdit,
  onSelectDate,
}: {
  currentDate: Date;
  selectedDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  overlaysByDate: Map<string, OverlayItem[]>;
  selectedDateEvents: CalendarEvent[];
  onCreate: (date: Date) => void;
  onEdit: (event: CalendarEvent) => void;
  onSelectDate: (date: Date) => void;
}) {
  const cells = buildMonthCells(currentDate);

  return (
    <div className="grid overflow-hidden rounded-lg border bg-background shadow-xs xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 overflow-x-auto xl:border-r">
        <div className="min-w-[760px] xl:min-w-0">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {WEEK_DAY_LABELS.map((day, index) => (
              <div
                key={day}
                className={cn(
                  'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground',
                  index === 0 && 'text-rose-500',
                  index === 6 && 'text-blue-500',
                )}
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((cell) => {
              const dayEvents = eventsByDate.get(cell.key) ?? [];
              const dayOverlays = overlaysByDate.get(cell.key) ?? [];
              const isSelected = isSameCalendarDate(selectedDate, cell.date);
              const isToday = isSameCalendarDate(new Date(), cell.date);

              return (
                <div
                  key={cell.key}
                  className={cn(
                    'min-h-[124px] border-b border-r bg-background p-2.5 text-left outline-none transition-colors md:min-h-[140px]',
                    isSelected ? 'bg-blue-50/60 ring-1 ring-inset ring-blue-200' : 'hover:bg-muted/30',
                    cell.isOutsideMonth && 'bg-muted/20 text-muted-foreground',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelectDate(cell.date)}
                    className="flex w-full items-center justify-between gap-2 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span
                      className={cn(
                        'inline-flex size-7 items-center justify-center rounded-full text-xs font-semibold',
                        isToday && 'bg-primary text-primary-foreground shadow-sm',
                        !isToday && isSelected && 'bg-background text-foreground shadow-xs',
                        !isToday && cell.isOutsideMonth && 'text-muted-foreground/60',
                        !isToday && !isSelected && !cell.isOutsideMonth && 'text-foreground',
                      )}
                    >
                      {cell.date.getDate()}
                    </span>
                    {dayEvents.length > 0 ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {dayEvents.length}건
                      </span>
                    ) : null}
                  </button>

                  <div className="mt-2 space-y-1.5">
                    {dayEvents.slice(0, 3).map((event) => (
                      <MonthEventPill key={event.id} event={event} onEdit={onEdit} />
                    ))}
                    {dayEvents.length > 3 ? (
                      <button
                        type="button"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          onSelectDate(cell.date);
                        }}
                        className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        +{dayEvents.length - 3}개 더보기
                      </button>
                    ) : null}
                    {dayOverlays.slice(0, 2).map((item) => (
                      <OverlayPill key={item.id} item={item} />
                    ))}
                    {dayOverlays.length > 2 ? (
                      <button
                        type="button"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation();
                          onSelectDate(cell.date);
                        }}
                        className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-background hover:text-foreground"
                      >
                        +{dayOverlays.length - 2}건 재무 일정
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <SelectedDayPanel
        selectedDate={selectedDate}
        selectedDateEvents={selectedDateEvents}
        selectedDateOverlays={overlaysByDate.get(getLocalDateKey(selectedDate)) ?? []}
        onCreate={onCreate}
        onEdit={onEdit}
      />
    </div>
  );
}

export function MonthEventPill({
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
      title={`${formatEventTimeRange(event)} · ${event.title}`}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onEdit(event);
      }}
      className="block w-full rounded-md border border-l-[3px] px-2 py-1 text-left shadow-xs transition-colors hover:bg-background"
      style={{
        backgroundColor: withAlpha(color, '14'),
        borderLeftColor: color,
      }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="min-w-0 truncate text-[11px] font-semibold text-foreground">{event.title}</span>
      </span>
    </button>
  );
}

/** 계약일/중도금일/잔금일/수금예정 자동 표시 pill — 클릭 시 계약/수금 화면으로 이동 */
export function OverlayPill({ item }: { item: OverlayItem }) {
  const navigate = useNavigate();
  const meta = OVERLAY_META[item.kind];

  return (
    <button
      type="button"
      title={`${item.title}${item.sublabel ? ` · ${item.sublabel}` : ''}`}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        void navigate({ to: meta.link });
      }}
      className="block w-full rounded-md border border-dashed px-2 py-1 text-left transition-colors hover:bg-background"
      style={{ borderColor: withAlpha(meta.color, '66'), backgroundColor: withAlpha(meta.color, '0D') }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Landmark className="size-3 shrink-0" style={{ color: meta.color }} />
        <span className="min-w-0 truncate text-[11px] font-medium" style={{ color: meta.color }}>
          {item.title}
        </span>
      </span>
    </button>
  );
}

export function SelectedDayPanel({
  selectedDate,
  selectedDateEvents,
  selectedDateOverlays,
  onCreate,
  onEdit,
}: {
  selectedDate: Date;
  selectedDateEvents: CalendarEvent[];
  selectedDateOverlays: OverlayItem[];
  onCreate: (date: Date) => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const navigate = useNavigate();

  return (
    <aside className="flex min-h-[560px] flex-col bg-muted/[0.16]">
      <div className="border-b bg-background px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
              선택된 날짜
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{formatDayTitle(selectedDate)}</h2>
              <span className="text-sm text-muted-foreground">{formatWeekday(selectedDate)}</span>
            </div>
          </div>
          {isSameCalendarDate(new Date(), selectedDate) ? (
            <Badge className="border-0 bg-primary text-primary-foreground">오늘</Badge>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-xs">
          <span className="text-muted-foreground">선택일 일정</span>
          <span className="font-mono font-semibold tabular-nums">
            {selectedDateEvents.length + selectedDateOverlays.length}건
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedDateEvents.length === 0 && selectedDateOverlays.length === 0 ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">등록된 일정이 없습니다.</div>
        ) : (
          <>
            {selectedDateEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => onEdit(event)}
                className="flex w-full items-start gap-3 border-b bg-background px-5 py-3.5 text-left transition-colors hover:bg-muted/30"
              >
                <span
                  className="mt-1 h-11 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: getEventColor(event) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-mono text-[11px] text-muted-foreground tabular-nums">
                    {formatEventTimeRange(event)}
                  </span>
                  <span className="mt-1 block truncate text-sm font-semibold">{event.title}</span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
                    {formatEventContext(event)}
                  </span>
                </span>
              </button>
            ))}

            {selectedDateOverlays.length > 0 ? (
              <div className="border-b bg-muted/20 px-5 py-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground">
                재무 일정 (계약·수금 자동 표시)
              </div>
            ) : null}
            {selectedDateOverlays.map((item) => {
              const meta = OVERLAY_META[item.kind];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void navigate({ to: meta.link })}
                  className="flex w-full items-start gap-3 border-b bg-background px-5 py-3 text-left transition-colors hover:bg-muted/30"
                >
                  <Landmark className="mt-0.5 size-4 shrink-0" style={{ color: meta.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.title}</span>
                    {item.sublabel ? (
                      <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground tabular-nums">
                        {item.sublabel}
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {meta.link === '/contracts' ? '계약 보기' : '수금 보기'}
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>

      <div className="border-t bg-background p-3">
        <Button variant="outline" className="w-full justify-start" onClick={() => onCreate(selectedDate)}>
          <CalendarPlus2 className="size-4" />
          이 날짜에 일정 추가
        </Button>
      </div>
    </aside>
  );
}

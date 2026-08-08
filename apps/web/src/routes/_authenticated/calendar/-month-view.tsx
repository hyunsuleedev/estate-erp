import { useNavigate } from '@tanstack/react-router';
import { CalendarDays, CalendarPlus2, Landmark, Plus } from 'lucide-react';
import type { CalendarEvent } from '@estate-erp/api-client';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  buildMonthCells,
  getLocalDateKey,
  isSameCalendarDate,
  WEEK_DAY_LABELS,
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
    <div className="grid overflow-hidden rounded-[12px] border border-border bg-background xl:grid-cols-[minmax(0,1fr)_320px] 2xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 overflow-x-auto xl:border-r">
        <div className="min-w-[640px] xl:min-w-0">
          <div className="grid grid-cols-7 border-b bg-muted/60">
            {WEEK_DAY_LABELS.map((day, index) => (
              <div
                key={day}
                className={cn(
                  'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground',
                  index === 0 && 'text-destructive-strong',
                  index === 6 && 'text-info-strong',
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
                    isSelected ? 'bg-info-soft/40 ring-1 ring-inset ring-info/25' : 'hover:bg-muted/60',
                    cell.isOutsideMonth && 'bg-muted/40 text-muted-foreground',
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
                        isToday && 'bg-primary text-primary-foreground',
                        !isToday && isSelected && 'bg-background text-foreground shadow-xs',
                        !isToday && cell.isOutsideMonth && 'text-muted-foreground/60',
                        !isToday && !isSelected && !cell.isOutsideMonth && 'text-foreground',
                      )}
                    >
                      {cell.date.getDate()}
                    </span>
                    {dayEvents.length > 0 ? (
                      <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
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
      className="block w-full rounded-md border border-l-[3px] px-2 py-1 text-left transition-colors hover:bg-background"
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
    <aside className="hidden w-[292px] shrink-0 flex-col border-l border-border bg-muted/15 xl:flex">
      <div className="border-b border-border px-5 pb-4 pt-5">
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-xl font-semibold tabular-nums text-foreground',
              isSameCalendarDate(new Date(), selectedDate) && 'bg-foreground text-background',
            )}
          >
            {selectedDate.getDate()}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-sm font-semibold text-foreground">{formatWeekday(selectedDate)}</h2>
              {isSameCalendarDate(new Date(), selectedDate) ? (
                <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  오늘
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selectedDate.getFullYear()}년 {formatDayTitle(selectedDate)}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-[11px] text-muted-foreground">
          <span>일정</span>
          <strong className="font-semibold tabular-nums text-foreground">
            {selectedDateEvents.length + selectedDateOverlays.length}
          </strong>
          <span>·</span>
          <span>{selectedDateEvents.length > 0 ? '시간순으로 정렬됨' : '비어 있음'}</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedDateEvents.length === 0 && selectedDateOverlays.length === 0 ? (
          <div className="flex h-full min-h-56 flex-col items-center justify-center px-8 text-center">
            <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
              <CalendarDays className="size-[18px]" />
            </div>
            <div className="mt-3 text-sm font-medium text-foreground">비어 있는 날입니다</div>
            <p className="mt-1 break-keep text-xs leading-5 text-muted-foreground">
              방문, 미팅, 계약 일정을 추가하면 이곳에 시간순으로 표시됩니다.
            </p>
            <Button variant="ghost" size="sm" className="mt-3" onClick={() => onCreate(selectedDate)}>
              <Plus className="size-3.5" /> 일정 추가
            </Button>
          </div>
        ) : (
          <>
            {selectedDateEvents.length > 0 ? (
              <div className="border-b border-border px-5 py-2 text-[10px] font-semibold tracking-[0.04em] text-muted-foreground">
                SCHEDULE
              </div>
            ) : null}
            {selectedDateEvents.map((event) => (
              <button
                key={event.id}
                type="button"
                onClick={() => onEdit(event)}
                className="group flex w-full items-start gap-3 border-b border-border bg-background px-5 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
              >
                <span
                  className="mt-1.5 size-2 shrink-0 rounded-full ring-4 ring-background"
                  style={{ backgroundColor: getEventColor(event) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] tabular-nums text-muted-foreground">
                    {formatEventTimeRange(event)}
                  </span>
                  <span className="mt-1 block truncate text-[13px] font-semibold text-foreground">{event.title}</span>
                  <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                    {formatEventContext(event)}
                  </span>
                </span>
              </button>
            ))}

            {selectedDateOverlays.length > 0 ? (
              <div className="border-b border-border px-5 py-2 text-[10px] font-semibold tracking-[0.04em] text-muted-foreground">
                FINANCE
              </div>
            ) : null}
            {selectedDateOverlays.map((item) => {
              const meta = OVERLAY_META[item.kind];
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void navigate({ to: meta.link })}
                  className="flex w-full items-start gap-3 border-b border-border bg-background px-5 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
                >
                  <Landmark className="mt-0.5 size-4 shrink-0" style={{ color: meta.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">{item.title}</span>
                    {item.sublabel ? (
                      <span className="mt-0.5 block truncate text-[11px] tabular-nums text-muted-foreground">
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

      <div className="border-t border-border bg-background p-3">
        <Button variant="secondary" className="w-full justify-start" onClick={() => onCreate(selectedDate)}>
          <CalendarPlus2 className="size-4" />
          이 날짜에 일정 추가
        </Button>
      </div>
    </aside>
  );
}

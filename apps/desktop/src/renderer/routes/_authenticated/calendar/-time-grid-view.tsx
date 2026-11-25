import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { CalendarEvent } from "@estate-erp/api-client";
import { cn } from "@/lib/utils";
import {
  getLocalDateKey,
  isSameCalendarDate,
  WEEK_DAY_LABELS,
} from "./-calendar-view-utils";
import {
  formatEventContext,
  formatEventTimeRange,
  getEventColor,
  withAlpha,
} from "./-event-meta";
import { type OverlayItem } from "./-calendar-overlay";
import { OverlayPill } from "./-month-view";
import {
  dateAtMinute,
  DEFAULT_EVENT_MINUTES,
  GRID_HOUR_HEIGHT,
  GRID_SNAP_MINUTES,
  layoutDayEvents,
  minuteOfDay,
  moveEventTo,
  resizeEventTo,
  snapMinute,
} from "./-time-grid-layout";
import {
  DraftPreviewLabel,
  draftMinutesOnDate,
  type CalendarDraftPreview,
} from "./-event-draft-preview";
import type { EventTiming } from "./-use-event-timing";
import { EventTitle, eventTitleText } from "./-event-title";

const PX_PER_MINUTE = GRID_HOUR_HEIGHT / 60;
const clock = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
type Preview = {
  event?: CalendarEvent;
  timing: EventTiming;
  dayIndex: number;
  start: number;
  end: number;
  label: string;
};
type Gesture = {
  kind: "create" | "move" | "resize";
  event?: CalendarEvent;
  dayIndex: number;
  minute: number;
  x: number;
  y: number;
  pointerId: number;
  active: boolean;
  original: HTMLElement;
  gridLeft: number;
  gridWidth: number;
};

export function TimeGridCalendarView({
  dates,
  draft,
  eventsByDate,
  overlaysByDate,
  selectedDate,
  selectedEventId,
  pendingId,
  onCreate,
  onSelectEvent,
  onEdit,
  onSelectDate,
  onSelectOverlay,
  onChangeTime,
}: {
  dates: Date[];
  draft?: CalendarDraftPreview | null;
  eventsByDate: Map<string, CalendarEvent[]>;
  overlaysByDate: Map<string, OverlayItem[]>;
  selectedDate: Date;
  selectedEventId: string | null;
  pendingId: string | null;
  onCreate: (date: Date, end?: Date) => void;
  onSelectEvent: (event: CalendarEvent, anchor?: HTMLElement) => void;
  onEdit: (event: CalendarEvent) => void;
  onSelectDate: (date: Date) => void;
  onSelectOverlay: (item: OverlayItem, anchor?: HTMLElement) => void;
  onChangeTime: (event: CalendarEvent, timing: EventTiming) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const suppressUntil = useRef(0);
  const pointer = useRef({ x: 0, y: 0 });
  const frame = useRef(0);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [now, setNow] = useState(new Date());
  const [announcement, setAnnouncement] = useState("");
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const timezoneLabel =
    new Intl.DateTimeFormat("en", { timeZoneName: "short" })
      .formatToParts(now)
      .find((part) => part.type === "timeZoneName")?.value ?? timezone;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !gesture.current) return;
      event.preventDefault();
      event.stopPropagation();
      gesture.current = null;
      previewRef.current = null;
      setPreview(null);
      cancelAnimationFrame(frame.current);
      suppressUntil.current = performance.now() + 250;
      setAnnouncement("시간 변경을 취소했습니다.");
    };
    window.addEventListener("keydown", cancel, true);
    return () => {
      window.removeEventListener("keydown", cancel, true);
      cancelAnimationFrame(frame.current);
    };
  }, []);

  const events = useMemo(() => {
    const unique = new Map<string, CalendarEvent>();
    for (const day of dates)
      for (const event of eventsByDate.get(getLocalDateKey(day)) ?? [])
        unique.set(event.id, event);
    if (preview?.event)
      unique.set(preview.event.id, { ...preview.event, ...preview.timing });
    return [...unique.values()];
  }, [dates, eventsByDate, preview]);
  const placements = useMemo(
    () => dates.map((date) => layoutDayEvents(events, date)),
    [dates, events],
  );
  const hasAllDay = dates.some(
    (date) =>
      (eventsByDate.get(getLocalDateKey(date)) ?? []).some(
        (event) => event.allDay,
      ) || (overlaysByDate.get(getLocalDateKey(date))?.length ?? 0) > 0,
  );
  const columns = `52px repeat(${dates.length}, minmax(${dates.length === 1 ? 240 : 72}px, 1fr))`;

  function locate(x: number, y: number) {
    const rect = gridRef.current!.getBoundingClientRect();
    return {
      dayIndex: Math.max(
        0,
        Math.min(
          dates.length - 1,
          Math.floor((x - rect.left) / (rect.width / dates.length)),
        ),
      ),
      minute: Math.max(
        0,
        Math.min(1440, snapMinute((y - rect.top) / PX_PER_MINUTE)),
      ),
    };
  }
  function updatePreview(x: number, y: number) {
    const g = gesture.current;
    if (!g || !gridRef.current) return;
    const bounds = gridRef.current.getBoundingClientRect();
    if (
      Math.abs(bounds.left - g.gridLeft) > 1 ||
      Math.abs(bounds.width - g.gridWidth) > 1
    ) {
      gesture.current = null;
      previewRef.current = null;
      setPreview(null);
      suppressUntil.current = performance.now() + 300;
      cancelAnimationFrame(frame.current);
      setAnnouncement(
        "화면 크기가 바뀌어 이동을 취소했습니다. 다시 선택해 주세요.",
      );
      return;
    }
    if (!g.active && Math.hypot(x - g.x, y - g.y) < 5) return;
    // The preview can move to another date column and unmount its source card.
    // Keep capture on the stable grid once this becomes a drag.
    if (!g.active) gridRef.current.setPointerCapture(g.pointerId);
    g.active = true;
    const point = locate(x, y);
    let timing: EventTiming;
    let start: number, end: number;
    let dayIndex = g.kind === "create" ? g.dayIndex : point.dayIndex;
    if (g.kind === "create") {
      start = Math.min(g.minute, Math.min(1425, point.minute));
      end = Math.min(
        1440,
        Math.max(g.minute + GRID_SNAP_MINUTES, point.minute),
      );
      timing = {
        start: dateAtMinute(dates[dayIndex], start).toISOString(),
        end: dateAtMinute(dates[dayIndex], end).toISOString(),
      };
    } else if (g.kind === "move") {
      const originalStart = minuteOfDay(new Date(g.event!.start));
      start = Math.max(
        0,
        Math.min(1425, originalStart + point.minute - g.minute),
      );
      timing = moveEventTo(g.event!, dateAtMinute(dates[dayIndex], start));
      end =
        start +
        (timing.end
          ? (new Date(timing.end).getTime() -
              new Date(timing.start).getTime()) /
            60_000
          : DEFAULT_EVENT_MINUTES);
    } else {
      dayIndex = g.dayIndex;
      timing = resizeEventTo(
        g.event!,
        dateAtMinute(dates[dayIndex], point.minute),
      );
      start = minuteOfDay(new Date(timing.start));
      end = minuteOfDay(new Date(timing.end!));
      if (new Date(timing.end!).getDate() !== dates[dayIndex].getDate())
        end = 1440;
    }
    const next = {
      event: g.event,
      timing,
      dayIndex,
      start,
      end,
      label: `${dates[dayIndex].getMonth() + 1}/${dates[dayIndex].getDate()} ${clock(start)}–${end > 1440 ? "다음 날 " + clock(end - 1440) : clock(end)}`,
    };
    previewRef.current = next;
    setPreview(next);
  }
  function autoScroll() {
    if (!gesture.current) return;
    const container = gridRef.current?.closest<HTMLElement>(
      "[data-calendar-scroll]",
    );
    if (container && gesture.current.active) {
      const bounds = container.getBoundingClientRect();
      const y = pointer.current.y;
      const delta =
        y < bounds.top + 100 ? -10 : y > bounds.bottom - 42 ? 10 : 0;
      if (delta) {
        container.scrollTop += delta;
        updatePreview(pointer.current.x, y);
      }
    }
    frame.current = requestAnimationFrame(autoScroll);
  }
  function begin(
    e: ReactPointerEvent<HTMLElement>,
    kind: Gesture["kind"],
    dayIndex: number,
    event?: CalendarEvent,
  ) {
    if (e.button !== 0 || pendingId) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    pointer.current = { x: e.clientX, y: e.clientY };
    gesture.current = {
      kind,
      event,
      dayIndex,
      minute: Math.min(1425, locate(e.clientX, e.clientY).minute),
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      active: false,
      original: e.currentTarget,
      gridLeft: gridRef.current!.getBoundingClientRect().left,
      gridWidth: gridRef.current!.getBoundingClientRect().width,
    };
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(autoScroll);
  }
  function finish(e: ReactPointerEvent) {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    gesture.current = null;
    cancelAnimationFrame(frame.current);
    const result = previewRef.current;
    previewRef.current = null;
    setPreview(null);
    if (g.active && result) {
      suppressUntil.current = performance.now() + 300;
      if (g.kind === "create")
        onCreate(new Date(result.timing.start), new Date(result.timing.end!));
      else onChangeTime(g.event!, result.timing);
      setAnnouncement(result.label);
    }
  }

  return (
    <div className="min-w-fit bg-background" data-time-grid>
      <div
        className="sticky top-0 z-20 grid border-b bg-background"
        style={{ gridTemplateColumns: columns }}
      >
        <div
          className="flex items-end justify-center pb-3 text-[10px] text-muted-foreground"
          title={timezone}
        >
          {timezoneLabel}
        </div>
        {dates.map((date) => (
          <button
            key={getLocalDateKey(date)}
            type="button"
            onClick={() => onSelectDate(date)}
            className={cn(
              "flex items-center justify-center gap-2 border-l py-3 text-xs text-muted-foreground hover:bg-muted/40",
              isSameCalendarDate(selectedDate, date) && "bg-muted/25",
            )}
          >
            <span>{WEEK_DAY_LABELS[date.getDay()]}</span>
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full text-base tabular-nums text-foreground",
                isSameCalendarDate(now, date) &&
                  "bg-foreground text-background",
              )}
            >
              {date.getDate()}
            </span>
          </button>
        ))}
        {(hasAllDay || draft?.allDay) && (
          <>
            <div className="border-t px-1 py-2 text-center text-[10px] text-muted-foreground">
              종일·재무
            </div>
            {dates.map((date) => (
              <div
                key={getLocalDateKey(date)}
                className="space-y-1 border-l border-t p-1"
              >
                {draft?.allDay && draftMinutesOnDate(draft, date) && (
                  <DraftPreviewLabel draft={draft} />
                )}
                {(eventsByDate.get(getLocalDateKey(date)) ?? [])
                  .filter((event) => event.allDay)
                  .map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      data-calendar-event
                      onClick={(e) => onSelectEvent(event, e.currentTarget)}
                      onDoubleClick={() => onEdit(event)}
                      className="block w-full truncate rounded border-l-2 px-2 py-1 text-left text-[11px]"
                      style={{
                        borderColor: getEventColor(event),
                        backgroundColor: withAlpha(getEventColor(event), "18"),
                      }}
                    >
                      <EventTitle event={event} />
                    </button>
                  ))}
                {(overlaysByDate.get(getLocalDateKey(date)) ?? []).map(
                  (item) => (
                    <OverlayPill
                      key={item.id}
                      item={item}
                      onSelect={onSelectOverlay}
                    />
                  ),
                )}
              </div>
            ))}
          </>
        )}
      </div>
      <div className="grid" style={{ gridTemplateColumns: columns }}>
        <div className="relative" style={{ height: GRID_HOUR_HEIGHT * 24 }}>
          {Array.from({ length: 24 }, (_, hour) => (
            <span
              key={hour}
              className="absolute right-2 text-[10px] tabular-nums text-muted-foreground"
              style={{ top: hour * GRID_HOUR_HEIGHT + 2 }}
            >
              {clock(hour * 60)}
            </span>
          ))}
        </div>
        <div
          ref={gridRef}
          className="relative flex"
          style={{
            gridColumn: `span ${dates.length}`,
            height: GRID_HOUR_HEIGHT * 24,
          }}
          onPointerMove={(e) => {
            pointer.current = { x: e.clientX, y: e.clientY };
            updatePreview(e.clientX, e.clientY);
          }}
          onPointerUp={finish}
          onPointerCancel={() => {
            gesture.current = null;
            previewRef.current = null;
            setPreview(null);
            cancelAnimationFrame(frame.current);
          }}
        >
          {dates.map((date, dayIndex) => (
            <div
              key={getLocalDateKey(date)}
              data-time-grid-day={getLocalDateKey(date)}
              className={cn(
                "relative min-w-0 flex-1 touch-none border-l",
                isSameCalendarDate(now, date) && "bg-muted/15",
              )}
              style={{
                backgroundImage:
                  "linear-gradient(to bottom, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, color-mix(in srgb, var(--color-border) 40%, transparent) 1px, transparent 1px)",
                backgroundSize: `100% ${GRID_HOUR_HEIGHT}px, 100% ${GRID_HOUR_HEIGHT / 2}px`,
              }}
              onPointerDown={(e) => {
                if (e.target === e.currentTarget) begin(e, "create", dayIndex);
              }}
              onDoubleClick={(e) => {
                if (
                  e.target === e.currentTarget &&
                  !pendingId &&
                  performance.now() > suppressUntil.current
                ) {
                  const start = dateAtMinute(
                    date,
                    Math.min(1425, locate(e.clientX, e.clientY).minute),
                  );
                  onCreate(
                    start,
                    new Date(start.getTime() + DEFAULT_EVENT_MINUTES * 60_000),
                  );
                }
              }}
            >
              {placements[dayIndex].map((placement) => {
                const {
                  event,
                  startMinute,
                  endMinute,
                  column,
                  columns: count,
                  span,
                  continuesBefore,
                  continuesAfter,
                } = placement;
                const height = Math.max(
                  22,
                  (endMinute - startMinute) * PX_PER_MINUTE - 2,
                );
                const moving = preview?.event?.id === event.id;
                return (
                  <div
                    key={event.id}
                    className={cn(
                      "group absolute rounded-[5px] border-l-[3px]",
                      selectedEventId === event.id && "ring-1 ring-current",
                      moving && "z-10 opacity-85 shadow-md",
                      pendingId === event.id && "opacity-60",
                    )}
                    style={{
                      top: startMinute * PX_PER_MINUTE,
                      height,
                      left: `calc(${(column / count) * 100}% + 3px)`,
                      width: `calc(${(span / count) * 100}% - 6px)`,
                      color: getEventColor(event),
                      borderColor: getEventColor(event),
                      backgroundColor: withAlpha(getEventColor(event), "20"),
                    }}
                  >
                    <button
                      type="button"
                      data-calendar-event
                      data-event-id={event.id}
                      aria-label={`${eventTitleText(event)} · ${formatEventTimeRange(event)}`}
                      aria-busy={pendingId === event.id}
                      className={cn(
                        "flex size-full flex-col items-start overflow-hidden rounded-r px-1.5 py-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        !pendingId &&
                          !continuesBefore &&
                          "cursor-grab active:cursor-grabbing",
                      )}
                      title={`${eventTitleText(event)}\n${formatEventTimeRange(event)}\n${formatEventContext(event)}\n드래그: 시간 이동 · Alt+방향키: 15분/하루 이동`}
                      onPointerDown={(e) => {
                        if (!continuesBefore) begin(e, "move", dayIndex, event);
                      }}
                      onClick={(e) => {
                        if (performance.now() > suppressUntil.current)
                          onSelectEvent(event, e.currentTarget);
                      }}
                      onDoubleClick={() => {
                        if (
                          !pendingId &&
                          performance.now() > suppressUntil.current
                        )
                          onEdit(event);
                      }}
                      onKeyDown={(e) => {
                        if (
                          !e.altKey ||
                          pendingId ||
                          ![
                            "ArrowUp",
                            "ArrowDown",
                            "ArrowLeft",
                            "ArrowRight",
                          ].includes(e.key)
                        )
                          return;
                        e.preventDefault();
                        e.stopPropagation();
                        const start = new Date(event.start);
                        if (e.key === "ArrowUp" || e.key === "ArrowDown")
                          start.setMinutes(
                            start.getMinutes() +
                              (e.key === "ArrowUp" ? -15 : 15),
                          );
                        else
                          start.setDate(
                            start.getDate() + (e.key === "ArrowLeft" ? -1 : 1),
                          );
                        onChangeTime(event, moveEventTo(event, start));
                      }}
                    >
                      <span className="w-full truncate text-[11px] font-semibold leading-4 text-foreground">
                        {continuesBefore ? "↳ " : ""}
                        <EventTitle event={event} />
                      </span>
                      {height >= 40 && (
                        <span className="mt-0.5 w-full truncate text-[10px] tabular-nums text-muted-foreground">
                          {clock(startMinute)}–{clock(endMinute)}
                          {continuesAfter ? " ↗" : ""}
                        </span>
                      )}
                      {height >= 72 && (
                        <span className="mt-1 w-full truncate text-[10px] text-muted-foreground">
                          {formatEventContext(event)}
                        </span>
                      )}
                    </button>
                    {!continuesAfter && (
                      <button
                        type="button"
                        aria-label={`${event.title} 종료 시간 조절`}
                        disabled={!!pendingId}
                        className="absolute inset-x-1 bottom-0 flex h-2 cursor-ns-resize items-end justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onPointerDown={(e) =>
                          begin(e, "resize", dayIndex, event)
                        }
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (!["ArrowUp", "ArrowDown"].includes(e.key)) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const end = new Date(
                            event.end ??
                              new Date(
                                new Date(event.start).getTime() +
                                  DEFAULT_EVENT_MINUTES * 60_000,
                              ),
                          );
                          end.setMinutes(
                            end.getMinutes() + (e.key === "ArrowUp" ? -15 : 15),
                          );
                          onChangeTime(event, resizeEventTo(event, end));
                        }}
                      >
                        <span className="mb-0.5 h-0.5 w-5 rounded bg-current opacity-60" />
                      </button>
                    )}
                  </div>
                );
              })}
              {draft &&
                !draft.allDay &&
                (() => {
                  const minutes = draftMinutesOnDate(draft, date);
                  return minutes ? (
                    <div
                      className="pointer-events-none absolute inset-x-1 z-20 overflow-hidden rounded border border-dashed"
                      style={{
                        top: minutes.start * PX_PER_MINUTE,
                        height: Math.max(
                          24,
                          (minutes.end - minutes.start) * PX_PER_MINUTE,
                        ),
                        borderColor: draft.color,
                        backgroundColor: withAlpha(draft.color, "18"),
                      }}
                    >
                      <DraftPreviewLabel draft={draft} />
                    </div>
                  ) : null;
                })()}
              {preview && !preview.event && preview.dayIndex === dayIndex && (
                <div
                  className="pointer-events-none absolute inset-x-1 z-10 rounded border border-primary bg-primary/10 px-2 py-1 text-[11px]"
                  style={{
                    top: preview.start * PX_PER_MINUTE,
                    height: (preview.end - preview.start) * PX_PER_MINUTE,
                  }}
                >
                  {preview.label}
                </div>
              )}
              {isSameCalendarDate(now, date) && (
                <div
                  className="pointer-events-none absolute inset-x-0 z-10 border-t border-red-400"
                  style={{ top: minuteOfDay(now) * PX_PER_MINUTE }}
                >
                  <span className="absolute -left-1 -top-1 size-1.5 rounded-full bg-red-400" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      {preview && (
        <div className="pointer-events-none fixed bottom-7 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-foreground px-3 py-2 text-xs text-background shadow-lg">
          {preview.label} <span className="ml-2 opacity-60">Esc 취소</span>
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {announcement}
      </span>
    </div>
  );
}

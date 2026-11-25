import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { CalendarEvent } from "@estate-erp/api-client";
import {
  DraftPreviewLabel,
  draftMinutesOnDate,
  type CalendarDraftPreview,
} from "./-event-draft-preview";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  getLocalDateKey,
  isSameCalendarDate,
  startOfWeek,
  WEEK_DAY_LABELS,
} from "./-calendar-view-utils";
import {
  formatDayTitle,
  formatEventTimeRange,
  getEventColor,
  getEventSuperseded,
  withAlpha,
} from "./-event-meta";
import { OVERLAY_META, type OverlayItem } from "./-calendar-overlay";
import { MonthEventPill, OverlayPill } from "./-month-view";
import {
  addLocalDays,
  layoutMonthWeek,
  localDayNumber,
  resizeEventDate,
  shiftEventDays,
} from "./-month-grid-layout";
import type { EventTiming } from "./-use-event-timing";
import { EventTitle, eventTitleText } from "./-event-title";

const BUFFER = 8;
const WEEKS = 22;
const HEADER = 32;
const LANE = 24;
export type MonthViewport = { start: string; offset: number };
type Item = {
  id: string;
  start: string;
  end: string | null;
  allDay: boolean;
  event?: CalendarEvent;
  overlay?: OverlayItem;
};
type Gesture = {
  kind: "move" | "start" | "end" | "create";
  event?: CalendarEvent;
  source: Date;
  target: Date;
  x: number;
  y: number;
  pointerId: number;
  active: boolean;
  left: number;
  width: number;
};
type Preview = {
  event?: CalendarEvent;
  timing: EventTiming;
  from: Date;
  to: Date;
};
type Props = {
  draft?: CalendarDraftPreview | null;
  currentDate: Date;
  selectedDate: Date;
  events: CalendarEvent[];
  overlaysByDate: Map<string, OverlayItem[]>;
  selectedEventId: string | null;
  pendingId: string | null;
  navigationVersion: number;
  initialViewport?: MonthViewport;
  onViewportChange: (viewport: MonthViewport, visibleDate: Date) => void;
  onRangeChange: (range: { start: Date; end: Date }) => void;
  onCreate: (from: Date, to: Date) => void;
  onSelectEvent: (event: CalendarEvent, anchor?: HTMLElement) => void;
  onEdit: (event: CalendarEvent) => void;
  onSelectDate: (date: Date) => void;
  onOpenDay: (date: Date) => void;
  onSelectOverlay: (item: OverlayItem, anchor?: HTMLElement) => void;
  onChangeTime: (event: CalendarEvent, timing: EventTiming) => void;
  onGestureStart: () => void;
};

export function MonthCalendarView(props: Props) {
  const callbacks = useRef(props);
  callbacks.current = props;
  const initial = useRef(props.initialViewport);
  const [base, setBase] = useState(() =>
    addLocalDays(
      startOfWeek(
        initial.current
          ? new Date(initial.current.start)
          : new Date(
              props.currentDate.getFullYear(),
              props.currentDate.getMonth(),
              1,
            ),
      ),
      -BUFFER * 7,
    ),
  );
  const baseRef = useRef(base);
  baseRef.current = base;
  const [rowHeight, setRowHeight] = useState(128);
  const heightRef = useRef(rowHeight);
  const scroller = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const pendingScroll = useRef<number | null>(
    BUFFER * 128 + (initial.current?.offset ?? 0),
  );
  const lastNavigation = useRef(props.navigationVersion);
  const measured = useRef(false);
  const gesture = useRef<Gesture | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [overflowDate, setOverflowDate] = useState<string | null>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const frame = useRef(0);
  const snapFrame = useRef(0);
  const suppressUntil = useRef(0);

  function suspendSnap() {
    cancelAnimationFrame(snapFrame.current);
    if (scroller.current) scroller.current.style.scrollSnapType = "none";
  }

  function restoreSnap() {
    cancelAnimationFrame(snapFrame.current);
    // Let a viewport reset finish before the browser chooses its next snap point.
    snapFrame.current = requestAnimationFrame(() => {
      if (!gesture.current && pendingScroll.current === null)
        scroller.current?.style.removeProperty("scroll-snap-type");
    });
  }

  function cancel(message = "날짜 변경을 취소했습니다.") {
    if (!gesture.current) return;
    gesture.current = null;
    previewRef.current = null;
    setPreview(null);
    cancelAnimationFrame(frame.current);
    restoreSnap();
    if (ghost.current) ghost.current.style.display = "none";
    suppressUntil.current = performance.now() + 300;
    setAnnouncement(message);
  }

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape" && gesture.current) {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
    const blur = () => cancel();
    window.addEventListener("keydown", key, true);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", key, true);
      window.removeEventListener("blur", blur);
      cancelAnimationFrame(frame.current);
      cancelAnimationFrame(snapFrame.current);
    };
  }, []);

  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => {
      const next = Math.max(112, Math.floor(el.clientHeight / 6));
      if (!measured.current || next !== heightRef.current) suspendSnap();
      if (!measured.current) {
        measured.current = true;
        pendingScroll.current =
          BUFFER * next + Math.min(initial.current?.offset ?? 0, next - 1);
      } else {
        if (next === heightRef.current) return;
        cancel("화면 크기가 바뀌어 드래그를 취소했습니다.");
        pendingScroll.current =
          ((pendingScroll.current ?? el.scrollTop) / heightRef.current) * next;
      }
      heightRef.current = next;
      setRowHeight(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    if (lastNavigation.current === props.navigationVersion) return;
    lastNavigation.current = props.navigationVersion;
    cancel();
    suspendSnap();
    setOverflowDate(null);
    const date = callbacks.current.currentDate;
    pendingScroll.current = BUFFER * heightRef.current;
    setBase(
      addLocalDays(
        startOfWeek(new Date(date.getFullYear(), date.getMonth(), 1)),
        -BUFFER * 7,
      ),
    );
  }, [props.navigationVersion]);

  useLayoutEffect(() => {
    if (scroller.current && pendingScroll.current !== null) {
      scroller.current.scrollTop = pendingScroll.current;
      pendingScroll.current = null;
    }
    callbacks.current.onRangeChange({
      start: base,
      end: addLocalDays(base, WEEKS * 7),
    });
    restoreSnap();
  }, [base, rowHeight]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const settled = () => {
      if (!gesture.current) recenter();
    };
    // Native scrollend includes macOS momentum and the final snap animation.
    // Moving the rows earlier makes the compositor chase an obsolete offset.
    el.addEventListener("scrollend", settled);
    return () => el.removeEventListener("scrollend", settled);
  }, []);

  function handleScroll() {
    const el = scroller.current;
    if (!el || pendingScroll.current !== null) return;
    const index = Math.floor(el.scrollTop / heightRef.current);
    const first = addLocalDays(baseRef.current, index * 7);
    callbacks.current.onViewportChange(
      { start: first.toISOString(), offset: el.scrollTop % heightRef.current },
      addLocalDays(first, 3),
    );
    // Pointer-driven edge scrolling has no native momentum and needs fresh rows
    // while the drag is still active. Ordinary scrolling recenters at scrollend.
    if (gesture.current?.active) recenter();
  }

  function recenter() {
    const el = scroller.current;
    if (!el || pendingScroll.current !== null) return;
    const index = Math.floor(el.scrollTop / heightRef.current);
    if (index < 4 || index > 12) {
      // Recenter the buffered rows without the browser snapping to a removed row.
      suspendSnap();
      const shift = index - BUFFER;
      pendingScroll.current = el.scrollTop - shift * heightRef.current;
      setBase(addLocalDays(baseRef.current, shift * 7));
    }
  }

  function dateAtPointer(x: number, y: number) {
    const el = scroller.current;
    if (!el) return null;
    const bounds = el.getBoundingClientRect();
    if (
      x < bounds.left ||
      x >= bounds.right ||
      y < bounds.top ||
      y >= bounds.bottom
    )
      return null;
    const day = Math.min(
      6,
      Math.floor((x - bounds.left) / (el.clientWidth / 7)),
    );
    const week = Math.floor(
      (y - bounds.top + el.scrollTop) / heightRef.current,
    );
    return addLocalDays(baseRef.current, week * 7 + day);
  }

  function updatePointer(x: number, y: number) {
    const g = gesture.current;
    const el = scroller.current;
    if (!g || !el) return;
    const bounds = el.getBoundingClientRect();
    if (
      Math.abs(bounds.left - g.left) > 1 ||
      Math.abs(bounds.width - g.width) > 1
    ) {
      cancel("화면 크기가 바뀌어 드래그를 취소했습니다.");
      return;
    }
    if (!g.active && Math.hypot(x - g.x, y - g.y) < 5) return;
    const target = dateAtPointer(
      x,
      Math.max(bounds.top + 1, Math.min(bounds.bottom - 1, y)),
    );
    if (!target) return;
    if (!g.active) {
      el.setPointerCapture(g.pointerId);
      callbacks.current.onGestureStart();
      setOverflowDate(null);
    }
    const changed = !g.active || !isSameCalendarDate(g.target, target);
    g.active = true;
    g.target = target;
    if (ghost.current) {
      ghost.current.style.display = "block";
      ghost.current.style.transform = `translate3d(${x + 12}px, ${y + 12}px, 0)`;
    }
    if (!changed) return;
    let next: Preview;
    if (g.kind === "create") {
      const from = g.source < target ? g.source : target;
      const to = g.source < target ? target : g.source;
      next = {
        from,
        to,
        timing: {
          start: from.toISOString(),
          end: new Date(new Date(to).setHours(23, 59, 59, 0)).toISOString(),
        },
      };
    } else if (g.event) {
      const timing =
        g.kind === "move"
          ? shiftEventDays(
              g.event,
              localDayNumber(target) - localDayNumber(g.source),
            )
          : resizeEventDate(g.event, g.kind, target);
      next = {
        event: g.event,
        timing,
        from: new Date(timing.start),
        to: new Date(timing.end ?? timing.start),
      };
    } else return;
    previewRef.current = next;
    setPreview(next);
  }

  function autoScroll() {
    const el = scroller.current;
    if (!gesture.current || !el) return;
    if (gesture.current.active) {
      const bounds = el.getBoundingClientRect();
      const y = pointer.current.y;
      const delta = y < bounds.top + 44 ? -12 : y > bounds.bottom - 44 ? 12 : 0;
      if (delta) {
        el.scrollTop += delta;
        updatePointer(pointer.current.x, y);
      }
    }
    frame.current = requestAnimationFrame(autoScroll);
  }

  function begin(
    e: ReactPointerEvent<HTMLElement>,
    kind: Gesture["kind"],
    source: Date,
    event?: CalendarEvent,
  ) {
    const el = scroller.current;
    if (e.button !== 0 || props.pendingId || !el) return;
    suspendSnap();
    e.stopPropagation();
    const bounds = el.getBoundingClientRect();
    pointer.current = { x: e.clientX, y: e.clientY };
    gesture.current = {
      kind,
      event,
      source,
      target: source,
      x: e.clientX,
      y: e.clientY,
      pointerId: e.pointerId,
      active: false,
      left: bounds.left,
      width: bounds.width,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(autoScroll);
  }

  function finish(e: ReactPointerEvent) {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    const bounds = scroller.current?.getBoundingClientRect();
    if (
      bounds &&
      (Math.abs(bounds.left - g.left) > 1 ||
        Math.abs(bounds.width - g.width) > 1)
    ) {
      cancel("화면 크기가 바뀌어 드래그를 취소했습니다.");
      return;
    }
    const inside =
      bounds &&
      e.clientX >= bounds.left &&
      e.clientX < bounds.right &&
      e.clientY >= bounds.top &&
      e.clientY < bounds.bottom;
    const next = previewRef.current;
    gesture.current = null;
    previewRef.current = null;
    setPreview(null);
    cancelAnimationFrame(frame.current);
    restoreSnap();
    if (ghost.current) ghost.current.style.display = "none";
    if (!g.active) return;
    suppressUntil.current = performance.now() + 300;
    if (!inside || !next) {
      setAnnouncement("캘린더 밖으로 놓아 이동을 취소했습니다.");
      return;
    }
    if (g.kind === "create") props.onCreate(next.from, next.to);
    else if (g.event) props.onChangeTime(g.event, next.timing);
  }

  const items = useMemo(() => {
    const result: Item[] = props.events.map((event) => {
      const value =
        preview?.event?.id === event.id
          ? { ...event, ...preview.timing }
          : event;
      return { ...value, event: value };
    });
    for (const overlays of props.overlaysByDate.values())
      for (const overlay of overlays)
        result.push({
          id: `finance:${overlay.id}`,
          start: `${overlay.dateKey}T00:00:00`,
          end: `${overlay.dateKey}T23:59:59`,
          allDay: true,
          overlay,
        });
    return result;
  }, [props.events, props.overlaysByDate, preview]);
  const weeks = useMemo(
    () =>
      Array.from({ length: WEEKS }, (_, i) => {
        const date = addLocalDays(base, i * 7);
        return { date, placements: layoutMonthWeek(items, date) };
      }),
    [base, items],
  );
  const visibleLanes = Math.max(
    1,
    Math.floor((rowHeight - HEADER - 25) / LANE),
  );
  const canClick = () => performance.now() > suppressUntil.current;

  return (
    <div
      className="flex h-full min-h-0 min-w-[560px] flex-col bg-background"
      data-month-calendar
    >
      <div className="grid shrink-0 grid-cols-7 border-b bg-muted/20">
        {WEEK_DAY_LABELS.map((day, index) => (
          <div
            key={day}
            className={cn(
              "px-3 py-2 text-[11px] text-muted-foreground",
              index === 0 && "text-destructive-strong",
              index === 6 && "text-info-strong",
            )}
          >
            {day}요일
          </div>
        ))}
      </div>
      <div
        ref={scroller}
        data-month-scroll
        className="relative min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-contain"
        style={{ overflowAnchor: "none" }}
        onScroll={handleScroll}
        onPointerMove={(e) => {
          pointer.current = { x: e.clientX, y: e.clientY };
          updatePointer(e.clientX, e.clientY);
        }}
        onPointerUp={finish}
        onPointerCancel={() => cancel()}
      >
        {weeks.map(({ date: week, placements }) => (
          <div
            key={getLocalDateKey(week)}
            data-month-week={getLocalDateKey(week)}
            className="relative grid grid-cols-7"
            style={{
              height: rowHeight,
              scrollSnapAlign: "start",
              scrollSnapStop:
                week.getDate() === 1 ||
                week.getMonth() !== addLocalDays(week, 6).getMonth()
                  ? "always"
                  : "normal",
            }}
          >
            {Array.from({ length: 7 }, (_, column) => {
              const date = addLocalDays(week, column);
              const key = getLocalDateKey(date);
              const selected = isSameCalendarDate(date, props.selectedDate);
              const today = isSameCalendarDate(date, new Date());
              const inRange =
                preview &&
                !preview.event &&
                localDayNumber(date) >= localDayNumber(preview.from) &&
                localDayNumber(date) <= localDayNumber(preview.to);
              const dayItems = placements.filter(
                (p) => p.column <= column && p.column + p.span > column,
              );
              const hidden = dayItems.filter(
                (p) => p.lane >= visibleLanes,
              ).length;
              return (
                <div
                  key={key}
                  data-month-date={key}
                  className={cn(
                    "group relative select-none border-b border-r",
                    date.getMonth() !== props.currentDate.getMonth() &&
                      "bg-muted/15",
                    selected && "bg-secondary/30",
                    inRange &&
                      "bg-primary/10 ring-1 ring-inset ring-primary/40",
                    draftMinutesOnDate(props.draft, date) && "bg-primary/5",
                  )}
                >
                  <button
                    type="button"
                    className="absolute inset-0 touch-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    aria-label={`${formatDayTitle(date)} 선택`}
                    onPointerDown={(e) => begin(e, "create", date)}
                    onClick={() => {
                      if (canClick()) props.onSelectDate(date);
                    }}
                    onDoubleClick={() => {
                      if (canClick()) props.onCreate(date, date);
                    }}
                  />
                  <div className="pointer-events-none relative flex h-8 items-center justify-between px-2">
                    <button
                      type="button"
                      aria-label={`${formatDayTitle(date)} 하루 보기`}
                      className={cn(
                        "pointer-events-auto rounded px-1.5 py-0.5 text-[11px] font-medium hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                        today && "bg-foreground text-background",
                        !today &&
                          date.getMonth() !== props.currentDate.getMonth() &&
                          "text-muted-foreground",
                      )}
                      onClick={() => props.onOpenDay(date)}
                    >
                      {date.getDate() === 1
                        ? `${date.getMonth() + 1}월 1일`
                        : date.getDate()}
                    </button>
                    <button
                      type="button"
                      aria-label={`${formatDayTitle(date)}에 일정 추가`}
                      className="pointer-events-auto rounded p-1 text-muted-foreground opacity-0 hover:bg-muted focus-visible:opacity-100 group-hover:opacity-100"
                      onClick={() => props.onCreate(date, date)}
                    >
                      <Plus className="size-3" />
                    </button>
                  </div>
                  {props.draft && draftMinutesOnDate(props.draft, date) && (
                    <div className="pointer-events-none absolute inset-x-1 bottom-7 z-20">
                      <DraftPreviewLabel draft={props.draft} />
                    </div>
                  )}
                  {hidden > 0 && (
                    <Popover
                      open={overflowDate === key}
                      onOpenChange={(open) =>
                        setOverflowDate(open ? key : null)
                      }
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          data-month-overflow={key}
                          className="absolute bottom-1 left-1 z-20 rounded px-2 py-0.5 text-[11px] text-muted-foreground hover:bg-secondary"
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          +{hidden}개 더보기
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        side="right"
                        align="start"
                        className="w-72 p-3"
                        onOpenAutoFocus={(e) => e.preventDefault()}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-xs font-semibold">
                            {formatDayTitle(date)} · {dayItems.length}건
                          </span>
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:text-foreground"
                            onClick={() => {
                              setOverflowDate(null);
                              props.onOpenDay(date);
                            }}
                          >
                            하루 보기
                          </button>
                        </div>
                        <div className="max-h-72 space-y-1 overflow-y-auto">
                          {dayItems.map(({ item }) =>
                            item.event ? (
                              <MonthEventPill
                                key={item.id}
                                event={item.event}
                                onEdit={props.onEdit}
                                onSelect={(event) => {
                                  const anchor =
                                    scroller.current?.querySelector<HTMLElement>(
                                      `[data-month-overflow="${key}"]`,
                                    );
                                  setOverflowDate(null);
                                  props.onSelectEvent(
                                    event,
                                    anchor ?? undefined,
                                  );
                                }}
                              />
                            ) : item.overlay ? (
                              <OverlayPill
                                key={item.id}
                                item={item.overlay}
                                onSelect={(overlay) => {
                                  const anchor =
                                    scroller.current?.querySelector<HTMLElement>(
                                      `[data-month-overflow="${key}"]`,
                                    );
                                  setOverflowDate(null);
                                  props.onSelectOverlay(
                                    overlay,
                                    anchor ?? undefined,
                                  );
                                }}
                              />
                            ) : null,
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              );
            })}
            {placements
              .filter((p) => p.lane < visibleLanes)
              .map((p) => {
                const event = p.item.event;
                const overlay = p.item.overlay;
                const color = event
                  ? getEventColor(event)
                  : overlay
                    ? OVERLAY_META[overlay.kind].color
                    : "#888";
                const moving = preview?.event?.id === event?.id && !!event;
                const span = p.span > 1 || p.item.allDay;
                return (
                  <div
                    key={p.item.id}
                    className={cn(
                      "group/event absolute z-10 h-[21px] rounded-[4px]",
                      moving && "ring-1 ring-current shadow-sm",
                      props.pendingId === event?.id && "opacity-50",
                      // 받은 대금·정산 끝난 거래의 날짜, 매칭이 임장을 지난 앞날 임장은 기록으로만 흐리게 남긴다
                      overlay?.done && "opacity-50",
                      event && getEventSuperseded(event) && "opacity-50",
                    )}
                    style={{
                      top: HEADER + p.lane * LANE,
                      left: `calc(${(p.column / 7) * 100}% + 3px)`,
                      width: `calc(${(p.span / 7) * 100}% - 6px)`,
                      color,
                      background: span ? withAlpha(color, "20") : undefined,
                      borderLeft: `3px solid ${color}`,
                      borderRadius: `${p.continuesBefore ? 0 : 4}px ${p.continuesAfter ? 0 : 4}px ${p.continuesAfter ? 0 : 4}px ${p.continuesBefore ? 0 : 4}px`,
                    }}
                  >
                    <button
                      type="button"
                      data-calendar-event
                      data-month-event={event?.id}
                      data-month-finance={overlay?.id}
                      aria-label={
                        event
                          ? `${eventTitleText(event)} · ${formatEventTimeRange(event)}`
                          : overlay?.title
                      }
                      aria-busy={props.pendingId === event?.id}
                      title={
                        event
                          ? `${eventTitleText(event)}\n${formatEventTimeRange(event)}\n드래그: 날짜 이동 · Alt+방향키: 하루/한 주 이동`
                          : `${overlay?.title}${overlay?.done ? " · 지난 일(받음·정산 끝)" : ""} · 원본에서 날짜 변경`
                      }
                      className={cn(
                        "flex size-full touch-none items-center gap-1 overflow-hidden px-1.5 text-left text-[11px] focus-visible:ring-2 focus-visible:ring-ring",
                        event &&
                          !props.pendingId &&
                          "cursor-grab active:cursor-grabbing",
                        props.selectedEventId === event?.id &&
                          "ring-1 ring-inset ring-current",
                      )}
                      onPointerDown={(e) => {
                        if (event)
                          begin(
                            e,
                            "move",
                            dateAtPointer(e.clientX, e.clientY) ??
                              addLocalDays(week, p.column),
                            event,
                          );
                      }}
                      onClick={(e) => {
                        if (!canClick()) return;
                        if (event) props.onSelectEvent(event, e.currentTarget);
                        else if (overlay)
                          props.onSelectOverlay(overlay, e.currentTarget);
                      }}
                      onDoubleClick={() => {
                        if (event && canClick()) props.onEdit(event);
                      }}
                      onKeyDown={(e) => {
                        if (!event || !e.altKey || props.pendingId) return;
                        const delta = (
                          {
                            ArrowLeft: -1,
                            ArrowRight: 1,
                            ArrowUp: -7,
                            ArrowDown: 7,
                          } as Record<string, number>
                        )[e.key];
                        if (!delta) return;
                        e.preventDefault();
                        e.stopPropagation();
                        props.onChangeTime(event, shiftEventDays(event, delta));
                      }}
                    >
                      {!p.item.allDay && !p.continuesBefore && (
                        <span className="shrink-0 text-[10px] tabular-nums opacity-80">
                          {new Date(p.item.start).toLocaleTimeString("ko-KR", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </span>
                      )}
                      <span className="truncate font-medium text-foreground">
                        {p.continuesBefore ? "↤ " : ""}
                        {event ? <EventTitle event={event} /> : overlay?.title}
                        {p.continuesAfter ? " ↦" : ""}
                      </span>
                    </button>
                    {event &&
                      (["start", "end"] as const).map((edge) =>
                        (
                          edge === "start"
                            ? p.continuesBefore
                            : p.continuesAfter
                        ) ? null : (
                          <button
                            key={edge}
                            type="button"
                            aria-label={`${event.title} ${edge === "start" ? "시작" : "종료"} 날짜 조절`}
                            disabled={!!props.pendingId}
                            className={cn(
                              "absolute top-0 h-full w-2 touch-none cursor-ew-resize opacity-0 hover:bg-current/20 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover/event:opacity-100",
                              edge === "start" ? "-left-1" : "-right-1",
                            )}
                            onPointerDown={(e) =>
                              begin(
                                e,
                                edge,
                                addLocalDays(
                                  week,
                                  edge === "start"
                                    ? p.column
                                    : p.column + p.span - 1,
                                ),
                                event,
                              )
                            }
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (!["ArrowLeft", "ArrowRight"].includes(e.key))
                                return;
                              e.preventDefault();
                              e.stopPropagation();
                              const date =
                                edge === "start"
                                  ? new Date(event.start)
                                  : new Date(
                                      event.end
                                        ? Date.parse(event.end) - 1
                                        : Date.parse(event.start),
                                    );
                              props.onChangeTime(
                                event,
                                resizeEventDate(
                                  event,
                                  edge,
                                  addLocalDays(
                                    date,
                                    e.key === "ArrowLeft" ? -1 : 1,
                                  ),
                                ),
                              );
                            }}
                          />
                        ),
                      )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
      <div
        ref={ghost}
        className="pointer-events-none fixed left-0 top-0 z-50 hidden max-w-64 rounded-md border bg-background/95 px-3 py-2 text-xs shadow-lg"
        aria-hidden="true"
      >
        <div className="truncate font-medium">
          {preview?.event?.title ?? "새 종일 일정"}
        </div>
        {preview && (
          <div className="mt-1 text-muted-foreground">
            {formatDayTitle(preview.from)} → {formatDayTitle(preview.to)} · Esc
            취소
          </div>
        )}
      </div>
      <span role="status" aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}

import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CalendarPlus2,
  Landmark,
  Link2,
  Pencil,
  Plus,
  UserRound,
} from "lucide-react";
import type { CalendarEvent } from "@estate-erp/api-client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntityChip } from "@/components/domain";
import {
  buildMonthCells,
  isSameCalendarDate,
  WEEK_DAY_LABELS,
} from "./-calendar-view-utils";
import {
  formatDayTitle,
  formatEventContext,
  formatEventTimeRange,
  formatWeekday,
  getEventColor,
  getEventMeta,
  getEventStatus,
  withAlpha,
} from "./-event-meta";
import { OVERLAY_META, type OverlayItem } from "./-calendar-overlay";
import {
  LINK_KIND_LABEL,
  linksFromEvent,
  type EventLinkKind,
  type LinkedEntity,
} from "./-event-link-picker";

export function MonthCalendarView({
  currentDate,
  selectedDate,
  eventsByDate,
  overlaysByDate,
  onCreate,
  onSelectEvent,
  onEdit,
  onSelectDate,
}: {
  currentDate: Date;
  selectedDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  overlaysByDate: Map<string, OverlayItem[]>;
  onCreate: (date: Date) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onEdit: (event: CalendarEvent) => void;
  onSelectDate: (date: Date) => void;
}) {
  const cells = buildMonthCells(currentDate);

  return (
    <div className="min-w-[720px] overflow-hidden rounded-lg border border-border bg-background">
      <div className="grid grid-cols-7 border-b border-border bg-muted/35">
        {WEEK_DAY_LABELS.map((day, index) => (
          <div
            key={day}
            className={cn(
              "px-3 py-2 text-[11px] font-medium text-muted-foreground",
              index === 0 && "text-destructive-strong",
              index === 6 && "text-info-strong",
            )}
          >
            {day}요일
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 content-start [grid-auto-rows:minmax(104px,max-content)]">
        {cells.map((cell) => {
          const dayEvents = eventsByDate.get(cell.key) ?? [];
          const dayOverlays = overlaysByDate.get(cell.key) ?? [];
          const isSelected = isSameCalendarDate(selectedDate, cell.date);
          const isToday = isSameCalendarDate(new Date(), cell.date);

          return (
            <div
              key={cell.key}
              data-calendar-day
              className={cn(
                "group relative min-h-28 border-b border-r border-border bg-background p-2 transition-colors",
                isSelected ? "bg-secondary/55" : "hover:bg-muted/35",
                cell.isOutsideMonth && "bg-muted/20",
              )}
            >
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => onSelectDate(cell.date)}
                  className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  aria-label={`${formatDayTitle(cell.date)} 선택`}
                >
                  <span
                    className={cn(
                      "inline-flex size-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                      isToday && "bg-foreground text-background",
                      !isToday &&
                        isSelected &&
                        "bg-background text-foreground ring-1 ring-border",
                      !isToday &&
                        cell.isOutsideMonth &&
                        "text-muted-foreground/55",
                      !isToday &&
                        !isSelected &&
                        !cell.isOutsideMonth &&
                        "text-foreground",
                    )}
                  >
                    {cell.date.getDate()}
                  </span>
                </button>

                <div className="flex items-center gap-1">
                  {dayEvents.length > 0 ? (
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {dayEvents.length}건
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => {
                      onSelectDate(cell.date);
                      onCreate(cell.date);
                    }}
                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[opacity,background-color,color] hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 group-hover:opacity-100"
                    aria-label={`${formatDayTitle(cell.date)}에 일정 추가`}
                    title="이 날짜에 일정 추가"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>

              <div className="mt-1.5 space-y-1">
                {dayEvents.slice(0, 3).map((event) => (
                  <MonthEventPill
                    key={event.id}
                    event={event}
                    onSelect={onSelectEvent}
                    onEdit={onEdit}
                  />
                ))}
                {dayEvents.length > 3 ? (
                  <button
                    type="button"
                    onClick={() => onSelectDate(cell.date)}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    +{dayEvents.length - 3}개 더보기
                  </button>
                ) : null}
                {dayOverlays.slice(0, 1).map((item) => (
                  <OverlayPill key={item.id} item={item} />
                ))}
                {dayOverlays.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onSelectDate(cell.date)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    +{dayOverlays.length - 1}건 재무
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MonthEventPill({
  event,
  onSelect,
  onEdit,
}: {
  event: CalendarEvent;
  onSelect: (event: CalendarEvent) => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const color = getEventColor(event);

  return (
    <button
      type="button"
      title={`${formatEventTimeRange(event)} · ${event.title} · 더블클릭하여 수정`}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onSelect(event);
      }}
      onDoubleClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onEdit(event);
      }}
      className="block w-full rounded-[5px] border-l-2 px-2 py-1 text-left transition-[background-color,filter] hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      style={{
        backgroundColor: withAlpha(color, "14"),
        borderLeftColor: color,
      }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate text-[11px] font-semibold text-foreground">
          {event.title}
        </span>
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
      title={`${item.title}${item.sublabel ? ` · ${item.sublabel}` : ""}`}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        void navigate({ to: meta.link });
      }}
      className="block w-full rounded-[5px] border border-dashed px-2 py-1 text-left transition-[background-color,filter] hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      style={{
        borderColor: withAlpha(meta.color, "66"),
        backgroundColor: withAlpha(meta.color, "0D"),
      }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <Landmark className="size-3 shrink-0" style={{ color: meta.color }} />
        <span
          className="min-w-0 truncate text-[11px] font-medium"
          style={{ color: meta.color }}
        >
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
  selectedEvent,
  onCreate,
  onSelectEvent,
  onClearSelectedEvent,
  onEdit,
}: {
  selectedDate: Date;
  selectedDateEvents: CalendarEvent[];
  selectedDateOverlays: OverlayItem[];
  selectedEvent: CalendarEvent | null;
  onCreate: (date: Date) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onClearSelectedEvent: () => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const navigate = useNavigate();

  return (
    <aside className="hidden w-[312px] shrink-0 flex-col border-l border-border bg-muted/15 xl:flex 2xl:w-[328px]">
      {selectedEvent ? (
        <SelectedEventInspector
          event={selectedEvent}
          selectedDate={selectedDate}
          onBack={onClearSelectedEvent}
          onEdit={onEdit}
        />
      ) : (
        <>
          <div className="border-b border-border px-5 pb-4 pt-5">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex size-11 shrink-0 items-center justify-center rounded-lg bg-secondary text-xl font-semibold tabular-nums text-foreground",
                  isSameCalendarDate(new Date(), selectedDate) &&
                    "bg-foreground text-background",
                )}
              >
                {selectedDate.getDate()}
              </div>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-sm font-semibold text-foreground">
                    {formatWeekday(selectedDate)}
                  </h2>
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
              <span>
                {selectedDateEvents.length > 0
                  ? "시간순으로 정렬됨"
                  : "비어 있음"}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {selectedDateEvents.length === 0 &&
            selectedDateOverlays.length === 0 ? (
              <div className="flex h-full min-h-56 flex-col items-center justify-center px-8 text-center">
                <div className="flex size-10 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <CalendarDays className="size-[18px]" />
                </div>
                <div className="mt-3 text-sm font-medium text-foreground">
                  비어 있는 날입니다
                </div>
                <p className="mt-1 break-keep text-xs leading-5 text-muted-foreground">
                  방문, 미팅, 계약 일정을 추가하면 이곳에 시간순으로 표시됩니다.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  onClick={() => onCreate(selectedDate)}
                >
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
                    onClick={() => onSelectEvent(event)}
                    onDoubleClick={() => onEdit(event)}
                    className="group flex w-full items-start gap-3 border-b border-border bg-background px-5 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
                    title="상세 보기 · 더블클릭하여 수정"
                  >
                    <span
                      className="mt-1.5 size-2 shrink-0 rounded-full ring-4 ring-background"
                      style={{ backgroundColor: getEventColor(event) }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[10px] tabular-nums text-muted-foreground">
                        {formatEventTimeRange(event)}
                      </span>
                      <span className="mt-1 block truncate text-[13px] font-semibold text-foreground">
                        {event.title}
                      </span>
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
                      <Landmark
                        className="mt-0.5 size-4 shrink-0"
                        style={{ color: meta.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-foreground">
                          {item.title}
                        </span>
                        {item.sublabel ? (
                          <span className="mt-0.5 block truncate text-[11px] tabular-nums text-muted-foreground">
                            {item.sublabel}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        {meta.link === "/contracts" ? "계약 보기" : "수금 보기"}
                      </span>
                    </button>
                  );
                })}
              </>
            )}
          </div>

          <div className="border-t border-border bg-background p-3">
            <Button
              variant="secondary"
              className="w-full justify-start"
              onClick={() => onCreate(selectedDate)}
            >
              <CalendarPlus2 className="size-4" />이 날짜에 일정 추가
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}

function SelectedEventInspector({
  event,
  selectedDate,
  onBack,
  onEdit,
}: {
  event: CalendarEvent;
  selectedDate: Date;
  onBack: () => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const navigate = useNavigate();
  const meta = getEventMeta(event);
  const status = getEventStatus(event);
  const linkedItems = Object.entries(linksFromEvent(event)) as Array<
    [EventLinkKind, LinkedEntity | null]
  >;
  const hasLinks = linkedItems.some(([, value]) => value !== null);
  const dateLabel = new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(event.start));

  return (
    <>
      <div className="border-b border-border bg-background px-5 pb-5 pt-4">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 flex h-8 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          <ArrowLeft className="size-3.5" />
          {formatDayTitle(selectedDate)} 일정
        </button>

        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Badge
            variant="secondary"
            className="gap-1.5 rounded-md px-2 py-1 text-[10px]"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: getEventColor(event) }}
            />
            {meta.label}
          </Badge>
          <Badge
            className={cn(
              "rounded-md border-0 px-2 py-1 text-[10px]",
              status.className,
            )}
          >
            {status.label}
          </Badge>
        </div>

        <h2 className="mt-3 break-words text-lg font-semibold leading-7 tracking-[-0.02em] text-foreground">
          {event.title}
        </h2>
        <div className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <CalendarClock className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="block font-medium text-foreground">
              {dateLabel}
            </span>
            <span className="tabular-nums">{formatEventTimeRange(event)}</span>
          </span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section className="border-b border-border px-5 py-4">
          <h3 className="text-[10px] font-semibold tracking-[0.05em] text-muted-foreground">
            DETAILS
          </h3>
          <div className="mt-3 space-y-3">
            <div className="flex items-start gap-2.5 text-xs">
              <UserRound className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="text-[10px] text-muted-foreground">담당자</div>
                <div className="mt-0.5 truncate font-medium text-foreground">
                  {event.user?.name ?? "담당자 정보 없음"}
                </div>
              </div>
            </div>

            {event.description ? (
              <div className="rounded-md bg-muted/50 px-3 py-2.5 text-xs leading-5 text-foreground">
                <p className="whitespace-pre-wrap break-words">
                  {event.description}
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                등록된 설명이 없습니다.
              </p>
            )}
          </div>
        </section>

        <section className="px-5 py-4">
          <div className="flex items-center gap-2">
            <Link2 className="size-3.5 text-muted-foreground" />
            <h3 className="text-[10px] font-semibold tracking-[0.05em] text-muted-foreground">
              CRM CONTEXT
            </h3>
          </div>
          {hasLinks ? (
            <div className="mt-3 flex flex-col items-start gap-2">
              {linkedItems.map(([kind, link]) => {
                if (!link) return null;
                if (kind === "match") {
                  return (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => void navigate({ to: "/matches" })}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background py-1 pr-2.5 pl-2 text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    >
                      <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium text-foreground">
                        {link.label}
                      </span>
                    </button>
                  );
                }

                return (
                  <div key={kind} className="min-w-0 max-w-full">
                    <div className="mb-1 text-[10px] text-muted-foreground">
                      {LINK_KIND_LABEL[kind]}
                    </div>
                    <EntityChip
                      kind={kind}
                      id={link.id}
                      label={link.label}
                      sublabel={link.sublabel ?? undefined}
                      propertyId={link.propertyId ?? undefined}
                      className="max-w-full"
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="mt-3 rounded-md bg-muted/40 px-3 py-3 text-[11px] leading-5 text-muted-foreground">
              연결된 연락처나 매물이 없습니다. 수정 화면에서 CRM 문맥을 연결할
              수 있습니다.
            </div>
          )}
        </section>
      </div>

      <div className="border-t border-border bg-background p-3">
        <Button className="w-full justify-start" onClick={() => onEdit(event)}>
          <Pencil className="size-4" />
          일정 수정
        </Button>
      </div>
    </>
  );
}

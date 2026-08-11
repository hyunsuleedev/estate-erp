import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarClock,
  CalendarDays,
  CalendarPlus2,
  Landmark,
  Link2,
  PanelRightClose,
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
  formatTime,
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
  onOpenDate,
  onSelectOverlay,
}: {
  currentDate: Date;
  selectedDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  overlaysByDate: Map<string, OverlayItem[]>;
  onCreate: (date: Date) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onEdit: (event: CalendarEvent) => void;
  onSelectDate: (date: Date) => void;
  onOpenDate: (date: Date) => void;
  onSelectOverlay: (item: OverlayItem) => void;
}) {
  const cells = buildMonthCells(currentDate);

  return (
    <div className="flex min-h-full min-w-[720px] flex-col overflow-hidden bg-background">
      <div className="grid shrink-0 grid-cols-7 border-b border-border bg-muted/35">
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

      <div className="grid flex-1 grid-cols-7 [grid-auto-rows:minmax(112px,1fr)]">
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
                "group relative min-h-28 select-none border-b border-r border-border bg-background p-2 transition-colors",
                isSelected ? "bg-secondary/55" : "hover:bg-muted/35",
                cell.isOutsideMonth && "bg-muted/20",
              )}
            >
              <button
                type="button"
                data-calendar-cell-trigger
                onClick={() => onOpenDate(cell.date)}
                aria-label={`${formatDayTitle(cell.date)} 일정 보기`}
                aria-pressed={isSelected}
                className="absolute inset-0 z-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/50"
              />

              <div className="pointer-events-none relative z-10 flex items-center justify-between gap-1">
                <span
                  aria-hidden="true"
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
                    className="pointer-events-auto flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[opacity,background-color,color] hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 group-hover:opacity-100"
                    aria-label={`${formatDayTitle(cell.date)}에 일정 추가`}
                    title="이 날짜에 일정 추가"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>

              <div className="pointer-events-none relative z-10 mt-1.5 space-y-1">
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
                    onClick={() => onOpenDate(cell.date)}
                    className="pointer-events-auto rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    +{dayEvents.length - 3}개 더보기
                  </button>
                ) : null}
                {dayOverlays.slice(0, 1).map((item) => (
                  <OverlayPill
                    key={item.id}
                    item={item}
                    onSelect={onSelectOverlay}
                  />
                ))}
                {dayOverlays.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => onOpenDate(cell.date)}
                    className="pointer-events-auto rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-secondary hover:text-foreground"
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
      className="pointer-events-auto block w-full rounded-[5px] border-l-2 px-2 py-1 text-left transition-[background-color,filter] hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
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

/** 계약일/중도금일/잔금일/수금예정 자동 표시 pill — 클릭 시 상세 팝업 표시 */
export function OverlayPill({
  item,
  onSelect,
}: {
  item: OverlayItem;
  onSelect: (item: OverlayItem) => void;
}) {
  const meta = OVERLAY_META[item.kind];

  return (
    <button
      type="button"
      title={`${item.title}${item.sublabel ? ` · ${item.sublabel}` : ""}`}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onSelect(item);
      }}
      className="pointer-events-auto block w-full rounded-[5px] border-l-2 px-2 py-1 text-left transition-[background-color,filter] hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      style={{
        borderLeftColor: meta.color,
        backgroundColor: withAlpha(meta.color, "14"),
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
  isOpen,
  onClose,
  selectedDate,
  selectedDateEvents,
  selectedDateOverlays,
  selectedEvent,
  onCreate,
  onSelectEvent,
  onClearSelectedEvent,
  onEdit,
  onSelectOverlay,
}: {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  selectedDateEvents: CalendarEvent[];
  selectedDateOverlays: OverlayItem[];
  selectedEvent: CalendarEvent | null;
  onCreate: (date: Date) => void;
  onSelectEvent: (event: CalendarEvent) => void;
  onClearSelectedEvent: () => void;
  onEdit: (event: CalendarEvent) => void;
  onSelectOverlay: (item: OverlayItem) => void;
}) {
  return (
    <aside
      id="calendar-details-panel"
      aria-label="선택한 날짜의 일정"
      aria-hidden={!isOpen}
      className={cn(
        "hidden w-[312px] shrink-0 flex-col border-l border-border bg-muted/15 2xl:w-[328px]",
        isOpen && "xl:flex",
      )}
    >
      {selectedEvent ? (
        <SelectedEventInspector
          event={selectedEvent}
          selectedDate={selectedDate}
          onBack={onClearSelectedEvent}
          onClose={onClose}
          onEdit={onEdit}
        />
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-border px-5 py-3.5">
            <h2 className="min-w-0 truncate text-[13.5px] font-bold text-foreground">
              {formatDayTitle(selectedDate)} {formatWeekday(selectedDate)}
            </h2>
            {isSameCalendarDate(new Date(), selectedDate) ? (
              <span className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                오늘
              </span>
            ) : null}
            <span className="ml-auto shrink-0 text-[11px] tabular-nums text-muted-foreground">
              {selectedDateEvents.length + selectedDateOverlays.length}건
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-mr-2 size-8"
              onClick={onClose}
              aria-label="오른쪽 패널 접기"
              aria-expanded={true}
              aria-controls="calendar-details-panel"
              title="오른쪽 패널 접기"
            >
              <PanelRightClose className="size-4" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {selectedDateEvents.length === 0 &&
            selectedDateOverlays.length === 0 ? (
              <div className="flex h-full min-h-44 flex-col items-center justify-center px-8 text-center">
                <div className="flex size-9 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <CalendarDays className="size-4" />
                </div>
                <div className="mt-3 text-[13px] font-medium text-foreground">
                  비어 있는 날입니다
                </div>
                <p className="mt-1 break-keep text-xs leading-5 text-muted-foreground">
                  일정을 추가하면 이곳에 시간순으로 표시됩니다.
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2"
                  onClick={() => onCreate(selectedDate)}
                >
                  <Plus className="size-3.5" /> 일정 추가
                </Button>
              </div>
            ) : (
              <div className="px-5 py-2">
                {selectedDateEvents.map((event) => {
                  const color = getEventColor(event);
                  const eventStart = new Date(event.start);
                  const eventEnd = event.end ? new Date(event.end) : null;
                  const isMultiDay =
                    eventEnd !== null &&
                    !isSameCalendarDate(eventStart, eventEnd);
                  return (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onSelectEvent(event)}
                      onDoubleClick={() => onEdit(event)}
                      className="flex w-full items-center gap-2.5 border-b border-border/60 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
                      title={`${formatEventTimeRange(event)} · 상세 보기 · 더블클릭하여 수정`}
                    >
                      <span className="w-14 shrink-0">
                        <span
                          className="block text-[11px] font-semibold tabular-nums"
                          style={{ color }}
                        >
                          {event.allDay ? "종일" : formatTime(event.start)}
                        </span>
                        {eventEnd && (isMultiDay || !event.allDay) ? (
                          <span className="block text-[10px] tabular-nums text-muted-foreground">
                            {isMultiDay
                              ? `→ ${eventEnd.getMonth() + 1}/${eventEnd.getDate()}`
                              : `~${formatTime(event.end as string)}`}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className="h-4 w-[2.5px] shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-foreground">
                          {event.title}
                        </span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {formatEventContext(event)}
                        </span>
                      </span>
                    </button>
                  );
                })}

                {selectedDateOverlays.length > 0 ? (
                  <div className="pb-1 pt-3 text-[11px] font-semibold text-muted-foreground">
                    재무
                  </div>
                ) : null}
                {selectedDateOverlays.map((item) => {
                  const meta = OVERLAY_META[item.kind];
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectOverlay(item)}
                      className="flex w-full items-center gap-2.5 border-b border-border/60 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40"
                    >
                      <Landmark
                        className="size-4 shrink-0"
                        style={{ color: meta.color }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] text-foreground">
                          {item.title}
                        </span>
                        {item.sublabel ? (
                          <span className="block truncate text-[11px] tabular-nums text-muted-foreground">
                            {item.sublabel}
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-[10px] text-muted-foreground">
                        상세 보기
                      </span>
                    </button>
                  );
                })}
              </div>
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
  onClose,
  onEdit,
}: {
  event: CalendarEvent;
  selectedDate: Date;
  onBack: () => void;
  onClose: () => void;
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
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onBack}
            className="-ml-2 flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ArrowLeft className="size-3.5 shrink-0" />
            <span className="truncate">{formatDayTitle(selectedDate)} 일정</span>
          </button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-mr-2 size-8"
            onClick={onClose}
            aria-label="오른쪽 패널 접기"
            aria-expanded={true}
            aria-controls="calendar-details-panel"
            title="오른쪽 패널 접기"
          >
            <PanelRightClose className="size-4" />
          </Button>
        </div>

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
          <h3 className="text-[11px] font-semibold text-muted-foreground">
            상세
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
            <h3 className="text-[11px] font-semibold text-muted-foreground">
              CRM 연결
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

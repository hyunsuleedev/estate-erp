import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarPlus2,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  PanelRightOpen,
} from "lucide-react";
import type { CalendarEvent } from "@estate-erp/api-client";

import { api } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar as MiniCalendar } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { EmptyState, FilterSelect } from "@/components/domain";
import {
  addCalendarPeriod,
  getCalendarRange,
  getLocalDateKey,
  getMonthDates,
  getWeekDates,
  groupEventsByDate,
  type CalendarViewMode,
} from "./-calendar-view-utils";
import {
  EVENT_TYPE_META,
  formatDateRange,
  formatFullDate,
  formatMonthTitle,
} from "./-event-meta";
import { useCalendarOverlays, type OverlayItem } from "./-calendar-overlay";
import { EventDialog } from "./-event-dialog";
import { CalendarOverlayDetailDialog } from "./-overlay-detail-dialog";
import { MonthCalendarView, SelectedDayPanel } from "./-month-view";
import { TimeGridCalendarView } from "./-time-grid-view";
import { AgendaCalendarView } from "./-agenda-view";

const viewOptions: Array<{ value: CalendarViewMode; label: string }> = [
  { value: "month", label: "월" },
  { value: "week", label: "주" },
  { value: "day", label: "일" },
  { value: "agenda", label: "일정" },
];

const EMPTY_CALENDAR_EVENTS: CalendarEvent[] = [];
const EMPTY_OVERLAYS_BY_DATE = new Map<string, OverlayItem[]>();

/** 서버 findAll이 start 기준으로만 필터하므로, 범위 이전에 시작해 범위에 걸치는 멀티데이 이벤트를 위해 조회 시작을 당긴다. */
const MULTI_DAY_LOOKBACK_MS = 31 * 86_400_000;

export const Route = createFileRoute("/_authenticated/calendar/")({
  component: CalendarPage,
});

function CalendarPage() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<CalendarViewMode>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [userFilter, setUserFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [isMineOnly, setIsMineOnly] = useState(false);
  const [showFinance, setShowFinance] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogEvent, setDialogEvent] = useState<CalendarEvent | null>(null);
  const [dialogDefaultDate, setDialogDefaultDate] = useState(new Date());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedOverlay, setSelectedOverlay] = useState<OverlayItem | null>(null);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);

  const range = useMemo(
    () => getCalendarRange(currentDate, viewMode),
    [currentDate, viewMode],
  );
  const fetchStart = new Date(
    range.start.getTime() - MULTI_DAY_LOOKBACK_MS,
  ).toISOString();
  const fetchEnd = range.end.toISOString();

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.employees.findAll(),
  });

  const effectiveUserId = isMineOnly
    ? (user?.id ?? undefined)
    : userFilter || undefined;

  const eventsQuery = useQuery({
    queryKey: [
      "calendar-events",
      {
        start: fetchStart,
        end: fetchEnd,
        userId: effectiveUserId ?? "",
        type: typeFilter,
      },
    ],
    queryFn: () =>
      api.calendarEvents.findAll({
        start: fetchStart,
        end: fetchEnd,
        userId: effectiveUserId,
        type: typeFilter || undefined,
      }),
    placeholderData: keepPreviousData,
  });

  const overlay = useCalendarOverlays(showFinance);

  const events = useMemo(() => {
    const raw = eventsQuery.data ?? EMPTY_CALENDAR_EVENTS;
    return raw.filter((event) => {
      const eventEnd = event.end ? new Date(event.end) : new Date(event.start);
      return eventEnd >= range.start;
    });
  }, [eventsQuery.data, range.start]);

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const overlaysByDate = showFinance
    ? overlay.overlaysByDate
    : EMPTY_OVERLAYS_BY_DATE;
  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const agendaDates = useMemo(() => getMonthDates(currentDate), [currentDate]);
  const timeGridDates = viewMode === "day" ? [currentDate] : weekDates;
  const selectedDateEvents =
    eventsByDate.get(getLocalDateKey(selectedDate)) ?? EMPTY_CALENDAR_EVENTS;
  const selectedEvent = selectedEventId
    ? (events.find((event) => event.id === selectedEventId) ?? null)
    : null;

  const rangeLabel =
    viewMode === "agenda"
      ? `${formatMonthTitle(currentDate)} 전체`
      : formatDateRange(range.start, range.end);
  const headerTitle =
    viewMode === "agenda"
      ? `${formatMonthTitle(currentDate)} 일정`
      : viewMode === "day"
        ? formatFullDate(currentDate)
        : formatMonthTitle(currentDate);

  const handleOpenCreate = (date: Date) => {
    setDialogEvent(null);
    setDialogDefaultDate(date);
    setSelectedDate(date);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (event: CalendarEvent) => {
    setSelectedEventId(event.id);
    setDialogEvent(event);
    setIsDialogOpen(true);
  };

  const handleSelectEvent = (event: CalendarEvent) => {
    setSelectedDate(new Date(event.start));
    setSelectedEventId(event.id);
    if (window.matchMedia("(min-width: 1280px)").matches) {
      setIsRightPanelOpen(true);
      return;
    }

    handleOpenEdit(event);
  };

  const handleSelectOverlay = (item: OverlayItem) => {
    const overlayDate = new Date(`${item.dateKey}T00:00:00`);
    if (!Number.isNaN(overlayDate.getTime())) {
      setSelectedDate(overlayDate);
    }
    setSelectedEventId(null);
    setSelectedOverlay(item);
  };

  const handleSelectDate = (date: Date) => {
    setSelectedDate(date);
    setSelectedEventId(null);

    if (viewMode === "month" && date.getMonth() !== currentDate.getMonth()) {
      setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1));
      return;
    }

    if (viewMode !== "month") {
      setCurrentDate(date);
    }
  };

  const handleOpenDatePanel = (date: Date) => {
    handleSelectDate(date);
    setIsRightPanelOpen(true);
  };

  const handleNavigate = (direction: -1 | 1) => {
    const nextDate = addCalendarPeriod(currentDate, viewMode, direction);
    setCurrentDate(nextDate);
    setSelectedDate(nextDate);
    setSelectedEventId(null);
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
    setSelectedEventId(null);
  };

  const handleViewChange = (value: string) => {
    const nextViewMode = value as CalendarViewMode;
    setViewMode(nextViewMode);
    setSelectedEventId(null);

    if (nextViewMode !== "month") {
      setCurrentDate(selectedDate);
    }
  };

  const handleMiniCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setCurrentDate(date);
    setSelectedEventId(null);
  };

  // 키보드 단축키 — T(오늘) / N(새 일정) / J·←(이전) / K·→(다음)
  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (isDialogOpen) return;
      if (keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey) return;
      const target = keyEvent.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      switch (keyEvent.key.toLowerCase()) {
        case "t":
          handleToday();
          break;
        case "n":
          keyEvent.preventDefault();
          handleOpenCreate(selectedDate);
          break;
        case "j":
        case "arrowleft":
          handleNavigate(-1);
          break;
        case "k":
        case "arrowright":
          handleNavigate(1);
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDialogOpen, selectedDate, currentDate, viewMode]);

  return (
    <div
      data-calendar-page
      className="-m-4 flex min-h-0 flex-1 overflow-hidden bg-background"
    >
      <CalendarWorkspaceRail
        currentDate={currentDate}
        selectedDate={selectedDate}
        typeFilter={typeFilter}
        isMineOnly={isMineOnly}
        showFinance={showFinance}
        onCreate={() => handleOpenCreate(selectedDate)}
        onSelectDate={handleMiniCalendarSelect}
        onMonthChange={(date) => {
          setCurrentDate(date);
          setSelectedEventId(null);
        }}
        onTypeFilterChange={setTypeFilter}
        onMineOnlyChange={setIsMineOnly}
        onShowFinanceChange={setShowFinance}
      />

      <section className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-5 py-3">
          <div className="flex min-w-0 items-baseline gap-2.5">
            <h1 className="truncate text-[17px] font-bold tracking-[-0.02em] text-foreground">
              {headerTitle}
            </h1>
            <span
              className="whitespace-nowrap text-[11px] tabular-nums text-muted-foreground"
              title={`${rangeLabel} · ${events.length}건`}
            >
              <span className="hidden md:inline">{rangeLabel} · </span>
              {events.length}건
            </span>
          </div>

          <div className="flex h-8 items-center rounded-lg bg-muted p-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7"
              onClick={() => handleNavigate(-1)}
              aria-label="이전 기간"
              title="이전 기간 (J)"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={handleToday}
              title="오늘로 이동 (T)"
            >
              오늘
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-7"
              onClick={() => handleNavigate(1)}
              aria-label="다음 기간"
              title="다음 기간 (K)"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div
            role="tablist"
            aria-label="캘린더 보기"
            className="flex h-8 items-center rounded-lg bg-muted p-0.5"
          >
            {viewOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={viewMode === option.value}
                onClick={() => handleViewChange(option.value)}
                className={cn(
                  "h-7 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  viewMode === option.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="min-w-2 flex-1" />

          <div className="flex flex-wrap items-center gap-2">
            <div className={cn(isMineOnly && "pointer-events-none opacity-50")}>
              <FilterSelect
                label="담당자"
                value={userFilter}
                onChange={setUserFilter}
                options={employees.map((employee) => ({
                  value: employee.id,
                  label: employee.name,
                }))}
              />
            </div>
            <div className="flex items-center gap-2 min-[1500px]:hidden">
              <FilterSelect
                label="유형"
                value={typeFilter}
                onChange={setTypeFilter}
                options={Object.entries(EVENT_TYPE_META).map(([key, meta]) => ({
                  value: key,
                  label: meta.label,
                }))}
              />
              <label className="flex h-8 items-center gap-2 rounded-md bg-muted px-2.5 text-[11px] text-muted-foreground">
                <Switch
                  size="sm"
                  checked={isMineOnly}
                  onCheckedChange={setIsMineOnly}
                />
                내 일정
              </label>
              <label className="flex h-8 items-center gap-2 rounded-md bg-muted px-2.5 text-[11px] text-muted-foreground">
                <Switch
                  size="sm"
                  checked={showFinance}
                  onCheckedChange={setShowFinance}
                />
                재무
              </label>
            </div>
            <Button
              size="sm"
              className="h-8"
              onClick={() => handleOpenCreate(selectedDate)}
              title="새 일정 (N)"
            >
              <CalendarPlus2 className="size-4" />새 일정
            </Button>
            {!isRightPanelOpen ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="hidden size-8 xl:inline-flex"
                onClick={() => setIsRightPanelOpen(true)}
                aria-label="오른쪽 패널 펼치기"
                aria-expanded={false}
                aria-controls="calendar-details-panel"
                title="오른쪽 패널 펼치기"
              >
                <PanelRightOpen className="size-4" />
              </Button>
            ) : null}
          </div>
        </header>

        {showFinance && overlay.isError ? (
          <div className="shrink-0 border-b border-border bg-destructive-soft px-5 py-1.5 text-[11px] text-destructive">
            재무 일정을 불러오지 못했습니다.
          </div>
        ) : null}

        <main className="min-h-0 flex-1 overflow-auto">
          {eventsQuery.isLoading ? (
            <CalendarSkeleton viewMode={viewMode} />
          ) : eventsQuery.isError ? (
            <div className="flex h-full items-center justify-center bg-background py-8">
              <EmptyState
                icon={CalendarX2}
                title="일정을 불러오지 못했습니다"
                description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
                action={
                  <Button
                    variant="outline"
                    onClick={() => void eventsQuery.refetch()}
                  >
                    다시 시도
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              {viewMode === "month" ? (
                <MonthCalendarView
                  currentDate={currentDate}
                  selectedDate={selectedDate}
                  eventsByDate={eventsByDate}
                  overlaysByDate={overlaysByDate}
                  onCreate={handleOpenCreate}
                  onSelectEvent={handleSelectEvent}
                  onEdit={handleOpenEdit}
                  onSelectDate={handleSelectDate}
                  onOpenDate={handleOpenDatePanel}
                  onSelectOverlay={handleSelectOverlay}
                />
              ) : null}

              {viewMode === "week" || viewMode === "day" ? (
                <TimeGridCalendarView
                  dates={timeGridDates}
                  eventsByDate={eventsByDate}
                  onCreate={handleOpenCreate}
                  onSelectEvent={handleSelectEvent}
                  onEdit={handleOpenEdit}
                  selectedDate={selectedDate}
                  onSelectDate={handleSelectDate}
                />
              ) : null}

              {viewMode === "agenda" ? (
                <AgendaCalendarView
                  dates={agendaDates}
                  eventsByDate={eventsByDate}
                  onSelectEvent={handleSelectEvent}
                  onEdit={handleOpenEdit}
                  onCreate={handleOpenCreate}
                />
              ) : null}
            </>
          )}
        </main>
      </section>

      <SelectedDayPanel
        isOpen={isRightPanelOpen}
        onClose={() => setIsRightPanelOpen(false)}
        selectedDate={selectedDate}
        selectedDateEvents={selectedDateEvents}
        selectedDateOverlays={
          overlaysByDate.get(getLocalDateKey(selectedDate)) ?? []
        }
        selectedEvent={selectedEvent}
        onCreate={handleOpenCreate}
        onSelectEvent={handleSelectEvent}
        onClearSelectedEvent={() => setSelectedEventId(null)}
        onEdit={handleOpenEdit}
        onSelectOverlay={handleSelectOverlay}
      />

      <EventDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        event={dialogEvent}
        defaultDate={dialogDefaultDate}
      />

      <CalendarOverlayDetailDialog
        item={selectedOverlay}
        onOpenChange={(open) => {
          if (!open) setSelectedOverlay(null);
        }}
      />
    </div>
  );
}

function CalendarSkeleton({ viewMode }: { viewMode: CalendarViewMode }) {
  if (viewMode === "agenda") {
    return (
      <div className="space-y-px bg-border">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-none" />
        ))}
      </div>
    );
  }

  return (
    <div className="bg-border">
      <div
        className={cn(
          "grid gap-px",
          viewMode === "month"
            ? "grid-cols-7"
            : viewMode === "week"
              ? "grid-cols-7"
              : "grid-cols-1",
        )}
      >
        {Array.from({
          length: viewMode === "month" ? 35 : viewMode === "week" ? 21 : 6,
        }).map((_, index) => (
          <Skeleton
            key={index}
            className={cn(
              "rounded-none",
              viewMode === "month" ? "h-24" : "h-20",
            )}
          />
        ))}
      </div>
    </div>
  );
}

function CalendarWorkspaceRail({
  currentDate,
  selectedDate,
  typeFilter,
  isMineOnly,
  showFinance,
  onCreate,
  onSelectDate,
  onMonthChange,
  onTypeFilterChange,
  onMineOnlyChange,
  onShowFinanceChange,
}: {
  currentDate: Date;
  selectedDate: Date;
  typeFilter: string;
  isMineOnly: boolean;
  showFinance: boolean;
  onCreate: () => void;
  onSelectDate: (date: Date | undefined) => void;
  onMonthChange: (date: Date) => void;
  onTypeFilterChange: (value: string) => void;
  onMineOnlyChange: (checked: boolean) => void;
  onShowFinanceChange: (checked: boolean) => void;
}) {
  return (
    <aside className="hidden w-[236px] shrink-0 flex-col border-r border-border bg-muted/25 min-[1500px]:flex">
      <div className="px-4 pb-3 pt-4">
        <Button className="w-full justify-start" onClick={onCreate}>
          <CalendarPlus2 className="size-4" />새 일정
          <kbd className="ml-auto rounded border border-primary-foreground/20 px-1.5 py-0.5 text-[10px] font-normal text-primary-foreground/70">
            N
          </kbd>
        </Button>
      </div>

      <div className="border-y border-border bg-background px-1 py-3">
        <MiniCalendar
          mode="single"
          month={currentDate}
          selected={selectedDate}
          onSelect={onSelectDate}
          onMonthChange={onMonthChange}
          className="mx-auto w-fit p-0"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="px-2 text-[11px] font-semibold text-muted-foreground">
          일정 유형
        </div>
        <div className="mt-2 space-y-0.5">
          <CalendarRailFilter
            active={!typeFilter}
            label="모든 유형"
            color="#37352f"
            onClick={() => onTypeFilterChange("")}
          />
          {Object.entries(EVENT_TYPE_META).map(([key, meta]) => (
            <CalendarRailFilter
              key={key}
              active={typeFilter === key}
              label={meta.label}
              color={meta.color}
              onClick={() => onTypeFilterChange(typeFilter === key ? "" : key)}
            />
          ))}
        </div>

        <Separator className="my-4" />
        <div className="space-y-1">
          <CalendarRailToggle
            label="내 일정만"
            checked={isMineOnly}
            onCheckedChange={onMineOnlyChange}
          />
          <CalendarRailToggle
            label="재무 일정"
            checked={showFinance}
            onCheckedChange={onShowFinanceChange}
          />
        </div>
      </div>

      <div className="border-t border-border px-5 py-3 text-[10px] leading-5 text-muted-foreground">
        <span className="font-medium text-foreground">T</span> 오늘 ·{" "}
        <span className="font-medium text-foreground">J/K</span> 이전·다음
      </div>
    </aside>
  );
}

function CalendarRailFilter({
  active,
  label,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active
          ? "bg-secondary font-medium text-foreground"
          : "text-muted-foreground",
      )}
    >
      <span
        className="size-2.5 rounded-[3px]"
        style={{ backgroundColor: color }}
      />
      <span>{label}</span>
      {active ? (
        <span className="ml-auto text-[10px] text-muted-foreground">
          표시 중
        </span>
      ) : null}
    </button>
  );
}

function CalendarRailToggle({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex h-9 items-center justify-between rounded-md px-2 text-xs text-muted-foreground hover:bg-muted">
      {label}
      <Switch size="sm" checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

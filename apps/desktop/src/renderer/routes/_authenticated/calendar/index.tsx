import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  CalendarPlus2,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  PanelRightOpen,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import type { CalendarEvent } from "@estate-erp/api-client";
import { toast } from "sonner";

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
  formatEventTimeRange,
  formatEventContext,
} from "./-event-meta";
import { useCalendarOverlays, type OverlayItem } from "./-calendar-overlay";
import { EventEditor, type EventDraftPreset } from "./-event-dialog";
import { CalendarOverlayInspector } from "./-overlay-detail-dialog";
import { SelectedDayPanel, SelectedEventInspector } from "./-month-view";
import { MonthCalendarView, type MonthViewport } from "./-month-grid-view";
import { TimeGridCalendarView } from "./-time-grid-view";
import { AgendaCalendarView } from "./-agenda-view";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { useEventTiming } from "./-use-event-timing";
import { readWorkspaceState, writeWorkspaceState } from "./-workspace-state";
import type { CalendarDraftPreview } from "./-event-draft-preview";
import { GRID_HOUR_HEIGHT } from "./-time-grid-layout";

const viewOptions: Array<{ value: CalendarViewMode; label: string }> = [
  { value: "month", label: "월" },
  { value: "week", label: "주" },
  { value: "day", label: "일" },
  { value: "agenda", label: "일정" },
];

const EMPTY_CALENDAR_EVENTS: CalendarEvent[] = [];
const EMPTY_OVERLAYS_BY_DATE = new Map<string, OverlayItem[]>();

type CalendarSearch = {
  /** 이 날(YYYY-MM-DD)로 옮겨 연다 (대시보드에서 일정·날짜를 눌러 들어올 때) */
  date?: string;
  /** 이 일정을 골라 둔다 */
  event?: string;
  /** 새 일정 편집창을 바로 연다 (빠른 등록에서 들어올 때) */
  new?: boolean;
};

function parseDateParam(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // 없는 날(13월, 2월 30일)은 Date가 다음 달로 넘겨 버린다 — 엉뚱한 달을 열지 않고 무시한다
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  )
    return null;
  return date;
}

export const Route = createFileRoute("/_authenticated/calendar/")({
  validateSearch: (search: Record<string, unknown>): CalendarSearch => ({
    date: typeof search.date === "string" ? search.date : undefined,
    event: typeof search.event === "string" ? search.event : undefined,
    new:
      search.new === true ||
      search.new === "true" ||
      search.new === 1 ||
      search.new === "1"
        ? true
        : undefined,
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const { user } = useAuth();
  const {
    date: dateFromUrl,
    event: eventFromUrl,
    new: createFromUrl,
  } = Route.useSearch();
  const navigate = Route.useNavigate();
  const storageKey = `calendar-workspace:${user?.id ?? "anonymous"}`;
  const [initialWorkspace] = useState(() => {
    const saved = readWorkspaceState(storageKey);
    const linked = parseDateParam(dateFromUrl);
    if (!linked) return saved;
    // 대시보드에서 고른 날로 연다. 월 보기의 스크롤 위치는 그 날을 기준으로 다시 잡는다.
    return {
      ...saved,
      currentDate: linked.toISOString(),
      selectedDate: linked.toISOString(),
      monthViewport: undefined,
    };
  });
  const [viewMode, setViewMode] = useState<CalendarViewMode>(
    initialWorkspace.viewMode,
  );
  const [currentDate, setCurrentDate] = useState(
    new Date(initialWorkspace.currentDate),
  );
  const [selectedDate, setSelectedDate] = useState(
    new Date(initialWorkspace.selectedDate),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef(initialWorkspace.scroll);
  const monthViewport = useRef<MonthViewport | undefined>(
    initialWorkspace.monthViewport,
  );
  const [monthRange, setMonthRange] = useState<{
    start: Date;
    end: Date;
  } | null>(null);
  const [monthNavigationVersion, setMonthNavigationVersion] = useState(0);
  const jumpToMonth = () => {
    monthViewport.current = undefined;
    setMonthNavigationVersion((value) => value + 1);
  };
  const anchorRef = useRef<HTMLElement | null>(null);
  const virtualAnchor = useRef({
    getBoundingClientRect: () =>
      anchorRef.current?.getBoundingClientRect() ?? new DOMRect(100, 100, 1, 1),
  });
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editorPreview, setEditorPreview] =
    useState<CalendarDraftPreview | null>(null);
  const [draft, setDraft] = useState<EventDraftPreset | null>(null);
  const timing = useEventTiming();
  const [userFilter, setUserFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [isMineOnly, setIsMineOnly] = useState(false);
  const [showFinance, setShowFinance] = useState(true);
  // 빠른 등록의 '일정 추가'로 들어오면 새 일정 편집창을 연 채로 시작한다
  const [isDialogOpen, setIsDialogOpen] = useState(Boolean(createFromUrl));
  const [dialogEvent, setDialogEvent] = useState<CalendarEvent | null>(null);
  // 대시보드의 '일정 추가'(?date=&new=1)로 들어오면 고른 날로 새 일정 창을 연다(오늘이면 지금 시각 기준).
  const [dialogDefaultDate, setDialogDefaultDate] = useState(() => {
    const linked = createFromUrl ? parseDateParam(dateFromUrl) : null;
    if (!linked || getLocalDateKey(linked) === getLocalDateKey(new Date()))
      return new Date();
    return linked;
  });
  const [selectedEventId, setSelectedEventId] = useState<string | null>(
    eventFromUrl ?? null,
  );
  // 주소의 날짜·일정은 처음 열 때 한 번만 쓴다. 지워 두어야 새로 고침·뒤로 가기 때 다시 그 날로 튀지 않는다.
  useEffect(() => {
    if (dateFromUrl || eventFromUrl || createFromUrl)
      void navigate({ search: {}, replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [selectedOverlay, setSelectedOverlay] = useState<OverlayItem | null>(
    null,
  );
  // 대시보드에서 일정을 눌러 들어오면 고른 일정을 오른쪽 패널에 펼쳐 둔다.
  // 날짜만 넘어온 때(계약·대금 날짜, '더 보기')는 펼치지 않는다 — 좁은 창에서 패널이 도구 줄을 가린다.
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(() =>
    Boolean(eventFromUrl),
  );
  // 주소로 넘어온 일정은 서버에 한 번 따로 묻는다(주소는 위에서 바로 지우므로 처음 값을 붙들어 둔다).
  // 보고 있는 달 밖의 일정이어도 패널에 보이고, 지워진 일정이면 빈 패널 대신 알린다
  // (예전에는 없는 일정의 주소로 들어오면 아무 말 없이 빈 달력만 보였다 — 업무 화면은 알린다).
  const [linkedEventId] = useState(() => eventFromUrl ?? null);
  const linkedEventQuery = useQuery({
    // 'calendar-events'로 시작하지 않게 둔다: 일정을 고치거나 지울 때 그 묶음이 다시 불려
    // 방금 지운 일정을 '찾을 수 없습니다'로 알리게 된다.
    queryKey: ["calendar-event-linked", linkedEventId],
    queryFn: () => api.calendarEvents.findOne(linkedEventId!),
    enabled: Boolean(linkedEventId),
    retry: false,
    staleTime: 30_000,
  });
  useEffect(() => {
    if (!linkedEventQuery.isError) return;
    toast.error("일정을 찾을 수 없습니다. 이미 지워졌을 수 있습니다.");
    setSelectedEventId((current) => (current === linkedEventId ? null : current));
    setIsRightPanelOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedEventQuery.isError]);

  const range = useMemo(
    () =>
      viewMode === "month" && monthRange
        ? monthRange
        : getCalendarRange(currentDate, viewMode),
    [currentDate, viewMode, monthRange],
  );
  const fetchStart = range.start.toISOString();
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

  const searchQuery = useQuery({
    queryKey: [
      "calendar-events",
      "search",
      { userId: effectiveUserId ?? "", type: typeFilter },
    ],
    queryFn: () =>
      api.calendarEvents.findAll({
        userId: effectiveUserId,
        type: typeFilter || undefined,
      }),
    enabled: searchOpen,
    staleTime: 30_000,
  });
  const searchResults = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    const records = searchQuery.data ?? [];
    return records.filter(
      (event) =>
        !query ||
        `${event.title} ${event.description ?? ""} ${formatEventContext(event)}`
          .toLocaleLowerCase()
          .includes(query),
    );
  }, [searchQuery.data, searchText]);
  // '내 일정만'·담당자를 고르면 계약·대금·수금 날짜도 그 직원이 담당인 거래의 것만 보인다
  const overlay = useCalendarOverlays(showFinance, effectiveUserId ?? null);
  const persistWorkspace = () =>
    writeWorkspaceState(storageKey, {
      viewMode,
      currentDate: currentDate.toISOString(),
      selectedDate: selectedDate.toISOString(),
      scroll: scrollPositions.current,
      monthViewport: monthViewport.current,
    });
  useEffect(persistWorkspace, [
    storageKey,
    viewMode,
    currentDate,
    selectedDate,
  ]);
  useLayoutEffect(() => {
    if (!scrollRef.current || eventsQuery.isLoading || viewMode === "month")
      return;
    scrollRef.current.scrollTop =
      scrollPositions.current[viewMode] ??
      (viewMode === "week" || viewMode === "day" ? GRID_HOUR_HEIGHT * 8 : 0);
  }, [viewMode, eventsQuery.isLoading]);

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
    ? (events.find((event) => event.id === selectedEventId) ??
      searchQuery.data?.find((event) => event.id === selectedEventId) ??
      (linkedEventQuery.data?.id === selectedEventId ? linkedEventQuery.data : null) ??
      null)
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

  const handleOpenCreate = (date: Date, end?: Date) => {
    setDraft(
      end ? { start: date.toISOString(), end: end.toISOString() } : null,
    );
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

  const handleSelectEvent = (event: CalendarEvent, anchor?: HTMLElement) => {
    anchorRef.current =
      anchor ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    setSelectedDate(new Date(event.start));
    setSelectedOverlay(null);
    setSelectedEventId(event.id);
  };

  const handleSelectOverlay = (item: OverlayItem, anchor?: HTMLElement) => {
    anchorRef.current =
      anchor ??
      (document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
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
    setSelectedOverlay(null);

    if (viewMode !== "month") {
      setCurrentDate(date);
    }
  };

  const handleNavigate = (direction: -1 | 1) => {
    jumpToMonth();
    const nextDate = addCalendarPeriod(currentDate, viewMode, direction);
    setCurrentDate(nextDate);
    setSelectedDate(nextDate);
    setSelectedEventId(null);
    setSelectedOverlay(null);
  };

  const handleToday = () => {
    jumpToMonth();
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
    setSelectedEventId(null);
    setSelectedOverlay(null);
  };

  const handleViewChange = (value: string) => {
    const nextViewMode = value as CalendarViewMode;
    setViewMode(nextViewMode);
    if (nextViewMode === "month") {
      jumpToMonth();
      setMonthRange(null);
      setCurrentDate(selectedDate);
    }
    setSelectedEventId(null);
    setSelectedOverlay(null);

    if (nextViewMode !== "month") {
      setCurrentDate(selectedDate);
    }
  };

  const handleMiniCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    jumpToMonth();
    setSelectedDate(date);
    setCurrentDate(date);
    setSelectedEventId(null);
    setSelectedOverlay(null);
  };

  // 키보드 단축키 — T(오늘) / N(새 일정) / J·←(이전) / K·→(다음)
  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (isDialogOpen || keyEvent.isComposing || keyEvent.defaultPrevented)
        return;
      if (
        (keyEvent.metaKey || keyEvent.ctrlKey) &&
        keyEvent.key.toLowerCase() === "f"
      ) {
        keyEvent.preventDefault();
        setSearchOpen(true);
        return;
      }
      if (
        searchOpen ||
        filtersOpen ||
        keyEvent.metaKey ||
        keyEvent.ctrlKey ||
        keyEvent.altKey
      )
        return;
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

      if (target?.closest('[role="dialog"], [role="listbox"], [role="menu"]'))
        return;
      switch (keyEvent.key.toLowerCase()) {
        case "d":
          handleViewChange("day");
          break;
        case "w":
          handleViewChange("week");
          break;
        case "m":
          handleViewChange("month");
          break;
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
  }, [
    isDialogOpen,
    searchOpen,
    filtersOpen,
    selectedDate,
    currentDate,
    viewMode,
  ]);

  return (
    <div
      data-calendar-page
      className="relative -m-4 flex min-h-0 flex-1 overflow-hidden bg-background"
    >
      <CalendarWorkspaceRail
        currentDate={currentDate}
        selectedDate={selectedDate}
        typeFilter={typeFilter}
        isMineOnly={isMineOnly}
        showFinance={showFinance}
        onSelectDate={handleMiniCalendarSelect}
        onMonthChange={(date) => {
          jumpToMonth();
          setCurrentDate(date);
          setSelectedEventId(null);
          setSelectedOverlay(null);
        }}
        onTypeFilterChange={setTypeFilter}
        onMineOnlyChange={setIsMineOnly}
        onShowFinanceChange={setShowFinance}
      />

      <section className="flex min-w-0 flex-1 flex-col bg-background">
        <header
          className="flex h-[54px] shrink-0 items-center gap-2 overflow-x-auto border-b border-border px-3"
          data-calendar-toolbar
        >
          <h1
            className="min-w-20 max-w-44 shrink truncate text-[15px] font-semibold tracking-tight"
            title={
              viewMode === "month"
                ? `${headerTitle} · 휠을 스크롤하여 날짜 탐색`
                : `${headerTitle} · ${rangeLabel} · ${events.length}건`
            }
          >
            {headerTitle}
          </h1>
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => handleNavigate(-1)}
              aria-label="이전 기간"
              title="이전 기간 (J)"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleToday}
              title="오늘 (T)"
            >
              오늘
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
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
            className="flex h-8 shrink-0 items-center rounded-md bg-muted/60 p-0.5"
          >
            {viewOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={viewMode === option.value}
                onClick={() => handleViewChange(option.value)}
                className={cn(
                  "h-7 rounded px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  viewMode === option.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1" />
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                ref={searchButtonRef}
                variant="ghost"
                size="icon-sm"
                aria-label="일정 검색"
                title="일정 검색 (⌘/Ctrl+F)"
              >
                <Search className="size-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              className="w-[380px] max-w-[calc(100vw-2rem)] p-0"
            >
              <div className="border-b p-3">
                <Input
                  autoFocus
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="일정·고객·매물 검색"
                  aria-label="일정 검색어"
                />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  전체 기간 · 선택한 담당자·유형 적용
                </p>
              </div>
              <div className="max-h-80 overflow-y-auto p-1">
                {searchQuery.isLoading ? (
                  <p className="p-4 text-xs text-muted-foreground">
                    일정을 찾고 있습니다…
                  </p>
                ) : searchQuery.isError ? (
                  <Button
                    variant="ghost"
                    onClick={() => void searchQuery.refetch()}
                  >
                    검색 다시 시도
                  </Button>
                ) : searchResults.length === 0 ? (
                  <p className="p-4 text-xs text-muted-foreground">
                    일치하는 일정이 없습니다.
                  </p>
                ) : (
                  searchResults.slice(0, 40).map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      className="block w-full rounded-md px-3 py-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => {
                        const date = new Date(event.start);
                        jumpToMonth();
                        setCurrentDate(date);
                        setSearchOpen(false);
                        handleSelectEvent(
                          event,
                          searchButtonRef.current ?? undefined,
                        );
                      }}
                    >
                      <span className="block truncate text-xs font-medium">
                        {event.title}
                      </span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">
                        {new Date(event.start).toLocaleDateString("ko-KR")} ·{" "}
                        {formatEventTimeRange(event)}
                      </span>
                    </button>
                  ))
                )}
                {searchResults.length > 40 && (
                  <p className="px-3 py-2 text-[11px] text-muted-foreground">
                    {searchResults.length}건 중 40건 · 검색어를 더 입력해
                    주세요.
                  </p>
                )}
              </div>
            </PopoverContent>
          </Popover>
          <Popover open={filtersOpen} onOpenChange={setFiltersOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5"
                aria-label="캘린더 필터"
              >
                <SlidersHorizontal className="size-4" />
                <span>
                  {isMineOnly
                    ? "내 일정"
                    : userFilter
                      ? (employees.find(
                          (employee) => employee.id === userFilter,
                        )?.name ?? "담당자")
                      : "필터"}
                  {typeFilter
                    ? ` · ${EVENT_TYPE_META[typeFilter]?.label ?? typeFilter}`
                    : ""}
                </span>
                {!showFinance && (
                  <span className="text-[10px] text-muted-foreground">
                    재무 숨김
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 space-y-3">
              <div
                className={cn(isMineOnly && "pointer-events-none opacity-50")}
              >
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
              <FilterSelect
                label="유형"
                value={typeFilter}
                onChange={setTypeFilter}
                options={Object.entries(EVENT_TYPE_META).map(([key, meta]) => ({
                  value: key,
                  label: meta.label,
                }))}
              />
              <label className="flex items-center justify-between text-xs">
                내 일정만
                <Switch
                  size="sm"
                  checked={isMineOnly}
                  onCheckedChange={setIsMineOnly}
                />
              </label>
              <label className="flex items-center justify-between text-xs">
                계약·재무 일정
                <Switch
                  size="sm"
                  checked={showFinance}
                  onCheckedChange={setShowFinance}
                />
              </label>
            </PopoverContent>
          </Popover>
          <Button
            size="sm"
            onClick={() => handleOpenCreate(selectedDate)}
            title="새 일정 (N)"
            aria-label="새 일정"
          >
            <CalendarPlus2 className="size-4" />
            <span className="hidden min-[1100px]:inline">새 일정</span>
          </Button>
          {!isRightPanelOpen && (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => setIsRightPanelOpen(true)}
              aria-label="오른쪽 패널 펼치기"
              aria-expanded={false}
              aria-controls="calendar-details-panel"
            >
              <PanelRightOpen className="size-4" />
            </Button>
          )}
        </header>

        {showFinance && overlay.isError ? (
          <div className="shrink-0 border-b border-border bg-destructive-soft px-5 py-1.5 text-[11px] text-destructive">
            재무 일정을 불러오지 못했습니다.
          </div>
        ) : null}

        <main
          ref={scrollRef}
          data-calendar-scroll
          className={cn(
            "min-h-0 flex-1",
            viewMode === "month"
              ? "overflow-x-auto overflow-y-hidden"
              : "overflow-auto",
          )}
          onScroll={(e) => {
            if (viewMode === "month") return;
            scrollPositions.current[viewMode] = e.currentTarget.scrollTop;
            persistWorkspace();
          }}
        >
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
                  draft={isDialogOpen ? editorPreview : null}
                  events={events}
                  overlaysByDate={overlaysByDate}
                  selectedEventId={selectedEventId}
                  pendingId={timing.pendingId}
                  navigationVersion={monthNavigationVersion}
                  initialViewport={monthViewport.current}
                  onRangeChange={(next) =>
                    setMonthRange((previous) =>
                      previous?.start.getTime() === next.start.getTime() &&
                      previous?.end.getTime() === next.end.getTime()
                        ? previous
                        : next,
                    )
                  }
                  onViewportChange={(viewport, visibleDate) => {
                    monthViewport.current = viewport;
                    setCurrentDate((previous) =>
                      previous.getFullYear() === visibleDate.getFullYear() &&
                      previous.getMonth() === visibleDate.getMonth()
                        ? previous
                        : visibleDate,
                    );
                    writeWorkspaceState(storageKey, {
                      viewMode,
                      currentDate: visibleDate.toISOString(),
                      selectedDate: selectedDate.toISOString(),
                      scroll: scrollPositions.current,
                      monthViewport: viewport,
                    });
                  }}
                  onCreate={(from, to) => {
                    setDraft({
                      allDay: true,
                      start: from.toISOString(),
                      end: to.toISOString(),
                    });
                    setDialogEvent(null);
                    setDialogDefaultDate(from);
                    setSelectedDate(from);
                    setIsDialogOpen(true);
                  }}
                  onSelectEvent={handleSelectEvent}
                  onEdit={handleOpenEdit}
                  onSelectDate={handleSelectDate}
                  onOpenDay={(date) => {
                    setSelectedDate(date);
                    setCurrentDate(date);
                    setViewMode("day");
                    setSelectedEventId(null);
                    setSelectedOverlay(null);
                  }}
                  onSelectOverlay={handleSelectOverlay}
                  onChangeTime={(event, next) => {
                    void timing.save(event, next);
                  }}
                  onGestureStart={() => {
                    setSelectedEventId(null);
                    setSelectedOverlay(null);
                  }}
                />
              ) : null}

              {viewMode === "week" || viewMode === "day" ? (
                <TimeGridCalendarView
                  dates={timeGridDates}
                  draft={isDialogOpen ? editorPreview : null}
                  eventsByDate={eventsByDate}
                  overlaysByDate={overlaysByDate}
                  selectedEventId={selectedEventId}
                  pendingId={timing.pendingId}
                  onSelectOverlay={handleSelectOverlay}
                  onChangeTime={(event, next) => {
                    void timing.save(event, next);
                  }}
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
        isOpen={isRightPanelOpen && !isDialogOpen}
        onClose={() => {
          setIsRightPanelOpen(false);
          setSelectedEventId(null);
          setSelectedOverlay(null);
        }}
        selectedDate={selectedDate}
        selectedDateEvents={selectedDateEvents}
        selectedDateOverlays={
          overlaysByDate.get(getLocalDateKey(selectedDate)) ?? []
        }
        selectedEvent={selectedEvent}
        selectedOverlay={selectedOverlay}
        onCreate={handleOpenCreate}
        onSelectEvent={handleSelectEvent}
        onClearSelectedEvent={() => setSelectedEventId(null)}
        onEdit={handleOpenEdit}
        onSelectOverlay={handleSelectOverlay}
      />

      <EventEditor
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        event={dialogEvent}
        defaultDate={dialogDefaultDate}
        draft={draft}
        onPreviewChange={setEditorPreview}
      />

      <Popover
        open={
          !!(selectedEvent || selectedOverlay) &&
          !isRightPanelOpen &&
          !isDialogOpen
        }
        onOpenChange={(open) => {
          if (!open && !isRightPanelOpen) {
            setSelectedEventId(null);
            setSelectedOverlay(null);
          }
        }}
      >
        <PopoverAnchor virtualRef={virtualAnchor} />
        <PopoverContent
          side="right"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="flex max-h-[min(620px,calc(100dvh-5rem))] w-[320px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg p-0 motion-reduce:animate-none"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            if (anchorRef.current?.isConnected)
              anchorRef.current.focus({ preventScroll: true });
          }}
          onInteractOutside={(e) => {
            if ((e.target as HTMLElement)?.closest("[data-calendar-event]"))
              e.preventDefault();
          }}
        >
          {selectedOverlay ? (
            <CalendarOverlayInspector
              item={selectedOverlay}
              onClose={() => setSelectedOverlay(null)}
              onPin={() => setIsRightPanelOpen(true)}
            />
          ) : selectedEvent ? (
            <SelectedEventInspector
              event={selectedEvent}
              selectedDate={selectedDate}
              onBack={() => {
                setSelectedEventId(null);
                setIsRightPanelOpen(true);
              }}
              onClose={() => setSelectedEventId(null)}
              onEdit={handleOpenEdit}
              onPin={() => setIsRightPanelOpen(true)}
            />
          ) : null}
        </PopoverContent>
      </Popover>
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
  onSelectDate: (date: Date | undefined) => void;
  onMonthChange: (date: Date) => void;
  onTypeFilterChange: (value: string) => void;
  onMineOnlyChange: (checked: boolean) => void;
  onShowFinanceChange: (checked: boolean) => void;
}) {
  return (
    <aside className="hidden w-[236px] shrink-0 flex-col border-r border-border bg-muted/25 min-[1500px]:flex">
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

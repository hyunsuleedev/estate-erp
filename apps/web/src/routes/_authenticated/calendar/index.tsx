import { createFileRoute } from '@tanstack/react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays,
  CalendarPlus2,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Landmark,
} from 'lucide-react';
import type { CalendarEvent } from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar as MiniCalendar } from '@/components/ui/calendar';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { EmptyState, FilterSearch, FilterSelect } from '@/components/domain';
import {
  addCalendarPeriod,
  getCalendarRange,
  getLocalDateKey,
  getMonthDates,
  groupEventsByDate,
  type CalendarViewMode,
} from './-calendar-view-utils';
import {
  EVENT_TYPE_META,
  formatDateRange,
  formatFullDate,
  formatMonthTitle,
} from './-event-meta';
import { useCalendarOverlays, type OverlayItem } from './-calendar-overlay';
import { EventDialog } from './-event-dialog';
import {
  FullCalendarView,
  type CalendarEventDateChange,
} from './-full-calendar-view';
import { AgendaCalendarView } from './-agenda-view';
import { SelectedDayPanel } from './-month-view';

const viewOptions: Array<{ value: CalendarViewMode; label: string }> = [
  { value: 'month', label: '월' },
  { value: 'week', label: '주' },
  { value: 'day', label: '일' },
  { value: 'agenda', label: '일정' },
];

export const Route = createFileRoute('/_authenticated/calendar/')({
  component: CalendarPage,
});

function CalendarPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [userFilter, setUserFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchText, setSearchText] = useState('');
  const [isMineOnly, setIsMineOnly] = useState(false);
  const [showFinance, setShowFinance] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogEvent, setDialogEvent] = useState<CalendarEvent | null>(null);
  const [dialogDefaultDate, setDialogDefaultDate] = useState(new Date());
  const [dialogDefaultEnd, setDialogDefaultEnd] = useState<Date | null>(null);
  const [dialogDefaultAllDay, setDialogDefaultAllDay] = useState(false);

  const range = useMemo(() => getCalendarRange(currentDate, viewMode), [currentDate, viewMode]);
  const fetchStart = range.start.toISOString();
  // getCalendarRange의 end는 endOfDay이므로 API의 exclusive end에 맞춰 다음 날 자정으로 변환한다.
  const fetchEnd = new Date(range.end.getTime() + 1).toISOString();

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
  });

  const effectiveUserId = isMineOnly ? user?.id ?? undefined : userFilter || undefined;

  const eventsQuery = useQuery({
    queryKey: [
      'calendar-events',
      { start: fetchStart, end: fetchEnd, userId: effectiveUserId ?? '', type: typeFilter },
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
    const raw = eventsQuery.data ?? [];
    const needle = searchText.trim().toLowerCase();
    return raw.filter((event) => {
      const eventEnd = event.end ? new Date(event.end) : new Date(event.start);
      if (event.end ? eventEnd <= range.start : eventEnd < range.start) return false;
      if (!needle) return true;
      return [event.title, event.description, event.contact?.name].some((value) =>
        value?.toLowerCase().includes(needle),
      );
    });
  }, [eventsQuery.data, searchText, range.start]);

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const overlaysByDate = showFinance ? overlay.overlaysByDate : new Map<string, OverlayItem[]>();
  const agendaDates = useMemo(() => getMonthDates(currentDate), [currentDate]);
  const selectedDateEvents = eventsByDate.get(getLocalDateKey(selectedDate)) ?? [];
  const metrics = useMemo(() => getCalendarMetrics(events, user?.id), [events, user?.id]);

  const rangeLabel =
    viewMode === 'agenda' ? `${formatMonthTitle(currentDate)} 전체` : formatDateRange(range.start, range.end);
  const headerTitle =
    viewMode === 'agenda'
      ? `${formatMonthTitle(currentDate)} 일정`
      : viewMode === 'day'
        ? formatFullDate(currentDate)
        : formatMonthTitle(currentDate);
  const headerDescription =
    viewMode === 'month'
      ? '팀 일정과 CRM 후속 업무를 한 흐름으로 확인합니다.'
      : `${rangeLabel} · ${events.length}건`;

  const handleOpenCreateRange = (start: Date, end: Date, allDay: boolean) => {
    setDialogEvent(null);
    setDialogDefaultDate(start);
    setDialogDefaultEnd(end);
    setDialogDefaultAllDay(allDay);
    setSelectedDate(start);
    setIsDialogOpen(true);
  };

  const handleOpenCreate = (date: Date) => {
    const end = new Date(date);
    end.setHours(date.getHours() + 1);
    handleOpenCreateRange(date, end, false);
  };

  const handleOpenEdit = (event: CalendarEvent) => {
    setDialogEvent(event);
    setIsDialogOpen(true);
  };

  const handleEventDatesChange = async (eventId: string, dates: CalendarEventDateChange) => {
    try {
      await api.calendarEvents.update(eventId, dates);
      await queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success('일정 시간이 변경되었습니다.');
    } catch (error) {
      const message = error instanceof Error ? error.message : '알 수 없는 오류';
      toast.error(`일정 시간 변경에 실패했습니다: ${message}`);
      throw error;
    }
  };

  const handleSelectDate = (date: Date) => {
    setSelectedDate(date);

    if (viewMode === 'month' && date.getMonth() !== currentDate.getMonth()) {
      setCurrentDate(new Date(date.getFullYear(), date.getMonth(), 1));
      return;
    }

    if (viewMode !== 'month') {
      setCurrentDate(date);
    }
  };

  const handleNavigate = (direction: -1 | 1) => {
    const nextDate = addCalendarPeriod(currentDate, viewMode, direction);
    setCurrentDate(nextDate);
    setSelectedDate(nextDate);
  };

  const handleToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  const handleViewChange = (value: string) => {
    const nextViewMode = value as CalendarViewMode;
    setViewMode(nextViewMode);

    if (nextViewMode !== 'month') {
      setCurrentDate(selectedDate);
    }
  };

  const handleMiniCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    setCurrentDate(date);
  };

  // 키보드 단축키 — T(오늘) / N(새 일정) / J·←(이전) / K·→(다음)
  useEffect(() => {
    const onKeyDown = (keyEvent: KeyboardEvent) => {
      if (isDialogOpen) return;
      if (keyEvent.metaKey || keyEvent.ctrlKey || keyEvent.altKey) return;
      const target = keyEvent.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }

      switch (keyEvent.key.toLowerCase()) {
        case 't':
          handleToday();
          break;
        case 'n':
          keyEvent.preventDefault();
          handleOpenCreate(selectedDate);
          break;
        case 'j':
        case 'arrowleft':
          handleNavigate(-1);
          break;
        case 'k':
        case 'arrowright':
          handleNavigate(1);
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDialogOpen, selectedDate, currentDate, viewMode]);

  return (
    <div data-calendar-page className="-mx-4 flex h-[calc(100svh-4rem)] min-h-0 overflow-hidden bg-background">
      <CalendarWorkspaceRail
        currentDate={currentDate}
        selectedDate={selectedDate}
        typeFilter={typeFilter}
        isMineOnly={isMineOnly}
        showFinance={showFinance}
        onCreate={() => handleOpenCreate(selectedDate)}
        onSelectDate={handleMiniCalendarSelect}
        onMonthChange={setCurrentDate}
        onTypeFilterChange={setTypeFilter}
        onMineOnlyChange={setIsMineOnly}
        onShowFinanceChange={setShowFinance}
      />

      <section className="flex min-w-0 flex-1 flex-col bg-background">
        <header className="shrink-0 border-b border-border px-5 pt-5">
          <div className="flex flex-wrap items-start gap-3 pb-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <CalendarDays className="size-[17px]" />
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-xl font-semibold tracking-[-0.025em] text-foreground">
                    {headerTitle}
                  </h2>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{headerDescription}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-8 items-center rounded-md bg-muted p-0.5">
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
              <Button size="sm" className="h-8" onClick={() => handleOpenCreate(selectedDate)} title="새 일정 (N)">
                <CalendarPlus2 className="size-4" />
                새 일정
              </Button>
            </div>
          </div>

          <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
            <div role="tablist" aria-label="캘린더 보기" className="flex h-10 items-end gap-1">
              {viewOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={viewMode === option.value}
                  onClick={() => handleViewChange(option.value)}
                  className={cn(
                    'relative h-10 px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                    viewMode === option.value &&
                      'text-foreground after:absolute after:inset-x-2 after:bottom-[-1px] after:h-0.5 after:rounded-full after:bg-foreground',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 pb-2">
              <FilterSearch value={searchText} onChange={setSearchText} placeholder="일정 검색" className="w-44" />
              <div className={cn(isMineOnly && 'pointer-events-none opacity-50')}>
                <FilterSelect
                  label="담당자"
                  value={userFilter}
                  onChange={setUserFilter}
                  options={employees.map((employee) => ({ value: employee.id, label: employee.name }))}
                />
              </div>
              <div className="flex items-center gap-2 min-[1500px]:hidden">
                <FilterSelect
                  label="유형"
                  value={typeFilter}
                  onChange={setTypeFilter}
                  options={Object.entries(EVENT_TYPE_META).map(([key, meta]) => ({ value: key, label: meta.label }))}
                />
                <label className="flex h-8 items-center gap-2 rounded-md bg-muted px-2.5 text-[11px] text-muted-foreground">
                  <Switch size="sm" checked={isMineOnly} onCheckedChange={setIsMineOnly} />내 일정
                </label>
                <label className="flex h-8 items-center gap-2 rounded-md bg-muted px-2.5 text-[11px] text-muted-foreground">
                  <Switch size="sm" checked={showFinance} onCheckedChange={setShowFinance} />재무
                </label>
              </div>
            </div>
          </div>
        </header>

        <CalendarScopeSummary
          metrics={metrics}
          rangeLabel={rangeLabel}
          showFinance={showFinance}
          overlayError={overlay.isError}
        />

        <main className="min-h-0 flex-1 overflow-auto p-4">
          {eventsQuery.isLoading ? (
            <CalendarSkeleton viewMode={viewMode} />
          ) : eventsQuery.isError ? (
            <div className="rounded-lg border border-border bg-background py-8">
              <EmptyState
                icon={CalendarX2}
                title="일정을 불러오지 못했습니다"
                description="네트워크 상태를 확인한 뒤 다시 시도해 주세요."
                action={
                  <Button variant="outline" onClick={() => void eventsQuery.refetch()}>
                    다시 시도
                  </Button>
                }
              />
            </div>
          ) : (
            <>
              {viewMode !== 'agenda' ? (
                <FullCalendarView
                  viewMode={viewMode}
                  currentDate={currentDate}
                  selectedDate={selectedDate}
                  events={events}
                  overlaysByDate={overlaysByDate}
                  onCreate={handleOpenCreateRange}
                  onEdit={handleOpenEdit}
                  onSelectDate={handleSelectDate}
                  onEventDatesChange={handleEventDatesChange}
                />
              ) : null}

              {viewMode === 'agenda' ? (
                <AgendaCalendarView
                  dates={agendaDates}
                  eventsByDate={eventsByDate}
                  onEdit={handleOpenEdit}
                  onCreate={handleOpenCreate}
                />
              ) : null}
            </>
          )}
        </main>
      </section>

      <SelectedDayPanel
        selectedDate={selectedDate}
        selectedDateEvents={selectedDateEvents}
        selectedDateOverlays={overlaysByDate.get(getLocalDateKey(selectedDate)) ?? []}
        onCreate={handleOpenCreate}
        onEdit={handleOpenEdit}
      />

      <EventDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        event={dialogEvent}
        defaultDate={dialogDefaultDate}
        defaultEnd={dialogDefaultEnd}
        defaultAllDay={dialogDefaultAllDay}
      />
    </div>
  );
}

function CalendarSkeleton({ viewMode }: { viewMode: CalendarViewMode }) {
  if (viewMode === 'agenda') {
    return (
      <div className="space-y-2 rounded-[12px] border border-border bg-background p-4">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-border bg-background p-4">
      <div
        className={cn(
          'grid gap-2',
          viewMode === 'month' ? 'grid-cols-7' : viewMode === 'week' ? 'grid-cols-7' : 'grid-cols-1',
        )}
      >
        {Array.from({ length: viewMode === 'month' ? 35 : viewMode === 'week' ? 21 : 6 }).map(
          (_, index) => (
            <Skeleton key={index} className={viewMode === 'month' ? 'h-24' : 'h-20'} />
          ),
        )}
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
      <div className="px-4 pb-3 pt-5">
        <div className="text-[11px] font-semibold tracking-[0.04em] text-muted-foreground">WORK CALENDAR</div>
        <Button className="mt-3 w-full justify-start" onClick={onCreate}>
          <CalendarPlus2 className="size-4" />
          새 일정
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
        <div className="px-2 text-[11px] font-semibold text-muted-foreground">일정 보기</div>
        <div className="mt-2 space-y-0.5">
          <CalendarRailFilter
            active={!typeFilter}
            label="모든 일정"
            color="#37352f"
            onClick={() => onTypeFilterChange('')}
          />
          {Object.entries(EVENT_TYPE_META).map(([key, meta]) => (
            <CalendarRailFilter
              key={key}
              active={typeFilter === key}
              label={meta.label}
              color={meta.color}
              onClick={() => onTypeFilterChange(typeFilter === key ? '' : key)}
            />
          ))}
        </div>

        <Separator className="my-4" />
        <div className="space-y-1">
          <CalendarRailToggle label="내 일정만" checked={isMineOnly} onCheckedChange={onMineOnlyChange} />
          <CalendarRailToggle label="재무 일정" checked={showFinance} onCheckedChange={onShowFinanceChange} />
        </div>
      </div>

      <div className="border-t border-border px-5 py-3 text-[10px] leading-5 text-muted-foreground">
        <span className="font-medium text-foreground">T</span> 오늘 ·{' '}
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
        'flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-xs transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        active ? 'bg-secondary font-medium text-foreground' : 'text-muted-foreground',
      )}
    >
      <span className="size-2.5 rounded-[3px]" style={{ backgroundColor: color }} />
      <span>{label}</span>
      {active ? <span className="ml-auto text-[10px] text-muted-foreground">표시 중</span> : null}
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

function CalendarScopeSummary({
  metrics,
  rangeLabel,
  showFinance,
  overlayError,
}: {
  metrics: ReturnType<typeof getCalendarMetrics>;
  rangeLabel: string;
  showFinance: boolean;
  overlayError: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-muted/20 px-5 py-2 text-[11px] text-muted-foreground">
      <span className="max-w-48 truncate">{rangeLabel}</span>
      <Separator orientation="vertical" className="h-3.5" />
      <SummaryValue label="전체" value={metrics.total} />
      <SummaryValue label="내 일정" value={metrics.mine} />
      <SummaryValue label="계약" value={metrics.contracts} />
      <SummaryValue label="완료" value={metrics.completed} />
      <SummaryValue label="예정" value={metrics.upcoming} />
      <div className="ml-auto hidden items-center gap-3 lg:flex">
        {Object.entries(EVENT_TYPE_META).map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </span>
        ))}
        {showFinance ? (
          <span className="flex items-center gap-1.5">
            <Landmark className="size-3" /> 재무
          </span>
        ) : null}
      </div>
      {showFinance && overlayError ? <span className="text-destructive">재무 일정 불러오기 실패</span> : null}
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: number }) {
  return (
    <span className="whitespace-nowrap">
      {label} <strong className="font-semibold tabular-nums text-foreground">{value}</strong>
    </span>
  );
}

function getCalendarMetrics(events: CalendarEvent[], currentUserId: string | undefined) {
  const now = new Date();
  const completed = events.filter((event) => {
    const endTime = event.end ? new Date(event.end) : new Date(event.start);
    return endTime < now;
  }).length;

  return {
    total: events.length,
    completed,
    upcoming: events.length - completed,
    mine: events.filter((event) => event.userId === currentUserId).length,
    contracts: events.filter((event) => event.type === 'contract').length,
  };
}

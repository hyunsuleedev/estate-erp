import { createFileRoute } from '@tanstack/react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus2,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Landmark,
  ListChecks,
  UserRound,
} from 'lucide-react';
import type { CalendarEvent } from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, FilterSearch, FilterSelect } from '@/components/domain';
import {
  addCalendarPeriod,
  getCalendarRange,
  getLocalDateKey,
  getMonthDates,
  getWeekDates,
  groupEventsByDate,
  type CalendarViewMode,
} from './-calendar-view-utils';
import {
  EVENT_TYPE_META,
  formatDateRange,
  formatFullDate,
  formatMonthTitle,
} from './-event-meta';
import {
  OVERLAY_META,
  useCalendarOverlays,
  type OverlayItem,
  type OverlayKind,
} from './-calendar-overlay';
import { EventDialog } from './-event-dialog';
import { MonthCalendarView } from './-month-view';
import { TimeGridCalendarView } from './-time-grid-view';
import { AgendaCalendarView } from './-agenda-view';

const viewOptions: Array<{ value: CalendarViewMode; label: string }> = [
  { value: 'month', label: '월' },
  { value: 'week', label: '주' },
  { value: 'day', label: '일' },
  { value: 'agenda', label: '일정' },
];

/** 서버 findAll이 start 기준으로만 필터하므로, 범위 이전에 시작해 범위에 걸치는 멀티데이 이벤트를 위해 조회 시작을 당긴다. */
const MULTI_DAY_LOOKBACK_MS = 31 * 86_400_000;

export const Route = createFileRoute('/_authenticated/calendar/')({
  component: CalendarPage,
});

function CalendarPage() {
  const { user } = useAuth();
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

  const range = useMemo(() => getCalendarRange(currentDate, viewMode), [currentDate, viewMode]);
  const fetchStart = new Date(range.start.getTime() - MULTI_DAY_LOOKBACK_MS).toISOString();
  const fetchEnd = range.end.toISOString();

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
      if (eventEnd < range.start) return false;
      if (!needle) return true;
      return [event.title, event.description, event.contact?.name].some((value) =>
        value?.toLowerCase().includes(needle),
      );
    });
  }, [eventsQuery.data, searchText, range.start]);

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const overlaysByDate = showFinance ? overlay.overlaysByDate : new Map<string, OverlayItem[]>();
  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);
  const agendaDates = useMemo(() => getMonthDates(currentDate), [currentDate]);
  const timeGridDates = viewMode === 'day' ? [currentDate] : weekDates;
  const selectedDateEvents = eventsByDate.get(getLocalDateKey(selectedDate)) ?? [];
  const metrics = useMemo(() => getCalendarMetrics(events, user?.id), [events, user?.id]);

  const viewLabel =
    viewMode === 'month'
      ? '월간 보기'
      : viewMode === 'week'
        ? '주간 보기'
        : viewMode === 'day'
          ? '일간 보기'
          : '일정 리스트';
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
      ? '월간 일정 밀도와 선택한 날짜의 CRM 문맥을 함께 확인합니다.'
      : `${rangeLabel} · ${events.length}건`;

  const handleOpenCreate = (date: Date) => {
    setDialogEvent(null);
    setDialogDefaultDate(date);
    setSelectedDate(date);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (event: CalendarEvent) => {
    setDialogEvent(event);
    setIsDialogOpen(true);
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
    <div className="flex min-h-0 flex-col gap-4">
      <section className="overflow-hidden rounded-lg border bg-background">
        <div className="flex flex-col gap-4 border-b bg-muted/20 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{headerTitle}</h1>
              <Badge variant="outline" className="bg-background">
                {viewLabel}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{headerDescription}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Tabs value={viewMode} onValueChange={handleViewChange} className="w-auto">
              <TabsList className="h-9 bg-background shadow-xs">
                {viewOptions.map((option) => (
                  <TabsTrigger key={option.value} value={option.value} className="h-7 px-3 text-xs">
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className="flex h-9 items-center rounded-md border bg-background shadow-xs">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => handleNavigate(-1)}
                aria-label="이전 기간"
                title="이전 기간 (J)"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Separator orientation="vertical" className="h-5" />
              <Button variant="ghost" size="sm" onClick={handleToday} title="오늘로 이동 (T)">
                오늘
              </Button>
              <Separator orientation="vertical" className="h-5" />
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

            <Button onClick={() => handleOpenCreate(selectedDate)} className="h-9" title="새 일정 (N)">
              <CalendarPlus2 className="size-4" />
              새 일정
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid flex-1 grid-cols-2 overflow-hidden rounded-md border bg-muted/10 sm:grid-cols-4">
            <MetricItem
              label={
                viewMode === 'month'
                  ? '현재 범위'
                  : viewMode === 'day'
                    ? '선택일'
                    : viewMode === 'agenda'
                      ? '이번 달'
                      : '이번 주'
              }
              value={`${metrics.total}건`}
              icon={Clock3}
            />
            <MetricItem label="계약 일정" value={`${metrics.contracts}건`} icon={CalendarPlus2} />
            <MetricItem label="내 일정" value={`${metrics.mine}건`} icon={UserRound} />
            <MetricItem label="완료 / 예정" value={`${metrics.completed} / ${metrics.upcoming}`} icon={ListChecks} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <FilterSearch
              value={searchText}
              onChange={setSearchText}
              placeholder="제목·설명·연락처 검색"
              className="w-48"
            />
            <div className={cn(isMineOnly && 'pointer-events-none opacity-50')}>
              <FilterSelect
                label="담당자"
                value={userFilter}
                onChange={setUserFilter}
                options={employees.map((employee) => ({ value: employee.id, label: employee.name }))}
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
            <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground">
              <Switch size="sm" checked={isMineOnly} onCheckedChange={setIsMineOnly} />
              내 일정만
            </label>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t px-4 py-2">
          <span className="text-[11px] font-semibold text-muted-foreground">범례</span>
          {Object.entries(EVENT_TYPE_META).map(([key, meta]) => (
            <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
              {meta.label}
            </span>
          ))}
          <Separator orientation="vertical" className="hidden h-4 sm:block" />
          {(Object.keys(OVERLAY_META) as OverlayKind[]).map((kind) => (
            <span key={kind} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Landmark className="size-3" style={{ color: OVERLAY_META[kind].color }} />
              {OVERLAY_META[kind].label}
            </span>
          ))}
          <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Switch size="sm" checked={showFinance} onCheckedChange={setShowFinance} />
            재무 일정 표시
          </label>
          {showFinance && overlay.isError ? (
            <span className="text-xs text-destructive">재무 일정을 불러오지 못했습니다</span>
          ) : null}
        </div>
      </section>

      {eventsQuery.isLoading ? (
        <CalendarSkeleton viewMode={viewMode} />
      ) : eventsQuery.isError ? (
        <div className="rounded-lg border bg-background py-8 shadow-xs">
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
          {viewMode === 'month' ? (
            <MonthCalendarView
              currentDate={currentDate}
              selectedDate={selectedDate}
              eventsByDate={eventsByDate}
              overlaysByDate={overlaysByDate}
              onCreate={handleOpenCreate}
              onEdit={handleOpenEdit}
              onSelectDate={handleSelectDate}
              selectedDateEvents={selectedDateEvents}
            />
          ) : null}

          {viewMode === 'week' || viewMode === 'day' ? (
            <TimeGridCalendarView
              dates={timeGridDates}
              eventsByDate={eventsByDate}
              onCreate={handleOpenCreate}
              onEdit={handleOpenEdit}
              selectedDate={selectedDate}
              onSelectDate={handleSelectDate}
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

      <EventDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        event={dialogEvent}
        defaultDate={dialogDefaultDate}
      />
    </div>
  );
}

function CalendarSkeleton({ viewMode }: { viewMode: CalendarViewMode }) {
  if (viewMode === 'agenda') {
    return (
      <div className="space-y-2 rounded-lg border bg-background p-4 shadow-xs">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-background p-4 shadow-xs">
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

function MetricItem({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Clock3;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 border-r border-b px-3 py-2 last:border-r-0 sm:border-b-0">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground shadow-xs">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[11px] text-muted-foreground">{label}</div>
        <div className="font-mono text-sm font-semibold tabular-nums">{value}</div>
      </div>
    </div>
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

import { createFileRoute } from '@tanstack/react-router';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
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
import { Button } from '@/components/ui/button';
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
import {
  OVERLAY_META,
  useCalendarOverlays,
  type OverlayItem,
  type OverlayKind,
} from './-calendar-overlay';
import { EventDialog } from './-event-dialog';
import {
  FullCalendarView,
  type CalendarEventDateChange,
} from './-full-calendar-view';
import { AgendaCalendarView } from './-agenda-view';

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
    <div className="flex h-[calc(100svh-4rem)] min-h-0 flex-col bg-background">
      {/* 페이지 헤더 — 기간 타이틀 + 설명 + 보기 전환·기간 이동·새 일정 */}
      <section className="flex flex-wrap items-start gap-3 px-6 pb-3 pt-[18px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold tracking-[-0.02em] text-foreground">{headerTitle}</h2>
            <span className="inline-flex h-5 items-center rounded-full bg-secondary px-2 text-[11.5px] font-semibold text-muted-foreground">
              {viewLabel}
            </span>
          </div>
          <p className="mt-0.5 break-keep text-[12.5px] text-muted-foreground">{headerDescription}</p>
        </div>
        <div className="flex-1" />
        <div className="flex flex-wrap items-center gap-2">
          <div
            role="group"
            aria-label="캘린더 보기 전환"
            className="flex items-center rounded-lg bg-secondary p-0.5"
          >
            {viewOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={viewMode === option.value}
                onClick={() => handleViewChange(option.value)}
                className={cn(
                  'h-7 rounded-md px-3 text-xs font-semibold transition-colors',
                  viewMode === option.value
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex h-[34px] items-center overflow-hidden rounded-[9px] border border-border bg-background">
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-none"
              onClick={() => handleNavigate(-1)}
              aria-label="이전 기간"
              title="이전 기간 (J)"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Separator orientation="vertical" className="h-4" />
            <Button
              variant="ghost"
              size="sm"
              className="h-full rounded-none px-3 text-xs font-medium"
              onClick={handleToday}
              title="오늘로 이동 (T)"
            >
              오늘
            </Button>
            <Separator orientation="vertical" className="h-4" />
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-none"
              onClick={() => handleNavigate(1)}
              aria-label="다음 기간"
              title="다음 기간 (K)"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <Button
            size="sm"
            className="h-[34px] shrink-0 gap-1.5 rounded-[9px] px-3.5"
            onClick={() => handleOpenCreate(selectedDate)}
            title="새 일정 (N)"
          >
            <CalendarPlus2 className="size-4" />
            새 일정
          </Button>
        </div>
      </section>

      {/* 툴바 — 범위 메트릭 + 검색·필터 */}
      <section className="flex shrink-0 flex-col gap-3 px-6 pb-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid flex-1 grid-cols-2 overflow-hidden rounded-[11px] border border-border sm:grid-cols-4">
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
          <label className="flex h-8 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs text-muted-foreground">
            <Switch size="sm" checked={isMineOnly} onCheckedChange={setIsMineOnly} />
            내 일정만
          </label>
        </div>
      </section>

      {/* 범례 — 일정 유형 색상 + 재무 오버레이 토글 */}
      <section className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border px-6 py-2">
        <span className="text-[11px] font-semibold text-muted-foreground">범례</span>
        {Object.entries(EVENT_TYPE_META).map(([key, meta]) => (
          <span key={key} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <span className="size-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </span>
        ))}
        <Separator orientation="vertical" className="hidden h-4 sm:block" />
        {(Object.keys(OVERLAY_META) as OverlayKind[]).map((kind) => (
          <span key={kind} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <Landmark className="size-3" style={{ color: OVERLAY_META[kind].color }} />
            {OVERLAY_META[kind].label}
          </span>
        ))}
        <label className="ml-auto flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <Switch size="sm" checked={showFinance} onCheckedChange={setShowFinance} />
          재무 일정 표시
        </label>
        {showFinance && overlay.isError ? (
          <span className="text-[11.5px] text-destructive">재무 일정을 불러오지 못했습니다</span>
        ) : null}
      </section>

      {/* 본문 — 월/주/일/일정 뷰 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-7 pt-4">
        {eventsQuery.isLoading ? (
          <CalendarSkeleton viewMode={viewMode} />
        ) : eventsQuery.isError ? (
          <div className="rounded-[12px] border border-border bg-background py-8">
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
                selectedDateEvents={selectedDateEvents}
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
      </div>

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
    <div className="flex min-w-0 items-center gap-2.5 border-r border-b border-border px-3 py-2 last:border-r-0 sm:border-b-0">
      <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-[11px] text-muted-foreground">{label}</div>
        <div className="whitespace-nowrap text-[13.5px] font-bold tabular-nums text-foreground">{value}</div>
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

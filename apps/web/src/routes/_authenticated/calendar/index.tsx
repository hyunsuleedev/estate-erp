import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Fragment, useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ListChecks,
  UserRound,
} from 'lucide-react';
import type {
  CalendarEvent,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  addCalendarPeriod,
  buildMonthCells,
  getCalendarRange,
  getLocalDateKey,
  getMonthDates,
  getWeekDates,
  groupEventsByDate,
  isSameCalendarDate,
  type CalendarViewMode,
} from './-calendar-view-utils';

type EventForm = {
  title: string;
  description: string;
  type: string;
  start: string;
  end: string;
  color: string;
};

type EventTypeMeta = {
  label: string;
  className: string;
  color: string;
};

const typeMeta: Record<string, EventTypeMeta> = {
  general: {
    label: '일반',
    className: 'bg-slate-100 text-slate-700',
    color: '#64748b',
  },
  viewing: {
    label: '임장',
    className: 'bg-emerald-50 text-emerald-700',
    color: '#10b981',
  },
  contract: {
    label: '계약',
    className: 'bg-amber-50 text-amber-700',
    color: '#f59e0b',
  },
  meeting: {
    label: '미팅',
    className: 'bg-blue-50 text-blue-700',
    color: '#3b82f6',
  },
  task: {
    label: '업무',
    className: 'bg-violet-50 text-violet-700',
    color: '#8b5cf6',
  },
};

const viewOptions: Array<{ value: CalendarViewMode; label: string }> = [
  { value: 'month', label: '월' },
  { value: 'week', label: '주' },
  { value: 'day', label: '일' },
  { value: 'agenda', label: '일정' },
];

const weekDayLabels = ['일', '월', '화', '수', '목', '금', '토'];
const hourSlots = Array.from({ length: 10 }, (_, index) => index + 9);

export const Route = createFileRoute('/_authenticated/calendar/')({
  component: CalendarPage,
});

function CalendarPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [userFilter, setUserFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isMineOnly, setIsMineOnly] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(createDefaultForm(new Date()));

  const range = useMemo(() => getCalendarRange(currentDate, viewMode), [currentDate, viewMode]);
  const start = range.start.toISOString();
  const end = range.end.toISOString();

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
  });

  const effectiveUserId = isMineOnly ? user?.id ?? undefined : userFilter !== 'all' ? userFilter : undefined;

  const { data: events = [] } = useQuery({
    queryKey: ['calendar-events', viewMode, start, end, effectiveUserId, typeFilter],
    queryFn: () =>
      api.calendarEvents.findAll({
        start,
        end,
        userId: effectiveUserId,
        type: typeFilter !== 'all' ? typeFilter : undefined,
      }),
  });

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === editingEventId) ?? null,
    [editingEventId, events],
  );

  useEffect(() => {
    if (!selectedEvent) return;
    setForm({
      title: selectedEvent.title,
      description: selectedEvent.description ?? '',
      type: selectedEvent.type,
      start: toDateTimeLocalInput(selectedEvent.start),
      end: toDateTimeLocalInput(selectedEvent.end),
      color: selectedEvent.color ?? getEventMeta(selectedEvent).color,
    });
  }, [selectedEvent]);

  const createMutation = useMutation({
    mutationFn: (payload: CreateCalendarEventDto) => api.calendarEvents.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      setIsDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateCalendarEventDto) =>
      api.calendarEvents.update(editingEventId as string, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      setIsDialogOpen(false);
      setEditingEventId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.calendarEvents.remove(editingEventId as string),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      setIsDialogOpen(false);
      setEditingEventId(null);
    },
  });

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
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
  const rangeLabel = viewMode === 'agenda' ? `${formatMonthTitle(currentDate)} 전체` : formatDateRange(range.start, range.end);
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
    setEditingEventId(null);
    setSelectedDate(date);
    setForm(createDefaultForm(date));
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (event: CalendarEvent) => {
    setEditingEventId(event.id);
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

  const handleSubmit = () => {
    const payload = {
      title: form.title.trim(),
      description: emptyToUndefined(form.description),
      type: form.type,
      start: new Date(form.start).toISOString(),
      end: form.end ? new Date(form.end).toISOString() : undefined,
      color: form.color,
    };

    if (editingEventId) {
      updateMutation.mutate(payload);
      return;
    }

    createMutation.mutate(payload);
  };

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
              <Button variant="ghost" size="icon-sm" onClick={() => handleNavigate(-1)} aria-label="이전 기간">
                <ChevronLeft className="size-4" />
              </Button>
              <Separator orientation="vertical" className="h-5" />
              <Button variant="ghost" size="sm" onClick={handleToday}>
                오늘
              </Button>
              <Separator orientation="vertical" className="h-5" />
              <Button variant="ghost" size="icon-sm" onClick={() => handleNavigate(1)} aria-label="다음 기간">
                <ChevronRight className="size-4" />
              </Button>
            </div>

            <Button onClick={() => handleOpenCreate(selectedDate)} className="h-9">
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
            <Select value={userFilter} onValueChange={setUserFilter} disabled={isMineOnly}>
              <SelectTrigger className="h-8 w-[150px] bg-background">
                <SelectValue placeholder="담당자" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 담당자</SelectItem>
                {employees.map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 w-[132px] bg-background">
                <SelectValue placeholder="유형" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 유형</SelectItem>
                {Object.entries(typeMeta).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    {meta.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground">
              <Switch size="sm" checked={isMineOnly} onCheckedChange={setIsMineOnly} />
              내 일정만
            </label>
          </div>
        </div>
      </section>

      {viewMode === 'month' ? (
        <MonthCalendarView
          currentDate={currentDate}
          selectedDate={selectedDate}
          eventsByDate={eventsByDate}
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
        />
      ) : null}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingEventId ? '일정 수정' : '일정 추가'}</DialogTitle>
            <DialogDescription>
              날짜와 시간, 유형, 설명을 수정할 수 있습니다.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 md:col-span-2">
              <Label>제목</Label>
              <Input
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="예: 101동 임장"
              />
            </div>

            <div className="space-y-2">
              <Label>일정 유형</Label>
              <Select
                value={form.type}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    type: value,
                    color: typeMeta[value]?.color ?? prev.color,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="유형 선택" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(typeMeta).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>색상</Label>
              <Input
                type="color"
                value={form.color}
                onChange={(event) => setForm((prev) => ({ ...prev, color: event.target.value }))}
                className="h-10 p-1"
              />
            </div>

            <div className="space-y-2">
              <Label>시작</Label>
              <Input
                type="datetime-local"
                value={form.start}
                onChange={(event) => setForm((prev) => ({ ...prev, start: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>종료</Label>
              <Input
                type="datetime-local"
                value={form.end}
                onChange={(event) => setForm((prev) => ({ ...prev, end: event.target.value }))}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>설명</Label>
              <Textarea
                rows={4}
                value={form.description}
                onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </div>
          </div>

          <DialogFooter className="justify-between sm:justify-between">
            <div>
              {editingEventId ? (
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  삭제
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                닫기
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  !form.title.trim() ||
                  !form.start ||
                  (editingEventId ? updateMutation.isPending : createMutation.isPending)
                }
              >
                저장
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function MonthCalendarView({
  currentDate,
  selectedDate,
  eventsByDate,
  selectedDateEvents,
  onCreate,
  onEdit,
  onSelectDate,
}: {
  currentDate: Date;
  selectedDate: Date;
  eventsByDate: Map<string, CalendarEvent[]>;
  selectedDateEvents: CalendarEvent[];
  onCreate: (date: Date) => void;
  onEdit: (event: CalendarEvent) => void;
  onSelectDate: (date: Date) => void;
}) {
  const cells = buildMonthCells(currentDate);

  return (
    <div className="grid overflow-hidden rounded-lg border bg-background shadow-xs xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 overflow-x-auto xl:border-r">
        <div className="min-w-[760px] xl:min-w-0">
          <div className="grid grid-cols-7 border-b bg-muted/30">
            {weekDayLabels.map((day, index) => (
              <div
                key={day}
                className={cn(
                  'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-muted-foreground',
                  index === 0 && 'text-rose-500',
                  index === 6 && 'text-blue-500',
                )}
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((cell) => {
              const dayEvents = eventsByDate.get(cell.key) ?? [];
              const isSelected = isSameCalendarDate(selectedDate, cell.date);
              const isToday = isSameCalendarDate(new Date(), cell.date);

              return (
                <div
                  key={cell.key}
                  className={cn(
                    'min-h-[124px] border-b border-r bg-background p-2.5 text-left outline-none transition-colors md:min-h-[140px]',
                    isSelected ? 'bg-blue-50/60 ring-1 ring-inset ring-blue-200' : 'hover:bg-muted/30',
                    cell.isOutsideMonth && 'bg-muted/20 text-muted-foreground',
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
                        isToday && 'bg-primary text-primary-foreground shadow-sm',
                        !isToday && isSelected && 'bg-background text-foreground shadow-xs',
                        !isToday && cell.isOutsideMonth && 'text-muted-foreground/60',
                        !isToday && !isSelected && !cell.isOutsideMonth && 'text-foreground',
                      )}
                    >
                      {cell.date.getDate()}
                    </span>
                    {dayEvents.length > 0 ? (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
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
        onCreate={onCreate}
        onEdit={onEdit}
      />
    </div>
  );
}

function MonthEventPill({
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
      className="block w-full rounded-md border border-l-[3px] px-2 py-1 text-left shadow-xs transition-colors hover:bg-background"
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

function SelectedDayPanel({
  selectedDate,
  selectedDateEvents,
  onCreate,
  onEdit,
}: {
  selectedDate: Date;
  selectedDateEvents: CalendarEvent[];
  onCreate: (date: Date) => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  return (
    <aside className="flex min-h-[560px] flex-col bg-muted/[0.16]">
      <div className="border-b bg-background px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[11px] font-medium uppercase tracking-[0.05em] text-muted-foreground">
              선택된 날짜
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{formatDayTitle(selectedDate)}</h2>
              <span className="text-sm text-muted-foreground">{formatWeekday(selectedDate)}</span>
            </div>
          </div>
          {isSameCalendarDate(new Date(), selectedDate) ? (
            <Badge className="border-0 bg-primary text-primary-foreground">오늘</Badge>
          ) : null}
        </div>
        <div className="mt-3 flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2 text-xs">
          <span className="text-muted-foreground">선택일 일정</span>
          <span className="font-mono font-semibold tabular-nums">{selectedDateEvents.length}건</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {selectedDateEvents.length === 0 ? (
          <div className="px-5 py-10 text-sm text-muted-foreground">등록된 일정이 없습니다.</div>
        ) : (
          selectedDateEvents.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onEdit(event)}
              className="flex w-full items-start gap-3 border-b bg-background px-5 py-3.5 text-left transition-colors hover:bg-muted/30"
            >
              <span
                className="mt-1 h-11 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: getEventColor(event) }}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[11px] text-muted-foreground tabular-nums">
                  {formatEventTimeRange(event)}
                </span>
                <span className="mt-1 block truncate text-sm font-semibold">{event.title}</span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {formatEventContext(event)}
                </span>
              </span>
            </button>
          ))
        )}
      </div>

      <div className="border-t bg-background p-3">
        <Button variant="outline" className="w-full justify-start" onClick={() => onCreate(selectedDate)}>
          <CalendarPlus2 className="size-4" />
          이 날짜에 일정 추가
        </Button>
      </div>
    </aside>
  );
}

function TimeGridCalendarView({
  dates,
  eventsByDate,
  selectedDate,
  onCreate,
  onEdit,
  onSelectDate,
}: {
  dates: Date[];
  eventsByDate: Map<string, CalendarEvent[]>;
  selectedDate: Date;
  onCreate: (date: Date) => void;
  onEdit: (event: CalendarEvent) => void;
  onSelectDate: (date: Date) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-background shadow-xs">
      <div
        className="grid"
        style={{
          gridTemplateColumns: `76px repeat(${dates.length}, minmax(168px, 1fr))`,
          minWidth: dates.length === 1 ? '560px' : '1040px',
        }}
      >
        <div className="border-b border-r bg-muted/30 px-3 py-3 text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          KST
        </div>
        {dates.map((date) => {
          const isToday = isSameCalendarDate(new Date(), date);
          const isSelected = isSameCalendarDate(selectedDate, date);
          const dayOfWeek = date.getDay();

          return (
            <button
              key={getLocalDateKey(date)}
              type="button"
              onClick={() => onSelectDate(date)}
              className={cn(
                'border-b border-r bg-muted/20 px-3 py-3 text-left transition-colors hover:bg-muted/40',
                isToday && 'bg-blue-50',
                isSelected && !isToday && 'bg-background',
              )}
            >
              <div
                className={cn(
                  'text-[10px] font-semibold tracking-[0.06em] text-muted-foreground',
                  dayOfWeek === 0 && 'text-rose-600',
                  dayOfWeek === 6 && 'text-blue-600',
                  isToday && 'text-primary',
                )}
              >
                {weekDayLabels[dayOfWeek]}
                {isToday ? ' · 오늘' : ''}
              </div>
              <div className={cn('mt-1 text-lg font-semibold', isToday && 'text-primary')}>
                {date.getDate()}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {(eventsByDate.get(getLocalDateKey(date)) ?? []).length}건
              </div>
            </button>
          );
        })}

        {hourSlots.map((hour) => (
          <Fragment key={hour}>
            <div className="min-h-[86px] border-r border-t bg-muted/20 px-2 py-2 text-right font-mono text-[10px] text-muted-foreground tabular-nums">
              {String(hour).padStart(2, '0')}:00
            </div>
            {dates.map((date) => {
              const dayEvents = eventsByDate.get(getLocalDateKey(date)) ?? [];
              const hourEvents = dayEvents.filter((event) => new Date(event.start).getHours() === hour);
              const isToday = isSameCalendarDate(new Date(), date);

              return (
                <div
                  key={`${getLocalDateKey(date)}-${hour}`}
                  className={cn(
                    'min-h-[86px] border-r border-t bg-background p-2',
                    isToday && 'bg-blue-50/30',
                  )}
                  onDoubleClick={() => {
                    const dateWithHour = new Date(date);
                    dateWithHour.setHours(hour, 0, 0, 0);
                    onCreate(dateWithHour);
                  }}
                >
                  <div className="space-y-1.5">
                    {hourEvents.map((event) => (
                      <WeekEventBlock key={event.id} event={event} onEdit={onEdit} />
                    ))}
                  </div>
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function WeekEventBlock({
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
      onClick={() => onEdit(event)}
      className="w-full rounded-md border border-l-[3px] px-2.5 py-2 text-left shadow-xs transition-colors hover:bg-background"
      style={{
        backgroundColor: withAlpha(color, '1F'),
        borderLeftColor: color,
      }}
    >
      <div className="truncate text-[11px] font-semibold text-foreground">
        {event.title}
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-muted-foreground tabular-nums">
        {formatEventTimeRange(event)}
      </div>
      <div className="mt-1 truncate text-[10px] text-muted-foreground">{formatEventContext(event)}</div>
    </button>
  );
}

function AgendaCalendarView({
  dates,
  eventsByDate,
  onEdit,
}: {
  dates: Date[];
  eventsByDate: Map<string, CalendarEvent[]>;
  onEdit: (event: CalendarEvent) => void;
}) {
  const dayGroups = dates.map((date) => ({
    date,
    events: eventsByDate.get(getLocalDateKey(date)) ?? [],
  }));

  if (dayGroups.every((group) => group.events.length === 0)) {
    return (
      <div className="rounded-lg border bg-background px-6 py-14 text-center text-sm text-muted-foreground shadow-xs">
        이번 달 일정이 없습니다.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-background shadow-xs">
      {dayGroups.map(({ date, events }) => {
        if (events.length === 0) return null;

        return (
          <section key={getLocalDateKey(date)} className="grid border-b last:border-b-0 md:grid-cols-[116px_minmax(0,1fr)]">
            <div className="border-b bg-muted/20 px-4 py-4 md:border-r md:border-b-0">
              <div className="flex items-center gap-3 md:block">
                <div
                  className={cn(
                    'text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground',
                    date.getDay() === 0 && 'text-rose-600',
                    date.getDay() === 6 && 'text-blue-600',
                    isSameCalendarDate(new Date(), date) && 'text-primary',
                  )}
                >
                  {weekDayLabels[date.getDay()]}
                </div>
                <div
                  className={cn(
                    'text-3xl font-semibold tracking-tight md:mt-1',
                    isSameCalendarDate(new Date(), date) && 'text-primary',
                  )}
                >
                  {date.getDate()}
                </div>
                <div className="min-w-0 flex-1 md:mt-2">
                  <div className="truncate text-sm font-semibold">{formatRelativeDay(date)}</div>
                  <div className="truncate text-xs text-muted-foreground">{events.length}건</div>
                </div>
                {isSameCalendarDate(new Date(), date) ? (
                  <Badge className="border-0 bg-primary text-primary-foreground md:mt-3">오늘</Badge>
                ) : null}
              </div>
            </div>

            <div className="divide-y">
              {events.map((event) => (
                <AgendaEventRow key={event.id} event={event} onEdit={onEdit} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AgendaEventRow({
  event,
  onEdit,
}: {
  event: CalendarEvent;
  onEdit: (event: CalendarEvent) => void;
}) {
  const color = getEventColor(event);
  const status = getEventStatus(event);

  return (
    <button
      type="button"
      onClick={() => onEdit(event)}
      className={cn(
        'grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/30 sm:grid-cols-[18px_104px_minmax(0,1fr)_auto] sm:px-5',
        status.state === 'active' && 'bg-blue-50/60',
      )}
    >
      <span
        className={cn(
          'size-3.5 rounded-sm border',
          status.state === 'done' ? 'border-emerald-500 bg-emerald-500' : 'border-muted-foreground/40',
        )}
      />
      <span className="hidden font-mono text-xs text-muted-foreground tabular-nums sm:block">
        {formatEventTimeRange(event)}
      </span>
      <span className="min-w-0">
        <span className="mb-1 flex min-w-0 items-center gap-2">
          <span className="h-4 w-1 shrink-0 rounded-full" style={{ backgroundColor: color }} />
          <span className={cn('block truncate text-sm font-semibold', status.state === 'done' && 'text-muted-foreground line-through')}>
            {event.title}
          </span>
        </span>
        <span className="mb-0.5 block font-mono text-[11px] text-muted-foreground tabular-nums sm:hidden">
          {formatEventTimeRange(event)}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {formatEventContext(event)}
        </span>
      </span>
      <Badge className={cn('shrink-0 border-0', status.className)}>{status.label}</Badge>
    </button>
  );
}

function createDefaultForm(date: Date): EventForm {
  const start = new Date(date);
  start.setHours(10, 0, 0, 0);
  const end = new Date(date);
  end.setHours(11, 0, 0, 0);

  return {
    title: '',
    description: '',
    type: 'general',
    start: toDateTimeLocalInput(start.toISOString()),
    end: toDateTimeLocalInput(end.toISOString()),
    color: typeMeta.general.color,
  };
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

function getEventMeta(event: CalendarEvent) {
  return typeMeta[event.type] ?? typeMeta.general;
}

function getEventColor(event: CalendarEvent) {
  return event.color ?? getEventMeta(event).color;
}

function withAlpha(color: string, alphaHex: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(color) ? `${color}${alphaHex}` : color;
}

function getEventStatus(event: CalendarEvent) {
  const now = new Date();
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : start;

  if (end < now) {
    return { state: 'done', label: '완료', className: 'bg-emerald-50 text-emerald-700' };
  }

  if (start <= now && now <= end) {
    return { state: 'active', label: '진행중', className: 'bg-primary text-primary-foreground' };
  }

  const diffMinutes = Math.round((start.getTime() - now.getTime()) / 60_000);

  if (diffMinutes > 0 && diffMinutes <= 120) {
    return { state: 'soon', label: `${Math.ceil(diffMinutes / 60)}시간 후`, className: 'bg-amber-50 text-amber-700' };
  }

  return { state: 'upcoming', label: '예정', className: 'bg-muted text-muted-foreground' };
}

function formatEventContext(event: CalendarEvent) {
  const chunks = [
    event.property?.site?.name ? `매물 · ${event.property.site.name}` : null,
    event.contact?.name ? `연락처 · ${event.contact.name}` : null,
    event.deal?.stage ? `거래 · ${event.deal.stage}` : null,
    event.user?.name ? `${event.user.name} 담당` : null,
  ].filter(Boolean);

  return chunks.length > 0 ? chunks.join(' · ') : getEventMeta(event).label;
}

function formatEventTimeRange(event: CalendarEvent) {
  if (event.allDay) return '종일';
  return event.end ? `${formatTime(event.start)} - ${formatTime(event.end)}` : formatTime(event.start);
}

function toDateTimeLocalInput(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function formatMonthTitle(date: Date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatDayTitle(date: Date) {
  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatWeekday(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', { weekday: 'long' }).format(date);
}

function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(date);
}

function formatRelativeDay(date: Date) {
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  if (isSameCalendarDate(date, today)) return '오늘';
  if (isSameCalendarDate(date, tomorrow)) return '내일';

  return formatWeekday(date);
}

function formatDateRange(start: Date, end: Date) {
  if (isSameCalendarDate(start, end)) {
    return `${start.getMonth() + 1}월 ${start.getDate()}일`;
  }

  if (start.getMonth() === end.getMonth()) {
    return `${start.getMonth() + 1}월 ${start.getDate()}일 - ${end.getDate()}일`;
  }

  return `${start.getMonth() + 1}월 ${start.getDate()}일 - ${end.getMonth() + 1}월 ${end.getDate()}일`;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

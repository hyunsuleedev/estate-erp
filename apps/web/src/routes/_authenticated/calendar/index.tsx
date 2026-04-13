import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  CalendarPlus2,
  ChevronLeft,
  ChevronRight,
  Clock3,
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type EventForm = {
  title: string;
  description: string;
  type: string;
  start: string;
  end: string;
  color: string;
};

const typeMeta: Record<string, { label: string; className: string; color: string }> = {
  general: { label: '일반', className: 'bg-slate-100 text-slate-700', color: '#64748b' },
  viewing: { label: '임장', className: 'bg-emerald-50 text-emerald-700', color: '#10b981' },
  contract: { label: '계약', className: 'bg-amber-50 text-amber-700', color: '#f59e0b' },
  meeting: { label: '미팅', className: 'bg-blue-50 text-blue-700', color: '#3b82f6' },
  task: { label: '업무', className: 'bg-violet-50 text-violet-700', color: '#8b5cf6' },
};

export const Route = createFileRoute('/_authenticated/calendar/')({
  component: CalendarPage,
});

function CalendarPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [currentDate, setCurrentDate] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [userFilter, setUserFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isMineOnly, setIsMineOnly] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [form, setForm] = useState<EventForm>(createDefaultForm(new Date()));

  const { start, end } = useMemo(() => getMonthRange(currentDate), [currentDate]);

  const { data: employees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
  });

  const effectiveUserId = isMineOnly ? user?.id ?? undefined : userFilter !== 'all' ? userFilter : undefined;

  const { data: events = [] } = useQuery({
    queryKey: ['calendar-events', start, end, effectiveUserId, typeFilter],
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
      color: selectedEvent.color ?? typeMeta[selectedEvent.type]?.color ?? '#64748b',
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

  const metrics = useMemo(() => {
    return [
      { label: '월간 일정', value: `${events.length}건`, icon: Clock3 },
      {
        label: '계약 일정',
        value: `${events.filter((event) => event.type === 'contract').length}건`,
        icon: CalendarPlus2,
      },
      {
        label: '임장 일정',
        value: `${events.filter((event) => event.type === 'viewing').length}건`,
        icon: Clock3,
      },
      {
        label: '내 일정',
        value: `${events.filter((event) => event.userId === user?.id).length}건`,
        icon: UserRound,
      },
    ];
  }, [events, user?.id]);

  const daysInMonth = getDaysOfMonth(currentDate);
  const firstDayOfWeek = startOfMonth(currentDate).getDay();
  const blanks = Array.from({ length: firstDayOfWeek }, (_, index) => index);
  const selectedDateEvents = events.filter((event) => isSameDay(event.start, selectedDate));

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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">캘린더</h1>
            <Badge variant="outline">
              {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            일정형 CRM 이벤트를 날짜 기준으로 관리합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCurrentDate(startOfMonth(new Date()))}>
            오늘
          </Button>
          <Button onClick={() => handleOpenCreate(selectedDate)}>
            <CalendarPlus2 className="size-4" />
            일정 추가
          </Button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="gap-3 py-4">
            <CardContent className="flex items-center justify-between px-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">{metric.label}</p>
                <p className="text-xl font-semibold tracking-tight">{metric.value}</p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <metric.icon className="size-4" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() =>
                setCurrentDate(startOfMonth(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1)))
              }
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() =>
                setCurrentDate(startOfMonth(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1)))
              }
            >
              <ChevronRight className="size-4" />
            </Button>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <Select value={userFilter} onValueChange={setUserFilter} disabled={isMineOnly}>
                <SelectTrigger className="w-[160px]">
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
                <SelectTrigger className="w-[140px]">
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
              <Button
                variant={isMineOnly ? 'default' : 'outline'}
                onClick={() => setIsMineOnly((prev) => !prev)}
              >
                내 일정만
              </Button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.4fr_0.8fr]">
            <div className="rounded-xl bg-muted/40">
              <div className="grid grid-cols-7 border-b border-border/40">
                {['일', '월', '화', '수', '목', '금', '토'].map((day, index) => (
                  <div
                    key={day}
                    className={cn(
                      'px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground',
                      index === 0 && 'text-rose-500',
                      index === 6 && 'text-blue-500',
                    )}
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {blanks.map((index) => (
                  <div
                    key={`blank-${index}`}
                    className="min-h-[110px] border-b border-r border-border/40 bg-background/20"
                  />
                ))}
                {daysInMonth.map((day) => {
                  const cellDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
                  const dayEvents = events.filter((event) => isSameDay(event.start, cellDate));
                  const isSelected = isSameCalendarDate(selectedDate, cellDate);
                  const isToday = isSameCalendarDate(new Date(), cellDate);

                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setSelectedDate(cellDate)}
                      className={cn(
                        'min-h-[110px] border-b border-r border-border/40 px-2 py-2 text-left transition-colors',
                        isSelected && 'bg-primary/5',
                        !isSelected && 'hover:bg-background/60',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={cn(
                            'inline-flex size-6 items-center justify-center rounded-full text-xs font-medium',
                            isToday ? 'bg-primary text-primary-foreground' : 'text-foreground',
                          )}
                        >
                          {day}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {dayEvents.length > 0 ? `${dayEvents.length}건` : ''}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1">
                        {dayEvents.slice(0, 3).map((event) => (
                          <button
                            key={event.id}
                            type="button"
                            onClick={(clickEvent) => {
                              clickEvent.stopPropagation();
                              handleOpenEdit(event);
                            }}
                            className="block w-full truncate rounded px-1.5 py-1 text-left text-[11px] font-medium"
                            style={{
                              backgroundColor: `${event.color ?? typeMeta[event.type]?.color ?? '#64748b'}20`,
                              color: event.color ?? typeMeta[event.type]?.color ?? '#64748b',
                            }}
                          >
                            {event.title}
                          </button>
                        ))}
                        {dayEvents.length > 3 ? (
                          <div className="px-1.5 text-[10px] text-muted-foreground">
                            +{dayEvents.length - 3}개 더보기
                          </div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <Card className="gap-4 py-5">
              <CardHeader className="px-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{formatDate(selectedDate)}</CardTitle>
                    <CardDescription>선택한 날짜의 일정과 CRM 연결 정보를 보여줍니다.</CardDescription>
                  </div>
                  <Button size="xs" onClick={() => handleOpenCreate(selectedDate)}>
                    추가
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 px-5">
                {selectedDateEvents.length === 0 ? (
                  <p className="text-sm text-muted-foreground">등록된 일정이 없습니다.</p>
                ) : (
                  selectedDateEvents.map((event) => (
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => handleOpenEdit(event)}
                      className="w-full rounded-xl border border-border/60 px-3 py-3 text-left transition-colors hover:bg-muted/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{event.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatDateTime(event.start)}
                            {event.end ? ` - ${formatTime(event.end)}` : ''}
                          </p>
                        </div>
                        <Badge className={cn('border-0', typeMeta[event.type]?.className)}>
                          {typeMeta[event.type]?.label ?? event.type}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                        <p>{event.user?.name ?? '담당자 없음'}</p>
                        {event.contact?.name ? <p>연락처 · {event.contact.name}</p> : null}
                        {event.property?.site?.name ? <p>매물 · {event.property.site.name}</p> : null}
                        {event.deal?.stage ? <p>거래 단계 · {event.deal.stage}</p> : null}
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

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

function getMonthRange(date: Date) {
  const startDate = startOfMonth(date);
  const endDate = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

function getDaysOfMonth(date: Date) {
  return Array.from(
    { length: new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate() },
    (_, index) => index + 1,
  );
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function isSameDay(isoString: string, date: Date) {
  return isSameCalendarDate(new Date(isoString), date);
}

function isSameCalendarDate(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function toDateTimeLocalInput(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
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

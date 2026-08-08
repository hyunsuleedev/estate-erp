import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  CalendarEvent,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { useAuth } from '@/providers/auth-provider';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/domain';
import { EVENT_TYPE_META, toDateInput, toDateTimeLocalInput } from './-event-meta';
import {
  EMPTY_EVENT_LINKS,
  EventLinkRow,
  linksFromEvent,
  type EventLinkKind,
  type EventLinks,
} from './-event-link-picker';

type EventForm = {
  title: string;
  description: string;
  type: string;
  allDay: boolean;
  start: string;
  end: string;
  color: string;
  links: EventLinks;
};

const LINK_KINDS: EventLinkKind[] = ['contact', 'property', 'listing', 'match', 'deal'];

function createDefaultForm(date: Date, defaultEnd: Date | null = null, allDay = false): EventForm {
  const start = new Date(date);
  if (!allDay && start.getHours() === 0 && start.getMinutes() === 0) start.setHours(10, 0, 0, 0);

  const end = defaultEnd ? new Date(defaultEnd) : new Date(start);
  if (!defaultEnd) {
    if (allDay) end.setDate(start.getDate() + 1);
    else end.setHours(start.getHours() + 1, start.getMinutes(), 0, 0);
  }

  // FullCalendar/Google Calendar의 종일 종료일은 exclusive이므로 폼에는 마지막 포함일을 표시한다.
  const inclusiveAllDayEnd = new Date(end);
  if (allDay) inclusiveAllDayEnd.setDate(inclusiveAllDayEnd.getDate() - 1);

  return {
    title: '',
    description: '',
    type: 'general',
    allDay,
    start: allDay ? toDateInput(start.toISOString()) : toDateTimeLocalInput(start.toISOString()),
    end: allDay
      ? toDateInput(inclusiveAllDayEnd.toISOString())
      : toDateTimeLocalInput(end.toISOString()),
    color: EVENT_TYPE_META.general.color,
    links: EMPTY_EVENT_LINKS,
  };
}

function toAllDayEndInput(startValue: string, endValue: string) {
  const start = new Date(startValue);
  const end = new Date(endValue);

  // 신규 일정은 exclusive 자정, 기존 데이터는 같은 날 23:59:59 형식일 수 있다.
  if (
    end > start &&
    end.getHours() === 0 &&
    end.getMinutes() === 0 &&
    end.getSeconds() === 0
  ) {
    end.setDate(end.getDate() - 1);
  }

  return toDateInput(end.toISOString());
}

function formFromEvent(event: CalendarEvent): EventForm {
  return {
    title: event.title,
    description: event.description ?? '',
    type: event.type,
    allDay: event.allDay,
    start: event.allDay ? toDateInput(event.start) : toDateTimeLocalInput(event.start),
    end: event.end
      ? event.allDay
        ? toAllDayEndInput(event.start, event.end)
        : toDateTimeLocalInput(event.end)
      : '',
    color: event.color ?? (EVENT_TYPE_META[event.type] ?? EVENT_TYPE_META.general).color,
    links: linksFromEvent(event),
  };
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * 일정 생성/수정 다이얼로그 — 기본 필드 + CRM 연결(연락처/매물/매칭/거래) 편집,
 * 종일 일정 토글, 종료 시간 제거(null), 역할 기반 삭제 제한을 지원한다.
 */
export function EventDialog({
  open,
  onOpenChange,
  event,
  defaultDate,
  defaultEnd,
  defaultAllDay,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null이면 생성 모드 */
  event: CalendarEvent | null;
  defaultDate: Date;
  /** FullCalendar 선택 범위의 exclusive 종료 시각 */
  defaultEnd?: Date | null;
  defaultAllDay?: boolean;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<EventForm>(() =>
    createDefaultForm(defaultDate, defaultEnd, defaultAllDay),
  );
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      event ? formFromEvent(event) : createDefaultForm(defaultDate, defaultEnd, defaultAllDay),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, event?.id, defaultDate, defaultEnd, defaultAllDay]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['calendar-events'] });

  const createMutation = useMutation({
    mutationFn: (payload: CreateCalendarEventDto) => api.calendarEvents.create(payload),
    onSuccess: () => {
      invalidate();
      toast.success('일정이 추가되었습니다.');
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(`일정 추가에 실패했습니다: ${error.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateCalendarEventDto) =>
      api.calendarEvents.update(event?.id as string, payload),
    onSuccess: () => {
      invalidate();
      toast.success('일정이 수정되었습니다.');
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(`일정 수정에 실패했습니다: ${error.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.calendarEvents.remove(event?.id as string),
    onSuccess: () => {
      invalidate();
      toast.success('일정이 삭제되었습니다.');
      setIsDeleteConfirmOpen(false);
      onOpenChange(false);
    },
    onError: (error: Error) => toast.error(`일정 삭제에 실패했습니다: ${error.message}`),
  });

  // PRD §3: 팀 일정 삭제는 owner/manager 중심 — agent는 본인 일정만 삭제 가능
  const canDelete =
    !!event && (user?.role === 'owner' || user?.role === 'manager' || event.userId === user?.id);

  const handleTypeChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      type: value,
      color: EVENT_TYPE_META[value]?.color ?? prev.color,
    }));
  };

  const handleAllDayChange = (allDay: boolean) => {
    setForm((prev) => ({
      ...prev,
      allDay,
      start: allDay ? prev.start.slice(0, 10) : prev.start ? `${prev.start.slice(0, 10)}T10:00` : '',
      end: allDay ? prev.end.slice(0, 10) : prev.end ? `${prev.end.slice(0, 10)}T11:00` : '',
    }));
  };

  const handleSubmit = () => {
    if (!form.title.trim() || !form.start) return;

    const startDate = form.allDay ? new Date(`${form.start}T00:00:00`) : new Date(form.start);
    const endDate = form.end
      ? form.allDay
        ? (() => {
            const exclusiveEnd = new Date(`${form.end}T00:00:00`);
            exclusiveEnd.setDate(exclusiveEnd.getDate() + 1);
            return exclusiveEnd;
          })()
        : new Date(form.end)
      : null;

    if (Number.isNaN(startDate.getTime())) {
      toast.error('시작 일시가 올바르지 않습니다.');
      return;
    }

    if (endDate && endDate < startDate) {
      toast.error('종료 시간은 시작 시간 이후여야 합니다.');
      return;
    }

    const base = {
      title: form.title.trim(),
      description: emptyToUndefined(form.description),
      type: form.type,
      allDay: form.allDay,
      start: startDate.toISOString(),
      color: form.color,
    };

    if (event) {
      updateMutation.mutate({
        ...base,
        // 빈 값은 null로 보내 기존 종료 시간을 제거한다 (undefined는 서버가 무시)
        end: endDate ? endDate.toISOString() : null,
        contactId: form.links.contact?.id ?? null,
        propertyId: form.links.property?.id ?? null,
        listingId: form.links.listing?.id ?? null,
        matchId: form.links.match?.id ?? null,
        dealId: form.links.deal?.id ?? null,
      });
      return;
    }

    createMutation.mutate({
      ...base,
      end: endDate ? endDate.toISOString() : undefined,
      contactId: form.links.contact?.id,
      propertyId: form.links.property?.id,
      listingId: form.links.listing?.id,
      matchId: form.links.match?.id,
      dealId: form.links.deal?.id,
    });
  };

  const isSaving = event ? updateMutation.isPending : createMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-3rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-6 pb-4 pt-5">
          <DialogTitle className="text-base">{event ? '일정 수정' : '새 일정'}</DialogTitle>
          <DialogDescription className="text-xs">
            날짜와 시간, 유형, 설명을 입력하고 관련 CRM 항목을 연결할 수 있습니다.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>
              제목 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={form.title}
              onChange={(changeEvent) =>
                setForm((prev) => ({ ...prev, title: changeEvent.target.value }))
              }
              placeholder="예: 래미안고덕 101동 임장"
              className="h-10 text-[15px] font-medium shadow-none"
            />
          </div>

          <div className="space-y-2">
            <Label>일정 유형</Label>
            <Select value={form.type} onValueChange={handleTypeChange}>
              <SelectTrigger className="w-full bg-muted/25 shadow-none">
                <SelectValue placeholder="유형 선택" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(EVENT_TYPE_META).map(([key, meta]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                      {meta.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>색상</Label>
            <div className="flex items-center gap-3">
              <Input
                type="color"
                value={form.color}
                onChange={(changeEvent) =>
                  setForm((prev) => ({ ...prev, color: changeEvent.target.value }))
                }
                className="h-9 w-16 bg-muted/25 p-1 shadow-none"
              />
              <label className="flex h-9 flex-1 items-center justify-between gap-2 rounded-md border bg-muted/25 px-3 text-xs text-muted-foreground">
                종일
                <Switch size="sm" checked={form.allDay} onCheckedChange={handleAllDayChange} />
              </label>
            </div>
          </div>

          <div className="space-y-2">
            <Label>
              시작 <span className="text-destructive">*</span>
            </Label>
            <Input
              type={form.allDay ? 'date' : 'datetime-local'}
              value={form.start}
              onChange={(changeEvent) =>
                setForm((prev) => ({ ...prev, start: changeEvent.target.value }))
              }
              className="shadow-none"
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center justify-between">
              종료
              {form.end ? (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, end: '' }))}
                  className="text-xs font-normal text-muted-foreground underline-offset-2 hover:underline"
                >
                  지우기
                </button>
              ) : null}
            </Label>
            <Input
              type={form.allDay ? 'date' : 'datetime-local'}
              value={form.end}
              onChange={(changeEvent) =>
                setForm((prev) => ({ ...prev, end: changeEvent.target.value }))
              }
              className="shadow-none"
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>설명</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(changeEvent) =>
                setForm((prev) => ({ ...prev, description: changeEvent.target.value }))
              }
              placeholder="메모, 준비할 내용, 상대방 요청사항을 적어두세요."
              className="min-h-24 resize-y shadow-none"
            />
          </div>

          <div className="space-y-1 border-t border-border pt-4 md:col-span-2">
            <div className="mb-2">
              <div className="text-xs font-semibold text-foreground">CRM 연결</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                연결한 항목은 일정에서 바로 열 수 있습니다.
              </div>
            </div>
            {LINK_KINDS.map((kind) => (
              <EventLinkRow
                key={kind}
                kind={kind}
                value={form.links[kind]}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, links: { ...prev.links, [kind]: value } }))
                }
              />
            ))}
          </div>
          </div>
        </div>

        <DialogFooter className="border-t border-border bg-muted/25 px-6 py-3.5 sm:justify-between">
          <div>
            {event ? (
              <Button
                variant="destructive"
                onClick={() => setIsDeleteConfirmOpen(true)}
                disabled={!canDelete || deleteMutation.isPending}
                title={canDelete ? undefined : '다른 직원의 일정은 사장님/팀장만 삭제할 수 있습니다'}
              >
                삭제
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              닫기
            </Button>
            <Button onClick={handleSubmit} disabled={!form.title.trim() || !form.start || isSaving}>
              {isSaving ? '저장 중…' : '저장'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title="일정을 삭제할까요?"
        description={event ? `"${event.title}" 일정이 영구히 삭제됩니다.` : undefined}
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </Dialog>
  );
}

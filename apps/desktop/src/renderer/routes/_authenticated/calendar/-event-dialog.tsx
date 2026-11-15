import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Link2,
  PanelRightClose,
  PanelRightOpen,
  Text,
  Trash2,
  X,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  CalendarEvent,
  CreateCalendarEventDto,
  UpdateCalendarEventDto,
} from "@estate-erp/api-client";

import type { CalendarDraftPreview } from "./-event-draft-preview";

import { api } from "@/lib/api";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/domain";
import {
  EVENT_TYPE_META,
  toDateInput,
  toDateTimeLocalInput,
} from "./-event-meta";
import {
  EMPTY_EVENT_LINKS,
  EventLinkRow,
  linksFromEvent,
  type EventLinkKind,
  type EventLinks,
} from "./-event-link-picker";

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

export interface EventDraftPreset {
  allDay?: boolean;
  start?: string;
  end?: string;
  title?: string;
  description?: string;
  type?: string;
  links?: Partial<EventLinks>;
}

const LINK_KINDS: EventLinkKind[] = [
  "contact",
  "property",
  "listing",
  "match",
  "deal",
];

function createDefaultForm(
  date: Date,
  draft?: EventDraftPreset | null,
): EventForm {
  const start = new Date(draft?.start ?? date);
  if (!draft?.start && start.getHours() === 0 && start.getMinutes() === 0)
    start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setHours(start.getHours() + 1, start.getMinutes(), 0, 0);
  if (draft?.end) end.setTime(new Date(draft.end).getTime());
  const type = draft?.type ?? "general";

  return {
    title: draft?.title ?? "",
    description: draft?.description ?? "",
    type,
    allDay: draft?.allDay ?? false,
    start: draft?.allDay
      ? toDateInput(start.toISOString())
      : toDateTimeLocalInput(start.toISOString()),
    end: draft?.allDay
      ? toDateInput(end.toISOString())
      : toDateTimeLocalInput(end.toISOString()),
    color: (EVENT_TYPE_META[type] ?? EVENT_TYPE_META.general).color,
    links: { ...EMPTY_EVENT_LINKS, ...draft?.links },
  };
}

function formFromEvent(event: CalendarEvent): EventForm {
  return {
    title: event.title,
    description: event.description ?? "",
    type: event.type,
    allDay: event.allDay,
    start: event.allDay
      ? toDateInput(event.start)
      : toDateTimeLocalInput(event.start),
    end: event.end
      ? event.allDay
        ? toDateInput(event.end)
        : toDateTimeLocalInput(event.end)
      : "",
    color:
      event.color ??
      (EVENT_TYPE_META[event.type] ?? EVENT_TYPE_META.general).color,
    links: linksFromEvent(event),
  };
}

function emptyToUndefined(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * 캘린더를 가리지 않는 일정 편집 카드. 오른쪽 고정과 CRM 연결을 지원한다.
 * 기본 필드 + CRM 연결(연락처/매물/매칭/거래) 편집,
 * 종일 일정 토글, 종료 시간 제거(null), 역할 기반 삭제 제한을 지원한다.
 */
export function EventEditor({
  open,
  onOpenChange,
  event,
  defaultDate,
  draft,
  onPreviewChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null이면 생성 모드 */
  event: CalendarEvent | null;
  defaultDate: Date;
  /** 업무함 등 외부 문맥에서 새 일정을 만들 때 사용할 초안 */
  draft?: EventDraftPreset | null;
  onPreviewChange: (preview: CalendarDraftPreview | null) => void;
}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<EventForm>(() =>
    createDefaultForm(defaultDate, draft),
  );
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);
  const [linksExpanded, setLinksExpanded] = useState(false);
  const [formError, setFormError] = useState("");
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const editorSession = useRef<string | null>(null);
  const rememberedTimes = useRef({ start: "10:00", end: "11:00" });

  useEffect(() => {
    if (!open) {
      editorSession.current = null;
      return;
    }
    const identity = event?.id ?? "new";
    const next = event
      ? formFromEvent(event)
      : createDefaultForm(defaultDate, draft);
    if (editorSession.current !== identity) {
      editorSession.current = identity;
      rememberedTimes.current = {
        start: next.start.slice(11, 16) || "10:00",
        end: next.end.slice(11, 16) || "11:00",
      };
      setForm(next);
      setShowEndDate(false);
      setLinksExpanded(Object.values(next.links).some(Boolean));
      setFormError("");
    } else if (!event) {
      // Selecting another slot updates the draft's dates without losing its text.
      setForm((previous) => ({
        ...previous,
        start: next.start,
        end: next.end,
        allDay: next.allDay,
      }));
    }
  }, [defaultDate, draft, event, open]);

  useEffect(() => {
    if (!open || event) {
      onPreviewChange(null);
      return;
    }
    const start = new Date(form.allDay ? `${form.start}T00:00:00` : form.start);
    const end = form.end
      ? new Date(form.allDay ? `${form.end}T23:59:59` : form.end)
      : null;
    if (
      !Number.isFinite(start.getTime()) ||
      (end && (!Number.isFinite(end.getTime()) || end < start))
    ) {
      onPreviewChange(null);
      return;
    }
    onPreviewChange({
      title: form.title,
      start: start.toISOString(),
      end: end?.toISOString() ?? null,
      allDay: form.allDay,
      color: form.color,
    });
  }, [
    open,
    event,
    form.title,
    form.start,
    form.end,
    form.allDay,
    form.color,
    onPreviewChange,
  ]);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["calendar-events"] });

  const createMutation = useMutation({
    mutationFn: (payload: CreateCalendarEventDto) =>
      api.calendarEvents.create(payload),
    onSuccess: () => {
      invalidate();
      toast.success("일정이 추가되었습니다.", { position: "top-center" });
      onOpenChange(false);
    },
    onError: (error: Error) =>
      toast.error(`일정 추가에 실패했습니다: ${error.message}`, {
        position: "top-center",
      }),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateCalendarEventDto) =>
      api.calendarEvents.update(event?.id as string, payload),
    onSuccess: (saved) => {
      queryClient.setQueriesData<CalendarEvent[]>(
        { queryKey: ["calendar-events"] },
        (old) => old?.map((item) => (item.id === saved.id ? saved : item)),
      );
      invalidate();
      toast.success("일정이 수정되었습니다.", { position: "top-center" });
      onOpenChange(false);
    },
    onError: (error: Error) =>
      toast.error(`일정 수정에 실패했습니다: ${error.message}`, {
        position: "top-center",
      }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.calendarEvents.remove(event?.id as string),
    onSuccess: () => {
      queryClient.setQueriesData<CalendarEvent[]>(
        { queryKey: ["calendar-events"] },
        (old) => old?.filter((item) => item.id !== event?.id),
      );
      invalidate();
      toast.success("일정이 삭제되었습니다.", { position: "top-center" });
      setIsDeleteConfirmOpen(false);
      onOpenChange(false);
    },
    onError: (error: Error) =>
      toast.error(`일정 삭제에 실패했습니다: ${error.message}`, {
        position: "top-center",
      }),
  });

  // PRD §3: 팀 일정 삭제는 owner/manager 중심 — agent는 본인 일정만 삭제 가능
  const canDelete =
    !!event &&
    (user?.role === "owner" ||
      user?.role === "manager" ||
      event.userId === user?.id);

  const handleTypeChange = (value: string) => {
    setForm((prev) => ({
      ...prev,
      type: value,
      color: EVENT_TYPE_META[value]?.color ?? prev.color,
    }));
  };

  const handleAllDayChange = (allDay: boolean) => {
    setForm((previous) => {
      if (allDay && !previous.allDay) {
        rememberedTimes.current = {
          start: previous.start.slice(11, 16) || "10:00",
          end: previous.end.slice(11, 16) || "11:00",
        };
      }
      return {
        ...previous,
        allDay,
        start: allDay
          ? previous.start.slice(0, 10)
          : previous.start
            ? `${previous.start.slice(0, 10)}T${rememberedTimes.current.start}`
            : "",
        end: allDay
          ? previous.end.slice(0, 10)
          : previous.end
            ? `${previous.end.slice(0, 10)}T${rememberedTimes.current.end}`
            : "",
      };
    });
  };

  const handleSubmit = () => {
    if (isSaving || deleteMutation.isPending) return;
    setFormError("");
    if (!form.title.trim()) {
      setFormError("일정 제목을 입력해 주세요.");
      titleRef.current?.focus();
      return;
    }
    if (!form.start) {
      setFormError("시작 날짜와 시간을 입력해 주세요.");
      return;
    }

    const startDate = form.allDay
      ? new Date(`${form.start}T00:00:00`)
      : new Date(form.start);
    const endDate = form.end
      ? form.allDay
        ? new Date(`${form.end}T23:59:59`)
        : new Date(form.end)
      : null;

    if (Number.isNaN(startDate.getTime())) {
      setFormError("시작 일시가 올바르지 않습니다.");
      return;
    }

    if (endDate && (Number.isNaN(endDate.getTime()) || endDate < startDate)) {
      setFormError("종료 시간은 시작 시간 이후여야 합니다.");
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

  const busy = isSaving || deleteMutation.isPending;
  const duration =
    form.end && !form.allDay
      ? Math.round(
          (new Date(form.end).getTime() - new Date(form.start).getTime()) /
            60_000,
        )
      : 0;
  const durationLabel =
    duration > 0
      ? [
          Math.floor(duration / 60) ? `${Math.floor(duration / 60)}시간` : "",
          duration % 60 ? `${duration % 60}분` : "",
        ]
          .filter(Boolean)
          .join(" ")
      : "";
  const linkedCount = Object.values(form.links).filter(Boolean).length;
  const separateEndDate =
    showEndDate ||
    (!!form.end && form.start.slice(0, 10) !== form.end.slice(0, 10));
  const quietInput =
    "h-8 min-w-0 rounded-md border-0 bg-transparent px-2 text-sm shadow-none hover:bg-muted/60 focus-visible:bg-muted/40 focus-visible:ring-2";
  const changeDate = (key: "start" | "end", value: string) => {
    setForm((previous) => {
      const next = previous.allDay
        ? value
        : `${value}T${previous[key].slice(11, 16) || (key === "start" ? "10:00" : "11:00")}`;
      const sameDay = previous.start.slice(0, 10) === previous.end.slice(0, 10);
      return {
        ...previous,
        [key]: next,
        ...(key === "start" && sameDay && previous.end
          ? {
              end: previous.allDay
                ? value
                : `${value}T${previous.end.slice(11, 16)}`,
            }
          : {}),
      };
    });
  };

  return (
    <DialogPrimitive.Root
      open={open}
      modal={false}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogPrimitive.Content
        asChild
        aria-describedby={undefined}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => {
          if (busy || isDeleteConfirmOpen) e.preventDefault();
        }}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          returnFocus.current =
            document.activeElement instanceof HTMLElement
              ? document.activeElement
              : null;
          titleRef.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          if (returnFocus.current?.isConnected)
            returnFocus.current.focus({ preventScroll: true });
        }}
      >
        <aside
          data-event-editor
          data-pinned={pinned}
          className={cn(
            "z-30 flex w-[352px] max-w-[calc(100%-1.5rem)] shrink-0 flex-col overflow-hidden bg-background outline-none",
            pinned
              ? "h-full border-l"
              : "absolute right-3 top-[66px] max-h-[calc(100%-78px)] rounded-xl border shadow-[0_4px_24px_#00000012,0_1px_4px_#00000008] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-right-2 motion-safe:duration-150",
          )}
        >
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(e) => {
              e.preventDefault();
              handleSubmit();
            }}
            onKeyDown={(e) => {
              if (
                (e.metaKey || e.ctrlKey) &&
                e.key === "Enter" &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          >
            <header className="flex shrink-0 items-center gap-2 px-4 pb-2 pt-3">
              <DialogPrimitive.Title className="text-xs font-medium text-muted-foreground">
                {event ? "일정 수정" : "새 일정"}
              </DialogPrimitive.Title>
              <div className="ml-auto flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={
                    pinned ? "편집창 고정 해제" : "편집창 오른쪽에 고정"
                  }
                  title={pinned ? "고정 해제" : "오른쪽에 고정"}
                  aria-pressed={pinned}
                  onClick={() => setPinned((value) => !value)}
                >
                  {pinned ? (
                    <PanelRightClose className="size-4" />
                  ) : (
                    <PanelRightOpen className="size-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="일정 편집 닫기"
                  title="닫기 (Esc)"
                  disabled={busy}
                  onClick={() => onOpenChange(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
            </header>

            <fieldset
              disabled={busy}
              className="m-0 min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain border-0 p-0"
            >
              <legend className="sr-only">일정 내용</legend>
              <div className="px-4 pb-4">
                <label htmlFor="calendar-event-title" className="sr-only">
                  일정 제목
                </label>
                <Textarea
                  ref={titleRef}
                  id="calendar-event-title"
                  name="title"
                  rows={1}
                  value={form.title}
                  aria-invalid={!!formError && !form.title.trim()}
                  aria-describedby={
                    formError ? "calendar-event-error" : undefined
                  }
                  onChange={(e) => {
                    setForm((previous) => ({
                      ...previous,
                      title: e.target.value,
                    }));
                    if (formError) setFormError("");
                  }}
                  placeholder="제목 추가"
                  className="min-h-10 resize-none border-0 px-1 py-2 text-lg font-medium leading-snug shadow-none hover:bg-muted/30 focus-visible:ring-2 md:text-lg"
                />
              </div>

              <fieldset disabled={busy} className="min-w-0 border-t px-4 py-3">
                <legend className="sr-only">날짜와 시간</legend>
                {!form.allDay && (
                  <div className="flex items-center gap-1">
                    <Clock3
                      aria-hidden="true"
                      className="mr-1 size-4 shrink-0 text-muted-foreground"
                    />
                    <label htmlFor="calendar-start-time" className="sr-only">
                      시작 시간
                    </label>
                    <Input
                      id="calendar-start-time"
                      name="start-time"
                      type="time"
                      value={form.start.slice(11, 16)}
                      onChange={(e) =>
                        setForm((previous) => ({
                          ...previous,
                          start: `${previous.start.slice(0, 10)}T${e.target.value}`,
                        }))
                      }
                      className={cn(quietInput, "w-[122px]")}
                    />
                    <ArrowRight
                      aria-hidden="true"
                      className="size-3.5 shrink-0 text-muted-foreground"
                    />
                    <label htmlFor="calendar-end-time" className="sr-only">
                      종료 시간
                    </label>
                    <Input
                      id="calendar-end-time"
                      aria-invalid={formError.startsWith("종료")}
                      aria-describedby={
                        formError.startsWith("종료")
                          ? "calendar-event-error"
                          : undefined
                      }
                      name="end-time"
                      type="time"
                      value={form.end.slice(11, 16)}
                      onChange={(e) =>
                        setForm((previous) => ({
                          ...previous,
                          end: e.target.value
                            ? `${previous.end.slice(0, 10) || previous.start.slice(0, 10)}T${e.target.value}`
                            : "",
                        }))
                      }
                      className={cn(quietInput, "w-[122px]")}
                    />
                  </div>
                )}
                <div className="mt-1 flex items-center gap-1">
                  <CalendarDays
                    aria-hidden="true"
                    className="mr-1 size-4 shrink-0 text-muted-foreground"
                  />
                  <label htmlFor="calendar-start-date" className="sr-only">
                    시작 날짜
                  </label>
                  <Input
                    id="calendar-start-date"
                    name="start-date"
                    type="date"
                    value={form.start.slice(0, 10)}
                    onChange={(e) => changeDate("start", e.target.value)}
                    className={cn(quietInput, "w-[153px]")}
                  />
                  {durationLabel && (
                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                      {durationLabel}
                    </span>
                  )}
                </div>
                {separateEndDate && (
                  <div className="mt-1 flex items-center gap-1 pl-6">
                    <span className="w-8 text-xs text-muted-foreground">
                      종료
                    </span>
                    <label htmlFor="calendar-end-date" className="sr-only">
                      종료 날짜
                    </label>
                    <Input
                      id="calendar-end-date"
                      aria-invalid={formError.startsWith("종료")}
                      aria-describedby={
                        formError.startsWith("종료")
                          ? "calendar-event-error"
                          : undefined
                      }
                      name="end-date"
                      type="date"
                      min={form.start.slice(0, 10)}
                      value={form.end.slice(0, 10)}
                      onChange={(e) => changeDate("end", e.target.value)}
                      className={cn(quietInput, "w-[153px]")}
                    />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 pl-6">
                  <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                    종일
                    <Switch
                      size="sm"
                      checked={form.allDay}
                      onCheckedChange={handleAllDayChange}
                    />
                  </label>
                  {!separateEndDate && (
                    <button
                      type="button"
                      className="rounded px-1 py-1 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                      aria-expanded={separateEndDate}
                      onClick={() => setShowEndDate(true)}
                    >
                      종료 날짜
                    </button>
                  )}
                  {form.end && (
                    <button
                      type="button"
                      className="rounded px-1 py-1 text-xs text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => {
                        setForm((previous) => ({ ...previous, end: "" }));
                        setShowEndDate(false);
                      }}
                    >
                      종료 없음
                    </button>
                  )}
                </div>
              </fieldset>

              <div className="border-t px-4 py-3">
                <div className="flex items-start gap-2">
                  <Text
                    aria-hidden="true"
                    className="mt-2.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <label
                    htmlFor="calendar-event-description"
                    className="sr-only"
                  >
                    일정 설명
                  </label>
                  <Textarea
                    id="calendar-event-description"
                    name="description"
                    rows={2}
                    value={form.description}
                    onChange={(e) =>
                      setForm((previous) => ({
                        ...previous,
                        description: e.target.value,
                      }))
                    }
                    placeholder="설명 추가"
                    className="min-h-16 resize-none border-0 px-2 shadow-none hover:bg-muted/30 focus-visible:ring-2"
                  />
                </div>
              </div>

              <div className="border-t px-4 py-3">
                <div className="flex items-center gap-2">
                  <label
                    className="relative flex size-6 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-muted"
                    title="일정 색상"
                  >
                    <span
                      className="size-3 rounded-sm"
                      style={{ backgroundColor: form.color }}
                    />
                    <input
                      type="color"
                      aria-label="일정 색상"
                      value={form.color}
                      onChange={(e) =>
                        setForm((previous) => ({
                          ...previous,
                          color: e.target.value,
                        }))
                      }
                      className="absolute inset-0 size-full cursor-pointer opacity-0 focus-visible:opacity-100"
                    />
                  </label>
                  <Select value={form.type} onValueChange={handleTypeChange}>
                    <SelectTrigger
                      aria-label="일정 유형"
                      className="h-8 flex-1 border-0 px-2 shadow-none hover:bg-muted/60"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(EVENT_TYPE_META).map(([key, meta]) => (
                        <SelectItem key={key} value={key}>
                          <span className="flex items-center gap-2">
                            <span
                              className="size-2 rounded-full"
                              style={{ backgroundColor: meta.color }}
                            />
                            {meta.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <button
                  type="button"
                  aria-expanded={linksExpanded}
                  aria-controls="calendar-event-links"
                  className="mt-2 flex w-full items-center gap-2 rounded-md py-2 text-left text-xs text-muted-foreground hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => setLinksExpanded((value) => !value)}
                >
                  <Link2 aria-hidden="true" className="ml-1 size-4" />
                  <span>연락처·매물·거래 연결</span>
                  {linkedCount > 0 && (
                    <span className="rounded bg-muted px-1.5 tabular-nums">
                      {linkedCount}
                    </span>
                  )}
                  <ChevronDown
                    aria-hidden="true"
                    className={cn(
                      "ml-auto mr-1 size-3.5",
                      linksExpanded && "rotate-180",
                    )}
                  />
                </button>
                {linksExpanded && (
                  <div id="calendar-event-links" className="mt-1 pl-1">
                    {LINK_KINDS.map((kind) => (
                      <EventLinkRow
                        key={kind}
                        kind={kind}
                        value={form.links[kind]}
                        onChange={(value) =>
                          setForm((previous) => ({
                            ...previous,
                            links: { ...previous.links, [kind]: value },
                          }))
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </fieldset>

            <footer className="shrink-0 border-t px-4 py-3">
              {formError && (
                <p
                  id="calendar-event-error"
                  role="alert"
                  className="mb-2 text-xs text-destructive"
                >
                  {formError}
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                {event ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="일정 삭제"
                    disabled={!canDelete || busy}
                    onClick={() => setIsDeleteConfirmOpen(true)}
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                ) : (
                  <span className="text-[10px] text-muted-foreground">
                    ⌘ / Ctrl + Enter
                  </span>
                )}
                <Button
                  type="submit"
                  size="sm"
                  disabled={busy}
                  className="gap-1.5"
                >
                  <Check className="size-3.5" />
                  {isSaving ? "저장 중…" : "저장"}
                </Button>
              </div>
            </footer>
          </form>
        </aside>
      </DialogPrimitive.Content>
      <ConfirmDialog
        open={isDeleteConfirmOpen}
        onOpenChange={setIsDeleteConfirmOpen}
        title="일정을 삭제할까요?"
        description={
          event ? `"${event.title}" 일정이 영구히 삭제됩니다.` : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleteMutation.mutate()}
      />
    </DialogPrimitive.Root>
  );
}

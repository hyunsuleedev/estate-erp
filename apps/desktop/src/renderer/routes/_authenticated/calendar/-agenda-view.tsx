import { CalendarDays, CalendarPlus2 } from "lucide-react";
import type { CalendarEvent } from "@estate-erp/api-client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/domain";
import {
  getLocalDateKey,
  isSameCalendarDate,
  WEEK_DAY_LABELS,
} from "./-calendar-view-utils";
import {
  formatEventContext,
  formatEventTimeRange,
  formatRelativeDay,
  getEventColor,
  getEventStatus,
} from "./-event-meta";
export function AgendaCalendarView({
  dates,
  eventsByDate,
  onSelectEvent,
  onEdit,
  onCreate,
}: {
  dates: Date[];
  eventsByDate: Map<string, CalendarEvent[]>;
  onSelectEvent: (event: CalendarEvent) => void;
  onEdit: (event: CalendarEvent) => void;
  onCreate: (date: Date) => void;
}) {
  const dayGroups = dates.map((date) => ({
    date,
    events: eventsByDate.get(getLocalDateKey(date)) ?? [],
  }));

  if (dayGroups.every((group) => group.events.length === 0)) {
    return (
      <div className="flex min-h-full items-center justify-center bg-background py-6">
        <EmptyState
          icon={CalendarDays}
          title="이번 달 일정이 없습니다"
          description="새 일정을 추가해 임장·계약·미팅 일정을 관리해 보세요."
          action={
            <Button onClick={() => onCreate(new Date())}>
              <CalendarPlus2 className="size-4" />새 일정
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden bg-background">
      {dayGroups.map(({ date, events }) => {
        if (events.length === 0) return null;

        return (
          <section
            key={getLocalDateKey(date)}
            className="grid border-b last:border-b-0 md:grid-cols-[116px_minmax(0,1fr)]"
          >
            <div className="border-b bg-muted/30 px-4 py-4 md:border-r md:border-b-0">
              <div className="flex items-center gap-3 md:block">
                <div
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
                    date.getDay() === 0 && "text-destructive-strong",
                    date.getDay() === 6 && "text-info-strong",
                    isSameCalendarDate(new Date(), date) && "text-foreground",
                  )}
                >
                  {WEEK_DAY_LABELS[date.getDay()]}
                </div>
                <div
                  className={cn(
                    "text-3xl font-semibold tracking-tight tabular-nums md:mt-1",
                    isSameCalendarDate(new Date(), date) && "text-foreground",
                  )}
                >
                  {date.getDate()}
                </div>
                <div className="min-w-0 flex-1 md:mt-2">
                  <div className="truncate text-sm font-semibold">
                    {formatRelativeDay(date)}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {events.length}건
                  </div>
                </div>
                {isSameCalendarDate(new Date(), date) ? (
                  <Badge className="border-0 bg-foreground text-background md:mt-3">
                    오늘
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="divide-y">
              {events.map((event) => (
                <AgendaEventRow
                  key={event.id}
                  event={event}
                  onSelect={onSelectEvent}
                  onEdit={onEdit}
                />
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
  onSelect,
  onEdit,
}: {
  event: CalendarEvent;
  onSelect: (event: CalendarEvent) => void;
  onEdit: (event: CalendarEvent) => void;
}) {
  const color = getEventColor(event);
  const status = getEventStatus(event);

  return (
    <button
      type="button"
      onClick={() => onSelect(event)}
      onDoubleClick={() => onEdit(event)}
      title="상세 보기 · 더블클릭하여 수정"
      className={cn(
        "grid w-full grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 sm:grid-cols-[18px_112px_minmax(0,1fr)_auto] sm:px-5",
        status.state === "active" && "bg-secondary/60",
      )}
    >
      <span
        className={cn(
          "size-3.5 rounded-sm border",
          status.state === "done"
            ? "border-success bg-success"
            : "border-muted-foreground/40",
        )}
      />
      <span className="hidden text-xs tabular-nums text-muted-foreground sm:block">
        {formatEventTimeRange(event)}
      </span>
      <span className="min-w-0">
        <span className="mb-1 flex min-w-0 items-center gap-2">
          <span
            className="h-4 w-1 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span
            className={cn(
              "block truncate text-sm font-semibold",
              status.state === "done" && "text-muted-foreground line-through",
            )}
          >
            {event.title}
          </span>
        </span>
        <span className="mb-0.5 block text-[11px] tabular-nums text-muted-foreground sm:hidden">
          {formatEventTimeRange(event)}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {formatEventContext(event)}
        </span>
      </span>
      <Badge className={cn("shrink-0 border-0", status.className)}>
        {status.label}
      </Badge>
    </button>
  );
}

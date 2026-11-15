import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { CalendarEvent } from "@estate-erp/api-client";
import { toast } from "sonner";
import { api } from "@/lib/api";

export type EventTiming = Pick<CalendarEvent, "start" | "end">;
const sameTiming = (a: EventTiming, b: EventTiming) =>
  new Date(a.start).getTime() === new Date(b.start).getTime() &&
  (a.end ? new Date(a.end).getTime() : null) ===
    (b.end ? new Date(b.end).getTime() : null);

/** Only one gesture write at a time; roll back timing without replacing unrelated fields. */
export function useEventTiming() {
  const queryClient = useQueryClient();
  const busy = useRef(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const updateCache = (id: string, timing: EventTiming) => {
    queryClient.setQueriesData<CalendarEvent[]>(
      { queryKey: ["calendar-events"] },
      (old) =>
        Array.isArray(old)
          ? old.map((event) =>
              event.id === id ? { ...event, ...timing } : event,
            )
          : old,
    );
  };

  const save = async (
    event: CalendarEvent,
    next: EventTiming,
    undo = false,
  ) => {
    if (busy.current || sameTiming(event, next)) return;
    busy.current = true;
    setPendingId(event.id);
    const previous = { start: event.start, end: event.end };
    let optimistic = false;
    let savedRecord: CalendarEvent | undefined;
    try {
      if (undo) {
        const live = await api.calendarEvents.findOne(event.id);
        if (!sameTiming(live, event)) {
          toast.error(
            "일정이 다시 변경되어 되돌릴 수 없습니다. 최신 일정을 확인해 주세요.",
          );
          return;
        }
      }
      await queryClient.cancelQueries({ queryKey: ["calendar-events"] });
      updateCache(event.id, next);
      optimistic = true;
      const saved = await api.calendarEvents.update(event.id, next);
      updateCache(event.id, saved);
      savedRecord = saved;
    } catch (error) {
      if (optimistic) updateCache(event.id, previous);
      toast.error(
        `시간 변경에 실패했습니다. ${error instanceof Error ? error.message : "다시 시도해 주세요."}`,
      );
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      busy.current = false;
      setPendingId(null);
    }
    if (savedRecord) {
      const saved = savedRecord;
      toast.success(
        undo ? "시간 변경을 되돌렸습니다." : "일정 시간이 변경되었습니다.",
        {
          duration: 7000,
          ...(undo
            ? {}
            : {
                action: {
                  label: "되돌리기",
                  onClick: () => void save(saved, previous, true),
                },
              }),
        },
      );
    }
  };
  return { save, pendingId };
}

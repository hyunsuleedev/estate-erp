import { getLocalDateKey } from "./-calendar-view-utils";
import { eventLastDate } from "./-month-grid-layout";
import { withAlpha } from "./-event-meta";

export type CalendarDraftPreview = {
  title: string;
  start: string;
  end: string | null;
  allDay: boolean;
  color: string;
};

export function draftMinutesOnDate(
  draft: CalendarDraftPreview | null | undefined,
  date: Date,
) {
  if (!draft) return null;
  const key = getLocalDateKey(date);
  const start = new Date(draft.start);
  const last = eventLastDate(draft);
  if (key < getLocalDateKey(start) || key > getLocalDateKey(last)) return null;
  const end = draft.end
    ? new Date(draft.end)
    : new Date(start.getTime() + 30 * 60_000);
  return {
    start:
      key === getLocalDateKey(start)
        ? start.getHours() * 60 + start.getMinutes()
        : 0,
    end:
      key === getLocalDateKey(end)
        ? end.getHours() * 60 + end.getMinutes()
        : 1440,
  };
}

export function DraftPreviewLabel({ draft }: { draft: CalendarDraftPreview }) {
  return (
    <span
      data-calendar-draft
      className="block truncate rounded border border-dashed px-1.5 py-0.5 text-[11px] font-medium"
      style={{
        borderColor: draft.color,
        color: draft.color,
        backgroundColor: withAlpha(draft.color, "14"),
      }}
    >
      {draft.title.trim() || "새 일정"}
      <span className="ml-1 text-[10px] font-normal">· 작성 중</span>
    </span>
  );
}

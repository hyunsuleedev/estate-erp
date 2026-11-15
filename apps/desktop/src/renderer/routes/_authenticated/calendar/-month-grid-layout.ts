import type { CalendarLikeEvent } from "./-calendar-view-utils";

export function addLocalDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function localDayNumber(date: Date) {
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  );
}

/** Midnight is an exclusive end; the editor's 23:59:59 all-day ends remain inclusive. */
export function eventLastDate(event: CalendarLikeEvent) {
  const start = new Date(event.start);
  const end = event.end ? new Date(event.end) : start;
  return new Date(
    Math.max(start.getTime(), end.getTime() - (end > start ? 1 : 0)),
  );
}

/** Keep local start time; preserve an all-day date span or a timed elapsed duration. */
export function shiftEventDays(
  event: CalendarLikeEvent & { allDay?: boolean },
  days: number,
) {
  const start = addLocalDays(new Date(event.start), days);
  return {
    start: start.toISOString(),
    end: event.end
      ? (event.allDay
          ? addLocalDays(new Date(event.end), days)
          : new Date(
              start.getTime() + Date.parse(event.end) - Date.parse(event.start),
            )
        ).toISOString()
      : null,
  };
}

export function resizeEventDate(
  event: CalendarLikeEvent & { allDay?: boolean },
  edge: "start" | "end",
  date: Date,
) {
  const originalStart = new Date(event.start);
  const originalEnd = event.end
    ? new Date(event.end)
    : new Date(originalStart.getTime() + 30 * 60_000);
  const shifted = new Date(edge === "start" ? originalStart : originalEnd);
  const originalDay =
    edge === "start"
      ? originalStart
      : eventLastDate({ ...event, end: originalEnd.toISOString() });
  shifted.setDate(
    shifted.getDate() + localDayNumber(date) - localDayNumber(originalDay),
  );
  if (edge === "start") {
    const latest = event.allDay
      ? new Date(
          eventLastDate({ ...event, end: originalEnd.toISOString() }).setHours(
            0,
            0,
            0,
            0,
          ),
        )
      : new Date(originalEnd.getTime() - 15 * 60_000);
    return {
      start: new Date(
        Math.min(shifted.getTime(), latest.getTime()),
      ).toISOString(),
      end: event.end ?? originalEnd.toISOString(),
    };
  }
  const earliest = event.allDay
    ? new Date(new Date(originalStart).setHours(23, 59, 59, 0))
    : new Date(originalStart.getTime() + 15 * 60_000);
  return {
    start: event.start,
    end: new Date(
      Math.max(shifted.getTime(), earliest.getTime()),
    ).toISOString(),
  };
}

export type MonthPlacement<T> = {
  item: T;
  column: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/** Lay a week out as continuous bars. Longer/all-day spans occupy stable lanes first. */
export function layoutMonthWeek<
  T extends CalendarLikeEvent & { id: string; allDay?: boolean },
>(items: T[], week: Date): MonthPlacement<T>[] {
  const first = localDayNumber(week);
  const last = first + 6;
  const entries = items.flatMap((item) => {
    const start = localDayNumber(new Date(item.start));
    const end = localDayNumber(eventLastDate(item));
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      end < first ||
      start > last
    )
      return [];
    return [
      {
        item,
        column: Math.max(0, start - first),
        span: Math.min(last, end) - Math.max(first, start) + 1,
        lane: 0,
        continuesBefore: start < first,
        continuesAfter: end > last,
      },
    ];
  });
  entries.sort((a, b) => {
    const aLong = a.span > 1 || a.item.allDay;
    const bLong = b.span > 1 || b.item.allDay;
    return (
      Number(bLong) - Number(aLong) ||
      a.column - b.column ||
      b.span - a.span ||
      Date.parse(a.item.start) - Date.parse(b.item.start) ||
      a.item.id.localeCompare(b.item.id)
    );
  });
  const lanes: number[] = [];
  for (const entry of entries) {
    const mask = ((1 << entry.span) - 1) << entry.column;
    let lane = lanes.findIndex((occupied) => !(occupied & mask));
    if (lane < 0) lane = lanes.length;
    lanes[lane] = (lanes[lane] ?? 0) | mask;
    entry.lane = lane;
  }
  return entries;
}

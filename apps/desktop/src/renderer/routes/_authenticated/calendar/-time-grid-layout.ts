import type { CalendarLikeEvent } from "./-calendar-view-utils";

export const GRID_HOUR_HEIGHT = 64;
export const GRID_SNAP_MINUTES = 15;
export const DEFAULT_EVENT_MINUTES = 30;

export type TimedEvent = CalendarLikeEvent & { id: string; allDay?: boolean };
export type EventPlacement<T> = {
  event: T;
  startMinute: number;
  endMinute: number;
  column: number;
  columns: number;
  span: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

export function dateAtMinute(day: Date, minute: number) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, minute);
}

export function minuteOfDay(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

export function snapMinute(minute: number, step = GRID_SNAP_MINUTES) {
  return Math.round(minute / step) * step;
}

/** Clip timed events to the visible local day. Midnight ends are exclusive. */
export function layoutDayEvents<T extends TimedEvent>(
  events: T[],
  day: Date,
): EventPlacement<T>[] {
  const dayStart = dateAtMinute(day, 0).getTime();
  const dayEnd = dateAtMinute(day, 1440).getTime();
  const entries: EventPlacement<T>[] = events.flatMap((event) => {
    if (event.allDay) return [];
    const start = new Date(event.start).getTime();
    const rawEnd = event.end ? new Date(event.end).getTime() : NaN;
    const end =
      rawEnd > start ? rawEnd : start + DEFAULT_EVENT_MINUTES * 60_000;
    if (!Number.isFinite(start) || start >= dayEnd || end <= dayStart)
      return [];
    return [
      {
        event,
        startMinute: start <= dayStart ? 0 : minuteOfDay(new Date(start)),
        endMinute: end >= dayEnd ? 1440 : minuteOfDay(new Date(end)),
        column: 0,
        columns: 1,
        span: 1,
        continuesBefore: start < dayStart,
        continuesAfter: end > dayEnd,
      },
    ];
  });
  entries.sort(
    (a, b) =>
      a.startMinute - b.startMinute ||
      b.endMinute - a.endMinute ||
      a.event.id.localeCompare(b.event.id),
  );

  // Include the minimum visual height in collisions so short cards remain readable.
  const visualEnd = (e: EventPlacement<T>) =>
    Math.max(e.endMinute, e.startMinute + (22 * 60) / GRID_HOUR_HEIGHT);
  let group: EventPlacement<T>[] = [];
  let groupEnd = -1;
  const flush = () => {
    const columnEnds: number[] = [];
    for (const entry of group) {
      let column = columnEnds.findIndex((end) => end <= entry.startMinute);
      if (column === -1) column = columnEnds.length;
      entry.column = column;
      columnEnds[column] = visualEnd(entry);
    }
    for (const entry of group) {
      entry.columns = columnEnds.length;
      for (
        let column = entry.column + 1;
        column < columnEnds.length;
        column++
      ) {
        if (
          group.some(
            (other) =>
              other.column === column &&
              other.startMinute < visualEnd(entry) &&
              visualEnd(other) > entry.startMinute,
          )
        )
          break;
        entry.span++;
      }
    }
    group = [];
  };
  for (const entry of entries) {
    if (entry.startMinute >= groupEnd) flush();
    group.push(entry);
    groupEnd = Math.max(groupEnd, visualEnd(entry));
  }
  flush();
  return entries;
}

/** Preserve actual elapsed duration while moving; a missing end stays missing. */
export function moveEventTo(event: CalendarLikeEvent, start: Date) {
  const duration = event.end
    ? new Date(event.end).getTime() - new Date(event.start).getTime()
    : null;
  return {
    start: start.toISOString(),
    end:
      duration === null
        ? null
        : new Date(start.getTime() + Math.max(0, duration)).toISOString(),
  };
}

export function resizeEventTo(event: CalendarLikeEvent, end: Date) {
  return {
    start: event.start,
    end: new Date(
      Math.max(
        new Date(event.start).getTime() + GRID_SNAP_MINUTES * 60_000,
        end.getTime(),
      ),
    ).toISOString(),
  };
}

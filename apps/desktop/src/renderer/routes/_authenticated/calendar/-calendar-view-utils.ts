export type CalendarViewMode = 'month' | 'week' | 'day' | 'agenda';

export type CalendarLikeEvent = {
  id?: string;
  start: string;
  end?: string | null;
};

export type MonthCell = {
  key: string;
  date: Date;
  isOutsideMonth: boolean;
};

export function getCalendarRange(anchorDate: Date, viewMode: CalendarViewMode) {
  if (viewMode === 'month') {
    const cells = buildMonthCells(anchorDate);

    return {
      start: startOfDay(cells[0].date),
      end: endOfDay(cells[cells.length - 1].date),
    };
  }

  if (viewMode === 'day') {
    return {
      start: startOfDay(anchorDate),
      end: endOfDay(anchorDate),
    };
  }

  if (viewMode === 'agenda') {
    return {
      start: startOfDay(startOfMonth(anchorDate)),
      end: endOfDay(endOfMonth(anchorDate)),
    };
  }

  const weekStart = startOfWeek(anchorDate);

  return {
    start: startOfDay(weekStart),
    end: endOfDay(addDays(weekStart, 6)),
  };
}

export function buildMonthCells(anchorDate: Date): MonthCell[] {
  const monthStart = startOfMonth(anchorDate);
  const monthEnd = endOfMonth(anchorDate);
  const gridStart = startOfWeek(monthStart);
  const gridEnd = endOfWeek(monthEnd);
  const cells: MonthCell[] = [];

  for (let date = gridStart; date <= gridEnd; date = addDays(date, 1)) {
    cells.push({
      key: getLocalDateKey(date),
      date,
      isOutsideMonth: date.getMonth() !== anchorDate.getMonth(),
    });
  }

  return cells;
}

export function getWeekDates(anchorDate: Date) {
  const weekStart = startOfWeek(anchorDate);

  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

export function getMonthDates(anchorDate: Date) {
  const monthEnd = endOfMonth(anchorDate);

  return Array.from({ length: monthEnd.getDate() }, (_, index) =>
    new Date(anchorDate.getFullYear(), anchorDate.getMonth(), index + 1),
  );
}

export function addCalendarPeriod(
  anchorDate: Date,
  viewMode: CalendarViewMode,
  direction: -1 | 1,
) {
  if (viewMode === 'month' || viewMode === 'agenda') {
    return new Date(anchorDate.getFullYear(), anchorDate.getMonth() + direction, 1);
  }

  if (viewMode === 'day') {
    return addDays(anchorDate, direction);
  }

  return addDays(anchorDate, direction * 7);
}

export function groupEventsByDate<T extends CalendarLikeEvent>(events: T[]) {
  const grouped = new Map<string, T[]>();

  for (const event of sortEventsByStart(events)) {
    const key = getLocalDateKey(new Date(event.start));
    const dayEvents = grouped.get(key) ?? [];
    dayEvents.push(event);
    grouped.set(key, dayEvents);
  }

  return grouped;
}

export function sortEventsByStart<T extends CalendarLikeEvent>(events: T[]) {
  return [...events].sort((left, right) => {
    const leftTime = new Date(left.start).getTime();
    const rightTime = new Date(right.start).getTime();

    if (leftTime !== rightTime) return leftTime - rightTime;

    const leftEnd = left.end ? new Date(left.end).getTime() : leftTime;
    const rightEnd = right.end ? new Date(right.end).getTime() : rightTime;

    return leftEnd - rightEnd;
  });
}

export function getLocalDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function isSameCalendarDate(left: Date, right: Date) {
  return getLocalDateKey(left) === getLocalDateKey(right);
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function startOfWeek(date: Date) {
  const start = startOfDay(date);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function endOfWeek(date: Date) {
  return addDays(startOfWeek(date), 6);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

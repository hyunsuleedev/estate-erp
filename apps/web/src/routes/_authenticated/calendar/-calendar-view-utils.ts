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

/**
 * 이벤트를 로컬 날짜 키로 그룹화한다.
 * end가 다음 날 이후인 멀티데이 이벤트는 start~end 사이 모든 날짜 셀에 배치된다.
 * (무한 루프 방지를 위해 이벤트당 최대 62일까지 전개)
 */
export function groupEventsByDate<T extends CalendarLikeEvent>(events: T[]) {
  const grouped = new Map<string, T[]>();
  const MAX_SPAN_DAYS = 62;

  for (const event of sortEventsByStart(events)) {
    const startDate = new Date(event.start);
    const endDate = event.end ? new Date(event.end) : startDate;
    const lastDay = startOfDay(endDate < startDate ? startDate : endDate);

    let cursor = startOfDay(startDate);
    let guard = 0;

    while (cursor <= lastDay && guard < MAX_SPAN_DAYS) {
      const key = getLocalDateKey(cursor);
      const dayEvents = grouped.get(key) ?? [];
      dayEvents.push(event);
      grouped.set(key, dayEvents);
      cursor = addDays(cursor, 1);
      guard += 1;
    }
  }

  return grouped;
}

/** start와 end가 서로 다른 달력 날짜에 걸치면 멀티데이 이벤트. */
export function isMultiDayEvent(event: CalendarLikeEvent) {
  if (!event.end) return false;
  return !isSameCalendarDate(new Date(event.start), new Date(event.end));
}

/**
 * 주/일 타임그리드에 표시할 시간 슬롯 목록.
 * 기본 09~18시를 유지하되, 그 밖의 시간에 시작/종료하는 (시간 지정) 이벤트가 있으면
 * 해당 시간까지 슬롯을 확장한다. 종일/멀티데이 이벤트는 all-day 영역에서 처리하므로 제외.
 */
export function getHourSlots(
  events: Array<CalendarLikeEvent & { allDay?: boolean }>,
  defaultStartHour = 9,
  defaultEndHour = 18,
): number[] {
  let startHour = defaultStartHour;
  let endHour = defaultEndHour;

  for (const event of events) {
    if (event.allDay || isMultiDayEvent(event)) continue;

    const start = new Date(event.start);
    startHour = Math.min(startHour, start.getHours());
    endHour = Math.max(endHour, start.getHours());

    if (event.end) {
      const end = new Date(event.end);
      // 종료가 정각이면 직전 슬롯까지만 필요 (예: 20:00 종료 → 19시 슬롯)
      const endSlotHour = end.getMinutes() === 0 ? end.getHours() - 1 : end.getHours();
      endHour = Math.max(endHour, Math.min(23, Math.max(start.getHours(), endSlotHour)));
    }
  }

  startHour = Math.max(0, startHour);
  endHour = Math.min(23, endHour);

  return Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);
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

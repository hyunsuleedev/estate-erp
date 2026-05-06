import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildMonthCells,
  addCalendarPeriod,
  getCalendarRange,
  groupEventsByDate,
  type CalendarViewMode,
} from '../src/routes/_authenticated/calendar/-calendar-view-utils';

describe('calendar view utilities', () => {
  it('builds a visible Sunday-start month grid with leading and trailing dates', () => {
    const cells = buildMonthCells(new Date(2026, 3, 21));

    assert.equal(cells.length, 35);
    assert.equal(toLocalDateKey(cells[0].date), '2026-03-29');
    assert.equal(toLocalDateKey(cells[3].date), '2026-04-01');
    assert.equal(toLocalDateKey(cells[34].date), '2026-05-02');
    assert.equal(cells[0].isOutsideMonth, true);
    assert.equal(cells[3].isOutsideMonth, false);
    assert.equal(cells[34].isOutsideMonth, true);
  });

  it('uses the correct query range for month, week, day, and agenda views', () => {
    const anchor = new Date(2026, 3, 21, 15, 30);

    assertRange('month', anchor, '2026-03-29 00:00:00.000', '2026-05-02 23:59:59.999');
    assertRange('week', anchor, '2026-04-19 00:00:00.000', '2026-04-25 23:59:59.999');
    assertRange('day', anchor, '2026-04-21 00:00:00.000', '2026-04-21 23:59:59.999');
    assertRange('agenda', anchor, '2026-04-01 00:00:00.000', '2026-04-30 23:59:59.999');
  });

  it('moves by month, week, day, or agenda period', () => {
    const anchor = new Date(2026, 3, 21, 15, 30);

    assert.equal(toLocalDateKey(addCalendarPeriod(anchor, 'month', 1)), '2026-05-01');
    assert.equal(toLocalDateKey(addCalendarPeriod(anchor, 'week', 1)), '2026-04-28');
    assert.equal(toLocalDateKey(addCalendarPeriod(anchor, 'day', 1)), '2026-04-22');
    assert.equal(toLocalDateKey(addCalendarPeriod(anchor, 'agenda', -1)), '2026-03-01');
  });

  it('groups events by local date and sorts them by start time', () => {
    const grouped = groupEventsByDate([
      { id: 'late', start: new Date(2026, 3, 21, 15).toISOString() },
      { id: 'early', start: new Date(2026, 3, 21, 9).toISOString() },
      { id: 'next-day', start: new Date(2026, 3, 22, 10).toISOString() },
    ]);

    assert.deepEqual(
      grouped.get('2026-04-21')?.map((event) => event.id),
      ['early', 'late'],
    );
    assert.deepEqual(
      grouped.get('2026-04-22')?.map((event) => event.id),
      ['next-day'],
    );
  });
});

function assertRange(
  viewMode: CalendarViewMode,
  date: Date,
  expectedStart: string,
  expectedEnd: string,
) {
  const range = getCalendarRange(date, viewMode);

  assert.equal(toLocalTimestamp(range.start), expectedStart);
  assert.equal(toLocalTimestamp(range.end), expectedEnd);
}

function toLocalDateKey(date: Date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function toLocalTimestamp(date: Date) {
  return `${toLocalDateKey(date)} ${[
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
    String(date.getSeconds()).padStart(2, '0'),
  ].join(':')}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

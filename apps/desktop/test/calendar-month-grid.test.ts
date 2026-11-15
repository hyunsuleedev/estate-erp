import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupEventsByDate } from "../src/renderer/routes/_authenticated/calendar/-calendar-view-utils";
import {
  addLocalDays,
  eventLastDate,
  layoutMonthWeek,
  localDayNumber,
  resizeEventDate,
  shiftEventDays,
} from "../src/renderer/routes/_authenticated/calendar/-month-grid-layout";

const date = (value: string) => new Date(value);
const item = (
  id: string,
  start: string,
  end: string | null,
  allDay = false,
) => ({
  id,
  start: date(start).toISOString(),
  end: end ? date(end).toISOString() : null,
  allDay,
});

describe("continuous month calendar", () => {
  it("lays multi-day bars across a week and continues them into the next week", () => {
    const trip = item(
      "trip",
      "2026-11-05T00:00:00",
      "2026-11-10T23:59:59",
      true,
    );
    const [first] = layoutMonthWeek([trip], date("2026-11-01T00:00:00"));
    const [next] = layoutMonthWeek([trip], date("2026-11-08T00:00:00"));
    assert.deepEqual(
      [first.column, first.span, first.continuesBefore, first.continuesAfter],
      [4, 3, false, true],
    );
    assert.deepEqual(
      [next.column, next.span, next.continuesBefore, next.continuesAfter],
      [0, 3, true, false],
    );
  });
  it("never covers an overlapping event and reuses a lane after its last date", () => {
    const entries = layoutMonthWeek(
      [
        item("long", "2026-11-02T00:00:00", "2026-11-04T23:59:59", true),
        item("short", "2026-11-03T10:00:00", "2026-11-03T11:00:00"),
        item("after", "2026-11-05T10:00:00", "2026-11-05T11:00:00"),
      ],
      date("2026-11-01T00:00:00"),
    );
    assert.notEqual(
      entries.find((e) => e.item.id === "long")?.lane,
      entries.find((e) => e.item.id === "short")?.lane,
    );
    assert.equal(entries.find((e) => e.item.id === "after")?.lane, 0);
    for (const a of entries)
      for (const b of entries) {
        if (a.item.id === b.item.id || a.lane !== b.lane) continue;
        assert.ok(
          a.column + a.span <= b.column || b.column + b.span <= a.column,
        );
      }
  });
  it("does not duplicate an event on the date of its exclusive midnight end", () => {
    const event = item(
      "midnight",
      "2026-11-07T20:00:00",
      "2026-11-08T00:00:00",
    );
    assert.equal(eventLastDate(event).getDate(), 7);
    assert.equal(
      layoutMonthWeek([event], date("2026-11-08T00:00:00")).length,
      0,
    );
    const grouped = groupEventsByDate([event]);
    assert.equal(grouped.get("2026-11-07")?.length, 1);
    assert.equal(grouped.has("2026-11-08"), false);
  });
  it("moves a timed event over month and year boundaries preserving time and duration", () => {
    const event = item("meeting", "2026-12-31T14:15:00", "2026-12-31T15:45:00");
    const moved = shiftEventDays(event, 2);
    assert.equal(new Date(moved.start).getFullYear(), 2027);
    assert.equal(new Date(moved.start).getDate(), 2);
    assert.equal(new Date(moved.start).getHours(), 14);
    assert.equal(new Date(moved.start).getMinutes(), 15);
    assert.equal(
      Date.parse(moved.end ?? "") - Date.parse(moved.start),
      90 * 60_000,
    );
    assert.equal(shiftEventDays({ ...event, end: null }, 2).end, null);
  });
  it("preserves an all-day span and local clocks across the London DST boundary", () => {
    const previous = process.env.TZ;
    process.env.TZ = "Europe/London";
    try {
      const event = item(
        "trip",
        "2026-10-17T00:00:00",
        "2026-10-19T23:59:59",
        true,
      );
      const moved = shiftEventDays(event, 7);
      assert.equal(
        localDayNumber(new Date(moved.end ?? "")) -
          localDayNumber(new Date(moved.start)),
        2,
      );
      assert.equal(new Date(moved.start).getHours(), 0);
      assert.equal(new Date(moved.end ?? "").getHours(), 23);
      assert.equal(
        localDayNumber(date("2026-10-26T00:00:00")) -
          localDayNumber(date("2026-10-24T00:00:00")),
        2,
      );
    } finally {
      process.env.TZ = previous;
    }
  });
  it("resizes either end without changing the other and clamps invalid inversions", () => {
    const event = item(
      "trip",
      "2026-11-10T00:00:00",
      "2026-11-12T23:59:59",
      true,
    );
    const longer = resizeEventDate(event, "end", date("2026-11-15T00:00:00"));
    assert.equal(longer.start, event.start);
    assert.equal(new Date(longer.end ?? "").getDate(), 15);
    const earlier = resizeEventDate(
      event,
      "start",
      date("2026-11-08T00:00:00"),
    );
    assert.equal(earlier.end, event.end);
    assert.equal(new Date(earlier.start).getDate(), 8);
    const clamped = resizeEventDate(event, "end", date("2026-11-01T00:00:00"));
    assert.equal(new Date(clamped.end ?? "").getDate(), 10);
    assert.ok(Date.parse(clamped.end ?? "") > Date.parse(clamped.start));
  });
  it("retains exclusive midnight semantics when resizing", () => {
    const event = item("night", "2026-11-10T21:00:00", "2026-11-11T00:00:00");
    const resized = resizeEventDate(event, "end", date("2026-11-12T00:00:00"));
    assert.equal(eventLastDate(resized).getDate(), 12);
    assert.equal(new Date(resized.end ?? "").getDate(), 13);
  });
  it("can recenter many weeks without losing calendar dates at DST", () => {
    const origin = date("2026-10-04T00:00:00");
    const current = addLocalDays(origin, 12 * 7);
    const recentered = addLocalDays(addLocalDays(origin, 4 * 7), 8 * 7);
    assert.equal(current.toISOString(), recentered.toISOString());
  });
});

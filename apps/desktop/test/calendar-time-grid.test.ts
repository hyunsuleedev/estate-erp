import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dateAtMinute,
  layoutDayEvents,
  moveEventTo,
  resizeEventTo,
  snapMinute,
} from "../src/renderer/routes/_authenticated/calendar/-time-grid-layout";

const day = new Date(2026, 10, 11);
const event = (id: string, start: number, end: number | null) => ({
  id,
  start: dateAtMinute(day, start).toISOString(),
  end: end === null ? null : dateAtMinute(day, end).toISOString(),
});

describe("calendar time grid", () => {
  it("preserves start minutes and duration rather than putting every card at the hour boundary", () => {
    const [short, long] = layoutDayEvents(
      [
        event("short", 9 * 60 + 15, 9 * 60 + 45),
        event("long", 10 * 60 + 30, 12 * 60 + 30),
      ],
      day,
    );
    assert.deepEqual([short.startMinute, short.endMinute], [555, 585]);
    assert.deepEqual([long.startMinute, long.endMinute], [630, 750]);
  });
  it("puts overlapping appointments in separate columns, reuses freed columns and separates disjoint groups", () => {
    const placements = layoutDayEvents(
      [
        event("a", 540, 660),
        event("b", 555, 585),
        event("c", 585, 630),
        event("d", 700, 730),
      ],
      day,
    );
    const [a, b, c, d] = placements;
    assert.deepEqual([a.column, a.columns, b.column, c.column], [0, 2, 1, 1]);
    assert.deepEqual([d.column, d.columns], [0, 1]);
    for (const left of placements)
      for (const right of placements) {
        if (
          left.event.id >= right.event.id ||
          left.endMinute <= right.startMinute ||
          right.endMinute <= left.startMinute
        )
          continue;
        assert.ok(
          left.column + left.span <= right.column ||
            right.column + right.span <= left.column,
          "overlapping cards must not cover one another",
        );
      }
  });
  it("clips overnight events to each day and treats midnight as an exclusive end", () => {
    const overnight = event("night", 23 * 60, 25 * 60);
    assert.deepEqual(
      layoutDayEvents([overnight], day).map((p) => [
        p.startMinute,
        p.endMinute,
        p.continuesAfter,
      ]),
      [[1380, 1440, true]],
    );
    assert.deepEqual(
      layoutDayEvents([overnight], dateAtMinute(day, 1440)).map((p) => [
        p.startMinute,
        p.endMinute,
        p.continuesBefore,
      ]),
      [[0, 60, true]],
    );
    assert.equal(
      layoutDayEvents(
        [event("midnight", 23 * 60, 1440)],
        dateAtMinute(day, 1440),
      ).length,
      0,
    );
  });
  it("gives an end-less appointment a preview duration without writing an end during a move", () => {
    const original = event("open", 600, null);
    assert.equal(layoutDayEvents([original], day)[0].endMinute, 630);
    assert.equal(moveEventTo(original, dateAtMinute(day, 700)).end, null);
  });
  it("preserves elapsed duration across a day boundary and enforces a 15-minute resize minimum", () => {
    const original = event("meeting", 600, 690);
    const moved = moveEventTo(original, dateAtMinute(day, 23 * 60));
    assert.equal(Date.parse(moved.end!) - Date.parse(moved.start), 90 * 60_000);
    const resized = resizeEventTo(original, dateAtMinute(day, 590));
    assert.equal(
      Date.parse(resized.end) - Date.parse(original.start),
      15 * 60_000,
    );
    assert.equal(snapMinute(617), 615);
    assert.equal(snapMinute(623), 630);
  });
  it("excludes all-day and invalid events from timed placement", () => {
    assert.equal(
      layoutDayEvents(
        [
          { ...event("all", 0, 1440), allDay: true },
          { id: "invalid", start: "bad-date", end: null },
        ],
        day,
      ).length,
      0,
    );
  });
});

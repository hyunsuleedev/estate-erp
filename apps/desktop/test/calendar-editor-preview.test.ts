import assert from "node:assert/strict";
import test from "node:test";
import {
  draftMinutesOnDate,
  type CalendarDraftPreview,
} from "../src/renderer/routes/_authenticated/calendar/-event-draft-preview";

process.env.TZ = "Europe/London";
const draft: CalendarDraftPreview = {
  title: "임장",
  start: "2026-11-16T23:00:00.000Z",
  end: "2026-11-17T00:00:00.000Z",
  allDay: false,
  color: "#0f7b6c",
};

test("midnight end does not preview on the following date", () => {
  assert.deepEqual(draftMinutesOnDate(draft, new Date("2026-11-16T00:00:00")), {
    start: 1380,
    end: 1440,
  });
  assert.equal(
    draftMinutesOnDate(draft, new Date("2026-11-17T00:00:00")),
    null,
  );
});

test("a multi-day timed draft is clipped to each visible day", () => {
  const spanning = { ...draft, end: "2026-11-18T02:30:00.000Z" };
  assert.deepEqual(
    draftMinutesOnDate(spanning, new Date("2026-11-17T00:00:00")),
    { start: 0, end: 1440 },
  );
  assert.deepEqual(
    draftMinutesOnDate(spanning, new Date("2026-11-18T00:00:00")),
    { start: 0, end: 150 },
  );
});

test("all-day preview includes the final date across a DST boundary", () => {
  const allDay = {
    ...draft,
    allDay: true,
    start: new Date("2026-10-24T00:00:00").toISOString(),
    end: new Date("2026-10-26T23:59:59").toISOString(),
  };
  for (const day of [24, 25, 26])
    assert.ok(draftMinutesOnDate(allDay, new Date(`2026-10-${day}T00:00:00`)));
  assert.equal(
    draftMinutesOnDate(allDay, new Date("2026-10-27T00:00:00")),
    null,
  );
});

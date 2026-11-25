import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { projectListParams } from "../../../packages/api-client/src/modules/projects.ts";
import {
  clearProjectFilters,
  conditionsFromSearch,
  countActiveProjectFilters,
  DEFAULT_PROJECT_TABLE_SETTINGS,
  moveProjectColumn,
  normalizeProjectTableSettings,
  PROJECT_FIXED_COLUMN_IDS,
  projectCreatedPreset,
  readProjectListSearch,
  searchFromConditions,
  sortFromColumn,
  summarizeCreatedRange,
  toProjectListFilter,
} from "../src/renderer/routes/_authenticated/projects/-project-list-filters.ts";

const ID = "304f1312-cb77-4f35-b833-b00fc3bf2038";

describe("project list conditions in the address", () => {
  it("keeps only values the server understands", () => {
    const search = readProjectListSearch({
      tab: "archived",
      q: "김민준",
      st: "preparing,bogus,active",
      as: `none,${ID},not-an-id`,
      mine: "1",
      in: "listing,nope",
      pc: "maybe",
      from: "2026-11-01",
      to: "11/22",
      sort: "title",
      order: "sideways",
    });
    assert.deepEqual(search, {
      tab: "archived",
      q: "김민준",
      st: "preparing,active",
      as: `none,${ID}`,
      mine: "1",
      in: "listing",
      from: "2026-11-01",
      sort: "title",
    });
  });

  it("drops empty values so the address carries no empty tail", () => {
    assert.deepEqual(readProjectListSearch({ q: "  ", st: "", sort: "updated", order: "desc" }), {
      sort: "updated",
      order: "desc",
    });
  });

  it("round-trips conditions and leaves defaults out of the address", () => {
    const conditions = conditionsFromSearch({ st: "preparing,active", in: "none", pc: "set" });
    assert.equal(conditions.sort, "updated");
    assert.equal(conditions.order, "desc");
    assert.deepEqual(searchFromConditions(conditions), { st: "preparing,active", in: "none", pc: "set" });
    // 이름순의 기본 방향은 가나다순(오름차순)이라 주소에 방향을 남기지 않는다
    assert.deepEqual(searchFromConditions({ ...conditions, sort: "title", order: "asc" }), {
      st: "preparing,active",
      in: "none",
      pc: "set",
      sort: "title",
    });
  });

  it("does not keep a status filter on the 종료 tab", () => {
    const conditions = { ...conditionsFromSearch({ st: "active" }), archived: true };
    assert.equal(searchFromConditions(conditions).st, undefined);
    assert.equal(toProjectListFilter(conditions, 50).statuses, undefined);
    assert.equal(countActiveProjectFilters(conditions), 0);
  });
});

describe("project list conditions → server request", () => {
  it("sends every condition to the server and joins lists with commas", () => {
    const conditions = conditionsFromSearch({
      q: " 갈아타기 ",
      st: "preparing,wrapping",
      as: `none,${ID}`,
      mine: "1",
      in: "listing,buyer",
      pc: "empty",
      from: "2026-11-01",
      to: "2026-11-22",
      sort: "title",
    });
    const filter = toProjectListFilter(conditions, 50);
    assert.deepEqual(filter, {
      status: "open",
      search: "갈아타기",
      statuses: ["preparing", "wrapping"],
      assignedToIds: ["none", ID],
      mine: true,
      intakes: ["listing", "buyer"],
      primary: "empty",
      createdFrom: "2026-11-01",
      createdTo: "2026-11-22",
      sort: "title",
      order: "asc",
      limit: 50,
    });
    assert.deepEqual(
      Object.fromEntries(
        Object.entries(projectListParams({ ...filter, offset: 50 })).filter(([, value]) => value !== undefined),
      ),
      {
        status: "open",
        search: "갈아타기",
        assignedToIds: `none,${ID}`,
        mine: "true",
        statuses: "preparing,wrapping",
        intakes: "listing,buyer",
        primary: "empty",
        createdFrom: "2026-11-01",
        createdTo: "2026-11-22",
        sort: "title",
        order: "asc",
        offset: 50,
        limit: 50,
      },
    );
  });

  it("asks for the 종료 tab without the other conditions it does not need", () => {
    const filter = toProjectListFilter(conditionsFromSearch({ tab: "archived" }), 50);
    assert.deepEqual(projectListParams(filter), {
      ...Object.fromEntries(Object.keys(projectListParams(filter)).map((key) => [key, undefined])),
      status: "archived",
      sort: "updated",
      order: "desc",
      limit: 50,
    });
  });

  it("counts pills and clears filters but keeps the tab and the sort", () => {
    const conditions = conditionsFromSearch({
      q: "김",
      st: "active",
      as: "none",
      mine: "1",
      in: "none",
      pc: "set",
      from: "2026-11-01",
      sort: "created",
      order: "asc",
      tab: undefined,
    });
    assert.equal(countActiveProjectFilters(conditions), 6);
    const cleared = clearProjectFilters(conditions);
    assert.equal(countActiveProjectFilters(cleared), 0);
    assert.equal(cleared.search, "");
    assert.equal(cleared.sort, "created");
    assert.equal(cleared.order, "asc");
  });

  it("maps sortable header columns to server sorts only", () => {
    assert.equal(sortFromColumn("title"), "title");
    assert.equal(sortFromColumn("createdAt"), "created");
    assert.equal(sortFromColumn("updatedAt"), "updated");
    assert.equal(sortFromColumn("status"), null);
  });
});

describe("start date presets", () => {
  // 2026-11-22는 일요일
  const now = new Date(2026, 10, 22, 15, 0);
  it("starts a week on Monday and a month on the 1st", () => {
    assert.deepEqual(projectCreatedPreset("week", now), { from: "2026-11-16", to: "2026-11-22" });
    assert.deepEqual(projectCreatedPreset("month", now), { from: "2026-11-01", to: "2026-11-22" });
  });
  it("names the presets and shortens other ranges", () => {
    assert.equal(summarizeCreatedRange("2026-11-16", "2026-11-22", now), "이번 주");
    assert.equal(summarizeCreatedRange("2026-11-01", "2026-11-22", now), "이번 달");
    assert.equal(summarizeCreatedRange("2026-11-03", "2026-11-10", now), "11.3 ~ 11.10");
    assert.equal(summarizeCreatedRange("2025-12-30", "", now), "2025.12.30부터");
    assert.equal(summarizeCreatedRange("", "2026-11-10", now), "11.10까지");
    assert.equal(summarizeCreatedRange("", "", now), null);
  });
});

describe("project table settings", () => {
  it("pins 고객 · 프로젝트 at the front: they cannot be hidden or moved", () => {
    assert.deepEqual(PROJECT_FIXED_COLUMN_IDS, ["customer", "title"]);
    const saved = normalizeProjectTableSettings({
      hidden: ["title", "customer", "latestComment", "gone"],
      order: ["status", "title", "assignee", "customer"],
      sizing: { title: 360, customer: 12, progress: 5000, unknown: 200 },
    });
    assert.deepEqual(saved.hidden, ["latestComment"]);
    assert.deepEqual(saved.order.slice(0, 4), ["customer", "title", "status", "assignee"]);
    assert.equal(new Set(saved.order).size, saved.order.length);
    assert.deepEqual(saved.sizing, { title: 360 });
  });

  it("falls back to defaults for broken storage", () => {
    assert.deepEqual(normalizeProjectTableSettings("nope"), DEFAULT_PROJECT_TABLE_SETTINGS);
    assert.deepEqual(DEFAULT_PROJECT_TABLE_SETTINGS.hidden, ["updatedAt"]);
  });

  it("moves a column one step but never into or out of the pinned columns", () => {
    const order = DEFAULT_PROJECT_TABLE_SETTINGS.order;
    assert.deepEqual(moveProjectColumn(order, "assignee", -1).slice(0, 6), [
      "customer",
      "title",
      "status",
      "intakes",
      "assignee",
      "latestComment",
    ]);
    assert.deepEqual(moveProjectColumn(order, "status", -1), [...order]);
    assert.deepEqual(moveProjectColumn(order, "title", 1), [...order]);
    assert.deepEqual(moveProjectColumn(order, "updatedAt", 1), [...order]);
  });
});

describe("project table uses the property table's parts (source)", () => {
  const read = (path: string) =>
    readFileSync(new URL(`../src/renderer/routes/_authenticated/${path}`, import.meta.url), "utf8");
  const chip = read("projects/-project-status-chip.tsx");
  const cells = read("projects/-project-list-cells.tsx");
  const list = read("projects/index.tsx");
  const properties = read("properties/index.tsx");

  it("status pill and intake tag copy the property pill and transaction chip", () => {
    // 매물관리 StatusIndicator의 알약 모양
    assert.match(properties, /rounded-full pl-\[7px\] pr-\[9px\] text-\[14px\] font-\[450\] leading-5/);
    assert.match(chip, /rounded-full pl-\[7px\] pr-\[9px\] text-\[14px\] font-\[450\] leading-5/);
    // 진행 중 = 활성(초록), 마무리 = 거래 중(파랑) — 매물관리 색 그대로
    assert.match(properties, /bg-\[#eef3ed\] text-\[#44745a\]/);
    assert.match(chip, /active: \{ pill: "bg-\[#eef3ed\] text-\[#44745a\]", dot: "bg-\[#6c9b7a\]" \}/);
    assert.match(chip, /wrapping: \{ pill: "bg-\[#e7f3f8\] text-\[#337ea9\]", dot: "bg-\[#529cca\]" \}/);
    // 의뢰 꼬리표는 거래 칩 팔레트 안의 색, 테두리 없음
    assert.match(properties, /monthly: \{ label: "월세", className: "bg-\[#fbf3db\] text-\[#8f6b1f\]" \}/);
    assert.match(properties, /sale: \{ label: "매매", className: "bg-\[#fdebec\] text-\[#8f4b46\]" \}/);
    assert.match(chip, /listing: "bg-\[#fbf3db\] text-\[#8f6b1f\]"/);
    assert.match(chip, /buyer: "bg-\[#fdebec\] text-\[#8f4b46\]"/);
    assert.doesNotMatch(chip, /border border-border/);
  });

  it("empty values are a muted '-' and the long dash is gone", () => {
    assert.match(cells, /<span className="text-muted-foreground">\s*<span aria-hidden="true">-<\/span>/);
    assert.doesNotMatch(cells + list, /—<\/span>/);
  });

  it("pins the customer and project columns with the property edge line and a + on it", () => {
    assert.match(list, /pinnedColumns=\{PINNED_COLUMNS\}/);
    assert.match(list, /const PINNED_EDGE_CELL_CLASS = "shadow-\[1px_0_0_0_#e3e2df\]";/);
    assert.match(list, /meta: \{ cellClassName: PINNED_EDGE_CELL_CLASS \}/);
    assert.match(list, /data-project-column-add/);
    assert.match(list, /left: Math\.max\(0, pinnedEdgeX - 8\) \+ 0\.5/);
  });
});

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Match } from "@estate-erp/api-client";
import {
  clampMatchColumnWidth,
  defaultMatchTablePreferences,
  getMatchTableLayout,
  parseMatchTablePreferences,
  sortMatchGroups,
  type MatchTableSort,
} from "../src/renderer/routes/_authenticated/properties/-components/property-match-table-state";

const stages = [
  "suggested",
  "buyerInterested",
  "viewingConfirmed",
  "viewing",
  "negotiating",
  "dealCreated",
];
const stageIndex = (stage: string) => stages.indexOf(stage);
const match = (
  id: string,
  buyer: Record<string, unknown> = {},
  stage = "suggested",
) =>
  ({
    id,
    stage,
    memo: null,
    buyerRequirement: {
      transactionType: "sale",
      contact: { name: id },
      ...buyer,
    },
  }) as Match;
const ids = (matches: Match[]) => matches.map((match) => match.id);
const sort = (matches: Match[], order: MatchTableSort) =>
  sortMatchGroups(matches, order, stageIndex, () => null);

describe("linked buyer sorting", () => {
  it("sorts raw amounts numerically, keeps unknown ceilings last and preserves equal rows", () => {
    const rows = [
      match("unknown"),
      match("large", { priceMax: 100000 }),
      match("small", { priceMax: 90000 }),
      match("equal", { priceMax: 90000 }),
    ];
    const original = [...rows];
    assert.deepEqual(
      ids(sort(rows, { column: "budget", direction: "asc" }).rest),
      ["small", "equal", "large", "unknown"],
    );
    assert.deepEqual(
      ids(sort(rows, { column: "budget", direction: "desc" }).rest),
      ["large", "small", "equal", "unknown"],
    );
    assert.deepEqual(rows, original);
    assert.deepEqual(ids(sort(rows, null).rest), ids(original));
  });

  it("separates deposit and monthly rent, treats zero as a real bound, and accepts serialized decimals", () => {
    const rows = [
      match("sale", { priceMax: 100000 }),
      match("lease", { transactionType: "jeonse", depositMax: "90000" }),
      match("rent", {
        transactionType: "monthly",
        priceMax: 1,
        depositMax: 5000,
        monthlyRentMax: 180,
      }),
      match("free", {
        transactionType: "monthly",
        depositMax: 0,
        monthlyRentMax: 0,
      }),
    ];
    assert.deepEqual(
      ids(sort(rows, { column: "budget", direction: "asc" }).rest),
      ["free", "rent", "lease", "sale"],
    );
    assert.deepEqual(
      ids(sort(rows, { column: "monthlyRent", direction: "desc" }).rest),
      ["rent", "free", "sale", "lease"],
    );
  });

  it("keeps won and closed groups distinct and uses Korean names and workflow stage order", () => {
    const rows = [
      match("한지우"),
      match("강수연", {}, "negotiating"),
      match("거래", {}, "dealCreated"),
      match("종료", {}, "closed"),
    ];
    const result = sort(rows, { column: "customer", direction: "asc" });
    assert.deepEqual(ids(result.rest), ["강수연", "한지우"]);
    assert.deepEqual(ids(result.won), ["거래"]);
    assert.deepEqual(ids(result.closed), ["종료"]);
    assert.deepEqual(
      ids(sort(rows, { column: "stage", direction: "desc" }).rest),
      ["강수연", "한지우"],
    );
  });

  it("keeps missing stage history last and breaks equal waiting days by workflow progress", () => {
    const rows = [
      match("missing"),
      match("early"),
      match("late", {}, "negotiating"),
      match("old"),
    ];
    const days: Record<string, number | null> = {
      missing: null,
      early: 2,
      late: 2,
      old: 7,
    };
    assert.deepEqual(
      ids(
        sortMatchGroups(
          rows,
          { column: "need", direction: "desc" },
          stageIndex,
          (match) => days[match.id],
        ).rest,
      ),
      ["old", "late", "early", "missing"],
    );
  });
});

describe("linked buyer saved layout", () => {
  it("recovers from corrupt data, ignores unknown fields, and clamps unsafe widths", () => {
    assert.deepEqual(
      parseMatchTablePreferences("{broken"),
      defaultMatchTablePreferences,
    );
    assert.deepEqual(
      parseMatchTablePreferences("[]"),
      defaultMatchTablePreferences,
    );
    assert.deepEqual(
      parseMatchTablePreferences(
        JSON.stringify({
          widths: { customer: -10, budget: 9000, memo: "500", obsolete: 200 },
          sort: { column: "obsolete", direction: "asc" },
        }),
      ),
      {
        widths: { customer: 110, budget: 1200 },
        sort: defaultMatchTablePreferences.sort,
      },
    );
    assert.deepEqual(
      parseMatchTablePreferences(
        JSON.stringify({ widths: { budget: 241.4 }, sort: null }),
      ),
      { widths: { budget: 241 }, sort: null },
    );
    assert.equal(clampMatchColumnWidth("budget", NaN), 180);
  });

  it("round-trips active sorts and retains flexible memo until widths are measured", () => {
    const preference = {
      widths: { memo: 440, budget: 240 },
      sort: { column: "monthlyRent", direction: "desc" },
    };
    assert.deepEqual(
      parseMatchTablePreferences(JSON.stringify(preference)),
      preference,
    );
    assert.equal(getMatchTableLayout({}).width, undefined);
    assert.match(
      getMatchTableLayout({}).gridTemplateColumns,
      /minmax\(180px, 1fr\)/,
    );
    const measured = getMatchTableLayout({ memo: 440, budget: 240 });
    assert.equal(measured.width, 1462);
    assert.equal(measured.minWidth, 1462);
    assert.doesNotMatch(measured.gridTemplateColumns, /minmax/);
  });
});

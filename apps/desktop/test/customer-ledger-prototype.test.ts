import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildLedgerDependencyGraph,
  CUSTOMER_LEDGER_ROWS,
  getLedgerDependencyLinks,
  getLedgerIntentLines,
  includesLedgerQuery,
  sortLedgerIntentGroups,
  sortLedgerRows,
} from "../src/renderer/routes/_authenticated/prototypes/-customer-ledger/prototype-data.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const prototypeDir = resolve(
  testDir,
  "../src/renderer/routes/_authenticated/prototypes",
);

function readPrototype(path: string): string {
  return readFileSync(resolve(prototypeDir, path), "utf8");
}

const harnessSource = readPrototype("customer-ledger.tsx");
const coreSource = readPrototype("-customer-ledger/core-ledger.tsx");
const groupedSource = readPrototype("-customer-ledger/grouped-ledger.tsx");
const dependencySource = readPrototype(
  "-customer-ledger/dependency-diagram.tsx",
);
const actionSource = readPrototype("-customer-ledger/action-ledger.tsx");
const brokerDecisionSource = readPrototype(
  "-customer-ledger/action-first-grouped-ledger.tsx",
);
const partsSource = readPrototype("-customer-ledger/ledger-parts.tsx");
const pickerSource = readPrototype("-customer-ledger/prototype.css");

describe("customer ledger prototype", () => {
  it("keeps four URL-selectable ledger concepts behind an isolated route", () => {
    assert.match(
      harnessSource,
      /createFileRoute\(\s*"\/_authenticated\/prototypes\/customer-ledger",?\s*\)/,
    );
    assert.match(harnessSource, /name: "핵심 원장"/);
    assert.match(harnessSource, /name: "복수 요건 원장"/);
    assert.match(harnessSource, /name: "후속업무 원장"/);
    assert.match(harnessSource, /name: "중개 판단 원장"/);
    assert.match(harnessSource, /parsed >= 1 && parsed <= 4 \? parsed : 1/);
  });

  it("uses the prototype picker contract and keeps shortcuts out of editable controls", () => {
    assert.match(harnessSource, /className="proto-picker"/);
    assert.match(harnessSource, /className="proto-picker-highlight"/);
    assert.match(harnessSource, /className="proto-picker-item"/);
    assert.match(harnessSource, /event\.key === "ArrowRight"/);
    assert.match(harnessSource, /event\.key === "ArrowLeft"/);
    assert.match(harnessSource, /INPUT\|TEXTAREA\|SELECT/);
    assert.doesNotMatch(
      harnessSource,
      /proto-picker-replay|proto-picker-divider/,
    );
    assert.match(
      pickerSource,
      /transform 250ms cubic-bezier\(0\.23, 1, 0\.32, 1\)/,
    );
  });

  it("uses the production Notion-style data table in all four variants", () => {
    for (const source of [
      coreSource,
      groupedSource,
      actionSource,
      brokerDecisionSource,
    ]) {
      assert.match(source, /import \{ DataTable \}/);
      assert.match(source, /variant="notion"/);
      assert.match(source, /layout="full-height"/);
      assert.match(source, /rowHeight=\{40\}/);
    }
    assert.match(partsSource, /to="\/contacts"/);
  });

  it("keeps brokerage decision fields in front of follow-up work", () => {
    for (const label of [
      'header: "거래 요건"',
      'header: "최소예산"',
      'header: "최대예산"',
      'header: "매매가·보증금"',
      'header: "최소월세"',
      'header: "최대월세"',
      'header: "최소평형"',
      'header: "최대평형"',
      'header: "매칭·상태"',
      'header: "준비상태"',
      'header: "담당"',
      'header: "액션일"',
      'header: "최근 연락"',
    ]) {
      assert.match(brokerDecisionSource, new RegExp(label));
    }
    const decisionOrder = [
      'header: "거래 요건"',
      'header: "최소예산"',
      'header: "최대예산"',
      'header: "매매가·보증금"',
      'header: "최소월세"',
      'header: "최대월세"',
      'header: "최소평형"',
      'header: "최대평형"',
      'header: "매칭·상태"',
      'header: "준비상태"',
      'header: "담당"',
    ].map((field) => brokerDecisionSource.indexOf(field));
    assert.ok(decisionOrder.every((index) => index >= 0));
    assert.deepEqual(
      decisionOrder,
      decisionOrder.slice().sort((a, b) => a - b),
    );
    assert.doesNotMatch(brokerDecisionSource, /id: "nextAction"/);
    assert.doesNotMatch(brokerDecisionSource, /header: "다음 액션"/);
    assert.doesNotMatch(brokerDecisionSource, /id: "ledgerPrice"/);
    assert.doesNotMatch(brokerDecisionSource, /header: "내놓은가격"/);
    assert.match(brokerDecisionSource, /function AmountCell/);
    assert.match(brokerDecisionSource, /function MonthlyRentCell/);
    assert.match(brokerDecisionSource, /function MergedSupplyMonthlyRentCell/);
    assert.match(brokerDecisionSource, /\(\) => new Set\(\)/);
    assert.match(brokerDecisionSource, /isolate bg-white/);
    assert.match(brokerDecisionSource, /group-hover:bg-slate-50/);
    assert.match(brokerDecisionSource, /scroller\.scrollLeft = 0/);
    assert.match(brokerDecisionSource, /text-\[13px\]/);
    assert.match(brokerDecisionSource, /MERGED_INTENT_COLUMN_IDS/);
    assert.match(brokerDecisionSource, /table\.getColumn\(columnId\)/);
    assert.match(
      brokerDecisionSource,
      /data-broker-decision-intent-context-cell/,
    );
    assert.match(pickerSource, /\.broker-decision-intent-context-cell/);
    assert.match(brokerDecisionSource, /data-broker-decision-supply-area-cell/);
    assert.match(
      brokerDecisionSource,
      /data-broker-decision-supply-monthly-rent-cell/,
    );
    assert.doesNotMatch(brokerDecisionSource, /header: "공급평형"/);
    assert.doesNotMatch(brokerDecisionSource, /header: "선호지역·물건"/);
  });

  it("adds one full-height merged context cell below every intent", () => {
    const both = CUSTOMER_LEDGER_ROWS.find((row) => row.id === "customer-lee");
    const demandOnly = CUSTOMER_LEDGER_ROWS.find(
      (row) => row.id === "customer-han",
    );
    const supplyOnly = CUSTOMER_LEDGER_ROWS.find(
      (row) => row.id === "customer-kim",
    );

    assert.ok(both);
    assert.ok(demandOnly);
    assert.ok(supplyOnly);
    assert.equal(getLedgerIntentLines(both).length, 2);
    assert.equal(getLedgerIntentLines(demandOnly).length, 3);
    assert.equal(getLedgerIntentLines(supplyOnly).length, 3);
    assert.match(brokerDecisionSource, /lines\.map\(\(line, index\) =>/);
    assert.match(
      brokerDecisionSource,
      /data-broker-decision-intent-context-cell-slot=\{line\.id\}/,
    );
    assert.match(brokerDecisionSource, /height: INTENT_VIRTUAL_ROW_HEIGHT/);
    assert.match(brokerDecisionSource, /function IntentContextCell/);
    assert.match(brokerDecisionSource, /isDemand \? "선호" : "매물"/);
    assert.match(brokerDecisionSource, /\{line\.locationLabel\}/);
    assert.match(brokerDecisionSource, /\{line\.timingLabel\}/);
  });

  it("keeps the core ledger normalized and sortable by scalar fields", () => {
    for (const column of [
      'id: "customer"',
      'id: "phone"',
      'id: "demandTypes"',
      'id: "budgetMin"',
      'id: "budgetMax"',
      'id: "area"',
      'id: "nextActionAt"',
      'id: "lastContactAt"',
    ]) {
      assert.match(coreSource, new RegExp(column));
    }
    assert.match(
      coreSource,
      /pinnedColumns=\{\["customer", "phone", "actions"\]\}/,
    );
    assert.match(coreSource, /renderExpandedRow=\{\(row\) =>/);
    assert.match(coreSource, /<DemandTypeSummary row=\{row\.original\}/);
    assert.match(coreSource, /header: "주안 최소"/);
    assert.match(coreSource, /header: "주안 최대"/);
    assert.match(partsSource, /title="구하는 조건"/);
    assert.match(partsSource, /title="내놓은 물건"/);
    assert.match(partsSource, /title="선행 조건"/);
  });

  it("splits each customer's demand and supply intents into aligned subrows", () => {
    assert.match(groupedSource, /function IntentLinesCell/);
    assert.match(groupedSource, /getLedgerIntentLines\(row\)/);
    assert.match(groupedSource, /data-customer-intent-lines=\{row\.id\}/);
    assert.match(groupedSource, /data-ledger-intent-cell-line=\{line\.id\}/);
    assert.match(groupedSource, /header: "최소예산"/);
    assert.match(groupedSource, /header: "최대예산"/);
    assert.match(groupedSource, /header: "내놓은가격"/);
    assert.match(groupedSource, /header: "지역·물건"/);
    assert.match(groupedSource, /<DependencyDiagram row=\{row\}/);
    assert.doesNotMatch(groupedSource, /columnGroupControls/);
  });

  it("merges repeated prerequisite dependencies into one three-stage plan", () => {
    assert.match(dependencySource, /number="1"/);
    assert.match(dependencySource, /출발 기반/);
    assert.match(dependencySource, /number="2"/);
    assert.match(dependencySource, /선행 조건/);
    assert.match(dependencySource, /number="3"/);
    assert.match(dependencySource, /거래 목표/);
    assert.match(
      dependencySource,
      /data-ledger-dependency-link=\{link\.step\.id\}/,
    );
    assert.match(dependencySource, /data-ledger-dependency-intent=/);
    assert.match(dependencySource, /data-ledger-dependency-edge-phase=/);
    assert.match(dependencySource, /<ol className="sr-only"/);

    const han = CUSTOMER_LEDGER_ROWS.find((row) => row.id === "customer-han");
    assert.ok(han);
    const links = getLedgerDependencyLinks(han);
    const depositLink = links.find(
      (link) => link.step.id === "step-han-deposit",
    );
    const loanLink = links.find((link) => link.step.id === "step-han-loan");
    assert.deepEqual(depositLink?.targetIntentIds, [
      "demand-han-sale",
      "demand-han-jeonse",
      "demand-han-monthly",
    ]);
    assert.deepEqual(loanLink?.targetIntentIds, ["demand-han-sale"]);

    const graph = buildLedgerDependencyGraph(han);
    assert.equal(graph.sources.length, 2);
    assert.equal(graph.steps.length, 2);
    assert.equal(graph.targets.length, 3);
    assert.equal(
      graph.edges.filter((edge) => edge.phase === "source-to-step").length,
      2,
    );
    assert.equal(
      graph.edges.filter((edge) => edge.phase === "step-to-target").length,
      4,
    );
    assert.equal(
      new Set(graph.targets.map((target) => target.id)).size,
      graph.targets.length,
    );
  });

  it("provides an actionable inspector with filters and a reversible completion state", () => {
    assert.match(
      actionSource,
      /type ActionFilter = "all" \| "today" \| "review"/,
    );
    assert.match(actionSource, /aria-label="후속업무 필터"/);
    assert.match(actionSource, /w-\[360px\]/);
    assert.match(
      actionSource,
      /onRowClick=\{\(row\) => setSelectedId\(row\.id\)\}/,
    );
    assert.match(actionSource, /toggleCompleted/);
    assert.match(actionSource, /<DemandTypeSummary row=\{row\.original\}/);
    assert.match(actionSource, /완료됨 · 다시/);
    assert.match(actionSource, /onClose=\{\(\) => setSelectedId\(null\)\}/);
  });

  it("models demand-only, supply-only, and two-sided customers", () => {
    assert.equal(CUSTOMER_LEDGER_ROWS.length, 6);
    assert.deepEqual(
      new Set(CUSTOMER_LEDGER_ROWS.map((row) => row.mode)),
      new Set(["demand", "both", "supply"]),
    );
    assert.ok(
      CUSTOMER_LEDGER_ROWS.some(
        (row) => row.demandCount > 0 && row.supplyCount > 0,
      ),
    );
    assert.ok(includesLedgerQuery(CUSTOMER_LEDGER_ROWS[0], "전세보증금"));

    const han = CUSTOMER_LEDGER_ROWS.find((row) => row.id === "customer-han");
    assert.ok(han);
    const hanLines = getLedgerIntentLines(han);
    assert.deepEqual(
      hanLines.map((line) => [
        line.kind,
        line.transactionType,
        line.roleLabel,
        line.budgetMin,
        line.budgetMax,
      ]),
      [
        ["demand", "매매", "주안", 240000, 270000],
        ["demand", "전세", "대안", 90000, 130000],
        ["demand", "월세", "병행", 50000, 70000],
      ],
    );

    const allIntentCount = CUSTOMER_LEDGER_ROWS.reduce(
      (total, row) => total + getLedgerIntentLines(row).length,
      0,
    );
    assert.equal(allIntentCount, 12);

    const kang = CUSTOMER_LEDGER_ROWS.find((row) => row.id === "customer-kang");
    assert.ok(kang);
    const kangSupply = getLedgerIntentLines(kang).find(
      (line) => line.id === "supply-kang-home",
    );
    assert.equal(kangSupply?.areaMinPyeong, 34);
    assert.equal(kangSupply?.areaMaxPyeong, 34);

    const kim = CUSTOMER_LEDGER_ROWS.find((row) => row.id === "customer-kim");
    assert.ok(kim);
    const monthlySupply = getLedgerIntentLines(kim).find(
      (line) => line.id === "supply-kim-monthly",
    );
    assert.equal(monthlySupply?.transactionType, "월세");
    assert.equal(monthlySupply?.askingPrice, 10000);
    assert.equal(monthlySupply?.monthlyRentMin, 350);
    assert.equal(monthlySupply?.monthlyRentMax, 350);
    assert.ok(includesLedgerQuery(kim, "월 350만"));

    const hanMonthlyDemand = hanLines.find(
      (line) => line.id === "demand-han-monthly",
    );
    assert.equal(hanMonthlyDemand?.monthlyRentMin, 250);
    assert.equal(hanMonthlyDemand?.monthlyRentMax, 350);
  });

  it("sorts numeric values correctly and always leaves empty cells last", () => {
    const ascending = sortLedgerRows(CUSTOMER_LEDGER_ROWS, [
      { id: "budgetMin", desc: false },
    ]);
    const descending = sortLedgerRows(CUSTOMER_LEDGER_ROWS, [
      { id: "budgetMin", desc: true },
    ]);

    assert.equal(ascending[0].budgetMin, 160000);
    assert.equal(descending[0].budgetMin, 300000);
    assert.equal(ascending.at(-1)?.budgetMin, null);
    assert.equal(descending.at(-1)?.budgetMin, null);

    const intentAscending = sortLedgerIntentGroups(CUSTOMER_LEDGER_ROWS, [
      { id: "budgetMin", desc: false },
    ]);
    const intentDescending = sortLedgerIntentGroups(CUSTOMER_LEDGER_ROWS, [
      { id: "budgetMin", desc: true },
    ]);
    assert.equal(intentAscending[0].id, "customer-han");
    assert.equal(intentDescending[0].id, "customer-choi");
    assert.equal(intentAscending.at(-1)?.id, "customer-kim");

    const areaMaxDescending = sortLedgerIntentGroups(CUSTOMER_LEDGER_ROWS, [
      { id: "areaMax", desc: true },
    ]);
    assert.equal(areaMaxDescending[0].id, "customer-choi");

    const monthlyRentMinAscending = sortLedgerIntentGroups(
      CUSTOMER_LEDGER_ROWS,
      [{ id: "monthlyRentMin", desc: false }],
    );
    assert.equal(monthlyRentMinAscending[0].id, "customer-han");

    const monthlyRentMaxDescending = sortLedgerIntentGroups(
      CUSTOMER_LEDGER_ROWS,
      [{ id: "monthlyRentMax", desc: true }],
    );
    assert.equal(monthlyRentMaxDescending[0].id, "customer-kim");
    assert.equal(monthlyRentMaxDescending[1].id, "customer-han");
  });
});

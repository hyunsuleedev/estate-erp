import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { BrokerageCaseLedgerResponse } from "@estate-erp/api-client";
import { pyeongToSqm } from "@estate-erp/shared";
import {
  customerLedgerFilterDefinitions,
  customerLedgerFiltersToApiParams,
  customerLedgerSortDefinitions,
} from "../src/renderer/routes/_authenticated/customers/-customer-list-filters.ts";
import {
  getNextLedgerCursor,
  mergeLedgerPages,
} from "../src/renderer/routes/_authenticated/customers/-customer-ledger-pagination.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const customerRouteDir = resolve(
  testDir,
  "../src/renderer/routes/_authenticated/customers",
);
const customerPageSource = readFileSync(
  resolve(customerRouteDir, "index.tsx"),
  "utf8",
);
const customerLedgerStyles = readFileSync(
  resolve(customerRouteDir, "-customer-ledger.css"),
  "utf8",
);
const customerFiltersSource = readFileSync(
  resolve(customerRouteDir, "-customer-list-filters.ts"),
  "utf8",
);
const cellEditorSource = readFileSync(
  resolve(customerRouteDir, "../../../components/data-table/cell-editor.tsx"),
  "utf8",
);
const ledgerMatchPanelSource = readFileSync(
  resolve(customerRouteDir, "../matches/-ledger-match-panel.tsx"),
  "utf8",
);

function ledgerPage(
  nextCursor: string | null,
  caseIds: string[],
): BrokerageCaseLedgerResponse {
  return {
    items: caseIds.map((id) => ({ id })),
    pagination: {
      limit: 20,
      total: caseIds.length,
      nextCursor,
    },
    summary: { cases: caseIds.length, demand: 0, listing: 0, both: 0 },
  } as unknown as BrokerageCaseLedgerResponse;
}

describe("desktop customer ledger", () => {
  it("sorts and labels the ledger by the case registration date", () => {
    assert.deepEqual(customerLedgerSortDefinitions.at(-1), {
      field: "createdAt",
      label: "등록일",
    });
    assert.match(
      customerPageSource,
      /useState<BrokerageCaseLedgerSortField>\("createdAt"\)/,
    );
    assert.match(customerPageSource, /label="등록일"[\s\S]*?field="createdAt"/);
    assert.match(
      customerPageSource,
      /formatDateShortYear\(brokerageCase\.createdAt\)/,
    );
    assert.doesNotMatch(customerPageSource, /최근 갱신/);
  });

  it("keeps the category column visible without offering intent-count sorting", () => {
    assert.equal(
      customerLedgerSortDefinitions.some(
        ({ field }) => field === "intentCount",
      ),
      false,
    );
    assert.match(
      customerPageSource,
      /<LedgerStaticHeader icon=\{<Tag \/>\} label="구분" \/>/,
    );
    assert.doesNotMatch(customerPageSource, /field="intentCount"/);
  });

  it("shows the persisted demand rank and reorders it through the dedicated API", () => {
    assert.match(
      customerPageSource,
      /<KindLabel kind="demand" priorityRank=\{line\.priorityRank\} \/>/,
    );
    assert.match(
      customerPageSource,
      /demandPriorityOptions\(\s*row\.line\.intakeRequirementCount/,
    );
    assert.match(customerPageSource, /field="priorityRank"/);
    assert.match(
      customerPageSource,
      /api\.buyerRequirements\.reorder\(\s*request\.id,\s*request\.priorityRank/,
    );
    assert.match(customerPageSource, /구함 \{line\.priorityRank\} 상세 열기/);
    assert.doesNotMatch(customerPageSource, /구함 \{index \+ 1\} 상세 열기/);
  });

  it("selects each brokerage case from the first table column", () => {
    assert.match(customerPageSource, /const COLUMN_COUNT = 14/);
    assert.match(
      customerPageSource,
      /const \[selectedCaseIds, setSelectedCaseIds\]/,
    );
    assert.match(
      customerPageSource,
      /aria-label=\{`현재 불러온 \$\{visibleCaseIds\.length\}개 고객 케이스 전체 선택`\}/,
    );
    assert.match(
      customerPageSource,
      /className="ledger-sticky-select ledger-select-cell ledger-rowspan-top"/,
    );
    assert.match(
      customerPageSource,
      /aria-label=\{`\$\{customerName\} 고객 케이스 선택`\}/,
    );
    assert.match(customerPageSource, /selected && "ledger-case-selected"/);
  });

  it("keeps selection case-scoped across every loaded batch", () => {
    assert.match(customerPageSource, /visibleCaseIds\.every/);
    assert.match(
      customerPageSource,
      /someVisibleCasesSelected && "indeterminate"/,
    );
    assert.match(
      customerPageSource,
      /toggleCaseSelection\(brokerageCase\.id, selected\)/,
    );
    assert.match(customerPageSource, /\{selectedCaseIds\.length\}개 선택됨/);
    assert.match(customerPageSource, />\s*선택 해제\s*<\/button>/);
  });

  it("appends ledger batches near the scroll edge without page navigation", () => {
    assert.match(customerPageSource, /useInfiniteQuery/);
    assert.match(
      customerPageSource,
      /initialPageParam: null as string \| null/,
    );
    assert.match(
      customerPageSource,
      /api\.brokerageCases\.ledger\(\{[\s\S]*?\.\.\.filters,[\s\S]*?cursor: pageParam \?\? undefined/,
    );
    assert.match(customerPageSource, /new IntersectionObserver/);
    assert.match(customerPageSource, /root: scrollRegion/);
    assert.match(customerPageSource, /rootMargin: "0px 0px 240px 0px"/);
    assert.match(
      customerPageSource,
      /!ledgerQuery\.hasNextPage \|\|[\s\S]*?ledgerQuery\.isFetching \|\|[\s\S]*?ledgerQuery\.isFetchingNextPage/,
    );
    assert.match(customerPageSource, /ref=\{loadMoreRef\}/);
    assert.match(
      customerPageSource,
      /mergeLedgerPages\(ledgerQuery\.data\?\.pages\)/,
    );
    assert.match(customerPageSource, /아래로 스크롤하면 더 불러옵니다/);
    assert.doesNotMatch(customerPageSource, /aria-label="이전 페이지"/);
    assert.doesNotMatch(customerPageSource, /aria-label="다음 페이지"/);
    assert.doesNotMatch(customerPageSource, /const \[page, setPage\]/);
  });

  it("follows opaque cursors and defensively deduplicates merged batches", () => {
    assert.equal(getNextLedgerCursor(ledgerPage("cursor-2", [])), "cursor-2");
    assert.equal(getNextLedgerCursor(ledgerPage(null, [])), undefined);

    const firstPage = ledgerPage("cursor-2", ["case-1", "case-2"]);
    const secondPage = ledgerPage(null, ["case-2", "case-3"]);
    assert.deepEqual(
      mergeLedgerPages([firstPage, secondPage]).map(({ id }) => id),
      ["case-1", "case-2", "case-3"],
    );
    assert.equal(mergeLedgerPages(undefined).length, 0);
    assert.doesNotMatch(customerPageSource, /page: pageParam/);
  });

  it("pins selection, customer, and case actions in that order", () => {
    assert.match(
      customerLedgerStyles,
      /\.ledger-sticky-select\s*\{[\s\S]*?left: 0;/,
    );
    assert.match(
      customerLedgerStyles,
      /\.ledger-sticky-customer\s*\{[\s\S]*?left: 38px;/,
    );
    assert.match(
      customerLedgerStyles,
      /\.ledger-sticky-action\s*\{[\s\S]*?left: 228px;/,
    );
    assert.match(customerLedgerStyles, /\.ledger-case-selected > td/);
  });

  it("fixes compact columns and distributes remaining space across other columns", () => {
    assert.match(
      customerPageSource,
      /<col className="ledger-select-column" \/>/,
    );
    assert.match(
      customerPageSource,
      /<col className="ledger-customer-column" \/>/,
    );
    assert.match(
      customerPageSource,
      /<col className="ledger-action-column" \/>/,
    );
    assert.match(customerPageSource, /"ledger-transaction-column"/);
    assert.match(
      customerPageSource,
      /Array\.from\(\{ length: COLUMN_COUNT - 3 \}/,
    );
    assert.match(
      customerLedgerStyles,
      /col\.ledger-customer-column\s*\{[\s\S]*?width: 190px;/,
    );
    assert.match(
      customerLedgerStyles,
      /col\.ledger-action-column\s*\{[\s\S]*?width: 48px;/,
    );
    assert.match(
      customerLedgerStyles,
      /col\.ledger-transaction-column\s*\{[\s\S]*?width: 60px;/,
    );
    assert.match(
      customerLedgerStyles,
      /col\.ledger-fluid-column\s*\{[\s\S]*?width: auto;/,
    );
  });

  it("matches the buyer table header visual language", () => {
    assert.match(
      customerLedgerStyles,
      /\.customer-ledger-table thead th\s*\{[\s\S]*?height: 36px;[\s\S]*?border-right: 1px solid #eeeeec;[\s\S]*?border-bottom: 1px solid #d8d6d0;[\s\S]*?background: #f7f7f5;/,
    );
    assert.match(
      customerLedgerStyles,
      /\.customer-ledger-table thead \.ledger-sticky-action\s*\{[\s\S]*?background: #f5f4f1;[\s\S]*?box-shadow: 1px 0 0 0 #d9d9d6;/,
    );
    assert.match(customerPageSource, /function LedgerHeaderLabel/);
    assert.match(
      customerPageSource,
      /ledger-header-label inline-flex min-w-0 max-w-full items-center gap-1 text-\[12px\] font-normal text-muted-foreground/,
    );
    assert.match(customerPageSource, /icon=\{<UserRound \/>\}/);
    assert.match(customerPageSource, /icon=\{<CircleDot \/>\}/);
    assert.match(customerPageSource, /icon=\{<GitBranch \/>\}/);
    assert.match(customerPageSource, /icon=\{<CalendarDays \/>\}/);
    assert.match(
      customerPageSource,
      /\{active \? <SortIcon className="size-3 shrink-0" aria-hidden \/> : null\}/,
    );
  });

  it("strengthens range-group boundaries without changing the 14-column frame", () => {
    assert.match(
      customerLedgerStyles,
      /\.customer-ledger-table \.ledger-group-end\s*\{[\s\S]*?border-right-color: #d8d6d0;/,
    );
    assert.match(
      customerPageSource,
      /className="ledger-group-end"[\s\S]*?label="거래"/,
    );
    assert.match(
      customerPageSource,
      /<MoneyCell[\s\S]*?field="budgetMax"[\s\S]*?groupEnd/,
    );
    assert.match(
      customerPageSource,
      /<RentCell[\s\S]*?field="monthlyRentMax"[\s\S]*?groupEnd/,
    );
    assert.match(
      customerPageSource,
      /<AreaCell[\s\S]*?field="areaMax"[\s\S]*?groupEnd/,
    );
    assert.match(
      customerPageSource,
      /<MatchCell[\s\S]*?count=\{line\.matchCount\}[\s\S]*?groupEnd/,
    );
  });

  it("separates context identity from its editable note without repeated labels", () => {
    assert.equal(
      (customerPageSource.match(/className="ledger-context-layout"/g) ?? [])
        .length,
      2,
    );
    assert.doesNotMatch(customerPageSource, />\s*선호지역·물건\s*</);
    assert.doesNotMatch(customerPageSource, />\s*매물 데이터\s*</);
    assert.match(
      customerPageSource,
      /aria-label=\{`\$\{line\.contextLabel\} 구함 상세 열기`\}/,
    );
    assert.match(
      customerPageSource,
      /aria-label=\{`\$\{first\.contextLabel\} 매물 상세 열기`\}/,
    );
    assert.match(
      customerLedgerStyles,
      /\.ledger-context-layout\s*\{[\s\S]*?grid-template-columns: minmax\(180px, 240px\) minmax\(0, 1fr\);/,
    );
    assert.match(
      customerLedgerStyles,
      /\.ledger-context-memo\s*\{[\s\S]*?border-left:/,
    );
  });

  it("edits source-backed customer, demand, and listing fields without changing the table frame", () => {
    assert.match(customerPageSource, /<CellEditProvider>/);
    assert.match(customerPageSource, /target: "contact"/);
    assert.match(customerPageSource, /target: "buyer-intake"/);
    assert.match(customerPageSource, /target: "buyer-requirement"/);
    assert.match(customerPageSource, /target: "listing"/);
    assert.match(customerPageSource, /target: "listing-intake"/);
    assert.match(customerPageSource, /pyeongToSqm\(parsed\.value\)/);
    assert.match(
      customerPageSource,
      /parsed\.value === sqmToPyeong\(currentValue\)/,
    );
    assert.doesNotMatch(
      customerPageSource,
      /transactionType[\s\S]{0,80}price(?:Min|Max)?: null/,
    );
    assert.doesNotMatch(
      customerPageSource,
      /transactionType[\s\S]{0,120}(?:deposit|monthlyRent)(?:Min|Max)?: null/,
    );
    assert.match(
      customerPageSource,
      /\[\["listings"\], \["listing-intakes"\]\]/,
    );
    assert.match(
      customerPageSource,
      /expectedUpdatedAt: line\.listingUpdatedAt/,
    );
    assert.match(
      customerPageSource,
      /expectedUpdatedAt: first\.intakeUpdatedAt/,
    );
    assert.doesNotMatch(
      customerPageSource,
      /api\.contacts\.update\([^)]*\{\s*phone:/,
    );
    assert.match(
      customerLedgerStyles,
      /td\.ledger-editable-cell\s*\{[\s\S]*?padding: 0;/,
    );
  });

  it("gives every editable cell a native keyboard trigger and restores tab order", () => {
    assert.match(cellEditorSource, /<button[\s\S]*?data-editable-cell-trigger/);
    assert.match(cellEditorSource, /event\.key !== 'F2'/);
    assert.match(
      cellEditorSource,
      /commitDraft\(e\.shiftKey \? 'previous' : 'next'\)/,
    );
    assert.match(cellEditorSource, /if \(accepted === false\) return/);
    assert.match(
      cellEditorSource,
      /trigger\.focus\(\{ preventScroll: true \}\)/,
    );
    assert.match(cellEditorSource, /draft\.trim\(\) === ''[\s\S]*?null/);
  });

  it("expands match controls per demand or listing source with the property-ledger disclosure contract", () => {
    assert.match(customerPageSource, /demandMatchRowKey/);
    assert.match(customerPageSource, /listingMatchRowKey/);
    assert.match(customerPageSource, /aria-expanded=\{expanded\}/);
    assert.match(customerPageSource, /aria-controls=\{panelId\}/);
    assert.match(customerPageSource, /<LedgerMatchPanel/);
    assert.match(customerPageSource, /const rowSpan = rows\.length;/);
    assert.doesNotMatch(customerPageSource, /expandedPanelCount/);
    const baseRowsIndex = customerPageSource.indexOf(
      "{rows.map((row, rowIndex) =>",
    );
    const panelRowsIndex = customerPageSource.indexOf("{rows.map((row) =>");
    assert.ok(baseRowsIndex >= 0 && panelRowsIndex > baseRowsIndex);
    assert.match(
      customerPageSource,
      /<td colSpan=\{COLUMN_COUNT\}>[\s\S]*?customer-ledger-match-panel-frame/,
    );
    assert.match(
      customerPageSource,
      /for \(const siblingRowKey of siblingRowKeys\)[\s\S]*?next\.delete\(siblingRowKey\)/,
    );
    assert.match(
      customerLedgerStyles,
      /\.customer-ledger-match-panel-frame\s*\{[\s\S]*?left: 0;[\s\S]*?100cqw/,
    );
    assert.doesNotMatch(
      customerLedgerStyles,
      /customer-ledger-match-panel-sticky/,
    );
    assert.match(
      ledgerMatchPanelSource,
      /api\.matches\.findAll\(\{ buyerReqId: source\.requirementId \}\)/,
    );
    assert.match(
      ledgerMatchPanelSource,
      /uniqueListingIds\(source\.listingIds\)[\s\S]*?api\.matches\.findAll\(\{ listingId \}\)/,
    );
    assert.match(ledgerMatchPanelSource, /<MatchCreateDialog/);
    assert.match(ledgerMatchPanelSource, /<MatchConvertDialog/);
    assert.match(
      ledgerMatchPanelSource,
      /api\.matches\.updateMemo\(match\.id, \{[\s\S]*?memo,[\s\S]*?expectedUpdatedAt: match\.updatedAt/,
    );
    assert.doesNotMatch(ledgerMatchPanelSource, /normalizeMatchStage/);
  });

  it("anchors case-spanning cells to the first ledger row", () => {
    assert.equal(
      (customerPageSource.match(/ledger-rowspan-top/g) ?? []).length,
      4,
    );
    assert.match(
      customerLedgerStyles,
      /\.customer-ledger-table :is\(td, th\)\.ledger-rowspan-top\s*\{[\s\S]*?vertical-align: top;/,
    );
    assert.match(
      customerLedgerStyles,
      /td\.ledger-select-cell\s*\{[\s\S]*?padding-top: 11px;/,
    );
    assert.match(
      customerLedgerStyles,
      /td\.ledger-updated-cell\s*\{[\s\S]*?padding-top: 10px;/,
    );
  });

  it("shows a non-interactive right-edge cue only while columns remain hidden", () => {
    assert.match(
      customerPageSource,
      /const \[ledgerScrollState, setLedgerScrollState\]/,
    );
    assert.match(customerPageSource, /const maxScrollLeft = Math\.max/);
    assert.match(
      customerPageSource,
      /const resizeObserver = new ResizeObserver/,
    );
    assert.match(
      customerPageSource,
      /data-can-scroll-right=\{ledgerScrollState\.canScrollRight \|\| undefined\}/,
    );
    assert.match(customerPageSource, /id="customer-ledger-scroll-hint"/);
    assert.match(customerPageSource, /이 표는 좌우로 스크롤할 수 있습니다\./);
    assert.match(
      customerLedgerStyles,
      /\.customer-ledger-overflow-cue\s*\{[\s\S]*?pointer-events: none;/,
    );
    assert.match(
      customerLedgerStyles,
      /\[data-can-scroll-right="true"\][\s\S]*?\.customer-ledger-overflow-cue\s*\{[\s\S]*?opacity: 1;/,
    );
  });

  it("removes the both-only mode and adds one action menu per brokerage case", () => {
    assert.doesNotMatch(
      customerPageSource,
      /\{ value: "both", label: "양쪽" \}/,
    );
    assert.match(
      customerPageSource,
      /type CustomerLedgerMode = Exclude<BrokerageCaseLedgerMode, "both">/,
    );
    assert.match(customerPageSource, /\{ value: "listing", label: "내놓음" \}/);
    assert.doesNotMatch(customerPageSource, /label: "납품"/);
    assert.match(
      customerPageSource,
      /className="ledger-sticky-action ledger-action-cell ledger-rowspan-top"/,
    );
    assert.match(customerPageSource, /function CaseActionMenu/);
    assert.match(
      customerPageSource,
      /aria-label=\{`\$\{customerName\} 케이스 작업 메뉴`\}/,
    );
    assert.match(customerPageSource, />고객 정보 열기</);
    assert.match(customerPageSource, /구함 \{line\.priorityRank\} 상세 열기/);
    assert.match(customerPageSource, /매물 \{index \+ 1\} 열기/);
  });

  it("mirrors the buyer workbench filter hierarchy above the ledger", () => {
    assert.match(customerPageSource, /<ViewBar/);
    assert.match(customerPageSource, /variant="workbench"/);
    assert.match(customerPageSource, /showSearch=\{false\}/);
    assert.match(customerPageSource, /showActiveChips=\{false\}/);
    assert.match(
      customerPageSource,
      /\["preferredRegions", "preferredSites", "transactionType"\],[\s\S]*?\["status", "urgency"\],[\s\S]*?\["price", "area"\]/,
    );
    assert.match(customerFiltersSource, /import \{ staticFilterDefinitions \}/);
    assert.match(customerFiltersSource, /\.\.\.staticFilterDefinitions/);
    assert.deepEqual(
      customerLedgerFilterDefinitions.map((definition) => definition.field),
      [
        "status",
        "urgency",
        "transactionType",
        "price",
        "deposit",
        "monthlyRent",
        "area",
        "moveIn",
        "nextContact",
      ],
    );
    assert.match(customerPageSource, /id: "assignedToId"/);
    assert.match(customerPageSource, /id: "preferredSites"/);
    assert.match(customerPageSource, /id: "preferredRegions"/);
  });

  it("serializes every buyer filter as a BuyerRequirement condition", () => {
    const params = customerLedgerFiltersToApiParams([
      {
        id: "preferred-sites-test",
        field: "preferredSites",
        operator: "in",
        value: "site-1,site-2",
        values: ["site-1", "site-2"],
      },
      {
        id: "preferred-regions-test",
        field: "preferredRegions",
        operator: "in",
        value: "province:11,district:11740,ward:1174010100",
        values: ["province:11", "district:11740", "ward:1174010100"],
      },
      {
        id: "status-test",
        field: "status",
        operator: "in",
        value: "active,hold,completed",
        values: ["active", "hold", "completed"],
      },
      {
        id: "urgency-test",
        field: "urgency",
        operator: "in",
        value: "urgent,normal",
        values: ["urgent", "normal"],
      },
      {
        id: "transactionType-test",
        field: "transactionType",
        operator: "in",
        value: "sale,monthly",
        values: ["sale", "monthly"],
      },
      {
        id: "assigned-to-test",
        field: "assignedToId",
        operator: "in",
        value: "employee-1,employee-2",
        values: ["employee-1", "employee-2"],
      },
      {
        id: "price-test",
        field: "price",
        operator: "between",
        value: "50000~120000",
        valueMin: "50000",
        valueMax: "120000",
      },
      {
        id: "deposit-test",
        field: "deposit",
        operator: "between",
        value: "10000~30000",
        valueMin: "10000",
        valueMax: "30000",
      },
      {
        id: "monthlyRent-test",
        field: "monthlyRent",
        operator: "between",
        value: "100~250",
        valueMin: "100",
        valueMax: "250",
      },
      {
        id: "area-test",
        field: "area",
        operator: "between",
        value: "20~40",
        valueMin: "20",
        valueMax: "40",
      },
      {
        id: "move-in-test",
        field: "moveIn",
        operator: "between",
        value: "2026-09-01~2026-09-30",
        valueMin: "2026-09-01",
        valueMax: "2026-09-30",
      },
      {
        id: "next-contact-test",
        field: "nextContact",
        operator: "between",
        value: "2026-08-10~2026-08-20",
        valueMin: "2026-08-10",
        valueMax: "2026-08-20",
      },
    ]);

    assert.deepEqual(params, {
      preferredSiteIds: "site-1,site-2",
      provinceCodes: "11",
      districtCodes: "11740",
      wardCodes: "1174010100",
      status: "active,matched,hold,inactive,completed",
      urgency: "urgent,normal",
      transactionType: "sale,monthly",
      assignedToId: "employee-1,employee-2",
      priceMin: 50000,
      priceMax: 120000,
      depositMin: 10000,
      depositMax: 30000,
      monthlyRentMin: 100,
      monthlyRentMax: 250,
      areaMin: pyeongToSqm(20),
      areaMax: pyeongToSqm(40),
      moveInAfter: "2026-09-01",
      moveInBefore: "2026-09-30",
      nextContactAfter: "2026-08-10",
      nextContactBefore: "2026-08-20",
    });
    assert.equal("listingPriceMin" in params, false);
    assert.equal("listingPriceMax" in params, false);
  });
});

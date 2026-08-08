import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { pyeongToSqm } from "@estate-erp/shared";
import {
  customerLedgerFilterDefinitions,
  customerLedgerFiltersToApiParams,
} from "../src/renderer/routes/_authenticated/customers/-customer-list-filters.ts";

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

describe("desktop customer ledger", () => {
  it("selects each brokerage case from the first table column", () => {
    assert.match(customerPageSource, /const COLUMN_COUNT = 14/);
    assert.match(
      customerPageSource,
      /const \[selectedCaseIds, setSelectedCaseIds\]/,
    );
    assert.match(
      customerPageSource,
      /aria-label="현재 페이지 고객 케이스 전체 선택"/,
    );
    assert.match(
      customerPageSource,
      /<td rowSpan=\{rowSpan\} className="ledger-sticky-select ledger-select-cell">/,
    );
    assert.match(
      customerPageSource,
      /aria-label=\{`\$\{customerName\} 고객 케이스 선택`\}/,
    );
    assert.match(customerPageSource, /selected && "ledger-case-selected"/);
  });

  it("keeps selection case-scoped and exposes page-wide selection feedback", () => {
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

  it("removes the both-only mode and adds one action menu per brokerage case", () => {
    assert.doesNotMatch(
      customerPageSource,
      /\{ value: "both", label: "양쪽" \}/,
    );
    assert.match(
      customerPageSource,
      /type CustomerLedgerMode = Exclude<BrokerageCaseLedgerMode, "both">/,
    );
    assert.match(
      customerPageSource,
      /<td rowSpan=\{rowSpan\} className="ledger-sticky-action ledger-action-cell">/,
    );
    assert.match(customerPageSource, /function CaseActionMenu/);
    assert.match(
      customerPageSource,
      /aria-label=\{`\$\{customerName\} 케이스 작업 메뉴`\}/,
    );
    assert.match(customerPageSource, />고객 정보 열기</);
    assert.match(customerPageSource, /구함 \{index \+ 1\} 상세 열기/);
    assert.match(customerPageSource, /납품 \{index \+ 1\} 매물 열기/);
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
    assert.equal("supplyPriceMin" in params, false);
    assert.equal("supplyPriceMax" in params, false);
  });
});

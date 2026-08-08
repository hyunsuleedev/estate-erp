import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { BuyerIntake, BuyerRequirement } from "@estate-erp/api-client";
import {
  buyerIntakesToGroups,
  sortBuyerRequirementGroups,
} from "../src/renderer/routes/_authenticated/buyer-requirements/-buyer-ledger";

const testDir = dirname(fileURLToPath(import.meta.url));
const routeDir = "../src/renderer/routes/_authenticated/buyer-requirements";
const buyerPageSource = readFileSync(
  resolve(testDir, `${routeDir}/index.tsx`),
  "utf8",
);
const buyerFiltersSource = readFileSync(
  resolve(testDir, `${routeDir}/-buyer-list-filters.ts`),
  "utf8",
);
const buyerCellsSource = readFileSync(
  resolve(testDir, `${routeDir}/-buyer-ledger-cells.tsx`),
  "utf8",
);
const buyerColumnsSource = readFileSync(
  resolve(testDir, `${routeDir}/-buyer-ledger-columns.tsx`),
  "utf8",
);
const buyerLedgerSource = readFileSync(
  resolve(testDir, `${routeDir}/-buyer-ledger.ts`),
  "utf8",
);
const viewBarSource = readFileSync(
  resolve(testDir, "../src/renderer/components/data-table/view-bar.tsx"),
  "utf8",
);
const buyerPanelsSource = readFileSync(
  resolve(testDir, `${routeDir}/-buyer-list-panels.tsx`),
  "utf8",
);
const buyerUtilsSource = readFileSync(
  resolve(testDir, `${routeDir}/-buyer-utils.ts`),
  "utf8",
);
const buyerFormSource = readFileSync(
  resolve(testDir, `${routeDir}/-buyer-form.tsx`),
  "utf8",
);
const matchSectionSource = readFileSync(
  resolve(testDir, `${routeDir}/-match-section.tsx`),
  "utf8",
);
const statusBadgeSource = readFileSync(
  resolve(testDir, "../src/renderer/components/domain/status-badge.tsx"),
  "utf8",
);
const statusConfigSource = readFileSync(
  resolve(testDir, "../src/renderer/lib/status-config.ts"),
  "utf8",
);

describe("desktop buyer requirements table", () => {
  it("uses the property-management full-bleed toolbar and notion grid", () => {
    assert.match(buyerPageSource, /data-buyer-requirements-page/);
    assert.match(buyerPageSource, /className="-m-4 flex min-h-0 flex-1/);
    assert.match(buyerPageSource, /showSearch=\{false\}/);
    assert.match(buyerPageSource, /variant="notion"/);
    assert.match(buyerPageSource, /rowHeight="auto"/);
  });

  it("splits the page into focused list modules", () => {
    // index.tsx는 페이지 로직만 유지하고 필터/셀/컬럼은 전담 모듈로 분리한다.
    // (단일 파일 1,527줄 → 페이지 로직 640줄 안팎)
    assert.ok(buyerPageSource.split("\n").length < 700);
    assert.match(buyerPageSource, /from "\.\/-buyer-list-filters"/);
    assert.match(buyerPageSource, /from "\.\/-buyer-ledger-columns"/);
    assert.doesNotMatch(
      buyerPageSource,
      /function BuyerIntentLinesCell|function BuyerGroupCustomerCell/,
    );
    assert.match(buyerFiltersSource, /export const staticFilterDefinitions/);
    assert.match(buyerCellsSource, /export function BuyerIntentLinesCell/);
    assert.match(buyerColumnsSource, /export function buildBuyerLedgerColumns/);
  });

  it("keeps BuyerIntake identity and per-requirement actions together", () => {
    // 전화번호는 고객 셀 보조 라인으로 병합 — 고객·작업 컬럼만 고정한다.
    assert.match(
      buyerPageSource,
      /pinnedColumns=\{\["customer", "actions"\]\}/,
    );
    assert.doesNotMatch(buyerColumnsSource, /id: "phone"/);
    assert.match(buyerCellsSource, /formatPhone\(contact\.phone\)/);
    assert.match(buyerPageSource, /selectedRowIds=\{selectedGroupIds\}/);
    assert.match(
      buyerPageSource,
      /selected=\{groups\.flatMap\(\(group\) => group\.requirements\)\}/,
    );
    assert.match(buyerColumnsSource, /<BuyerRequirementActionMenu/);
    assert.doesNotMatch(buyerPageSource, /activateOnDoubleClick/);
    assert.doesNotMatch(buyerPageSource, /onRowClick=/);
  });

  it("shows urgency in the list and avoids a duplicate secondary search", () => {
    assert.match(buyerColumnsSource, /field="urgency"/);
    assert.match(buyerCellsSource, /"buyerStatus" : "buyerUrgency"/);
    assert.match(viewBarSource, /showSearch\?: boolean/);
    assert.match(viewBarSource, /\{showSearch && \(/);
    assert.match(viewBarSource, /showActiveChips\?: boolean/);
  });

  it("edits requirement status and urgency inline with the property-table chip selector", () => {
    assert.match(buyerPageSource, /<CellEditProvider>/);
    assert.match(buyerCellsSource, /<EditableCell/);
    assert.match(buyerCellsSource, /editType="select-chip"/);
    assert.match(buyerCellsSource, /chipValueOf=/);
    assert.match(buyerCellsSource, /buyerStatusChipOptions/);
    assert.match(buyerCellsSource, /buyerUrgencyChipOptions/);
    assert.match(buyerPageSource, /api\.buyerRequirements\.updateStatus/);
    assert.match(
      buyerPageSource,
      /api\.buyerRequirements\.update\(id, \{ urgency: value \}\)/,
    );
    assert.match(
      buyerPageSource,
      /invalidateQueries\(\{[\s\S]*?queryKey: \["buyer-requirements"\]/,
    );
    assert.match(buyerColumnsSource, /field="status"/);
    assert.match(buyerColumnsSource, /field="urgency"/);
  });

  it("merges budget, monthly rent, and area boundaries into compact range cells", () => {
    // min/max 6개 컬럼 → 예산/보증금 · 월세 · 평형 3개 병합 컬럼
    assert.match(buyerColumnsSource, /id: "budget"/);
    assert.match(buyerColumnsSource, /label="예산\/보증금"/);
    assert.match(buyerColumnsSource, /id: "monthlyRent"/);
    assert.match(buyerColumnsSource, /label="월세"/);
    assert.match(buyerColumnsSource, /id: "area"/);
    assert.match(buyerColumnsSource, /label="평형"/);
    assert.doesNotMatch(buyerColumnsSource, /id: "budgetMin"|id: "budgetMax"/);
    assert.doesNotMatch(
      buyerColumnsSource,
      /id: "monthlyRentMin"|id: "monthlyRentMax"/,
    );
    assert.doesNotMatch(buyerColumnsSource, /id: "areaMin"|id: "areaMax"/);
    // 병합 셀은 거래유형별 경계를 그대로 따른다 (매매=매매가, 월세=보증금/월세).
    assert.match(buyerCellsSource, /buyerBudgetBoundaryValue/);
    assert.match(buyerCellsSource, /formatCompactMoneyRange/);
    assert.match(
      buyerCellsSource,
      /requirement\.transactionType === "monthly"/,
    );
    assert.match(buyerCellsSource, /requirement\.monthlyRentMin/);
    assert.match(buyerCellsSource, /requirement\.monthlyRentMax/);
    assert.match(buyerLedgerSource, /requirement\.depositMin/);
    assert.match(buyerLedgerSource, /requirement\.depositMax/);
    assert.match(buyerFormSource, /월세 범위/);
    assert.match(buyerFormSource, /monthlyRentMin/);
  });

  it("hides the monthly-rent column when the transaction-type filter excludes rent", () => {
    // 월세는 월세 요건에만 값이 있다 — 필터가 월세를 빼면 컬럼을 통째로 숨긴다.
    assert.match(buyerPageSource, /filter\.field === "transactionType"/);
    assert.match(buyerPageSource, /values\.includes\("monthly"\)/);
    assert.match(buyerColumnsSource, /if \(showRent\)/);
  });

  it("keeps boundary-level sorting while the merged columns stay display-only", () => {
    assert.match(
      buyerFiltersSource,
      /\{ field: "budgetMin", label: "최소예산" \}/,
    );
    assert.match(
      buyerFiltersSource,
      /\{ field: "budgetMax", label: "최대예산" \}/,
    );
    assert.match(
      buyerFiltersSource,
      /\{ field: "monthlyRentMin", label: "최소월세" \}/,
    );
    assert.match(
      buyerFiltersSource,
      /\{ field: "monthlyRentMax", label: "최대월세" \}/,
    );
    assert.match(
      buyerFiltersSource,
      /\{ field: "areaMin", label: "최소평형" \}/,
    );
    assert.match(
      buyerFiltersSource,
      /\{ field: "areaMax", label: "최대평형" \}/,
    );
    assert.match(buyerLedgerSource, /case "budgetMin"/);
    assert.match(buyerLedgerSource, /case "monthlyRentMax"/);
  });

  it("moves non-sortable preference data into one full-width context cell", () => {
    assert.match(buyerCellsSource, /data-buyer-ledger-context-cell/);
    assert.match(buyerCellsSource, /data-buyer-ledger-context-slot/);
    assert.match(buyerColumnsSource, /CONTEXT_COLUMN_IDS/);
    // 컨텍스트 행은 병합 범위 컬럼까지 가로로 이어진다.
    assert.match(
      buyerColumnsSource,
      /"intentCount"[\s\S]*?"budget"[\s\S]*?"monthlyRent"[\s\S]*?"area"/,
    );
    assert.match(buyerCellsSource, /<BuyerPreferenceContext/);
    assert.match(buyerCellsSource, /regions\.join\(" · "\)/);
    assert.match(buyerCellsSource, /sites\.join\(" · "\)/);
    assert.match(buyerCellsSource, /유형 \{typeText\}/);
    assert.match(buyerCellsSource, /formatDate\(requirement\.moveInDate\)/);
    assert.match(buyerUtilsSource, /export function siteTypeSummary/);
    assert.match(buyerUtilsSource, /SITE_TYPE_LABELS\[type\] \?\? type/);
    assert.doesNotMatch(buyerColumnsSource, /id: "siteTypes"/);
    assert.doesNotMatch(buyerColumnsSource, /id: "want"/);
  });

  it("uses supply pyeong as the buyer area language end to end", () => {
    assert.match(buyerFormSource, /공급평형/);
    assert.match(buyerFormSource, /pyeongToSqm\(aMinPyeong\)/);
    assert.match(buyerFormSource, /sqmToPyeong\(value\)/);
    assert.doesNotMatch(
      buyerFormSource,
      /mustConditions|preferConditions|TagInput/,
    );
    assert.match(
      buyerCellsSource,
      /formatAreaRange\(requirement\.areaMin, requirement\.areaMax\)/,
    );
    assert.match(buyerPageSource, /params\.areaMin = pyeongToSqm/);
    assert.match(buyerUtilsSource, /formatSupplyPyeong/);
    assert.match(matchSectionSource, /unit\?\.supplyAreaM2/);
    assert.doesNotMatch(matchSectionSource, /exclusiveAreaM2/);
  });

  it("mirrors the property-management filter hierarchy", () => {
    assert.match(buyerPageSource, /<Tabs[\s\S]*?value=\{preset\}/);
    assert.doesNotMatch(
      buyerPageSource,
      /BuyerViewModeSwitch|viewMode|pipelineParams/,
    );
    assert.match(buyerPageSource, /variant="workbench"/);
    assert.match(
      buyerPageSource,
      /inlineFilterGroups=\{\[[\s\S]*?preferredRegions[\s\S]*?preferredSites[\s\S]*?transactionType[\s\S]*?status[\s\S]*?urgency[\s\S]*?price[\s\S]*?area/,
    );
    assert.match(buyerPageSource, /params\.lifecycleStatus = preset/);
    assert.doesNotMatch(
      buyerPageSource,
      /if \(filter\.field === "status"\) setPreset\("all"\)/,
    );
    assert.match(viewBarSource, /variant\?: 'default' \| 'workbench'/);
    assert.match(viewBarSource, /data-view-bar-variant=\{variant\}/);
    assert.match(viewBarSource, /h-5 w-px shrink-0 bg-border/);
    assert.match(viewBarSource, /const activeCount = workbench/);
    assert.match(
      viewBarSource,
      /h-8 max-w-\[240px\][\s\S]*?border border-border bg-white/,
    );
  });

  it("uses one table-pill geometry across status and action badges", () => {
    assert.match(statusBadgeSource, /size\?: 'sm' \| 'default' \| 'table'/);
    assert.match(statusBadgeSource, /'h-6 px-2 text-\[11px\]'/);
    assert.equal((buyerCellsSource.match(/size="table"/g) ?? []).length, 2);
    assert.match(
      buyerCellsSource,
      /inline-flex h-5 items-center gap-1 rounded bg-blue-50/,
    );
    assert.match(
      buyerPanelsSource,
      /inline-flex h-6 items-center rounded-md bg-warning-soft px-2 text-\[11px\] font-medium/,
    );
  });

  it("uses the property table palette for transaction-type badges", () => {
    assert.match(
      statusBadgeSource,
      /meta\.className \?\? TONE_CLASSES\[meta\.tone\]/,
    );
    assert.match(
      statusConfigSource,
      /sale:[\s\S]*?className: 'bg-\[#fdebec\] text-\[#8f4b46\]'/,
    );
    assert.match(
      statusConfigSource,
      /jeonse:[\s\S]*?className: 'bg-\[#e7f3f8\] text-\[#337ea9\]'/,
    );
    assert.match(
      statusConfigSource,
      /monthly:[\s\S]*?className: 'bg-\[#fbf3db\] text-\[#8f6b1f\]'/,
    );
  });

  it("keeps intake lifecycle, requirement status, and match progress separate", () => {
    assert.match(
      statusConfigSource,
      /buyerStatus:\s*\{\s*active:[\s\S]*?hold:[\s\S]*?completed:/,
    );
    assert.match(statusConfigSource, /matched['"]\) return 'active'/);
    assert.match(statusConfigSource, /inactive['"]\) return 'hold'/);
    assert.match(
      buyerFiltersSource,
      /type PresetId = "all" \| "open" \| "hold" \| "closed"/,
    );
    assert.match(buyerFiltersSource, /\{ id: "open", label: "진행" \}/);
    assert.match(buyerFiltersSource, /\{ id: "hold", label: "보류" \}/);
    assert.match(buyerFiltersSource, /\{ id: "closed", label: "종료" \}/);
    assert.match(buyerColumnsSource, /label="요건상태"/);
    assert.doesNotMatch(
      buyerPanelsSource,
      /BuyerPipelineView|BuyerPipelineCard|LANE_ORDER/,
    );
    assert.match(buyerUtilsSource, /active: \["hold", "completed"\]/);
    assert.doesNotMatch(buyerPageSource, /label: "연락 필요"/);
    assert.doesNotMatch(buyerPageSource, /findDueContacts|due-contacts/);
    assert.doesNotMatch(buyerPageSource, /label: "매칭 진행중"/);
  });

  it("shows match counts without inline disclosure", () => {
    assert.match(buyerColumnsSource, /label="매칭상태"/);
    assert.match(buyerCellsSource, /매칭 \{count\}건/);
    assert.doesNotMatch(buyerPageSource, /aria-expanded/);
    assert.doesNotMatch(buyerPageSource, /renderExpandedRow/);
    assert.doesNotMatch(buyerPageSource, /expandedRowIds/);
    assert.doesNotMatch(buyerPageSource, /MatchExpandPanel|WantExpandPanel/);
  });

  it("groups by BuyerIntake, preserves priorityRank, and sorts by the first preference", () => {
    const requirement = (
      id: string,
      buyerIntakeId: string,
      priorityRank: number,
      priceMin: number,
    ) =>
      ({
        id,
        buyerIntakeId,
        priorityRank,
        transactionType: "sale",
        priceMin,
        priceMax: priceMin + 10_000,
        createdAt: `2026-08-0${priorityRank}T00:00:00.000Z`,
        updatedAt: `2026-08-0${priorityRank}T00:00:00.000Z`,
      }) as BuyerRequirement;
    const buyerIntake = (
      id: string,
      requirements: BuyerRequirement[],
      contacts: BuyerIntake["contacts"],
    ) =>
      ({
        id,
        lifecycleStatus: "open",
        receivedAt: "2026-08-06T00:00:00.000Z",
        createdAt: "2026-08-06T00:00:00.000Z",
        updatedAt: "2026-08-06T00:00:00.000Z",
        memo: null,
        contacts,
        requirements,
      }) as BuyerIntake;
    const buyer = {
      id: "p1",
      contactId: "c1",
      role: "buyer" as const,
      isPrimary: false,
      contact: { id: "c1", name: "한구매", phone: null },
    } as BuyerIntake["contacts"][number];
    const father = {
      id: "p2",
      contactId: "c2",
      role: "representative" as const,
      isPrimary: true,
      contact: { id: "c2", name: "한아버지", phone: "01012345678" },
    } as BuyerIntake["contacts"][number];

    const grouped = buyerIntakesToGroups([
      buyerIntake(
        "i1",
        [
          requirement("r2", "i1", 2, 900_000),
          requirement("r1", "i1", 1, 100_000),
        ],
        [buyer, father],
      ),
      buyerIntake(
        "i2",
        [requirement("r3", "i2", 1, 300_000)],
        [{ ...buyer, id: "p3", isPrimary: true }],
      ),
    ]);

    assert.equal(grouped.length, 2);
    assert.equal(grouped[0]?.buyerIntakeId, "i1");
    assert.equal(grouped[0]?.primaryParticipant?.contact?.name, "한아버지");
    assert.deepEqual(
      grouped[0]?.requirements.map((item) => item.id),
      ["r1", "r2"],
    );
    assert.equal(
      sortBuyerRequirementGroups(grouped, [{ id: "budgetMin", desc: true }])[0]
        ?.buyerIntakeId,
      "i2",
    );
    assert.match(buyerLedgerSource, /buyer-intake/);
    assert.match(buyerLedgerSource, /priorityRank/);
    assert.match(buyerCellsSource, /data-buyer-intake-participants/);
    assert.match(buyerCellsSource, /kind="intakeLifecycle"/);
  });

  it("keeps the buyer page list-only without pipeline code or queries", () => {
    assert.doesNotMatch(buyerPageSource, /파이프라인|pipeline|Pipeline/);
    assert.doesNotMatch(buyerPanelsSource, /파이프라인|pipeline|Pipeline/);
    assert.equal(
      (buyerPageSource.match(/api\.buyerIntakes\.findAll/g) ?? []).length,
      1,
    );
    assert.doesNotMatch(buyerPageSource, /api\.buyerRequirements\.findAll/);
  });
});

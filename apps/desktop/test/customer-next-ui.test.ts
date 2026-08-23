import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type {
  BrokerageCase,
  BrokerageCaseDemandIntent,
  BrokerageCaseListingIntent,
} from "@estate-erp/api-client";
import {
  getCustomerCaseSelectionKeys,
  getCustomerListingOptionMemo,
  getCustomerSelectionState,
  getDemandSelectionKey,
  getListingSelectionKey,
  groupCustomerDemandIntents,
  groupCustomerListingIntents,
  summarizeCustomerCase,
  toggleCustomerCaseCollapsed,
  toggleCustomerIntakeCollapsed,
  updateCustomerSelection,
} from "../src/renderer/routes/_authenticated/customers-next/-customers-next-model.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const supportRouteDir = resolve(
  testDir,
  "../src/renderer/routes/_authenticated/customers-next",
);
const pageSource = readFileSync(
  resolve(testDir, "../src/renderer/routes/_authenticated/customers/index.tsx"),
  "utf8",
);
const newDemandIntakePageSource = readFileSync(
  resolve(
    testDir,
    "../src/renderer/routes/_authenticated/buyer-requirements/new.tsx",
  ),
  "utf8",
);
const buyerRequirementFormSource = readFileSync(
  resolve(
    testDir,
    "../src/renderer/routes/_authenticated/buyer-requirements/-buyer-form.tsx",
  ),
  "utf8",
);
const cellEditorSource = readFileSync(
  resolve(testDir, "../src/renderer/components/data-table/cell-editor.tsx"),
  "utf8",
);
const customerCaseActionMenuSource = readFileSync(
  resolve(
    testDir,
    "../src/renderer/routes/_authenticated/customers/-customer-case-action-menu.tsx",
  ),
  "utf8",
);
const customerDemandIntentActionMenuSource = readFileSync(
  resolve(
    testDir,
    "../src/renderer/routes/_authenticated/customers/-customer-demand-intent-action-menu.tsx",
  ),
  "utf8",
);
const customerDemandIntakeActionMenuSource = readFileSync(
  resolve(
    testDir,
    "../src/renderer/routes/_authenticated/customers/-customer-demand-intake-action-menu.tsx",
  ),
  "utf8",
);
const styles = readFileSync(
  resolve(supportRouteDir, "-customers-next.css"),
  "utf8",
);
const legacyPageSource = readFileSync(
  resolve(
    testDir,
    "../src/renderer/routes/_authenticated/customers-table/index.tsx",
  ),
  "utf8",
);
const ledgerMatchPanelSource = readFileSync(
  resolve(supportRouteDir, "../matches/-ledger-match-panel.tsx"),
  "utf8",
);
const matchCreateDialogSource = readFileSync(
  resolve(supportRouteDir, "../matches/-match-create-dialog.tsx"),
  "utf8",
);

function listingIntent(
  intakeId: string,
  listingId: string,
  contextLabel: string,
  matchCount: number,
): BrokerageCaseListingIntent {
  return {
    listingIntakeId: intakeId,
    listingId,
    contextLabel,
    matchCount,
  } as BrokerageCaseListingIntent;
}

function demandIntent(
  requirementId: string,
  contextLabel: string,
  matchCount: number,
  buyerIntakeId = "buyer-intake-a",
): BrokerageCaseDemandIntent {
  return {
    buyerIntakeId,
    requirementId,
    contextLabel,
    matchCount,
  } as BrokerageCaseDemandIntent;
}

describe("customer next workspace", () => {
  it("promotes the new ledger to customers and keeps the table on customers-table", () => {
    assert.match(
      pageSource,
      /createFileRoute\("\/_authenticated\/customers\/"\)/,
    );
    assert.doesNotMatch(pageSource, /전체 기준 고객 케이스 요약/);
    assert.doesNotMatch(pageSource, /표 원장 보기/);
    assert.match(
      legacyPageSource,
      /createFileRoute\("\/_authenticated\/customers-table\/"\)/,
    );
    assert.match(
      legacyPageSource,
      /<Link to="\/customers" aria-label="고객 중심 새 보기 열기">/,
    );
    assert.match(pageSource, /data-customers-next-page/);
    assert.doesNotMatch(pageSource, /<table/);
  });

  it("opens a dedicated new demand intake page from the customer ledger", () => {
    assert.match(
      pageSource,
      /function handleCreateDemandIntake|const handleCreateDemandIntake/,
    );
    assert.match(
      pageSource,
      /createTab\(\{ route, kind: meta\.kind, title: meta\.title \}\)/,
    );
    assert.match(pageSource, />\s*구함 의뢰 추가\s*<\/Button>/);
    assert.match(
      newDemandIntakePageSource,
      /api\.buyerRequirements\.create\(\{ \.\.\.dto, createNewIntake: true \}\)/,
    );
    assert.match(
      newDemandIntakePageSource,
      /queryKey: \[['"]brokerage-cases['"]\]/,
    );
    assert.match(newDemandIntakePageSource, /title="구함 의뢰 추가"/);
    assert.match(
      newDemandIntakePageSource,
      /closeTab\(ownerTabIdRef\.current\)[\s\S]*?getRouteMeta\('\/customers'\)[\s\S]*?openModule/,
    );
    assert.match(buyerRequirementFormSource, /구함 의뢰 등록/);
  });

  it("starts every customer group expanded and collapses each one independently", () => {
    assert.match(pageSource, /key=\{virtualCase\.key\}/);
    assert.match(pageSource, /data-customer-case-group/);
    assert.match(pageSource, /aria-expanded=\{expanded\}/);
    assert.match(pageSource, /aria-controls=\{panelId\}/);
    assert.match(pageSource, /expanded && \(/);
    assert.match(
      pageSource,
      /const \[collapsedCaseIds, setCollapsedCaseIds\] = useState<Set<string>>/,
    );
    assert.match(
      pageSource,
      /const expanded = !collapsedCaseIds\.has\(brokerageCase\.id\)/,
    );
    assert.doesNotMatch(pageSource, /expandedCaseId/);
    assert.match(pageSource, /data-customer-intent-list/);
    assert.match(pageSource, /role="list"/);
    assert.match(pageSource, /aria-label=\{`\$\{customerName\} 의뢰 목록`\}/);
    assert.doesNotMatch(pageSource, />연결된 거래 정보<\/h2>/);
    assert.doesNotMatch(pageSource, /function IntentSection/);

    const initiallyExpanded = new Set<string>();
    const afterFirstCollapse = toggleCustomerCaseCollapsed(
      initiallyExpanded,
      "case-1",
    );
    const afterSecondCollapse = toggleCustomerCaseCollapsed(
      afterFirstCollapse,
      "case-2",
    );
    const afterFirstReopen = toggleCustomerCaseCollapsed(
      afterSecondCollapse,
      "case-1",
    );

    assert.deepEqual([...initiallyExpanded], []);
    assert.deepEqual([...afterFirstCollapse], ["case-1"]);
    assert.deepEqual([...afterSecondCollapse], ["case-1", "case-2"]);
    assert.deepEqual([...afterFirstReopen], ["case-2"]);
    assert.match(pageSource, /setCollapsedCaseIds\(new Set\(\)\)/);
  });

  it("selects customer, demand intake and leaf branches hierarchically", () => {
    const brokerageCase = {
      id: "case-selection",
      demandIntents: [
        demandIntent("requirement-1", "강동구", 2, "buyer-intake-a"),
        demandIntent("requirement-2", "송파구", 1, "buyer-intake-a"),
      ],
      listingIntents: [
        listingIntent("listing-intake-a", "listing-1", "고덕 101동", 1),
      ],
    } as BrokerageCase;
    const caseKeys = getCustomerCaseSelectionKeys(brokerageCase);
    const demandKeys = [
      getDemandSelectionKey("requirement-1"),
      getDemandSelectionKey("requirement-2"),
    ];
    const listingKey = getListingSelectionKey("listing-1");

    assert.deepEqual(caseKeys, [...demandKeys, listingKey]);

    const noneSelected = new Set<string>();
    const demandSelected = updateCustomerSelection(
      noneSelected,
      demandKeys,
      true,
    );
    assert.equal(getCustomerSelectionState(demandSelected, demandKeys), true);
    assert.equal(
      getCustomerSelectionState(demandSelected, caseKeys),
      "indeterminate",
    );
    assert.deepEqual([...noneSelected], []);

    const allSelected = updateCustomerSelection(demandSelected, caseKeys, true);
    assert.equal(getCustomerSelectionState(allSelected, caseKeys), true);

    const oneRemoved = updateCustomerSelection(
      allSelected,
      [getDemandSelectionKey("requirement-1")],
      false,
    );
    assert.equal(
      getCustomerSelectionState(oneRemoved, demandKeys),
      "indeterminate",
    );
    assert.equal(
      getCustomerSelectionState(oneRemoved, caseKeys),
      "indeterminate",
    );

    assert.match(pageSource, /const \[selectedItemKeys, setSelectedItemKeys\]/);
    assert.match(pageSource, /<HierarchySelectionCheckbox/);
    assert.match(pageSource, /data-hierarchy-selection-checkbox/);
    assert.match(pageSource, /checked=\{selectionState\}/);
    assert.match(pageSource, /checked=\{selected\}/);
    assert.match(pageSource, /checked === true/);
    assert.match(pageSource, /고객 케이스 전체 선택/);
    assert.match(pageSource, /구함 의뢰 \$\{ordinal\} 전체 선택/);
    assert.doesNotMatch(pageSource, /내놓음 의뢰 \$\{ordinal\} 전체 선택/);
    assert.doesNotMatch(pageSource, /customers-next-case-date/);
    assert.doesNotMatch(
      pageSource,
      /등록 \{formatDateShortYear\(brokerageCase\.createdAt\)\}/,
    );
    assert.doesNotMatch(styles, /\.customers-next-branch-selection/);
  });

  it("starts demand intakes expanded and collapses each one independently", () => {
    const initiallyExpanded = new Set<string>();
    const afterFirstCollapse = toggleCustomerIntakeCollapsed(
      initiallyExpanded,
      "buyer-intake-1",
    );
    const afterSecondCollapse = toggleCustomerIntakeCollapsed(
      afterFirstCollapse,
      "buyer-intake-2",
    );
    const afterFirstReopen = toggleCustomerIntakeCollapsed(
      afterSecondCollapse,
      "buyer-intake-1",
    );

    assert.deepEqual([...initiallyExpanded], []);
    assert.deepEqual([...afterFirstCollapse], ["buyer-intake-1"]);
    assert.deepEqual(
      [...afterSecondCollapse],
      ["buyer-intake-1", "buyer-intake-2"],
    );
    assert.deepEqual([...afterFirstReopen], ["buyer-intake-2"]);
    assert.match(
      pageSource,
      /const \[collapsedDemandIntakeIds, setCollapsedDemandIntakeIds\]/,
    );
    assert.match(pageSource, /aria-expanded=\{expanded\}/);
    assert.match(pageSource, /aria-controls=\{panelId\}/);
    assert.match(
      pageSource,
      /id=\{panelId\}[\s\S]*?data-customer-intake-children/,
    );
  });

  it("keeps search, filters, sorting and cursor loading on the server", () => {
    assert.match(pageSource, /useInfiniteQuery/);
    assert.match(
      pageSource,
      /queryKey: \["brokerage-cases", "ledger", "customers", filters\]/,
    );
    assert.match(
      pageSource,
      /\.\.\.customerLedgerFiltersToApiParams\(activeFilters\)/,
    );
    assert.match(pageSource, /search: deferredSearch\.trim\(\) \|\| undefined/);
    assert.match(pageSource, /sortBy,[\s\S]*?sortOrder,/);
    assert.match(pageSource, /cursor: pageParam \?\? undefined/);
    assert.match(pageSource, /new IntersectionObserver/);
    assert.match(pageSource, /root: scrollRegion/);
    assert.match(pageSource, /rootMargin: "0px 0px 240px 0px"/);
  });

  it("mirrors the production customer-ledger filter hierarchy", () => {
    assert.match(
      pageSource,
      /type CustomerLedgerMode = Exclude<BrokerageCaseLedgerMode, "both">/,
    );
    assert.doesNotMatch(pageSource, /\{ value: "both", label: "양쪽" \}/);
    assert.match(pageSource, /<ViewBar/);
    assert.match(pageSource, /variant="workbench"/);
    assert.match(pageSource, /showSearch=\{false\}/);
    assert.match(pageSource, /showActiveChips=\{false\}/);
    assert.match(
      pageSource,
      /\["preferredRegions", "preferredSites", "transactionType"\],[\s\S]*?\["status", "urgency"\],[\s\S]*?\["price", "area"\]/,
    );
    assert.match(pageSource, /\.\.\.customerLedgerFilterDefinitions/);
    assert.match(pageSource, /id: "assignedToId"/);
    assert.match(pageSource, /id: "preferredSites"/);
    assert.match(pageSource, /id: "preferredRegions"/);
    assert.match(
      pageSource,
      /sortDefinitions=\{customerLedgerSortDefinitions\}/,
    );
    assert.doesNotMatch(pageSource, /SORT_OPTIONS|selectedSort|sortId/);
  });

  it("virtualizes measured customer cards without changing cursor pagination", () => {
    assert.match(pageSource, /import \{ useVirtualizer \}/);
    assert.match(pageSource, /const customerCaseVirtualizer = useVirtualizer/);
    assert.match(pageSource, /count: cases\.length/);
    assert.match(
      pageSource,
      /getScrollElement: \(\) => listScrollRef\.current/,
    );
    assert.match(pageSource, /estimateSize: estimateCustomerCaseHeight/);
    assert.match(pageSource, /getItemKey: getCustomerCaseKey/);
    assert.match(pageSource, /gap: CUSTOMER_CASE_GAP/);
    assert.match(pageSource, /overscan: CUSTOMER_CASE_OVERSCAN/);
    assert.match(pageSource, /data-customer-case-virtual-list/);
    assert.match(pageSource, /data-customer-case-virtual-row/);
    assert.match(pageSource, /data-index=\{virtualCase\.index\}/);
    assert.match(pageSource, /ref=\{customerCaseVirtualizer\.measureElement\}/);
    assert.match(
      pageSource,
      /const measureRenderedCustomerCases = useCallback\([\s\S]*?customerCaseVirtualizer\.measureElement\(row\)/,
    );
    assert.match(pageSource, /useLayoutEffect\(\(\) => \{/);
    assert.match(
      pageSource,
      /window\.setTimeout\(measureRenderedCustomerCases, 0\)/,
    );
    assert.match(
      pageSource,
      /window\.addEventListener\("resize", handleWindowResize\)/,
    );
    assert.match(pageSource, /const observer = new MutationObserver/);
    assert.match(pageSource, /characterData: true/);
    assert.match(
      pageSource,
      /transform: `translateY\(\$\{virtualCase\.start\}px\)`/,
    );
    assert.match(pageSource, /memo\(function CustomerCaseGroup/);
    assert.doesNotMatch(pageSource, /\{cases\.map\(/);
  });

  it("offers the shared case action menu from every customer header", () => {
    assert.match(
      pageSource,
      /<CustomerCaseActionMenu[\s\S]*?brokerageCase=\{brokerageCase\}[\s\S]*?customerName=\{customerName\}/,
    );
    assert.match(
      customerCaseActionMenuSource,
      /aria-label=\{`\$\{customerName\} 케이스 작업 메뉴`\}/,
    );
    assert.match(customerCaseActionMenuSource, /<DropdownMenuContent/);
    assert.match(customerCaseActionMenuSource, />고객 정보 열기</);
  });

  it("loads counterpart matches only after an intent is opened", () => {
    assert.match(pageSource, /const \[expandedMatchKey, setExpandedMatchKey\]/);
    assert.match(
      pageSource,
      /matchExpanded && \([\s\S]*?data-customer-demand-match-panel[\s\S]*?<LedgerMatchPanel[\s\S]*?kind: "demand",[\s\S]*?requirementId: intent\.requirementId/,
    );
    assert.match(
      pageSource,
      /matchExpanded && \([\s\S]*?data-customer-listing-match-panel[\s\S]*?<LedgerMatchPanel[\s\S]*?kind: "listing",[\s\S]*?intakeId: group\.intakeId,[\s\S]*?listingIds/,
    );
    assert.match(
      pageSource,
      /const matchKey = `listing:\$\{group\.intakeId\}`/,
    );
    assert.match(
      pageSource,
      /caseIds\.set\(`listing:\$\{intent\.listingIntakeId\}`, brokerageCase\.id\)/,
    );
    assert.doesNotMatch(
      pageSource,
      /caseIds\.set\(`listing:\$\{intent\.listingId\}`/,
    );
    assert.match(pageSource, /aria-label=\{`\$\{conditionLabel\} 연결 매물/);
    assert.match(
      pageSource,
      /aria-label=\{`\$\{first\.contextLabel\} 내놓음 의뢰 연결 구매고객/,
    );
    assert.doesNotMatch(pageSource, /activeListingMatchPanel/);
    assert.doesNotMatch(pageSource, /data-customer-case-match-panel/);
  });

  it("locks match creation to the opened demand or listing intake", () => {
    assert.match(ledgerMatchPanelSource, /scope=\{source\}/);
    assert.match(matchCreateDialogSource, /export type MatchCreateDialogScope/);
    assert.match(
      matchCreateDialogSource,
      /enabled: open && scope\?\.kind !== "listing"/,
    );
    assert.match(
      matchCreateDialogSource,
      /enabled: open && scope\?\.kind !== "demand"/,
    );
    assert.match(matchCreateDialogSource, /api\.buyerRequirements\.findOne/);
    assert.match(matchCreateDialogSource, /api\.listings\.findOne/);
  });

  it("groups listing options by intake without changing server order", () => {
    const lines = [
      listingIntent("intake-a", "listing-sale", "고덕 101동 101호", 2),
      listingIntent("intake-a", "listing-jeonse", "고덕 101동 101호", 1),
      listingIntent("intake-b", "listing-monthly", "고덕 102동 202호", 3),
    ];

    const groups = groupCustomerListingIntents(lines);
    assert.deepEqual(
      groups.map((group) => ({
        id: group.intakeId,
        listingIds: group.lines.map((line) => line.listingId),
      })),
      [
        {
          id: "intake-a",
          listingIds: ["listing-sale", "listing-jeonse"],
        },
        { id: "intake-b", listingIds: ["listing-monthly"] },
      ],
    );
  });

  it("groups buyer requirements by intake without changing server order", () => {
    const lines = [
      demandIntent("requirement-a1", "강동구", 2, "buyer-intake-a"),
      demandIntent("requirement-a2", "송파구", 1, "buyer-intake-a"),
      demandIntent("requirement-b1", "성동구", 3, "buyer-intake-b"),
    ];

    const groups = groupCustomerDemandIntents(lines);
    assert.deepEqual(
      groups.map((group) => ({
        id: group.intakeId,
        requirementIds: group.lines.map((line) => line.requirementId),
      })),
      [
        {
          id: "buyer-intake-a",
          requirementIds: ["requirement-a1", "requirement-a2"],
        },
        { id: "buyer-intake-b", requirementIds: ["requirement-b1"] },
      ],
    );
  });

  it("stacks conditions inside one demand intake and separates intake groups", () => {
    const demandGroupSource = pageSource.slice(
      pageSource.indexOf("function DemandIntakeGroup"),
      pageSource.indexOf("function DemandIntentRow"),
    );
    const demandRowSource = pageSource.slice(
      pageSource.indexOf("function DemandIntentRow"),
      pageSource.indexOf("function ListingIntakeGroup"),
    );

    assert.match(
      pageSource,
      /aria-label=\{`\$\{customerName\} 의뢰 목록`\}[\s\S]*?className="space-y-2"/,
    );
    assert.match(
      demandGroupSource,
      /aria-label=\{`\$\{customerName\} 구함 의뢰 \$\{ordinal\} 조건 목록`\}[\s\S]*?className="py-2\.5"/,
    );
    assert.match(demandGroupSource, /isFirst=\{index === 0\}/);
    assert.match(
      demandRowSource,
      /<CustomerIntentBranchConnector isLast=\{isLast\} compact/,
    );
    assert.match(demandRowSource, /!isFirst && "border-t-0"/);
    assert.doesNotMatch(
      demandRowSource,
      /customers-next-intent-branch-row min-w-0 py-2\.5 pr-3/,
    );
  });

  it("places an intake lifecycle action menu beside the lifecycle badge", () => {
    const demandGroupSource = pageSource.slice(
      pageSource.indexOf("function DemandIntakeGroup"),
      pageSource.indexOf("function DemandIntentRow"),
    );

    assert.match(
      demandGroupSource,
      /<StatusBadge[\s\S]*?kind="intakeLifecycle"[\s\S]*?<CustomerDemandIntakeActionMenu/,
    );
    assert.match(
      demandGroupSource,
      /intakeId=\{group\.intakeId\}[\s\S]*?lifecycleStatus=\{\s*first\.lifecycleStatus as BuyerIntakeLifecycleStatus\s*\}/,
    );
    assert.match(
      customerDemandIntakeActionMenuSource,
      /api\.buyerIntakes\.update\(intakeId, \{ lifecycleStatus: nextStatus \}\)/,
    );
    assert.match(
      customerDemandIntakeActionMenuSource,
      /value: "open"[\s\S]*?value: "hold"[\s\S]*?value: "closed"/,
    );
    assert.match(
      customerDemandIntakeActionMenuSource,
      /queryKey: \["brokerage-cases", "ledger"\]/,
    );
    assert.match(
      customerDemandIntakeActionMenuSource,
      /aria-label=\{`\$\{customerName\} 구함 의뢰 \$\{ordinal\} 작업 메뉴`\}/,
    );
    assert.match(customerDemandIntakeActionMenuSource, /after:-inset-1/);
  });

  it("keeps demand terms primary and separates preferred regions from site badges", () => {
    const demandRowSource = pageSource.slice(
      pageSource.indexOf("function DemandIntentRow"),
      pageSource.indexOf("function ListingIntakeGroup"),
    );

    assert.ok(
      demandRowSource.indexOf("data-customer-demand-primary") <
        demandRowSource.indexOf("data-customer-demand-location"),
    );
    assert.match(
      demandRowSource,
      /data-customer-demand-primary[\s\S]*?kind="transactionType"[\s\S]*?terms\.map/,
    );
    assert.match(demandRowSource, /data-customer-demand-cells/);
    assert.match(
      demandRowSource,
      /data-customer-demand-cells[\s\S]*?overflow-hidden rounded-none border/,
    );
    assert.match(demandRowSource, /grid-rows-\[auto_auto\]/);
    assert.match(
      demandRowSource,
      /data-customer-demand-secondary[\s\S]*?border-t[\s\S]*?bg-muted\/30/,
    );
    assert.match(
      demandRowSource,
      /data-customer-demand-location-row[\s\S]*?data-customer-demand-location[\s\S]*?data-customer-demand-request[\s\S]*?border-t/,
    );
    assert.match(demandRowSource, /<span\s+data-customer-demand-location-row/);
    const locationRowSource = demandRowSource.slice(
      demandRowSource.indexOf("data-customer-demand-location-row"),
      demandRowSource.indexOf("data-customer-demand-request"),
    );
    assert.doesNotMatch(
      locationRowSource,
      /to="\/buyer-requirements\/\$id"|hover:bg-muted|focus-visible:ring/,
    );
    assert.match(
      demandRowSource,
      /customers-next-intent-match-toggle[\s\S]*?row-start-1[\s\S]*?border-l/,
    );
    assert.match(
      demandRowSource,
      /<HierarchySelectionCheckbox[\s\S]*?aria-label=\{`\$\{conditionLabel\} 구함 조건 선택`\}/,
    );
    assert.match(
      demandRowSource,
      /grid-cols-\[auto_minmax\(0,1fr\)_auto_2\.5rem\]/,
    );
    assert.match(
      demandRowSource,
      /data-customer-demand-primary[\s\S]*?col-start-2/,
    );
    assert.match(
      demandRowSource,
      /kind="transactionType"[\s\S]*?max-w-full rounded-\[4px\] py-0\.5 text-\[12px\] leading-5/,
    );
    assert.doesNotMatch(demandRowSource, /data-customer-intent-marker/);
    assert.doesNotMatch(demandRowSource, /\{intent\.priorityRank\}순위/);
    assert.match(
      demandRowSource,
      /data-customer-demand-location[\s\S]*?희망지역[\s\S]*?regionLabel/,
    );
    assert.match(
      demandRowSource,
      /data-customer-demand-sites[\s\S]*?희망단지[\s\S]*?intent\.preferredSites\.map[\s\S]*?<Badge/,
    );
    assert.match(
      demandRowSource,
      /intent\.preferredSites\.length > 0[\s\S]*?text-muted-foreground\/70[\s\S]*?미정/,
    );
    assert.match(demandRowSource, /data-customer-demand-site=\{site\.id\}/);
    assert.match(demandRowSource, /variant="secondary"/);
    assert.doesNotMatch(
      demandRowSource,
      /const locationLabel = intent\.contextLabel/,
    );
    assert.match(
      demandRowSource,
      /data-customer-demand-request[\s\S]*?<EditableIntentMemo[\s\S]*?target=\{\{ kind: "demand", id: intent\.requirementId \}\}[\s\S]*?value=\{memo\}/,
    );
    assert.match(demandRowSource, /label="요청"/);
    assert.match(demandRowSource, /showLabel=\{false\}/);
    assert.ok(
      demandRowSource.indexOf("</Link>") <
        demandRowSource.indexOf("data-customer-demand-secondary"),
    );
    assert.match(demandRowSource, /text-\[13px\]/);
    assert.match(demandRowSource, /text-\[11\.5px\]/);
    assert.match(
      pageSource,
      /return `\$\{formatMoney\(minimum\)\}–\$\{formatMoney\(maximum\)\}`/,
    );
    assert.match(demandRowSource, /bg-neutral-soft/);
    assert.doesNotMatch(demandRowSource, /<MapPin/);
    assert.doesNotMatch(demandRowSource, /<StickyNote/);
  });

  it("keeps edit and guarded delete actions at the demand row's right edge", () => {
    const demandRowSource = pageSource.slice(
      pageSource.indexOf("function DemandIntentRow"),
      pageSource.indexOf("function ListingIntakeGroup"),
    );

    assert.match(demandRowSource, /data-customer-demand-actions/);
    assert.match(
      demandRowSource,
      /data-customer-demand-actions[\s\S]*?col-start-4[\s\S]*?<CustomerDemandIntentActionMenu/,
    );
    assert.match(
      demandRowSource,
      /data-customer-demand-secondary[\s\S]*?col-span-4/,
    );
    assert.match(
      customerDemandIntentActionMenuSource,
      /to="\/buyer-requirements\/\$id\/edit"/,
    );
    assert.match(customerDemandIntentActionMenuSource, />\s*조건 수정\s*</);
    assert.match(customerDemandIntentActionMenuSource, /"조건 삭제"/);
    assert.match(
      customerDemandIntentActionMenuSource,
      /api\.buyerRequirements\.findOne\(requirementId\)/,
    );
    assert.match(
      customerDemandIntentActionMenuSource,
      /title=\{hasLinks \? "삭제 대신 보류 처리" : "구함 조건 삭제"\}/,
    );
    assert.match(
      customerDemandIntentActionMenuSource,
      /queryKey: \["brokerage-cases", "ledger"\]/,
    );
  });

  it("keeps an opened demand match panel attached to its condition", () => {
    const demandRowSource = pageSource.slice(
      pageSource.indexOf("function DemandIntentRow"),
      pageSource.indexOf("function ListingIntakeGroup"),
    );

    assert.ok(
      demandRowSource.indexOf("data-customer-demand-row") <
        demandRowSource.indexOf("data-customer-demand-match-panel"),
    );
    assert.match(
      demandRowSource,
      /data-customer-demand-match-panel[\s\S]*?label=\{`\$\{conditionLabel\} 조건의 매칭`\}/,
    );
    assert.match(styles, /\.customers-next-demand-match-panel/);
    assert.match(
      styles,
      /\.customers-next-demand-intake-children\.customers-next-intent-branch-list\s*\{[\s\S]*?--customers-next-branch-width: 2rem;[\s\S]*?--customers-next-branch-row-padding: 2\.5rem;[\s\S]*?margin-left: 2\.625rem;[\s\S]*?margin-top: -0\.75rem/,
    );
    assert.match(styles, /margin-inline-start: -2\.625rem/);
  });

  it("edits demand and listing intake memos with the property ledger editor", () => {
    const editorSource = pageSource.slice(
      pageSource.indexOf("function EditableIntentMemo"),
      pageSource.indexOf("function CustomersNextLedgerHeader"),
    );
    const listingSource = pageSource.slice(
      pageSource.indexOf("function ListingIntakeGroup"),
      pageSource.indexOf("function ListingOptionRow"),
    );

    assert.match(pageSource, /<CellEditProvider>/);
    assert.match(editorSource, /<EditableCell/);
    assert.match(editorSource, /activation="doubleClick"/);
    assert.match(editorSource, /editorChrome="floating"/);
    assert.match(editorSource, /hoverHighlight=\{false\}/);
    assert.doesNotMatch(editorSource, /data-customer-inline-memo-trigger/);
    assert.doesNotMatch(editorSource, /data-customer-inline-memo-editor/);
    assert.match(editorSource, /api\.listingIntakes\.update\(target\.id/);
    assert.match(editorSource, /expectedUpdatedAt: target\.expectedUpdatedAt/);
    assert.match(editorSource, /api\.buyerRequirements\.update\(target\.id/);
    assert.match(editorSource, /mutation\.mutate\(next\)/);
    assert.match(cellEditorSource, /ariaLabel=\{ariaLabel\}/);
    assert.match(
      cellEditorSource,
      /aria-label=\{ariaLabel \?\? `\$\{field\} 편집`\}/,
    );
    assert.match(cellEditorSource, /e\.key === ["']Enter["']/);
    assert.match(cellEditorSource, /e\.key === ["']Escape["']/);
    assert.match(
      listingSource,
      /<EditableIntentMemo[\s\S]*?kind: "listing"[\s\S]*?id: group\.intakeId[\s\S]*?expectedUpdatedAt: first\.intakeUpdatedAt/,
    );
  });

  it("keeps listing options scannable with one match entry per intake", () => {
    const listingSource = pageSource.slice(
      pageSource.indexOf("function ListingIntakeGroup"),
      pageSource.indexOf("function CustomerIntentBranchConnector"),
    );
    const listingOptionSource = pageSource.slice(
      pageSource.indexOf("function ListingOptionRow"),
      pageSource.indexOf("function CustomerIntentBranchConnector"),
    );

    assert.ok(
      listingSource.indexOf("data-customer-listing-property") <
        listingSource.indexOf("내놓음 의뢰 {ordinal}"),
    );
    assert.doesNotMatch(listingSource, /거래안 \{group\.lines\.length\}/);
    assert.match(listingSource, /data-customer-listing-intake-memo/);
    assert.match(
      listingSource,
      /<EditableIntentMemo[\s\S]*?kind: "listing"[\s\S]*?showLabel=\{false\}/,
    );
    assert.doesNotMatch(listingOptionSource, /data-customer-intent-marker/);
    assert.doesNotMatch(listingOptionSource, /\{ordinal\}안/);
    assert.match(
      listingSource,
      /data-customer-listing-primary[\s\S]*?kind="transactionType"[\s\S]*?terms\.map/,
    );
    assert.match(listingSource, /data-customer-listing-term=\{term\.label\}/);
    assert.doesNotMatch(listingOptionSource, /data-customer-listing-memo/);
    assert.doesNotMatch(listingOptionSource, /메모 \$\{memo\}/);
    assert.match(
      listingSource,
      /const matchCount = group\.lines\.reduce\([\s\S]*?line\.matchCount/,
    );
    assert.match(
      listingSource,
      /const listingIds = group\.lines\.map\(\(line\) => line\.listingId\)/,
    );
    assert.ok(
      listingSource.indexOf("data-customer-listing-property") <
        listingSource.indexOf("customers-next-intent-match-toggle"),
    );
    assert.ok(
      listingSource.indexOf("customers-next-intent-match-toggle") <
        listingSource.indexOf("data-customer-listing-row"),
    );
    assert.ok(
      listingSource.indexOf("group.lines.map") <
        listingSource.indexOf("data-customer-listing-match-panel"),
    );
    assert.match(
      listingSource,
      /data-customer-listing-match-panel[\s\S]*?intakeId: group\.intakeId,[\s\S]*?listingIds/,
    );
    assert.doesNotMatch(
      listingOptionSource,
      /customers-next-intent-match-toggle/,
    );
    assert.doesNotMatch(listingOptionSource, /<LedgerMatchPanel/);
    assert.doesNotMatch(listingOptionSource, /line\.matchCount/);
    assert.doesNotMatch(listingSource, /<StickyNote/);
  });

  it("keeps transaction details limited to move-in metadata", () => {
    const propertySummarySource = pageSource.slice(
      pageSource.indexOf("function ListingIntakeGroup"),
      pageSource.indexOf("function ListingOptionRow"),
    );
    const listingOptionSource = pageSource.slice(
      pageSource.indexOf("function ListingOptionRow"),
      pageSource.indexOf("function CustomerIntentBranchConnector"),
    );
    const listingDetailSource = pageSource.slice(
      pageSource.indexOf("function getListingDetailTerms"),
      pageSource.indexOf("function formatListingConditionLabel"),
    );

    assert.doesNotMatch(
      propertySummarySource,
      /maintenanceFee|loanAmount|premium/,
    );
    assert.match(listingOptionSource, /getListingDetailTerms\(line\)/);
    assert.match(listingOptionSource, /data-customer-listing-details/);
    assert.match(listingOptionSource, /data-customer-listing-cells/);
    assert.match(
      listingOptionSource,
      /grid-cols-\[auto_minmax\(0,1fr\)\][\s\S]*?overflow-hidden rounded-md border border-border\/90 bg-background/,
    );
    assert.match(
      listingOptionSource,
      /data-customer-listing-details[\s\S]*?border-t border-border\/90 bg-muted\/30/,
    );
    assert.match(
      listingOptionSource,
      /data-customer-listing-detail=\{detail\.label\}/,
    );
    assert.match(listingDetailSource, /formatListingMoveIn\(intent\)/);
    assert.match(listingDetailSource, /label: "입주"/);
    assert.doesNotMatch(listingDetailSource, /intent\.listingUpdatedAt/);
    assert.doesNotMatch(listingDetailSource, /label: "수정"/);
    assert.doesNotMatch(
      listingDetailSource,
      /maintenanceFee|loanAmount|premium|관리비|융자|권리금/,
    );
  });

  it("does not repeat an intake memo on every listing option", () => {
    const fallbackMemo = {
      ...listingIntent("intake-a", "listing-a", "고덕 101동", 0),
      intakeMemo: "가격 협의 가능",
      memo: "가격 협의 가능",
    } as BrokerageCaseListingIntent;
    const listingMemo = {
      ...fallbackMemo,
      memo: "전세 옵션만 입주일 협의",
    } as BrokerageCaseListingIntent;

    assert.equal(getCustomerListingOptionMemo(fallbackMemo), null);
    assert.equal(
      getCustomerListingOptionMemo(listingMemo),
      "전세 옵션만 입주일 협의",
    );
  });

  it("summarizes each brokerage case without merging contacts across pages", () => {
    const brokerageCase = {
      id: "case-1",
      title: null,
      demandIntents: [
        demandIntent("requirement-1", "강동구·고덕동", 2),
        demandIntent("requirement-2", "송파구", 1),
      ],
      listingIntents: [
        listingIntent("intake-a", "listing-sale", "고덕 101동 101호", 1),
        listingIntent("intake-a", "listing-jeonse", "고덕 101동 101호", 2),
      ],
    } as BrokerageCase;

    assert.deepEqual(summarizeCustomerCase(brokerageCase), {
      demandCount: 1,
      listingCount: 1,
      demandMatchCount: 3,
      listingMatchCount: 3,
    });
  });

  it("shows a concise latest-consultation summary without hiding the empty state", () => {
    assert.match(pageSource, /brokerageCase\.latestConsultation/);
    assert.match(
      pageSource,
      /to="\/consultations"[\s\S]*?consultationId: latestConsultation\.id/,
    );
    assert.match(pageSource, /data-customer-consultation-summary/);
    assert.match(pageSource, /기록 없음/);
    assert.doesNotMatch(pageSource, /customers-next-consultation-meta/);
    assert.doesNotMatch(
      pageSource,
      /dateTime=\{latestConsultation\.createdAt\}/,
    );
    assert.doesNotMatch(
      pageSource,
      /펼치면 구함 조건과 내놓은 매물을 함께 볼 수 있습니다/,
    );
  });

  it("reserves a stable readable width for customer names", () => {
    assert.match(
      pageSource,
      /to="\/contacts\/\$id"[\s\S]*?className="w-24 shrink-0 truncate text-\[13px\] font-semibold/,
    );
    assert.match(
      pageSource,
      /<span className="w-24 shrink-0 truncate text-\[13px\] font-semibold">[\s\S]*?\{customerName\}/,
    );
    assert.match(
      pageSource,
      /data-customer-contact-summary[\s\S]*?<dt[^>]*>[\s\S]*?연락처[\s\S]*?<dd[\s\S]*?text-\[12\.5px\] font-semibold text-foreground tabular-nums/,
    );
    assert.doesNotMatch(
      pageSource.slice(
        pageSource.indexOf("customers-next-case-identity"),
        pageSource.indexOf("customers-next-case-overview"),
      ),
      />\s*·\s*</,
    );
  });

  it("keeps buyer and listing intakes in one reading flow at every width", () => {
    const demandIntakeSource = pageSource.slice(
      pageSource.indexOf("function DemandIntakeGroup"),
      pageSource.indexOf("function DemandIntentRow"),
    );
    const listingIntakeSource = pageSource.slice(
      pageSource.indexOf("function ListingIntakeGroup"),
      pageSource.indexOf("function ListingOptionRow"),
    );

    assert.match(styles, /container-type: inline-size/);
    assert.match(
      pageSource,
      /data-customer-intent-list[\s\S]*?demandGroups\.map[\s\S]*?listingGroups\.map/,
    );
    assert.doesNotMatch(pageSource, /customers-next-detail-grid/);
    assert.doesNotMatch(styles, /customers-next-detail-grid/);
    assert.match(pageSource, /구함 의뢰 \{ordinal\}/);
    assert.match(pageSource, /내놓음 의뢰 \{ordinal\}/);
    assert.doesNotMatch(demandIntakeSource, /<UserRound/);
    assert.doesNotMatch(demandIntakeSource, /text-info-strong|bg-info-soft/);
    assert.match(demandIntakeSource, /bg-neutral-soft/);
    assert.match(demandIntakeSource, /<Search className="size-3\.5"/);
    assert.match(demandIntakeSource, /text-muted-foreground/);
    assert.match(
      demandIntakeSource,
      /data-customer-intake-summary[\s\S]*?items-center gap-2[\s\S]*?data-customer-intake-marker[\s\S]*?-ml-2\.5[\s\S]*?rounded-full[\s\S]*?border-border[\s\S]*?bg-neutral-soft/,
    );
    assert.match(
      listingIntakeSource,
      /customers-next-listing-intake-child-stem[\s\S]*?data-customer-intake-marker[\s\S]*?-ml-2\.5[\s\S]*?rounded-full[\s\S]*?bg-success-soft/,
    );
    assert.match(
      listingIntakeSource,
      /customers-next-listing-intake-children customers-next-intake-children/,
    );
    assert.doesNotMatch(demandIntakeSource, /-ml-2\.5 mr-2\.5/);
    assert.equal(
      pageSource.match(
        /group\.lines\[0\]\?\.intakePriorityRank \?\? index \+ 1/g,
      )?.length,
      2,
    );
    assert.match(pageSource, /group\.lines\.map\(\(intent, index\) =>/);
    assert.match(pageSource, /group\.lines\.map\(\(line, index\) =>/);
    assert.match(pageSource, /aria-expanded=\{matchExpanded\}/);
    assert.match(
      pageSource,
      /aria-controls=\{matchExpanded \? panelId : undefined\}/,
    );
    assert.ok(
      pageSource.indexOf("data-customer-intent-list") <
        pageSource.indexOf("data-customer-demand-match-panel"),
    );
    assert.ok(
      pageSource.indexOf("data-customer-intent-list") <
        pageSource.indexOf("data-customer-listing-match-panel"),
    );
  });

  it("draws terminal-aware intake branches and nested entity branches", () => {
    assert.match(pageSource, /data-customer-intent-branch-list/);
    assert.match(pageSource, /data-customer-intent-branch-trunk/);
    assert.match(pageSource, /data-customer-intent-branch/);
    assert.match(pageSource, /data-customer-intent-branch-connector/);
    assert.match(pageSource, /data-customer-intent-branch-end/);
    assert.match(pageSource, /data-customer-intake-branch/);
    assert.match(pageSource, /data-customer-buyer-intake/);
    assert.match(pageSource, /data-customer-listing-intake/);
    assert.match(pageSource, /data-customer-demand-requirement/);
    assert.match(pageSource, /data-customer-listing-option/);
    assert.match(pageSource, /data-customer-intake-child-stem/);
    assert.match(pageSource, /data-customer-intake-child-trunk/);
    assert.match(pageSource, /data-customer-intake-children/);
    assert.match(pageSource, /M0 0C0 15 12 26 28 26/);
    assert.match(pageSource, /M0 0C0 9 12 16 28 16/);
    assert.match(pageSource, /role="list"/);
    assert.match(pageSource, /role="listitem"/);
    assert.doesNotMatch(pageSource, /divide-y divide-border\/70/);
    assert.match(
      pageSource,
      /data-customer-intent-branch-connector[\s\S]*?aria-hidden="true"[\s\S]*?pointer-events-none/,
    );
    assert.match(
      pageSource,
      /<CustomerIntentBranchConnector isLast=\{isLast\}/,
    );
    assert.match(
      pageSource,
      /index === demandGroups\.length - 1 &&\s+listingGroups\.length === 0/,
    );
    assert.match(pageSource, /isLast=\{index === listingGroups\.length - 1\}/);
    assert.match(pageSource, /isLast=\{index === group\.lines\.length - 1\}/);
    assert.match(styles, /--customers-next-branch-row-padding: 3\.5rem/);
    assert.match(styles, /--customers-next-branch-row-padding: 3rem/);
    assert.match(styles, /\.customers-next-intake-child-stem/);
    assert.match(
      styles,
      /\.customers-next-intent-branch-trunk,[\s\S]*?\.customers-next-intake-child-stem\s*\{[\s\S]*?width: 1\.5px;[\s\S]*?transform: translateX\(-0\.25px\)/,
    );
    assert.match(
      styles,
      /\.customers-next-demand-intake-child-stem,[\s\S]*?\.customers-next-listing-intake-child-stem\s*\{[\s\S]*?left: calc\(var\(--customers-next-branch-row-padding\) \+ 0\.125rem\);[\s\S]*?transform: translateX\(-0\.75px\)/,
    );
    assert.match(
      styles,
      /\.customers-next-listing-intake-children\.customers-next-intent-branch-list\s*\{[\s\S]*?--customers-next-branch-width: 2rem;[\s\S]*?--customers-next-branch-row-padding: 2\.5rem;[\s\S]*?margin-left: 2\.625rem/,
    );
    assert.match(
      styles,
      /\.customers-next-demand-intake-children \.customers-next-intent-branch-trunk,[\s\S]*?\.customers-next-demand-intake-children \.customers-next-intent-branch-end,[\s\S]*?\.customers-next-listing-intake-children \.customers-next-intent-branch-trunk,[\s\S]*?\.customers-next-listing-intake-children \.customers-next-intent-branch-end\s*\{[\s\S]*?transform: translateX\(-0\.75px\)/,
    );
    assert.match(
      styles,
      /\.customers-next-intent-branch-end\s*\{[\s\S]*?transform: translateX\(-0\.25px\)/,
    );
    assert.match(
      styles,
      /\.customers-next-intake-children\.customers-next-intent-branch-list/,
    );
    assert.match(styles, /--customers-next-branch-row-padding: 2\.25rem/);
    assert.match(styles, /--customers-next-branch-row-padding: 2rem/);
    assert.doesNotMatch(styles, /--customers-next-selection-left/);
    assert.match(
      styles,
      /@container \(max-width: 520px\)[\s\S]*?\.customers-next-demand-intake-children\.customers-next-intent-branch-list\s*\{[\s\S]*?--customers-next-branch-width: 1\.75rem;[\s\S]*?--customers-next-branch-row-padding: 2\.25rem;[\s\S]*?margin-left: 2\.125rem/,
    );
    assert.match(
      styles,
      /@container \(max-width: 520px\)[\s\S]*?\.customers-next-listing-intake-children\.customers-next-intent-branch-list\s*\{[\s\S]*?--customers-next-branch-width: 1\.75rem;[\s\S]*?--customers-next-branch-row-padding: 2\.25rem;[\s\S]*?margin-left: 2\.125rem/,
    );
    assert.match(
      styles,
      /@container \(max-width: 520px\)[\s\S]*?\.customers-next-intent-match-label/,
    );
  });

  it("uses a full-width ledger row instead of a customer card surface", () => {
    assert.match(pageSource, /const CUSTOMER_CASE_GAP = 0/);
    assert.match(
      styles,
      /grid-template-columns: minmax\(190px, 0\.7fr\) minmax\(260px, 1\.3fr\) auto/,
    );
    assert.match(
      pageSource,
      /data-customer-case-scroll-region[\s\S]*?className="min-h-0 min-w-0 flex-1 overflow-auto"/,
    );
    assert.match(
      pageSource,
      /data-customer-case-group[\s\S]*?className="group\/customer-case overflow-hidden border-b border-border bg-background"/,
    );
    assert.doesNotMatch(
      pageSource,
      /group\/customer-case overflow-hidden rounded-lg border border-border bg-background shadow-xs/,
    );
    assert.doesNotMatch(
      pageSource,
      /고객별 구함과 내놓음을 펼친 상태로 확인하고/,
    );
    assert.match(pageSource, /data-customers-next-ledger-header/);
    const ledgerHeaderSource = pageSource.slice(
      pageSource.indexOf("function CustomersNextLedgerHeader"),
      pageSource.indexOf("function CustomersNextSortableHeader"),
    );
    assert.doesNotMatch(
      ledgerHeaderSource,
      /label="구분"|label="상태"|label="거래"/,
    );
    assert.match(
      ledgerHeaderSource,
      /label="이름"[\s\S]*?label="연락처"[\s\S]*?label="최소예산"[\s\S]*?label="최대예산"[\s\S]*?label="최소월세"[\s\S]*?label="최대월세"[\s\S]*?label="최소평형"[\s\S]*?label="최대평형"[\s\S]*?label="매칭"[\s\S]*?label="등록일"/,
    );
    assert.match(
      styles,
      /\.customers-next-ledger-header-grid\s*\{[\s\S]*?min-width: 792px;[\s\S]*?height: 36px;/,
    );
    assert.match(
      pageSource,
      /data-customer-intent-list[\s\S]*?className="min-w-0"/,
    );
    assert.doesNotMatch(pageSource, /className="bg-muted\/15 p-3"/);
    assert.doesNotMatch(
      pageSource,
      /min-w-0 overflow-hidden rounded-md border border-border bg-background/,
    );
    assert.doesNotMatch(
      pageSource,
      /mt-3 overflow-hidden rounded-md border border-border bg-background/,
    );
    assert.doesNotMatch(pageSource, /\[&>div\]:border-t-0/);
    assert.match(
      ledgerMatchPanelSource,
      /className="border-t border-border bg-\[#fbfbfa\]/,
    );
    assert.match(
      ledgerMatchPanelSource,
      /id=\{panelId\}[\s\S]*?role="region"[\s\S]*?aria-labelledby=/,
    );
  });
});

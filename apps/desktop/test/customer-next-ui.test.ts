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
  getCustomerListingOptionMemo,
  groupCustomerDemandIntents,
  groupCustomerListingIntents,
  summarizeCustomerCase,
  toggleCustomerCaseCollapsed,
} from "../src/renderer/routes/_authenticated/customers-next/-customers-next-model.ts";

const testDir = dirname(fileURLToPath(import.meta.url));
const routeDir = resolve(
  testDir,
  "../src/renderer/routes/_authenticated/customers-next",
);
const pageSource = readFileSync(resolve(routeDir, "index.tsx"), "utf8");
const styles = readFileSync(resolve(routeDir, "-customers-next.css"), "utf8");
const legacyPageSource = readFileSync(
  resolve(routeDir, "../customers/index.tsx"),
  "utf8",
);
const ledgerMatchPanelSource = readFileSync(
  resolve(routeDir, "../matches/-ledger-match-panel.tsx"),
  "utf8",
);
const matchCreateDialogSource = readFileSync(
  resolve(routeDir, "../matches/-match-create-dialog.tsx"),
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
  it("keeps the production ledger intact behind an independent route", () => {
    assert.match(
      pageSource,
      /createFileRoute\("\/_authenticated\/customers-next\/"\)/,
    );
    assert.match(pageSource, /<Link to="\/customers">표 원장 보기<\/Link>/);
    assert.match(
      legacyPageSource,
      /<Link to="\/customers-next" aria-label="고객 중심 새 보기 열기">/,
    );
    assert.match(pageSource, /data-customers-next-page/);
    assert.doesNotMatch(pageSource, /<table/);
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

  it("keeps search, sorting and cursor loading on the server", () => {
    assert.match(pageSource, /useInfiniteQuery/);
    assert.match(
      pageSource,
      /queryKey: \["brokerage-cases", "ledger", "customers-next", filters\]/,
    );
    assert.match(pageSource, /search: deferredSearch\.trim\(\) \|\| undefined/);
    assert.match(pageSource, /sortBy: selectedSort\.field/);
    assert.match(pageSource, /sortOrder: selectedSort\.order/);
    assert.match(pageSource, /cursor: pageParam \?\? undefined/);
    assert.match(pageSource, /new IntersectionObserver/);
    assert.match(pageSource, /root: scrollRegion/);
    assert.match(pageSource, /rootMargin: "0px 0px 240px 0px"/);
    assert.match(pageSource, /최근 등록순/);
    assert.match(pageSource, /고객명 가나다순/);
    assert.match(pageSource, /매칭 많은순/);
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

  it("loads counterpart matches only after an intent is opened", () => {
    assert.match(pageSource, /const \[expandedMatchKey, setExpandedMatchKey\]/);
    assert.match(
      pageSource,
      /matchExpanded && \([\s\S]*?data-customer-demand-match-panel[\s\S]*?<LedgerMatchPanel[\s\S]*?kind: "demand",[\s\S]*?requirementId: intent\.requirementId/,
    );
    assert.match(
      pageSource,
      /matchExpanded && \([\s\S]*?data-customer-listing-match-panel[\s\S]*?<LedgerMatchPanel[\s\S]*?kind: "listing",[\s\S]*?listingIds: \[line\.listingId\]/,
    );
    assert.match(
      pageSource,
      /const matchKey = `listing:\$\{line\.listingId\}`/,
    );
    assert.match(
      pageSource,
      /caseIds\.set\(`listing:\$\{intent\.listingId\}`, brokerageCase\.id\)/,
    );
    assert.doesNotMatch(
      pageSource,
      /caseIds\.set\(`listing:\$\{intent\.listingIntakeId\}`/,
    );
    assert.match(pageSource, /aria-label=\{`\$\{conditionLabel\} 연결 매물/);
    assert.match(
      pageSource,
      /aria-label=\{`\$\{line\.contextLabel\} \$\{conditionLabel\} 연결 구매고객/,
    );
    assert.doesNotMatch(pageSource, /activeListingMatchPanel/);
    assert.doesNotMatch(pageSource, /data-customer-case-match-panel/);
  });

  it("locks row-scoped match creation to the opened demand or listing", () => {
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

  it("keeps demand terms primary and presents location as a supporting constraint", () => {
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
    assert.match(demandRowSource, /\{intent\.priorityRank\}순위/);
    assert.match(
      demandRowSource,
      /data-customer-demand-location[\s\S]*?희망지역[\s\S]*?locationLabel/,
    );
    assert.match(
      demandRowSource,
      /data-customer-demand-request[\s\S]*?요청[\s\S]*?\{memo\}/,
    );
    assert.match(demandRowSource, /text-\[13px\]/);
    assert.match(demandRowSource, /text-\[11\.5px\]/);
    assert.match(demandRowSource, /bg-neutral-soft/);
    assert.doesNotMatch(demandRowSource, /<MapPin/);
    assert.doesNotMatch(demandRowSource, /<StickyNote/);
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
    assert.match(styles, /margin-inline-start: -3\.25rem/);
  });

  it("makes each listing option independently scannable and matchable", () => {
    const listingSource = pageSource.slice(
      pageSource.indexOf("function ListingIntakeGroup"),
      pageSource.indexOf("function CustomerIntentBranchConnector"),
    );

    assert.ok(
      listingSource.indexOf("data-customer-listing-property") <
        listingSource.indexOf("내놓음 의뢰 {ordinal}"),
    );
    assert.match(listingSource, /거래안 \{group\.lines\.length\}/);
    assert.match(listingSource, /data-customer-listing-intake-memo/);
    assert.match(listingSource, /의뢰 메모/);
    assert.match(listingSource, /\{ordinal\}안/);
    assert.match(
      listingSource,
      /data-customer-listing-primary[\s\S]*?kind="transactionType"[\s\S]*?terms\.map/,
    );
    assert.match(listingSource, /data-customer-listing-term=\{term\.label\}/);
    assert.match(listingSource, /data-customer-listing-memo/);
    assert.match(listingSource, /line\.matchCount/);
    assert.ok(
      listingSource.indexOf("data-customer-listing-row") <
        listingSource.indexOf("data-customer-listing-match-panel"),
    );
    assert.match(
      listingSource,
      /data-customer-listing-match-panel[\s\S]*?listingIds: \[line\.listingId\]/,
    );
    assert.match(styles, /\.customers-next-listing-match-panel/);
    assert.doesNotMatch(listingSource, /<StickyNote/);
  });

  it("keeps transaction details limited to move-in and update metadata", () => {
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
    assert.match(
      listingOptionSource,
      /data-customer-listing-detail=\{detail\.label\}/,
    );
    assert.match(listingDetailSource, /formatListingMoveIn\(intent\)/);
    assert.match(listingDetailSource, /intent\.listingUpdatedAt/);
    assert.match(listingDetailSource, /label: "입주"/);
    assert.match(listingDetailSource, /label: "수정"/);
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

  it("shows a deterministic latest-consultation summary without hiding the empty state", () => {
    assert.match(pageSource, /brokerageCase\.latestConsultation/);
    assert.match(
      pageSource,
      /to="\/consultations"[\s\S]*?consultationId: latestConsultation\.id/,
    );
    assert.match(pageSource, /data-customer-consultation-summary/);
    assert.match(pageSource, /기록 없음/);
    assert.match(pageSource, /dateTime=\{latestConsultation\.createdAt\}/);
    assert.doesNotMatch(
      pageSource,
      /펼치면 구함 조건과 내놓은 매물을 함께 볼 수 있습니다/,
    );
  });

  it("keeps buyer and listing intakes in one reading flow at every width", () => {
    assert.match(styles, /container-type: inline-size/);
    assert.match(
      pageSource,
      /data-customer-intent-list[\s\S]*?demandGroups\.map[\s\S]*?listingGroups\.map/,
    );
    assert.doesNotMatch(pageSource, /customers-next-detail-grid/);
    assert.doesNotMatch(styles, /customers-next-detail-grid/);
    assert.match(pageSource, /구함 의뢰 \{ordinal\}/);
    assert.match(pageSource, /내놓음 의뢰 \{ordinal\}/);
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
    assert.match(pageSource, /d="M0 0C0 15 12 26 28 26"/);
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
      /\.customers-next-intake-children\.customers-next-intent-branch-list/,
    );
    assert.match(styles, /--customers-next-branch-row-padding: 2\.25rem/);
    assert.match(styles, /--customers-next-branch-row-padding: 1\.25rem/);
    assert.match(
      styles,
      /@container \(max-width: 520px\)[\s\S]*?\.customers-next-intent-match-label/,
    );
  });

  it("uses the customer card as the only persistent surface", () => {
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

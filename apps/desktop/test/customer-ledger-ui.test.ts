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
  getNextCustomerLedgerSort,
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
const customerTableRouteDir = resolve(
  testDir,
  "../src/renderer/routes/_authenticated/customers-table",
);
const customerPageSource = readFileSync(
  resolve(customerTableRouteDir, "index.tsx"),
  "utf8",
);
const customerCaseActionMenuSource = readFileSync(
  resolve(customerRouteDir, "-customer-case-action-menu.tsx"),
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
  resolve(customerRouteDir, "../wanted-properties/-ledger-match-panel.tsx"),
  "utf8",
);

function functionSource(name: string) {
  const start = customerPageSource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const end = customerPageSource.indexOf("\nfunction ", start + 1);
  return customerPageSource.slice(start, end < 0 ? undefined : end);
}

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
  it("keeps the legacy table ledger on the customers-table route", () => {
    assert.match(
      customerPageSource,
      /createFileRoute\("\/_authenticated\/customers-table\/"\)/,
    );
    // 보기 전환은 새 탭을 만들지 않고 지금 탭에서 이동한다.
    assert.match(
      customerPageSource,
      /const route = "\/customers";[\s\S]*?navigateActiveTab\(\{ route, kind: meta\.kind, title: meta\.title \}\)/,
    );
    assert.doesNotMatch(customerPageSource, /useNavigate/);
    assert.match(customerPageSource, /label: "고객 중심"/);
  });

  it("opens the table from the sidebar as the default customer ledger view", () => {
    const rendererDir = resolve(testDir, "../src/renderer");
    const navConfig = readFileSync(
      resolve(rendererDir, "components/layout/nav-config.ts"),
      "utf8",
    );
    const navMain = readFileSync(
      resolve(rendererDir, "components/nav-main.tsx"),
      "utf8",
    );
    // 주소별 제목 표는 main과 같이 쓰는 한 곳에 있다.
    const routeMeta = readFileSync(
      resolve(rendererDir, "../common/tabs/routeMeta.ts"),
      "utf8",
    );
    assert.match(
      navConfig,
      /path: "\/customers-table",\s*label: "고객 원장",[\s\S]*?alsoActivePaths: \["\/customers"\]/,
    );
    assert.doesNotMatch(navConfig, /path: "\/customers",/);
    assert.match(navMain, /!!item\.alsoActivePaths\?\.some\(isActivePath\)/);
    assert.match(routeMeta, /'\/customers-table': \{ title: '고객 원장'/);
    assert.match(routeMeta, /'\/customers': \{ title: '고객 중심 보기'/);
  });

  it("sends every other customer ledger link to the default table view", () => {
    const routesDir = resolve(customerRouteDir, "..");
    for (const file of [
      "tasks/-task-shared.tsx",
      "contacts/$id.tsx",
      "contacts/-quick-sheet.tsx",
      "buyer-requirements/$id.tsx",
      "buyer-requirements/new.tsx",
      "buyer-requirements/$id_.edit.tsx",
    ]) {
      const source = readFileSync(resolve(routesDir, file), "utf8");
      assert.match(source, /["']\/customers-table["']/, file);
      assert.doesNotMatch(source, /["']\/customers["']/, file);
    }
  });

  it("sorts and labels the ledger by the case registration date", () => {
    assert.deepEqual(customerLedgerSortDefinitions.at(-1), {
      field: "createdAt",
      label: "등록일",
    });
    assert.match(
      customerPageSource,
      /useState<BrokerageCaseLedgerSortField \| null>\("createdAt"\)/,
    );
    assert.match(customerPageSource, /label="등록일"[\s\S]*?field="createdAt"/);
    assert.match(
      customerPageSource,
      /formatDateShortYear\(brokerageCase\.createdAt\)/,
    );
    assert.doesNotMatch(customerPageSource, /최근 갱신/);
  });

  it("clears a sortable customer-ledger header on its third state", () => {
    const first = getNextCustomerLedgerSort(
      { sortBy: null, sortOrder: "desc" },
      "budgetMin",
    );
    const second = getNextCustomerLedgerSort(first, "budgetMin");
    const third = getNextCustomerLedgerSort(second, "budgetMin");

    assert.deepEqual(first, { sortBy: "budgetMin", sortOrder: "desc" });
    assert.deepEqual(second, { sortBy: "budgetMin", sortOrder: "asc" });
    assert.deepEqual(third, { sortBy: null, sortOrder: "desc" });
    assert.match(customerPageSource, /getNextCustomerLedgerSort/);
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

  it("keeps the listing category pill in the merged stack cell", () => {
    assert.match(
      customerPageSource,
      /<td className="ledger-stack-merged-cell">\s*<KindLabel kind="listing" \/>/,
    );
    assert.match(
      customerLedgerStyles,
      /td\.ledger-stack-merged-cell\s*\{[\s\S]*?vertical-align: middle;/,
    );
    assert.doesNotMatch(customerPageSource, /ledger-stack-merged-left/);
    assert.doesNotMatch(customerLedgerStyles, /ledger-stack-merged-left/);
  });

  it("uses compact squared category pills without decorative dots", () => {
    const kindLabel = functionSource("KindLabel");
    assert.match(
      kindLabel,
      /inline-flex whitespace-nowrap rounded-\[4px\] px-1\.5 py-0\.5 text-\[12px\] font-medium leading-5/,
    );
    assert.doesNotMatch(kindLabel, /size-1\.5 rounded-full/);
  });

  it("left-aligns transaction badges in demand and stacked listing cells", () => {
    const transactionEditors = customerPageSource.match(
      /field="transactionType"[\s\S]*?<span data-ledger-cell-value>\s*<TransactionBadge/g,
    );
    assert.equal(transactionEditors?.length, 2);
    assert.doesNotMatch(functionSource("TransactionBadge"), /justify-center/);
  });

  it("gives phone numbers a pinned column and keeps context links text-only", () => {
    assert.match(
      customerPageSource,
      /className="ledger-sticky-phone ledger-phone-cell ledger-rowspan-top"[\s\S]*?formatPhone\(primary\?\.contact\.phone\)/,
    );
    assert.match(
      customerLedgerStyles,
      /td\.ledger-phone-cell\s*\{[\s\S]*?font-variant-numeric: tabular-nums;/,
    );
    assert.doesNotMatch(functionSource("DemandIntakeCell"), /<MapPin/);
    assert.doesNotMatch(functionSource("StackCells"), /<MapPin/);
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
    assert.match(
      customerCaseActionMenuSource,
      /구함 \{line\.priorityRank\} 상세 열기/,
    );
    assert.doesNotMatch(
      customerCaseActionMenuSource,
      /구함 \{index \+ 1\} 상세 열기/,
    );
  });

  it("selects each brokerage case from the first table column", () => {
    assert.match(customerPageSource, /const columnCount = visibleColumns\.length;/);
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

  it("pins selection, consultation toggle, customer, phone, and case actions in that order", () => {
    assert.match(
      customerLedgerStyles,
      /\.ledger-sticky-select\s*\{[\s\S]*?left: 0;/,
    );
    assert.match(
      customerLedgerStyles,
      /\.ledger-sticky-expand\s*\{[\s\S]*?left: 36px;/,
    );
    assert.match(
      customerLedgerStyles,
      /\.ledger-sticky-customer\s*\{[\s\S]*?left: calc\(36px \+ var\(--ledger-expand-width\)\);/,
    );
    assert.match(
      customerLedgerStyles,
      /\.ledger-sticky-phone\s*\{[\s\S]*?left: calc\(144px \+ var\(--ledger-expand-width\)\);/,
    );
    assert.match(
      customerLedgerStyles,
      /\.ledger-sticky-action\s*\{[\s\S]*?left: calc\(272px \+ var\(--ledger-expand-width\)\);/,
    );
    // 열 설정에서 최근 상담을 끄면 펼침 버튼 열이 빠지고 고정 열이 당겨진다.
    assert.match(
      customerLedgerStyles,
      /\[data-consult-hidden\]\s*\{\s*--ledger-expand-width: 0px;/,
    );
    assert.match(customerPageSource, /const LEDGER_PINNED_WIDTH = 312;/);
    assert.match(customerLedgerStyles, /\.ledger-case-selected > td/);
  });

  it("fixes column widths from one list and gives the remaining space to the memo column", () => {
    assert.match(customerPageSource, /const LEDGER_COLUMNS: ReadonlyArray/);
    for (const [key, width] of [
      ["select", 36],
      ["consult", 28],
      ["customer", 108],
      ["phone", 128],
      ["actions", 40],
      ["transaction", 60],
      ["intake", 220],
      ["budgetMin", 112],
      ["rentMin", 84],
      ["areaMax", 84],
      ["next", 104],
    ]) {
      assert.match(
        customerPageSource,
        new RegExp(`\\{ key: "${key}", width: ${width} \\}`),
      );
    }
    assert.match(
      customerPageSource,
      /const LEDGER_GROW_COLUMN: LedgerColumnKey = "memo";/,
    );
    assert.match(
      customerPageSource,
      /column\.key === LEDGER_GROW_COLUMN\s*\? undefined\s*: \{ width: column\.width \}/,
    );
    assert.match(customerPageSource, /style=\{\{ minWidth: tableMinWidth \}\}/);
    assert.match(
      customerLedgerStyles,
      /\.customer-ledger-table\s*\{[\s\S]*?table-layout: fixed;/,
    );
  });

  it("lets the column menu hide optional groups but never the identifying columns", () => {
    assert.match(customerPageSource, /const OPTIONAL_COLUMN_GROUPS/);
    assert.match(customerPageSource, /<DropdownMenuCheckboxItem/);
    assert.match(
      customerPageSource,
      /id: "area", label: "최소·최대 평형", keys: \["areaMin", "areaMax"\]/,
    );
    for (const key of ["customer", "phone", "intake", "budgetMin", "actions"]) {
      assert.doesNotMatch(
        customerPageSource,
        new RegExp(`keys: \\[[^\\]]*"${key}"`),
      );
    }
  });

  it("matches the property table header visual language", () => {
    assert.match(
      customerLedgerStyles,
      /\.customer-ledger-table thead th\s*\{[\s\S]*?height: 36px;[\s\S]*?border-right: 1px solid #eeeeec;[\s\S]*?border-bottom: 1px solid #d8d6d0;[\s\S]*?background: #f7f7f5;/,
    );
    assert.match(
      customerLedgerStyles,
      /\.customer-ledger-table thead \.ledger-sticky-action\s*\{[\s\S]*?background: #f5f4f1;[\s\S]*?box-shadow: 1px 0 0 0 #d9d9d6;/,
    );
    assert.match(
      customerLedgerStyles,
      /\.customer-ledger-table thead th\s*\{[\s\S]*?text-align: left;/,
    );
    assert.match(
      customerLedgerStyles,
      /\.ledger-sort-button\s*\{[\s\S]*?justify-content: flex-start;/,
    );
    assert.doesNotMatch(
      customerLedgerStyles,
      /thead th:nth-child\([^)]*\)[^{]*\{[^}]*text-align:/,
    );
    assert.match(customerPageSource, /function LedgerHeaderLabel/);
    assert.match(
      customerPageSource,
      /ledger-header-label inline-flex min-w-0 max-w-full items-center gap-1 text-\[12px\] font-normal text-muted-foreground/,
    );
    assert.match(customerPageSource, /icon=\{<UserRound \/>\}/);
    assert.match(customerPageSource, /icon=\{<CircleDot \/>\}/);
    assert.match(customerPageSource, /icon=\{<GitBranch \/>\}/);
    assert.match(customerPageSource, /icon=\{<CalendarClock \/>\}/);
    assert.match(customerPageSource, /icon=\{<UserCheck \/>\}/);
    assert.match(
      customerPageSource,
      /\{active \? <SortIcon className="size-3 shrink-0" aria-hidden \/> : null\}/,
    );
    assert.match(
      customerPageSource,
      /<LedgerHeaderLabel icon=\{active \? undefined : icon\} label=\{label\} \/>/,
    );
  });

  it("collapses the rent columns behind a guide toggle and keeps rent readable", () => {
    assert.match(customerPageSource, /const \[rentColumnsOpen, setRentColumnsOpen\] = useState\(false\)/);
    assert.match(customerPageSource, /<LedgerColumnGuide/);
    assert.match(customerPageSource, /"월세 컬럼 접기" : "월세 컬럼 펼치기"/);
    assert.match(customerPageSource, /aria-expanded=\{open\}/);
    // 좁은 창에서도 버튼이 화면 안에 남아야 한다.
    assert.match(
      customerPageSource,
      /style=\{\{ left: pinnedWidth \+ 4, right: 8 \}\}/,
    );
    // 거래유형을 바꿔도 이전 월세 값이 남으므로, 월세 의뢰에만 붙여 보여 준다.
    assert.match(
      customerPageSource,
      /const showRentInAmount = !rentOpen && line\.transactionType === "monthly";/,
    );
    assert.match(
      customerPageSource,
      /field="budgetMin"[\s\S]*?rent=\{showRentInAmount \? line\.monthlyRentMin : null\}/,
    );
    assert.match(
      customerPageSource,
      /field="budgetMax"[\s\S]*?rent=\{showRentInAmount \? line\.monthlyRentMax : null\}/,
    );
    assert.match(
      customerPageSource,
      /!rentOpen && line\.transactionType === "monthly"\s*\? line\.monthlyRent\s*: null/,
    );
    assert.doesNotMatch(customerPageSource, /rentOpen \? null : line\.monthlyRent/);
    assert.match(
      customerPageSource,
      /return rent \? `\$\{amount\}\/\$\{rent\.toLocaleString\(\)\}만` : amount;/,
    );
    // 정렬 중인 열이 사라지면 화살표도 사라지므로 기본 정렬로 되돌린다.
    assert.match(
      customerPageSource,
      /SORT_FIELD_COLUMN\[sortBy\][\s\S]*?setSortBy\("createdAt"\);\s*setSortOrder\("desc"\);/,
    );
    assert.match(customerLedgerStyles, /th\.ledger-detail-header\s*\{[\s\S]*?background: #f2f6f4;/);
    assert.doesNotMatch(customerLedgerStyles, /ledger-group-end/);
  });

  it("reads each request on one row and gives notes their own column", () => {
    assert.doesNotMatch(customerPageSource, /ledger-context/);
    assert.doesNotMatch(customerLedgerStyles, /ledger-context/);
    assert.match(
      customerPageSource,
      /type RowDescriptor =\s*\| \{ type: "intent"; line: BrokerageCaseDemandIntent \}\s*\| \{ type: "stack"; group: ListingGroup \};/,
    );
    assert.equal(
      (customerPageSource.match(/className="ledger-intake-cell"/g) ?? [])
        .length,
      2,
    );
    assert.doesNotMatch(functionSource("DemandIntakeCell"), /<MemoCell|MemoEditor/);
    assert.doesNotMatch(customerPageSource, />\s*선호지역·물건\s*</);
    assert.doesNotMatch(customerPageSource, />\s*매물 데이터\s*</);
    assert.match(
      customerPageSource,
      /aria-label=\{`\$\{placeLabel\} 구함 상세 열기`\}/,
    );
    assert.match(customerPageSource, /function demandSiteLabel/);
    assert.match(customerPageSource, /line\.preferredSites\.map/);
    assert.match(
      customerPageSource,
      /aria-label=\{`\$\{first\.contextLabel\} 매물 상세 열기`\}/,
    );
    assert.match(customerPageSource, /<span className="ledger-memo-add">\+ 노트<\/span>/);
    assert.match(
      customerLedgerStyles,
      /\.ledger-intent-row:focus-within \.ledger-memo-add\s*\{[\s\S]*?opacity: 1;/,
    );
  });

  it("does not rewrite a multi-line memo when it is opened and closed unchanged", () => {
    const memoCell = functionSource("MemoCell");
    assert.match(memoCell, /const text = value\?\.replace\(/);
    assert.match(memoCell, /value=\{text\}/);
    assert.match(memoCell, /if \(next !== \(text \?\? ""\)\.trim\(\)\) onSave\(next\);/);
  });

  it("opens one status editor per row even when two rows share an intake", () => {
    assert.match(
      customerPageSource,
      /recordId=\{line\.requirementId\}\s*field="lifecycleStatus"/,
    );
    assert.match(
      customerPageSource,
      /target: "buyer-intake",\s*id: line\.buyerIntakeId,/,
    );
  });

  it("keeps a single-option listing row as tall as a demand row", () => {
    assert.match(customerLedgerStyles, /--ledger-row-height: 33px;/);
    assert.match(
      customerLedgerStyles,
      /\.ledger-stack-line\s*\{[\s\S]*?height: calc\(var\(--ledger-row-height\) - 1px\);/,
    );
    assert.match(
      customerLedgerStyles,
      /\[data-ledger-cell-value\]\s*\{[\s\S]*?min-height: calc\(var\(--ledger-row-height\) - 1px\);/,
    );
    // 고객 경계는 아랫선 색으로만 나눠 행 높이를 늘리지 않는다.
    assert.doesNotMatch(customerLedgerStyles, /border-top/);
    // 최근 상담 줄이 펼쳐져 있으면 그 줄이 고객의 마지막 행이다.
    assert.match(
      customerPageSource,
      /rowIndex === rows\.length - 1 &&\s*!showConsultRow &&\s*"ledger-case-end"/,
    );
    assert.match(customerPageSource, /"ledger-consult-row ledger-case-end"/);
  });

  it("expands the latest consultation under each customer like the wanted-properties memo", () => {
    // 희망매물처럼 처음부터 펼쳐져 있고, 고객마다 접을 수 있다.
    assert.match(
      customerPageSource,
      /const \[consultExpanded, setConsultExpanded\] = useState\(true\);/,
    );
    assert.match(
      customerPageSource,
      /aria-label=\{`\$\{customerName\} 최근 상담 \$\{consultExpanded \? "접기" : "펼치기"\}`\}/,
    );
    assert.match(customerPageSource, /aria-expanded=\{consultExpanded\}/);
    // 상담이 없으면 버튼도 줄도 없다.
    assert.match(
      customerPageSource,
      /consultVisible && consultExpanded && latestConsultation !== null/,
    );
    assert.match(
      customerPageSource,
      /\{latestConsultation \? \(\s*<Button[\s\S]*?setConsultExpanded/,
    );
    // 줄은 의뢰 행과 매칭 패널 사이에 놓여, 매칭을 펼쳐도 자리가 바뀌지 않는다.
    const baseRowsIndex = customerPageSource.indexOf(
      "{rows.map((row, rowIndex) =>",
    );
    const consultRowIndex = customerPageSource.indexOf("ledger-consult-row");
    const panelRowsIndex = customerPageSource.indexOf("{rows.map((row) =>");
    assert.ok(baseRowsIndex < consultRowIndex && consultRowIndex < panelRowsIndex);
    // 같은 내용을 열로 두 번 보여 주지 않는다.
    assert.doesNotMatch(customerPageSource, /label="최근 상담"/);
    assert.doesNotMatch(customerPageSource, /consultationCell/);
    // 고정 칸을 상담 줄까지 이어 고객 한 명이 한 덩어리로 보이게 한다.
    assert.match(
      customerPageSource,
      /const rowSpan = rows\.length \+ \(showConsultRow \? 1 : 0\);/,
    );
    assert.match(customerPageSource, /const LEDGER_PINNED_COLUMN_COUNT = 5;/);
    // 상담 줄이 표 끝까지 이어져야 끝까지 스크롤해도 고정 칸 밑으로 들어가지 않는다.
    assert.match(
      customerPageSource,
      /<td colSpan=\{columnCount - LEDGER_PINNED_COLUMN_COUNT\}>/,
    );
    assert.match(
      customerPageSource,
      /showConsultRow && "ledger-rowspan-inner"/,
    );
    // 가로로 스크롤해도 고정 칸 옆에 남고, 행 높이가 고르도록 한 줄만 보여 준다.
    assert.match(
      customerLedgerStyles,
      /\.ledger-consult-line\s*\{[\s\S]*?position: sticky;[\s\S]*?left: 340px;[\s\S]*?100cqw - 340px/,
    );
    assert.match(
      customerLedgerStyles,
      /\.ledger-consult-link\s*\{[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap;/,
    );
  });

  it("labels min and max headers in one tier with their sort fields", () => {
    for (const [label, field] of [
      ["최소예산", "budgetMin"],
      ["최대예산", "budgetMax"],
      ["최소월세", "monthlyRentMin"],
      ["최대월세", "monthlyRentMax"],
      ["최소평형", "areaMin"],
      ["최대평형", "areaMax"],
    ]) {
      assert.match(
        customerPageSource,
        new RegExp(`label="${label}"\\s+field="${field}"`),
      );
    }
    assert.doesNotMatch(customerPageSource, /LedgerGroupHeader/);
    assert.doesNotMatch(customerPageSource, /rowSpan=\{2\}/);
  });

  it("shows assignee, next contact, and latest consultation from the existing API fields", () => {
    assert.match(
      customerPageSource,
      /field="assignedToId"[\s\S]*?target: "buyer-requirement"[\s\S]*?patch: \{ assignedToId \}/,
    );
    assert.match(
      customerPageSource,
      /target: "buyer-requirement",\s*id: line\.requirementId,\s*patch: \{ nextContactDate \}/,
    );
    assert.match(customerPageSource, /picker: "date"/);
    assert.match(customerPageSource, /fromField: "nextContactDate"/);
    assert.match(customerPageSource, /getFollowUpState\(value\)/);
    assert.match(customerPageSource, /to="\/consultations"/);
    assert.match(
      customerPageSource,
      /search=\{\{ consultationId: latestConsultation\.id \}\}/,
    );
    // 매물 의뢰에는 아직 담당·다음 연락 값이 없어 편집을 제공하지 않는다.
    assert.match(
      customerPageSource,
      /<td className="ledger-stack-merged-cell ledger-empty-value">-<\/td>/,
    );
    assert.doesNotMatch(customerPageSource, /line\.nextConfirmAt/);
  });

  it("uses the property table status pill and date colors and trims empty values", () => {
    const lifecycle = customerPageSource.slice(
      customerPageSource.indexOf("const LIFECYCLE_PILL_STYLES"),
      customerPageSource.indexOf("function LifecyclePill"),
    );
    assert.match(lifecycle, /open: \{[\s\S]*?bg-\[#eef3ed\] text-\[#44745a\][\s\S]*?bg-\[#6c9b7a\]/);
    assert.match(lifecycle, /hold: \{[\s\S]*?bg-\[#fbf3db\] text-\[#9f6b00\][\s\S]*?bg-\[#dfab01\]/);
    assert.match(functionSource("LifecyclePill"), /"size-1\.5 rounded-full"/);
    const nextContact = functionSource("NextContactLabel");
    assert.match(nextContact, /bg-warning-soft text-warning-strong/);
    assert.match(nextContact, /bg-destructive-soft text-destructive-strong/);
    assert.match(nextContact, /bg-\[#f1f1ef\] text-\[#5f5e5a\]/);
    assert.match(customerPageSource, /replace\(\/\\\.0평\$\/, "평"\)/);
    assert.match(
      customerLedgerStyles,
      /\.ledger-empty-value\s*\{[\s\S]*?font-weight: 400;/,
    );
  });

  it("edits source-backed customer, demand, and listing fields inside the table", () => {
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
    assert.doesNotMatch(customerPageSource, /expandedPanelCount/);
    const baseRowsIndex = customerPageSource.indexOf(
      "{rows.map((row, rowIndex) =>",
    );
    const panelRowsIndex = customerPageSource.indexOf("{rows.map((row) =>");
    assert.ok(baseRowsIndex >= 0 && panelRowsIndex > baseRowsIndex);
    assert.match(
      customerPageSource,
      /<td colSpan=\{columnCount\}>[\s\S]*?customer-ledger-match-panel-frame/,
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
      6,
    );
    assert.match(
      customerLedgerStyles,
      /\.customer-ledger-table tbody :is\(td, th\)\.ledger-rowspan-top\s*\{\s*vertical-align: top;/,
    );
    assert.match(
      customerLedgerStyles,
      /td\.ledger-select-cell\s*\{[\s\S]*?padding: 9px 0 0;/,
    );
    assert.match(
      customerLedgerStyles,
      /td\.ledger-updated-cell\s*\{[\s\S]*?line-height: 32px;/,
    );
    // rowSpan 때문에 tr의 마지막 칸은 행마다 달라, :last-child로 세로줄을 지우면 어긋난다.
    assert.doesNotMatch(customerLedgerStyles, /tbody tr > :last-child/);
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
    assert.match(customerPageSource, /<CustomerCaseActionMenu/);
    assert.match(
      customerCaseActionMenuSource,
      /aria-label=\{`\$\{customerName\} 케이스 작업 메뉴`\}/,
    );
    assert.match(customerCaseActionMenuSource, />고객 정보 열기</);
    assert.match(
      customerCaseActionMenuSource,
      /구함 \{line\.priorityRank\} 상세 열기/,
    );
    assert.match(customerCaseActionMenuSource, /매물 \{index \+ 1\} 열기/);
  });

  it("follows the property table toolbar above the ledger", () => {
    assert.match(customerPageSource, /<ToolbarPillTabs/);
    assert.match(customerPageSource, /<ToolbarPillToggle/);
    assert.match(customerPageSource, /<LedgerSearchBar/);
    assert.match(customerPageSource, /<LedgerFilterChip/);
    assert.match(customerPageSource, /<AddFilterMenu/);
    assert.doesNotMatch(customerPageSource, /<ViewBar/);
    assert.match(
      customerPageSource,
      /const PRIMARY_FILTER_FIELDS = \[\s*"transactionType",\s*"status",\s*"assignedToId",\s*"nextContact",\s*\];/,
    );
    assert.match(
      customerPageSource,
      /const PLACE_FILTER_FIELDS = \["preferredRegions", "preferredSites"\];/,
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

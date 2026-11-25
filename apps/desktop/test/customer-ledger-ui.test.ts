import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type {
  CustomerLedgerRow,
  CustomerLedgerDemandIntent,
  CustomerLedgerResponse,
  CustomerLedgerListingIntent,
} from "@estate-erp/api-client";
import { pyeongToSqm } from "@estate-erp/shared";
import { customerLedgerFiltersToApiParams } from "../src/renderer/routes/_authenticated/customers/-customer-list-filters.ts";
import {
  getNextLedgerCursor,
  mergeLedgerPages,
} from "../src/renderer/routes/_authenticated/customers/-customer-ledger-pagination.ts";
import {
  carryConsultationDraft,
  collectLedgerPhones,
  CONSULTATION_SAVE_MUTATION_KEY,
  DEFAULT_LEDGER_SORT,
  describeDemandIntent,
  describeListingPrice,
  describeParticipantRoles,
  getLedgerAssignees,
  getLedgerCompanionCount,
  getLedgerCustomerName,
  getLedgerCustomerPhone,
  getLedgerHeading,
  getLedgerParties,
  getLedgerRowSides,
  getLedgerRowStatus,
  groupListingIntents,
  hasConsultationDraft,
  LEDGER_SORT_OPTIONS,
  mergeConsultationPages,
  orderConsultationSources,
  rememberConsultationDraft,
  settleSavedConsultationDraft,
  type ConsultationDraftStore,
} from "../src/renderer/routes/_authenticated/customers-table/-ledger-model.ts";

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
const inspectorSource = readFileSync(
  resolve(customerTableRouteDir, "-customer-inspector.tsx"),
  "utf8",
);
const chipsSource = readFileSync(
  resolve(customerTableRouteDir, "-ledger-chips.tsx"),
  "utf8",
);
const modelSource = readFileSync(
  resolve(customerTableRouteDir, "-ledger-model.ts"),
  "utf8",
);

function functionSource(source: string, name: string) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end < 0 ? undefined : end);
}

function ledgerPage(
  nextCursor: string | null,
  projectIds: string[],
): CustomerLedgerResponse {
  return {
    items: projectIds.map((id) => ({ id })),
    pagination: {
      limit: 20,
      total: projectIds.length,
      nextCursor,
    },
    summary: { rows: projectIds.length, demand: 0, listing: 0, both: 0 },
  } as unknown as CustomerLedgerResponse;
}

function demand(patch: Partial<CustomerLedgerDemandIntent> = {}) {
  return {
    kind: "demand",
    buyerIntakeId: "bi-1",
    requirementId: "br-1",
    lifecycleStatus: "open",
    transactionType: "sale",
    budgetMin: null,
    budgetMax: null,
    priceMin: null,
    priceMax: null,
    depositMin: null,
    depositMax: null,
    monthlyRentMin: null,
    monthlyRentMax: null,
    areaMin: null,
    areaMax: null,
    assignedTo: null,
    matchCount: 0,
    contextLabel: "고덕동",
    ...patch,
  } as CustomerLedgerDemandIntent;
}

function listing(patch: Partial<CustomerLedgerListingIntent> = {}) {
  return {
    kind: "listing",
    listingIntakeId: "li-1",
    listingId: "l-1",
    lifecycleStatus: "open",
    transactionType: "sale",
    askingPrice: null,
    price: null,
    deposit: null,
    monthlyRent: null,
    area: null,
    isPaused: false,
    matchCount: 0,
    propertyId: "p-1",
    contextLabel: "고덕아르테온 305동 1203호",
    ...patch,
  } as CustomerLedgerListingIntent;
}

function ledgerRow(patch: Partial<CustomerLedgerRow> = {}) {
  return {
    id: "row-1",
    projectId: null,
    title: null,
    participants: [],
    primaryParticipant: null,
    latestConsultation: null,
    demandIntents: [],
    listingIntents: [],
    listingIntakeIds: [],
    buyerIntakeIds: [],
    ...patch,
  } as CustomerLedgerRow;
}

function participant(id: string, name: string, phone: string | null) {
  return {
    id,
    contactId: id,
    roles: [],
    isPrincipal: true,
    isCommunicationPrimary: false,
    memo: null,
    contact: { id, name, email: null, phone },
  };
}

describe("desktop customer ledger", () => {
  it("keeps the table ledger on the customers-table route", () => {
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
    // 고객 원장은 2026-11-21에 메뉴에서 뺐고 그 자리에 프로젝트를 두었다. 화면과 주소는 남아 있다.
    // 주석에 적어 둔 되돌리는 방법이 아니라 실제 메뉴 항목을 본다.
    const navItems = navConfig
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    assert.doesNotMatch(navItems, /path: "\/customers-table"/);
    assert.match(
      navItems,
      /\{ path: "\/projects", label: "프로젝트", icon: FolderKanban, group: "customers" \}/,
    );
    assert.doesNotMatch(navItems, /path: "\/customers",/);
    assert.match(routeMeta, /'\/projects': \{ title: '프로젝트'/);
    assert.match(routeMeta, /match: \/\^\\\/projects\\\/\(\[\^\/\]\+\)\$\//);
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
      // 원장은 메뉴에서 빠져 링크를 거둔 화면도 있다(업무 화면 등). 남아 있는 링크는 기본 표 보기로 간다.
      assert.doesNotMatch(source, /["']\/customers["']/, file);
    }
  });


  it("is built from the shared list-screen parts, not its own table", () => {
    // 표 · 도구 줄 · 열기 단추는 연락처 · 매물관리와 같은 부품을 쓴다.
    assert.match(customerPageSource, /<DataTable[\s\S]*?variant="notion"[\s\S]*?propertyListTone[\s\S]*?rowHeight=\{LEDGER_ROW_HEIGHT\}/);
    assert.match(customerPageSource, /const LEDGER_ROW_HEIGHT = 37;/);
    assert.match(customerPageSource, /<ToolbarPillTabs\s+shape="soft"/);
    assert.match(customerPageSource, /<ToolbarPillSearch/);
    assert.match(customerPageSource, /<ToolbarFilterChip\s+shape="soft"/);
    assert.match(customerPageSource, /<RowOpenButton[\s\S]*?controls=\{CUSTOMER_INSPECTOR_ID\}/);
    assert.match(customerPageSource, /className="flex h-\[51px\] shrink-0 items-center gap-2 border-b border-border bg-white px-3"/);
    assert.match(customerPageSource, /className="flex min-h-\[44px\] shrink-0 items-center gap-2 border-b border-border bg-white px-3 py-1\.5"/);
    // 줄 안에서 값을 고치던 예전 표는 남기지 않는다.
    assert.doesNotMatch(customerPageSource, /<table|CellEditProvider|EditableCell|LedgerMatchPanel|customer-ledger\.css/);
  });

  it("shows one customer per row with six columns in a fixed order", () => {
    const ids = [...customerPageSource.matchAll(/^\s{8}id: "([a-zA-Z]+)",$/gm)].map((match) => match[1]);
    assert.deepEqual(ids, ["customer", "phone", "latestConsultation", "sides", "status", "assignee"]);
    for (const label of ["고객", "연락처", "최근 상담", "의뢰", "상태", "담당"]) {
      assert.match(customerPageSource, new RegExp(`label="${label}"`), label);
    }
    // 가장 넓은 칸은 최근 상담이다 (남는 너비를 가져간다).
    assert.match(customerPageSource, /id: "latestConsultation",[\s\S]*?meta: \{ fill: true \}/);
    // 다음 연락은 화면에서 뺐다.
    assert.doesNotMatch(customerPageSource + inspectorSource, /다음 연락|nextContact/);
  });

  it("keeps search, tabs, assignee, sorting and paging on the server", () => {
    assert.match(
      customerPageSource,
      /const filters = useMemo\(\s*\(\) => \(\{\s*search: deferredSearch\.trim\(\) \|\| undefined,\s*mode,[\s\S]*?assignedToId: assigneeId \?\? undefined,\s*sortBy: sort\.sortBy,\s*sortOrder: sort\.sortOrder,\s*limit: PAGE_SIZE,/,
    );
    assert.match(
      customerPageSource,
      /queryKey: \["projects", "ledger", filters\],[\s\S]*?api\.projects\.ledger\(\{\s*\.\.\.filters,\s*cursor: pageParam \?\? undefined,/,
    );
    assert.match(customerPageSource, /getNextPageParam: getNextLedgerCursor/);
    assert.match(customerPageSource, /mergeLedgerPages\(ledgerQuery\.data\?\.pages\)/);
    // 쪽 단위로 불러온 줄을 화면에서 다시 줄 세우거나 걸러 내지 않는다.
    assert.doesNotMatch(customerPageSource, /rows\s*\.(sort|filter)\(/);
    // 서버가 받는 정렬만 내놓는다.
    assert.deepEqual(
      LEDGER_SORT_OPTIONS.map((option) => [option.sortBy, option.sortOrder]),
      [["createdAt", "desc"], ["customer", "asc"], ["matchCount", "desc"]],
    );
    assert.equal(DEFAULT_LEDGER_SORT.sortBy, "createdAt");
    assert.equal(new Set(LEDGER_SORT_OPTIONS.map((option) => option.value)).size, LEDGER_SORT_OPTIONS.length);
  });

  it("does not hammer a failed next page while scrolling and offers a retry", () => {
    assert.match(
      customerPageSource,
      /if \(!hasNextPage \|\| isFetchingNextPage \|\| isFetchNextPageError\) return;\s*void fetchNextPage\(\);/,
    );
    assert.match(customerPageSource, /isFetchNextPageError && \([\s\S]*?onClick=\{\(\) => void fetchNextPage\(\)\}[\s\S]*?다시 시도/);
    // 처음부터 못 불러왔을 때만 화면 전체를 오류로 바꾼다. 이미 보이는 줄은 그대로 둔다.
    assert.match(customerPageSource, /ledgerQuery\.isError && rows\.length === 0 \?/);
  });

  it("selects rows with the table's checkbox column and drops the selection when conditions change", () => {
    assert.match(customerPageSource, /enableRowSelection\s+selectedRowIds=\{selectedRowIds\}\s+onRowSelectionChange=\{setSelectedRowIds\}/);
    assert.match(customerPageSource, /useEffect\(\(\) => \{\s*setSelectedRowIds\(\[\]\);\s*\}, \[filters\]\);/);
    assert.match(customerPageSource, /renderBulkActions=\{\(selectedRows\) => \(\s*<LedgerBulkActions rows=\{selectedRows\} \/>/);
    const bulk = functionSource(customerPageSource, "LedgerBulkActions");
    assert.match(bulk, /collectLedgerPhones\(rows\)/);
    assert.match(bulk, /navigator\.clipboard\.writeText\(/);
    assert.match(bulk, /catch \{\s*toast\.error\(/);
  });

  it("opens the side panel like the other list screens and closes it when its row is gone", () => {
    assert.match(customerPageSource, /activateOnDoubleClick/);
    assert.match(customerPageSource, /onRowClick=\{openInspector\}/);
    assert.match(customerPageSource, /setInspectorMotion\(!document\.activeElement\?\.matches\(":focus-visible"\)\)/);
    assert.match(customerPageSource, /const currentRowId = isInspectorClosing \? null : openRowId;/);
    // 줄은 불러온 목록에서 다시 찾는다. 고쳐진 값이 패널에 바로 보이고, 사라진 줄은 보여 주지 않는다.
    assert.match(customerPageSource, /const found = rows\.find\(\(row\) => row\.id === openRowId\) \?\? null;/);
    assert.match(
      customerPageSource,
      /if \(openRowId && !inspectorRow && !ledgerQuery\.isPending\) finishClosingInspector\(\);/,
    );
    assert.match(customerPageSource, /<CustomerInspector\s+key=\{inspectorRow\.id\}/);
  });

  it("frames the panel like the contact panel", () => {
    assert.match(inspectorSource, /export const CUSTOMER_INSPECTOR_WIDTH = 584;/);
    assert.match(inspectorSource, /data-property-inspector\s+data-state=\{closing \? "closed" : "open"\}\s+data-motion=\{animate \? "slide" : "none"\}/);
    assert.match(inspectorSource, /inert=\{closing\}/);
    assert.match(inspectorSource, /<PropertyInspectorToolbar/);
    assert.match(inspectorSource, /useInspectorFocus\(panelRef, !animate, row\.id\);/);
    assert.match(inspectorSource, /resourceKey: tabResourceKeys\.entity\("contact", contactId\)/);
    // 줄에 사람이 여럿이면 한 사람의 화면으로 넘기는 단추를 두지 않는다 (사람마다 패널 안에서 연다).
    assert.match(
      inspectorSource,
      /const contactId =\s*row\.participants\.length <= 1 \? \(row\.primaryParticipant\?\.contact\.id \?\? null\) : null;/,
    );
    assert.match(inspectorSource, /showExpand=\{Boolean\(openInNewTab\)\}/);
    for (const part of ["SectionTitle", "TextAction", "EmptyText"]) {
      assert.match(inspectorSource, new RegExp(`<${part}`), part);
    }
    // 구역 순서: 고객(사람이 여럿일 때만) → 의뢰 → 상담 → 메모
    assert.match(inspectorSource, /row\.participants\.length > 1 && \(\s*<section data-ledger-people>/);
    const order = [">고객</SectionTitle>", "의뢰\n          </SectionTitle>", ">상담</SectionTitle>", "메모\n          </SectionTitle>"].map((text) => inspectorSource.indexOf(text));
    assert.ok(order.every((index) => index > 0), String(order));
    assert.deepEqual([...order].sort((left, right) => left - right), order);
  });

  it("shows the ledger row, not one person: every customer's consultations and memos", () => {
    // 상담과 메모는 대표 연락 고객 한 사람이 아니라 그 줄의 손님들 것을 모은다.
    assert.doesNotMatch(inspectorSource, /row\.primaryParticipant\?\.contact\.id \?\? null;\s*const openOrRevealResource/);
    assert.match(inspectorSource, /const parties = useMemo\(\(\) => getLedgerParties\(row\), \[row\]\);/);
    assert.match(inspectorSource, /\{getLedgerHeading\(row\)\}/);
    // 메모: 손님마다 연락처에서 (연락처 패널과 같은 캐시)
    assert.match(
      inspectorSource,
      /useQueries\(\{\s*queries: partyIds\.map\(\(id\) => \(\{\s*queryKey: \["contacts", "quick-sheet", id\],\s*queryFn: \(\) => api\.contacts\.findOne\(id\),/,
    );
    assert.match(inspectorSource, /const projectMemo = row\.memo\?\.trim\(\) \?\? "";/);
    // 상담 이력: 연락처 상세는 최근 10건만 준다. 손님마다 상담 목록에서 쪽 단위로 끝까지 읽는다.
    assert.doesNotMatch(inspectorSource, /data\?\.consultations/);
    assert.match(
      inspectorSource,
      /queryKey: \["consultations", "by-contacts", partyIds\],[\s\S]*?results: await Promise\.all\(\s*partyIds\.map\(\(contactId\) =>\s*api\.consultations\.findAll\(\{\s*contactId,\s*page: pageParam,\s*limit: CONSULTATIONS_PAGE_SIZE,/,
    );
    assert.match(
      inspectorSource,
      /lastPage\.results\.some\(\s*\(result\) => result\.pagination\.page < result\.pagination\.totalPages,\s*\)\s*\? lastPage\.page \+ 1\s*: undefined/,
    );
    assert.match(inspectorSource, /orderConsultationSources\(\s*partyIds\.map\(\(_, index\) => \(\{\s*items: mergeConsultationPages\(pages\.map\(\(page\) => page\.results\[index\]\)\),/);
    // 건수는 받아 온 만큼이 아니라 서버가 센 전체를 손님마다 더한 것이다.
    assert.match(inspectorSource, /\(sum, result\) => sum \+ result\.pagination\.total/);
    assert.match(inspectorSource, /<SectionTitle count=\{consultationTotal \|\| undefined\}>상담<\/SectionTitle>/);
    assert.match(inspectorSource, /const CONSULTATIONS_SHOWN = 3;/);
    // 손님이 여럿이면 누구와의 상담인지 적는다.
    assert.match(inspectorSource, /personName=\{\s*isShared\s*\? \(partyNames\.get\(consultation\.contactId\) \?\? consultation\.contact\?\.name\)\s*: undefined/);
    // 받아 온 것을 다 보여 준 뒤 남은 상담을 이어 불러오고, 실패하면 다시 시도할 수 있다.
    assert.match(inspectorSource, /consultationsQuery\.hasNextPage \? \([\s\S]*?onClick=\{\(\) => void consultationsQuery\.fetchNextPage\(\)\}/);
    assert.match(inspectorSource, /consultationsQuery\.isFetchNextPageError \? \([\s\S]*?다시 시도/);
    // 진행 계획은 프로젝트가 있을 때만, 진행 계획 창과 같은 캐시로 읽는다.
    assert.match(inspectorSource, /queryKey: \["projects", "plan", projectId\]/);
    assert.match(inspectorSource, /row\.projectId && \(\s*<ProjectPlanSummary/);

    const page = (ids: string[]) => ({ items: ids.map((id) => ({ id })) });
    assert.deepEqual(
      mergeConsultationPages([page(["k1", "k2"]), page(["k2", "k3"])]).map(({ id }) => id),
      ["k1", "k2", "k3"],
    );
    assert.deepEqual(mergeConsultationPages(undefined), []);
  });

  it("treats the parties of a row as its customers and names them together", () => {
    const wife = { ...participant("c-1", "한지우", "01011112222"), isCommunicationPrimary: true };
    const husband = { ...participant("c-2", "서민호", "01033334444"), roles: ["co_buyer", "co_seller"] };
    const lawyer = { ...participant("c-3", "정법무", null), roles: ["lawyer"], isPrincipal: false };
    const row = ledgerRow({ participants: [wife, husband, lawyer], primaryParticipant: wife });
    // 대리인·법무사처럼 곁에서 돕는 사람은 줄에 나오지만 손님은 아니다 (그 사람의 상담을 섞지 않는다).
    assert.deepEqual(getLedgerParties(row).map((party) => party.contact.id), ["c-1", "c-2"]);
    assert.equal(getLedgerHeading(row), "한지우, 서민호");
    const third = participant("c-4", "한서윤", null);
    assert.equal(
      getLedgerHeading(ledgerRow({ participants: [wife, husband, third], primaryParticipant: wife })),
      "한지우, 서민호 외 1명",
    );
    // 당사자 표시가 하나도 없으면 묶인 사람 전부, 아무도 없으면 대표 연락 고객이나 프로젝트 이름을 쓴다.
    assert.deepEqual(getLedgerParties(ledgerRow({ participants: [lawyer] })).map((party) => party.contact.id), ["c-3"]);
    assert.deepEqual(getLedgerParties(ledgerRow()), []);
    assert.equal(getLedgerHeading(ledgerRow({ title: "갈아타기" })), "갈아타기");
    assert.equal(describeParticipantRoles(["co_buyer", "co_seller"]), "공동 구함 · 공동 내놓음");
    assert.equal(describeParticipantRoles(["lawyer", "something_new"]), "법무사 · something_new");
    // 패널의 사람 목록은 줄에 묶인 전원이다 (역할과 전화가 함께 나온다).
    const people = functionSource(inspectorSource, "ParticipantRow");
    assert.match(people, /describeParticipantRoles\(participant\.roles\)/);
    assert.match(people, /participant\.isCommunicationPrimary && \(/);
    assert.match(inspectorSource, /row\.participants\.map\(\(participant\) => \(\s*<ParticipantRow/);
  });

  it("carries a draft to another person without overwriting a draft that person already has", () => {
    const drafts: ConsultationDraftStore = new Map();
    // 옮겨 갈 사람이 비어 있으면 글이 따라간다.
    drafts.set("wife", { type: "visit", content: "아내와 통화" });
    carryConsultationDraft(drafts, "wife", "husband");
    assert.equal(drafts.has("wife"), false);
    assert.deepEqual(drafts.get("husband"), { type: "visit", content: "아내와 통화" });
    // 옮겨 갈 사람에게 이미 적던 글이 있으면 덮지 않는다. 둘 다 제 글을 지닌다.
    drafts.set("wife", { type: "phone", content: "새로 적는 글" });
    carryConsultationDraft(drafts, "wife", "husband");
    assert.deepEqual(drafts.get("wife"), { type: "phone", content: "새로 적는 글" });
    assert.deepEqual(drafts.get("husband"), { type: "visit", content: "아내와 통화" });
    // 방법만 골라 둔 빈 글은 적던 글로 치지 않는다 (덮어도 잃는 글이 없다).
    drafts.set("husband", { type: "online", content: "  " });
    assert.equal(hasConsultationDraft(drafts, "husband"), false);
    carryConsultationDraft(drafts, "wife", "husband");
    assert.deepEqual(drafts.get("husband"), { type: "phone", content: "새로 적는 글" });
    assert.equal(drafts.has("wife"), false);
    // 옮길 글이 없거나 같은 사람이면 아무 일도 없다.
    carryConsultationDraft(drafts, "wife", "husband");
    carryConsultationDraft(drafts, "husband", "husband");
    assert.deepEqual([...drafts.keys()], ["husband"]);
  });

  it("merges several customers' consultations only as far as the order is settled", () => {
    const c = (id: string, createdAt: string) => ({ id, createdAt });
    // 모두 받아 왔으면 최근 것부터 전부.
    assert.deepEqual(
      orderConsultationSources([
        { items: [c("a2", "2026-11-18"), c("a1", "2026-11-10")], hasMore: false },
        { items: [c("b1", "2026-11-15")], hasMore: false },
      ]).map(({ id }) => id),
      ["a2", "b1", "a1"],
    );
    // 한 손님에게 받을 것이 남았으면, 그 손님이 받아 온 가장 오래된 상담보다 오래된 것은 아직 내놓지 않는다
    // (받지 않은 상담이 그 사이에 끼어들 수 있다).
    assert.deepEqual(
      orderConsultationSources([
        { items: [c("a3", "2026-11-18"), c("a2", "2026-11-12")], hasMore: true },
        { items: [c("b2", "2026-11-15"), c("b1", "2026-11-01")], hasMore: false },
      ]).map(({ id }) => id),
      ["a3", "b2", "a2"],
    );
    // 받을 것이 남은 손님이 둘이면 더 최근 쪽 경계를 따른다.
    assert.deepEqual(
      orderConsultationSources([
        { items: [c("a2", "2026-11-18"), c("a1", "2026-11-05")], hasMore: true },
        { items: [c("b2", "2026-11-16"), c("b1", "2026-11-10")], hasMore: true },
      ]).map(({ id }) => id),
      ["a2", "b2", "b1"],
    );
    // 같은 상담이 두 번 오면 한 번만, 같은 시각이면 순서가 흔들리지 않는다.
    assert.deepEqual(
      orderConsultationSources([
        { items: [c("x", "2026-11-18"), c("x", "2026-11-18")], hasMore: false },
        { items: [c("w", "2026-11-18")], hasMore: false },
      ]).map(({ id }) => id),
      ["w", "x"],
    );
    assert.deepEqual(orderConsultationSources([]), []);
  });

  it("keeps the save on the page so a draft survives panels that come and go", () => {
    const composer = functionSource(inspectorSource, "ConsultationComposer");
    // 저장은 패널(손님을 바꾸면 새로 그려진다)이 아니라 화면이 쥔다.
    assert.doesNotMatch(inspectorSource, /useMutation|api\.consultations\.create/);
    assert.match(
      customerPageSource,
      /const saveConsultation = useMutation\(\{\s*mutationKey: CONSULTATION_SAVE_MUTATION_KEY,\s*mutationFn: \(request: ConsultationSaveRequest\) => api\.consultations\.create\(request\),/,
    );
    assert.match(customerPageSource, /const consultationDrafts = useRef<ConsultationDraftStore>\(new Map\(\)\)\.current;/);
    // 성공했을 때만, 보낸 글과 남은 글이 같을 때만 지운다. 실패하면 건드리지 않는다.
    assert.match(customerPageSource, /onSuccess: async \(_consultation, request\) => \{[\s\S]*?settleSavedConsultationDraft\(consultationDrafts, request\);/);
    const onError = customerPageSource.slice(customerPageSource.indexOf("onError: (_error, request) => {"), customerPageSource.indexOf("const handleSaveConsultation"));
    assert.ok(onError.length > 0);
    assert.doesNotMatch(onError, /consultationDrafts|settleSavedConsultationDraft/);
    // 표의 최근 상담과 패널의 상담 이력이 함께 새로 고쳐진다.
    for (const key of ['["contacts"]', '["consultations"]', '["projects", "ledger"]']) {
      assert.ok(customerPageSource.includes(`queryKey: ${key}`), key);
    }
    // 어느 패널에서든 "이 손님 것을 저장 중인지"를 같은 이름표로 본다.
    assert.deepEqual([...CONSULTATION_SAVE_MUTATION_KEY], ["consultations", "create", "customer-ledger"]);
    assert.match(
      inspectorSource,
      /useIsMutating\(\{\s*mutationKey: CONSULTATION_SAVE_MUTATION_KEY,\s*predicate: \(mutation\) =>\s*contactId !== null &&\s*\(mutation\.state\.variables as ConsultationSaveRequest \| undefined\)\?\.contactId === contactId,/,
    );
    // 저장 중에는 다시 열어도 고치거나 또 보낼 수 없다.
    assert.match(composer, /if \(!trimmed \|\| isSaving\) return;/);
    assert.match(composer, /readOnly=\{isSaving\}/);
    assert.match(composer, /onChange=\{\(event\) => \{\s*if \(isSaving\) return;/);
    // 보내기 전에 보낸 글을 그대로 기억해 둔다 (끝났을 때 같은지 견준다).
    assert.match(composer, /drafts\.set\(contactId, \{ type, content \}\);\s*onSave\(\{ contactId, type, content: trimmed \}\);/);
    // 끝났을 때: 글이 지워졌으면 닫고, 남아 있으면(실패) 그 자리에서 알리고 다시 적을 수 있게 한다.
    assert.match(
      composer,
      /if \(wasSaving\.current && !isSaving\) \{\s*if \(drafts\.has\(contactId\)\) \{\s*setFailed\(true\);\s*textareaRef\.current\?\.focus\(\{ preventScroll: true \}\);\s*\} else \{\s*onSaved\(\);\s*onClose\(\);/,
    );
    assert.match(composer, /failed \? \(\s*<span role="alert"/);
    // 알림은 오른쪽 아래에 떠서 패널의 아래 막대(상담 기록 · 기록 단추)를 가린다. 적는 칸이 화면에 있는 동안에는
    // 결과를 그 칸과 패널이 보여 주고, 그 손님을 떠났을 때만 알림을 띄운다.
    assert.match(composer, /visibleComposers\.add\(contactId\);\s*return \(\) => \{\s*visibleComposers\.delete\(contactId\);/);
    assert.match(customerPageSource, /if \(!visibleComposers\.has\(request\.contactId\)\) \{\s*toast\.success\(/);
    assert.match(customerPageSource, /if \(!visibleComposers\.has\(request\.contactId\)\) \{\s*toast\.error\(/);
    assert.match(inspectorSource, /consultationSectionRef\.current\?\.scrollIntoView\(\{ block: "start" \}\);/);
    // 한글을 조합하는 중의 Enter는 기록이 아니다. Shift+Enter는 줄바꿈이다.
    assert.match(composer, /if \(event\.key !== "Enter" \|\| event\.shiftKey \|\| event\.nativeEvent\.isComposing\) return;/);
    // Esc는 안쪽부터 닫는다: 떠 있는 창 → 적는 칸 → 패널
    assert.match(
      inspectorSource,
      /if \(document\.querySelector\(OVERLAY_SELECTOR\)\) return;\s*event\.preventDefault\(\);\s*if \(composing\) \{\s*setComposing\(false\);\s*return;\s*\}\s*onClose\(false\);/,
    );
    // 손님이 여럿이면 누구와의 상담인지 고른다. 적던 글은 사람을 바꿔도 따라간다.
    assert.match(composer, /people\.length > 1 && \(/);
    assert.match(inspectorSource, /if \(targetId\) carryConsultationDraft\(drafts, targetId, nextId\);\s*setChosenTargetId\(nextId\);/);
    // 화면이 초안을 직접 옮기지 않는다 (덮어쓰기를 막는 규칙이 한 곳에만 있다).
    assert.doesNotMatch(inspectorSource, /drafts\.set\(nextId/);
    assert.match(composer, /person\.id !== contactId && hasConsultationDraft\(drafts, person\.id\) && \(/);
    assert.match(inspectorSource, /<ConsultationComposer[\s\S]*?key=\{targetId\}\s*contactId=\{targetId\}/);
    // 목록을 새로 받는 동안 패널을 없앴다 다시 그리지 않는다 (적던 칸이 닫힌다).
    assert.match(
      customerPageSource,
      /if \(found \|\| !ledgerQuery\.isPending\) return found;\s*return lastInspectorRow\.current\?\.id === openRowId \? lastInspectorRow\.current : null;/,
    );
  });

  it("remembers a draft per contact and clears it only when exactly that text was saved", () => {
    const drafts: ConsultationDraftStore = new Map();
    rememberConsultationDraft(drafts, "c-1", { type: "phone", content: "  " });
    assert.equal(drafts.has("c-1"), false);
    rememberConsultationDraft(drafts, "c-1", { type: "visit", content: "" });
    assert.deepEqual(drafts.get("c-1"), { type: "visit", content: "" });
    rememberConsultationDraft(drafts, "c-1", { type: "phone", content: "통화함 " });
    rememberConsultationDraft(drafts, "c-2", { type: "phone", content: "다른 손님" });

    // 보낸 뒤에 고쳐 적은 글은 아직 저장되지 않은 글이다. 지우지 않는다.
    drafts.set("c-1", { type: "phone", content: "통화함. 덧붙임" });
    settleSavedConsultationDraft(drafts, { contactId: "c-1", type: "phone", content: "통화함" });
    assert.deepEqual(drafts.get("c-1"), { type: "phone", content: "통화함. 덧붙임" });
    // 방법만 바꿔도 다른 글이다.
    drafts.set("c-1", { type: "visit", content: "통화함" });
    settleSavedConsultationDraft(drafts, { contactId: "c-1", type: "phone", content: "통화함" });
    assert.equal(drafts.has("c-1"), true);
    // 보낸 그대로면(앞뒤 빈칸은 보낼 때 떼었다) 지운다. 다른 손님의 글은 건드리지 않는다.
    drafts.set("c-1", { type: "phone", content: "통화함 " });
    settleSavedConsultationDraft(drafts, { contactId: "c-1", type: "phone", content: "통화함" });
    assert.equal(drafts.has("c-1"), false);
    assert.deepEqual(drafts.get("c-2"), { type: "phone", content: "다른 손님" });
    // 이미 없는 글이면 아무 일도 없다.
    settleSavedConsultationDraft(drafts, { contactId: "c-9", type: "phone", content: "x" });
    assert.equal(drafts.size, 1);
  });

  it("derives the row status from matches and never invents a closed state", () => {
    assert.equal(getLedgerRowStatus(ledgerRow({ demandIntents: [demand()] })), "exploring");
    assert.equal(getLedgerRowStatus(ledgerRow({ demandIntents: [demand({ matchCount: 2 })] })), "active");
    assert.equal(getLedgerRowStatus(ledgerRow({ listingIntents: [listing({ matchCount: 1 })] })), "active");
    assert.equal(getLedgerRowStatus(ledgerRow()), "exploring");
    // 매칭 없이 바로 만든 거래도 진행 중이다(계약까지 했는데 "파악 중"으로 보이지 않게).
    assert.equal(
      getLedgerRowStatus(ledgerRow({ listingIntents: [listing({ activeDealCount: 1 })] })),
      "active",
    );
    assert.equal(
      getLedgerRowStatus(ledgerRow({ demandIntents: [demand({ activeDealCount: 1 })] })),
      "active",
    );
    // 원장 API는 진행 중인 의뢰가 있는 줄만 준다. 화면이 "종료"를 지어내지 않는다.
    assert.match(modelSource, /export type LedgerRowStatus = "exploring" \| "active";/);
    assert.match(chipsSource, /data-ledger-status=\{status\}/);
  });

  it("marks buy and sell from every intake of the row, even ones the filter hid", () => {
    assert.deepEqual(getLedgerRowSides(ledgerRow()), { buy: false, sell: false });
    assert.deepEqual(
      getLedgerRowSides(ledgerRow({ buyerIntakeIds: ["bi-1"], listingIntakeIds: ["li-1"] })),
      { buy: true, sell: true },
    );
    assert.deepEqual(getLedgerRowSides(ledgerRow({ listingIntents: [listing()] })), { buy: false, sell: true });
    // 화살표나 건수 없이 두 표시만 쓴다.
    const tags = functionSource(chipsSource, "LedgerSideTags");
    assert.match(tags, /sides\.buy && <LedgerSideTag side="buy" \/>/);
    assert.match(tags, /sides\.sell && <LedgerSideTag side="sell" \/>/);
    assert.doesNotMatch(tags, /length|→|Arrow/);
  });

  it("names the customer, counts companions and collects phones without repeats", () => {
    const hong = participant("c-1", "홍길동", "01012345678");
    const kim = participant("c-2", "김영희", null);
    const row = ledgerRow({ participants: [hong, kim], primaryParticipant: hong });
    assert.equal(getLedgerCustomerName(row), "홍길동");
    assert.equal(getLedgerCompanionCount(row), 1);
    assert.equal(getLedgerCustomerPhone(row), "01012345678");
    assert.equal(getLedgerCustomerName(ledgerRow({ title: "갈아타기" })), "갈아타기");
    assert.equal(getLedgerCustomerName(ledgerRow()), "이름 없는 고객");
    assert.equal(getLedgerCustomerPhone(ledgerRow({ participants: [kim], primaryParticipant: kim })), null);
    assert.deepEqual(
      collectLedgerPhones([row, ledgerRow({ id: "row-2", participants: [hong], primaryParticipant: hong }), ledgerRow({ id: "row-3" })]),
      ["01012345678"],
    );
  });

  it("lists assignees once each and groups listing options by intake", () => {
    const row = ledgerRow({
      demandIntents: [
        demand({ assignedTo: { id: "u-1", name: "박지훈" } }),
        demand({ requirementId: "br-2", assignedTo: { id: "u-1", name: "박지훈" } }),
        demand({ requirementId: "br-3", assignedTo: { id: "u-2", name: "이수민" } }),
        demand({ requirementId: "br-4" }),
      ],
    });
    assert.deepEqual(getLedgerAssignees(row), ["박지훈", "이수민"]);
    assert.deepEqual(getLedgerAssignees(ledgerRow({ listingIntents: [listing()] })), []);

    const groups = groupListingIntents([
      listing({ listingId: "l-1", transactionType: "sale", matchCount: 1 }),
      listing({ listingIntakeId: "li-2", listingId: "l-3", propertyId: "p-2" }),
      listing({ listingId: "l-2", transactionType: "jeonse", matchCount: 3 }),
    ]);
    assert.deepEqual(groups.map((group) => [group.listingIntakeId, group.options.length, group.matchCount]), [["li-1", 2, 3], ["li-2", 1, 0]]);
  });

  it("describes conditions in the app's money and area units", () => {
    assert.equal(
      describeDemandIntent(demand({ priceMin: 150000, priceMax: 160000, areaMin: 112.4, areaMax: 112.4 })),
      "고덕동 · 34평 · 15억 ~ 16억",
    );
    assert.equal(describeDemandIntent(demand({ budgetMax: 90000 })), "고덕동 · 9억 이하");
    assert.equal(
      describeDemandIntent(demand({ transactionType: "monthly", depositMin: 1000, depositMax: 1000, monthlyRentMin: 80, monthlyRentMax: 80 })),
      "고덕동 · 1,000만 / 80만",
    );
    assert.equal(describeDemandIntent(demand()), "고덕동");
    assert.equal(describeListingPrice(listing({ price: 165000 })), "16억 5,000만");
    assert.equal(describeListingPrice(listing({ transactionType: "jeonse", deposit: 68000 })), "6억 8,000만");
    assert.equal(describeListingPrice(listing({ transactionType: "monthly", deposit: 3000, monthlyRent: 180 })), "3,000만 / 180만");
    assert.equal(describeListingPrice(listing()), "금액 미정");
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

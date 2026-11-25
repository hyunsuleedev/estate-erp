import type {
  ProjectDerivedStatus,
  ProjectIntakeFilter,
  ProjectListFilter,
  ProjectListSort,
} from "@estate-erp/api-client";

/**
 * 프로젝트 목록의 조건(보기 탭 · 검색 · 필터 · 정렬)과 표 설정.
 *
 * 조건은 주소(search params)에 남겨 새로 고쳐도, 탭을 옮겨 다녀와도 그대로다. 모든 조건은 서버가 건다
 * (불러온 쪽만 거르지 않는다 — 쪽 넘김과 건수가 맞게). 이 파일은 순수 함수만 둔다(테스트한다).
 */

// ── 주소에 담는 조건 ─────────────────────────────────────────────

/** 주소의 모양. 짧은 이름을 쓴다(탭 주소가 길어지지 않게). 빈 값은 담지 않는다. */
export interface ProjectListSearch {
  /** 보기 탭: 없으면 활성, "archived"면 종료 */
  tab?: "archived";
  /** 검색어 */
  q?: string;
  /** 상태 (준비 · 진행 중 · 마무리), 쉼표로 잇는다 */
  st?: string;
  /** 담당 직원 id들, "none"은 담당 없음 */
  as?: string;
  /** 내 프로젝트 */
  mine?: "1";
  /** 의뢰: listing · buyer · none */
  in?: string;
  /** 대표 고객: set · empty */
  pc?: "set" | "empty";
  /** 시작 기간 YYYY-MM-DD */
  from?: string;
  to?: string;
  sort?: ProjectListSort;
  order?: "asc" | "desc";
}

export const PROJECT_DERIVED_STATUSES: readonly ProjectDerivedStatus[] = [
  "preparing",
  "active",
  "wrapping",
];
export const PROJECT_INTAKE_FILTERS: readonly ProjectIntakeFilter[] = ["listing", "buyer", "none"];
export const PROJECT_INTAKE_FILTER_LABELS: Record<ProjectIntakeFilter, string> = {
  listing: "매물 의뢰 있음",
  buyer: "구매 의뢰 있음",
  none: "의뢰 없음",
};
export const PROJECT_PRIMARY_FILTER_LABELS: Record<"set" | "empty", string> = {
  set: "있음",
  empty: "비어 있음",
};

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const csv = (value: unknown) =>
  typeof value === "string" && value.trim()
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

/** 주소에서 읽은 값을 믿지 않고 고른다(손으로 고친 주소 · 옛 주소). 모르는 값은 버린다. */
export function readProjectListSearch(search: Record<string, unknown>): ProjectListSearch {
  const statuses = csv(search.st).filter((value): value is ProjectDerivedStatus =>
    (PROJECT_DERIVED_STATUSES as readonly string[]).includes(value),
  );
  const intakes = csv(search.in).filter((value): value is ProjectIntakeFilter =>
    (PROJECT_INTAKE_FILTERS as readonly string[]).includes(value),
  );
  const assignees = csv(search.as).filter((value) => value === "none" || ID_PATTERN.test(value));
  const sort =
    search.sort === "updated" || search.sort === "created" || search.sort === "title"
      ? search.sort
      : undefined;
  const result: ProjectListSearch = {
    tab: search.tab === "archived" ? "archived" : undefined,
    q: typeof search.q === "string" && search.q.trim() ? search.q : undefined,
    st: statuses.length > 0 ? statuses.join(",") : undefined,
    as: assignees.length > 0 ? assignees.join(",") : undefined,
    mine: search.mine === "1" || search.mine === 1 || search.mine === true ? "1" : undefined,
    in: intakes.length > 0 ? intakes.join(",") : undefined,
    pc: search.pc === "set" || search.pc === "empty" ? search.pc : undefined,
    from: typeof search.from === "string" && DAY_PATTERN.test(search.from) ? search.from : undefined,
    to: typeof search.to === "string" && DAY_PATTERN.test(search.to) ? search.to : undefined,
    sort,
    order: search.order === "asc" || search.order === "desc" ? search.order : undefined,
  };
  return compactSearch(result);
}

/** 빈 값을 지운다(주소에 "?q=&st=" 같은 꼬리가 남지 않게). */
export function compactSearch(search: ProjectListSearch): ProjectListSearch {
  return Object.fromEntries(
    Object.entries(search).filter(([, value]) => value !== undefined && value !== ""),
  ) as ProjectListSearch;
}

/** 화면에서 다루는 조건 */
export interface ProjectListConditions {
  archived: boolean;
  search: string;
  statuses: ProjectDerivedStatus[];
  assignees: string[];
  mine: boolean;
  intakes: ProjectIntakeFilter[];
  primary: "set" | "empty" | null;
  createdFrom: string;
  createdTo: string;
  sort: ProjectListSort;
  order: "asc" | "desc";
}

export const DEFAULT_PROJECT_LIST_SORT: ProjectListSort = "updated";

/** 기준의 기본 방향: 날짜는 최근 것부터, 이름은 가나다순 */
export function defaultOrderFor(sort: ProjectListSort): "asc" | "desc" {
  return sort === "title" ? "asc" : "desc";
}

export function conditionsFromSearch(search: ProjectListSearch): ProjectListConditions {
  const sort = search.sort ?? DEFAULT_PROJECT_LIST_SORT;
  return {
    archived: search.tab === "archived",
    search: search.q ?? "",
    statuses: csv(search.st) as ProjectDerivedStatus[],
    assignees: csv(search.as),
    mine: search.mine === "1",
    intakes: csv(search.in) as ProjectIntakeFilter[],
    primary: search.pc ?? null,
    createdFrom: search.from ?? "",
    createdTo: search.to ?? "",
    sort,
    order: search.order ?? defaultOrderFor(sort),
  };
}

export function searchFromConditions(conditions: ProjectListConditions): ProjectListSearch {
  return compactSearch({
    tab: conditions.archived ? "archived" : undefined,
    q: conditions.search.trim() ? conditions.search : undefined,
    // 상태는 활성 탭에서만 뜻이 있다(종료 탭의 프로젝트는 모두 "종료").
    st: !conditions.archived && conditions.statuses.length > 0 ? conditions.statuses.join(",") : undefined,
    as: conditions.assignees.length > 0 ? conditions.assignees.join(",") : undefined,
    mine: conditions.mine ? "1" : undefined,
    in: conditions.intakes.length > 0 ? conditions.intakes.join(",") : undefined,
    pc: conditions.primary ?? undefined,
    from: conditions.createdFrom || undefined,
    to: conditions.createdTo || undefined,
    sort: conditions.sort === DEFAULT_PROJECT_LIST_SORT ? undefined : conditions.sort,
    order: conditions.order === defaultOrderFor(conditions.sort) ? undefined : conditions.order,
  });
}

/** 화면 조건 → 서버 목록 요청 (쪽 넘김 인자는 따로 붙인다) */
export function toProjectListFilter(
  conditions: ProjectListConditions,
  limit: number,
): ProjectListFilter {
  return {
    status: conditions.archived ? "archived" : "open",
    search: conditions.search.trim() || undefined,
    statuses:
      !conditions.archived && conditions.statuses.length > 0 ? conditions.statuses : undefined,
    assignedToIds: conditions.assignees.length > 0 ? conditions.assignees : undefined,
    mine: conditions.mine || undefined,
    intakes: conditions.intakes.length > 0 ? conditions.intakes : undefined,
    primary: conditions.primary ?? undefined,
    createdFrom: conditions.createdFrom || undefined,
    createdTo: conditions.createdTo || undefined,
    sort: conditions.sort,
    order: conditions.order,
    limit,
  };
}

/** 필터 줄에 걸린 알약 수 (검색어 · 보기 탭 · 정렬은 늘 보이므로 세지 않는다) */
export function countActiveProjectFilters(conditions: ProjectListConditions) {
  return (
    (conditions.mine ? 1 : 0) +
    (!conditions.archived && conditions.statuses.length > 0 ? 1 : 0) +
    (conditions.assignees.length > 0 ? 1 : 0) +
    (conditions.intakes.length > 0 ? 1 : 0) +
    (conditions.primary ? 1 : 0) +
    (conditions.createdFrom || conditions.createdTo ? 1 : 0)
  );
}

/** 필터를 모두 푼다. 보기 탭 · 정렬은 그대로 둔다. */
export function clearProjectFilters(conditions: ProjectListConditions): ProjectListConditions {
  return {
    ...conditions,
    search: "",
    statuses: [],
    assignees: [],
    mine: false,
    intakes: [],
    primary: null,
    createdFrom: "",
    createdTo: "",
  };
}

// ── 시작 기간 ─────────────────────────────────────────────────

const pad2 = (value: number) => String(value).padStart(2, "0");
export const toDay = (date: Date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** 이번 주(월요일부터 오늘까지) · 이번 달(1일부터 오늘까지). 이 PC의 날짜(한국 시각)로 센다. */
export function projectCreatedPreset(preset: "week" | "month", now: Date = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === "month") {
    return { from: toDay(new Date(today.getFullYear(), today.getMonth(), 1)), to: toDay(today) };
  }
  const weekday = (today.getDay() + 6) % 7; // 월요일 0
  const monday = new Date(today);
  monday.setDate(today.getDate() - weekday);
  return { from: toDay(monday), to: toDay(today) };
}

/** "11.1 ~ 11.22" · "11.1부터" · "11.22까지" */
export function summarizeCreatedRange(from: string, to: string, now: Date = new Date()) {
  if (!from && !to) return null;
  const week = projectCreatedPreset("week", now);
  const month = projectCreatedPreset("month", now);
  if (from === week.from && to === week.to) return "이번 주";
  if (from === month.from && to === month.to) return "이번 달";
  const short = (day: string) => {
    const [year, monthPart, date] = day.split("-").map(Number);
    return year === now.getFullYear() ? `${monthPart}.${date}` : `${year}.${monthPart}.${date}`;
  };
  if (from && to) return from === to ? short(from) : `${short(from)} ~ ${short(to)}`;
  return from ? `${short(from)}부터` : `${short(to)}까지`;
}

// ── 정렬 ───────────────────────────────────────────────────────

/** 정렬 고르기에 보이는 것. 머리글을 눌러 정렬할 수 있는 열도 이 셋뿐이다(서버가 정렬하는 것). */
export const PROJECT_LIST_SORT_CHOICES: ReadonlyArray<{
  sort: ProjectListSort;
  order: "asc" | "desc";
  label: string;
}> = [
  { sort: "updated", order: "desc", label: "최근 고친 순" },
  { sort: "updated", order: "asc", label: "오래전에 고친 순" },
  { sort: "created", order: "desc", label: "최근 시작한 순" },
  { sort: "created", order: "asc", label: "먼저 시작한 순" },
  { sort: "title", order: "asc", label: "이름 가나다순" },
  { sort: "title", order: "desc", label: "이름 역순" },
];

/** 정렬 기준 ↔ 표의 열 id */
export const PROJECT_SORT_COLUMN: Record<ProjectListSort, string> = {
  updated: "updatedAt",
  created: "createdAt",
  title: "title",
};

export function sortFromColumn(columnId: string): ProjectListSort | null {
  const entry = Object.entries(PROJECT_SORT_COLUMN).find(([, id]) => id === columnId);
  return entry ? (entry[0] as ProjectListSort) : null;
}

// ── 표 설정 (열 보이기 · 순서 · 너비) ─────────────────────────────

export const PROJECT_TABLE_COLUMNS: ReadonlyArray<{
  id: string;
  label: string;
  /**
   * 기준 열: 숨기거나 옮길 수 없고 맨 앞에 이 순서로 선다. 표에서는 고정 열이라 가로로 넘겨도 제자리다
   * (매물관리 표의 거래 ~ 공급 고정 열과 같다).
   */
  fixed?: boolean;
  /** 처음에는 숨겨 둔다 */
  hiddenByDefault?: boolean;
}> = [
  // 진행 열("0/6 다음: …")은 뺐다 (사용자 의견 2026-11-22). 단계 진행은 옆 패널과 상세에서 본다.
  // 예전에 기억해 둔 순서 · 너비에 남은 "progress"는 normalizeProjectTableSettings가 버린다.
  { id: "customer", label: "고객", fixed: true },
  { id: "title", label: "프로젝트", fixed: true },
  { id: "status", label: "상태" },
  { id: "intakes", label: "의뢰" },
  { id: "latestComment", label: "최근 코멘트" },
  { id: "assignee", label: "담당" },
  { id: "createdAt", label: "시작" },
  { id: "updatedAt", label: "최근 고침", hiddenByDefault: true },
];

/** 기준 열(= 표의 고정 열) id, 앞에서부터 */
export const PROJECT_FIXED_COLUMN_IDS: readonly string[] = PROJECT_TABLE_COLUMNS.filter(
  (column) => column.fixed,
).map((column) => column.id);

export interface ProjectTableSettings {
  /** 숨긴 열 id */
  hidden: string[];
  /** 열 순서(id). 모르는 id는 버리고, 새로 생긴 열은 기본 자리 뒤에 붙인다 */
  order: string[];
  /** 열 너비(px) */
  sizing: Record<string, number>;
}

export const DEFAULT_PROJECT_TABLE_SETTINGS: ProjectTableSettings = {
  hidden: PROJECT_TABLE_COLUMNS.filter((column) => column.hiddenByDefault).map((column) => column.id),
  order: PROJECT_TABLE_COLUMNS.map((column) => column.id),
  sizing: {},
};

/** 사용자 · 사무소별로 기억한다(매물관리의 열 기억과 같은 규칙의 이름). 로그인 정보가 없으면 기억하지 않는다. */
export function projectTableSettingsKey(user: { id: string; office?: { id: string } | null } | null | undefined) {
  return user ? `estate:project-list:table:v1:${user.office?.id ?? "none"}:${user.id}` : null;
}

/** 저장해 둔 설정을 믿지 않고 고른다(옛 열 · 지운 열). */
export function normalizeProjectTableSettings(raw: unknown): ProjectTableSettings {
  const known = new Set(PROJECT_TABLE_COLUMNS.map((column) => column.id));
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<ProjectTableSettings>;
  const hidden = Array.isArray(value.hidden)
    ? value.hidden.filter(
        (id): id is string =>
          typeof id === "string" &&
          known.has(id) &&
          !PROJECT_TABLE_COLUMNS.find((column) => column.id === id)?.fixed,
      )
    : DEFAULT_PROJECT_TABLE_SETTINGS.hidden;
  const savedOrder = Array.isArray(value.order)
    ? value.order.filter((id): id is string => typeof id === "string" && known.has(id))
    : [];
  // 기준 열은 저장한 순서와 상관없이 맨 앞(고정 열)에 선다.
  const fixedIds = PROJECT_FIXED_COLUMN_IDS;
  const order = [
    ...new Set([
      ...fixedIds,
      ...savedOrder.filter((id) => !fixedIds.includes(id)),
      ...PROJECT_TABLE_COLUMNS.map((column) => column.id).filter((id) => !savedOrder.includes(id)),
    ]),
  ];
  const sizing: Record<string, number> = {};
  if (value.sizing && typeof value.sizing === "object") {
    for (const [id, width] of Object.entries(value.sizing)) {
      if (known.has(id) && typeof width === "number" && Number.isFinite(width) && width >= 48 && width <= 960) {
        sizing[id] = Math.round(width);
      }
    }
  }
  return { hidden, order, sizing };
}

/** 열 하나를 앞(-1)이나 뒤(+1)로 한 칸 옮긴다. 기준 열(고객 · 프로젝트)은 맨 앞에 고정이다. */
export function moveProjectColumn(order: readonly string[], id: string, direction: -1 | 1) {
  const fixed = PROJECT_FIXED_COLUMN_IDS;
  const index = order.indexOf(id);
  const target = index + direction;
  if (index < 0 || fixed.includes(id) || target < 0 || target >= order.length) return [...order];
  if (fixed.includes(order[target] as string)) return [...order];
  const next = [...order];
  next.splice(index, 1);
  next.splice(target, 0, id);
  return next;
}

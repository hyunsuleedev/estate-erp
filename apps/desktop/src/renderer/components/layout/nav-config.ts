import {
  BookUser,
  Building2,
  CalendarDays,
  FileText,
  GitBranch,
  Handshake,
  LayoutDashboard,
  ListTodo,
  Map,
  Megaphone,
  MessageSquare,
  Settings,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

/**
 * 앱 셸 IA 단일 소스.
 * - 사이드바 그룹/항목 (DESIGN_SPEC.md 7장)
 * - 브레드크럼 라벨 맵 (routes/_authenticated 전수)
 * 페이지 에이전트는 이 파일을 수정하지 말 것 (foundation 소관).
 */

export type NavRole = "owner" | "manager" | "agent";

export type NavGroupKey =
  | "start"
  | "properties"
  | "customers"
  | "transactions"
  | "operations";

export interface NavChildItem {
  path: string;
  label: string;
  /** 사이드바에서 진입할 때 상세 검색 파라미터를 버리고 목록 루트로 이동 */
  resetSearch?: boolean;
  /** 지정 시 해당 role만 노출. 미지정 = 전체 노출 */
  roles?: NavRole[];
}

export interface NavItem {
  path: string;
  label: string;
  icon: LucideIcon;
  group: NavGroupKey;
  /** 지정 시 해당 role만 노출. 미지정 = 전체 노출 */
  roles?: NavRole[];
  children?: NavChildItem[];
}

export const NAV_GROUPS: {
  key: NavGroupKey;
  label: string;
}[] = [
  { key: "start", label: "시작" },
  { key: "properties", label: "매물·공간" },
  { key: "customers", label: "고객·상담" },
  { key: "transactions", label: "거래·계약" },
  { key: "operations", label: "업무·운영" },
];

export const NAV_ITEMS: NavItem[] = [
  // ── 시작
  {
    path: "/dashboard",
    label: "대시보드",
    icon: LayoutDashboard,
    group: "start",
  },

  // ── 매물·공간
  {
    path: "/properties",
    label: "매물관리",
    icon: Building2,
    group: "properties",
  },
  { path: "/sites", label: "관리단지", icon: Map, group: "properties" },
  {
    path: "/properties/external-listings",
    label: "광고관리",
    icon: Megaphone,
    group: "properties",
    children: [
      { path: "/properties/external-listings", label: "광고노트" },
      { path: "/properties/naver-my-ads", label: "내광고관리" },
    ],
  },

  // ── 고객·상담
  { path: "/customers", label: "고객 원장", icon: Users, group: "customers" },
  { path: "/contacts", label: "연락처", icon: BookUser, group: "customers" },
  {
    path: "/consultations",
    label: "상담기록",
    icon: MessageSquare,
    group: "customers",
  },
  // 통화 관리는 현재 사이드바에서 제외 — 기존 라우트와 데이터는 유지한다.

  // ── 거래·계약
  { path: "/matches", label: "매칭", icon: GitBranch, group: "transactions" },
  { path: "/deals", label: "거래관리", icon: Handshake, group: "transactions" },
  {
    path: "/contracts",
    label: "계약서 관리",
    icon: FileText,
    group: "transactions",
  },
  {
    path: "/cashflow",
    label: "수수료/정산",
    icon: Wallet,
    group: "transactions",
    children: [
      { path: "/cashflow", label: "캐시플로우", roles: ["owner", "manager"] },
      {
        path: "/cashflow/ledger",
        label: "수금 원장",
        roles: ["owner", "manager"],
      },
      {
        path: "/cashflow/partner-commissions",
        label: "공동중개 수수료",
        roles: ["owner", "manager"],
      },
      {
        path: "/cashflow/employee-settlements",
        label: "직원 정산",
        roles: ["owner", "manager"],
      },
      { path: "/cashflow/my-settlement", label: "내 수수료" },
      {
        path: "/cashflow/expenses",
        label: "고정비 설정",
        roles: ["owner", "manager"],
      },
    ],
  },

  // ── 업무·운영
  { path: "/tasks", label: "업무", icon: ListTodo, group: "operations" },
  {
    path: "/calendar",
    label: "캘린더",
    icon: CalendarDays,
    group: "operations",
  },
  {
    path: "/employees",
    label: "직원관리",
    icon: Users,
    group: "operations",
    roles: ["owner", "manager"],
  },
  // 네트워크·협력업체 찾기·자료실은 현재 사이드바에서 제외 — 기존 라우트와 데이터는 유지한다.
  { path: "/settings", label: "설정", icon: Settings, group: "operations" },
];

/** active 하이라이트 prefix 충돌 제거용 — 모든 네비 경로 (item + children) */
export const ALL_NAV_PATHS: string[] = [
  ...NAV_ITEMS.map((item) => item.path),
  ...NAV_ITEMS.flatMap((item) => item.children?.map((c) => c.path) ?? []),
];

export interface NavGroupWithItems {
  key: NavGroupKey;
  label: string;
  items: NavItem[];
}

/** role 기준으로 필터링된 사이드바 그룹 목록. 빈 그룹은 제외. */
export function getNavGroups(role?: string): NavGroupWithItems[] {
  const visible = (roles?: NavRole[]) =>
    !roles || (!!role && roles.includes(role as NavRole));

  return NAV_GROUPS.map((group) => ({
    ...group,
    items: NAV_ITEMS.filter(
      (item) => item.group === group.key && visible(item.roles),
    )
      .map((item) => {
        if (!item.children) return item;
        const children = item.children.filter((child) => visible(child.roles));
        return { ...item, children, path: children[0]?.path ?? item.path };
      })
      .filter((item) => !item.children || item.children.length > 0),
  })).filter((group) => group.items.length > 0);
}

// ─────────────────────────────────────────────────────────────
// 브레드크럼 라벨 맵 — routes/_authenticated 아래 실존 라우트 전수
// (라우트 추가 시 여기에 routeId: 라벨 추가. 누락 시 네비 항목 라벨 fallback)
// ─────────────────────────────────────────────────────────────

export const ROUTE_LABELS: Record<string, string> = {
  // 홈
  "/_authenticated/dashboard": "대시보드",
  "/_authenticated/tasks/": "업무",
  "/_authenticated/calendar/": "캘린더",
  // 매물
  "/_authenticated/properties/": "매물 목록",
  "/_authenticated/properties/$id": "매물 상세",
  "/_authenticated/properties/new": "매물 등록",
  "/_authenticated/properties/external-listings": "광고노트",
  "/_authenticated/properties/naver-my-ads": "내광고관리",
  "/_authenticated/sites/": "관리단지",
  // 고객
  "/_authenticated/customers/": "고객 원장",
  "/_authenticated/customers-table/": "고객 원장 표 보기",
  "/_authenticated/contacts/": "연락처",
  "/_authenticated/contacts/$id": "연락처 상세",
  "/_authenticated/contacts/new": "연락처 추가",
  "/_authenticated/consultations/": "상담기록",
  "/_authenticated/calls/": "통화 관리",
  // 거래
  "/_authenticated/matches/": "매칭",
  "/_authenticated/deals/": "거래관리",
  "/_authenticated/contracts/": "계약서 관리",
  "/_authenticated/cashflow/": "수수료/정산",
  "/_authenticated/cashflow/ledger": "수금 원장",
  "/_authenticated/cashflow/partner-commissions": "공동중개 수수료",
  "/_authenticated/cashflow/employee-settlements": "직원 정산",
  "/_authenticated/cashflow/my-settlement": "내 수수료",
  "/_authenticated/cashflow/expenses": "고정비 설정",
  // 네트워크
  "/_authenticated/network/": "네트워크",
  "/_authenticated/partner-brokers/": "파트너 중개사",
  // 운영
  "/_authenticated/employees/": "직원관리",
  "/_authenticated/service-vendors/": "협력업체 찾기",
  "/_authenticated/documents/": "자료실",
  "/_authenticated/documents/photos": "사진 자료",
  "/_authenticated/settings/": "설정",
  // 기타 (인증 셸 밖이지만 라벨 일관성 위해 포함)
  "/onboarding/office": "사무소 설정",
};

export interface BreadcrumbEntry {
  label: string;
  /** 있으면 링크, 없으면 텍스트 (그룹 라벨 등) */
  to?: string;
}

interface FlatNavEntry {
  path: string;
  label: string;
  groupLabel: string;
  parent?: { path: string; label: string };
}

let flatNavCache: FlatNavEntry[] | null = null;

function flattenNav(): FlatNavEntry[] {
  if (flatNavCache) return flatNavCache;
  const groupLabelOf = (key: NavGroupKey) =>
    NAV_GROUPS.find((g) => g.key === key)?.label ?? "";
  const entries: FlatNavEntry[] = [];
  // 부모 항목을 먼저 — 동일 길이 경로 충돌 시(예: /cashflow) 부모 우선
  for (const item of NAV_ITEMS) {
    entries.push({
      path: item.path,
      label: item.label,
      groupLabel: groupLabelOf(item.group),
    });
  }
  for (const item of NAV_ITEMS) {
    for (const child of item.children ?? []) {
      entries.push({
        path: child.path,
        label: child.label,
        groupLabel: groupLabelOf(item.group),
        parent: { path: item.path, label: item.label },
      });
    }
  }
  flatNavCache = entries;
  return entries;
}

/**
 * 현재 라우트의 브레드크럼 체인 derive: 그룹 > (상위 메뉴) > 페이지.
 * ROUTE_LABELS에 없는 라우트는 가장 가까운 네비 항목 라벨 → 그룹 라벨 순 fallback.
 */
export function getBreadcrumb(
  routeId: string,
  pathname: string,
): BreadcrumbEntry[] {
  const entries = flattenNav();
  let best: FlatNavEntry | undefined;
  for (const entry of entries) {
    if (pathname === entry.path || pathname.startsWith(`${entry.path}/`)) {
      if (!best || entry.path.length > best.path.length) best = entry;
    }
  }

  const pageLabel =
    ROUTE_LABELS[routeId] ?? best?.label ?? best?.groupLabel ?? "";
  if (!pageLabel) return [];

  const crumbs: BreadcrumbEntry[] = [];
  if (best) crumbs.push({ label: best.groupLabel });
  if (best?.parent && best.parent.label !== pageLabel) {
    crumbs.push({ label: best.parent.label, to: best.parent.path });
  }
  if (best && best.label !== pageLabel) {
    crumbs.push({ label: best.label, to: best.path });
  }
  crumbs.push({ label: pageLabel });
  return crumbs;
}

import type { Tab } from '@estate-erp/shared';

const PROPERTY_STATIC_SEGMENTS = new Set([
  'new',
  'external-listings',
  'my-ads',
  'naver-my-ads',
]);

/**
 * 어떤 화면을 탭별 웹 화면(native WebContentsView)으로 띄울지 정한다.
 * - 'all': 로그인 뒤의 앱 화면 전부. 탭을 옮기거나 분리해도 다시 로드하지 않는다.
 * - 'property-detail': 첫 파일럿 범위(매물 상세만). 문제가 생기면 이 값으로 되돌린다.
 */
export type NativeTabScope = 'all' | 'property-detail';
export const NATIVE_TAB_SCOPE: NativeTabScope = 'all';

/** 로그인 전·온보딩·개발용 화면은 셸 창이 직접 그린다. */
const NON_APP_PATHNAMES = new Set(['/', '/login', '/register']);
const NON_APP_PATH_PREFIXES = ['/onboarding/', '/dev/'];

export type NativeTabRouteDescriptor =
  | {
      kind: 'property-detail';
      entityId: string;
      pathname: string;
      href: string;
    }
  | {
      kind: 'app-route';
      pathname: string;
      href: string;
    };

export interface NativeTabViewportBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface NativeTabViewportPayload {
  schemaVersion: 1;
  /** renderer mount lease. StrictMode의 stale cleanup을 main이 무시하는 기준이다. */
  leaseId: string;
  /** host가 닫힌 native views를 명시적으로 정리할 수 있는 현재 workspace 투영 */
  nativeTabIds: string[];
  /** renderer가 만든 원본 metadata를 유지한다. main은 runtime validation을 다시 한다. */
  activeTab: Tab | null;
  bounds: NativeTabViewportBounds;
}

export interface NativeTabViewportReleasePayload {
  schemaVersion: 1;
  leaseId: string;
  nativeTabIds: string[];
}

export type NativeTabViewportResult =
  | { ok: true; mountedTabId: string | null }
  | { ok: false; error: string };

export interface NativeTabStateUpdate {
  tabId: string;
  route: string;
  title?: string;
}

export interface NativeTabLifecycleUpdate {
  tabId: string;
  status: 'renderer-failed';
}

/** 미리 띄워 둔 예비 탭 화면의 자리표시 탭 id. 실제 탭은 나중에 맡긴다. */
export const NATIVE_SPARE_TAB_ID_PREFIX = 'spare-';

/** 예비 탭 화면에 맡기는 실제 탭. */
export interface NativeTabAssignment {
  tab: Tab;
}

/** 셸(탭바)이 바꾼 탭 주소를 이미 떠 있는 탭 화면 안에서 다시 로드하지 않고 이동시킨다. */
export interface NativeTabNavigateCommand {
  route: string;
}

/** 창 단위 사이드바 펼침 상태. 셸이 정하고 그 창의 모든 탭 화면이 따른다. */
export interface NativeSidebarState {
  open: boolean;
}

/**
 * Native renderer가 main-process LRU에 전달하는 보존 신호다.
 * 활성 탭과 이동 중인 탭은 main이 자체적으로 보호하고, renderer만 알 수 있는
 * mutation/편집 UI 상태만 이 계약으로 보완한다.
 */
export interface NativeTabRetentionUpdate {
  schemaVersion: 1;
  protected: boolean;
  /** Best-effort, JSON-safe view state restored after an LRU renderer discard. */
  viewState?: {
    scrollY?: number;
  };
  reasons: {
    mutating: boolean;
    transientEditor: boolean;
    explicitDirty: boolean;
  };
}

function getPathname(href: string): string {
  const queryIndex = href.indexOf('?');
  const hashIndex = href.indexOf('#');
  const cutAt = [queryIndex, hashIndex]
    .filter((index) => index >= 0)
    .reduce((minimum, index) => Math.min(minimum, index), href.length);
  const pathname = href.slice(0, cutAt) || '/';
  return pathname === '/' ? pathname : pathname.replace(/\/+$/, '') || '/';
}

function decodeRoutePart(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function resolvePropertyDetailRoute(
  href: string,
  pathname: string,
): NativeTabRouteDescriptor | null {
  const match = pathname.match(/^\/properties\/([^/]+)$/);
  if (!match) return null;

  const entityId = decodeRoutePart(match[1]);
  if (!entityId || PROPERTY_STATIC_SEGMENTS.has(entityId)) return null;

  return {
    kind: 'property-detail',
    entityId,
    pathname,
    href,
  };
}

function isAppPathname(pathname: string): boolean {
  if (!pathname.startsWith('/') || NON_APP_PATHNAMES.has(pathname)) return false;
  return !NON_APP_PATH_PREFIXES.some(
    (prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix),
  );
}

/**
 * 탭별 웹 화면으로 띄울 route인지 판별한다.
 * 'all' 범위에서는 로그인 뒤의 앱 화면 전부, 파일럿 범위에서는 매물 상세만이다.
 */
export function resolveNativeTabRoute(
  href: string,
  scope: NativeTabScope = NATIVE_TAB_SCOPE,
): NativeTabRouteDescriptor | null {
  if (!href.startsWith('/') || href.startsWith('//')) return null;
  const pathname = getPathname(href);
  const propertyDetail = resolvePropertyDetailRoute(href, pathname);
  if (propertyDetail || scope === 'property-detail') return propertyDetail;
  if (!isAppPathname(pathname)) return null;
  return { kind: 'app-route', pathname, href };
}

export function isNativeTabRoute(href: string): boolean {
  return resolveNativeTabRoute(href) !== null;
}

/** DOMRect(CSS px)를 Electron View bounds(DIP)로 안정적으로 정수화한다. */
export function normalizeNativeTabViewportBounds(
  rect: { left: number; top: number; width: number; height: number },
): NativeTabViewportBounds {
  return {
    x: Math.max(0, Math.round(rect.left)),
    y: Math.max(0, Math.round(rect.top)),
    width: Math.max(0, Math.round(rect.width)),
    height: Math.max(0, Math.round(rect.height)),
  };
}

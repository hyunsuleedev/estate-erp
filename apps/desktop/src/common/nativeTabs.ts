import type { Tab } from '@estate-erp/shared';
import { MAX_INTERNAL_ROUTE_LENGTH, isInternalRoute } from './internalRoute';

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
// 탭바 문서(/tabbar.html)는 창 자체의 화면이다. 탭 화면에 띄우는 앱 화면이 아니다.
const NON_APP_PATHNAMES = new Set(['/', '/login', '/register', '/tabbar.html']);
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

/** 미리 띄워 둔 예비 탭 화면의 자리표시 탭 id. 실제 탭은 나중에 맡긴다. */
export const NATIVE_SPARE_TAB_ID_PREFIX = 'spare-';

/** 예비 탭 화면에 맡기는 실제 탭. */
export interface NativeTabAssignment {
  tab: Tab;
}

/** 탭 목록이 바꾼 탭 주소를 이미 떠 있는 탭 화면 안에서 다시 로드하지 않고 이동시킨다. */
export interface NativeTabNavigateCommand {
  route: string;
}

/** 창 단위 사이드바 펼침 상태. main이 갖고 그 창의 모든 탭 화면이 따른다. */
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
  // 문서 파일(tabbar.html, 대소문자를 가리지 않는 파일 시스템의 TABBAR.HTML 등)은 앱 화면이 아니다.
  if (/\.html?$/i.test(pathname)) return false;
  return !NON_APP_PATH_PREFIXES.some(
    (prefix) => pathname === prefix.slice(0, -1) || pathname.startsWith(prefix),
  );
}

function resolveRouteShape(
  href: string,
  scope: NativeTabScope,
  maxLength: number,
): NativeTabRouteDescriptor | null {
  // 다른 호스트로 해석될 수 있는 모양(`//host`, `/\\host`, 제어 문자)은 앱 주소가 아니다.
  if (!isInternalRoute(href, maxLength)) return null;
  const pathname = getPathname(href);
  const propertyDetail = resolvePropertyDetailRoute(href, pathname);
  if (propertyDetail || scope === 'property-detail') return propertyDetail;
  if (!isAppPathname(pathname)) return null;
  return { kind: 'app-route', pathname, href };
}

/**
 * 탭별 웹 화면으로 띄울 route인지 판별한다.
 * 'all' 범위에서는 로그인 뒤의 앱 화면 전부, 파일럿 범위에서는 매물 상세만이다.
 * 길이 한도는 탭 목록(main)과 같다: 한쪽만 받아들이면 둘이 아는 주소가 어긋난다.
 */
export function resolveNativeTabRoute(
  href: string,
  scope: NativeTabScope = NATIVE_TAB_SCOPE,
): NativeTabRouteDescriptor | null {
  return resolveRouteShape(href, scope, MAX_INTERNAL_ROUTE_LENGTH);
}

export function isNativeTabRoute(href: string): boolean {
  return resolveNativeTabRoute(href) !== null;
}

/**
 * 탭으로 열 수 있는 주소인지: 앱 안의 주소이고, 한도 안이고, 로그인 뒤의 앱 화면이다.
 * 로그인·가입·온보딩·개발용 화면과 문서 파일(/tabbar.html)은 탭이 될 수 없다.
 * 탭을 만들거나 옮기는 모든 입구(탭 목록, 탭 화면의 요청, 메인 창에서 열기)가 이것으로 가린다.
 */
export function isTabScreenRoute(value: unknown): value is string {
  return typeof value === 'string' && resolveTabScreenRoute(value) !== null;
}

/**
 * main이 쓰는 판별: 탭 화면으로 띄울 수 있는 주소와 그 종류. main에서는 모든 탭이 탭
 * 화면이므로 파일럿 범위 스위치(NATIVE_TAB_SCOPE)와 무관하게 앱 화면 전부를 본다.
 */
export function resolveTabScreenRoute(href: string): NativeTabRouteDescriptor | null {
  return resolveRouteShape(href, 'all', MAX_INTERNAL_ROUTE_LENGTH);
}

/**
 * 앱 화면의 주소이지만 한도보다 긴 경우(검색 조건이 아주 긴 목록 등). 탭 화면은 그 주소에
 * 그대로 두되 main은 기록하지 않는다.
 */
export function isOverlongTabScreenRoute(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > MAX_INTERNAL_ROUTE_LENGTH &&
    resolveRouteShape(value, 'all', Number.MAX_SAFE_INTEGER) !== null
  );
}


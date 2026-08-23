import type { Tab } from '@estate-erp/shared';

const PROPERTY_STATIC_SEGMENTS = new Set([
  'new',
  'external-listings',
  'my-ads',
  'naver-my-ads',
]);

export interface NativeTabRouteDescriptor {
  kind: 'property-detail';
  entityId: string;
  pathname: string;
  href: string;
}

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

/**
 * 첫 파일럿은 읽기 중심의 매물 상세 한 종류만 native WebContents 탭으로 승격한다.
 * 목록/신규/광고 하위 화면은 기존 SPA 렌더러에 남겨 회귀 범위를 제한한다.
 */
export function resolveNativeTabRoute(
  href: string,
): NativeTabRouteDescriptor | null {
  const pathname = getPathname(href);
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

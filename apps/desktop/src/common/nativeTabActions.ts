import type { JsonValue, TabKind } from '@estate-erp/shared';
import { MAX_INTERNAL_ROUTE_LENGTH } from './internalRoute';
import { isTabScreenRoute } from './nativeTabs';

/**
 * 탭별 웹 화면(native 탭)이 자기 창의 탭바(셸 renderer)에 요청하는 탭 작업.
 *
 * 탭 목록의 주인은 셸이다. native 탭 화면 안의 페이지가 "새 탭으로 열기",
 * "저장 후 이 탭을 상세로 바꾸기", "이 탭 닫기"를 하면 그 요청을 main을 거쳐
 * 셸에 보내고, 셸이 자기 탭 목록에 반영한다. 자기 탭(`tabId`)은 main이
 * 보낸 쪽 WebContents로 정하므로 요청에 다른 탭 id를 실을 수 없다.
 */
export interface NativeTabRouteInput {
  route: string;
  kind?: TabKind;
  title: string;
  routeParams?: Record<string, JsonValue>;
}

export type NativeTabAction =
  | {
      type: 'create-tab';
      input: NativeTabRouteInput & {
        activate?: boolean;
        resourceKey?: string | null;
      };
    }
  | {
      type: 'open-resource';
      input: NativeTabRouteInput & { activate?: boolean; resourceKey: string };
    }
  | { type: 'open-module'; input: NativeTabRouteInput & { activate?: boolean } }
  | { type: 'replace-resource'; input: NativeTabRouteInput & { resourceKey: string } }
  /** 사이드바 메뉴: 이 탭을 목적지로 옮긴다(저장 전 입력이 있으면 새 탭). */
  | { type: 'navigate'; input: NativeTabRouteInput }
  /** 탭 화면 안의 링크가 다른 업무로 가려 할 때: 이 탭은 두고 다른 탭으로 연다. */
  | { type: 'adopt-location'; route: string }
  | { type: 'close' }
  | { type: 'update-title'; title: string }
  | { type: 'update-form-draft'; key: string; value: JsonValue }
  | { type: 'clear-form-draft' };

export interface NativeTabActionEnvelope {
  tabId: string;
  action: NativeTabAction;
}

export const NATIVE_TAB_ACTION_LIMITS = {
  route: MAX_INTERNAL_ROUTE_LENGTH,
  title: 500,
  resourceKey: 1_024,
  draftKey: 200,
  jsonNodes: 10_000,
  jsonDepth: 20,
} as const;

const TAB_KINDS = new Set<TabKind>([
  'home',
  'property',
  'contact',
  'consultation',
  'deal',
  'match',
  'task',
  'calendar',
  'site',
  'contract',
  'cashflow',
  'employee',
  'settings',
  'dashboard',
  'generic',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedJson(
  value: unknown,
  budget = { nodes: 0 },
  depth = 0,
  seen = new Set<object>(),
): value is JsonValue {
  budget.nodes += 1;
  if (
    budget.nodes > NATIVE_TAB_ACTION_LIMITS.jsonNodes ||
    depth > NATIVE_TAB_ACTION_LIMITS.jsonDepth
  ) {
    return false;
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || seen.has(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    return false;
  }
  seen.add(value);
  const children = Array.isArray(value) ? value : Object.values(value);
  const valid = children.every((child) =>
    isBoundedJson(child, budget, depth + 1, seen),
  );
  seen.delete(value);
  return valid;
}

/** 탭 화면이 요청할 수 있는 주소는 탭으로 열 수 있는 앱 화면뿐이다(로그인·온보딩·문서 파일 제외). */
function isAppRoute(value: unknown): value is string {
  return isTabScreenRoute(value);
}

function isTitle(value: unknown): value is string {
  return typeof value === 'string' && value.length <= NATIVE_TAB_ACTION_LIMITS.title;
}

function isResourceKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= NATIVE_TAB_ACTION_LIMITS.resourceKey
  );
}

function parseRouteInput(value: unknown): NativeTabRouteInput | null {
  if (!isRecord(value) || !isAppRoute(value.route) || !isTitle(value.title)) {
    return null;
  }
  if (value.kind !== undefined && !TAB_KINDS.has(value.kind as TabKind)) {
    return null;
  }
  if (
    value.routeParams !== undefined &&
    !(isRecord(value.routeParams) && isBoundedJson(value.routeParams))
  ) {
    return null;
  }
  return {
    route: value.route,
    title: value.title,
    ...(value.kind !== undefined ? { kind: value.kind as TabKind } : {}),
    ...(value.routeParams !== undefined
      ? { routeParams: value.routeParams as Record<string, JsonValue> }
      : {}),
  };
}

function optionalActivate(value: Record<string, unknown>): { activate?: boolean } | null {
  if (value.activate === undefined) return {};
  return typeof value.activate === 'boolean' ? { activate: value.activate } : null;
}

/**
 * IPC로 들어온 값을 신뢰하지 않고 알려진 작업 모양만 통과시킨다.
 * 모르는 필드는 버리고, 모양이 틀리면 null이다.
 */
export function parseNativeTabAction(value: unknown): NativeTabAction | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  switch (value.type) {
    case 'create-tab': {
      if (!isRecord(value.input)) return null;
      const input = parseRouteInput(value.input);
      const activate = optionalActivate(value.input);
      const resourceKey = value.input.resourceKey;
      if (!input || !activate) return null;
      if (resourceKey !== undefined && resourceKey !== null && !isResourceKey(resourceKey)) {
        return null;
      }
      return {
        type: 'create-tab',
        input: {
          ...input,
          ...activate,
          ...(resourceKey !== undefined ? { resourceKey } : {}),
        },
      };
    }
    case 'open-resource': {
      if (!isRecord(value.input)) return null;
      const input = parseRouteInput(value.input);
      const activate = optionalActivate(value.input);
      if (!input || !activate || !isResourceKey(value.input.resourceKey)) return null;
      return {
        type: 'open-resource',
        input: { ...input, ...activate, resourceKey: value.input.resourceKey },
      };
    }
    case 'open-module': {
      if (!isRecord(value.input)) return null;
      const input = parseRouteInput(value.input);
      const activate = optionalActivate(value.input);
      if (!input || !activate) return null;
      return { type: 'open-module', input: { ...input, ...activate } };
    }
    case 'replace-resource': {
      if (!isRecord(value.input)) return null;
      const input = parseRouteInput(value.input);
      if (!input || !isResourceKey(value.input.resourceKey)) return null;
      return {
        type: 'replace-resource',
        input: { ...input, resourceKey: value.input.resourceKey },
      };
    }
    case 'navigate': {
      const input = parseRouteInput(value.input);
      return input ? { type: 'navigate', input } : null;
    }
    case 'adopt-location':
      return isAppRoute(value.route)
        ? { type: 'adopt-location', route: value.route }
        : null;
    case 'close':
      return { type: 'close' };
    case 'update-title':
      return isTitle(value.title) ? { type: 'update-title', title: value.title } : null;
    case 'update-form-draft':
      return typeof value.key === 'string' &&
        value.key.length > 0 &&
        value.key.length <= NATIVE_TAB_ACTION_LIMITS.draftKey &&
        isBoundedJson(value.value)
        ? { type: 'update-form-draft', key: value.key, value: value.value }
        : null;
    case 'clear-form-draft':
      return { type: 'clear-form-draft' };
    default:
      return null;
  }
}

import type {
  JsonValue,
  Tab,
  TabId,
  TabKind,
} from '@estate-erp/shared';
import { getRouteMetaCore } from './routeMeta';
import { resolveTabResourceKey, tabResourceKeys } from './tabResource';

/**
 * 창 하나의 탭 목록 규칙. Electron·React·zustand에 의존하지 않는 순수 함수다.
 *
 * `useTabStore`의 각 메서드와 한 줄씩 대응한다. 함수는 상태를 바꾸지 않고
 * "바뀐 필드(patch)와 결과"를 돌려준다. patch가 null이면 아무것도 바꾸지 않은
 * 것이다(원래 store가 `set`을 부르지 않던 경우와 같다).
 *
 * 쓰는 곳:
 * - 화면의 `useTabStore`: 연결 단계에서 이 함수들을 얇게 감싼다(tabStoreBindings.ts).
 * - main의 탭 목록(src/main/tabs/tabRegistry.ts)과 브라우저 미리보기.
 */

export interface CreateTabInput {
  route: string;
  kind?: TabKind;
  title: string;
  routeParams?: Record<string, JsonValue>;
  activate?: boolean;
  /** null이면 route를 분류하지 않고 이 탭만의 launcher identity를 쓴다. */
  resourceKey?: string | null;
}

export interface OpenResourceTabInput extends Omit<CreateTabInput, 'resourceKey'> {
  resourceKey: string;
}

export interface ReplaceTabResourceInput
  extends Omit<CreateTabInput, 'activate' | 'resourceKey'> {
  resourceKey: string;
}

export type NavigateTabInput = Omit<CreateTabInput, 'activate' | 'resourceKey'>;

export interface NavigateTabOptions {
  /** 화면이 저장 전 편집 상태를 보고했으면 원본 탭을 덮어쓰지 않는다. */
  preserveSource?: boolean;
}

/** 탭 하나가 보여주는 화면. 뒤로/앞으로 기록의 한 칸이다. */
export interface TabLocation {
  route: string;
  title: string;
  kind: TabKind;
  resourceKey: string;
  routeParams?: Record<string, JsonValue>;
}

export type RestoreTabLocationResult =
  | { status: 'navigated'; tabId: TabId }
  /** 같은 업무가 다른 탭에 이미 열려 있어 그 탭을 보여줬다. */
  | { status: 'revealed'; tabId: TabId }
  /** 저장 전 입력 초안이 있어 다른 업무로 옮기지 않았다. 초안은 그대로다. */
  | { status: 'blocked'; tabId: TabId }
  | { status: 'ignored'; tabId: TabId };

/** 한 번의 닫기 동작으로 닫힌 탭들. "다른 탭 닫기"는 여러 탭이 한 묶음이다. */
export interface ClosedTabGroup {
  tabs: Array<{ tab: Tab; index: number }>;
  closedAt: number;
}

export const RECENTLY_CLOSED_TAB_LIMIT = 20;

export interface ReopenedTab {
  /** 닫히기 전 id. 방문 기록을 이어 붙일 때 쓴다. */
  previousTabId: TabId;
  tabId: TabId;
  /** 이미 다른 탭에 같은 업무가 열려 있어 새로 만들지 않고 그 탭을 보여줬다. */
  revealed: boolean;
}

export interface TabWorkspaceState {
  tabs: Tab[];
  activeTabId: TabId | null;
  /** 최근에 닫은 탭 묶음. 앞쪽이 가장 최근이다. */
  recentlyClosedTabs: ClosedTabGroup[];
}

/** 새 id와 현재 시각. 테스트와 main은 정해진 값을 넣을 수 있다. */
export interface TabWorkspaceEnv {
  newId(): TabId;
  now(): number;
}

export const defaultTabWorkspaceEnv: TabWorkspaceEnv = {
  newId() {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  },
  now: () => Date.now(),
};

/** 한 동작의 결과. patch가 null이면 상태를 바꾸지 않았다. */
export interface TabStep<R> {
  patch: Partial<TabWorkspaceState> | null;
  result: R;
}

export function createEmptyTabWorkspace(): TabWorkspaceState {
  return {
    tabs: [],
    activeTabId: null,
    recentlyClosedTabs: [],
  };
}

/** patch를 적용한 새 상태. 바뀐 것이 없으면 같은 객체를 돌려준다. */
export function applyTabStep<R>(
  state: TabWorkspaceState,
  step: TabStep<R>,
): TabWorkspaceState {
  return step.patch ? { ...state, ...step.patch } : state;
}

function unchanged<R>(result: R): TabStep<R> {
  return { patch: null, result };
}

/** 탭 화면이 보고한 스크롤만 탭 상태에 합친다. 입력 초안은 원래 값을 지킨다. */
function mergeNativeScroll(
  current: Tab['uiState'],
  reported: Tab['uiState'],
): Tab['uiState'] {
  const merged: NonNullable<Tab['uiState']> = { ...current };
  delete merged.scrollY;
  if (reported?.scrollY !== undefined) merged.scrollY = reported.scrollY;
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildTab(id: TabId, input: CreateTabInput, now: number): Tab {
  const resourceKey =
    input.resourceKey === null
      ? tabResourceKeys.launcher(id)
      : (input.resourceKey ?? resolveTabResourceKey(input.route, id));

  return {
    schemaVersion: 1,
    id,
    resourceKey,
    kind: input.kind ?? 'generic',
    title: input.title,
    route: input.route,
    routeParams: input.routeParams,
    createdAt: now,
  };
}

function withClosedGroup(
  groups: ClosedTabGroup[],
  closed: Array<{ tab: Tab; index: number }>,
  now: number,
): ClosedTabGroup[] {
  if (closed.length === 0) return groups;
  return [{ tabs: closed, closedAt: now }, ...groups].slice(
    0,
    RECENTLY_CLOSED_TAB_LIMIT,
  );
}

/** 탭 id에 묶인 identity(launcher, draft)는 새 id 기준으로 다시 만든다. */
function reopenedResourceKey(tab: Tab, tabId: TabId): string {
  const key = tab.resourceKey;
  if (!key) return resolveTabResourceKey(tab.route, tabId);
  if (key.startsWith('launcher:')) return tabResourceKeys.launcher(tabId);
  if (key.startsWith('draft:')) return resolveTabResourceKey(tab.route, tabId);
  return key;
}

export function hasUnsavedFormDraft(tab: Tab): boolean {
  const formDraft = tab.uiState?.formDraft;
  return Boolean(formDraft && Object.keys(formDraft).length > 0);
}

// ---------------------------------------------------------------------------
// 만들기 · 열기
// ---------------------------------------------------------------------------

/** Chrome식 명시적 생성: 같은 route/resource여도 항상 새 탭이다. */
export function createTab(
  state: TabWorkspaceState,
  input: CreateTabInput,
  env: TabWorkspaceEnv = defaultTabWorkspaceEnv,
): TabStep<TabId> {
  const id = env.newId();
  const tab = buildTab(id, input, env.now());
  return {
    patch: {
      tabs: [...state.tabs, tab],
      activeTabId: input.activate === false ? state.activeTabId : id,
    },
    result: id,
  };
}

/**
 * 같은 resourceKey의 탭이 이미 있으면 그 탭을 보여준다. 없으면 null을 돌려주고,
 * 부르는 쪽이 `createTab`으로 이어 간다.
 */
export function revealExistingResource(
  state: TabWorkspaceState,
  input: OpenResourceTabInput,
): TabStep<TabId> | null {
  const existing = state.tabs.find((tab) => tab.resourceKey === input.resourceKey);
  if (!existing) return null;
  return {
    patch: {
      tabs: state.tabs.map((tab) =>
        tab.id === existing.id
          ? {
              ...tab,
              route: input.route,
              routeParams: input.routeParams,
              kind: input.kind ?? tab.kind,
            }
          : tab,
      ),
      activeTabId: input.activate === false ? state.activeTabId : existing.id,
    },
    result: existing.id,
  };
}

/** VS Code식 업무 재열기: 같은 resourceKey만 기존 탭으로 reveal한다. */
export function openOrRevealResource(
  state: TabWorkspaceState,
  input: OpenResourceTabInput,
  env: TabWorkspaceEnv = defaultTabWorkspaceEnv,
): TabStep<TabId> {
  return revealExistingResource(state, input) ?? createTab(state, input, env);
}

export function moduleResourceInput(
  input: Omit<CreateTabInput, 'resourceKey'>,
): OpenResourceTabInput {
  return { ...input, resourceKey: tabResourceKeys.module(input.route) };
}

/** 창 단위 module singleton을 열거나 기존 탭으로 이동한다. */
export function openModule(
  state: TabWorkspaceState,
  input: Omit<CreateTabInput, 'resourceKey'>,
  env: TabWorkspaceEnv = defaultTabWorkspaceEnv,
): TabStep<TabId> {
  return openOrRevealResource(state, moduleResourceInput(input), env);
}

/** draft 저장 완료처럼 현재 탭을 업무 리소스로 원자적으로 전환한다. */
export function replaceTabResource(
  state: TabWorkspaceState,
  id: TabId,
  input: ReplaceTabResourceInput,
): TabStep<TabId> {
  const source = state.tabs.find((tab) => tab.id === id);
  if (!source) return unchanged(id);
  const wasSourceActive = state.activeTabId === id;

  const existing = state.tabs.find(
    (tab) => tab.id !== id && tab.resourceKey === input.resourceKey,
  );
  if (existing) {
    return {
      patch: {
        tabs: state.tabs.filter((tab) => tab.id !== id),
        activeTabId: wasSourceActive ? existing.id : state.activeTabId,
      },
      result: existing.id,
    };
  }

  return {
    patch: {
      tabs: state.tabs.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              resourceKey: input.resourceKey,
              kind: input.kind ?? 'generic',
              title: input.title,
              route: input.route,
              routeParams: input.routeParams,
              uiState: undefined,
            }
          : tab,
      ),
      activeTabId: wasSourceActive ? id : state.activeTabId,
    },
    result: id,
  };
}

// ---------------------------------------------------------------------------
// 이동
// ---------------------------------------------------------------------------

/**
 * 탭을 목적지로 옮긴다. 새 탭을 만들어야 하는 경우(탭이 없음, 저장 전 입력이 있음)는
 * `'create'`를 돌려주고, 부르는 쪽이 `createTab`으로 이어 간다.
 */
export function navigateExistingTab(
  state: TabWorkspaceState,
  id: TabId | null,
  input: NavigateTabInput,
  options?: NavigateTabOptions,
): TabStep<TabId> | 'create' {
  const source = id ? state.tabs.find((tab) => tab.id === id) : undefined;
  if (!source) return 'create';
  const kind = input.kind ?? 'generic';
  const resourceKey = resolveTabResourceKey(input.route, source.id);

  if (source.resourceKey === resourceKey) {
    return {
      patch: {
        tabs: state.tabs.map((tab) =>
          tab.id === source.id
            ? {
                ...tab,
                kind,
                title: input.title,
                route: input.route,
                routeParams: input.routeParams,
              }
            : tab,
        ),
        activeTabId: source.id,
      },
      result: source.id,
    };
  }

  const existing = state.tabs.find(
    (tab) => tab.id !== source.id && tab.resourceKey === resourceKey,
  );
  if (existing) {
    return { patch: { activeTabId: existing.id }, result: existing.id };
  }

  if (options?.preserveSource || hasUnsavedFormDraft(source)) return 'create';

  return {
    patch: {
      tabs: state.tabs.map((tab) =>
        tab.id === source.id
          ? {
              ...tab,
              resourceKey,
              kind,
              title: input.title,
              route: input.route,
              routeParams: input.routeParams,
              // 이전 화면의 scroll/form 상태는 새 화면에 이어지지 않는다.
              uiState: undefined,
            }
          : tab,
      ),
      activeTabId: source.id,
    },
    result: source.id,
  };
}

/**
 * 사이드바 같은 셸 내비게이션: 새 탭을 만들지 않고 현재 탭이 목적지로 이동한다.
 * 같은 업무가 다른 탭에 이미 열려 있으면 그 탭을 상태 그대로 reveal하고,
 * 저장 전 입력(formDraft 또는 preserveSource)이 있는 탭은 덮어쓰지 않도록
 * 목적지를 새 탭으로 연다.
 */
export function navigateTab(
  state: TabWorkspaceState,
  id: TabId | null,
  input: NavigateTabInput,
  options?: NavigateTabOptions,
  env: TabWorkspaceEnv = defaultTabWorkspaceEnv,
): TabStep<TabId> {
  const step = navigateExistingTab(state, id, input, options);
  return step === 'create' ? createTab(state, input, env) : step;
}

/** 일반 Link/navigation 결과를 같은 resource 안에서는 갱신하고, 다른 resource는 새로 열거나 reveal한다. */
export function adoptTabLocation(
  state: TabWorkspaceState,
  id: TabId,
  route: string,
  kind: TabKind,
  title: string,
  routeParams?: Record<string, JsonValue>,
  env: TabWorkspaceEnv = defaultTabWorkspaceEnv,
): TabStep<TabId> {
  const source = state.tabs.find((tab) => tab.id === id);
  if (!source) return unchanged(id);

  const resourceKey = resolveTabResourceKey(route, id);

  if (source.resourceKey === resourceKey) {
    return {
      patch: {
        tabs: state.tabs.map((tab) =>
          tab.id === id ? { ...tab, route, routeParams, kind, title } : tab,
        ),
      },
      result: id,
    };
  }

  const existing = state.tabs.find(
    (tab) => tab.id !== id && tab.resourceKey === resourceKey,
  );

  if (existing) {
    const existingDefaultTitle = existing.title === '...' || existing.title === title;
    return {
      patch: {
        tabs: state.tabs.map((tab) =>
          tab.id === existing.id
            ? {
                ...tab,
                route,
                routeParams,
                kind,
                title: existingDefaultTitle ? title : tab.title,
              }
            : tab,
        ),
        activeTabId: existing.id,
      },
      result: existing.id,
    };
  }

  const newId = env.newId();
  const newTab = buildTab(
    newId,
    {
      route,
      routeParams,
      kind,
      title,
      resourceKey: resourceKey.startsWith('draft:')
        ? resolveTabResourceKey(route, newId)
        : resourceKey,
    },
    env.now(),
  );
  return {
    patch: { tabs: [...state.tabs, newTab], activeTabId: newId },
    result: newId,
  };
}

/**
 * 탭 화면 자신이 옮긴 주소의 반영. 같은 WebContents의 identity를 유지해야 하므로
 * resource dedupe나 새 tab 생성 없이 제자리 갱신한다.
 */
export function updateNativeTabLocation(
  state: TabWorkspaceState,
  id: TabId,
  route: string,
  kind: TabKind,
  title: string,
  routeParams?: Record<string, JsonValue>,
): TabStep<boolean> {
  const source = state.tabs.find((tab) => tab.id === id);
  if (!source) return unchanged(false);
  return {
    patch: {
      tabs: state.tabs.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              resourceKey: resolveTabResourceKey(route, id),
              route,
              routeParams,
              kind,
              title,
            }
          : tab,
      ),
    },
    result: true,
  };
}

/** 탭 화면이 보고한 스크롤 위치(화면을 내렸다가 다시 띄울 때 되돌린다). */
export function updateNativeTabSnapshot(
  state: TabWorkspaceState,
  tab: Tab,
): TabStep<boolean> {
  if (!state.tabs.some((candidate) => candidate.id === tab.id)) return unchanged(false);
  return {
    patch: {
      tabs: state.tabs.map((candidate) =>
        // 탭 화면의 보고는 그사이 바뀐 제목·주소·입력 초안을 되돌리면 안 된다.
        // 탭 화면이 주인인 것은 스크롤 위치뿐이다.
        candidate.id === tab.id
          ? { ...candidate, uiState: mergeNativeScroll(candidate.uiState, tab.uiState) }
          : candidate,
      ),
    },
    result: true,
  };
}

/**
 * 뒤로/앞으로: 같은 탭을 기록된 화면으로 되돌린다. 같은 업무가 다른 탭에
 * 이미 열려 있으면 탭 하나에 한 업무 규칙을 지키려고 그 탭을 보여준다.
 */
export function restoreTabLocation(
  state: TabWorkspaceState,
  id: TabId,
  location: TabLocation,
): TabStep<RestoreTabLocationResult> {
  const source = state.tabs.find((tab) => tab.id === id);
  if (!source) {
    return unchanged({ status: 'ignored', tabId: id });
  }

  const existing = state.tabs.find(
    (tab) => tab.id !== id && tab.resourceKey === location.resourceKey,
  );
  if (existing) {
    return {
      patch: { activeTabId: existing.id },
      result: { status: 'revealed', tabId: existing.id },
    };
  }

  const changesResource = source.resourceKey !== location.resourceKey;
  // 다른 업무로 옮기면 uiState를 비우므로, 저장 전 초안이 있으면 절대 옮기지 않는다.
  if (changesResource && hasUnsavedFormDraft(source)) {
    return unchanged({ status: 'blocked', tabId: id });
  }

  return {
    patch: {
      tabs: state.tabs.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              resourceKey: location.resourceKey,
              kind: location.kind,
              title: location.title,
              route: location.route,
              routeParams: location.routeParams,
              // 다른 업무로 돌아가면 지금 화면의 scroll 상태는 이어지지 않는다.
              uiState: changesResource ? undefined : tab.uiState,
            }
          : tab,
      ),
      activeTabId: id,
    },
    result: { status: 'navigated', tabId: id },
  };
}

// ---------------------------------------------------------------------------
// 닫기 · 다시 열기
// ---------------------------------------------------------------------------

export function closeTab(
  state: TabWorkspaceState,
  id: TabId,
  env: TabWorkspaceEnv = defaultTabWorkspaceEnv,
): TabStep<void> {
  const idx = state.tabs.findIndex((tab) => tab.id === id);
  if (idx < 0) return unchanged(undefined);
  const next = state.tabs.filter((tab) => tab.id !== id);
  let nextActive = state.activeTabId;
  if (state.activeTabId === id) {
    const fallback = next[idx] ?? next[idx - 1] ?? next[0] ?? null;
    nextActive = fallback?.id ?? null;
  }
  return {
    patch: {
      tabs: next,
      activeTabId: nextActive,
      recentlyClosedTabs: withClosedGroup(
        state.recentlyClosedTabs,
        [{ tab: state.tabs[idx], index: idx }],
        env.now(),
      ),
    },
    result: undefined,
  };
}

export function closeOtherTabs(
  state: TabWorkspaceState,
  id: TabId,
  env: TabWorkspaceEnv = defaultTabWorkspaceEnv,
): TabStep<void> {
  const tab = state.tabs.find((candidate) => candidate.id === id);
  if (!tab) return unchanged(undefined);
  const closed = state.tabs
    .map((candidate, index) => ({ tab: candidate, index }))
    .filter((entry) => entry.tab.id !== id);
  return {
    patch: {
      tabs: [tab],
      activeTabId: id,
      recentlyClosedTabs: withClosedGroup(state.recentlyClosedTabs, closed, env.now()),
    },
    result: undefined,
  };
}

export function closeTabsOnSide(
  state: TabWorkspaceState,
  id: TabId,
  side: 'left' | 'right',
  env: TabWorkspaceEnv = defaultTabWorkspaceEnv,
): TabStep<void> {
  const idx = state.tabs.findIndex((tab) => tab.id === id);
  if (idx < 0) return unchanged(undefined);
  const closed = state.tabs
    .map((tab, index) => ({ tab, index }))
    .filter((entry) => (side === 'right' ? entry.index > idx : entry.index < idx));
  if (closed.length === 0) return unchanged(undefined);
  const closedIds = new Set(closed.map((entry) => entry.tab.id));
  const tabs = state.tabs.filter((tab) => !closedIds.has(tab.id));
  const activeStillOpen = tabs.some((tab) => tab.id === state.activeTabId);
  return {
    patch: {
      tabs,
      activeTabId: activeStillOpen ? state.activeTabId : id,
      recentlyClosedTabs: withClosedGroup(state.recentlyClosedTabs, closed, env.now()),
    },
    result: undefined,
  };
}

/** 가장 최근에 닫은 묶음을 원래 자리에 다시 연다. */
export function reopenClosedTabs(
  state: TabWorkspaceState,
  env: TabWorkspaceEnv = defaultTabWorkspaceEnv,
): TabStep<ReopenedTab[]> {
  const [group, ...rest] = state.recentlyClosedTabs;
  if (!group) return unchanged([]);

  const tabs = [...state.tabs];
  const reopened: ReopenedTab[] = [];
  const ordered = [...group.tabs].sort((left, right) => left.index - right.index);
  for (const { tab, index } of ordered) {
    const tabId = env.newId();
    const resourceKey = reopenedResourceKey(tab, tabId);
    const existing = tabs.find((candidate) => candidate.resourceKey === resourceKey);
    if (existing) {
      reopened.push({ previousTabId: tab.id, tabId: existing.id, revealed: true });
      continue;
    }
    tabs.splice(Math.min(index, tabs.length), 0, {
      ...tab,
      id: tabId,
      resourceKey,
      createdAt: env.now(),
    });
    reopened.push({ previousTabId: tab.id, tabId, revealed: false });
  }

  return {
    patch: {
      tabs,
      activeTabId: reopened[0]?.tabId ?? state.activeTabId,
      recentlyClosedTabs: rest,
    },
    result: reopened,
  };
}

export function closeAllTabs(): TabStep<void> {
  return { patch: { tabs: [], activeTabId: null }, result: undefined };
}

/** 로그인한 사람이나 사무소가 바뀌었다: 이전 사무소의 탭·초안·닫은 탭을 모두 버린다. */
export function resetWorkspaceForAuthChange(): TabStep<void> {
  return {
    patch: {
      tabs: [],
      activeTabId: null,
      recentlyClosedTabs: [],
    },
    result: undefined,
  };
}

// ---------------------------------------------------------------------------
// 선택 · 순서 · 탭에 딸린 값
// ---------------------------------------------------------------------------

export function activateTab(state: TabWorkspaceState, id: TabId): TabStep<void> {
  return state.tabs.some((tab) => tab.id === id)
    ? { patch: { activeTabId: id }, result: undefined }
    : unchanged(undefined);
}

export function reorderTabs(
  state: TabWorkspaceState,
  fromId: TabId,
  toId: TabId,
): TabStep<void> {
  const fromIdx = state.tabs.findIndex((tab) => tab.id === fromId);
  const toIdx = state.tabs.findIndex((tab) => tab.id === toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return unchanged(undefined);
  const next = [...state.tabs];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(toIdx, 0, moved);
  return { patch: { tabs: next }, result: undefined };
}

export function updateTabTitle(
  state: TabWorkspaceState,
  id: TabId,
  title: string,
): TabStep<void> {
  return {
    patch: {
      tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, title } : tab)),
    },
    result: undefined,
  };
}

export function updateTabFormDraft(
  state: TabWorkspaceState,
  id: TabId,
  key: string,
  value: JsonValue,
): TabStep<void> {
  return {
    patch: {
      tabs: state.tabs.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              uiState: {
                ...tab.uiState,
                formDraft: { ...tab.uiState?.formDraft, [key]: value },
              },
            }
          : tab,
      ),
    },
    result: undefined,
  };
}

export function clearTabFormDraft(state: TabWorkspaceState, id: TabId): TabStep<void> {
  return {
    patch: {
      tabs: state.tabs.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              uiState: tab.uiState ? { ...tab.uiState, formDraft: undefined } : undefined,
            }
          : tab,
      ),
    },
    result: undefined,
  };
}

// ---------------------------------------------------------------------------
// 창 사이 이동(main의 탭 목록이 쓴다). 탭은 한 번에 한 창에만 있다.
// ---------------------------------------------------------------------------

/** 탭을 이 창에서 꺼낸다(닫은 탭 목록에 넣지 않는다). 없으면 result가 null이다. */
export function takeTab(state: TabWorkspaceState, id: TabId): TabStep<Tab | null> {
  const idx = state.tabs.findIndex((tab) => tab.id === id);
  if (idx < 0) return unchanged(null);
  const tabs = state.tabs.filter((tab) => tab.id !== id);
  const fallback = tabs[idx] ?? tabs[idx - 1] ?? tabs[0] ?? null;
  return {
    patch: {
      tabs,
      activeTabId:
        state.activeTabId === id ? (fallback?.id ?? null) : state.activeTabId,
    },
    result: state.tabs[idx],
  };
}

/** 다른 창에서 온 탭을 identity 그대로 넣고 활성 탭으로 삼는다. */
export function insertTab(
  state: TabWorkspaceState,
  tab: Tab,
  index?: number,
): TabStep<boolean> {
  if (state.tabs.some((candidate) => candidate.id === tab.id)) return unchanged(false);
  const tabs = [...state.tabs];
  const at =
    index === undefined ? tabs.length : Math.max(0, Math.min(index, tabs.length));
  tabs.splice(at, 0, tab);
  return { patch: { tabs, activeTabId: tab.id }, result: true };
}

/** 탭을 목록의 그 자리(index)로 옮긴다. 탭바에서 끌어 놓은 결과다. */
export function moveTabToIndex(
  state: TabWorkspaceState,
  id: TabId,
  toIndex: number,
): TabStep<void> {
  const fromIdx = state.tabs.findIndex((tab) => tab.id === id);
  if (fromIdx < 0) return unchanged(undefined);
  const target = Math.max(0, Math.min(Math.trunc(toIndex), state.tabs.length - 1));
  if (target === fromIdx) return unchanged(undefined);
  const next = [...state.tabs];
  const [moved] = next.splice(fromIdx, 1);
  next.splice(target, 0, moved);
  return { patch: { tabs: next }, result: undefined };
}

// ---------------------------------------------------------------------------
// 탭 명령(단축키·버튼)이 쓰는 조합
// ---------------------------------------------------------------------------

export const NEW_TAB_ROUTE = '/dashboard';

/** 새 탭은 대시보드 launcher로 연다. 같은 대시보드가 있어도 항상 새 탭이다. */
export function openNewTab(
  state: TabWorkspaceState,
  env: TabWorkspaceEnv = defaultTabWorkspaceEnv,
): TabStep<TabId> {
  const meta = getRouteMetaCore(NEW_TAB_ROUTE);
  return createTab(
    state,
    { route: NEW_TAB_ROUTE, kind: meta.kind, title: meta.title, resourceKey: null },
    env,
  );
}

/**
 * 기록 메뉴의 Cmd/Ctrl+클릭: 그 화면을 새 탭으로 연다.
 * 같은 업무가 이미 열려 있으면 그 탭을 그대로 보여주기만 한다. 그 탭의 주소를
 * 바꾸면 수정 중이던 화면을 벗어나 입력이 사라질 수 있다.
 */
export function openLocationInNewTab(
  state: TabWorkspaceState,
  location: TabLocation,
  env: TabWorkspaceEnv = defaultTabWorkspaceEnv,
): TabStep<TabId> {
  const input = {
    route: location.route,
    title: location.title,
    kind: location.kind,
    routeParams: location.routeParams,
  };
  if (location.resourceKey.startsWith('launcher:')) {
    return createTab(state, { ...input, resourceKey: null }, env);
  }
  if (location.resourceKey.startsWith('draft:')) {
    return createTab(state, input, env);
  }
  const existing = state.tabs.find((tab) => tab.resourceKey === location.resourceKey);
  if (existing) {
    const step = activateTab(state, existing.id);
    return { patch: step.patch, result: existing.id };
  }
  return createTab(state, { ...input, resourceKey: location.resourceKey }, env);
}

/** 다음/이전 탭(양 끝에서 돌아간다). 탭이 하나뿐이면 아무것도 하지 않는다. */
export function selectRelativeTab(
  state: TabWorkspaceState,
  offset: 1 | -1,
): TabStep<void> {
  const { tabs, activeTabId } = state;
  if (tabs.length < 2) return unchanged(undefined);
  const current = tabs.findIndex((tab) => tab.id === activeTabId);
  const next = (Math.max(current, 0) + offset + tabs.length) % tabs.length;
  return activateTab(state, tabs[next].id);
}

/** 그 위치의 탭, 'last'는 마지막 탭. */
export function selectTabAtIndex(
  state: TabWorkspaceState,
  index: number | 'last',
): TabStep<void> {
  const target = index === 'last' ? state.tabs.at(-1) : state.tabs[index];
  return target ? activateTab(state, target.id) : unchanged(undefined);
}

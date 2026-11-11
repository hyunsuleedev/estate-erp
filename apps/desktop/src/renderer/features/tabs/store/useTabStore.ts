import { create } from 'zustand';
import type {
  JsonValue,
  Tab,
  TabId,
  TabKind,
  TabWorkspaceSnapshot,
} from '@estate-erp/shared';
import { resolveTabResourceKey, tabResourceKeys } from '../lib/tabResource';

function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `tab_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

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

export interface ReplaceTabResourceInput extends Omit<CreateTabInput, 'activate' | 'resourceKey'> {
  resourceKey: string;
}

export type NavigateTabInput = Omit<CreateTabInput, 'activate' | 'resourceKey'>;

export interface NavigateTabOptions {
  /** 화면이 저장 전 편집 상태를 보고했으면 원본 탭을 덮어쓰지 않는다. */
  preserveSource?: boolean;
}

export type InsertTransferredTabResult =
  | { status: 'inserted' | 'existing'; tabId: TabId }
  | { status: 'conflict'; tabId: TabId; error: string };

export type RestoreTransferredWorkspaceResult =
  | { status: 'restored'; activeTabId: TabId | null }
  | { status: 'conflict'; error: string };

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

interface TabStore {
  tabs: Tab[];
  activeTabId: TabId | null;
  /** ownership commit 중인 source 탭에는 더 이상 직렬화 상태를 쓰지 않는다. */
  transferLockedTabIds: ReadonlySet<TabId>;
  /** 최근에 닫은 탭 묶음. 앞쪽이 가장 최근이다. */
  recentlyClosedTabs: ClosedTabGroup[];

  /** Chrome식 명시적 생성: 같은 route/resource여도 항상 새 탭이다. */
  createTab(input: CreateTabInput): TabId;
  /** VS Code식 업무 재열기: 같은 resourceKey만 기존 탭으로 reveal한다. */
  openOrRevealResource(input: OpenResourceTabInput): TabId;
  /** 창 단위 module singleton을 열거나 기존 탭으로 이동한다. */
  openModule(input: Omit<CreateTabInput, 'resourceKey'>): TabId;
  /** draft 저장 완료처럼 현재 탭을 업무 리소스로 원자적으로 전환한다. */
  replaceTabResource(id: TabId, input: ReplaceTabResourceInput): TabId;
  /** 창 간 이동용: id/createdAt/uiState/resourceKey를 바꾸지 않고 삽입한다. */
  insertTransferredTab(tab: Tab): InsertTransferredTabResult;
  /** final transfer snapshot을 같은 id 자리에 정확히 교체한다. */
  replaceTransferredTabSnapshot(tab: Tab): InsertTransferredTabResult;
  restoreTransferredWorkspace(
    workspace: TabWorkspaceSnapshot,
  ): RestoreTransferredWorkspaceResult;
  /**
   * 사이드바 같은 셸 내비게이션: 새 탭을 만들지 않고 현재 탭이 목적지로 이동한다.
   * 같은 업무가 다른 탭에 이미 열려 있으면 그 탭을 상태 그대로 reveal하고,
   * 저장 전 입력(formDraft 또는 preserveSource)이 있는 탭은 덮어쓰지 않도록
   * 목적지를 새 탭으로 연다.
   */
  navigateTab(
    id: TabId | null,
    input: NavigateTabInput,
    options?: NavigateTabOptions,
  ): TabId;
  /** 일반 Link/navigation 결과를 같은 resource 안에서는 갱신하고, 다른 resource는 새로 열거나 reveal한다. */
  adoptTabLocation(
    id: TabId,
    route: string,
    kind: TabKind,
    title: string,
    routeParams?: Record<string, JsonValue>,
  ): TabId;
  /**
   * main-owned native renderer의 navigation projection. 동일 WebContents의
   * identity를 유지해야 하므로 resource dedupe나 새 tab 생성 없이 제자리 갱신한다.
   */
  updateNativeTabLocation(
    id: TabId,
    route: string,
    kind: TabKind,
    title: string,
    routeParams?: Record<string, JsonValue>,
  ): boolean;
  /** Main-owned native scroll projection for LRU restore. */
  updateNativeTabSnapshot(tab: Tab): boolean;
  /**
   * 뒤로/앞으로: 같은 탭을 기록된 화면으로 되돌린다. 같은 업무가 다른 탭에
   * 이미 열려 있으면 탭 하나에 한 업무 규칙을 지키려고 그 탭을 보여준다.
   */
  restoreTabLocation(id: TabId, location: TabLocation): RestoreTabLocationResult;
  closeTab(id: TabId): void;
  closeOtherTabs(id: TabId): void;
  closeTabsToRight(id: TabId): void;
  closeTabsToLeft(id: TabId): void;
  closeTabsOnSide(id: TabId, side: 'left' | 'right'): void;
  /** 가장 최근에 닫은 묶음을 원래 자리에 다시 연다. */
  reopenClosedTabs(): ReopenedTab[];
  closeAllTabs(): void;
  /** Authentication principal changed: discard every tenant-bound tab/draft. */
  resetWorkspaceForAuthChange(): void;
  activateTab(id: TabId): void;
  reorderTabs(fromId: TabId, toId: TabId): void;
  updateTabTitle(id: TabId, title: string): void;
  updateTabFormDraft(id: TabId, key: string, value: JsonValue): void;
  clearTabFormDraft(id: TabId): void;
  lockTabForTransfer(id: TabId): Tab | null;
  unlockTabForTransfer(id: TabId): void;
  removeTabById(id: TabId): void;
}

/** 탭 화면이 보고한 스크롤만 셸 탭 상태에 합친다. 입력 초안은 셸 쪽 값을 지킨다. */
function mergeNativeScroll(
  current: Tab['uiState'],
  reported: Tab['uiState'],
): Tab['uiState'] {
  const merged: NonNullable<Tab['uiState']> = { ...current };
  delete merged.scrollY;
  if (reported?.scrollY !== undefined) merged.scrollY = reported.scrollY;
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function buildTab(id: TabId, input: CreateTabInput): Tab {
  const resourceKey =
    input.resourceKey === null
      ? tabResourceKeys.launcher(id)
      : input.resourceKey ?? resolveTabResourceKey(input.route, id);

  return {
    schemaVersion: 1,
    id,
    resourceKey,
    kind: input.kind ?? 'generic',
    title: input.title,
    route: input.route,
    routeParams: input.routeParams,
    createdAt: Date.now(),
  };
}

function withClosedGroup(
  groups: ClosedTabGroup[],
  closed: Array<{ tab: Tab; index: number }>,
): ClosedTabGroup[] {
  if (closed.length === 0) return groups;
  return [{ tabs: closed, closedAt: Date.now() }, ...groups].slice(
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

function sameTransferredTab(left: Tab, right: Tab): boolean {
  return (
    left.schemaVersion === right.schemaVersion &&
    left.id === right.id &&
    left.resourceKey === right.resourceKey &&
    left.kind === right.kind &&
    left.title === right.title &&
    left.route === right.route &&
    left.createdAt === right.createdAt &&
    JSON.stringify(left.routeParams) === JSON.stringify(right.routeParams) &&
    JSON.stringify(left.uiState) === JSON.stringify(right.uiState)
  );
}

export const useTabStore = create<TabStore>((set, get) => ({
  tabs: [],
  activeTabId: null,
  transferLockedTabIds: new Set<TabId>(),
  recentlyClosedTabs: [],

  createTab(input) {
    const id = genId();
    const tab = buildTab(id, input);
    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: input.activate === false ? state.activeTabId : id,
    }));
    return id;
  },

  openOrRevealResource(input) {
    const existing = get().tabs.find(
      (tab) => tab.resourceKey === input.resourceKey,
    );
    if (existing) {
      if (get().transferLockedTabIds.has(existing.id)) {
        if (input.activate !== false) set({ activeTabId: existing.id });
        return existing.id;
      }
      set((state) => ({
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
        activeTabId:
          input.activate === false ? state.activeTabId : existing.id,
      }));
      return existing.id;
    }
    return get().createTab(input);
  },

  openModule(input) {
    return get().openOrRevealResource({
      ...input,
      resourceKey: tabResourceKeys.module(input.route),
    });
  },

  replaceTabResource(id, input) {
    const state = get();
    const source = state.tabs.find((tab) => tab.id === id);
    if (!source || state.transferLockedTabIds.has(id)) {
      return id;
    }
    const wasSourceActive = state.activeTabId === id;

    const existing = state.tabs.find(
      (tab) => tab.id !== id && tab.resourceKey === input.resourceKey,
    );
    if (existing) {
      set({
        tabs: state.tabs.filter((tab) => tab.id !== id),
        activeTabId: wasSourceActive ? existing.id : state.activeTabId,
      });
      return existing.id;
    }

    set({
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
    });
    return id;
  },

  insertTransferredTab(tab) {
    const existing = get().tabs.find((candidate) => candidate.id === tab.id);
    if (existing) {
      if (!sameTransferredTab(existing, tab)) {
        return {
          status: 'conflict',
          tabId: existing.id,
          error: `tab id conflict: ${tab.id}`,
        };
      }
      set({ activeTabId: existing.id });
      return { status: 'existing', tabId: existing.id };
    }

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: tab.id,
    }));
    return { status: 'inserted', tabId: tab.id };
  },

  replaceTransferredTabSnapshot(tab) {
    const existing = get().tabs.find((candidate) => candidate.id === tab.id);
    if (!existing) {
      return {
        status: 'conflict',
        tabId: tab.id,
        error: `transferred tab is missing: ${tab.id}`,
      };
    }
    set((state) => ({
      tabs: state.tabs.map((candidate) =>
        candidate.id === tab.id ? tab : candidate,
      ),
    }));
    return { status: 'existing', tabId: tab.id };
  },

  restoreTransferredWorkspace(workspace) {
    const incomingIds = new Set<string>();
    for (const tab of workspace.tabs) {
      if (incomingIds.has(tab.id)) {
        return { status: 'conflict', error: `duplicate tab id: ${tab.id}` };
      }
      incomingIds.add(tab.id);
      const existing = get().tabs.find((candidate) => candidate.id === tab.id);
      if (existing && !sameTransferredTab(existing, tab)) {
        return { status: 'conflict', error: `tab id conflict: ${tab.id}` };
      }
    }

    const activeTabId =
      workspace.activeTabId && incomingIds.has(workspace.activeTabId)
        ? workspace.activeTabId
        : workspace.tabs[0]?.id ?? null;
    set({
      tabs: workspace.tabs,
      activeTabId,
      transferLockedTabIds: new Set<TabId>(),
    });
    return { status: 'restored', activeTabId };
  },

  navigateTab(id, input, options) {
    const state = get();
    const source = id ? state.tabs.find((tab) => tab.id === id) : undefined;
    if (!source) return get().createTab(input);
    if (state.transferLockedTabIds.has(source.id)) return source.id;

    const kind = input.kind ?? 'generic';
    const resourceKey = resolveTabResourceKey(input.route, source.id);

    if (source.resourceKey === resourceKey) {
      set({
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
      });
      return source.id;
    }

    const existing = state.tabs.find(
      (tab) => tab.id !== source.id && tab.resourceKey === resourceKey,
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return existing.id;
    }

    if (options?.preserveSource || hasUnsavedFormDraft(source)) {
      return get().createTab(input);
    }

    set({
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
    });
    return source.id;
  },

  adoptTabLocation(id, route, kind, title, routeParams) {
    const state = get();
    const source = state.tabs.find((tab) => tab.id === id);
    if (!source || state.transferLockedTabIds.has(id)) return id;

    const resourceKey = resolveTabResourceKey(route, id);

    if (source.resourceKey === resourceKey) {
      set({
        tabs: state.tabs.map((tab) =>
          tab.id === id
            ? { ...tab, route, routeParams, kind, title }
            : tab,
        ),
      });
      return id;
    }

    const existing = state.tabs.find(
      (tab) => tab.id !== id && tab.resourceKey === resourceKey,
    );

    if (existing) {
      const existingDefaultTitle = existing.title === '...' || existing.title === title;
      set({
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
      });
      return existing.id;
    }

    const newId = genId();
    const newTab = buildTab(newId, {
      route,
      routeParams,
      kind,
      title,
      resourceKey:
        resourceKey.startsWith('draft:')
          ? resolveTabResourceKey(route, newId)
          : resourceKey,
    });
    set({
      tabs: [...state.tabs, newTab],
      activeTabId: newId,
    });
    return newId;
  },

  updateNativeTabLocation(id, route, kind, title, routeParams) {
    const state = get();
    const source = state.tabs.find((tab) => tab.id === id);
    if (!source) return false;
    set({
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
    });
    return true;
  },

  updateNativeTabSnapshot(tab) {
    const state = get();
    if (!state.tabs.some((candidate) => candidate.id === tab.id)) return false;
    set({
      tabs: state.tabs.map((candidate) =>
        // Native view-state reports must not roll back newer shell-owned
        // title/route metadata or form drafts that may have changed
        // concurrently. The native renderer only owns its scroll position.
        candidate.id === tab.id
          ? { ...candidate, uiState: mergeNativeScroll(candidate.uiState, tab.uiState) }
          : candidate,
      ),
    });
    return true;
  },

  restoreTabLocation(id, location) {
    const state = get();
    const source = state.tabs.find((tab) => tab.id === id);
    if (!source || state.transferLockedTabIds.has(id)) {
      return { status: 'ignored', tabId: id };
    }

    const existing = state.tabs.find(
      (tab) => tab.id !== id && tab.resourceKey === location.resourceKey,
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return { status: 'revealed', tabId: existing.id };
    }

    const changesResource = source.resourceKey !== location.resourceKey;
    // 다른 업무로 옮기면 uiState를 비우므로, 저장 전 초안이 있으면 절대 옮기지 않는다.
    if (changesResource && hasUnsavedFormDraft(source)) {
      return { status: 'blocked', tabId: id };
    }

    set({
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
    });
    return { status: 'navigated', tabId: id };
  },

  closeTab(id) {
    const state = get();
    if (state.transferLockedTabIds.has(id)) return;
    const idx = state.tabs.findIndex((tab) => tab.id === id);
    if (idx < 0) return;
    const next = state.tabs.filter((tab) => tab.id !== id);
    let nextActive = state.activeTabId;
    if (state.activeTabId === id) {
      const fallback = next[idx] ?? next[idx - 1] ?? next[0] ?? null;
      nextActive = fallback?.id ?? null;
    }
    set({
      tabs: next,
      activeTabId: nextActive,
      recentlyClosedTabs: withClosedGroup(state.recentlyClosedTabs, [
        { tab: state.tabs[idx], index: idx },
      ]),
    });
  },

  closeOtherTabs(id) {
    const state = get();
    const tab = state.tabs.find((candidate) => candidate.id === id);
    if (!tab) return;
    if (
      [...state.transferLockedTabIds].some((lockedId) => lockedId !== id)
    ) {
      return;
    }
    const closed = state.tabs
      .map((candidate, index) => ({ tab: candidate, index }))
      .filter((entry) => entry.tab.id !== id);
    set({
      tabs: [tab],
      activeTabId: id,
      recentlyClosedTabs: withClosedGroup(state.recentlyClosedTabs, closed),
    });
  },

  closeTabsToRight(id) {
    get().closeTabsOnSide(id, 'right');
  },

  closeTabsToLeft(id) {
    get().closeTabsOnSide(id, 'left');
  },

  closeTabsOnSide(id, side) {
    const state = get();
    const idx = state.tabs.findIndex((tab) => tab.id === id);
    if (idx < 0) return;
    const closed = state.tabs
      .map((tab, index) => ({ tab, index }))
      .filter((entry) => (side === 'right' ? entry.index > idx : entry.index < idx));
    if (closed.length === 0) return;
    if (closed.some((entry) => state.transferLockedTabIds.has(entry.tab.id))) {
      return;
    }
    const closedIds = new Set(closed.map((entry) => entry.tab.id));
    const tabs = state.tabs.filter((tab) => !closedIds.has(tab.id));
    const activeStillOpen = tabs.some((tab) => tab.id === state.activeTabId);
    set({
      tabs,
      activeTabId: activeStillOpen ? state.activeTabId : id,
      recentlyClosedTabs: withClosedGroup(state.recentlyClosedTabs, closed),
    });
  },

  reopenClosedTabs() {
    const state = get();
    const [group, ...rest] = state.recentlyClosedTabs;
    if (!group) return [];

    const tabs = [...state.tabs];
    const reopened: ReopenedTab[] = [];
    const ordered = [...group.tabs].sort((left, right) => left.index - right.index);
    for (const { tab, index } of ordered) {
      const tabId = genId();
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
        createdAt: Date.now(),
      });
      reopened.push({ previousTabId: tab.id, tabId, revealed: false });
    }

    set({
      tabs,
      activeTabId: reopened[0]?.tabId ?? state.activeTabId,
      recentlyClosedTabs: rest,
    });
    return reopened;
  },

  closeAllTabs() {
    if (get().transferLockedTabIds.size > 0) return;
    set({ tabs: [], activeTabId: null });
  },

  resetWorkspaceForAuthChange() {
    set({
      tabs: [],
      activeTabId: null,
      transferLockedTabIds: new Set<TabId>(),
      // 닫은 탭도 이전 사무소 데이터다.
      recentlyClosedTabs: [],
    });
  },

  activateTab(id) {
    set((state) =>
      state.tabs.some((tab) => tab.id === id)
        ? { activeTabId: id }
        : state,
    );
  },

  reorderTabs(fromId, toId) {
    set((state) => {
      const fromIdx = state.tabs.findIndex((tab) => tab.id === fromId);
      const toIdx = state.tabs.findIndex((tab) => tab.id === toId);
      if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return state;
      const next = [...state.tabs];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return { tabs: next };
    });
  },

  updateTabTitle(id, title) {
    if (get().transferLockedTabIds.has(id)) return;
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id ? { ...tab, title } : tab,
      ),
    }));
  },

  updateTabFormDraft(id, key, value) {
    if (get().transferLockedTabIds.has(id)) return;
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              uiState: {
                ...tab.uiState,
                formDraft: {
                  ...tab.uiState?.formDraft,
                  [key]: value,
                },
              },
            }
          : tab,
      ),
    }));
  },

  clearTabFormDraft(id) {
    if (get().transferLockedTabIds.has(id)) return;
    set((state) => ({
      tabs: state.tabs.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              uiState: tab.uiState
                ? { ...tab.uiState, formDraft: undefined }
                : undefined,
            }
          : tab,
      ),
    }));
  },

  lockTabForTransfer(id) {
    const state = get();
    const tab = state.tabs.find((candidate) => candidate.id === id);
    if (!tab || state.transferLockedTabIds.has(id)) return null;
    const transferLockedTabIds = new Set(state.transferLockedTabIds);
    transferLockedTabIds.add(id);
    set({ transferLockedTabIds });
    return tab;
  },

  unlockTabForTransfer(id) {
    const state = get();
    if (!state.transferLockedTabIds.has(id)) return;
    const transferLockedTabIds = new Set(state.transferLockedTabIds);
    transferLockedTabIds.delete(id);
    set({ transferLockedTabIds });
  },

  removeTabById(id) {
    const state = get();
    const idx = state.tabs.findIndex((tab) => tab.id === id);
    if (idx < 0) {
      get().unlockTabForTransfer(id);
      return;
    }
    const tabs = state.tabs.filter((tab) => tab.id !== id);
    const fallback = tabs[idx] ?? tabs[idx - 1] ?? tabs[0] ?? null;
    const transferLockedTabIds = new Set(state.transferLockedTabIds);
    transferLockedTabIds.delete(id);
    set({
      tabs,
      activeTabId:
        state.activeTabId === id ? fallback?.id ?? null : state.activeTabId,
      transferLockedTabIds,
    });
  },
}));

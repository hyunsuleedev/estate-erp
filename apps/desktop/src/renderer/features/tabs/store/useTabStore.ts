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

export type InsertTransferredTabResult =
  | { status: 'inserted' | 'existing'; tabId: TabId }
  | { status: 'conflict'; tabId: TabId; error: string };

export type RestoreTransferredWorkspaceResult =
  | { status: 'restored'; activeTabId: TabId | null }
  | { status: 'conflict'; error: string };

interface TabStore {
  tabs: Tab[];
  activeTabId: TabId | null;
  /** ownership commit 중인 source 탭에는 더 이상 직렬화 상태를 쓰지 않는다. */
  transferLockedTabIds: ReadonlySet<TabId>;

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
  closeTab(id: TabId): void;
  closeOtherTabs(id: TabId): void;
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
        // title/route metadata that may have changed concurrently.
        candidate.id === tab.id
          ? { ...candidate, uiState: tab.uiState }
          : candidate,
      ),
    });
    return true;
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
    set({ tabs: next, activeTabId: nextActive });
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
    set({ tabs: [tab], activeTabId: id });
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

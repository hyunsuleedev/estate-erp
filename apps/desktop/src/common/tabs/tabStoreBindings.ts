import type {
  JsonValue,
  Tab,
  TabId,
  TabKind,
} from '@estate-erp/shared';
import type { TabCommand, TabHistoryDirection } from '../tabCommands';
import { getRouteMetaCore } from './routeMeta';
import {
  canTraverse,
  planHistoryTraversal,
  reattachReopenedHistories,
  reconcileTabHistories,
  syncTabHistory,
  type TabHistoryNavigationResult,
  type TabHistoryState,
} from './tabHistory';
import * as workspace from './tabWorkspace';
import type {
  CreateTabInput,
  NavigateTabInput,
  NavigateTabOptions,
  OpenResourceTabInput,
  ReopenedTab,
  ReplaceTabResourceInput,
  RestoreTabLocationResult,
  TabLocation,
  TabStep,
  TabWorkspaceEnv,
  TabWorkspaceState,
} from './tabWorkspace';

/**
 * 순수 탭 규칙(tabWorkspace.ts, tabHistory.ts)을 zustand 같은 store에 붙이는 얇은 층.
 *
 * 화면의 `useTabStore` / `useTabHistoryStore`는 연결 단계에서 이 함수들로 만든다:
 *
 *   export const useTabStore = create<TabStoreShape>((set, get) => ({
 *     ...createEmptyTabWorkspace(),
 *     ...createTabStoreMethods(get, set),
 *   }));
 *
 * 같은 store 안의 다른 메서드를 부를 때는 원래 구현처럼 `get()`을 거친다. 탭 화면이
 * 메서드를 바꿔 끼워도(nativeTabStoreBridge) 그 바뀐 메서드가 불리게 하기 위해서다.
 */

export interface TabStoreMethods {
  /** Chrome식 명시적 생성: 같은 route/resource여도 항상 새 탭이다. */
  createTab(input: CreateTabInput): TabId;
  /** VS Code식 업무 재열기: 같은 resourceKey만 기존 탭으로 reveal한다. */
  openOrRevealResource(input: OpenResourceTabInput): TabId;
  /** 창 단위 module singleton을 열거나 기존 탭으로 이동한다. */
  openModule(input: Omit<CreateTabInput, 'resourceKey'>): TabId;
  /** draft 저장 완료처럼 현재 탭을 업무 리소스로 원자적으로 전환한다. */
  replaceTabResource(id: TabId, input: ReplaceTabResourceInput): TabId;
  navigateTab(
    id: TabId | null,
    input: NavigateTabInput,
    options?: NavigateTabOptions,
  ): TabId;
  adoptTabLocation(
    id: TabId,
    route: string,
    kind: TabKind,
    title: string,
    routeParams?: Record<string, JsonValue>,
  ): TabId;
  updateNativeTabLocation(
    id: TabId,
    route: string,
    kind: TabKind,
    title: string,
    routeParams?: Record<string, JsonValue>,
  ): boolean;
  updateNativeTabSnapshot(tab: Tab): boolean;
  restoreTabLocation(id: TabId, location: TabLocation): RestoreTabLocationResult;
  closeTab(id: TabId): void;
  closeOtherTabs(id: TabId): void;
  closeTabsToRight(id: TabId): void;
  closeTabsToLeft(id: TabId): void;
  closeTabsOnSide(id: TabId, side: 'left' | 'right'): void;
  reopenClosedTabs(): ReopenedTab[];
  closeAllTabs(): void;
  resetWorkspaceForAuthChange(): void;
  activateTab(id: TabId): void;
  reorderTabs(fromId: TabId, toId: TabId): void;
  updateTabTitle(id: TabId, title: string): void;
  updateTabFormDraft(id: TabId, key: string, value: JsonValue): void;
  clearTabFormDraft(id: TabId): void;
}

export type TabStoreShape = TabWorkspaceState & TabStoreMethods;

export function createTabStoreMethods(
  get: () => TabStoreShape,
  set: (patch: Partial<TabWorkspaceState>) => void,
  env: TabWorkspaceEnv = workspace.defaultTabWorkspaceEnv,
): TabStoreMethods {
  const run = <R>(step: TabStep<R>): R => {
    if (step.patch) set(step.patch);
    return step.result;
  };

  return {
    createTab: (input) => run(workspace.createTab(get(), input, env)),

    openOrRevealResource(input) {
      const revealed = workspace.revealExistingResource(get(), input);
      return revealed ? run(revealed) : get().createTab(input);
    },

    openModule: (input) =>
      get().openOrRevealResource(workspace.moduleResourceInput(input)),

    replaceTabResource: (id, input) =>
      run(workspace.replaceTabResource(get(), id, input)),

    navigateTab(id, input, options) {
      const step = workspace.navigateExistingTab(get(), id, input, options);
      return step === 'create' ? get().createTab(input) : run(step);
    },

    adoptTabLocation: (id, route, kind, title, routeParams) =>
      run(workspace.adoptTabLocation(get(), id, route, kind, title, routeParams, env)),

    updateNativeTabLocation: (id, route, kind, title, routeParams) =>
      run(workspace.updateNativeTabLocation(get(), id, route, kind, title, routeParams)),

    updateNativeTabSnapshot: (tab) => run(workspace.updateNativeTabSnapshot(get(), tab)),

    restoreTabLocation: (id, location) =>
      run(workspace.restoreTabLocation(get(), id, location)),

    closeTab: (id) => run(workspace.closeTab(get(), id, env)),
    closeOtherTabs: (id) => run(workspace.closeOtherTabs(get(), id, env)),
    closeTabsToRight: (id) => get().closeTabsOnSide(id, 'right'),
    closeTabsToLeft: (id) => get().closeTabsOnSide(id, 'left'),
    closeTabsOnSide: (id, side) => run(workspace.closeTabsOnSide(get(), id, side, env)),
    reopenClosedTabs: () => run(workspace.reopenClosedTabs(get(), env)),
    closeAllTabs: () => run(workspace.closeAllTabs()),
    resetWorkspaceForAuthChange: () => run(workspace.resetWorkspaceForAuthChange()),
    activateTab: (id) => run(workspace.activateTab(get(), id)),
    reorderTabs: (fromId, toId) => run(workspace.reorderTabs(get(), fromId, toId)),
    updateTabTitle: (id, title) => run(workspace.updateTabTitle(get(), id, title)),
    updateTabFormDraft: (id, key, value) =>
      run(workspace.updateTabFormDraft(get(), id, key, value)),
    clearTabFormDraft: (id) => run(workspace.clearTabFormDraft(get(), id)),
  };
}

/** zustand store에서 여기서 쓰는 부분만. */
export interface StoreLike<S> {
  getState(): S;
  setState(update: Partial<S> | ((state: S) => Partial<S> | S)): void;
  subscribe(listener: (state: S, previous: S) => void): () => void;
}

/**
 * 탭 목록이 바뀔 때마다 방문 기록에 반영한다(`useTabHistoryStore` 모듈이 불러올 때
 * 하던 일). 돌려주는 함수로 구독을 끊는다.
 */
export function installTabHistorySync(
  tabStore: StoreLike<TabStoreShape>,
  historyStore: StoreLike<TabHistoryState>,
): () => void {
  historyStore.setState((state) =>
    reconcileTabHistories(state, [], tabStore.getState().tabs),
  );
  return tabStore.subscribe((state, previous) => {
    if (
      state.tabs === previous.tabs &&
      state.recentlyClosedTabs === previous.recentlyClosedTabs
    ) {
      return;
    }
    historyStore.setState((history) => syncTabHistory(history, previous, state));
  });
}

export interface TabHistoryActions {
  goToTabHistoryIndex(index: number, tabId?: TabId): Promise<TabHistoryNavigationResult>;
  navigateTabHistory(
    direction: TabHistoryDirection,
    tabId?: TabId,
  ): Promise<TabHistoryNavigationResult>;
  reopenLastClosedTabs(): TabId | null;
}

export function createTabHistoryActions(
  tabStore: StoreLike<TabStoreShape>,
  historyStore: StoreLike<TabHistoryState>,
  deps: {
    /** 탭에 보관된 입력 초안 말고도 저장 전 입력이 있는지(열린 편집기, native 화면). */
    hasUnsavedWork(tab: Tab): Promise<boolean>;
  },
): TabHistoryActions {
  async function goToTabHistoryIndex(
    index: number,
    tabId?: TabId,
  ): Promise<TabHistoryNavigationResult> {
    const tabState = tabStore.getState();
    const id = tabId ?? tabState.activeTabId;
    const tab = tabState.tabs.find((candidate) => candidate.id === id);
    if (!tab || !id) return 'ignored';
    const history = historyStore.getState().histories[id];
    const target = history?.entries[index];
    if (!history || !target || index === history.index) return 'ignored';

    const hasUnsavedWork =
      workspace.hasUnsavedFormDraft(tab) || (await deps.hasUnsavedWork(tab));
    // 확인하는 사이 사용자가 다른 탭으로 옮겼다면 오래된 요청은 버린다.
    if (tabStore.getState().activeTabId !== tabState.activeTabId) return 'ignored';

    const plan = planHistoryTraversal(tab, history, index, hasUnsavedWork);
    switch (plan.kind) {
      case 'ignored':
        return 'ignored';
      case 'blocked-by-unsaved-work':
        return 'blocked-by-unsaved-work';
      case 'open-in-new-tab':
        tabStore.getState().navigateTab(
          id,
          {
            route: plan.target.route,
            title: plan.target.title,
            kind: plan.target.kind,
            routeParams: plan.target.routeParams,
          },
          { preserveSource: true },
        );
        return 'opened-in-new-tab';
      case 'move-index':
        historyStore.setState((state) => ({
          histories: { ...state.histories, [id]: { ...history, index: plan.index } },
        }));
        return 'navigated';
      case 'restore': {
        historyStore.setState((state) => ({
          pending: {
            ...state.pending,
            [id]: { route: plan.target.route, index: plan.index },
          },
        }));
        const result = tabStore.getState().restoreTabLocation(id, plan.target);
        if (result.status !== 'navigated') {
          historyStore.setState((state) => {
            const pending = { ...state.pending };
            delete pending[id];
            return { pending };
          });
        }
        return result.status === 'blocked' ? 'blocked-by-unsaved-work' : result.status;
      }
    }
  }

  function navigateTabHistory(
    direction: TabHistoryDirection,
    tabId?: TabId,
  ): Promise<TabHistoryNavigationResult> {
    const id = tabId ?? tabStore.getState().activeTabId;
    const history = id ? historyStore.getState().histories[id] : undefined;
    if (!history || !canTraverse(history, direction)) {
      return Promise.resolve('ignored');
    }
    const index = direction === 'back' ? history.index - 1 : history.index + 1;
    return goToTabHistoryIndex(index, id ?? undefined);
  }

  function reopenLastClosedTabs(): TabId | null {
    // 다시 열면 그 묶음이 닫은 목록에서 빠져 기록도 정리되므로 먼저 챙겨 둔다.
    const savedHistories = { ...historyStore.getState().retired };
    const reopened = tabStore.getState().reopenClosedTabs();
    if (reopened.length === 0) return null;
    historyStore.setState((state) => ({
      histories: reattachReopenedHistories(state, savedHistories, reopened).histories,
    }));
    return reopened[0]?.tabId ?? null;
  }

  return { goToTabHistoryIndex, navigateTabHistory, reopenLastClosedTabs };
}

export interface TabCommandContext {
  /** 분리된 창은 새 탭을 만들지 않는다. 옮겨 온 탭만 다룬다. */
  canCreateTabs: boolean;
}

export interface TabCommandActions {
  openNewTab(): TabId;
  openLocationInNewTab(location: TabLocation): TabId;
  runHistoryNavigation(direction: TabHistoryDirection): Promise<void>;
  runHistoryJump(index: number, tabId?: TabId): Promise<void>;
  runTabCommand(command: TabCommand, context: TabCommandContext): void;
}

/** 단축키·버튼이 부르는 탭 명령(화면의 lib/tabCommands.ts가 하던 일). */
export function createTabCommandActions(
  tabStore: StoreLike<TabStoreShape>,
  history: TabHistoryActions,
  deps: {
    /** 뒤로/앞으로 결과 중 사용자에게 알릴 것(저장 전 입력 때문에 막힘·새 탭으로 엶). */
    reportHistoryResult(result: TabHistoryNavigationResult): void;
  },
): TabCommandActions {
  function openNewTab(): TabId {
    const meta = getRouteMetaCore(workspace.NEW_TAB_ROUTE);
    return tabStore.getState().createTab({
      route: workspace.NEW_TAB_ROUTE,
      kind: meta.kind,
      title: meta.title,
      resourceKey: null,
    });
  }

  function openLocationInNewTab(location: TabLocation): TabId {
    const store = tabStore.getState();
    const input = {
      route: location.route,
      title: location.title,
      kind: location.kind,
      routeParams: location.routeParams,
    };
    if (location.resourceKey.startsWith('launcher:')) {
      return store.createTab({ ...input, resourceKey: null });
    }
    if (location.resourceKey.startsWith('draft:')) {
      return store.createTab(input);
    }
    const existing = store.tabs.find((tab) => tab.resourceKey === location.resourceKey);
    if (existing) {
      store.activateTab(existing.id);
      return existing.id;
    }
    return store.createTab({ ...input, resourceKey: location.resourceKey });
  }

  async function runHistoryNavigation(direction: TabHistoryDirection): Promise<void> {
    deps.reportHistoryResult(await history.navigateTabHistory(direction));
  }

  async function runHistoryJump(index: number, tabId?: TabId): Promise<void> {
    deps.reportHistoryResult(await history.goToTabHistoryIndex(index, tabId));
  }

  function runTabCommand(command: TabCommand, context: TabCommandContext): void {
    const store = tabStore.getState();
    switch (command.type) {
      case 'history':
        void runHistoryNavigation(command.direction);
        return;
      case 'new-tab':
        if (context.canCreateTabs) openNewTab();
        return;
      case 'close-tab':
        if (store.activeTabId) store.closeTab(store.activeTabId);
        return;
      case 'reopen-closed-tab':
        history.reopenLastClosedTabs();
        return;
      case 'select-relative-tab': {
        const { tabs, activeTabId } = store;
        if (tabs.length < 2) return;
        const current = tabs.findIndex((tab) => tab.id === activeTabId);
        const next =
          (Math.max(current, 0) + command.offset + tabs.length) % tabs.length;
        store.activateTab(tabs[next].id);
        return;
      }
      case 'select-tab-index': {
        const { tabs } = store;
        const target = command.index === 'last' ? tabs.at(-1) : tabs[command.index];
        if (target) store.activateTab(target.id);
        return;
      }
    }
  }

  return {
    openNewTab,
    openLocationInNewTab,
    runHistoryNavigation,
    runHistoryJump,
    runTabCommand,
  };
}

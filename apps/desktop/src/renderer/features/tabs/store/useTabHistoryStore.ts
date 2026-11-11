import { create } from 'zustand';
import type { Tab, TabId } from '@estate-erp/shared';
import type { TabHistoryDirection } from '../../../../common/tabCommands';
import {
  getTabPathname,
  resolveTabResourceKey,
  tabResourceKeys,
} from '../lib/tabResource';
import { activeTabHasUnsavedWork } from '../lib/unsavedWork';
import {
  hasUnsavedFormDraft,
  useTabStore,
  type ClosedTabGroup,
  type TabLocation,
} from './useTabStore';

/** 탭 하나가 기억하는 화면 수. Chrome처럼 오래된 것부터 버린다. */
export const TAB_HISTORY_LIMIT = 50;

export interface TabHistory {
  entries: TabLocation[];
  index: number;
}

interface PendingTraversal {
  route: string;
  index: number;
}

interface TabHistoryState {
  histories: Record<TabId, TabHistory>;
  /** 뒤로/앞으로가 요청한 이동. 그 route가 탭에 반영되면 새 기록을 쌓지 않고 index만 옮긴다. */
  pending: Record<TabId, PendingTraversal>;
  /** 닫힌 탭의 기록. 다시 열면 새 탭 id로 옮겨 붙인다. */
  retired: Record<TabId, TabHistory>;
}

export function locationOf(tab: Tab): TabLocation {
  return {
    route: tab.route,
    title: tab.title,
    kind: tab.kind,
    resourceKey: tab.resourceKey ?? resolveTabResourceKey(tab.route, tab.id),
    routeParams: tab.routeParams,
  };
}

function push(history: TabHistory, location: TabLocation): TabHistory {
  const entries = [...history.entries.slice(0, history.index + 1), location];
  const overflow = Math.max(0, entries.length - TAB_HISTORY_LIMIT);
  return {
    entries: overflow > 0 ? entries.slice(overflow) : entries,
    index: entries.length - 1 - overflow,
  };
}

function replaceCurrent(history: TabHistory, location: TabLocation): TabHistory {
  const entries = [...history.entries];
  entries[history.index] = location;
  return { entries, index: history.index };
}

function isDraftKey(key: string | undefined): boolean {
  return Boolean(key?.startsWith('draft:'));
}

/**
 * 탭 상태 변화를 기록에 반영한다. 기록 규칙:
 * - 경로(pathname)가 바뀌면 한 칸 쌓는다. 앞으로 갈 기록은 버린다.
 * - 검색 조건처럼 같은 화면 안의 주소만 바뀌면 지금 칸을 바꿔 쓴다.
 * - 새로 만든 입력 화면이 저장되어 실제 업무로 바뀌면 지금 칸을 바꿔 쓴다.
 *   뒤로 갔을 때 빈 입력 화면이 다시 나오지 않게 하려는 것이다.
 * - 뒤로/앞으로가 요청한 route가 도착하면 쌓지 않고 index만 옮긴다.
 */
export function reconcileTabHistories(
  state: TabHistoryState,
  prevTabs: readonly Tab[],
  nextTabs: readonly Tab[],
): TabHistoryState {
  const prevById = new Map(prevTabs.map((tab) => [tab.id, tab]));
  const nextIds = new Set(nextTabs.map((tab) => tab.id));
  const histories: Record<TabId, TabHistory> = {};
  const pending: Record<TabId, PendingTraversal> = {};
  let retired = state.retired;

  for (const tab of nextTabs) {
    const existing = state.histories[tab.id];
    const location = locationOf(tab);
    if (!existing) {
      histories[tab.id] = { entries: [location], index: 0 };
      continue;
    }

    const current = existing.entries[existing.index];
    const traversal = state.pending[tab.id];
    if (current && current.route === tab.route) {
      // 제목·종류만 바뀐 경우. 기록 메뉴의 이름이 최신이도록 맞춘다.
      histories[tab.id] =
        current.title === location.title &&
        current.kind === location.kind &&
        current.resourceKey === location.resourceKey
          ? existing
          : replaceCurrent(existing, location);
      if (traversal && traversal.route !== tab.route) pending[tab.id] = traversal;
      continue;
    }

    if (traversal && traversal.route === tab.route) {
      const entries = [...existing.entries];
      entries[traversal.index] = location;
      histories[tab.id] = { entries, index: traversal.index };
      continue;
    }

    const previous = prevById.get(tab.id);
    const savedDraft =
      isDraftKey(previous?.resourceKey ?? current?.resourceKey) &&
      !isDraftKey(location.resourceKey);
    const sameScreen =
      current !== undefined &&
      getTabPathname(current.route) === getTabPathname(tab.route);
    histories[tab.id] =
      savedDraft || sameScreen
        ? replaceCurrent(existing, location)
        : push(existing, location);
  }

  for (const id of Object.keys(state.histories)) {
    if (!nextIds.has(id)) retired = { ...retired, [id]: state.histories[id] };
  }

  return { histories, pending, retired };
}

/** 다시 열 수 있는 닫힌 탭의 기록만 남긴다. 창 이동으로 빠진 탭은 버린다. */
export function keepReopenableHistories(
  retired: Record<TabId, TabHistory>,
  groups: readonly ClosedTabGroup[],
): Record<TabId, TabHistory> {
  const reopenable = new Set(
    groups.flatMap((group) => group.tabs.map((entry) => entry.tab.id)),
  );
  const ids = Object.keys(retired);
  if (ids.every((id) => reopenable.has(id))) return retired;
  return Object.fromEntries(ids.filter((id) => reopenable.has(id)).map((id) => [id, retired[id]]));
}

export const useTabHistoryStore = create<TabHistoryState>(() => ({
  histories: {},
  pending: {},
  retired: {},
}));

useTabHistoryStore.setState((state) =>
  reconcileTabHistories(state, [], useTabStore.getState().tabs),
);
useTabStore.subscribe((state, prev) => {
  if (
    state.tabs === prev.tabs &&
    state.recentlyClosedTabs === prev.recentlyClosedTabs
  ) {
    return;
  }
  useTabHistoryStore.setState((history) => {
    const next =
      state.tabs === prev.tabs
        ? history
        : reconcileTabHistories(history, prev.tabs, state.tabs);
    // 인증 주체가 바뀌어 닫은 탭 목록이 비면 그 기록도 함께 버린다.
    return {
      ...next,
      retired: keepReopenableHistories(next.retired, state.recentlyClosedTabs),
    };
  });
});

export function canTraverse(
  history: TabHistory | undefined,
  direction: TabHistoryDirection,
): boolean {
  if (!history) return false;
  return direction === 'back'
    ? history.index > 0
    : history.index < history.entries.length - 1;
}

/** 지금 칸에서 가까운 순서로, 방향별 이동 가능한 칸의 index 목록 */
export function traversalTargets(
  history: TabHistory | undefined,
  direction: TabHistoryDirection,
  limit = 12,
): number[] {
  if (!history) return [];
  const result: number[] = [];
  if (direction === 'back') {
    for (let i = history.index - 1; i >= 0 && result.length < limit; i -= 1) {
      result.push(i);
    }
  } else {
    for (
      let i = history.index + 1;
      i < history.entries.length && result.length < limit;
      i += 1
    ) {
      result.push(i);
    }
  }
  return result;
}

export type TabHistoryNavigationResult =
  | 'navigated'
  | 'revealed'
  | 'opened-in-new-tab'
  /** 같은 업무 안의 이동인데 저장 전 입력이 있어 움직이지 않았다. */
  | 'blocked-by-unsaved-work'
  | 'ignored';

/**
 * 활성 탭(또는 지정한 탭)을 기록의 index 칸으로 옮긴다.
 * 저장 전 입력이 남아 있으면 그 탭을 덮어쓰지 않고 목적지를 새 탭으로 연다.
 * 사이드바 이동과 같은 규칙이다.
 */
export async function goToTabHistoryIndex(
  index: number,
  tabId?: TabId,
): Promise<TabHistoryNavigationResult> {
  const tabState = useTabStore.getState();
  const id = tabId ?? tabState.activeTabId;
  const tab = tabState.tabs.find((candidate) => candidate.id === id);
  if (!tab || !id) return 'ignored';
  const history = useTabHistoryStore.getState().histories[id];
  const target = history?.entries[index];
  if (!history || !target || index === history.index) return 'ignored';

  // 저장 전 입력은 세 곳에 있을 수 있다: 탭에 보관된 입력 초안(formDraft),
  // 셸 화면의 열린 편집기, 매물 상세 native 화면. 하나라도 있으면 덮어쓰지 않는다.
  const hasUnsavedWork =
    hasUnsavedFormDraft(tab) || (await activeTabHasUnsavedWork(tab));
  // 확인하는 사이 사용자가 다른 탭으로 옮겼다면 오래된 요청은 버린다.
  if (useTabStore.getState().activeTabId !== tabState.activeTabId) return 'ignored';

  if (hasUnsavedWork) {
    // 같은 업무의 다른 화면(예: 수정 → 보기)은 새 탭으로 열 수 없다. 탭 하나에
    // 한 업무 규칙 때문에 입력 중인 탭을 덮어쓰게 되므로 움직이지 않는다.
    const currentKey = tab.resourceKey ?? locationOf(tab).resourceKey;
    if (
      target.resourceKey === currentKey ||
      resolveTabResourceKey(target.route, id) === currentKey
    ) {
      return 'blocked-by-unsaved-work';
    }
    useTabStore.getState().navigateTab(
      id,
      {
        route: target.route,
        title: target.title,
        kind: target.kind,
        routeParams: target.routeParams,
      },
      { preserveSource: true },
    );
    return 'opened-in-new-tab';
  }

  if (target.route === tab.route) {
    useTabHistoryStore.setState((state) => ({
      histories: { ...state.histories, [id]: { ...history, index } },
    }));
    return 'navigated';
  }

  useTabHistoryStore.setState((state) => ({
    pending: { ...state.pending, [id]: { route: target.route, index } },
  }));
  const result = useTabStore.getState().restoreTabLocation(id, target);
  if (result.status !== 'navigated') {
    useTabHistoryStore.setState((state) => {
      const pending = { ...state.pending };
      delete pending[id];
      return { pending };
    });
  }
  return result.status === 'blocked' ? 'blocked-by-unsaved-work' : result.status;
}

export function navigateTabHistory(
  direction: TabHistoryDirection,
  tabId?: TabId,
): Promise<TabHistoryNavigationResult> {
  const id = tabId ?? useTabStore.getState().activeTabId;
  const history = id ? useTabHistoryStore.getState().histories[id] : undefined;
  if (!history || !canTraverse(history, direction)) {
    return Promise.resolve('ignored');
  }
  const index = direction === 'back' ? history.index - 1 : history.index + 1;
  return goToTabHistoryIndex(index, id ?? undefined);
}

/** 가장 최근에 닫은 탭 묶음을 다시 열고, 닫기 전 방문 기록을 이어 붙인다. */
export function reopenLastClosedTabs(): TabId | null {
  // 다시 열면 그 묶음이 닫은 목록에서 빠져 기록도 정리되므로 먼저 챙겨 둔다.
  const savedHistories = { ...useTabHistoryStore.getState().retired };
  const reopened = useTabStore.getState().reopenClosedTabs();
  if (reopened.length === 0) return null;
  useTabHistoryStore.setState((state) => {
    const histories = { ...state.histories };
    for (const { previousTabId, tabId, revealed } of reopened) {
      const saved = savedHistories[previousTabId];
      if (!saved || revealed) continue;
      // 탭 id에 묶인 launcher·draft identity는 새 id 기준으로 바꾼다.
      const entries = saved.entries.map((entry) => {
        if (entry.resourceKey.startsWith('launcher:')) {
          return { ...entry, resourceKey: tabResourceKeys.launcher(tabId) };
        }
        if (entry.resourceKey.startsWith('draft:')) {
          return { ...entry, resourceKey: resolveTabResourceKey(entry.route, tabId) };
        }
        return entry;
      });
      histories[tabId] = { entries, index: saved.index };
    }
    return { histories };
  });
  return reopened[0]?.tabId ?? null;
}

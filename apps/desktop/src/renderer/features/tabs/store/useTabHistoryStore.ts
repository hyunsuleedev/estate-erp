import { create } from 'zustand';
import {
  createEmptyTabHistoryState,
  type TabHistoryState,
} from '../../../../common/tabs/tabHistory';
import {
  createTabHistoryActions,
  installTabHistorySync,
} from '../../../../common/tabs/tabStoreBindings';
import { activeTabHasUnsavedWork } from '../lib/unsavedWork';
import { useTabStore } from './useTabStore';

/**
 * 화면 쪽 방문 기록 store. 기록 규칙은 `src/common/tabs/tabHistory.ts`에 있고, 여기서는
 * 탭 store의 변화를 따라가게 붙이기만 한다.
 */
export {
  TAB_HISTORY_LIMIT,
  canTraverse,
  keepReopenableHistories,
  locationOf,
  reconcileTabHistories,
  traversalTargets,
} from '../../../../common/tabs/tabHistory';
export type {
  TabHistory,
  TabHistoryNavigationResult,
} from '../../../../common/tabs/tabHistory';

export const useTabHistoryStore = create<TabHistoryState>(() =>
  createEmptyTabHistoryState(),
);

installTabHistorySync(useTabStore, useTabHistoryStore);

export const { goToTabHistoryIndex, navigateTabHistory, reopenLastClosedTabs } =
  createTabHistoryActions(useTabStore, useTabHistoryStore, {
    hasUnsavedWork: () => activeTabHasUnsavedWork(),
  });

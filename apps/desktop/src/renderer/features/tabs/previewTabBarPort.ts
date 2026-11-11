import type { TabBarAction } from '../../../common/tabs/tabBarContract';
import type { TabBarPort, TabBarView } from '../../../common/tabs/tabBarPort';
import { adjacentHistoryIndex, canTraverse } from '../../../common/tabs/tabHistory';
import { hasUnsavedFormDraft } from '../../../common/tabs/tabWorkspace';
import {
  openLocationInNewTab,
  openNewTab,
  rendererPlatform,
  runHistoryNavigation,
  runTabCommand,
} from './lib/tabCommands';
import { reopenLastClosedTabs, useTabHistoryStore } from './store/useTabHistoryStore';
import { useTabStore } from './store/useTabStore';

/**
 * 브라우저 단독 미리보기(main이 없다)의 탭바: 이 문서의 탭 store가 탭 목록의 주인이다.
 * Electron에서는 탭 목록의 주인이 main이고 탭바는 따로 있는 작은 문서(src/tabbar)가
 * 그리므로, 이 파일은 쓰이지 않는다.
 */

/** 브라우저 미리보기: 화면 안의 탭 store를 같은 모양으로 보여 주고, 동작을 store에 적용한다. */
function createLocalTabBarPort(): TabBarPort {
  let sidebarOpen = true;
  const platform = rendererPlatform();
  const listeners = new Set<() => void>();

  const compute = (): TabBarView => {
    const { tabs, activeTabId, recentlyClosedTabs } = useTabStore.getState();
    const history = activeTabId
      ? useTabHistoryStore.getState().histories[activeTabId]
      : undefined;
    return {
      // main이 없으므로 창의 id도 없다. 0인 창의 탭은 다른 창이 받지 않는다.
      windowId: 0,
      windowKind: 'main',
      platform,
      fullscreen: false,
      sidebarOpen,
      canCreateTabs: true,
      canReopenClosed: recentlyClosedTabs.length > 0,
      tabs: tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        route: tab.route,
        kind: tab.kind,
        dirty: hasUnsavedFormDraft(tab),
      })),
      activeTabId,
      reservedSlot: null,
      history: {
        canGoBack: canTraverse(history, 'back'),
        canGoForward: canTraverse(history, 'forward'),
      },
    };
  };

  let view = compute();
  const refresh = () => {
    view = compute();
    for (const listener of [...listeners]) listener();
  };
  useTabStore.subscribe(refresh);
  useTabHistoryStore.subscribe(refresh);

  return {
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(action: TabBarAction) {
      const store = useTabStore.getState();
      switch (action.type) {
        case 'activate':
          store.activateTab(action.tabId);
          return;
        case 'close':
          store.closeTab(action.tabId);
          return;
        case 'close-others':
          store.closeOtherTabs(action.tabId);
          return;
        case 'close-left':
          store.closeTabsToLeft(action.tabId);
          return;
        case 'close-right':
          store.closeTabsToRight(action.tabId);
          return;
        case 'reorder': {
          const target = store.tabs[action.toIndex];
          if (target) store.reorderTabs(action.tabId, target.id);
          return;
        }
        case 'new-tab':
          openNewTab();
          return;
        case 'reopen-closed':
          reopenLastClosedTabs();
          return;
        case 'toggle-sidebar':
          sidebarOpen = !sidebarOpen;
          refresh();
          return;
        case 'history': {
          if (!action.inNewTab) {
            void runHistoryNavigation(action.direction);
            return;
          }
          const history = store.activeTabId
            ? useTabHistoryStore.getState().histories[store.activeTabId]
            : undefined;
          const index = adjacentHistoryIndex(history, action.direction);
          const location = index === null ? undefined : history?.entries[index];
          if (location) openLocationInNewTab(location);
          return;
        }
        case 'command':
          runTabCommand(action.command, { canCreateTabs: true });
          return;
        // 메뉴는 native 메뉴라 브라우저에는 없고, 창이 하나뿐이라 탭을 옮길 다른 창도 없다.
        case 'tab-menu':
        case 'history-menu':
        case 'adopt':
        case 'drop-outside':
          return;
      }
    },
  };
}

let previewPort: TabBarPort | null = null;

export function getPreviewTabBarPort(): TabBarPort {
  previewPort ??= createLocalTabBarPort();
  return previewPort;
}

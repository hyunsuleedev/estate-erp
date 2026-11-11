import {
  emptyTabBarState,
  type TabBarActionEnvelope,
  type TabBarState,
} from '../common/tabs/tabBarContract';
import type { TabBarBridgeLike } from '../common/tabs/tabBarPort';

/**
 * 개발 전용: main 없이 탭바 문서를 브라우저로 열었을 때 쓰는 본보기 상태. 화면 확인용이라
 * 고르기·닫기·순서 바꾸기·새 탭만 흉내 낸다. 패키지 빌드에는 들어가지 않는다.
 */
export function createPreviewTabBarBridge(): TabBarBridgeLike {
  const search = new URLSearchParams(window.location.search);
  let state: TabBarState = {
    ...emptyTabBarState(
      search.get('window') === 'detached' ? 'detached' : 'main',
      search.get('platform') ?? 'darwin',
    ),
    revision: 1,
    tabs: [
      { id: 'p1', title: '대시보드', route: '/dashboard', kind: 'dashboard', dirty: false },
      { id: 'p2', title: '매물관리', route: '/properties', kind: 'property', dirty: false },
      { id: 'p3', title: '고덕그라시움 101동 1503호', route: '/properties/x', kind: 'property', dirty: true },
      { id: 'p4', title: '연락처', route: '/contacts', kind: 'contact', dirty: false },
    ],
    activeTabId: 'p2',
    history: { canGoBack: true, canGoForward: false },
  };
  const listeners = new Set<(next: TabBarState) => void>();
  let created = 0;

  function apply({ seq, action }: TabBarActionEnvelope): void {
    let tabs = state.tabs;
    let activeTabId = state.activeTabId;
    let sidebarOpen = state.sidebarOpen;
    switch (action.type) {
      case 'activate':
        activeTabId = action.tabId;
        break;
      case 'close': {
        const index = tabs.findIndex((tab) => tab.id === action.tabId);
        tabs = tabs.filter((tab) => tab.id !== action.tabId);
        if (activeTabId === action.tabId) {
          activeTabId = (tabs[index] ?? tabs[index - 1] ?? tabs[0])?.id ?? null;
        }
        break;
      }
      case 'reorder': {
        const from = tabs.findIndex((tab) => tab.id === action.tabId);
        if (from >= 0) {
          const next = [...tabs];
          const [moved] = next.splice(from, 1);
          next.splice(action.toIndex, 0, moved);
          tabs = next;
        }
        break;
      }
      case 'new-tab': {
        created += 1;
        const id = `new-${created}`;
        tabs = [
          ...tabs,
          { id, title: '대시보드', route: '/dashboard', kind: 'dashboard', dirty: false },
        ];
        activeTabId = id;
        break;
      }
      case 'toggle-sidebar':
        sidebarOpen = !sidebarOpen;
        break;
      default:
        break;
    }
    state = {
      ...state,
      revision: state.revision + 1,
      ackSeq: Math.max(state.ackSeq, seq),
      tabs,
      activeTabId,
      sidebarOpen,
      canReopenClosed: tabs.length < 4,
    };
    for (const listener of [...listeners]) listener(state);
  }

  return {
    getState: () => state,
    onState(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },
    dispatch: apply,
  };
}

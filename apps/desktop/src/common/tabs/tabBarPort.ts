import type { TabId, WindowKind } from '@estate-erp/shared';
import type {
  TabBarAction,
  TabBarActionEnvelope,
  TabBarState,
  TabBarTab,
} from './tabBarContract';
import {
  createTabBarModel,
  issueTabBarAction,
  receiveTabBarState,
  reservedTabSlot,
  visibleActiveTabId,
  visibleTabs,
  type TabBarModel,
} from './tabBarModel';

/**
 * 탭바 부품이 보는 것. 탭 목록의 주인이 누구든(main, 브라우저 미리보기의 화면 안
 * store) 같은 부품이 그릴 수 있게 한 겹 둔다. React에 의존하지 않는다.
 */
export interface TabBarView {
  /** 이 창의 id. 탭을 끌 때 끌기에 실어 보낸다. 창이 하나뿐인 브라우저 미리보기는 0이다. */
  windowId: number;
  windowKind: WindowKind;
  platform: string;
  fullscreen: boolean;
  sidebarOpen: boolean;
  canCreateTabs: boolean;
  canReopenClosed: boolean;
  /** 지금 그릴 순서의 탭. */
  tabs: TabBarTab[];
  activeTabId: TabId | null;
  /** 다른 창의 탭을 놓은 칸. 탭 목록의 주인이 그 탭을 넣어 줄 때까지 비워 둔다. */
  reservedSlot: number | null;
  history: { canGoBack: boolean; canGoForward: boolean };
}

export interface TabBarPort {
  /** 바뀌기 전까지는 같은 객체를 돌려준다(React의 외부 store 규칙). */
  getView(): TabBarView;
  subscribe(listener: () => void): () => void;
  dispatch(action: TabBarAction): void;
}

/** preload가 내주는 탭바 통로(main과의 IPC). */
export interface TabBarBridgeLike {
  getState(): TabBarState | null;
  onState(callback: (state: TabBarState) => void): () => void;
  dispatch(envelope: TabBarActionEnvelope): void;
}

function viewOf(model: TabBarModel): TabBarView {
  const { server } = model;
  return {
    windowId: server.windowId,
    windowKind: server.windowKind,
    platform: server.platform,
    fullscreen: server.fullscreen,
    sidebarOpen: server.sidebarOpen,
    canCreateTabs: server.canCreateTabs,
    canReopenClosed: server.canReopenClosed,
    tabs: visibleTabs(model),
    activeTabId: visibleActiveTabId(model),
    reservedSlot: reservedTabSlot(model),
    history: server.history,
  };
}

/**
 * main이 탭 목록의 주인일 때의 탭바: main이 보낸 상태를 그리고, 사용자가 한 동작에
 * 순번을 달아 보낸다. 방금 한 선택과 끌어 놓은 결과는 답을 기다리지 않고 먼저 보여 준다.
 */
export function createBridgeTabBarPort(
  bridge: TabBarBridgeLike,
  fallback: TabBarState,
): TabBarPort {
  let model = createTabBarModel(bridge.getState() ?? fallback);
  let view = viewOf(model);
  const listeners = new Set<() => void>();

  const update = (next: TabBarModel) => {
    if (next === model) return;
    model = next;
    view = viewOf(model);
    for (const listener of [...listeners]) listener();
  };

  bridge.onState((state) => update(receiveTabBarState(model, state)));

  return {
    getView: () => view,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispatch(action) {
      const issued = issueTabBarAction(model, action);
      update(issued.model);
      if (issued.envelope) bridge.dispatch(issued.envelope);
    },
  };
}

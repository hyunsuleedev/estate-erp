import type { TabId } from '@estate-erp/shared';
import type {
  TabBarAction,
  TabBarActionEnvelope,
  TabBarState,
  TabBarTab,
} from './tabBarContract';

/**
 * 탭바 화면이 갖는 상태. React에 의존하지 않는 순수 함수다.
 *
 * 탭 목록의 주인은 main이다. 탭바는 main이 보낸 상태(server)를 그리되, 사용자가
 * 방금 한 동작은 main의 답을 기다리지 않고 먼저 보여 준다:
 * - 탭을 고르면 바로 그 탭을 켠 것처럼 그린다.
 * - 탭을 끌어 놓으면 놓은 순서를 그대로 유지한다.
 * - 탭을 탭 줄 밖에 놓으면 그 탭을 이 줄에서 뺀 것처럼 그린다(main이 옮기지 않기로
 *   하면 답과 함께 돌아온다).
 * - 다른 창의 탭을 이 줄에 놓으면 main이 넣어 줄 때까지 그 칸을 비워 둔다.
 *
 * main의 상태는 다른 이유(제목 변경 등)로도 온다. 그 상태가 내가 보낸 동작을 이미
 * 반영한 것인지는 순번으로 안다: 동작마다 순번(seq)을 달아 보내고, main은 반영한
 * 마지막 순번(ackSeq)을 상태에 실어 준다. ackSeq가 내 순번에 닿기 전의 상태로는
 * 먼저 보여 준 것을 되돌리지 않는다. 그래서 놓은 탭이 잠깐 제자리로 튀지 않는다.
 */
export interface TabBarModel {
  /** main이 마지막으로 보낸 상태. */
  server: TabBarState;
  /** 다음에 보낼 동작의 순번. */
  nextSeq: number;
  /** 먼저 보여 준 순서와, 그 순서를 만든 동작의 순번. */
  pendingOrder: { seq: number; ids: TabId[] } | null;
  /** 먼저 켜 보인 탭과, 그 동작의 순번. */
  pendingActive: { seq: number; tabId: TabId } | null;
  /** 탭 줄 밖에 놓아서 먼저 빼 보인 탭과, 그 동작의 순번. */
  pendingDetach: { seq: number; tabId: TabId } | null;
  /** 다른 창의 탭을 놓은 칸과, 그 동작의 순번. main이 탭을 넣어 줄 때까지 비워 둔다. */
  pendingAdopt: { seq: number; slot: number } | null;
}

export function createTabBarModel(initial: TabBarState): TabBarModel {
  return {
    server: initial,
    // 탭바 문서가 다시 떠도 main이 기억하는 순번보다 뒤에서 시작해야, 예전 순번의
    // 확인을 새 동작의 확인으로 착각하지 않는다.
    nextSeq: initial.ackSeq + 1,
    pendingOrder: null,
    pendingActive: null,
    pendingDetach: null,
    pendingAdopt: null,
  };
}

/** main이 보낸 상태를 받는다. 예전 상태(revision이 더 작음)는 버린다. */
export function receiveTabBarState(model: TabBarModel, state: TabBarState): TabBarModel {
  if (state.revision < model.server.revision) return model;
  const ids = new Set(state.tabs.map((tab) => tab.id));
  const pendingOrder =
    model.pendingOrder && state.ackSeq < model.pendingOrder.seq ? model.pendingOrder : null;
  const pendingActive =
    model.pendingActive &&
    state.ackSeq < model.pendingActive.seq &&
    ids.has(model.pendingActive.tabId)
      ? model.pendingActive
      : null;
  const pendingDetach =
    model.pendingDetach && state.ackSeq < model.pendingDetach.seq
      ? model.pendingDetach
      : null;
  const pendingAdopt =
    model.pendingAdopt && state.ackSeq < model.pendingAdopt.seq ? model.pendingAdopt : null;
  return {
    ...model,
    server: state,
    // main의 순번이 더 앞서 있으면(다른 문서가 보낸 동작) 그 뒤에서 이어 간다.
    nextSeq: Math.max(model.nextSeq, state.ackSeq + 1),
    pendingOrder,
    pendingActive,
    pendingDetach,
    pendingAdopt,
  };
}

/**
 * 지금 그릴 탭 순서. 먼저 보여 준 순서가 있으면 그 순서를 따르고, 탭 줄 밖에 놓은 탭은
 * main의 답이 올 때까지 뺀다.
 */
export function visibleTabs(model: TabBarModel): TabBarTab[] {
  const detached = model.pendingDetach?.tabId;
  const tabs =
    detached === undefined
      ? model.server.tabs
      : model.server.tabs.filter((tab) => tab.id !== detached);
  if (!model.pendingOrder) return tabs;
  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const ordered: TabBarTab[] = [];
  for (const id of model.pendingOrder.ids) {
    const tab = byId.get(id);
    if (tab) {
      ordered.push(tab);
      byId.delete(id);
    }
  }
  // 그사이 새로 생긴 탭은 main이 둔 순서대로 뒤에 붙인다.
  for (const tab of tabs) if (byId.has(tab.id)) ordered.push(tab);
  return ordered;
}

export function visibleActiveTabId(model: TabBarModel): TabId | null {
  const active = model.pendingActive?.tabId ?? model.server.activeTabId;
  // 탭 줄 밖에 놓아 먼저 빼 보인 탭은 켜진 탭으로도 그리지 않는다.
  return active !== null && active === model.pendingDetach?.tabId ? null : active;
}

/** 다른 창의 탭을 놓아 비워 둔 칸. 없으면 null. */
export function reservedTabSlot(model: TabBarModel): number | null {
  return model.pendingAdopt?.slot ?? null;
}

/** 탭을 목록의 그 자리로 옮긴 순서. 없는 탭이면 그대로다. */
export function reorderedIds(ids: readonly TabId[], tabId: TabId, toIndex: number): TabId[] {
  const from = ids.indexOf(tabId);
  if (from < 0) return [...ids];
  const target = Math.max(0, Math.min(Math.trunc(toIndex), ids.length - 1));
  const next = [...ids];
  next.splice(from, 1);
  next.splice(target, 0, tabId);
  return next;
}

/**
 * 사용자가 한 동작을 main에 보낼 봉투로 만들고, 먼저 보여 줄 것을 모델에 반영한다.
 * 보낼 필요가 없는 동작(이미 켜진 탭을 다시 고름, 제자리에 놓음)은 envelope가 null이다.
 */
export function issueTabBarAction(
  model: TabBarModel,
  action: TabBarAction,
): { model: TabBarModel; envelope: TabBarActionEnvelope | null } {
  const tabs = visibleTabs(model);
  switch (action.type) {
    case 'activate': {
      if (!tabs.some((tab) => tab.id === action.tabId)) return { model, envelope: null };
      if (visibleActiveTabId(model) === action.tabId) return { model, envelope: null };
      const seq = model.nextSeq;
      return {
        model: {
          ...model,
          nextSeq: seq + 1,
          pendingActive: { seq, tabId: action.tabId },
        },
        envelope: { seq, action },
      };
    }
    case 'reorder': {
      const ids = tabs.map((tab) => tab.id);
      const next = reorderedIds(ids, action.tabId, action.toIndex);
      if (next.every((id, index) => id === ids[index])) return { model, envelope: null };
      const seq = model.nextSeq;
      return {
        model: { ...model, nextSeq: seq + 1, pendingOrder: { seq, ids: next } },
        envelope: {
          seq,
          // main에는 놓은 뒤의 실제 자리를 보낸다(범위를 벗어난 값을 다듬은 것).
          action: { ...action, toIndex: next.indexOf(action.tabId) },
        },
      };
    }
    case 'drop-outside': {
      // 이 줄에 보이는 탭만 놓을 수 있다. 앞선 놓기의 답을 기다리는 중이면 보내지 않는다.
      if (model.pendingDetach || !tabs.some((tab) => tab.id === action.tabId)) {
        return { model, envelope: null };
      }
      const seq = model.nextSeq;
      return {
        model: {
          ...model,
          nextSeq: seq + 1,
          pendingDetach: { seq, tabId: action.tabId },
        },
        envelope: { seq, action },
      };
    }
    case 'adopt': {
      // 이미 이 줄에 있는 탭은 다른 창의 탭이 아니다.
      if (model.server.tabs.some((tab) => tab.id === action.tabId)) {
        return { model, envelope: null };
      }
      const slot = Math.max(0, Math.min(Math.trunc(action.toIndex), tabs.length));
      const seq = model.nextSeq;
      return {
        model: { ...model, nextSeq: seq + 1, pendingAdopt: { seq, slot } },
        envelope: { seq, action: { ...action, toIndex: slot } },
      };
    }
    default: {
      const seq = model.nextSeq;
      return { model: { ...model, nextSeq: seq + 1 }, envelope: { seq, action } };
    }
  }
}

/** 창 꾸밈에 필요한 여백. macOS 신호등과 Windows 창 버튼 자리를 비운다. */
export function tabBarChrome(state: Pick<TabBarState, 'platform' | 'fullscreen'>): {
  /** macOS에서 창 왼쪽 위 신호등 버튼 자리(전체 화면에서는 없다). */
  reserveTrafficLights: boolean;
  /** Windows에서 창 오른쪽 위 버튼 자리. */
  reserveWindowControls: boolean;
} {
  return {
    reserveTrafficLights: state.platform === 'darwin' && !state.fullscreen,
    reserveWindowControls: state.platform === 'win32',
  };
}

/** 탭바의 치수(문서 좌표). src/tabbar/TabBarWindow.tsx와 탭 부품이 이 값으로 그린다. */
export const TAB_BAR_METRICS = {
  /** 탭 줄(타이틀바)의 높이. */
  height: 40,
  /** 탭의 높이. 탭은 탭 줄의 바닥에 붙어 타이틀바의 아래 선(맨 아래 1px)을 덮는다. */
  tabHeight: 36,
  /** 분리된 창의 왼쪽 여백: macOS 신호등 자리 / 그 밖. */
  trafficLightInset: 92,
  edgeInset: 16,
  /** 분리된 창의 뒤로/앞으로 버튼 칸(버튼 24 + 간격 4 + 버튼 24 + 오른쪽 여백 8). */
  detachedNavigationWidth: 60,
} as const;

/**
 * 탭 하나를 가진 분리된 창에서 그 탭이 놓이는 자리(문서 좌표, 탭의 왼쪽 위 모서리).
 * 탭을 놓아 새 창을 만들 때 탭이 마우스 밑에 오도록 창의 자리를 정하는 데 쓴다.
 */
export function detachedTabOrigin(platform: string): { x: number; y: number } {
  const inset =
    platform === 'darwin' ? TAB_BAR_METRICS.trafficLightInset : TAB_BAR_METRICS.edgeInset;
  return {
    x: inset + TAB_BAR_METRICS.detachedNavigationWidth,
    y: TAB_BAR_METRICS.height - TAB_BAR_METRICS.tabHeight,
  };
}

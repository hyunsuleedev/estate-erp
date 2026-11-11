import type { TabId, TabKind, WindowKind } from '@estate-erp/shared';
import { isInternalRoute } from '../internalRoute';
import { isTabCommand, type TabCommand, type TabHistoryDirection } from '../tabCommands';

/**
 * 탭바 화면과 main 사이의 계약.
 *
 * 탭 목록의 주인은 main이다. 탭바 화면은 main이 보내 준 상태를 그리고, 사용자가
 * 한 동작을 main에 알리기만 한다. 탭바 화면에는 앱 코드·라우터·로그인이 없다.
 *
 * - `tabbar:bootstrap` (동기): 탭바 문서가 뜰 때 preload가 첫 상태를 받는다.
 *   첫 화면부터 탭이 그려지게 하기 위해서다.
 * - `tabbar:state`: 상태가 바뀔 때마다 main이 보낸다.
 * - `tabbar:action`: 탭바가 보낸 동작. 순번(seq)을 달아 보내고, main은 어디까지
 *   반영했는지를 상태의 `ackSeq`로 알려 준다.
 */
export const TAB_BAR_CHANNELS = {
  bootstrap: 'tabbar:bootstrap',
  state: 'tabbar:state',
  action: 'tabbar:action',
} as const;

export interface TabBarTab {
  id: TabId;
  title: string;
  /** 아이콘은 주소로 정한다(src/common/tabs/routeMeta.ts). */
  route: string;
  kind: TabKind;
  /** 저장하지 않은 입력 초안이 탭에 보관되어 있다. */
  dirty: boolean;
  /** 탭 화면을 두 번 띄우지 못했다. 탭 메뉴에서 다시 불러올 수 있다. */
  failed?: boolean;
}

export interface TabBarState {
  schemaVersion: 1;
  /**
   * 이 창의 id. 탭을 끌 때 "어느 창의 탭인지"를 끌기에 실어 보내는 데 쓴다. main은 이 값을
   * 그대로 믿지 않고 탭 목록에서 다시 확인한다.
   */
  windowId: number;
  /** 이 창의 탭바 상태가 바뀔 때마다 올라간다. */
  revision: number;
  /** 이 창의 탭바가 보낸 동작 중 main이 반영한 마지막 순번. */
  ackSeq: number;
  windowKind: WindowKind;
  platform: string;
  fullscreen: boolean;
  sidebarOpen: boolean;
  canCreateTabs: boolean;
  canReopenClosed: boolean;
  tabs: TabBarTab[];
  activeTabId: TabId | null;
  history: { canGoBack: boolean; canGoForward: boolean };
}

export interface TabBarPoint {
  x: number;
  y: number;
}

export type TabBarAction =
  | {
      type: 'activate' | 'close' | 'close-others' | 'close-left' | 'close-right' | 'tab-menu';
      tabId: TabId;
    }
  /** 탭을 목록의 그 자리로 옮긴다(끌어 놓은 결과). */
  | { type: 'reorder'; tabId: TabId; toIndex: number }
  | { type: 'new-tab' }
  | { type: 'reopen-closed' }
  | { type: 'toggle-sidebar' }
  /** 뒤로/앞으로 한 칸. inNewTab이면 그 화면을 새 탭으로 연다(Cmd/Ctrl+클릭). */
  | { type: 'history'; direction: TabHistoryDirection; inNewTab?: boolean }
  | { type: 'history-menu'; direction: TabHistoryDirection }
  /** 마우스 사이드 버튼처럼 탭바 화면이 받은 탭 명령. */
  | { type: 'command'; command: TabCommand }
  /**
   * 다른 창에서 끌어 온 탭을 이 창의 탭 줄에 놓았다: 그 탭을 이 창의 그 자리로 옮긴다.
   * `sourceWindowId`는 끌기에 실려 온 값이다. main은 그 탭이 정말 그 창에 있는지 확인한다.
   */
  | { type: 'adopt'; tabId: TabId; sourceWindowId: number; toIndex: number }
  /**
   * 이 창의 탭을 끌다가 탭 줄이 아닌 곳에서 끝났다(손을 뗐거나 취소했다). main이 그 자리를
   * 보고 새 창으로 옮길지, 아무것도 하지 않을지 정한다.
   */
  | {
      type: 'drop-outside';
      tabId: TabId;
      /** 끌기가 끝난 자리. 이 문서 안의 좌표(창 밖이면 범위를 벗어난 값)다. */
      client: TabBarPoint;
      /** 탭 안에서 잡은 자리(탭의 왼쪽 위 모서리부터). 새 창의 탭이 마우스 밑에 오게 한다. */
      grabOffset: TabBarPoint;
      /** 앱의 화면이 그 끌기를 받았는지(dropEffect가 none이 아님). */
      accepted: boolean;
      /** 끌기 이벤트가 알려 준 화면 좌표. 자리 계산에는 쓰지 않고 개발 기록에만 남긴다. */
      eventScreen?: TabBarPoint;
    };

export interface TabBarActionEnvelope {
  /** 탭바 화면이 매기는 순번. 첫 상태의 `ackSeq` 다음 수부터 1씩 늘린다. */
  seq: number;
  action: TabBarAction;
}

export const TAB_BAR_LIMITS = {
  tabId: 200,
  title: 500,
  route: 4_096,
  tabs: 2_000,
  /** 좌표의 절댓값 상한. 모니터 여러 대를 이어 붙여도 이보다 작다. */
  coordinate: 100_000,
} as const;

const TAB_KINDS = new Set<TabKind>([
  'home',
  'property',
  'contact',
  'consultation',
  'deal',
  'match',
  'task',
  'calendar',
  'site',
  'contract',
  'cashflow',
  'employee',
  'settings',
  'dashboard',
  'generic',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isDirection(value: unknown): value is TabHistoryDirection {
  return value === 'back' || value === 'forward';
}

function isCoordinate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= TAB_BAR_LIMITS.coordinate
  );
}

function parsePoint(value: unknown): TabBarPoint | null {
  if (!isRecord(value)) return null;
  const { x, y } = value;
  return isCoordinate(x) && isCoordinate(y) ? { x, y } : null;
}

/** 탭 안에서 잡은 자리: 음수가 아니고 탭 한 칸보다 터무니없이 크지 않다. */
function parseGrabOffset(value: unknown): TabBarPoint | null {
  const point = parsePoint(value);
  return point && point.x >= 0 && point.y >= 0 && point.x <= 4_096 && point.y <= 4_096
    ? point
    : null;
}

function isWindowId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** 탭바 화면이 보낸 동작. 아는 필드만 남기고, 모양이 다르면 null이다. */
export function parseTabBarAction(value: unknown): TabBarAction | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  switch (value.type) {
    case 'activate':
    case 'close':
    case 'close-others':
    case 'close-left':
    case 'close-right':
    case 'tab-menu':
      return isId(value.tabId, TAB_BAR_LIMITS.tabId)
        ? { type: value.type, tabId: value.tabId }
        : null;
    case 'reorder':
      return isId(value.tabId, TAB_BAR_LIMITS.tabId) &&
        isCount(value.toIndex) &&
        value.toIndex < TAB_BAR_LIMITS.tabs
        ? { type: 'reorder', tabId: value.tabId, toIndex: value.toIndex }
        : null;
    case 'new-tab':
      return { type: 'new-tab' };
    case 'reopen-closed':
      return { type: 'reopen-closed' };
    case 'toggle-sidebar':
      return { type: 'toggle-sidebar' };
    case 'history': {
      if (!isDirection(value.direction)) return null;
      if (value.inNewTab !== undefined && typeof value.inNewTab !== 'boolean') return null;
      return {
        type: 'history',
        direction: value.direction,
        ...(value.inNewTab ? { inNewTab: true } : {}),
      };
    }
    case 'history-menu':
      return isDirection(value.direction)
        ? { type: 'history-menu', direction: value.direction }
        : null;
    case 'command':
      return isTabCommand(value.command)
        ? { type: 'command', command: value.command }
        : null;
    case 'adopt':
      return isId(value.tabId, TAB_BAR_LIMITS.tabId) &&
        isWindowId(value.sourceWindowId) &&
        isCount(value.toIndex) &&
        value.toIndex < TAB_BAR_LIMITS.tabs
        ? {
            type: 'adopt',
            tabId: value.tabId,
            sourceWindowId: value.sourceWindowId,
            toIndex: value.toIndex,
          }
        : null;
    case 'drop-outside': {
      const client = parsePoint(value.client);
      const grabOffset = parseGrabOffset(value.grabOffset);
      if (
        !isId(value.tabId, TAB_BAR_LIMITS.tabId) ||
        !client ||
        !grabOffset ||
        typeof value.accepted !== 'boolean'
      ) {
        return null;
      }
      // 기록용 좌표는 모양이 맞을 때만 남긴다. 틀려도 동작을 버리지는 않는다.
      const eventScreen = parsePoint(value.eventScreen);
      return {
        type: 'drop-outside',
        tabId: value.tabId,
        client,
        grabOffset,
        accepted: value.accepted,
        ...(eventScreen ? { eventScreen } : {}),
      };
    }
    default:
      return null;
  }
}

export function parseTabBarActionEnvelope(value: unknown): TabBarActionEnvelope | null {
  if (!isRecord(value) || !isCount(value.seq)) return null;
  const action = parseTabBarAction(value.action);
  return action ? { seq: value.seq, action } : null;
}

function isTabBarTab(value: unknown): value is TabBarTab {
  return (
    isRecord(value) &&
    isId(value.id, TAB_BAR_LIMITS.tabId) &&
    typeof value.title === 'string' &&
    value.title.length <= TAB_BAR_LIMITS.title &&
    isInternalRoute(value.route, TAB_BAR_LIMITS.route) &&
    TAB_KINDS.has(value.kind as TabKind) &&
    typeof value.dirty === 'boolean' &&
    (value.failed === undefined || typeof value.failed === 'boolean')
  );
}

/** main이 보낸 상태가 약속한 모양인지. 탭바 화면이 그리기 전에 확인한다. */
export function isTabBarState(value: unknown): value is TabBarState {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (!isCount(value.windowId)) return false;
  if (!isCount(value.revision) || !isCount(value.ackSeq)) return false;
  if (value.windowKind !== 'main' && value.windowKind !== 'detached') return false;
  if (typeof value.platform !== 'string') return false;
  for (const key of ['fullscreen', 'sidebarOpen', 'canCreateTabs', 'canReopenClosed']) {
    if (typeof value[key] !== 'boolean') return false;
  }
  if (
    !Array.isArray(value.tabs) ||
    value.tabs.length > TAB_BAR_LIMITS.tabs ||
    !value.tabs.every(isTabBarTab)
  ) {
    return false;
  }
  const ids = new Set(value.tabs.map((tab) => tab.id));
  if (ids.size !== value.tabs.length) return false;
  if (value.activeTabId !== null) {
    if (typeof value.activeTabId !== 'string' || !ids.has(value.activeTabId)) return false;
  }
  return (
    isRecord(value.history) &&
    typeof value.history.canGoBack === 'boolean' &&
    typeof value.history.canGoForward === 'boolean'
  );
}

/**
 * 창이 아직 탭을 갖기 전(또는 로그아웃 뒤)의 빈 상태. 창의 id를 모르는 곳(main이 없는
 * 브라우저 미리보기)에서는 0이다: 0인 창의 탭은 다른 창이 받지 않는다.
 */
export function emptyTabBarState(
  windowKind: WindowKind,
  platform: string,
  windowId = 0,
): TabBarState {
  return {
    schemaVersion: 1,
    windowId,
    revision: 0,
    ackSeq: 0,
    windowKind,
    platform,
    fullscreen: false,
    sidebarOpen: true,
    canCreateTabs: windowKind === 'main',
    canReopenClosed: false,
    tabs: [],
    activeTabId: null,
    history: { canGoBack: false, canGoForward: false },
  };
}

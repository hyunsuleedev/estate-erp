import type { Tab, TabId, WindowKind } from '@estate-erp/shared';
import type { WindowToast } from '../../common/callOverlay';
import type { NativeTabAction } from '../../common/nativeTabActions';
import { isTabScreenRoute } from '../../common/nativeTabs';
import type {
  TabCommand,
  TabHistoryDirection,
  TabMenuItem,
} from '../../common/tabCommands';
import { getRouteMetaCore } from '../../common/tabs/routeMeta';
import type {
  TabBarAction,
  TabBarActionEnvelope,
  TabBarState,
} from '../../common/tabs/tabBarContract';
import { detachedTabOrigin } from '../../common/tabs/tabBarModel';
import {
  adjacentHistoryIndex,
  canTraverse,
  traversalTargets,
  type TabHistoryNavigationResult,
} from '../../common/tabs/tabHistory';
import { resolveTabResourceKey } from '../../common/tabs/tabResource';
import {
  applyWorkspaceStep,
  createEmptyTabWindowState,
  navigateTabHistory,
  reopenLastClosedTabs,
  traverseTabHistory,
  type TabWindowState,
} from '../../common/tabs/tabWindowState';
import * as workspace from '../../common/tabs/tabWorkspace';
import type {
  CreateTabInput,
  TabStep,
  TabWorkspaceEnv,
} from '../../common/tabs/tabWorkspace';
import { planTabDrop, type ScreenPoint, type TabDropScene } from './tabDrop';

/**
 * 탭 목록의 주인(main 프로세스).
 *
 * 창마다 탭 목록·활성 탭·방문 기록·닫은 탭을 갖고, 탭을 창 사이로 옮기고, 탭이
 * 하나도 없을 때의 규칙과 저장 전 입력 보호를 여기서 한 번에 정한다. 탭바 화면과
 * 탭 화면은 동작을 요청하고 결과 상태를 받기만 한다.
 *
 * Electron에 의존하지 않는다. 창·탭 화면·메뉴·알림은 `TabRegistryHost`로 받는다.
 */

/** 탭 화면(WebContentsView)을 맡는 쪽. src/main/tabs/tabViewCoordinator.ts가 구현한다. */
export interface TabViewsPort {
  /**
   * 그 창에 이 탭의 화면을 보여 준다. 화면이 없으면 만들고(화면을 내렸던 탭 포함),
   * 주소가 다르면 화면 안에서 옮긴다. null이면 아무 탭 화면도 보여 주지 않는다.
   * 여러 번 부르면 창마다 마지막 요청만 반영한다.
   */
  present(windowId: number, tab: Tab | null): void;
  /** 그 탭의 화면이 있으면 없앤다. */
  discard(tabId: TabId): void;
  /** 떠 있는 탭 화면을 다시 불러오지 않고 다른 창으로 옮긴다. 화면이 없으면 아무것도 하지 않는다. */
  move(tabId: TabId, toWindowId: number): void;
  /**
   * 탭 화면이 저장 전 입력(열린 편집기, 진행 중인 저장, 아직 보고 전)을 알렸는지.
   * 화면이 없으면 false다.
   */
  hasUnsavedWork(windowId: number, tabId: TabId): boolean;
}

/** 탭을 놓은 자리에 맞춰 창을 둘 곳. */
export interface TabWindowPlacement {
  /** 창의 왼쪽 위 모서리. 탭이 마우스 밑에 오는 자리다. */
  position: ScreenPoint;
  /** 손을 뗀 자리. 창이 화면 밖으로 걸치지 않게 다듬을 때 어느 화면인지 정한다. */
  point: ScreenPoint;
}

export interface CreateTabWindowRequest {
  /** tab-drop: 탭을 탭 줄 밖에 놓아 생기는 창. standalone: 다른 탭을 건드리지 않고 새로 여는 창. */
  reason: 'tab-drop' | 'standalone';
  tab: Tab;
  sourceWindowId: number | null;
  /** tab-drop일 때 새 창을 둘 곳. */
  placement?: TabWindowPlacement;
}

export interface TabRegistryHost {
  readonly platform: string;
  views: TabViewsPort;
  /** 그 창의 탭바 화면에 상태를 보낸다. */
  publishState(windowId: number, state: TabBarState): void;
  /** 그 창의 탭 화면들에 사이드바 펼침 상태를 알린다. */
  publishSidebar(windowId: number, open: boolean): void;
  /**
   * 그 창에서 보이게 될 탭 화면에 알림을 띄운다. 탭 목록은 보여 줄 탭을 `views.present`로
   * 넘긴 뒤에 부른다. 받는 쪽은 그 보여 주기가 끝난 뒤, 그때 보이는 화면에 보내야 한다
   * (동작 도중에 보내면 곧 가려질 화면에 뜬다).
   */
  showToast(windowId: number, toast: WindowToast): void;
  /** native 메뉴를 띄우고 고른 항목의 id를 돌려준다. 취소하면 null. */
  showMenu(windowId: number, items: TabMenuItem[]): Promise<string | null>;
  /**
   * 탭 하나를 가진 새 창을 만든다. 만든 창의 id, 실패하면 null. 창은 탭 화면이 붙으면
   * 스스로 보이고 앞으로 나온다.
   */
  createWindow(request: CreateTabWindowRequest): number | null;
  /**
   * 메인 창을 만들고 `registerWindow(id, 'main')`으로 알린다. 로그인 세션이 끝났는데
   * 메인 창이 닫혀 있을 때 로그인 화면을 띄울 창을 만들려고 부른다.
   */
  openMainWindow(): void;
  closeWindow(windowId: number): void;
  /**
   * 탭을 탭 줄 밖에 놓았을 때 그 자리를 따지는 데 쓰는 창들의 자리. 끌기를 시작한 창이
   * 없어졌으면 null.
   */
  tabDropScene(sourceWindowId: number): TabDropScene | null;
  /** 창을 그 자리로 옮긴다(탭 하나뿐인 창의 탭을 놓았을 때 창째로 옮긴다). */
  moveWindow(windowId: number, placement: TabWindowPlacement): void;
  /** 창을 앞으로 가져온다. 아직 보여 주지 않은 새 창이면 보일 때 앞으로 나온다. */
  focusWindow(windowId: number): void;
}

export interface TabRegistryOptions {
  env?: TabWorkspaceEnv;
}

interface WindowRecord {
  kind: WindowKind;
  tabs: TabWindowState;
  sidebarOpen: boolean;
  fullscreen: boolean;
  revision: number;
  ackSeq: number;
  /** 한 번이라도 탭을 가졌는지. 처음 여는 대시보드와 나중에 다시 여는 대시보드를 구분한다. */
  initialized: boolean;
  /** 마지막으로 보낸 상태(순번 제외). 같으면 다시 보내지 않는다. */
  publishedKey: string | null;
}

export type OpenStandaloneTabResult =
  | { ok: true; windowId: number; tabId: TabId }
  | { ok: false; error: string };

/** host가 보여 주기 도중에 계속 되보고해도 끝없이 돌지 않게 하는 상한. */
const SETTLE_PASS_LIMIT = 8;
const DASHBOARD_ROUTE = workspace.NEW_TAB_ROUTE;

const TAB_MENU = {
  reload: 'reload',
  reopen: 'reopen',
  close: 'close',
  closeOthers: 'close-others',
  closeLeft: 'close-left',
  closeRight: 'close-right',
} as const;

export class TabRegistry {
  private readonly windows = new Map<number, WindowRecord>();
  /** 탭은 한 번에 한 창에만 있다. */
  private readonly tabWindow = new Map<TabId, number>();
  /** 탭 화면이 마지막으로 알린 자기 주소. 늦게 도착한 입력 초안을 가릴 때 쓴다. */
  private readonly viewRoutes = new Map<TabId, string>();
  private readonly viewFailures = new Map<TabId, number>();
  private readonly failedTabs = new Set<TabId>();
  private readonly env: TabWorkspaceEnv;

  private sessionActive = false;
  private mainWindowId: number | null = null;
  private lastSidebarOpen = true;

  private depth = 0;
  private readonly touched = new Set<number>();
  private readonly toPresent = new Set<number>();
  /** 동작 도중에 생긴 알림. 탭 화면을 보여 주라고 한 뒤에 host에 넘긴다. */
  private readonly pendingToasts: Array<{ windowId: number; toast: WindowToast }> = [];

  constructor(
    private readonly host: TabRegistryHost,
    options: TabRegistryOptions = {},
  ) {
    this.env = options.env ?? workspace.defaultTabWorkspaceEnv;
  }

  // -------------------------------------------------------------------------
  // 창과 로그인 세션
  // -------------------------------------------------------------------------

  registerWindow(
    windowId: number,
    kind: WindowKind,
    options: { fullscreen?: boolean } = {},
  ): void {
    this.transact(() => {
      if (this.windows.has(windowId)) return;
      this.windows.set(windowId, {
        kind,
        tabs: createEmptyTabWindowState(),
        sidebarOpen: this.lastSidebarOpen,
        fullscreen: options.fullscreen ?? false,
        revision: 0,
        ackSeq: 0,
        initialized: false,
        publishedKey: null,
      });
      if (kind === 'main' && this.mainWindowId === null) this.mainWindowId = windowId;
      this.touched.add(windowId);
    });
  }

  /** 창이 닫혔다. 그 창의 탭과 닫은 탭 기록은 함께 사라진다. */
  unregisterWindow(windowId: number): void {
    this.transact(() => {
      const record = this.windows.get(windowId);
      if (!record) return;
      for (const tab of record.tabs.workspace.tabs) this.forgetTab(tab.id);
      this.windows.delete(windowId);
      this.touched.delete(windowId);
      this.toPresent.delete(windowId);
      if (this.mainWindowId === windowId) this.mainWindowId = null;
    });
  }

  /** 사무소가 있는 사용자로 로그인했다. 메인 창에 첫 탭을 연다. */
  startSession(): void {
    this.transact(() => {
      this.sessionActive = true;
      for (const windowId of this.windows.keys()) this.touched.add(windowId);
    });
  }

  /**
   * 로그아웃했거나 사람·사무소가 바뀌었다. 이전 사무소의 탭·기록·닫은 탭·입력 초안을
   * 모두 버리고, 메인 창이 아닌 창은 닫는다.
   *
   * 메인 창을 닫아 두고 다른 창(매물 창 등)만 쓰고 있었다면, 그 창들을 닫기 전에 메인
   * 창을 먼저 만든다. 그러지 않으면 로그인 화면을 보여 줄 창이 하나도 남지 않고,
   * Windows에서는 창이 모두 닫히면서 앱이 끝난다. 열린 창이 하나도 없었으면(macOS에서
   * 창을 모두 닫아 둔 경우) 창을 새로 띄우지 않는다.
   */
  endSession(): void {
    this.transact(() => {
      this.sessionActive = false;
      if (this.mainWindowId === null && this.windows.size > 0) {
        this.host.openMainWindow();
      }
      // 창을 닫으라는 요청이 곧바로 unregisterWindow로 돌아와도 되게 사본을 돈다.
      for (const [windowId, record] of [...this.windows]) {
        for (const tab of record.tabs.workspace.tabs) this.forgetTab(tab.id);
        record.tabs = createEmptyTabWindowState();
        record.initialized = false;
        this.touched.add(windowId);
        this.toPresent.add(windowId);
        if (record.kind !== 'main') this.host.closeWindow(windowId);
      }
    });
  }

  isSessionActive(): boolean {
    return this.sessionActive;
  }

  getMainWindowId(): number | null {
    return this.mainWindowId;
  }

  hasWindow(windowId: number): boolean {
    return this.windows.has(windowId);
  }

  getWindowKind(windowId: number): WindowKind | null {
    return this.windows.get(windowId)?.kind ?? null;
  }

  // -------------------------------------------------------------------------
  // 읽기
  // -------------------------------------------------------------------------

  getBarState(windowId: number): TabBarState | null {
    const record = this.windows.get(windowId);
    return record ? this.barState(windowId, record) : null;
  }

  /** 탭 화면이 뜰 때 받는 자기 탭(주소, 제목, 입력 초안, 스크롤). */
  getTabSnapshot(tabId: TabId): Tab | null {
    const located = this.locate(tabId);
    return located ? structuredClone(located.tab) : null;
  }

  getWindowIdOfTab(tabId: TabId): number | null {
    return this.tabWindow.get(tabId) ?? null;
  }

  getTabs(windowId: number): readonly Tab[] {
    return this.windows.get(windowId)?.tabs.workspace.tabs ?? [];
  }

  getActiveTabId(windowId: number): TabId | null {
    return this.windows.get(windowId)?.tabs.workspace.activeTabId ?? null;
  }

  getSidebarOpen(windowId: number | null): boolean {
    if (windowId === null) return this.lastSidebarOpen;
    return this.windows.get(windowId)?.sidebarOpen ?? this.lastSidebarOpen;
  }

  // -------------------------------------------------------------------------
  // 탭바 화면이 보낸 동작
  // -------------------------------------------------------------------------

  dispatchBarAction(windowId: number, envelope: TabBarActionEnvelope): void {
    this.transact(() => {
      const record = this.windows.get(windowId);
      if (!record) return;
      if (envelope.seq > record.ackSeq) record.ackSeq = envelope.seq;
      // 받아들이지 않은 동작에도 답한다. 탭바가 먼저 보여 준 것(놓은 순서, 탭 줄 밖에
      // 놓아 빼 보인 탭)을 그 답을 보고 되돌린다.
      this.touched.add(windowId);
      // 로그인 전에는 탭이 없다. 늦게 도착한 예전 동작은 받았다고만 답한다.
      if (!this.sessionActive) return;
      this.applyBarAction(windowId, record, envelope.action);
    });
  }

  private applyBarAction(
    windowId: number,
    record: WindowRecord,
    action: TabBarAction,
  ): void {
    const state = record.tabs.workspace;
    switch (action.type) {
      case 'activate':
        this.step(windowId, workspace.activateTab(state, action.tabId));
        return;
      case 'close':
        this.step(windowId, workspace.closeTab(state, action.tabId, this.env));
        return;
      case 'close-others':
        this.step(windowId, workspace.closeOtherTabs(state, action.tabId, this.env));
        return;
      case 'close-left':
        this.step(
          windowId,
          workspace.closeTabsOnSide(state, action.tabId, 'left', this.env),
        );
        return;
      case 'close-right':
        this.step(
          windowId,
          workspace.closeTabsOnSide(state, action.tabId, 'right', this.env),
        );
        return;
      case 'reorder':
        this.step(windowId, workspace.moveTabToIndex(state, action.tabId, action.toIndex));
        return;
      case 'new-tab':
        this.runCommand(windowId, { type: 'new-tab' });
        return;
      case 'reopen-closed':
        this.runCommand(windowId, { type: 'reopen-closed-tab' });
        return;
      case 'toggle-sidebar':
        this.setSidebarOpen(windowId, !record.sidebarOpen);
        return;
      case 'history':
        if (action.inNewTab) this.openHistoryNeighbourInNewTab(windowId, action.direction);
        else this.runCommand(windowId, { type: 'history', direction: action.direction });
        return;
      case 'history-menu':
        void this.openHistoryMenu(windowId, action.direction);
        return;
      case 'tab-menu':
        void this.openTabMenu(windowId, action.tabId);
        return;
      case 'command':
        this.runCommand(windowId, action.command);
        return;
      case 'adopt':
        this.adoptTab(windowId, action);
        return;
      case 'drop-outside':
        this.dropTabOutside(windowId, record, action);
        return;
    }
  }

  /** 단축키·마우스 버튼·탭바 버튼의 탭 명령. */
  runCommand(windowId: number, command: TabCommand): void {
    this.transact(() => {
      const record = this.windows.get(windowId);
      // 로그인 화면에서 누른 단축키(새 탭 등)로 탭이 생기면 안 된다.
      if (!record || !this.sessionActive) return;
      const state = record.tabs.workspace;
      switch (command.type) {
        case 'history': {
          const result = this.commitWindow(
            windowId,
            navigateTabHistory(
              record.tabs,
              command.direction,
              { hasExternalUnsavedWork: this.activeTabHasUnsavedWork(windowId) },
              this.env,
            ),
          );
          this.reportHistoryResult(windowId, result);
          return;
        }
        case 'new-tab':
          // 분리된 창은 새 탭을 만들지 않는다. 옮겨 온 탭만 다룬다.
          if (record.kind === 'main') {
            this.step(windowId, workspace.openNewTab(state, this.env));
          }
          return;
        case 'close-tab':
          if (state.activeTabId) {
            this.step(windowId, workspace.closeTab(state, state.activeTabId, this.env));
          }
          return;
        case 'reopen-closed-tab':
          this.commitWindow(windowId, reopenLastClosedTabs(record.tabs, this.env));
          return;
        case 'select-relative-tab':
          this.step(windowId, workspace.selectRelativeTab(state, command.offset));
          return;
        case 'select-tab-index':
          this.step(windowId, workspace.selectTabAtIndex(state, command.index));
          return;
      }
    });
  }

  // -------------------------------------------------------------------------
  // 탭 화면이 보낸 요청과 보고
  // -------------------------------------------------------------------------

  /**
   * 탭 화면 안의 페이지가 요청한 탭 작업. 어느 탭인지는 보낸 화면으로 정해지므로
   * 다른 탭을 건드릴 수 없다.
   */
  applyTabAction(tabId: TabId, action: NativeTabAction): void {
    this.transact(() => {
      const located = this.locate(tabId);
      if (!located) return;
      const { windowId, record } = located;
      const state = record.tabs.workspace;
      // 탭이 될 수 없는 주소(로그인·온보딩·문서 파일 등)로는 탭을 만들거나 옮기지 않는다.
      const route = routeOfTabAction(action);
      if (route !== null && !isTabScreenRoute(route)) return;
      switch (action.type) {
        case 'create-tab':
          this.step(windowId, workspace.createTab(state, action.input, this.env));
          return;
        case 'open-resource':
          this.step(windowId, workspace.openOrRevealResource(state, action.input, this.env));
          return;
        case 'open-module':
          this.step(windowId, workspace.openModule(state, action.input, this.env));
          return;
        case 'replace-resource':
          this.step(windowId, workspace.replaceTabResource(state, tabId, action.input));
          return;
        case 'navigate':
          // 사이드바 메뉴: 그 탭을 목적지로 옮기되, 저장 전 입력이 있으면 새 탭으로 연다.
          this.step(
            windowId,
            workspace.navigateTab(
              state,
              tabId,
              action.input,
              { preserveSource: this.host.views.hasUnsavedWork(windowId, tabId) },
              this.env,
            ),
          );
          return;
        case 'adopt-location': {
          const meta = getRouteMetaCore(action.route);
          this.step(
            windowId,
            workspace.adoptTabLocation(
              state,
              tabId,
              action.route,
              meta.kind,
              meta.title,
              undefined,
              this.env,
            ),
          );
          return;
        }
        case 'close':
          this.step(windowId, workspace.closeTab(state, tabId, this.env));
          return;
        case 'update-title':
          this.step(windowId, workspace.updateTabTitle(state, tabId, action.title));
          return;
        case 'update-form-draft':
          if (!this.viewShowsTabScreen(located.tab)) return;
          this.step(
            windowId,
            workspace.updateTabFormDraft(state, tabId, action.key, action.value),
            { fromView: true },
          );
          return;
        case 'clear-form-draft':
          if (!this.viewShowsTabScreen(located.tab)) return;
          this.step(windowId, workspace.clearTabFormDraft(state, tabId), {
            fromView: true,
          });
          return;
      }
    });
  }

  /**
   * 탭 화면이 스스로 옮긴 주소(검색 조건 변경, 주소 정리 등). 같은 화면이 그대로
   * 살아 있으므로 새 탭을 만들거나 다른 탭으로 돌리지 않고 제자리에서 반영한다.
   */
  reportViewLocation(tabId: TabId, route: string, title?: string): boolean {
    return this.transact(() => {
      const located = this.locate(tabId);
      // 받아들이지 않은 주소는 부른 쪽도 기록하지 않아야 한다(false).
      if (!located || !isTabScreenRoute(route)) return false;
      this.viewRoutes.set(tabId, route);
      this.viewFailures.delete(tabId);
      if (this.failedTabs.delete(tabId)) this.touched.add(located.windowId);
      const { tab, windowId, record } = located;
      if (tab.route === route) return true;
      const meta = getRouteMetaCore(route);
      const keepsCustomTitle =
        tab.resourceKey === resolveTabResourceKey(route, tabId) &&
        tab.title !== '...' &&
        tab.title !== getRouteMetaCore(tab.route).title;
      this.step(
        windowId,
        workspace.updateNativeTabLocation(
          record.tabs.workspace,
          tabId,
          route,
          meta.kind,
          title ?? (keepsCustomTitle ? tab.title : meta.title),
        ),
        { fromView: true },
      );
      return true;
    });
  }

  /** 탭 화면이 알린 스크롤 위치. 화면을 내렸다가 다시 띄울 때 되돌린다. */
  reportViewState(tabId: TabId, viewState: { scrollY?: number }): void {
    this.transact(() => {
      const located = this.locate(tabId);
      if (!located) return;
      if (viewState.scrollY === undefined) return;
      this.step(
        located.windowId,
        workspace.updateNativeTabSnapshot(located.record.tabs.workspace, {
          ...located.tab,
          uiState: { ...located.tab.uiState, scrollY: viewState.scrollY },
        }),
        { fromView: true },
      );
    });
  }

  /**
   * 탭 화면을 띄우지 못했거나 화면이 죽었다. 한 번은 화면을 새로 만들어 다시 띄우고,
   * 또 실패하면 탭은 남기되 실패로 표시한다(탭 메뉴에서 다시 불러올 수 있다).
   */
  reportViewFailure(tabId: TabId): void {
    this.transact(() => {
      const located = this.locate(tabId);
      if (!located) return;
      const failures = (this.viewFailures.get(tabId) ?? 0) + 1;
      this.viewFailures.set(tabId, failures);
      this.viewRoutes.delete(tabId);
      this.host.views.discard(tabId);
      if (failures >= 2) {
        this.failedTabs.add(tabId);
        this.touched.add(located.windowId);
        return;
      }
      if (located.record.tabs.workspace.activeTabId === tabId) {
        this.toPresent.add(located.windowId);
      }
    });
  }

  reloadTab(tabId: TabId): void {
    this.transact(() => {
      const located = this.locate(tabId);
      if (!located) return;
      this.viewFailures.delete(tabId);
      this.failedTabs.delete(tabId);
      this.viewRoutes.delete(tabId);
      this.host.views.discard(tabId);
      this.touched.add(located.windowId);
      if (located.record.tabs.workspace.activeTabId === tabId) {
        this.toPresent.add(located.windowId);
      }
    });
  }

  // -------------------------------------------------------------------------
  // 다른 곳에서 여는 요청
  // -------------------------------------------------------------------------

  /**
   * 주소를 메인 창에서 연다(전화 팝업의 링크 등). 지금 탭과 같은 업무면 그 탭에서,
   * 다른 업무면 이미 열린 탭을 보여 주거나 새 탭으로 연다.
   */
  openRoute(route: string, windowId: number | null = this.mainWindowId): boolean {
    return this.transact(() => {
      const record = windowId === null ? undefined : this.windows.get(windowId);
      if (windowId === null || !record || !this.sessionActive) return false;
      if (!isTabScreenRoute(route)) return false;
      const state = record.tabs.workspace;
      const meta = getRouteMetaCore(route);
      const active = state.tabs.find((tab) => tab.id === state.activeTabId);
      if (!active) {
        this.step(
          windowId,
          workspace.createTab(
            state,
            { route, kind: meta.kind, title: meta.title },
            this.env,
          ),
        );
        return true;
      }
      const keepsCustomTitle =
        active.resourceKey === resolveTabResourceKey(route, active.id) &&
        active.title !== '...' &&
        active.title !== getRouteMetaCore(active.route).title;
      this.step(
        windowId,
        workspace.adoptTabLocation(
          state,
          active.id,
          route,
          meta.kind,
          keepsCustomTitle ? active.title : meta.title,
          undefined,
          this.env,
        ),
      );
      return true;
    });
  }

  /** 다른 탭을 건드리지 않고, 탭 하나를 가진 새 창을 연다(매물 상세 새 창). */
  openStandaloneTab(
    input: CreateTabInput,
    sourceWindowId: number | null,
  ): OpenStandaloneTabResult {
    return this.transact((): OpenStandaloneTabResult => {
      if (!this.sessionActive) return { ok: false, error: 'not signed in' };
      if (!isTabScreenRoute(input.route)) return { ok: false, error: 'invalid route' };
      const created = workspace.createTab(
        workspace.createEmptyTabWorkspace(),
        input,
        this.env,
      );
      const tab = created.patch?.tabs?.[0];
      if (!tab) return { ok: false, error: 'failed to create the tab' };
      const windowId = this.host.createWindow({
        reason: 'standalone',
        tab,
        sourceWindowId,
      });
      if (windowId === null) return { ok: false, error: 'failed to create the window' };
      this.registerWindow(windowId, 'detached');
      const record = this.windows.get(windowId);
      if (!record) return { ok: false, error: 'window was not registered' };
      this.step(windowId, workspace.insertTab(record.tabs.workspace, tab));
      return { ok: true, windowId, tabId: tab.id };
    });
  }

  /** 탭을 다른 창으로 옮긴다. 떠 있는 탭 화면은 다시 불러오지 않고 따라간다. */
  moveTab(tabId: TabId, targetWindowId: number, index?: number): boolean {
    return this.transact(() => {
      const located = this.locate(tabId);
      const target = this.windows.get(targetWindowId);
      if (!located || !target || located.windowId === targetWindowId) return false;
      const { windowId: sourceWindowId, record: source, tab } = located;
      const carriedHistory = source.tabs.history.histories[tabId];

      // 소속을 먼저 바꿔 둔다. 그래야 원래 창에서 빠질 때 "닫힌 탭"으로 치워지지 않는다.
      this.tabWindow.set(tabId, targetWindowId);
      this.step(sourceWindowId, workspace.takeTab(source.tabs.workspace, tabId));

      const inserted = applyWorkspaceStep(
        target.tabs,
        workspace.insertTab(target.tabs.workspace, tab, index),
      );
      this.commit(
        targetWindowId,
        carriedHistory
          ? {
              ...inserted.state,
              history: {
                ...inserted.state.history,
                histories: {
                  ...inserted.state.history.histories,
                  [tabId]: carriedHistory,
                },
              },
            }
          : inserted.state,
      );
      this.host.views.move(tabId, targetWindowId);
      return true;
    });
  }

  // -------------------------------------------------------------------------
  // 창 상태
  // -------------------------------------------------------------------------

  setSidebarOpen(windowId: number, open: boolean): void {
    this.transact(() => {
      const record = this.windows.get(windowId);
      if (!record) return;
      this.lastSidebarOpen = open;
      if (record.sidebarOpen === open) return;
      record.sidebarOpen = open;
      this.touched.add(windowId);
      this.host.publishSidebar(windowId, open);
    });
  }

  /** 탭 화면 안에서 사이드바를 접거나 편 요청. */
  requestSidebarOpenFromTab(tabId: TabId, open: boolean): void {
    const windowId = this.tabWindow.get(tabId);
    if (windowId !== undefined) this.setSidebarOpen(windowId, open);
  }

  setFullscreen(windowId: number, fullscreen: boolean): void {
    this.transact(() => {
      const record = this.windows.get(windowId);
      if (!record || record.fullscreen === fullscreen) return;
      record.fullscreen = fullscreen;
      this.touched.add(windowId);
    });
  }

  // -------------------------------------------------------------------------
  // 메뉴
  // -------------------------------------------------------------------------

  tabMenuItems(windowId: number, tabId: TabId): TabMenuItem[] | null {
    const record = this.windows.get(windowId);
    const tabs = record?.tabs.workspace.tabs ?? [];
    const index = tabs.findIndex((tab) => tab.id === tabId);
    if (!record || index < 0) return null;
    const items: TabMenuItem[] = [];
    if (this.failedTabs.has(tabId)) {
      items.push({ type: 'item', id: TAB_MENU.reload, label: '다시 불러오기' });
      items.push({ type: 'separator' });
    }
    items.push(
      {
        type: 'item',
        id: TAB_MENU.reopen,
        label: '닫은 탭 다시 열기',
        enabled: record.tabs.workspace.recentlyClosedTabs.length > 0,
        accelerator: 'CmdOrCtrl+Shift+T',
      },
      { type: 'separator' },
      { type: 'item', id: TAB_MENU.close, label: '탭 닫기', accelerator: 'CmdOrCtrl+W' },
      {
        type: 'item',
        id: TAB_MENU.closeOthers,
        label: '다른 탭 닫기',
        enabled: tabs.length > 1,
      },
      { type: 'item', id: TAB_MENU.closeLeft, label: '왼쪽 탭 닫기', enabled: index > 0 },
      {
        type: 'item',
        id: TAB_MENU.closeRight,
        label: '오른쪽 탭 닫기',
        enabled: index < tabs.length - 1,
      },
    );
    return items;
  }

  async openTabMenu(windowId: number, tabId: TabId): Promise<void> {
    const items = this.tabMenuItems(windowId, tabId);
    if (!items) return;
    const chosen = await this.host.showMenu(windowId, items);
    // 메뉴가 떠 있는 동안 탭이 닫히거나 다른 창으로 갔으면 아무것도 하지 않는다.
    if (chosen === null || this.tabWindow.get(tabId) !== windowId) return;
    this.transact(() => {
      const record = this.windows.get(windowId);
      if (!record) return;
      const state = record.tabs.workspace;
      switch (chosen) {
        case TAB_MENU.reload:
          this.reloadTab(tabId);
          return;
        case TAB_MENU.reopen:
          this.commitWindow(windowId, reopenLastClosedTabs(record.tabs, this.env));
          return;
        case TAB_MENU.close:
          this.step(windowId, workspace.closeTab(state, tabId, this.env));
          return;
        case TAB_MENU.closeOthers:
          this.step(windowId, workspace.closeOtherTabs(state, tabId, this.env));
          return;
        case TAB_MENU.closeLeft:
          this.step(windowId, workspace.closeTabsOnSide(state, tabId, 'left', this.env));
          return;
        case TAB_MENU.closeRight:
          this.step(windowId, workspace.closeTabsOnSide(state, tabId, 'right', this.env));
          return;
        default:
          return;
      }
    });
  }

  historyMenuItems(windowId: number, direction: TabHistoryDirection): TabMenuItem[] {
    const record = this.windows.get(windowId);
    const activeTabId = record?.tabs.workspace.activeTabId;
    const history = activeTabId ? record?.tabs.history.histories[activeTabId] : undefined;
    if (!history) return [];
    return traversalTargets(history, direction).map((index) => {
      const entry = history.entries[index];
      return {
        type: 'item',
        id: String(index),
        label: entry.title || getRouteMetaCore(entry.route).title,
      };
    });
  }

  async openHistoryMenu(windowId: number, direction: TabHistoryDirection): Promise<void> {
    const tabId = this.getActiveTabId(windowId);
    const items = this.historyMenuItems(windowId, direction);
    if (!tabId || items.length === 0) return;
    const chosen = await this.host.showMenu(windowId, items);
    if (chosen === null || this.tabWindow.get(tabId) !== windowId) return;
    const index = Number(chosen);
    if (!Number.isInteger(index)) return;
    this.transact(() => {
      const record = this.windows.get(windowId);
      if (!record) return;
      const result = this.commitWindow(
        windowId,
        traverseTabHistory(
          record.tabs,
          {
            tabId,
            index,
            hasExternalUnsavedWork: this.host.views.hasUnsavedWork(windowId, tabId),
          },
          this.env,
        ),
      );
      this.reportHistoryResult(windowId, result);
    });
  }

  // -------------------------------------------------------------------------
  // 끌어 놓은 탭
  // -------------------------------------------------------------------------

  /**
   * 다른 창에서 끌어 온 탭을 그 창(windowId)의 탭 줄에 놓았다. 탭과 떠 있는 탭 화면을
   * 그 자리로 옮기고 그 창을 앞으로 가져온다.
   *
   * 끌기에 실려 온 값(탭, 원래 창)은 탭 목록으로 다시 확인한다: 없는 탭, 그 창에 없는 탭
   * (끄는 사이 닫혔거나 옮겨졌다), 이미 이 창에 있는 탭이면 아무것도 하지 않는다.
   */
  private adoptTab(
    windowId: number,
    action: Extract<TabBarAction, { type: 'adopt' }>,
  ): void {
    const located = this.locate(action.tabId);
    if (!located || located.windowId !== action.sourceWindowId) return;
    if (located.windowId === windowId) return;
    if (!this.moveTab(action.tabId, windowId, action.toIndex)) return;
    this.host.focusWindow(windowId);
  }

  /**
   * 그 창(windowId)의 탭을 끌다가 탭 줄이 아닌 곳에서 끝났다. 손을 뗀 자리가 앱 창의 탭 줄
   * 위거나 취소한 것이면 아무것도 하지 않는다(src/main/tabs/tabDrop.ts). 그 밖이면 탭이
   * 마우스 밑에 오는 자리에 새 창을 만들어 탭과 떠 있는 탭 화면을 옮긴다.
   *
   * 메인 창이 아닌 창의 하나뿐인 탭이면 새 창을 만들고 원래 창을 닫는 대신 그 창을 옮긴다.
   */
  private dropTabOutside(
    windowId: number,
    record: WindowRecord,
    action: Extract<TabBarAction, { type: 'drop-outside' }>,
  ): void {
    const located = this.locate(action.tabId);
    // 끄는 사이 닫혔거나 다른 창이 받아 간 탭이다.
    if (!located || located.windowId !== windowId) return;
    const scene = this.host.tabDropScene(windowId);
    if (!scene) return;
    const plan = planTabDrop(
      scene,
      windowId,
      action,
      detachedTabOrigin(this.host.platform),
    );
    if (plan.kind !== 'place') return;
    const placement: TabWindowPlacement = { position: plan.position, point: plan.point };

    if (record.kind !== 'main' && record.tabs.workspace.tabs.length === 1) {
      this.host.moveWindow(windowId, placement);
      this.host.focusWindow(windowId);
      return;
    }

    const targetWindowId = this.host.createWindow({
      reason: 'tab-drop',
      tab: located.tab,
      sourceWindowId: windowId,
      placement,
    });
    if (targetWindowId === null) return;
    this.registerWindow(targetWindowId, 'detached');
    if (!this.moveTab(action.tabId, targetWindowId)) {
      this.host.closeWindow(targetWindowId);
      return;
    }
    this.host.focusWindow(targetWindowId);
  }

  // -------------------------------------------------------------------------
  // 내부
  // -------------------------------------------------------------------------

  private locate(
    tabId: TabId,
  ): { windowId: number; record: WindowRecord; tab: Tab } | null {
    const windowId = this.tabWindow.get(tabId);
    const record = windowId === undefined ? undefined : this.windows.get(windowId);
    const tab = record?.tabs.workspace.tabs.find((candidate) => candidate.id === tabId);
    return windowId !== undefined && record && tab ? { windowId, record, tab } : null;
  }

  /**
   * 탭 화면이 지금 그 탭의 화면을 보여 주고 있는지. main이 탭을 다른 업무로 옮긴
   * 직후에는 탭 화면이 아직 예전 화면이라, 그때 도착한 입력 초안은 예전 화면의 것이다.
   * 그런 초안을 새 화면의 탭에 붙이지 않는다. 탭 화면이 아직 주소를 알린 적이 없으면
   * 받아들인다.
   */
  private viewShowsTabScreen(tab: Tab): boolean {
    const viewRoute = this.viewRoutes.get(tab.id);
    if (viewRoute === undefined) return true;
    return (
      resolveTabResourceKey(viewRoute, tab.id) ===
      resolveTabResourceKey(tab.route, tab.id)
    );
  }

  private activeTabHasUnsavedWork(windowId: number): boolean {
    const activeTabId = this.getActiveTabId(windowId);
    return activeTabId ? this.host.views.hasUnsavedWork(windowId, activeTabId) : false;
  }

  private openHistoryNeighbourInNewTab(
    windowId: number,
    direction: TabHistoryDirection,
  ): void {
    const record = this.windows.get(windowId);
    const activeTabId = record?.tabs.workspace.activeTabId;
    const history = activeTabId ? record?.tabs.history.histories[activeTabId] : undefined;
    if (!record || !history || !canTraverse(history, direction)) return;
    const index = adjacentHistoryIndex(history, direction);
    const location = index === null ? undefined : history.entries[index];
    if (!location) return;
    this.step(
      windowId,
      workspace.openLocationInNewTab(record.tabs.workspace, location, this.env),
    );
  }

  private reportHistoryResult(
    windowId: number,
    result: TabHistoryNavigationResult,
  ): void {
    if (result === 'blocked-by-unsaved-work') {
      this.queueToast(windowId, {
        level: 'warning',
        message: '저장하지 않은 입력이 있어 이동하지 않았습니다.',
        description: '저장하거나 입력을 취소한 뒤 다시 시도하세요.',
      });
    } else if (result === 'opened-in-new-tab') {
      this.queueToast(windowId, {
        level: 'info',
        message: '저장하지 않은 입력이 있어 이전 화면을 새 탭으로 열었습니다.',
      });
    }
  }

  /**
   * 알림은 동작이 끝나고 탭 화면을 보여 주라고 한 뒤에 host에 넘긴다(settle). 동작
   * 도중에 넘기면 host는 아직 이전 탭 화면을 보이는 화면으로 알고 있어, "새 탭으로
   * 열었습니다" 같은 알림이 곧 가려질 화면에 뜬다.
   */
  private queueToast(windowId: number, toast: WindowToast): void {
    this.pendingToasts.push({ windowId, toast });
  }

  private step<R>(
    windowId: number,
    step: TabStep<R>,
    options: { fromView?: boolean } = {},
  ): R {
    const record = this.windows.get(windowId);
    if (record) this.commit(windowId, applyWorkspaceStep(record.tabs, step).state, options);
    return step.result;
  }

  private commitWindow<R>(
    windowId: number,
    outcome: { state: TabWindowState; result: R },
  ): R {
    this.commit(windowId, outcome.state);
    return outcome.result;
  }

  private commit(
    windowId: number,
    next: TabWindowState,
    options: { fromView?: boolean } = {},
  ): void {
    const record = this.windows.get(windowId);
    if (!record || next === record.tabs) return;
    const previous = record.tabs;
    record.tabs = next;
    this.touched.add(windowId);

    const nextIds = new Set(next.workspace.tabs.map((tab) => tab.id));
    for (const tab of previous.workspace.tabs) {
      // 다른 창으로 옮긴 탭은 소속이 이미 바뀌어 있다. 이 창에서 닫힌 탭만 치운다.
      if (!nextIds.has(tab.id) && this.tabWindow.get(tab.id) === windowId) {
        this.forgetTab(tab.id);
      }
    }
    for (const tab of next.workspace.tabs) this.tabWindow.set(tab.id, windowId);
    if (next.workspace.tabs.length > 0) record.initialized = true;

    const previousActive = previous.workspace.tabs.find(
      (tab) => tab.id === previous.workspace.activeTabId,
    );
    const nextActive = next.workspace.tabs.find(
      (tab) => tab.id === next.workspace.activeTabId,
    );
    const activeChanged = previousActive?.id !== nextActive?.id;
    // 탭 화면이 스스로 옮긴 주소는 이미 그 화면에 반영돼 있어 다시 보낼 필요가 없다.
    const routeChanged =
      !options.fromView && nextActive !== undefined && previousActive?.route !== nextActive.route;
    if (activeChanged || routeChanged) this.toPresent.add(windowId);
  }

  private forgetTab(tabId: TabId): void {
    this.tabWindow.delete(tabId);
    this.viewRoutes.delete(tabId);
    this.viewFailures.delete(tabId);
    this.failedTabs.delete(tabId);
    this.host.views.discard(tabId);
  }

  private transact<T>(run: () => T): T {
    this.depth += 1;
    try {
      return run();
    } finally {
      this.depth -= 1;
      if (this.depth === 0) this.settle();
    }
  }

  /**
   * 한 동작이 끝난 뒤: 빈 창 규칙 → 탭 화면 보여 주기 → 탭바 상태 보내기.
   * 보여 주기·보내기 도중에 host가 다시 보고해 오면(예: 화면 실패) 한 번 더 돈다.
   */
  private settle(): void {
    this.depth += 1;
    try {
      for (
        let pass = 0;
        pass < SETTLE_PASS_LIMIT && (this.touched.size > 0 || this.toPresent.size > 0);
        pass += 1
      ) {
        for (const windowId of [...this.touched]) this.applyEmptyWindowRule(windowId);

        const present = [...this.toPresent];
        this.toPresent.clear();
        const touched = [...this.touched];
        this.touched.clear();

        for (const windowId of present) {
          const record = this.windows.get(windowId);
          if (!record) continue;
          const { tabs, activeTabId } = record.tabs.workspace;
          const active = tabs.find((tab) => tab.id === activeTabId) ?? null;
          this.host.views.present(
            windowId,
            active && !this.failedTabs.has(active.id) ? structuredClone(active) : null,
          );
        }
        for (const windowId of touched) this.publish(windowId);
      }
      // 탭 화면을 보여 주라고 한 뒤다. host는 그 보여 주기가 끝난 화면에 알림을 띄운다.
      for (const { windowId, toast } of this.pendingToasts.splice(0)) {
        if (this.windows.has(windowId)) this.host.showToast(windowId, toast);
      }
    } finally {
      this.depth -= 1;
    }
  }

  private applyEmptyWindowRule(windowId: number): void {
    const record = this.windows.get(windowId);
    if (!record || !this.sessionActive || record.tabs.workspace.tabs.length > 0) return;
    if (record.kind === 'main') {
      const meta = getRouteMetaCore(DASHBOARD_ROUTE);
      this.step(
        windowId,
        workspace.createTab(
          record.tabs.workspace,
          {
            route: DASHBOARD_ROUTE,
            kind: meta.kind,
            title: meta.title,
            // 처음에는 대시보드 화면 자체로, 실행 중 마지막 탭이 사라진 뒤에는
            // 새 launcher 탭으로 연다(기존 대시보드 module과 섞이지 않게).
            resourceKey: record.initialized ? null : undefined,
          },
          this.env,
        ),
      );
      return;
    }
    if (record.initialized) this.host.closeWindow(windowId);
  }

  private barState(windowId: number, record: WindowRecord): TabBarState {
    const { tabs, activeTabId, recentlyClosedTabs } = record.tabs.workspace;
    const history = activeTabId ? record.tabs.history.histories[activeTabId] : undefined;
    return {
      schemaVersion: 1,
      windowId,
      revision: record.revision,
      ackSeq: record.ackSeq,
      windowKind: record.kind,
      platform: this.host.platform,
      fullscreen: record.fullscreen,
      sidebarOpen: record.sidebarOpen,
      canCreateTabs: record.kind === 'main',
      canReopenClosed: recentlyClosedTabs.length > 0,
      tabs: tabs.map((tab) => ({
        id: tab.id,
        title: tab.title,
        route: tab.route,
        kind: tab.kind,
        dirty: workspace.hasUnsavedFormDraft(tab),
        ...(this.failedTabs.has(tab.id) ? { failed: true } : {}),
      })),
      activeTabId,
      history: {
        canGoBack: canTraverse(history, 'back'),
        canGoForward: canTraverse(history, 'forward'),
      },
    };
  }

  private publish(windowId: number): void {
    const record = this.windows.get(windowId);
    if (!record) return;
    const key = JSON.stringify({ ...this.barState(windowId, record), revision: 0 });
    if (key === record.publishedKey) return;
    record.publishedKey = key;
    record.revision += 1;
    this.host.publishState(windowId, this.barState(windowId, record));
  }
}

/** 탭 화면의 요청이 가리키는 주소. 주소가 없는 요청(닫기, 제목, 입력 초안)은 null. */
function routeOfTabAction(action: NativeTabAction): string | null {
  switch (action.type) {
    case 'create-tab':
    case 'open-resource':
    case 'open-module':
    case 'replace-resource':
    case 'navigate':
      return action.input.route;
    case 'adopt-location':
      return action.route;
    default:
      return null;
  }
}

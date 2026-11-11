import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Tab } from '@estate-erp/shared';
import type { WindowToast } from '../src/common/callOverlay';
import type { TabMenuItem } from '../src/common/tabCommands';
import { getRouteMetaCore } from '../src/common/tabs/routeMeta';
import {
  isTabBarState,
  type TabBarAction,
  type TabBarState,
} from '../src/common/tabs/tabBarContract';
import { detachedTabOrigin } from '../src/common/tabs/tabBarModel';
import { tabResourceKeys } from '../src/common/tabs/tabResource';
import type { ScreenPoint, ScreenRect, TabDropScene } from '../src/main/tabs/tabDrop';
import {
  TabRegistry,
  type CreateTabWindowRequest,
  type TabRegistryHost,
  type TabViewsPort,
  type TabWindowPlacement,
} from '../src/main/tabs/tabRegistry';

const MAIN = 1;

class FakeViews implements TabViewsPort {
  readonly presented: Array<{ windowId: number; tab: Tab | null }> = [];
  readonly discarded: string[] = [];
  readonly moved: Array<{ tabId: string; toWindowId: number }> = [];
  /** 탭 화면이 "저장 전 입력이 있다"고 알린 탭. */
  readonly unsaved = new Set<string>();
  onPresent: ((windowId: number, tab: Tab | null) => void) | null = null;
  /** host와 같이 쓰는 호출 순서 기록. */
  order: string[] = [];

  present(windowId: number, tab: Tab | null): void {
    this.presented.push({ windowId, tab });
    this.order.push(`present:${windowId}:${tab?.id ?? 'none'}`);
    this.onPresent?.(windowId, tab);
  }

  discard(tabId: string): void {
    this.discarded.push(tabId);
  }

  move(tabId: string, toWindowId: number): void {
    this.moved.push({ tabId, toWindowId });
  }

  hasUnsavedWork(_windowId: number, tabId: string): boolean {
    return this.unsaved.has(tabId);
  }

  /** 그 창에 마지막으로 보여 주라고 한 탭(없으면 null). 한 번도 없으면 undefined. */
  shown(windowId: number): Tab | null | undefined {
    return this.presented.filter((entry) => entry.windowId === windowId).at(-1)?.tab;
  }
}

class FakeHost implements TabRegistryHost {
  readonly platform = 'darwin';
  readonly views = new FakeViews();
  readonly published = new Map<number, TabBarState[]>();
  readonly sidebar: Array<{ windowId: number; open: boolean }> = [];
  readonly toasts: Array<{ windowId: number; toast: WindowToast }> = [];
  readonly menus: Array<{ windowId: number; items: TabMenuItem[] }> = [];
  menuAnswer: (items: TabMenuItem[]) => string | null | Promise<string | null> = () => null;
  readonly created: CreateTabWindowRequest[] = [];
  readonly createdIds: number[] = [];
  nextWindowId = 10;
  failCreateWindow = false;
  readonly closed: number[] = [];
  onCloseWindow: ((windowId: number) => void) | null = null;
  /** 보이는 창들의 안쪽 자리(화면 좌표). 메인 창은 (100,100)에 1200×800이다. */
  readonly frames = new Map<number, ScreenRect>([
    [MAIN, { x: 100, y: 100, width: 1200, height: 800 }],
  ]);
  /** 가장 최근에 앞에 있던 창부터. */
  focusOrder: number[] = [MAIN];
  zoomFactor = 1;
  /** 방금 Escape를 누른 흔적이 있는 것처럼 한다. */
  escapePressed = false;
  readonly movedWindows: Array<{ windowId: number; placement: TabWindowPlacement }> = [];
  readonly focused: number[] = [];
  /** 탭 화면 보여 주기·알림·창 열고 닫기가 불린 순서. */
  readonly order: string[] = [];
  readonly openedMainWindows: number[] = [];
  /** 실제 host처럼 새 메인 창을 탭 목록에 알리려고 쓴다. */
  registry: TabRegistry | null = null;

  constructor() {
    this.views.order = this.order;
  }

  publishState(windowId: number, state: TabBarState): void {
    const list = this.published.get(windowId) ?? [];
    list.push(state);
    this.published.set(windowId, list);
  }

  publishSidebar(windowId: number, open: boolean): void {
    this.sidebar.push({ windowId, open });
  }

  showToast(windowId: number, toast: WindowToast): void {
    this.toasts.push({ windowId, toast });
    this.order.push(`toast:${windowId}`);
  }

  openMainWindow(): void {
    const id = this.nextWindowId;
    this.nextWindowId += 1;
    this.openedMainWindows.push(id);
    this.order.push(`open-main:${id}`);
    this.registry?.registerWindow(id, 'main');
  }

  async showMenu(windowId: number, items: TabMenuItem[]): Promise<string | null> {
    this.menus.push({ windowId, items });
    return this.menuAnswer(items);
  }

  createWindow(request: CreateTabWindowRequest): number | null {
    if (this.failCreateWindow) return null;
    this.created.push(request);
    const id = this.nextWindowId;
    this.nextWindowId += 1;
    this.createdIds.push(id);
    // 놓은 자리에 생기는 창은 원래 창과 같은 크기, 그 밖의 새 창은 오른쪽 빈 자리에 둔다.
    this.frames.set(
      id,
      request.placement
        ? { ...request.placement.position, width: 1200, height: 800 }
        : { x: 1400 + this.createdIds.length * 40, y: 200, width: 900, height: 600 },
    );
    this.focusOrder.unshift(id);
    return id;
  }

  closeWindow(windowId: number): void {
    this.closed.push(windowId);
    this.order.push(`close:${windowId}`);
    this.onCloseWindow?.(windowId);
  }

  tabDropScene(sourceWindowId: number): TabDropScene | null {
    const sourceContent = this.frames.get(sourceWindowId);
    if (!sourceContent) return null;
    return {
      sourceContent,
      zoomFactor: this.zoomFactor,
      windows: this.focusOrder.flatMap((id) => {
        const content = this.frames.get(id);
        return content ? [{ id, content }] : [];
      }),
      stripHeight: 40,
      escapePressed: this.escapePressed,
    };
  }

  moveWindow(windowId: number, placement: TabWindowPlacement): void {
    this.movedWindows.push({ windowId, placement });
    const frame = this.frames.get(windowId);
    if (frame) this.frames.set(windowId, { ...frame, ...placement.position });
  }

  focusWindow(windowId: number): void {
    this.focused.push(windowId);
    this.focusOrder = [windowId, ...this.focusOrder.filter((id) => id !== windowId)];
  }

  /** 그 창의 탭 줄 한가운데(화면 좌표). */
  stripPoint(windowId: number): ScreenPoint {
    const frame = this.frames.get(windowId);
    assert.ok(frame, `window ${windowId} has no frame`);
    return { x: frame.x + frame.width / 2, y: frame.y + 20 };
  }

  /** 그 창의 본문 한가운데(화면 좌표). */
  bodyPoint(windowId: number): ScreenPoint {
    const frame = this.frames.get(windowId);
    assert.ok(frame, `window ${windowId} has no frame`);
    return { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 };
  }

  count(windowId: number): number {
    return this.published.get(windowId)?.length ?? 0;
  }
}

/** 어디에도 받는 곳 없이 끝나는 자리: 모든 앱 창의 밖. */
const OUTSIDE: ScreenPoint = { x: 3000, y: 1500 };
const GRAB: ScreenPoint = { x: 30, y: 12 };

function setup(options: { signedIn?: boolean } = {}) {
  const host = new FakeHost();
  let nextId = 0;
  let now = 1_000;
  const registry = new TabRegistry(host, {
    env: { newId: () => `tab-${(nextId += 1)}`, now: () => (now += 1) },
  });
  host.registry = registry;
  registry.registerWindow(MAIN, 'main');
  if (options.signedIn !== false) registry.startSession();

  let seq = 0;
  const api = {
    host,
    registry,
    /** 마지막으로 보낸 동작의 순번. */
    lastSeq: () => seq,
    /** 탭바 화면이 보낸 동작. */
    bar(windowId: number, action: TabBarAction): void {
      registry.dispatchBarAction(windowId, { seq: (seq += 1), action });
    },
    active(windowId = MAIN): string {
      const id = registry.getActiveTabId(windowId);
      assert.ok(id, `window ${windowId} has no active tab`);
      return id;
    },
    ids(windowId = MAIN): string[] {
      return registry.getTabs(windowId).map((tab) => tab.id);
    },
    routes(windowId = MAIN): string[] {
      return registry.getTabs(windowId).map((tab) => tab.route);
    },
    tab(tabId: string): Tab {
      const tab = registry.getTabSnapshot(tabId);
      assert.ok(tab, `tab ${tabId} is not in any window`);
      return tab;
    },
    state(windowId = MAIN): TabBarState {
      const state = host.published.get(windowId)?.at(-1);
      assert.ok(state, `window ${windowId} never received a state`);
      return state;
    },
    barTab(tabId: string, windowId = MAIN) {
      const tab = api.state(windowId).tabs.find((candidate) => candidate.id === tabId);
      assert.ok(tab, `tab ${tabId} is not in the bar of window ${windowId}`);
      return tab;
    },
    /** 탭 화면 안의 페이지가 "새 탭으로 열기"를 한 것처럼 탭을 연다. */
    open(route: string, windowId = MAIN): string {
      const meta = getRouteMetaCore(route);
      registry.applyTabAction(api.active(windowId), {
        type: 'create-tab',
        input: { route, kind: meta.kind, title: meta.title },
      });
      return api.active(windowId);
    },
    standalone(route: string): { windowId: number; tabId: string } {
      const meta = getRouteMetaCore(route);
      const result = registry.openStandaloneTab(
        { route, kind: meta.kind, title: meta.title },
        MAIN,
      );
      assert.ok(result.ok, 'standalone window was not opened');
      return { windowId: result.windowId, tabId: result.tabId };
    },
    /**
     * 그 창의 탭 줄이 "이 탭을 끌다가 화면의 그 자리에서 끝났다"고 알린다. 탭 줄은 자기
     * 문서 안 좌표로 보내므로 그 창의 자리를 빼서 넣는다.
     */
    release(
      windowId: number,
      tabId: string,
      at: ScreenPoint,
      release: { accepted?: boolean; grabOffset?: ScreenPoint } = {},
    ): void {
      const frame = host.frames.get(windowId) ?? { x: 0, y: 0 };
      api.bar(windowId, {
        type: 'drop-outside',
        tabId,
        client: { x: at.x - frame.x, y: at.y - frame.y },
        grabOffset: release.grabOffset ?? GRAB,
        accepted: release.accepted ?? false,
      });
    },
    /** 그 창의 탭 줄이 "다른 창에서 끌어 온 탭이 여기 놓였다"고 알린다. */
    adopt(windowId: number, tabId: string, sourceWindowId: number, toIndex = 0): void {
      api.bar(windowId, { type: 'adopt', tabId, sourceWindowId, toIndex });
    },
    /** 창마다의 탭 id. 아무것도 바뀌지 않았는지 볼 때 쓴다. */
    layout(): Record<number, string[]> {
      return Object.fromEntries(
        [...host.frames.keys()]
          .filter((windowId) => registry.hasWindow(windowId))
          .map((windowId) => [windowId, api.ids(windowId)]),
      );
    },
    sidebarTo(tabId: string, route: string): void {
      const meta = getRouteMetaCore(route);
      registry.applyTabAction(tabId, {
        type: 'navigate',
        input: { route, kind: meta.kind, title: meta.title },
      });
    },
  };
  return api;
}

const settleMicrotasks = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('TabRegistry: windows and the signed-in session', () => {
  it('has no tabs before sign-in and opens the dashboard when the session starts', () => {
    const s = setup({ signedIn: false });
    assert.deepEqual(s.registry.getTabs(MAIN), []);
    assert.deepEqual(s.state().tabs, []);
    assert.equal(s.host.views.presented.some((entry) => entry.tab !== null), false);

    s.registry.startSession();

    const [tab] = s.registry.getTabs(MAIN);
    assert.equal(tab.route, '/dashboard');
    assert.equal(tab.title, '대시보드');
    assert.equal(tab.resourceKey, tabResourceKeys.module('/dashboard'));
    assert.equal(s.registry.getActiveTabId(MAIN), tab.id);
    assert.deepEqual(s.host.views.shown(MAIN), tab);
    assert.deepEqual(s.state().tabs, [
      { id: tab.id, title: '대시보드', route: '/dashboard', kind: 'dashboard', dirty: false },
    ]);
    assert.equal(s.state().activeTabId, tab.id);
    assert.equal(s.state().windowKind, 'main');
    assert.equal(s.state().canCreateTabs, true);
    assert.equal(s.state().platform, 'darwin');
  });

  it('gives a main window registered after sign-in its first tab', () => {
    const host = new FakeHost();
    const registry = new TabRegistry(host);
    registry.startSession();
    registry.registerWindow(MAIN, 'main', { fullscreen: true });

    assert.equal(registry.getTabs(MAIN).length, 1);
    assert.equal(registry.getMainWindowId(), MAIN);
    assert.equal(host.published.get(MAIN)?.at(-1)?.fullscreen, true);
    // 같은 창을 두 번 등록해도 탭이 늘지 않는다.
    registry.registerWindow(MAIN, 'main');
    assert.equal(registry.getTabs(MAIN).length, 1);
  });

  it('never leaves the main window without a tab while signed in', () => {
    const s = setup();
    const first = s.active();
    s.bar(MAIN, { type: 'close', tabId: first });

    const [replacement] = s.registry.getTabs(MAIN);
    assert.equal(s.registry.getTabs(MAIN).length, 1);
    assert.notEqual(replacement.id, first);
    assert.equal(replacement.route, '/dashboard');
    // 실행 중 다시 여는 대시보드는 새 launcher 탭이다.
    assert.equal(replacement.resourceKey, tabResourceKeys.launcher(replacement.id));
    assert.ok(s.host.views.discarded.includes(first));
    assert.equal(s.host.views.shown(MAIN)?.id, replacement.id);
    assert.equal(s.state().canReopenClosed, true);
    assert.equal(s.state().activeTabId, replacement.id);
  });

  it('creates no tab while signed out, whatever arrives', () => {
    const s = setup({ signedIn: false });
    s.bar(MAIN, { type: 'new-tab' });
    s.bar(MAIN, { type: 'command', command: { type: 'new-tab' } });
    s.registry.runCommand(MAIN, { type: 'new-tab' });
    s.registry.runCommand(MAIN, { type: 'reopen-closed-tab' });
    s.release(MAIN, 'tab-1', OUTSIDE);

    assert.equal(s.registry.openRoute('/properties'), false);
    assert.deepEqual(
      s.registry.openStandaloneTab({ route: '/properties/p1', title: '매물 상세' }, MAIN),
      { ok: false, error: 'not signed in' },
    );
    assert.deepEqual(s.registry.getTabs(MAIN), []);
    assert.equal(s.host.views.presented.some((entry) => entry.tab !== null), false);
    assert.deepEqual(s.host.created, []);
    // 받았다는 답은 한다. 탭바가 답을 기다리며 멈춰 있지 않게.
    assert.equal(s.state().ackSeq, 3);
  });

  it('drops every tab, closed tab, draft, drag and extra window when the session ends', () => {
    const s = setup();
    const dashboard = s.active();
    const property = s.open('/properties/p1');
    s.registry.applyTabAction(property, {
      type: 'update-form-draft',
      key: 'memo',
      value: '이전 사무소의 초안',
    });
    const task = s.open('/tasks');
    s.bar(MAIN, { type: 'close', tabId: task });
    const standalone = s.standalone('/contacts/c1');
    s.release(MAIN, property, OUTSIDE);
    const droppedWindow = s.host.createdIds.at(-1);
    assert.ok(droppedWindow);
    assert.deepEqual(s.ids(droppedWindow), [property]);
    assert.equal(s.state().canReopenClosed, true);

    s.registry.endSession();

    assert.equal(s.registry.isSessionActive(), false);
    assert.deepEqual(s.registry.getTabs(MAIN), []);
    assert.deepEqual([...s.host.closed].sort(), [standalone.windowId, droppedWindow].sort());
    for (const tabId of [dashboard, property, standalone.tabId]) {
      assert.equal(s.registry.getTabSnapshot(tabId), null, tabId);
      assert.ok(s.host.views.discarded.includes(tabId), `${tabId} view must be discarded`);
    }
    assert.equal(s.host.views.shown(MAIN), null);
    const ended = s.state();
    assert.ok(isTabBarState(ended));
    assert.deepEqual(ended.tabs, []);
    assert.equal(ended.activeTabId, null);
    assert.equal(ended.canReopenClosed, false);
    assert.deepEqual(ended.history, { canGoBack: false, canGoForward: false });

    // 이전 세션의 화면에서 늦게 온 요청은 아무것도 만들지 않는다.
    s.registry.applyTabAction(property, { type: 'update-title', title: '늦은 요청' });
    s.bar(MAIN, { type: 'reopen-closed' });
    const windowsBefore = s.host.created.length;
    s.release(MAIN, dashboard, OUTSIDE);
    s.adopt(MAIN, property, droppedWindow);
    assert.deepEqual(s.registry.getTabs(MAIN), []);
    assert.equal(s.host.created.length, windowsBefore);
    assert.deepEqual(s.host.views.moved.filter((move) => move.toWindowId === MAIN), []);

    // 다음 사람은 빈 대시보드에서 시작한다.
    s.registry.startSession();
    const [fresh] = s.registry.getTabs(MAIN);
    assert.equal(s.registry.getTabs(MAIN).length, 1);
    assert.equal(fresh.resourceKey, tabResourceKeys.module('/dashboard'));
    assert.equal(fresh.uiState, undefined);
    assert.equal(s.state().canReopenClosed, false);
    s.registry.runCommand(MAIN, { type: 'reopen-closed-tab' });
    assert.equal(s.registry.getTabs(MAIN).length, 1);
  });

  it('survives a host that reports closed windows synchronously', () => {
    const s = setup();
    s.host.onCloseWindow = (windowId) => s.registry.unregisterWindow(windowId);
    const one = s.standalone('/contacts/c1');
    const two = s.standalone('/contacts/c2');

    s.registry.endSession();

    assert.deepEqual([...s.host.closed].sort(), [one.windowId, two.windowId].sort());
    assert.equal(s.registry.hasWindow(one.windowId), false);
    assert.equal(s.registry.hasWindow(two.windowId), false);
    assert.equal(s.registry.hasWindow(MAIN), true);
  });

  it('forgets the tabs of a window that was closed', () => {
    const s = setup();
    const extra = s.standalone('/properties/p1');
    s.registry.unregisterWindow(extra.windowId);

    assert.equal(s.registry.hasWindow(extra.windowId), false);
    assert.equal(s.registry.getTabSnapshot(extra.tabId), null);
    assert.ok(s.host.views.discarded.includes(extra.tabId));

    const mainTab = s.active();
    s.registry.unregisterWindow(MAIN);
    assert.equal(s.registry.getMainWindowId(), null);
    assert.equal(s.registry.getTabSnapshot(mainTab), null);
    // macOS에서 창을 다시 열면 새 메인 창이 첫 탭을 받는다.
    s.registry.registerWindow(2, 'main');
    assert.equal(s.registry.getMainWindowId(), 2);
    assert.equal(s.registry.getTabs(2).length, 1);
  });

  it('ignores requests for windows and tabs it does not know', () => {
    const s = setup();
    const before = s.host.count(MAIN);
    s.registry.dispatchBarAction(99, { seq: 1, action: { type: 'new-tab' } });
    s.registry.runCommand(99, { type: 'new-tab' });
    s.registry.applyTabAction('nope', { type: 'close' });
    s.registry.applyTabAction('nope', { type: 'update-title', title: 'x' });
    s.registry.reportViewLocation('nope', '/properties');
    s.registry.reportViewState('nope', { scrollY: 3 });
    s.registry.reportViewFailure('nope');
    s.registry.reloadTab('nope');
    s.registry.setSidebarOpen(99, false);
    s.registry.requestSidebarOpenFromTab('nope', false);
    s.registry.setFullscreen(99, true);
    s.registry.unregisterWindow(99);

    assert.equal(s.registry.getBarState(99), null);
    assert.equal(s.registry.getWindowKind(99), null);
    assert.equal(s.registry.tabMenuItems(99, 'nope'), null);
    assert.deepEqual(s.registry.historyMenuItems(99, 'back'), []);
    assert.equal(s.registry.getTabs(MAIN).length, 1);
    assert.equal(s.host.count(MAIN), before);
  });
});

describe('TabRegistry: actions from the tab bar', () => {
  it('activates and reorders tabs and reports how far it has applied', () => {
    const s = setup();
    const a = s.active();
    const b = s.open('/properties');
    const c = s.open('/contacts');
    s.host.views.presented.length = 0;

    s.registry.dispatchBarAction(MAIN, { seq: 50, action: { type: 'activate', tabId: a } });
    assert.equal(s.registry.getActiveTabId(MAIN), a);
    assert.deepEqual(
      s.host.views.presented.map((entry) => entry.tab?.id),
      [a],
    );
    assert.equal(s.state().ackSeq, 50);
    assert.equal(s.state().activeTabId, a);

    // 순서만 바꾸면 보이는 탭 화면은 그대로다.
    s.registry.dispatchBarAction(MAIN, {
      seq: 51,
      action: { type: 'reorder', tabId: a, toIndex: 2 },
    });
    assert.deepEqual(s.ids(), [b, c, a]);
    assert.equal(s.host.views.presented.length, 1);
    assert.equal(s.state().ackSeq, 51);
    assert.deepEqual(
      s.state().tabs.map((tab) => tab.id),
      [b, c, a],
    );

    // 늦게 도착한 예전 순번이 반영 순번을 되돌리지 않는다.
    s.registry.dispatchBarAction(MAIN, { seq: 7, action: { type: 'activate', tabId: b } });
    assert.equal(s.registry.getActiveTabId(MAIN), b);
    assert.equal(s.state().ackSeq, 51);

    // 받아들이지 않은 동작도 받았다고는 답한다. 탭바가 먼저 보여 준 것을 되돌릴 수 있게.
    const before = s.host.count(MAIN);
    const revision = s.state().revision;
    s.registry.dispatchBarAction(MAIN, {
      seq: 52,
      action: { type: 'reorder', tabId: 'missing', toIndex: 0 },
    });
    assert.deepEqual(s.ids(), [b, c, a]);
    assert.equal(s.host.count(MAIN), before + 1);
    assert.equal(s.state().ackSeq, 52);
    assert.equal(s.state().revision, revision + 1);
  });

  it('closes one tab, a side or the others, and reopens them as they were', () => {
    const s = setup();
    s.open('/properties');
    const contacts = s.open('/contacts');
    const tasks = s.open('/tasks');
    assert.deepEqual(s.routes(), ['/dashboard', '/properties', '/contacts', '/tasks']);

    s.bar(MAIN, { type: 'close-left', tabId: contacts });
    assert.deepEqual(s.routes(), ['/contacts', '/tasks']);
    assert.equal(s.state().canReopenClosed, true);

    s.bar(MAIN, { type: 'reopen-closed' });
    assert.deepEqual(s.routes(), ['/dashboard', '/properties', '/contacts', '/tasks']);
    assert.equal(s.state().canReopenClosed, false);

    s.bar(MAIN, { type: 'close-right', tabId: contacts });
    assert.deepEqual(s.routes(), ['/dashboard', '/properties', '/contacts']);
    assert.ok(s.host.views.discarded.includes(tasks));

    s.bar(MAIN, { type: 'close-others', tabId: contacts });
    assert.deepEqual(s.ids(), [contacts]);
    assert.equal(s.active(), contacts);

    s.bar(MAIN, { type: 'close', tabId: contacts });
    assert.deepEqual(s.routes(), ['/dashboard']);
    assert.notEqual(s.active(), contacts);
  });

  it('opens new tabs in the main window only', () => {
    const s = setup();
    s.bar(MAIN, { type: 'new-tab' });
    const tabs = s.registry.getTabs(MAIN);
    assert.equal(tabs.length, 2);
    assert.equal(tabs[1].resourceKey, tabResourceKeys.launcher(tabs[1].id));
    assert.equal(s.active(), tabs[1].id);

    const extra = s.standalone('/properties/p1');
    assert.equal(s.state(extra.windowId).canCreateTabs, false);
    assert.equal(s.state(extra.windowId).windowKind, 'detached');
    s.bar(extra.windowId, { type: 'new-tab' });
    s.registry.runCommand(extra.windowId, { type: 'new-tab' });
    assert.deepEqual(s.ids(extra.windowId), [extra.tabId]);
  });

  it('runs keyboard tab commands', () => {
    const s = setup();
    const a = s.active();
    const b = s.open('/properties');
    const c = s.open('/contacts');

    s.registry.runCommand(MAIN, { type: 'select-relative-tab', offset: 1 });
    assert.equal(s.active(), a, 'wraps to the first tab');
    s.registry.runCommand(MAIN, { type: 'select-relative-tab', offset: -1 });
    assert.equal(s.active(), c);
    s.registry.runCommand(MAIN, { type: 'select-tab-index', index: 1 });
    assert.equal(s.active(), b);
    s.registry.runCommand(MAIN, { type: 'select-tab-index', index: 'last' });
    assert.equal(s.active(), c);
    s.registry.runCommand(MAIN, { type: 'select-tab-index', index: 7 });
    assert.equal(s.active(), c);

    s.registry.runCommand(MAIN, { type: 'close-tab' });
    assert.deepEqual(s.ids(), [a, b]);
    assert.equal(s.active(), b);
    s.registry.runCommand(MAIN, { type: 'reopen-closed-tab' });
    assert.deepEqual(s.routes(), ['/dashboard', '/properties', '/contacts']);
    s.registry.runCommand(MAIN, { type: 'new-tab' });
    assert.equal(s.ids().length, 4);

    s.bar(MAIN, { type: 'command', command: { type: 'select-tab-index', index: 0 } });
    assert.equal(s.active(), a);
  });

  it('keeps the sidebar per window and gives new windows the last choice', () => {
    const s = setup();
    assert.equal(s.state().sidebarOpen, true);

    s.bar(MAIN, { type: 'toggle-sidebar' });
    assert.deepEqual(s.host.sidebar, [{ windowId: MAIN, open: false }]);
    assert.equal(s.state().sidebarOpen, false);
    assert.equal(s.registry.getSidebarOpen(MAIN), false);
    assert.equal(s.registry.getSidebarOpen(null), false);

    const extra = s.standalone('/properties/p1');
    assert.equal(s.state(extra.windowId).sidebarOpen, false);

    // 탭 화면 안의 사이드바 버튼.
    s.registry.requestSidebarOpenFromTab(extra.tabId, true);
    assert.deepEqual(s.host.sidebar.at(-1), { windowId: extra.windowId, open: true });
    assert.equal(s.state(extra.windowId).sidebarOpen, true);
    assert.equal(s.state(MAIN).sidebarOpen, false);

    s.registry.setSidebarOpen(extra.windowId, true);
    assert.equal(s.host.sidebar.length, 2, 'the same value is not sent again');
  });

  it('sends a state only when something the bar shows has changed', () => {
    const s = setup();
    const tabId = s.open('/properties/p1');
    const before = s.host.count(MAIN);
    const revision = s.state().revision;

    s.registry.setFullscreen(MAIN, false);
    s.registry.reportViewState(tabId, { scrollY: 120 });
    s.registry.applyTabAction(tabId, { type: 'update-title', title: s.tab(tabId).title });
    s.registry.reportViewLocation(tabId, '/properties/p1');
    assert.equal(s.host.count(MAIN), before);

    s.registry.setFullscreen(MAIN, true);
    assert.equal(s.host.count(MAIN), before + 1);
    assert.equal(s.state().fullscreen, true);
    assert.equal(s.state().revision, revision + 1);

    s.registry.applyTabAction(tabId, { type: 'update-title', title: '고덕그라시움 101동' });
    assert.equal(s.barTab(tabId).title, '고덕그라시움 101동');

    const revisions = (s.host.published.get(MAIN) ?? []).map((state) => state.revision);
    assert.deepEqual(
      revisions,
      revisions.map((_, index) => index + 1),
      'revisions go up by one per sent state',
    );
    for (const state of s.host.published.get(MAIN) ?? []) assert.ok(isTabBarState(state));
    assert.deepEqual(s.registry.getBarState(MAIN), s.state());
  });
});

describe('TabRegistry: back and forward', () => {
  it('moves inside the active tab and shows what is possible', () => {
    const s = setup();
    const tab = s.active();
    s.sidebarTo(tab, '/contacts');
    assert.deepEqual(s.ids(), [tab]);
    assert.equal(s.tab(tab).route, '/contacts');
    assert.equal(s.host.views.shown(MAIN)?.route, '/contacts');
    assert.deepEqual(s.state().history, { canGoBack: true, canGoForward: false });

    s.bar(MAIN, { type: 'history', direction: 'back' });
    assert.equal(s.tab(tab).route, '/dashboard');
    assert.equal(s.host.views.shown(MAIN)?.route, '/dashboard');
    assert.deepEqual(s.state().history, { canGoBack: false, canGoForward: true });

    s.registry.runCommand(MAIN, { type: 'history', direction: 'forward' });
    assert.equal(s.tab(tab).route, '/contacts');
    // 갈 곳이 없으면 아무 일도 없다.
    s.registry.runCommand(MAIN, { type: 'history', direction: 'forward' });
    assert.equal(s.tab(tab).route, '/contacts');
    assert.deepEqual(s.host.toasts, []);
  });

  it('opens the previous screen in a new tab on a modified click', () => {
    const s = setup();
    const tab = s.active();
    s.sidebarTo(tab, '/contacts');

    s.bar(MAIN, { type: 'history', direction: 'back', inNewTab: true });
    assert.equal(s.ids().length, 2);
    assert.equal(s.tab(tab).route, '/contacts');
    assert.notEqual(s.active(), tab);
    assert.equal(s.tab(s.active()).route, '/dashboard');

    // 갈 곳이 없는 방향은 아무것도 열지 않는다.
    s.bar(MAIN, { type: 'history', direction: 'forward', inNewTab: true });
    assert.equal(s.ids().length, 2);
  });

  it('opens the previous screen in a new tab when the view has unsaved work', () => {
    const s = setup();
    const tab = s.active();
    s.sidebarTo(tab, '/properties/new');
    s.host.views.unsaved.add(tab);

    s.bar(MAIN, { type: 'history', direction: 'back' });

    assert.equal(s.ids().length, 2);
    assert.equal(s.tab(tab).route, '/properties/new');
    assert.equal(s.tab(s.active()).route, '/dashboard');
    assert.deepEqual(s.host.toasts, [
      {
        windowId: MAIN,
        toast: {
          level: 'info',
          message: '저장하지 않은 입력이 있어 이전 화면을 새 탭으로 열었습니다.',
        },
      },
    ]);
  });

  it('stays put inside the same work when there is unsaved input, and says why', () => {
    const s = setup();
    // 보기 → 수정은 같은 업무의 다른 화면이다. 수정 중에 뒤로 가면 입력이 사라진다.
    const tab = s.open('/buyer-requirements/b1');
    s.registry.reportViewLocation(tab, '/buyer-requirements/b1/edit');
    s.registry.applyTabAction(tab, { type: 'update-form-draft', key: 'memo', value: '초안' });
    assert.equal(s.state().history.canGoBack, true);

    s.bar(MAIN, { type: 'history', direction: 'back' });

    assert.equal(s.tab(tab).route, '/buyer-requirements/b1/edit');
    assert.equal(s.tab(tab).uiState?.formDraft?.memo, '초안');
    assert.equal(s.ids().length, 2);
    assert.equal(s.host.toasts.length, 1);
    assert.equal(s.host.toasts[0].toast.level, 'warning');
    assert.equal(
      s.host.toasts[0].toast.message,
      '저장하지 않은 입력이 있어 이동하지 않았습니다.',
    );
  });

  it('lists earlier screens nearest first and jumps to the chosen one', async () => {
    const s = setup();
    const tab = s.active();
    s.sidebarTo(tab, '/contacts');
    s.sidebarTo(tab, '/tasks');

    assert.deepEqual(s.registry.historyMenuItems(MAIN, 'back'), [
      { type: 'item', id: '1', label: '연락처' },
      { type: 'item', id: '0', label: '대시보드' },
    ]);
    assert.deepEqual(s.registry.historyMenuItems(MAIN, 'forward'), []);

    s.host.menuAnswer = (items) => {
      const last = items.at(-1);
      return last?.type === 'item' ? last.id : null;
    };
    s.bar(MAIN, { type: 'history-menu', direction: 'back' });
    await settleMicrotasks();

    assert.equal(s.host.menus.length, 1);
    assert.equal(s.tab(tab).route, '/dashboard');
    assert.deepEqual(
      s.registry.historyMenuItems(MAIN, 'forward').map((item) =>
        item.type === 'item' ? item.label : '-',
      ),
      ['연락처', '업무'],
    );

    // 보여 줄 것이 없으면 메뉴를 띄우지 않는다.
    await s.registry.openHistoryMenu(MAIN, 'back');
    assert.equal(s.host.menus.length, 1);
  });
});

describe('TabRegistry: requests from a page inside a tab view', () => {
  function openNativeOwner(s: ReturnType<typeof setup>): string {
    return s.open('/properties/property-1');
  }

  it('opens a different resource from a link in another tab and keeps the source', () => {
    const s = setup();
    const owner = openNativeOwner(s);
    s.registry.applyTabAction(owner, { type: 'adopt-location', route: '/contacts/contact-1' });

    assert.equal(s.ids().length, 3);
    assert.equal(s.tab(owner).route, '/properties/property-1');
    assert.equal(s.tab(s.active()).route, '/contacts/contact-1');
    assert.equal(s.tab(s.active()).title, '연락처 상세');
    assert.equal(s.host.views.shown(MAIN)?.id, s.active());

    // 같은 링크를 다시 누르면 이미 열린 탭을 보여 준다.
    const contact = s.active();
    s.bar(MAIN, { type: 'activate', tabId: owner });
    s.registry.applyTabAction(owner, { type: 'adopt-location', route: '/contacts/contact-1' });
    assert.equal(s.ids().length, 3);
    assert.equal(s.active(), contact);
  });

  it('keeps drafts and closes only the tab that asked', () => {
    const s = setup();
    const owner = openNativeOwner(s);
    const other = s.open('/tasks');

    s.registry.applyTabAction(owner, { type: 'update-form-draft', key: 'memo', value: '메모' });
    assert.equal(s.tab(owner).uiState?.formDraft?.memo, '메모');
    assert.equal(s.barTab(owner).dirty, true);
    assert.equal(s.barTab(other).dirty, false);

    s.registry.applyTabAction(owner, { type: 'clear-form-draft' });
    assert.equal(s.barTab(owner).dirty, false);

    s.registry.applyTabAction(owner, { type: 'close' });
    assert.equal(s.ids().includes(owner), false);
    assert.equal(s.ids().includes(other), true);
  });

  it('ignores own-tab actions after the tab was closed', () => {
    const s = setup();
    const owner = openNativeOwner(s);
    s.bar(MAIN, { type: 'close', tabId: owner });
    const before = s.ids();

    s.registry.applyTabAction(owner, { type: 'close' });
    s.registry.applyTabAction(owner, { type: 'update-title', title: 'x' });
    s.registry.applyTabAction(owner, {
      type: 'create-tab',
      input: { route: '/deals', title: '거래관리' },
    });
    assert.deepEqual(s.ids(), before);
  });

  it('moves the asking tab for a sidebar click, or opens a new tab when it has unsaved work', () => {
    const s = setup();
    const owner = openNativeOwner(s);

    s.sidebarTo(owner, '/contacts');
    assert.equal(s.ids().length, 2);
    assert.equal(s.tab(owner).route, '/contacts');
    assert.equal(s.host.views.shown(MAIN)?.id, owner);
    assert.equal(s.host.views.shown(MAIN)?.route, '/contacts');

    s.host.views.unsaved.add(owner);
    s.sidebarTo(owner, '/tasks');
    assert.equal(s.ids().length, 3);
    assert.equal(s.tab(owner).route, '/contacts');
    assert.notEqual(s.active(), owner);
    assert.equal(s.tab(s.active()).route, '/tasks');
  });

  it('keeps the stored form draft when a scroll position arrives', () => {
    const s = setup();
    const owner = openNativeOwner(s);
    s.registry.applyTabAction(owner, { type: 'update-form-draft', key: 'memo', value: '셸 초안' });
    const presented = s.host.views.presented.length;

    s.registry.reportViewState(owner, { scrollY: 320 });
    assert.equal(s.tab(owner).uiState?.scrollY, 320);
    assert.equal(s.tab(owner).uiState?.formDraft?.memo, '셸 초안');

    // 스크롤 값이 없는 보고는 저장된 위치를 지우지 않는다.
    s.registry.reportViewState(owner, {});
    assert.equal(s.tab(owner).uiState?.scrollY, 320);
    assert.equal(s.host.views.presented.length, presented, 'the view is not shown again');
  });

  it('opens, reveals and replaces resources for the page', () => {
    const s = setup();
    const owner = s.open('/properties/new');
    assert.equal(s.tab(owner).resourceKey, tabResourceKeys.draft('property', owner));

    // 저장 완료: 등록 탭이 그 매물의 상세 탭이 된다.
    s.registry.applyTabAction(owner, {
      type: 'replace-resource',
      input: {
        route: '/properties/p9',
        kind: 'property',
        title: '고덕그라시움 101동 1503호',
        resourceKey: tabResourceKeys.entity('property', 'p9'),
      },
    });
    assert.equal(s.tab(owner).route, '/properties/p9');
    assert.equal(s.tab(owner).resourceKey, tabResourceKeys.entity('property', 'p9'));
    assert.equal(s.barTab(owner).title, '고덕그라시움 101동 1503호');

    // 같은 업무를 다시 열면 그 탭을 보여 준다.
    s.registry.applyTabAction(owner, {
      type: 'open-module',
      input: { route: '/contacts', kind: 'contact', title: '연락처' },
    });
    const contacts = s.active();
    s.registry.applyTabAction(contacts, {
      type: 'open-resource',
      input: {
        route: '/properties/p9?tab=history',
        kind: 'property',
        title: '매물 상세',
        resourceKey: tabResourceKeys.entity('property', 'p9'),
      },
    });
    assert.equal(s.active(), owner);
    assert.equal(s.tab(owner).route, '/properties/p9?tab=history');
    s.registry.applyTabAction(owner, {
      type: 'open-module',
      input: { route: '/contacts', kind: 'contact', title: '연락처' },
    });
    assert.equal(s.active(), contacts);
    assert.equal(s.ids().length, 3);

    // 활성화하지 않고 여는 탭은 보이는 탭을 바꾸지 않는다.
    const presented = s.host.views.presented.length;
    s.registry.applyTabAction(contacts, {
      type: 'create-tab',
      input: { route: '/deals', kind: 'deal', title: '거래관리', activate: false },
    });
    assert.equal(s.ids().length, 4);
    assert.equal(s.active(), contacts);
    assert.equal(s.host.views.presented.length, presented);
  });
});

describe('TabRegistry: what the tab view reports about itself', () => {
  it('records an address change made inside the view without showing it again', () => {
    const s = setup();
    const owner = s.open('/properties');
    const presented = s.host.views.presented.length;

    s.registry.reportViewLocation(owner, '/properties?q=고덕');
    assert.equal(s.tab(owner).route, '/properties?q=고덕');
    assert.equal(s.tab(owner).resourceKey, tabResourceKeys.module('/properties'));
    // 검색 조건처럼 같은 화면 안의 주소 변경은 방문 기록을 쌓지 않는다.
    assert.equal(s.state().history.canGoBack, false);

    // 화면이 스스로 다른 업무로 옮겼다(주소 정리 등): 같은 화면이므로 탭을 새로 만들지 않는다.
    s.registry.reportViewLocation(owner, '/contacts/c1', '홍길동');
    assert.equal(s.state().history.canGoBack, true);
    assert.equal(s.tab(owner).resourceKey, tabResourceKeys.entity('contact', 'c1'));
    assert.equal(s.tab(owner).kind, 'contact');
    assert.equal(s.barTab(owner).title, '홍길동');

    // 같은 업무 안의 이동은 페이지가 붙인 제목을 지킨다.
    s.registry.reportViewLocation(owner, '/contacts/c1?tab=deals');
    assert.equal(s.tab(owner).title, '홍길동');
    // 다른 업무로 가면 그 화면의 기본 제목이 된다.
    s.registry.reportViewLocation(owner, '/tasks');
    assert.equal(s.tab(owner).title, '업무');

    assert.equal(s.ids().length, 2);
    assert.equal(s.host.views.presented.length, presented);
  });

  it('hands the stored draft and scroll to the view when an unloaded tab is selected', () => {
    const s = setup();
    const dashboard = s.active();
    const form = s.open('/properties/new');
    s.registry.applyTabAction(form, { type: 'update-form-draft', key: 'memo', value: '급매' });
    s.registry.reportViewState(form, { scrollY: 640 });
    s.bar(MAIN, { type: 'activate', tabId: dashboard });
    // 이 사이 탭 화면 쪽이 메모리 한도로 그 화면을 내렸다. 탭 목록은 알 필요가 없다.
    s.host.views.presented.length = 0;

    s.bar(MAIN, { type: 'activate', tabId: form });

    assert.equal(s.host.views.presented.length, 1);
    const shown = s.host.views.presented[0];
    assert.equal(shown.windowId, MAIN);
    assert.ok(shown.tab);
    assert.deepEqual(shown.tab, s.tab(form));
    assert.deepEqual(shown.tab.uiState, { formDraft: { memo: '급매' }, scrollY: 640 });
    // 화면이 뜨면서 읽는 자기 탭도 같은 값이다.
    assert.deepEqual(s.registry.getTabSnapshot(form)?.uiState, shown.tab.uiState);
    // 넘겨준 것은 사본이다. 받은 쪽이 고쳐도 탭 목록은 그대로다.
    shown.tab.title = '바뀐 제목';
    assert.notEqual(s.tab(form).title, '바뀐 제목');
  });

  it('keeps a typed draft in its tab when the sidebar is used afterwards', () => {
    const s = setup();
    const form = s.open('/properties/new');
    s.registry.reportViewLocation(form, '/properties/new');
    s.registry.applyTabAction(form, { type: 'update-form-draft', key: 'memo', value: '급매' });

    // 탭 화면이 저장 전 입력을 따로 알리지 않았어도, 보관된 초안이 있으면 덮어쓰지 않는다.
    s.sidebarTo(form, '/contacts');

    assert.equal(s.tab(form).route, '/properties/new');
    assert.equal(s.tab(form).uiState?.formDraft?.memo, '급매');
    assert.notEqual(s.active(), form);
    assert.equal(s.tab(s.active()).route, '/contacts');
    assert.equal(s.barTab(form).dirty, true);
  });

  it('drops a draft that arrives after the tab was moved to another screen', () => {
    const s = setup();
    const form = s.open('/properties/new');
    s.registry.reportViewLocation(form, '/properties/new');
    s.sidebarTo(form, '/contacts');
    assert.equal(s.tab(form).route, '/contacts');

    // 떠나는 등록 화면이 마지막 입력을 뒤늦게 보냈다. 연락처 화면의 것이 아니다.
    s.registry.applyTabAction(form, { type: 'update-form-draft', key: 'memo', value: '늦은 초안' });
    assert.equal(s.tab(form).uiState?.formDraft, undefined);
    assert.equal(s.barTab(form).dirty, false);

    // 그 초안 때문에 다음 이동이 새 탭으로 새지 않는다.
    s.sidebarTo(form, '/tasks');
    assert.equal(s.ids().length, 2);
    assert.equal(s.tab(form).route, '/tasks');

    // 화면이 새 주소를 알린 뒤의 입력은 받는다.
    s.registry.reportViewLocation(form, '/tasks');
    s.registry.applyTabAction(form, { type: 'update-form-draft', key: 'title', value: '전화하기' });
    assert.deepEqual(s.tab(form).uiState?.formDraft, { title: '전화하기' });
  });

  it('drops a late draft after going back as well, and accepts drafts of the screen it shows', () => {
    const s = setup();
    const tab = s.open('/contacts');
    s.registry.reportViewLocation(tab, '/contacts');
    s.sidebarTo(tab, '/properties/new');
    s.registry.reportViewLocation(tab, '/properties/new');

    s.bar(MAIN, { type: 'history', direction: 'back' });
    assert.equal(s.tab(tab).route, '/contacts');
    s.registry.applyTabAction(tab, { type: 'update-form-draft', key: 'memo', value: '늦은 초안' });
    assert.equal(s.barTab(tab).dirty, false);

    // 같은 업무 안에서 주소만 달라진 것은 같은 화면이다(검색 조건 등).
    s.registry.reportViewLocation(tab, '/contacts');
    s.registry.reportViewLocation(tab, '/contacts?q=홍');
    s.registry.applyTabAction(tab, { type: 'update-form-draft', key: 'q', value: '홍' });
    assert.equal(s.barTab(tab).dirty, true);
  });

  it('retries a failed view once, then marks the tab failed until it is reloaded', async () => {
    const s = setup();
    const dashboard = s.active();
    const owner = s.open('/properties/p1');
    s.host.views.presented.length = 0;

    s.registry.reportViewFailure(owner);
    assert.ok(s.host.views.discarded.includes(owner));
    assert.deepEqual(
      s.host.views.presented.map((entry) => entry.tab?.id),
      [owner],
      'shown again with a new view',
    );
    assert.equal(s.barTab(owner).failed, undefined);

    s.registry.reportViewFailure(owner);
    assert.equal(s.host.views.presented.length, 1, 'no second retry');
    assert.equal(s.barTab(owner).failed, true);
    assert.deepEqual(s.registry.tabMenuItems(MAIN, owner)?.slice(0, 2), [
      { type: 'item', id: 'reload', label: '다시 불러오기' },
      { type: 'separator' },
    ]);

    // 다른 탭에 갔다 와도 실패한 화면을 끝없이 다시 띄우지 않는다.
    s.bar(MAIN, { type: 'activate', tabId: dashboard });
    s.bar(MAIN, { type: 'activate', tabId: owner });
    assert.equal(s.host.views.shown(MAIN), null);

    s.host.menuAnswer = () => 'reload';
    await s.registry.openTabMenu(MAIN, owner);
    assert.equal(s.host.views.shown(MAIN)?.id, owner);
    assert.equal(s.barTab(owner).failed, undefined);
    assert.equal(s.registry.tabMenuItems(MAIN, owner)?.[0].type, 'item');
    assert.notDeepEqual(s.registry.tabMenuItems(MAIN, owner)?.[0], {
      type: 'item',
      id: 'reload',
      label: '다시 불러오기',
    });
  });

  it('counts failures afresh once the view has loaded', () => {
    const s = setup();
    const owner = s.open('/properties/p1');
    s.registry.reportViewFailure(owner);
    s.registry.reportViewLocation(owner, '/properties/p1');
    s.host.views.presented.length = 0;

    s.registry.reportViewFailure(owner);
    assert.equal(s.host.views.presented.length, 1, 'retried again after a successful load');
    assert.equal(s.barTab(owner).failed, undefined);
  });

  it('settles a view that fails while it is being shown', () => {
    const s = setup();
    const dashboard = s.active();
    const owner = s.open('/properties/p1');
    s.bar(MAIN, { type: 'activate', tabId: dashboard });
    s.host.views.presented.length = 0;
    s.host.views.onPresent = (_windowId, tab) => {
      if (tab?.id === owner) s.registry.reportViewFailure(owner);
    };

    s.bar(MAIN, { type: 'activate', tabId: owner });

    assert.deepEqual(
      s.host.views.presented.map((entry) => entry.tab?.id),
      [owner, owner],
      'first attempt and one retry',
    );
    assert.equal(s.barTab(owner).failed, true);
    assert.equal(s.active(), owner);
  });
});

describe('TabRegistry: a tab released outside the tab strip', () => {
  const ORIGIN = detachedTabOrigin('darwin');

  it('moves the tab into a new window placed so the tab is under the pointer', () => {
    const s = setup();
    const dashboard = s.active();
    const property = s.open('/contacts');
    s.sidebarTo(property, '/properties/p1');
    s.registry.reportViewLocation(property, '/properties/p1?tab=history');
    s.registry.applyTabAction(property, { type: 'update-form-draft', key: 'memo', value: '초안' });
    s.registry.reportViewState(property, { scrollY: 480 });
    const before = s.tab(property);

    // 끄는 동안 main은 아무것도 모른다. 손을 뗀 뒤에 한 번 알림이 온다.
    assert.deepEqual(s.host.created, []);
    s.release(MAIN, property, { x: 2000, y: 600 });

    assert.equal(s.host.created.length, 1);
    const request = s.host.created[0];
    assert.equal(request.reason, 'tab-drop');
    assert.equal(request.sourceWindowId, MAIN);
    assert.equal(request.tab.id, property);
    // 창의 왼쪽 위 = 손을 뗀 자리 − (새 창의 탭 줄에서 탭이 놓이는 자리 + 탭 안에서 잡은 자리).
    assert.deepEqual(request.placement, {
      point: { x: 2000, y: 600 },
      position: { x: 2000 - (ORIGIN.x + GRAB.x), y: 600 - (ORIGIN.y + GRAB.y) },
    });

    const target = s.host.createdIds[0];
    assert.equal(s.registry.getWindowKind(target), 'detached');
    assert.equal(s.registry.getWindowIdOfTab(property), target);
    assert.deepEqual(s.ids(MAIN), [dashboard]);
    assert.deepEqual(s.ids(target), [property]);
    // 탭은 같은 id·입력 초안·스크롤 그대로 옮겨 간다.
    assert.deepEqual(s.tab(property), before);
    // 떠 있는 화면은 다시 불러오지 않고 따라간다. 닫힌 탭으로 치지도 않는다.
    assert.deepEqual(s.host.views.moved, [{ tabId: property, toWindowId: target }]);
    assert.equal(s.host.views.discarded.includes(property), false);
    assert.equal(s.state(MAIN).canReopenClosed, false);
    assert.equal(s.host.views.shown(MAIN)?.id, dashboard);
    assert.equal(s.host.views.shown(target)?.id, property);
    // 새 창이 앞으로 나온다.
    assert.deepEqual(s.host.focused, [target]);
    assert.deepEqual(s.host.closed, []);

    const targetState = s.state(target);
    assert.ok(isTabBarState(targetState));
    assert.equal(targetState.windowId, target);
    assert.equal(targetState.windowKind, 'detached');
    assert.equal(targetState.canCreateTabs, false);
    assert.equal(targetState.activeTabId, property);
    assert.equal(targetState.tabs[0].dirty, true);
    assert.equal(targetState.history.canGoBack, true, 'the visit history travels with the tab');
    assert.deepEqual(
      s.state(MAIN).tabs.map((tab) => tab.id),
      [dashboard],
    );
    // 원래 창의 탭 줄은 그 동작을 반영한 답을 받는다(먼저 빼 보인 탭을 확정한다).
    assert.equal(s.state(MAIN).ackSeq, s.lastSeq());

    // 옮겨 간 창에서 뒤로 가기가 된다.
    s.registry.applyTabAction(property, { type: 'clear-form-draft' });
    s.bar(target, { type: 'history', direction: 'back' });
    assert.equal(s.tab(property).route, '/contacts');
    assert.equal(s.host.views.shown(target)?.route, '/contacts');
    assert.deepEqual(s.state(target).history, { canGoBack: false, canGoForward: true });
  });

  it('opens the window for a release over the body of an app window, when a screen there took the drop', () => {
    const s = setup();
    const a = s.active();
    const b = s.open('/properties');
    const body = s.host.bodyPoint(MAIN);

    s.release(MAIN, b, body, { accepted: true, grabOffset: { x: 5, y: 7 } });

    const target = s.host.createdIds[0];
    assert.deepEqual(s.ids(target), [b]);
    assert.deepEqual(s.ids(MAIN), [a]);
    assert.deepEqual(s.host.created[0].placement, {
      point: body,
      position: { x: body.x - (ORIGIN.x + 5), y: body.y - (ORIGIN.y + 7) },
    });
  });

  it('does nothing when the release is over the tab strip of any app window', () => {
    const s = setup();
    const a = s.active();
    const b = s.open('/properties');
    const extra = s.standalone('/contacts/c1');
    const windows = s.host.created.length;
    const before = s.layout();
    const published = s.host.count(MAIN);

    // 끌기를 시작한 창의 탭 줄(탭을 놓을 수 없는 자리)과, 그 바로 아래 10px.
    s.release(MAIN, b, s.host.stripPoint(MAIN));
    s.release(MAIN, b, { x: 600, y: 100 + 40 + 9 }, { accepted: true });
    // 다른 창의 탭 줄: 그 탭 줄이 받지 않았어도 새 창은 만들지 않는다.
    s.release(MAIN, b, s.host.stripPoint(extra.windowId));
    s.release(MAIN, b, s.host.stripPoint(extra.windowId), { accepted: true });

    assert.equal(s.host.created.length, windows);
    assert.deepEqual(s.layout(), before);
    assert.equal(s.active(), b);
    assert.deepEqual(s.host.views.moved, []);
    assert.deepEqual(s.host.movedWindows, []);
    assert.deepEqual(s.host.focused, []);
    assert.deepEqual(s.host.closed, []);
    // 아무것도 하지 않았어도 답은 한다. 탭 줄이 먼저 빼 보인 탭을 되돌려야 한다.
    assert.equal(s.host.count(MAIN), published + 4);
    assert.equal(s.state(MAIN).ackSeq, s.lastSeq());
    assert.deepEqual(
      s.state(MAIN).tabs.map((tab) => tab.id),
      [a, b],
    );
  });

  it('opens the window when another window covers the tab strip under the pointer', () => {
    const s = setup();
    s.open('/properties');
    const b = s.active();
    const extra = s.standalone('/contacts/c1');
    // 방금 연 창이 앞에 있고, 메인 창의 탭 줄 위를 덮도록 옮긴다.
    s.host.frames.set(extra.windowId, { x: 300, y: 60, width: 900, height: 600 });
    const overMainStrip = { x: 700, y: 115 };

    s.release(MAIN, b, overMainStrip, { accepted: true });
    assert.equal(s.host.created.at(-1)?.reason, 'tab-drop', 'the body of the front window');

    // 메인 창이 앞이면 같은 자리는 메인 창의 탭 줄이다.
    const s2 = setup();
    s2.open('/properties');
    const b2 = s2.active();
    const extra2 = s2.standalone('/contacts/c1');
    s2.host.frames.set(extra2.windowId, { x: 300, y: 60, width: 900, height: 600 });
    s2.host.focusOrder = [MAIN, extra2.windowId];
    const windows = s2.host.created.length;
    s2.release(MAIN, b2, overMainStrip, { accepted: true });
    assert.equal(s2.host.created.length, windows);
  });

  it('does nothing for a cancelled drag and leaves nothing behind', () => {
    const s = setup();
    const a = s.active();
    const b = s.open('/properties');
    const before = s.layout();

    // Escape: 받은 곳 없이 앱 창 위에서 끝났다(그 자리의 앱 화면은 놓기를 받는다).
    s.release(MAIN, b, s.host.bodyPoint(MAIN), { accepted: false });
    // Escape: 앱 밖에서 끝났고, 방금 Escape를 누른 흔적이 있다.
    s.host.escapePressed = true;
    s.release(MAIN, b, OUTSIDE, { accepted: false });
    s.host.escapePressed = false;

    assert.deepEqual(s.host.created, []);
    assert.deepEqual(s.layout(), before);
    assert.equal(s.active(), b);
    assert.deepEqual(s.host.views.moved, []);
    assert.deepEqual(s.host.views.discarded, []);
    assert.deepEqual(s.host.focused, []);
    assert.equal(s.state(MAIN).canReopenClosed, false);
    assert.equal(s.state(MAIN).ackSeq, s.lastSeq());

    // 남은 것이 없다: 다른 동작도, 다음 끌기도 평소처럼 된다.
    s.bar(MAIN, { type: 'reorder', tabId: a, toIndex: 1 });
    assert.deepEqual(s.ids(MAIN), [b, a]);
    s.release(MAIN, b, OUTSIDE);
    assert.equal(s.host.created.length, 1);
    assert.deepEqual(s.ids(s.host.createdIds[0]), [b]);
    assert.deepEqual(s.ids(MAIN), [a]);
  });

  it('gives the main window a new dashboard when its only tab is released outside', () => {
    const s = setup();
    const only = s.active();
    s.release(MAIN, only, OUTSIDE);

    const target = s.host.createdIds[0];
    assert.deepEqual(s.ids(target), [only]);
    const [replacement] = s.registry.getTabs(MAIN);
    assert.equal(s.registry.getTabs(MAIN).length, 1);
    assert.notEqual(replacement.id, only);
    assert.equal(replacement.route, '/dashboard');
    assert.equal(replacement.resourceKey, tabResourceKeys.launcher(replacement.id));
    assert.equal(s.host.views.shown(MAIN)?.id, replacement.id);
    assert.deepEqual(s.host.closed, []);
  });

  it('moves the window itself when the only tab of an extra window is released outside', () => {
    const s = setup();
    const extra = s.standalone('/properties/p1');
    const windows = s.host.created.length;
    const at = { x: 2400, y: 700 };

    s.release(extra.windowId, extra.tabId, at);

    // 새 창을 만들고 원래 창을 닫는 대신, 그 창을 탭이 마우스 밑에 오는 자리로 옮긴다.
    assert.equal(s.host.created.length, windows);
    assert.deepEqual(s.host.closed, []);
    assert.deepEqual(s.host.movedWindows, [
      {
        windowId: extra.windowId,
        placement: {
          point: at,
          position: { x: at.x - (ORIGIN.x + GRAB.x), y: at.y - (ORIGIN.y + GRAB.y) },
        },
      },
    ]);
    assert.deepEqual(s.host.focused, [extra.windowId]);
    assert.deepEqual(s.ids(extra.windowId), [extra.tabId]);
    assert.deepEqual(s.host.views.moved, []);
    assert.equal(s.state(extra.windowId).ackSeq, s.lastSeq());

    // 그 창의 탭 줄 위에서 끝나면 옮기지도 않는다.
    s.release(extra.windowId, extra.tabId, s.host.stripPoint(extra.windowId));
    assert.equal(s.host.movedWindows.length, 1);
  });

  it('opens a new window from an extra window that has other tabs', () => {
    const s = setup();
    const b = s.open('/properties');
    const extra = s.standalone('/contacts/c1');
    s.adopt(extra.windowId, b, MAIN, 1);
    assert.deepEqual(s.ids(extra.windowId), [extra.tabId, b]);
    const windows = s.host.created.length;

    s.release(extra.windowId, b, OUTSIDE);

    assert.equal(s.host.created.length, windows + 1);
    assert.equal(s.host.created.at(-1)?.sourceWindowId, extra.windowId);
    assert.deepEqual(s.ids(s.host.createdIds.at(-1) ?? 0), [b]);
    assert.deepEqual(s.ids(extra.windowId), [extra.tabId]);
    assert.deepEqual(s.host.movedWindows, []);
    assert.deepEqual(s.host.closed, []);
  });

  it('refuses a release for a tab the window does not have', () => {
    const s = setup();
    const b = s.open('/properties');
    const extra = s.standalone('/properties/p1');
    const windows = s.host.created.length;
    const before = s.layout();

    // 없는 탭, 다른 창의 탭.
    s.release(MAIN, 'missing', OUTSIDE);
    s.release(MAIN, extra.tabId, OUTSIDE);
    s.release(extra.windowId, b, OUTSIDE);
    // 모르는 창이 보낸 것.
    s.release(999, b, OUTSIDE);

    assert.equal(s.host.created.length, windows);
    assert.deepEqual(s.layout(), before);
    assert.deepEqual(s.host.movedWindows, []);
    assert.deepEqual(s.host.focused, []);
  });

  it('leaves everything in place when the new window cannot be created', () => {
    const s = setup();
    const a = s.active();
    const b = s.open('/properties');
    s.host.failCreateWindow = true;

    s.release(MAIN, b, OUTSIDE);

    assert.deepEqual(s.ids(MAIN), [a, b]);
    assert.equal(s.active(), b);
    assert.deepEqual(s.host.views.moved, []);
    assert.deepEqual(s.host.focused, []);
  });

  it('does nothing when the window the drag started in is no longer on the screen', () => {
    const s = setup();
    const b = s.open('/properties');
    // host가 그 창의 자리를 알려 주지 못한다(닫히는 중).
    s.host.frames.delete(MAIN);

    s.release(MAIN, b, OUTSIDE);

    assert.deepEqual(s.host.created, []);
    assert.equal(s.registry.getWindowIdOfTab(b), MAIN);
  });
});

describe('TabRegistry: a tab dropped on the tab strip of another window', () => {
  it('moves the tab into that window at that position and brings the window forward', () => {
    const s = setup();
    const a = s.active();
    const b = s.open('/contacts');
    s.sidebarTo(b, '/properties/p1');
    s.registry.applyTabAction(b, { type: 'update-form-draft', key: 'memo', value: '초안' });
    const before = s.tab(b);
    const extra = s.standalone('/contacts/c1');
    const windows = s.host.created.length;

    s.adopt(extra.windowId, b, MAIN, 0);

    assert.deepEqual(s.ids(extra.windowId), [b, extra.tabId]);
    assert.equal(s.active(extra.windowId), b, 'the adopted tab is the one shown');
    assert.deepEqual(s.ids(MAIN), [a]);
    assert.deepEqual(s.tab(b), before, 'same id, draft and address');
    // 떠 있는 화면은 다시 불러오지 않고 따라간다.
    assert.deepEqual(s.host.views.moved, [{ tabId: b, toWindowId: extra.windowId }]);
    assert.equal(s.host.views.discarded.includes(b), false);
    assert.equal(s.host.views.shown(extra.windowId)?.id, b);
    assert.equal(s.host.views.shown(MAIN)?.id, a);
    assert.deepEqual(s.host.focused, [extra.windowId]);
    // 창을 새로 만들거나 닫지 않는다.
    assert.equal(s.host.created.length, windows);
    assert.deepEqual(s.host.closed, []);
    assert.equal(s.state(MAIN).canReopenClosed, false, 'not a closed tab of the old window');

    const state = s.state(extra.windowId);
    assert.deepEqual(
      state.tabs.map((tab) => tab.id),
      [b, extra.tabId],
    );
    assert.equal(state.activeTabId, b);
    assert.equal(state.ackSeq, s.lastSeq());
    assert.equal(state.history.canGoBack, true, 'the visit history travels with the tab');
  });

  it('puts the tab at the asked slot, or at the end when the slot is past it', () => {
    const s = setup();
    const b = s.open('/properties');
    const c = s.open('/contacts');
    const extra = s.standalone('/contacts/c1');

    s.adopt(extra.windowId, b, MAIN, 1);
    assert.deepEqual(s.ids(extra.windowId), [extra.tabId, b]);
    s.adopt(extra.windowId, c, MAIN, 50);
    assert.deepEqual(s.ids(extra.windowId), [extra.tabId, b, c]);
  });

  it('adopts into the main window and closes the extra window it emptied', () => {
    const s = setup();
    const a = s.active();
    const extra = s.standalone('/properties/p1');

    s.adopt(MAIN, extra.tabId, extra.windowId, 0);

    assert.deepEqual(s.ids(MAIN), [extra.tabId, a]);
    assert.equal(s.active(MAIN), extra.tabId);
    assert.deepEqual(s.host.focused, [MAIN]);
    // 탭이 하나도 남지 않은 메인 창이 아닌 창은 닫힌다.
    assert.deepEqual(s.host.closed, [extra.windowId]);
    assert.equal(s.host.views.discarded.includes(extra.tabId), false);
  });

  it('gives the main window a new dashboard when its only tab is adopted elsewhere', () => {
    const s = setup();
    const only = s.active();
    const extra = s.standalone('/properties/p1');

    s.adopt(extra.windowId, only, MAIN, 1);

    assert.deepEqual(s.ids(extra.windowId), [extra.tabId, only]);
    const [replacement] = s.registry.getTabs(MAIN);
    assert.equal(s.registry.getTabs(MAIN).length, 1);
    assert.notEqual(replacement.id, only);
    assert.equal(replacement.route, '/dashboard');
    assert.deepEqual(s.host.closed, []);
  });

  it('refuses a drop whose tab or source window does not check out', () => {
    const s = setup();
    const b = s.open('/properties');
    const first = s.standalone('/contacts/c1');
    const second = s.standalone('/contacts/c2');
    const windows = s.host.created.length;
    const before = s.layout();

    // 없는 탭.
    s.adopt(first.windowId, 'missing', MAIN);
    // 끌기에 실려 온 창에 그 탭이 없다(끄는 사이 옮겨졌거나, 지어낸 값이다).
    s.adopt(first.windowId, b, second.windowId);
    s.adopt(first.windowId, b, 999);
    // 이미 이 창에 있는 탭.
    s.adopt(MAIN, b, MAIN);
    // 실려 온 창이 받는 창과 같지만 탭은 다른 창에 있다.
    s.adopt(first.windowId, b, first.windowId);
    // 모르는 창이 보낸 것.
    s.adopt(999, b, MAIN);

    assert.deepEqual(s.layout(), before);
    assert.deepEqual(s.host.views.moved, []);
    assert.deepEqual(s.host.focused, []);
    assert.deepEqual(s.host.closed, []);
    assert.equal(s.host.created.length, windows);
    // 받지 않았어도 답은 한다. 탭 줄이 비워 둔 칸을 닫아야 한다.
    assert.equal(s.state(first.windowId).ackSeq, s.lastSeq() - 1);
    assert.deepEqual(
      s.state(first.windowId).tabs.map((tab) => tab.id),
      [first.tabId],
    );
  });

  it('adopts nothing while signed out, and nothing from an earlier session', () => {
    const s = setup();
    const b = s.open('/properties');
    const extra = s.standalone('/contacts/c1');
    s.registry.endSession();

    s.adopt(MAIN, extra.tabId, extra.windowId);
    s.adopt(MAIN, b, MAIN);
    assert.deepEqual(s.registry.getTabs(MAIN), []);
    assert.deepEqual(s.host.views.moved, []);
    assert.deepEqual(s.host.focused, []);

    // 다음 로그인에서도 이전 세션의 탭은 없는 탭이다.
    s.registry.startSession();
    const fresh = s.ids(MAIN);
    s.adopt(MAIN, extra.tabId, extra.windowId);
    assert.deepEqual(s.ids(MAIN), fresh);
    assert.deepEqual(s.host.views.moved, []);
  });

  it('ends the same way whichever of the two tab strips reports first', () => {
    // 다른 창의 탭 줄에 놓으면 그 탭 줄은 "받기"를, 끌기를 시작한 탭 줄은 "탭 줄 밖에서
    // 끝났다"를 보낸다. 두 문서가 따로 보내므로 순서는 정해져 있지 않다.
    for (const order of ['adopt first', 'release first'] as const) {
      const s = setup();
      const a = s.active();
      const b = s.open('/properties');
      const extra = s.standalone('/contacts/c1');
      const windows = s.host.created.length;
      const at = s.host.stripPoint(extra.windowId);

      if (order === 'adopt first') {
        s.adopt(extra.windowId, b, MAIN, 0);
        s.release(MAIN, b, at, { accepted: true });
      } else {
        s.release(MAIN, b, at, { accepted: true });
        s.adopt(extra.windowId, b, MAIN, 0);
      }

      assert.deepEqual(s.ids(extra.windowId), [b, extra.tabId], order);
      assert.deepEqual(s.ids(MAIN), [a], order);
      assert.equal(s.host.created.length, windows, `${order}: no new window`);
      assert.deepEqual(s.host.movedWindows, [], order);
      assert.deepEqual(s.host.views.moved, [{ tabId: b, toWindowId: extra.windowId }], order);
    }
  });
});

describe('TabRegistry: windows that hold tabs moved by other means', () => {
  it('closes an extra window when its last tab is closed', () => {
    const s = setup();
    const extra = s.standalone('/properties/p1');
    s.bar(extra.windowId, { type: 'close', tabId: extra.tabId });
    assert.deepEqual(s.host.closed, [extra.windowId]);

    s.registry.unregisterWindow(extra.windowId);
    assert.equal(s.registry.hasWindow(extra.windowId), false);
    assert.equal(s.registry.getTabs(MAIN).length, 1);
  });

  it('forgets the tabs of a window that closed, including one that was just dropped there', () => {
    const s = setup();
    const b = s.open('/properties');
    s.release(MAIN, b, OUTSIDE);
    const target = s.host.createdIds[0];

    s.registry.unregisterWindow(target);

    assert.equal(s.registry.getTabSnapshot(b), null);
    assert.ok(s.host.views.discarded.includes(b));
    assert.equal(s.registry.hasWindow(target), false);
  });

  it('moves a tab into another existing window at the asked position', () => {
    const s = setup();
    const a = s.active();
    const b = s.open('/properties');
    const extra = s.standalone('/contacts/c1');

    assert.equal(s.registry.moveTab(b, extra.windowId, 0), true);
    assert.deepEqual(s.ids(extra.windowId), [b, extra.tabId]);
    assert.equal(s.active(extra.windowId), b);
    assert.deepEqual(s.ids(MAIN), [a]);
    assert.deepEqual(s.host.views.moved, [{ tabId: b, toWindowId: extra.windowId }]);
    assert.equal(s.host.views.shown(extra.windowId)?.id, b);
    assert.equal(s.host.views.shown(MAIN)?.id, a);

    assert.equal(s.registry.moveTab(b, extra.windowId), false, 'already there');
    assert.equal(s.registry.moveTab(b, 999), false);
    assert.equal(s.registry.moveTab('missing', MAIN), false);

    assert.equal(s.registry.moveTab(b, MAIN), true);
    assert.deepEqual(s.ids(MAIN), [a, b]);
    assert.deepEqual(s.ids(extra.windowId), [extra.tabId]);
    assert.deepEqual(s.host.closed, []);
  });

  it('opens a standalone window with one tab and leaves the other tabs alone', () => {
    const s = setup();
    s.open('/properties');
    const before = s.ids();
    const active = s.active();

    const result = s.registry.openStandaloneTab(
      { route: '/properties/p1', kind: 'property', title: '매물 상세' },
      MAIN,
    );

    assert.ok(result.ok);
    const request = s.host.created[0];
    assert.equal(request.reason, 'standalone');
    assert.equal(request.sourceWindowId, MAIN);
    assert.equal(request.position, undefined);
    assert.equal(request.tab.id, result.tabId);
    assert.equal(s.registry.getWindowKind(result.windowId), 'detached');
    assert.deepEqual(s.ids(result.windowId), [result.tabId]);
    assert.equal(s.tab(result.tabId).resourceKey, tabResourceKeys.entity('property', 'p1'));
    assert.equal(s.host.views.shown(result.windowId)?.id, result.tabId);
    assert.equal(s.state(result.windowId).tabs.length, 1);
    assert.deepEqual(s.ids(MAIN), before);
    assert.equal(s.active(), active);

    s.host.failCreateWindow = true;
    assert.deepEqual(
      s.registry.openStandaloneTab({ route: '/properties/p2', title: '매물 상세' }, MAIN),
      { ok: false, error: 'failed to create the window' },
    );
  });

  it('opens an outside link in the main window', () => {
    const s = setup();
    const dashboard = s.active();

    assert.equal(s.registry.openRoute('/properties/p1'), true);
    assert.equal(s.ids().length, 2);
    const property = s.active();
    assert.notEqual(property, dashboard);
    assert.equal(s.tab(property).title, '매물 상세');

    // 지금 탭과 같은 업무면 그 탭에서 주소만 바꾼다.
    assert.equal(s.registry.openRoute('/properties/p1?tab=history'), true);
    assert.equal(s.ids().length, 2);
    assert.equal(s.tab(property).route, '/properties/p1?tab=history');
    assert.equal(s.host.views.shown(MAIN)?.route, '/properties/p1?tab=history');

    // 다른 탭을 보고 있으면 이미 열린 탭을 보여 준다.
    s.bar(MAIN, { type: 'activate', tabId: dashboard });
    assert.equal(s.registry.openRoute('/properties/p1'), true);
    assert.equal(s.ids().length, 2);
    assert.equal(s.active(), property);

    assert.equal(s.registry.openRoute('/tasks', 999), false);
  });

  it('refuses addresses that could resolve to another host', () => {
    const s = setup();
    const before = s.ids();
    const tab = s.active();
    for (const route of [
      '//evil.example/dashboard',
      '/\\evil.example/dashboard',
      '/\\/evil.example/contacts',
      '/contacts/../\\evil.example',
      '/\t/evil.example',
      'https://evil.example/',
    ]) {
      assert.equal(s.registry.openRoute(route), false, route);
      assert.deepEqual(
        s.registry.openStandaloneTab({ route, title: 'x' }, MAIN),
        { ok: false, error: 'invalid route' },
        route,
      );
      s.registry.reportViewLocation(tab, route);
    }
    assert.deepEqual(s.ids(), before);
    assert.equal(s.tab(tab).route, '/dashboard');
    assert.deepEqual(s.host.created, []);
  });
});

describe('TabRegistry: what can become a tab', () => {
  // 로그인·가입·온보딩·개발용 화면과 문서 파일은 창의 화면이 그린다. 탭이 될 수 없다.
  const NOT_TAB_SCREENS = [
    '/',
    '/login',
    '/register',
    '/onboarding/office',
    '/dev/cti-preview',
    '/tabbar.html',
    '/TABBAR.HTML',
    '/index.html',
    `/properties?sites=${'a'.repeat(4_200)}`,
  ];

  it('refuses them when another surface asks to open an address', () => {
    const s = setup();
    const before = s.routes();
    for (const route of NOT_TAB_SCREENS) {
      assert.equal(s.registry.openRoute(route), false, route);
      assert.deepEqual(
        s.registry.openStandaloneTab({ route, title: 'x' }, MAIN),
        { ok: false, error: 'invalid route' },
        route,
      );
    }
    assert.deepEqual(s.routes(), before);
    assert.deepEqual(s.host.created, []);
  });

  it('refuses them in every request a page inside a tab view can make', () => {
    const s = setup();
    const tab = s.active();
    const before = s.routes();
    for (const route of NOT_TAB_SCREENS) {
      const input = { route, title: 'x' };
      s.registry.applyTabAction(tab, { type: 'create-tab', input });
      s.registry.applyTabAction(tab, {
        type: 'open-resource',
        input: { ...input, resourceKey: 'entity:property:p1' },
      });
      s.registry.applyTabAction(tab, { type: 'open-module', input });
      s.registry.applyTabAction(tab, {
        type: 'replace-resource',
        input: { ...input, resourceKey: 'entity:property:p1' },
      });
      s.registry.applyTabAction(tab, { type: 'navigate', input });
      s.registry.applyTabAction(tab, { type: 'adopt-location', route });
      assert.deepEqual(s.routes(), before, route);
    }
    assert.equal(s.active(), tab);
    // 주소가 없는 요청은 그대로 받는다.
    s.registry.applyTabAction(tab, { type: 'update-title', title: '바뀐 제목' });
    assert.equal(s.tab(tab).title, '바뀐 제목');
  });

  it('refuses them as an address a tab view reports, and says so', () => {
    const s = setup();
    const tab = s.open('/properties');
    for (const route of NOT_TAB_SCREENS) {
      assert.equal(s.registry.reportViewLocation(tab, route), false, route);
      assert.equal(s.tab(tab).route, '/properties', route);
    }
    // 받은 주소는 받았다고 답한다: 부른 쪽은 그때만 자기 기록도 바꾼다.
    assert.equal(s.registry.reportViewLocation(tab, '/properties?tab=sale'), true);
    assert.equal(s.tab(tab).route, '/properties?tab=sale');
    assert.equal(s.registry.reportViewLocation(tab, '/properties?tab=sale'), true);
    assert.equal(s.registry.reportViewLocation('no-such-tab', '/contacts'), false);
  });

  it('still opens every screen of the signed-in app', () => {
    const s = setup();
    for (const route of [
      '/dashboard',
      '/properties',
      '/properties/p1',
      '/properties/new',
      '/contacts?group=vip',
      '/settings#billing',
    ]) {
      assert.equal(s.registry.openRoute(route), true, route);
    }
  });
});

describe('TabRegistry: notices follow the tab that ends up visible', () => {
  it('hands the notice over only after it asked for the new tab to be shown', () => {
    const s = setup();
    const tab = s.active();
    s.sidebarTo(tab, '/properties/new');
    s.host.views.unsaved.add(tab);
    s.host.order.length = 0;

    s.bar(MAIN, { type: 'history', direction: 'back' });

    const opened = s.active();
    assert.notEqual(opened, tab);
    // 알림을 받는 쪽(host)은 이때 보여 주는 중인 탭이 끝나기를 기다렸다가 그 화면에 띄운다.
    // 동작 도중에 넘기면 아직 이전 탭 화면이 보이는 화면이라 곧 가려질 곳에 뜬다.
    assert.deepEqual(s.host.order, [`present:${MAIN}:${opened}`, `toast:${MAIN}`]);
    assert.equal(s.host.toasts.length, 1);
  });

  it('still hands over a notice when nothing on screen changes', () => {
    const s = setup();
    const tab = s.open('/buyer-requirements/b1');
    s.registry.reportViewLocation(tab, '/buyer-requirements/b1/edit');
    s.registry.applyTabAction(tab, { type: 'update-form-draft', key: 'memo', value: '초안' });
    s.host.order.length = 0;

    s.bar(MAIN, { type: 'history', direction: 'back' });

    assert.deepEqual(s.host.order, [`toast:${MAIN}`]);
    assert.equal(s.host.toasts[0].toast.level, 'warning');
  });
});

describe('TabRegistry: the login screen always has a window', () => {
  it('opens the main window before closing the others when the session ends without one', () => {
    const s = setup();
    const { windowId } = s.standalone('/properties/p1');
    // 사용자가 메인 창을 닫고 매물 창만 쓰고 있었다.
    s.registry.unregisterWindow(MAIN);
    assert.equal(s.registry.getMainWindowId(), null);
    s.host.order.length = 0;

    // 로그아웃했거나 세션이 만료됐다.
    s.registry.endSession();

    assert.equal(s.host.openedMainWindows.length, 1);
    const main = s.host.openedMainWindows[0];
    // 다른 창이 닫히기 전에 메인 창이 먼저 있어야 한다(Windows는 창이 모두 닫히면 앱이 끝난다).
    assert.deepEqual(
      s.host.order.filter((entry) => !entry.startsWith('present:')),
      [`open-main:${main}`, `close:${windowId}`],
    );
    assert.equal(s.registry.getMainWindowId(), main);
    // 로그인 화면을 보여 줄 창이다: 탭은 없다.
    assert.deepEqual(s.registry.getTabs(main), []);
    assert.deepEqual(s.state(main).tabs, []);

    // 다시 로그인하면 그 창이 첫 탭을 받는다.
    s.registry.startSession();
    assert.deepEqual(s.routes(main), ['/dashboard']);
  });

  it('does not open another main window when one is already open', () => {
    const s = setup();
    s.standalone('/properties/p1');
    s.registry.endSession();
    assert.deepEqual(s.host.openedMainWindows, []);
    assert.equal(s.registry.getMainWindowId(), MAIN);
  });

  it('does not pop a window up when every window was closed', () => {
    const s = setup();
    // macOS에서 창을 모두 닫아 두었다(앱은 Dock에 남아 있다).
    s.registry.unregisterWindow(MAIN);
    s.registry.endSession();
    assert.deepEqual(s.host.openedMainWindows, []);
    assert.deepEqual(s.host.closed, []);
  });
});

describe('TabRegistry: tab menu', () => {
  it('builds the menu from the tab position and applies the choice', async () => {
    const s = setup();
    const a = s.active();
    const b = s.open('/properties');
    const c = s.open('/contacts');

    assert.deepEqual(s.registry.tabMenuItems(MAIN, b), [
      {
        type: 'item',
        id: 'reopen',
        label: '닫은 탭 다시 열기',
        enabled: false,
        accelerator: 'CmdOrCtrl+Shift+T',
      },
      { type: 'separator' },
      { type: 'item', id: 'close', label: '탭 닫기', accelerator: 'CmdOrCtrl+W' },
      { type: 'item', id: 'close-others', label: '다른 탭 닫기', enabled: true },
      { type: 'item', id: 'close-left', label: '왼쪽 탭 닫기', enabled: true },
      { type: 'item', id: 'close-right', label: '오른쪽 탭 닫기', enabled: true },
    ]);
    const enabled = (tabId: string, id: string) => {
      const item = s.registry
        .tabMenuItems(MAIN, tabId)
        ?.find((entry) => entry.type === 'item' && entry.id === id);
      return item?.type === 'item' ? item.enabled : undefined;
    };
    assert.equal(enabled(a, 'close-left'), false);
    assert.equal(enabled(c, 'close-right'), false);
    assert.equal(s.registry.tabMenuItems(MAIN, 'missing'), null);

    s.host.menuAnswer = () => 'close-others';
    s.bar(MAIN, { type: 'tab-menu', tabId: b });
    await settleMicrotasks();
    assert.deepEqual(s.host.menus.map((menu) => menu.windowId), [MAIN]);
    assert.deepEqual(s.ids(), [b]);
    assert.equal(enabled(b, 'reopen'), true);
    assert.equal(enabled(b, 'close-others'), false);

    s.host.menuAnswer = () => 'reopen';
    await s.registry.openTabMenu(MAIN, b);
    assert.deepEqual(s.routes(), ['/dashboard', '/properties', '/contacts']);

    // 취소하면 아무 일도 없다.
    s.host.menuAnswer = () => null;
    await s.registry.openTabMenu(MAIN, b);
    assert.equal(s.ids().length, 3);
    // 없는 탭의 메뉴는 띄우지 않는다.
    const shownMenus = s.host.menus.length;
    await s.registry.openTabMenu(MAIN, 'missing');
    assert.equal(s.host.menus.length, shownMenus);
  });

  it('does nothing when the tab left the window while its menu was open', async () => {
    const s = setup();
    const b = s.open('/properties');
    const extra = s.standalone('/contacts/c1');
    let answer: (id: string | null) => void = () => undefined;
    s.host.menuAnswer = () =>
      new Promise<string | null>((resolve) => {
        answer = resolve;
      });

    const menu = s.registry.openTabMenu(MAIN, b);
    await settleMicrotasks();
    s.registry.moveTab(b, extra.windowId);
    answer('close');
    await menu;

    assert.equal(s.registry.getWindowIdOfTab(b), extra.windowId);
    assert.deepEqual(s.ids(extra.windowId), [extra.tabId, b]);
  });
});

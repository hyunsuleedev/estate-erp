import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Tab } from '@estate-erp/shared';
import type { TabBarState } from '../src/common/tabs/tabBarContract';
import {
  NativeTabHost,
  type NativeTabBounds,
  type NativeTabHostPort,
  type NativeTabViewFactory,
  type NativeTabViewPort,
} from '../src/main/nativeTabHost';
import { TabRegistry, type TabRegistryHost } from '../src/main/tabs/tabRegistry';
import { TabViewCoordinator } from '../src/main/tabs/tabViewCoordinator';
import { recordViewLocation } from '../src/main/tabs/viewLocation';

// 아래 가짜 화면·창은 test/native-tab-host.test.ts의 것과 같다(실제 NativeTabHost에 붙인다).

function makeTab(id: string, overrides: Partial<Tab> = {}): Tab {
  return {
    schemaVersion: 1,
    id,
    resourceKey: `entity:property:${id}`,
    kind: 'property',
    title: `매물 ${id}`,
    route: `/properties/${id}`,
    createdAt: 1,
    ...overrides,
  };
}

class FakeView implements NativeTabViewPort {
  destroyed = false;
  visible = false;
  bounds: NativeTabBounds = { x: 0, y: 0, width: 0, height: 0 };
  navigations: string[] = [];
  sent: Array<{ channel: string; payload: unknown }> = [];
  failNavigation = false;
  navigationHandler: ((route: string) => Promise<void>) | null = null;

  constructor(readonly senderId: number) {}

  isDestroyed(): boolean {
    return this.destroyed;
  }

  async navigate(route: string): Promise<void> {
    this.navigations.push(route);
    if (this.failNavigation) throw new Error('navigation failed');
    if (this.navigationHandler) await this.navigationHandler(route);
  }

  setBounds(bounds: NativeTabBounds): void {
    this.bounds = { ...bounds };
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }

  send(channel: string, payload: unknown): void {
    this.sent.push({ channel, payload });
  }

  /** 이 화면이 받은 알림. */
  toasts(): unknown[] {
    return this.sent
      .filter((message) => message.channel === 'tabs:toast')
      .map((message) => message.payload);
  }

  focus(): void {
    // focus는 보지 않는다.
  }

  destroy(): void {
    this.destroyed = true;
  }
}

class FakeFactory implements NativeTabViewFactory {
  readonly views: FakeView[] = [];
  nextSenderId = 100;
  failNextNavigation = false;
  nextNavigationHandler: ((route: string) => Promise<void>) | null = null;

  create(): FakeView {
    const view = new FakeView(this.nextSenderId++);
    view.failNavigation = this.failNextNavigation;
    view.navigationHandler = this.nextNavigationHandler;
    this.failNextNavigation = false;
    this.nextNavigationHandler = null;
    this.views.push(view);
    return view;
  }
}

class FakeWindowHost implements NativeTabHostPort {
  destroyed = false;
  failAttach = false;
  readonly attached = new Set<NativeTabViewPort>();
  front: NativeTabViewPort | null = null;

  constructor(readonly id: number) {}

  isDestroyed(): boolean {
    return this.destroyed;
  }

  attach(view: NativeTabViewPort): void {
    if (this.failAttach) throw new Error('attach failed');
    this.attached.add(view);
  }

  detach(view: NativeTabViewPort): void {
    this.attached.delete(view);
    if (this.front === view) this.front = null;
  }

  bringToFront(view: NativeTabViewPort): void {
    assert.ok(this.attached.has(view), 'view must be attached before reordering');
    this.front = view;
  }
}

const BOUNDS = { x: 0, y: 40, width: 1200, height: 800 };

function setup(options: { maxLiveTabs?: number } = {}) {
  const factory = new FakeFactory();
  const nativeTabs = new NativeTabHost(factory, { ...options, inactiveGraceMs: 0 });
  const first = new FakeWindowHost(1);
  const second = new FakeWindowHost(2);
  nativeTabs.registerHost(first, BOUNDS);
  nativeTabs.registerHost(second, BOUNDS);
  const failures: Array<{ windowId: number; tabId: string; error: unknown }> = [];
  const attached: Array<{ tabId: string; windowId: number }> = [];
  const coordinator = new TabViewCoordinator(nativeTabs, {
    onPresentFailed: (windowId, tabId, error) => failures.push({ windowId, tabId, error }),
    onViewAttached: (tabId, windowId) => attached.push({ tabId, windowId }),
  });
  return { factory, nativeTabs, first, second, coordinator, failures, attached };
}

function reportClean(nativeTabs: NativeTabHost, senderId: number): void {
  const reported = nativeTabs.reportTabRetention(senderId, {
    mutating: false,
    transientEditor: false,
    explicitDirty: false,
  });
  assert.ok(reported, `native sender ${senderId} must accept a clean report`);
}

function deferred(): { promise: Promise<void>; resolve(): void; reject(error: Error): void } {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise<void>((resolve) => setImmediate(resolve));
};

describe('TabViewCoordinator', () => {
  it('creates the view for a tab and shows it in its window', async () => {
    const { factory, nativeTabs, first, coordinator, attached, failures } = setup();
    const tab = makeTab('a');

    assert.equal(await coordinator.presentAndWait(1, tab), 'shown');

    const [view] = factory.views;
    assert.deepEqual(view.navigations, ['/properties/a']);
    assert.equal(view.visible, true);
    assert.equal(first.front, view);
    assert.deepEqual(view.bounds, BOUNDS);
    assert.equal(nativeTabs.getActiveTabId(1), 'a');
    assert.deepEqual(attached, [{ tabId: 'a', windowId: 1 }]);
    assert.deepEqual(failures, []);
  });

  it('moves the same view to a new address instead of making another', async () => {
    const { factory, coordinator } = setup();
    await coordinator.presentAndWait(1, makeTab('a'));
    await coordinator.presentAndWait(1, makeTab('a', { route: '/properties/a?tab=history' }));
    await coordinator.presentAndWait(1, makeTab('a', { route: '/properties/a?tab=history' }));

    assert.equal(factory.views.length, 1);
    assert.deepEqual(factory.views[0].navigations, [
      '/properties/a',
      '/properties/a?tab=history',
    ]);
  });

  it('hides the previous tab while the new one is loading, then swaps', async () => {
    const { factory, nativeTabs, first, coordinator } = setup();
    await coordinator.presentAndWait(1, makeTab('a'));
    const [viewA] = factory.views;
    const loading = deferred();
    factory.nextNavigationHandler = () => loading.promise;

    const pending = coordinator.presentAndWait(1, makeTab('b'));
    const viewB = factory.views[1];
    // 고른 탭과 보이는 내용이 어긋나지 않게, 이전 화면은 바로 내린다.
    assert.equal(viewA.visible, false);
    assert.equal(viewB.visible, false);
    assert.equal(nativeTabs.getActiveTabId(1), null);

    loading.resolve();
    assert.equal(await pending, 'shown');
    assert.equal(viewB.visible, true);
    assert.equal(viewA.visible, false);
    assert.equal(first.front, viewB);
  });

  it('applies only the last request when selections overlap', async () => {
    const { factory, nativeTabs, coordinator, attached, failures } = setup();
    const slow = deferred();
    factory.nextNavigationHandler = () => slow.promise;

    const a = coordinator.presentAndWait(1, makeTab('a'));
    const b = coordinator.presentAndWait(1, makeTab('b'));
    assert.equal(await b, 'shown');
    const [viewA, viewB] = factory.views;

    slow.resolve();
    assert.equal(await a, 'superseded');
    assert.equal(nativeTabs.getActiveTabId(1), 'b');
    assert.equal(viewA.visible, false);
    assert.equal(viewB.visible, true);
    assert.deepEqual(attached, [{ tabId: 'b', windowId: 1 }]);
    assert.deepEqual(failures, []);

    // 뒤늦게 뜬 화면은 버리지 않는다. 그 탭을 고르면 다시 불러오지 않고 바로 보인다.
    assert.equal(await coordinator.presentAndWait(1, makeTab('a')), 'shown');
    assert.deepEqual(viewA.navigations, ['/properties/a']);
    assert.equal(viewA.visible, true);
    assert.equal(viewB.visible, false);
  });

  it('keeps windows independent: a newer request elsewhere does not cancel this one', async () => {
    const { factory, nativeTabs, coordinator } = setup();
    const slow = deferred();
    factory.nextNavigationHandler = () => slow.promise;

    const a = coordinator.presentAndWait(1, makeTab('a'));
    assert.equal(await coordinator.presentAndWait(2, makeTab('b')), 'shown');
    slow.resolve();

    assert.equal(await a, 'shown');
    assert.equal(nativeTabs.getActiveTabId(1), 'a');
    assert.equal(nativeTabs.getActiveTabId(2), 'b');
  });

  it('lets an inactive view be unloaded and makes a new one when its tab is selected again', async () => {
    const { factory, nativeTabs, coordinator } = setup({ maxLiveTabs: 1 });
    const tabA = makeTab('a', { uiState: { scrollY: 300, formDraft: { memo: '급매' } } });

    await coordinator.presentAndWait(1, tabA);
    reportClean(nativeTabs, factory.views[0].senderId);
    await coordinator.presentAndWait(1, makeTab('b'));
    reportClean(nativeTabs, factory.views[1].senderId);

    // 한도를 넘었고 a는 보이지 않으며 저장할 것도 없다: 화면을 내린다.
    // (보여 주는 동안 잡아 둔 보호를 놓지 않았다면 내려가지 않는다.)
    assert.equal(factory.views[0].destroyed, true);
    assert.equal(nativeTabs.hasTab('a'), false);
    assert.equal(coordinator.hasUnsavedWork(1, 'a'), false);

    assert.equal(await coordinator.presentAndWait(1, tabA), 'shown');
    assert.equal(factory.views.length, 3);
    const recreated = factory.views[2];
    assert.deepEqual(recreated.navigations, ['/properties/a']);
    assert.equal(recreated.visible, true);
    // 새 화면이 뜨면서 읽을 탭 상태(입력 초안, 스크롤)는 넘겨받은 그대로다.
    assert.deepEqual(nativeTabs.getTabSnapshot('a')?.uiState, tabA.uiState);
  });

  it('moves a live view to another window without loading it again', async () => {
    const { factory, nativeTabs, first, second, coordinator, attached } = setup();
    await coordinator.presentAndWait(1, makeTab('keep'));
    await coordinator.presentAndWait(1, makeTab('a'));
    const viewA = factory.views[1];

    coordinator.move('a', 2);

    assert.equal(nativeTabs.getHostId('a'), 2);
    assert.equal(first.attached.has(viewA), false);
    assert.equal(second.attached.has(viewA), true);
    assert.equal(viewA.destroyed, false);
    assert.deepEqual(viewA.navigations, ['/properties/a']);
    assert.deepEqual(attached.at(-1), { tabId: 'a', windowId: 2 });

    assert.equal(await coordinator.presentAndWait(2, makeTab('a')), 'shown');
    assert.equal(factory.views.length, 2, 'no second view for the moved tab');
    assert.deepEqual(viewA.navigations, ['/properties/a']);
    assert.equal(viewA.visible, true);
    assert.equal(second.front, viewA);

    // 원래 창은 남은 탭을 다시 보여 준다.
    assert.equal(await coordinator.presentAndWait(1, makeTab('keep')), 'shown');
    assert.equal(factory.views[0].visible, true);
    // 옮기기가 끝난 화면은 다시 옮길 수 있다(확정하지 않으면 두 번째 이동이 막힌다).
    coordinator.move('a', 1);
    assert.equal(nativeTabs.getHostId('a'), 1);
  });

  it('moves the view first when asked to show a tab that is still in another window', async () => {
    const { factory, nativeTabs, coordinator } = setup();
    await coordinator.presentAndWait(1, makeTab('a'));

    assert.equal(await coordinator.presentAndWait(2, makeTab('a')), 'shown');

    assert.equal(factory.views.length, 1);
    assert.equal(nativeTabs.getHostId('a'), 2);
    assert.equal(nativeTabs.getActiveTabId(2), 'a');
    assert.equal(nativeTabs.getActiveTabId(1), null);
  });

  it('drops a view it cannot move, so the tab loads afresh where it is shown', async () => {
    const { factory, nativeTabs, second, coordinator } = setup();
    await coordinator.presentAndWait(1, makeTab('a'));
    second.failAttach = true;

    coordinator.move('a', 2);
    assert.equal(nativeTabs.hasTab('a'), false);
    assert.equal(factory.views[0].destroyed, true);

    second.failAttach = false;
    assert.equal(await coordinator.presentAndWait(2, makeTab('a')), 'shown');
    assert.equal(factory.views.length, 2);
    assert.equal(nativeTabs.getHostId('a'), 2);

    // 화면이 없는 탭, 이미 그 창에 있는 탭은 옮길 것이 없다.
    coordinator.move('missing', 1);
    coordinator.move('a', 2);
    assert.equal(nativeTabs.getHostId('a'), 2);
  });

  it('reports a view that failed to load, and leaves nothing half-made behind', async () => {
    const { factory, nativeTabs, coordinator, failures, attached } = setup();
    factory.failNextNavigation = true;

    assert.equal(await coordinator.presentAndWait(1, makeTab('a')), 'failed');

    assert.equal(failures.length, 1);
    assert.equal(failures[0].windowId, 1);
    assert.equal(failures[0].tabId, 'a');
    assert.match(String(failures[0].error), /navigation failed/);
    assert.equal(nativeTabs.hasTab('a'), false);
    assert.equal(factory.views[0].destroyed, true);
    assert.deepEqual(attached, []);

    // 다시 시도하면 새 화면으로 뜬다.
    assert.equal(await coordinator.presentAndWait(1, makeTab('a')), 'shown');
    assert.equal(factory.views.length, 2);
  });

  it('does not report a failure for a tab the user already left', async () => {
    const { factory, nativeTabs, coordinator, failures } = setup();
    const slow = deferred();
    factory.nextNavigationHandler = () => slow.promise;

    const a = coordinator.presentAndWait(1, makeTab('a'));
    assert.equal(await coordinator.presentAndWait(1, makeTab('b')), 'shown');
    slow.reject(new Error('gone'));

    assert.equal(await a, 'superseded');
    assert.deepEqual(failures, []);
    assert.equal(nativeTabs.getActiveTabId(1), 'b');
  });

  it('hides every tab view of the window when asked to show nothing', async () => {
    const { factory, nativeTabs, coordinator } = setup();
    await coordinator.presentAndWait(1, makeTab('a'));

    assert.equal(await coordinator.presentAndWait(1, null), 'hidden');
    assert.equal(factory.views[0].visible, false);
    assert.equal(nativeTabs.getActiveTabId(1), null);
    assert.equal(nativeTabs.hasTab('a'), true, 'hiding does not unload');

    // 이미 사라진 창에 대한 요청은 조용히 끝난다.
    assert.equal(await coordinator.presentAndWait(99, null), 'superseded');
  });

  it('cancels a load in progress when nothing should be shown', async () => {
    const { factory, nativeTabs, coordinator } = setup();
    const slow = deferred();
    factory.nextNavigationHandler = () => slow.promise;

    const a = coordinator.presentAndWait(1, makeTab('a'));
    assert.equal(await coordinator.presentAndWait(1, null), 'hidden');
    slow.resolve();

    assert.equal(await a, 'superseded');
    assert.equal(factory.views[0].visible, false);
    assert.equal(nativeTabs.getActiveTabId(1), null);
  });

  it('discards a view and answers whether a view holds unsaved work', async () => {
    const { factory, nativeTabs, coordinator } = setup();
    await coordinator.presentAndWait(1, makeTab('a'));
    const [view] = factory.views;

    // 아직 아무것도 알리지 않은 화면은 저장 전 입력이 있다고 본다.
    assert.equal(coordinator.hasUnsavedWork(1, 'a'), true);
    reportClean(nativeTabs, view.senderId);
    assert.equal(coordinator.hasUnsavedWork(1, 'a'), false);
    nativeTabs.reportTabRetention(view.senderId, {
      mutating: false,
      transientEditor: true,
      explicitDirty: false,
    });
    assert.equal(coordinator.hasUnsavedWork(1, 'a'), true);
    assert.equal(coordinator.hasUnsavedWork(2, 'a'), false, 'not in that window');

    coordinator.discard('a');
    assert.equal(view.destroyed, true);
    assert.equal(nativeTabs.hasTab('a'), false);
    coordinator.discard('a');
    coordinator.forgetWindow(1);
    assert.equal(await coordinator.presentAndWait(1, makeTab('b')), 'shown');
  });
});

describe('TabViewCoordinator: sending to the tab view the user will see', () => {
  const toast = { level: 'info', message: '알림' };

  it('sends at once when no selection is in progress', async () => {
    const { factory, coordinator } = setup();
    await coordinator.presentAndWait(1, makeTab('a'));

    assert.equal(await coordinator.sendToPresentedTab(1, 'tabs:toast', toast), true);

    assert.deepEqual(factory.views[0].toasts(), [toast]);
  });

  it('waits for the tab being shown and sends to that one, not to the tab it replaces', async () => {
    const { factory, nativeTabs, coordinator } = setup();
    await coordinator.presentAndWait(1, makeTab('a'));
    const gate = deferred();
    factory.nextNavigationHandler = () => gate.promise;

    coordinator.present(1, makeTab('b'));
    const sending = coordinator.sendToPresentedTab(1, 'tabs:toast', toast);
    await flush();
    // 새 탭 화면이 아직 뜨는 중이다. 이전 화면에도, 새 화면에도 보내지 않았다.
    assert.deepEqual(factory.views.map((view) => view.toasts().length), [0, 0]);

    gate.resolve();
    assert.equal(await sending, true);

    assert.equal(nativeTabs.getActiveTabId(1), 'b');
    assert.deepEqual(factory.views[0].toasts(), []);
    assert.deepEqual(factory.views[1].toasts(), [toast]);
    assert.equal(factory.views[1].visible, true);
  });

  it('follows the last selection when the user picks another tab meanwhile', async () => {
    const { factory, nativeTabs, coordinator } = setup();
    await coordinator.presentAndWait(1, makeTab('a'));
    const slowB = deferred();
    factory.nextNavigationHandler = () => slowB.promise;
    coordinator.present(1, makeTab('b'));
    const sending = coordinator.sendToPresentedTab(1, 'tabs:toast', toast);
    await flush();

    const slowC = deferred();
    factory.nextNavigationHandler = () => slowC.promise;
    coordinator.present(1, makeTab('c'));
    slowB.resolve();
    await flush();
    // b는 밀려났고 c가 아직 뜨는 중이다: 아직 보내지 않는다.
    assert.deepEqual(factory.views.map((view) => view.toasts().length), [0, 0, 0]);

    slowC.resolve();
    assert.equal(await sending, true);

    assert.equal(nativeTabs.getActiveTabId(1), 'c');
    assert.deepEqual(factory.views.map((view) => view.toasts().length), [0, 0, 1]);
  });

  it('answers false when the window shows no tab view', async () => {
    const { factory, coordinator } = setup();
    assert.equal(await coordinator.sendToPresentedTab(1, 'tabs:toast', toast), false);

    await coordinator.presentAndWait(1, makeTab('a'));
    await coordinator.presentAndWait(1, null);
    assert.equal(await coordinator.sendToPresentedTab(1, 'tabs:toast', toast), false);
    assert.deepEqual(factory.views[0].toasts(), []);

    // 탭 화면을 띄우지 못한 경우도 같다.
    factory.failNextNavigation = true;
    coordinator.present(1, makeTab('b'));
    assert.equal(await coordinator.sendToPresentedTab(1, 'tabs:toast', toast), false);
  });

  it('keeps windows apart', async () => {
    const { factory, coordinator } = setup();
    await coordinator.presentAndWait(1, makeTab('a'));
    const gate = deferred();
    factory.nextNavigationHandler = () => gate.promise;
    coordinator.present(2, makeTab('b'));

    // 다른 창이 탭을 띄우는 중이어도 이 창의 알림은 기다리지 않는다.
    assert.equal(await coordinator.sendToPresentedTab(1, 'tabs:toast', toast), true);
    assert.deepEqual(factory.views[0].toasts(), [toast]);
    gate.resolve();
    await flush();
  });
});

/**
 * 탭 목록(TabRegistry)과 탭 화면(NativeTabHost)을 실제 조정자로 이어서, 탭 목록이
 * 정한 것이 화면에 그대로 나타나는지 본다. Electron만 가짜다.
 */
describe('TabRegistry with real tab views', () => {
  function wire() {
    const factory = new FakeFactory();
    const nativeTabs = new NativeTabHost(factory, { inactiveGraceMs: 0 });
    const windows = new Map<number, FakeWindowHost>();
    const states = new Map<number, TabBarState>();
    const closed: number[] = [];
    const focused: number[] = [];
    let nextWindowId = 10;
    let nextTabId = 0;
    const frameOf = (windowId: number) =>
      windowId === 1
        ? { x: 0, y: 0, width: 1000, height: 700 }
        : { x: 2000 + windowId * 10, y: 0, width: 1000, height: 700 };

    function addWindow(id: number): void {
      const host = new FakeWindowHost(id);
      windows.set(id, host);
      nativeTabs.registerHost(host, BOUNDS);
    }

    const coordinator: TabViewCoordinator = new TabViewCoordinator(nativeTabs, {
      onPresentFailed: (_windowId, tabId) => registry.reportViewFailure(tabId),
    });
    const host: TabRegistryHost = {
      platform: 'darwin',
      views: coordinator,
      publishState: (windowId, state) => states.set(windowId, state),
      publishSidebar: () => undefined,
      // 실제 host(WindowManager.deliverWindowToast)와 같은 규칙: 보여 주기가 끝난 뒤
      // 그때 보이는 탭 화면에 보낸다.
      showToast: (windowId, toast) => {
        void coordinator.sendToPresentedTab(windowId, 'tabs:toast', toast);
      },
      showMenu: async () => null,
      createWindow: () => {
        const id = nextWindowId;
        nextWindowId += 1;
        // 새 창은 탭 화면을 받을 수 있는 상태로 만들어 돌려준다.
        addWindow(id);
        return id;
      },
      openMainWindow: () => {
        const id = nextWindowId;
        nextWindowId += 1;
        addWindow(id);
        registry.registerWindow(id, 'main');
      },
      closeWindow: (windowId) => {
        closed.push(windowId);
      },
      // 창 1은 (0,0)에 1000×700, 그 밖의 창은 오른쪽에 떨어져 있다.
      tabDropScene: (sourceWindowId) => ({
        sourceContent: frameOf(sourceWindowId),
        zoomFactor: 1,
        windows: [...windows.keys()]
          .sort((a, b) => b - a)
          .map((id) => ({ id, content: frameOf(id) })),
        stripHeight: 40,
        escapePressed: false,
      }),
      moveWindow: () => undefined,
      focusWindow: (windowId) => {
        focused.push(windowId);
      },
    };
    const registry: TabRegistry = new TabRegistry(host, {
      env: { newId: () => `tab-${(nextTabId += 1)}`, now: () => 1 },
    });

    addWindow(1);
    registry.registerWindow(1, 'main');
    registry.startSession();

    let seq = 0;
    return {
      factory,
      nativeTabs,
      windows,
      states,
      closed,
      focused,
      registry,
      bar(windowId: number, action: Parameters<TabRegistry['dispatchBarAction']>[1]['action']) {
        registry.dispatchBarAction(windowId, { seq: (seq += 1), action });
      },
    };
  }

  it('shows the first tab, switches tabs, and follows a navigation', async () => {
    const w = wire();
    await flush();
    const dashboard = w.registry.getActiveTabId(1);
    assert.ok(dashboard);
    assert.equal(w.nativeTabs.getActiveTabId(1), dashboard);
    assert.deepEqual(w.factory.views[0].navigations, ['/dashboard']);
    assert.equal(w.factory.views[0].visible, true);

    w.registry.applyTabAction(dashboard, {
      type: 'create-tab',
      input: { route: '/properties/p1', kind: 'property', title: '매물 상세' },
    });
    await flush();
    const property = w.registry.getActiveTabId(1);
    assert.ok(property);
    assert.equal(w.nativeTabs.getActiveTabId(1), property);
    assert.equal(w.factory.views[1].visible, true);
    assert.equal(w.factory.views[0].visible, false);

    w.bar(1, { type: 'activate', tabId: dashboard });
    await flush();
    assert.equal(w.nativeTabs.getActiveTabId(1), dashboard);
    assert.equal(w.factory.views[0].visible, true);
    assert.equal(w.factory.views.length, 2, 'switching back does not reload');

    // 사이드바 이동: 같은 화면이 새 주소로 간다.
    reportClean(w.nativeTabs, w.factory.views[0].senderId);
    w.registry.applyTabAction(dashboard, {
      type: 'navigate',
      input: { route: '/contacts', kind: 'contact', title: '연락처' },
    });
    await flush();
    assert.deepEqual(w.factory.views[0].navigations, ['/dashboard', '/contacts']);
    assert.equal(w.factory.views.length, 2);
  });

  it('opens a new tab instead of leaving a view that never reported its state', async () => {
    const w = wire();
    await flush();
    const dashboard = w.registry.getActiveTabId(1);
    assert.ok(dashboard);

    // 화면이 아직 "저장할 것 없음"을 알리지 않았다: 덮어쓰지 않는다.
    w.registry.applyTabAction(dashboard, {
      type: 'navigate',
      input: { route: '/contacts', kind: 'contact', title: '연락처' },
    });
    await flush();

    assert.equal(w.registry.getTabs(1).length, 2);
    assert.equal(w.registry.getTabSnapshot(dashboard)?.route, '/dashboard');
    assert.deepEqual(w.factory.views[0].navigations, ['/dashboard']);
  });

  it('moves a tab released outside the tab strip into a new window with its live view', async () => {
    const w = wire();
    await flush();
    const dashboard = w.registry.getActiveTabId(1);
    assert.ok(dashboard);
    w.registry.applyTabAction(dashboard, {
      type: 'create-tab',
      input: { route: '/properties/p1', kind: 'property', title: '매물 상세' },
    });
    await flush();
    const property = w.registry.getActiveTabId(1);
    assert.ok(property);
    const propertyView = w.factory.views[1];

    // 창 1의 본문 위에서 손을 뗐고, 그 자리의 탭 화면이 놓기를 받았다.
    w.bar(1, {
      type: 'drop-outside',
      tabId: property,
      client: { x: 500, y: 400 },
      grabOffset: { x: 20, y: 10 },
      accepted: true,
    });
    await flush();

    const target = 10;
    assert.equal(w.nativeTabs.getHostId(property), target);
    assert.equal(w.windows.get(target)?.front, propertyView);
    assert.equal(propertyView.visible, true);
    assert.equal(propertyView.destroyed, false);
    assert.deepEqual(propertyView.navigations, ['/properties/p1'], 'not loaded again');
    assert.equal(w.factory.views.length, 2);
    // 원래 창은 남은 탭을 보여 준다.
    assert.equal(w.nativeTabs.getActiveTabId(1), dashboard);
    assert.equal(w.factory.views[0].visible, true);
    assert.deepEqual(
      w.states.get(target)?.tabs.map((tab) => tab.id),
      [property],
    );
    assert.deepEqual(w.focused, [target]);
    assert.deepEqual(w.closed, []);
  });

  it('moves a tab dropped on another window\'s tab strip there with its live view', async () => {
    const w = wire();
    await flush();
    const dashboard = w.registry.getActiveTabId(1);
    assert.ok(dashboard);
    w.registry.applyTabAction(dashboard, {
      type: 'create-tab',
      input: { route: '/properties/p1', kind: 'property', title: '매물 상세' },
    });
    await flush();
    const property = w.registry.getActiveTabId(1);
    assert.ok(property);
    const propertyView = w.factory.views[1];
    const opened = w.registry.openStandaloneTab(
      { route: '/contacts/c1', kind: 'contact', title: '연락처' },
      1,
    );
    assert.ok(opened.ok);
    await flush();
    const contactView = w.factory.views[2];
    assert.equal(w.windows.get(opened.windowId)?.front, contactView);

    w.bar(opened.windowId, {
      type: 'adopt',
      tabId: property,
      sourceWindowId: 1,
      toIndex: 0,
    });
    await flush();

    assert.equal(w.nativeTabs.getHostId(property), opened.windowId);
    assert.equal(w.windows.get(opened.windowId)?.front, propertyView, 'the adopted tab is shown');
    assert.equal(propertyView.visible, true);
    assert.equal(contactView.visible, false);
    assert.deepEqual(propertyView.navigations, ['/properties/p1'], 'not loaded again');
    assert.equal(w.factory.views.length, 3, 'no view was created for the move');
    assert.deepEqual(
      w.states.get(opened.windowId)?.tabs.map((tab) => tab.id),
      [property, opened.tabId],
    );
    assert.equal(w.nativeTabs.getActiveTabId(1), dashboard);
    assert.deepEqual(w.focused, [opened.windowId]);
    assert.deepEqual(w.closed, []);

    // 끌기를 시작한 탭 줄이 뒤늦게 보낸 "밖에서 끝났다"는 아무것도 하지 않는다.
    w.bar(1, {
      type: 'drop-outside',
      tabId: property,
      client: { x: 2600, y: 20 },
      grabOffset: { x: 20, y: 10 },
      accepted: true,
    });
    await flush();
    assert.equal(w.nativeTabs.getHostId(property), opened.windowId);
    assert.equal(w.windows.size, 2);
  });

  it('retries a view that fails to load once and then marks the tab failed', async () => {
    const w = wire();
    await flush();
    const dashboard = w.registry.getActiveTabId(1);
    assert.ok(dashboard);

    // 처음 띄울 때와 다시 띄울 때 모두 실패한다.
    const originalCreate = w.factory.create.bind(w.factory);
    let failing = true;
    w.factory.create = () => {
      w.factory.failNextNavigation = failing;
      return originalCreate();
    };
    w.registry.applyTabAction(dashboard, {
      type: 'create-tab',
      input: { route: '/properties/p1', kind: 'property', title: '매물 상세' },
    });
    await flush();
    const property = w.registry.getActiveTabId(1);
    assert.ok(property);

    assert.equal(w.factory.views.length, 3, 'one attempt and one retry');
    assert.equal(w.nativeTabs.hasTab(property), false);
    assert.equal(
      w.states.get(1)?.tabs.find((tab) => tab.id === property)?.failed,
      true,
    );
    assert.equal(w.registry.getTabs(1).length, 2, 'the tab itself stays');

    // 탭 메뉴의 "다시 불러오기".
    failing = false;
    w.registry.reloadTab(property);
    await flush();
    assert.equal(w.nativeTabs.getActiveTabId(1), property);
    assert.equal(w.factory.views.at(-1)?.visible, true);
    assert.equal(
      w.states.get(1)?.tabs.find((tab) => tab.id === property)?.failed,
      undefined,
    );
  });

  it('removes every tab view when the session ends', async () => {
    const w = wire();
    await flush();
    const dashboard = w.registry.getActiveTabId(1);
    assert.ok(dashboard);
    w.registry.applyTabAction(dashboard, {
      type: 'create-tab',
      input: { route: '/properties/p1', kind: 'property', title: '매물 상세' },
    });
    await flush();

    w.registry.endSession();
    await flush();

    assert.equal(w.nativeTabs.getLiveTabCount(), 0);
    assert.ok(w.factory.views.every((view) => view.destroyed));
    assert.equal(w.nativeTabs.getActiveTabId(1), null);
    assert.deepEqual(w.states.get(1)?.tabs, []);
  });

  it('shows the "opened in a new tab" notice in the new tab, not in the one it hides', async () => {
    const w = wire();
    await flush();
    const tab = w.registry.getActiveTabId(1);
    assert.ok(tab);
    // 그 탭의 화면이 대시보드 → 연락처 → 매물로 옮겨 갔다.
    w.registry.reportViewLocation(tab, '/contacts');
    w.registry.reportViewLocation(tab, '/properties/p1');
    // 화면이 저장 전 입력이 없다고 알린 적이 없다: 덮어쓰지 않고 이전 화면을 새 탭으로 연다.
    w.registry.runCommand(1, { type: 'history', direction: 'back' });
    await flush();

    const opened = w.registry.getActiveTabId(1);
    assert.ok(opened);
    assert.notEqual(opened, tab);
    assert.equal(w.nativeTabs.getActiveTabId(1), opened);
    const [oldView, newView] = w.factory.views;
    assert.equal(newView.visible, true);
    assert.equal(oldView.visible, false);
    assert.deepEqual(oldView.toasts(), []);
    assert.deepEqual(newView.toasts(), [
      {
        level: 'info',
        message: '저장하지 않은 입력이 있어 이전 화면을 새 탭으로 열었습니다.',
      },
    ]);
  });

  it('records an address from a tab view in both places or in neither', async () => {
    const w = wire();
    await flush();
    const first = w.registry.getActiveTabId(1);
    assert.ok(first);
    w.registry.applyTabAction(first, {
      type: 'create-tab',
      input: { route: '/properties', kind: 'property', title: '매물' },
    });
    await flush();
    const list = w.registry.getActiveTabId(1);
    assert.ok(list);
    const listView = w.factory.views[1];
    const report = (route: string | null) =>
      recordViewLocation(w.nativeTabs, w.registry, listView.senderId, route);

    // 보통의 주소: 탭 목록과 탭 화면 관리 양쪽에 남는다.
    assert.equal(report('/properties?tab=sale'), 'recorded');
    assert.equal(w.registry.getTabSnapshot(list)?.route, '/properties?tab=sale');
    assert.equal(w.nativeTabs.lookupSender(listView.senderId)?.tab.route, '/properties?tab=sale');

    // 목록 화면이 아주 긴 검색 조건을 주소에 실었다. 탭 목록은 그 길이를 받지 않는다.
    const long = `/properties?sites=${'a'.repeat(4_200)}`;
    assert.equal(report(long), 'left-unrecorded');
    assert.equal(w.registry.getTabSnapshot(list)?.route, '/properties?tab=sale');
    assert.equal(
      w.nativeTabs.lookupSender(listView.senderId)?.tab.route,
      '/properties?tab=sale',
      'the view host must not learn an address the tab list refused',
    );

    // 다른 탭으로 갔다 돌아와도 화면을 예전 주소로 되돌려 보내지 않는다.
    const navigationsBefore = [...listView.navigations];
    w.bar(1, { type: 'activate', tabId: first });
    await flush();
    w.bar(1, { type: 'activate', tabId: list });
    await flush();
    assert.equal(w.nativeTabs.getActiveTabId(1), list);
    assert.deepEqual(listView.navigations, navigationsBefore);

    // 탭 화면이 있을 수 없는 주소: 기록하지 않고, 부른 쪽이 화면을 되돌리게 알린다.
    for (const route of ['/login', '/', '/onboarding/office', '/tabbar.html', null]) {
      assert.equal(report(route), 'not-a-tab-screen', String(route));
    }
    assert.equal(w.registry.getTabSnapshot(list)?.route, '/properties?tab=sale');
    assert.equal(w.nativeTabs.lookupSender(listView.senderId)?.tab.route, '/properties?tab=sale');

    // 탭 목록이 모르는 화면(닫힌 탭, 예비 화면)의 보고는 버린다.
    assert.equal(
      recordViewLocation(w.nativeTabs, w.registry, 9_999, '/contacts'),
      'unknown',
    );
  });

  it('keeps a login window when the session ends while only an extra window is open', async () => {
    const w = wire();
    await flush();
    const opened = w.registry.openStandaloneTab(
      { route: '/properties/p1', kind: 'property', title: '매물 상세' },
      1,
    );
    assert.ok(opened.ok);
    await flush();
    // 사용자가 메인 창을 닫았다.
    w.registry.unregisterWindow(1);
    w.nativeTabs.unregisterHost(1);

    w.registry.endSession();
    await flush();

    const main = w.registry.getMainWindowId();
    assert.ok(main !== null && main !== 1, 'a main window exists for the login screen');
    assert.deepEqual(w.closed, [opened.windowId]);
    assert.deepEqual(w.registry.getTabs(main), []);
    assert.equal(w.nativeTabs.getLiveTabCount(), 0);
  });
});

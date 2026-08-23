import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Tab } from '@estate-erp/shared';
import {
  NativeTabHost,
  type NativeTabBounds,
  type NativeTabHostPort,
  type NativeTabViewFactory,
  type NativeTabViewPort,
} from '../src/main/nativeTabHost';

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
  destroyCount = 0;
  visible = false;
  bounds: NativeTabBounds = { x: 0, y: 0, width: 0, height: 0 };
  navigations: string[] = [];
  messages: Array<{ channel: string; payload: unknown }> = [];
  focusCount = 0;
  failNavigation = false;
  failVisibility = false;
  failNextVisibility = false;
  failBounds = false;
  navigationBlocker: Promise<void> | null = null;
  navigationHandler: ((route: string) => Promise<void>) | null = null;

  constructor(readonly senderId: number) {}

  isDestroyed(): boolean {
    return this.destroyed;
  }

  async navigate(route: string): Promise<void> {
    this.navigations.push(route);
    if (this.failNavigation) throw new Error('navigation failed');
    if (this.navigationHandler) await this.navigationHandler(route);
    if (this.navigationBlocker) await this.navigationBlocker;
  }

  setBounds(bounds: NativeTabBounds): void {
    if (this.failBounds) throw new Error('bounds failed');
    this.bounds = { ...bounds };
  }

  setVisible(visible: boolean): void {
    if (this.failNextVisibility) {
      this.failNextVisibility = false;
      throw new Error('visibility failed once');
    }
    if (this.failVisibility) throw new Error('visibility failed');
    this.visible = visible;
  }

  send(channel: string, payload: unknown): void {
    this.messages.push({ channel, payload });
  }

  focus(): void {
    this.focusCount += 1;
  }

  destroy(): void {
    this.destroyed = true;
    this.destroyCount += 1;
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
    assert.ok(
      this.attached.has(view),
      'view must be attached before reordering',
    );
    this.front = view;
  }
}

function setup(
  options: { maxLiveTabs?: number; inactiveGraceMs?: number } = {},
) {
  const factory = new FakeFactory();
  const nativeTabs = new NativeTabHost(factory, options);
  const first = new FakeWindowHost(1);
  const second = new FakeWindowHost(2);
  nativeTabs.registerHost(first, { x: 10, y: 20, width: 800, height: 600 });
  nativeTabs.registerHost(second, { x: 5, y: 40, width: 900, height: 700 });
  return { factory, nativeTabs, first, second };
}

function reportClean(nativeTabs: NativeTabHost, senderId: number): void {
  const reported = nativeTabs.reportTabRetention(senderId, {
    mutating: false,
    transientEditor: false,
    explicitDirty: false,
  });
  assert.ok(reported, `native sender ${senderId} must accept a clean report`);
}

describe('NativeTabHost', () => {
  it('rejects an invalid live renderer limit', () => {
    const factory = new FakeFactory();

    assert.throws(
      () => new NativeTabHost(factory, { maxLiveTabs: 0 }),
      /positive integer/,
    );
    assert.throws(
      () => new NativeTabHost(factory, { maxLiveTabs: 1.5 }),
      /positive integer/,
    );
    assert.throws(
      () => new NativeTabHost(factory, { inactiveGraceMs: -1 }),
      /finite and non-negative/,
    );
  });

  it('creates one view per tab, updates without duplicate navigation, and indexes its sender', async () => {
    const { factory, nativeTabs, first } = setup();
    const tab = makeTab('one');

    const opened = await nativeTabs.openOrUpdateTab(first.id, tab);
    const view = factory.views[0];

    assert.deepEqual(opened, { created: true, senderId: 100 });
    assert.equal(first.attached.has(view), true);
    assert.equal(first.front, view);
    assert.equal(view.visible, true);
    assert.equal(view.focusCount, 1);
    assert.deepEqual(view.bounds, { x: 10, y: 20, width: 800, height: 600 });
    assert.deepEqual(view.navigations, ['/properties/one']);
    assert.deepEqual(nativeTabs.lookupSender(100), {
      tabId: 'one',
      hostId: 1,
      tab,
    });

    const updatedTitle = makeTab('one', { title: '수정된 제목' });
    const sameRoute = await nativeTabs.openOrUpdateTab(first.id, updatedTitle);
    assert.deepEqual(sameRoute, { created: false, senderId: 100 });
    assert.equal(factory.views.length, 1);
    assert.deepEqual(view.navigations, ['/properties/one']);
    assert.equal(nativeTabs.lookupSender(100)?.tab.title, '수정된 제목');

    await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('one', { route: '/properties/one?panel=history' }),
    );
    assert.deepEqual(view.navigations, [
      '/properties/one',
      '/properties/one?panel=history',
    ]);
  });

  it('moves the same live view between windows and can roll it back exactly', async () => {
    const { factory, nativeTabs, first, second } = setup();
    await nativeTabs.openOrUpdateTab(first.id, makeTab('moving'));
    await nativeTabs.openOrUpdateTab(second.id, makeTab('resident'));
    const moving = factory.views[0];
    const resident = factory.views[1];

    const move = nativeTabs.reparent('moving', second.id);

    assert.equal(
      factory.views.length,
      2,
      'reparent must not create a renderer',
    );
    assert.equal(first.attached.has(moving), false);
    assert.equal(second.attached.has(moving), true);
    assert.equal(nativeTabs.getHostId('moving'), second.id);
    assert.equal(nativeTabs.getActiveTabId(first.id), null);
    assert.equal(nativeTabs.getActiveTabId(second.id), 'moving');
    assert.equal(moving.visible, true);
    assert.equal(resident.visible, false);
    assert.deepEqual(moving.bounds, { x: 5, y: 40, width: 900, height: 700 });

    assert.equal(nativeTabs.rollback(move), true);
    assert.equal(first.attached.has(moving), true);
    assert.equal(second.attached.has(moving), false);
    assert.equal(nativeTabs.getHostId('moving'), first.id);
    assert.equal(nativeTabs.getActiveTabId(first.id), 'moving');
    assert.equal(nativeTabs.getActiveTabId(second.id), 'resident');
    assert.equal(moving.visible, true);
    assert.equal(resident.visible, true);
    assert.deepEqual(moving.bounds, { x: 10, y: 20, width: 800, height: 600 });
    assert.equal(nativeTabs.rollback(move), false, 'a move token is one-shot');
  });

  it('restores the source atomically if the target refuses an attachment', async () => {
    const { factory, nativeTabs, first, second } = setup();
    await nativeTabs.openOrUpdateTab(first.id, makeTab('moving'));
    const moving = factory.views[0];
    second.failAttach = true;

    assert.throws(
      () => nativeTabs.reparent('moving', second.id),
      /attach failed/,
    );
    assert.equal(first.attached.has(moving), true);
    assert.equal(second.attached.has(moving), false);
    assert.equal(nativeTabs.getHostId('moving'), first.id);
    assert.equal(nativeTabs.getActiveTabId(first.id), 'moving');
    assert.equal(moving.visible, true);
    assert.deepEqual(moving.bounds, { x: 10, y: 20, width: 800, height: 600 });
  });

  it('does not split ownership when hiding the target resident fails', async () => {
    const { factory, nativeTabs, first, second } = setup();
    await nativeTabs.openOrUpdateTab(first.id, makeTab('moving'));
    await nativeTabs.openOrUpdateTab(second.id, makeTab('resident'));
    const moving = factory.views[0];
    const resident = factory.views[1];
    resident.failNextVisibility = true;

    assert.throws(
      () => nativeTabs.reparent('moving', second.id),
      /visibility failed once/,
    );
    assert.equal(nativeTabs.getHostId('moving'), first.id);
    assert.equal(nativeTabs.getHostId('resident'), second.id);
    assert.equal(nativeTabs.getActiveTabId(first.id), 'moving');
    assert.equal(nativeTabs.getActiveTabId(second.id), 'resident');
    assert.equal(first.attached.has(moving), true);
    assert.equal(second.attached.has(moving), false);
    assert.equal(second.attached.has(resident), true);
    assert.equal(moving.visible, true);
    assert.equal(resident.visible, true);
  });

  it('rolls back ownership even if target activation changed meanwhile', async () => {
    const { nativeTabs, first, second } = setup();
    await nativeTabs.openOrUpdateTab(first.id, makeTab('moving'));

    const move = nativeTabs.reparent('moving', second.id);
    nativeTabs.activate(second.id, null);

    assert.equal(nativeTabs.rollback(move), true);
    assert.equal(nativeTabs.getHostId('moving'), first.id);
  });

  it('preserves a newly activated source tab when another tab rolls back', async () => {
    const { factory, nativeTabs, first, second } = setup();
    await nativeTabs.openOrUpdateTab(first.id, makeTab('moving'));
    const move = nativeTabs.reparent('moving', second.id);
    await nativeTabs.openOrUpdateTab(first.id, makeTab('new-active'));

    assert.equal(nativeTabs.rollback(move), true);
    assert.equal(nativeTabs.getActiveTabId(first.id), 'new-active');
    assert.equal(factory.views[0]?.visible, false);
    assert.equal(factory.views[1]?.visible, true);
  });

  it('returns a live view to the source when the target window is already closing', async () => {
    const { factory, nativeTabs, first, second } = setup();
    await nativeTabs.openOrUpdateTab(first.id, makeTab('moving'));
    const moving = factory.views[0];
    const move = nativeTabs.reparent('moving', second.id);
    second.destroyed = true;

    assert.equal(nativeTabs.rollback(move), true);
    assert.equal(nativeTabs.getHostId('moving'), first.id);
    assert.equal(first.attached.has(moving), true);
    assert.equal(moving.destroyed, false);
  });

  it('contains post-rollback visibility failures after ownership is restored', async () => {
    const cleanupErrors: unknown[] = [];
    const factory = new FakeFactory();
    const nativeTabs = new NativeTabHost(factory, {
      onCleanupError: (error) => cleanupErrors.push(error),
    });
    const first = new FakeWindowHost(1);
    const second = new FakeWindowHost(2);
    nativeTabs.registerHost(first);
    nativeTabs.registerHost(second);
    await nativeTabs.openOrUpdateTab(first.id, makeTab('moving'));
    const move = nativeTabs.reparent('moving', second.id);
    const resident = await nativeTabs.openOrUpdateTab(second.id, makeTab('resident'));
    assert.equal(resident.created, true);
    factory.views[1].failBounds = true;

    assert.equal(nativeTabs.rollback(move), true);
    assert.equal(nativeTabs.getHostId('moving'), first.id);
    assert.ok(cleanupErrors.some((error) => String(error).includes('bounds')));
  });

  it('updates resource identity together with renderer navigation', async () => {
    const { nativeTabs, first } = setup();
    await nativeTabs.openOrUpdateTab(first.id, makeTab('one'));
    const updated = nativeTabs.updateRendererState(100, {
      route: '/properties/two?panel=history',
      kind: 'property',
      resourceKey: 'entity:property:two',
    });

    assert.equal(updated?.tab.route, '/properties/two?panel=history');
    assert.equal(updated?.tab.resourceKey, 'entity:property:two');
    assert.equal(updated?.tab.kind, 'property');
  });

  it('contains rollback failure when the source host was destroyed', async () => {
    const cleanupErrors: unknown[] = [];
    const factory = new FakeFactory();
    const nativeTabs = new NativeTabHost(factory, {
      onCleanupError: (error) => cleanupErrors.push(error),
    });
    const first = new FakeWindowHost(1);
    const second = new FakeWindowHost(2);
    nativeTabs.registerHost(first);
    nativeTabs.registerHost(second);
    await nativeTabs.openOrUpdateTab(first.id, makeTab('moving'));
    const move = nativeTabs.reparent('moving', second.id);
    first.destroyed = true;

    assert.doesNotThrow(() => nativeTabs.rollback(move));
    assert.equal(nativeTabs.rollback(move), false);
    assert.equal(nativeTabs.getHostId('moving'), second.id);
    assert.deepEqual(cleanupErrors, []);
  });

  it('cleans up a failed first navigation without leaving ownership behind', async () => {
    const { factory, nativeTabs, first } = setup();
    factory.failNextNavigation = true;

    await assert.rejects(
      nativeTabs.openOrUpdateTab(first.id, makeTab('broken')),
      /navigation failed/,
    );

    const broken = factory.views[0];
    assert.equal(first.attached.has(broken), false);
    assert.equal(broken.destroyCount, 1);
    assert.equal(nativeTabs.hasTab('broken'), false);
    assert.equal(nativeTabs.lookupSender(broken.senderId), null);
  });

  it('broadcasts to native renderers, supports exclusion, and prunes dead senders', async () => {
    const { factory, nativeTabs, first, second } = setup();
    await nativeTabs.openOrUpdateTab(first.id, makeTab('one'));
    await nativeTabs.openOrUpdateTab(second.id, makeTab('two'));
    const one = factory.views[0];
    const two = factory.views[1];

    const delivered = nativeTabs.broadcast(
      'tabs:invalidate',
      { queryKey: ['properties'] },
      { exceptSenderId: one.senderId },
    );
    assert.equal(delivered, 1);
    assert.deepEqual(one.messages, []);
    assert.deepEqual(two.messages, [
      { channel: 'tabs:invalidate', payload: { queryKey: ['properties'] } },
    ]);

    two.destroyed = true;
    assert.equal(nativeTabs.broadcast('tabs:invalidate', {}), 1);
    assert.equal(nativeTabs.lookupSender(two.senderId), null);
    assert.equal(nativeTabs.hasTab('two'), false);
  });

  it('updates renderer-owned navigation through the sender reverse index', async () => {
    const { nativeTabs, first } = setup();
    await nativeTabs.openOrUpdateTab(first.id, makeTab('one'));

    const updated = nativeTabs.updateRendererState(100, {
      route: '/properties/one?view=history',
      title: '매물 1 상세',
    });

    assert.equal(updated?.tabId, 'one');
    assert.equal(updated?.hostId, first.id);
    assert.equal(updated?.tab.route, '/properties/one?view=history');
    assert.equal(updated?.tab.title, '매물 1 상세');
    assert.equal(nativeTabs.updateRendererState(999, { route: '/' }), null);
  });

  it('explicitly destroys all child views when a host is disposed', async () => {
    const { factory, nativeTabs, first } = setup();
    await nativeTabs.openOrUpdateTab(first.id, makeTab('one'));
    await nativeTabs.openOrUpdateTab(first.id, makeTab('two'), {
      activate: false,
    });

    assert.equal(nativeTabs.unregisterHost(first.id), 2);
    assert.deepEqual(
      factory.views.map((view) => view.destroyCount),
      [1, 1],
    );
    assert.equal(nativeTabs.hasTab('one'), false);
    assert.equal(nativeTabs.hasTab('two'), false);
    assert.equal(first.attached.size, 0);
  });

  it('evicts the least-recently-used inactive renderer at the global soft cap', async () => {
    const { factory, nativeTabs, first } = setup({ maxLiveTabs: 2 });
    const oldest = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('oldest'),
    );
    reportClean(nativeTabs, oldest.senderId);
    const middle = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('middle'),
    );
    reportClean(nativeTabs, middle.senderId);
    const newest = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('newest'),
    );
    reportClean(nativeTabs, newest.senderId);

    assert.equal(nativeTabs.getLiveTabCount(), 2);
    assert.equal(nativeTabs.hasTab('oldest'), false);
    assert.equal(nativeTabs.hasTab('middle'), true);
    assert.equal(nativeTabs.hasTab('newest'), true);
    assert.equal(nativeTabs.getActiveTabId(first.id), 'newest');
    assert.equal(factory.views[0].destroyCount, 1);
    assert.equal(first.attached.has(factory.views[0]), false);
    assert.equal(nativeTabs.lookupSender(factory.views[0].senderId), null);
  });

  it('updates LRU order when an existing renderer is revisited', async () => {
    const { factory, nativeTabs, first } = setup({ maxLiveTabs: 2 });
    const one = await nativeTabs.openOrUpdateTab(first.id, makeTab('one'));
    reportClean(nativeTabs, one.senderId);
    const two = await nativeTabs.openOrUpdateTab(first.id, makeTab('two'));
    reportClean(nativeTabs, two.senderId);
    nativeTabs.activate(first.id, 'one');
    const three = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('three'),
    );
    reportClean(nativeTabs, three.senderId);

    assert.equal(nativeTabs.hasTab('one'), true);
    assert.equal(nativeTabs.hasTab('two'), false);
    assert.equal(nativeTabs.hasTab('three'), true);
    assert.equal(factory.views[0].destroyCount, 0);
    assert.equal(factory.views[1].destroyCount, 1);
  });

  it('recreates an evicted logical tab with a new sender and renderer', async () => {
    const { factory, nativeTabs, first } = setup({ maxLiveTabs: 2 });
    const oldest = makeTab('oldest', {
      route: '/properties/oldest?panel=history',
      uiState: { scrollY: 540, formDraft: { memo: '복원 상태' } },
    });
    const firstOpen = await nativeTabs.openOrUpdateTab(first.id, oldest);
    reportClean(nativeTabs, firstOpen.senderId);
    const middle = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('middle'),
    );
    reportClean(nativeTabs, middle.senderId);
    const newest = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('newest'),
    );
    reportClean(nativeTabs, newest.senderId);

    assert.equal(nativeTabs.hasTab('oldest'), false);
    assert.equal(factory.views[0].destroyed, true);

    const reopened = await nativeTabs.openOrUpdateTab(first.id, oldest);
    reportClean(nativeTabs, reopened.senderId);

    assert.equal(reopened.created, true);
    assert.notEqual(reopened.senderId, firstOpen.senderId);
    assert.equal(factory.views.length, 4);
    assert.deepEqual(factory.views[3].navigations, [oldest.route]);
    assert.deepEqual(nativeTabs.getTabSnapshot('oldest')?.uiState, oldest.uiState);
    assert.equal(nativeTabs.lookupSender(firstOpen.senderId), null);
    assert.equal(nativeTabs.lookupSender(reopened.senderId)?.tabId, 'oldest');
    assert.equal(nativeTabs.getLiveTabCount(), 2);
    assert.equal(nativeTabs.hasTab('middle'), false);
    assert.equal(factory.views[1].destroyCount, 1);
  });

  it('allows active tabs in separate windows to exceed the soft cap', async () => {
    const { factory, nativeTabs, first, second } = setup({ maxLiveTabs: 1 });
    await nativeTabs.openOrUpdateTab(first.id, makeTab('first-active'));
    await nativeTabs.openOrUpdateTab(second.id, makeTab('second-active'));

    assert.equal(nativeTabs.getLiveTabCount(), 2);
    assert.equal(nativeTabs.getActiveTabId(first.id), 'first-active');
    assert.equal(nativeTabs.getActiveTabId(second.id), 'second-active');
    assert.deepEqual(
      factory.views.map((view) => view.destroyCount),
      [0, 0],
    );
  });

  it('fail-safe pins an unreported renderer until it explicitly reports clean', async () => {
    const { factory, nativeTabs, first } = setup({ maxLiveTabs: 1 });
    const unreported = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('unreported'),
    );
    nativeTabs.activate(first.id, null);
    await nativeTabs.openOrUpdateTab(first.id, makeTab('active'));

    assert.equal(nativeTabs.getLiveTabCount(), 2);
    assert.equal(nativeTabs.hasTab('unreported'), true);
    assert.equal(factory.views[0].destroyCount, 0);

    reportClean(nativeTabs, unreported.senderId);

    assert.equal(nativeTabs.getLiveTabCount(), 1);
    assert.equal(nativeTabs.hasTab('unreported'), false);
    assert.equal(nativeTabs.hasTab('active'), true);
    assert.equal(factory.views[0].destroyCount, 1);
    assert.equal(nativeTabs.lookupSender(unreported.senderId), null);
  });

  it('pins an existing renderer throughout an awaited route navigation', async () => {
    const { factory, nativeTabs, first, second } = setup({ maxLiveTabs: 1 });
    const opening = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('opening'),
    );
    reportClean(nativeTabs, opening.senderId);
    nativeTabs.setTabProtection('opening', 'dirty', true);
    nativeTabs.activate(first.id, null);
    await nativeTabs.openOrUpdateTab(second.id, makeTab('other'));

    let finishNavigation!: () => void;
    factory.views[0].navigationBlocker = new Promise<void>((resolve) => {
      finishNavigation = resolve;
    });
    const pending = nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('opening', { route: '/properties/opening?panel=history' }),
      { activate: false },
    );
    await Promise.resolve();

    reportClean(nativeTabs, opening.senderId);
    assert.equal(nativeTabs.hasTab('opening'), true);
    assert.equal(factory.views[0].destroyed, false);

    finishNavigation();
    const result = await pending;
    assert.equal(result.senderId, opening.senderId);
    assert.equal(nativeTabs.lookupSender(result.senderId)?.tabId, 'opening');
    assert.equal(factory.views[0].destroyed, false);
  });

  it('does not let a stale aborted creator destroy a newer successful navigation', async () => {
    const { factory, nativeTabs, first } = setup({ maxLiveTabs: 1 });
    let rejectFirst!: (error: Error) => void;
    let resolveSecond!: () => void;
    let navigationCount = 0;
    factory.nextNavigationHandler = () => {
      navigationCount += 1;
      return navigationCount === 1
        ? new Promise<void>((_resolve, reject) => {
            rejectFirst = reject;
          })
        : new Promise<void>((resolve) => {
            resolveSecond = resolve;
          });
    };

    const staleOpen = nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('same'),
      { activate: false, retainUntilActivation: true },
    );
    await Promise.resolve();
    const latestOpen = nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('same', { route: '/properties/same?panel=history' }),
    );
    await Promise.resolve();

    resolveSecond();
    const latest = await latestOpen;
    assert.equal(latest.senderId, 100);
    assert.equal(nativeTabs.getActiveTabId(first.id), 'same');

    rejectFirst(new Error('ERR_ABORTED'));
    await assert.rejects(staleOpen, /ERR_ABORTED/);

    assert.equal(nativeTabs.hasTab('same'), true);
    assert.equal(factory.views[0].destroyed, false);
    assert.equal(nativeTabs.lookupSender(latest.senderId)?.tabId, 'same');
    assert.equal(nativeTabs.getActiveTabId(first.id), 'same');
    assert.equal(
      nativeTabs.getTabSnapshot('same')?.route,
      '/properties/same?panel=history',
    );
  });

  it('shares an in-flight initial load for overlapping same-route opens', async () => {
    const { factory, nativeTabs, first } = setup();
    let resolveNavigation!: () => void;
    let navigationCount = 0;
    factory.nextNavigationHandler = () => {
      navigationCount += 1;
      return new Promise<void>((resolve) => {
        resolveNavigation = resolve;
      });
    };
    const staleOpen = nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('shared-load'),
      { activate: false },
    );
    await Promise.resolve();
    const latestOpen = nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('shared-load'),
    );
    await Promise.resolve();

    assert.equal(navigationCount, 1);
    assert.equal(nativeTabs.getActiveTabId(first.id), null);

    resolveNavigation();
    await assert.rejects(staleOpen, /opening was superseded/);
    const latest = await latestOpen;

    assert.equal(latest.senderId, 100);
    assert.equal(nativeTabs.getActiveTabId(first.id), 'shared-load');
    assert.equal(nativeTabs.hasTab('shared-load'), true);
    assert.equal(factory.views[0].destroyed, false);
  });

  it('cleans a blank record when overlapping same-route initial opens both fail', async () => {
    const { factory, nativeTabs, first } = setup({ maxLiveTabs: 1 });
    let rejectNavigation!: (error: Error) => void;
    let navigationCount = 0;
    factory.nextNavigationHandler = () => {
      navigationCount += 1;
      return new Promise<void>((_resolve, reject) => {
        rejectNavigation = reject;
      });
    };
    const creator = nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('failed-shared-load'),
      { activate: false },
    );
    await Promise.resolve();
    const latest = nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('failed-shared-load'),
      { activate: false },
    );
    await Promise.resolve();

    assert.equal(navigationCount, 1);
    rejectNavigation(new Error('ERR_ABORTED'));
    const results = await Promise.allSettled([creator, latest]);

    assert.deepEqual(
      results.map((result) => result.status),
      ['rejected', 'rejected'],
    );
    assert.equal(nativeTabs.hasTab('failed-shared-load'), false);
    assert.equal(nativeTabs.getLiveTabCount(), 0);
    assert.equal(nativeTabs.lookupSender(100), null);
    assert.equal(factory.views[0].destroyed, true);
    assert.equal(first.attached.has(factory.views[0]), false);
    assert.equal(nativeTabs.getActiveTabId(first.id), null);
  });

  it('does not clean a creator from its captured host after reparenting', async () => {
    const { factory, nativeTabs, first, second } = setup();
    let rejectNavigation!: (error: Error) => void;
    factory.nextNavigationHandler = () =>
      new Promise<void>((_resolve, reject) => {
        rejectNavigation = reject;
      });
    const pending = nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('moving-load'),
      { activate: false },
    );
    await Promise.resolve();

    const move = nativeTabs.reparent('moving-load', second.id);
    rejectNavigation(new Error('ERR_ABORTED'));
    await assert.rejects(pending, /ERR_ABORTED/);

    assert.equal(nativeTabs.getHostId('moving-load'), second.id);
    assert.equal(first.attached.has(factory.views[0]), false);
    assert.equal(second.attached.has(factory.views[0]), true);
    assert.equal(factory.views[0].destroyed, false);
    assert.equal(nativeTabs.getActiveTabId(first.id), null);
    assert.equal(nativeTabs.getActiveTabId(second.id), 'moving-load');
    assert.equal(nativeTabs.settleMove(move), true);
  });

  it('holds the await-open to activate gap with a tokenized activation lease', async () => {
    const { factory, nativeTabs, first, second } = setup({ maxLiveTabs: 1 });
    await nativeTabs.openOrUpdateTab(second.id, makeTab('other'));
    const candidate = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('candidate'),
      { activate: false, retainUntilActivation: true },
    );
    assert.ok(candidate.activationLease);

    reportClean(nativeTabs, candidate.senderId);
    assert.equal(nativeTabs.getLiveTabCount(), 2);
    assert.equal(nativeTabs.hasTab('candidate'), true);
    assert.equal(factory.views[1].destroyed, false);

    nativeTabs.activate(first.id, 'candidate');
    assert.equal(
      nativeTabs.releaseActivationLease(candidate.activationLease),
      true,
    );
    assert.equal(
      nativeTabs.releaseActivationLease(candidate.activationLease),
      false,
      'an activation lease is one-shot',
    );
    assert.equal(nativeTabs.hasTab('candidate'), true);
    assert.equal(nativeTabs.getActiveTabId(first.id), 'candidate');
  });

  it('waits for the inactive grace period before evicting a clean renderer', async () => {
    const { factory, nativeTabs, first } = setup({
      maxLiveTabs: 1,
      inactiveGraceMs: 15,
    });
    const resting = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('resting'),
    );
    reportClean(nativeTabs, resting.senderId);
    nativeTabs.activate(first.id, null);
    await nativeTabs.openOrUpdateTab(first.id, makeTab('active'));

    assert.equal(nativeTabs.getLiveTabCount(), 2);
    assert.equal(factory.views[0].destroyCount, 0);

    await new Promise((resolve) => setTimeout(resolve, 40));

    assert.equal(nativeTabs.getLiveTabCount(), 1);
    assert.equal(nativeTabs.hasTab('resting'), false);
    assert.equal(nativeTabs.hasTab('active'), true);
    assert.equal(factory.views[0].destroyCount, 1);
  });

  it('starts the grace period when a long-lived active renderer becomes inactive', async () => {
    const { factory, nativeTabs, first } = setup({
      maxLiveTabs: 1,
      inactiveGraceMs: 25,
    });
    const firstTab = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('long-active'),
    );
    reportClean(nativeTabs, firstTab.senderId);
    await new Promise((resolve) => setTimeout(resolve, 40));

    const secondTab = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('new-active'),
    );
    reportClean(nativeTabs, secondTab.senderId);

    assert.equal(
      nativeTabs.getLiveTabCount(),
      2,
      'time spent active must not consume the inactivity grace period',
    );
    assert.equal(nativeTabs.hasTab('long-active'), true);
    assert.equal(factory.views[0].destroyCount, 0);

    await new Promise((resolve) => setTimeout(resolve, 45));

    assert.equal(nativeTabs.getLiveTabCount(), 1);
    assert.equal(nativeTabs.hasTab('long-active'), false);
    assert.equal(nativeTabs.hasTab('new-active'), true);
    assert.equal(factory.views[0].destroyCount, 1);
  });

  it('keeps dirty and mutation protections independent, then reconciles on release', async () => {
    const { factory, nativeTabs, first } = setup({ maxLiveTabs: 1 });
    const protectedTab = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('protected'),
    );
    reportClean(nativeTabs, protectedTab.senderId);
    assert.equal(
      nativeTabs.setTabProtection('protected', 'dirty', true),
      true,
    );
    assert.equal(
      nativeTabs.setTabProtection('protected', 'mutation', true),
      true,
    );
    nativeTabs.activate(first.id, null);
    await nativeTabs.openOrUpdateTab(first.id, makeTab('active'));

    assert.equal(nativeTabs.getLiveTabCount(), 2);
    nativeTabs.setTabProtection('protected', 'dirty', false);
    assert.equal(
      nativeTabs.getLiveTabCount(),
      2,
      'clearing dirty must not clear an independent mutation pin',
    );

    nativeTabs.setTabProtection('protected', 'mutation', false);

    assert.equal(nativeTabs.getLiveTabCount(), 1);
    assert.equal(nativeTabs.hasTab('protected'), false);
    assert.equal(nativeTabs.hasTab('active'), true);
    assert.equal(factory.views[0].destroyCount, 1);
  });

  it('protects a reparenting tab until its move is settled', async () => {
    const { factory, nativeTabs, first, second } = setup({ maxLiveTabs: 1 });
    const moving = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('moving'),
    );
    reportClean(nativeTabs, moving.senderId);
    const move = nativeTabs.reparent('moving', second.id);
    nativeTabs.activate(second.id, null);
    await nativeTabs.openOrUpdateTab(first.id, makeTab('active'));

    assert.equal(nativeTabs.getLiveTabCount(), 2);
    assert.equal(nativeTabs.hasTab('moving'), true);
    assert.equal(factory.views[0].destroyCount, 0);

    assert.equal(nativeTabs.settleMove(move), true);

    assert.equal(nativeTabs.getLiveTabCount(), 1);
    assert.equal(nativeTabs.hasTab('moving'), false);
    assert.equal(nativeTabs.hasTab('active'), true);
    assert.equal(factory.views[0].destroyCount, 1);
    assert.equal(nativeTabs.settleMove(move), false, 'a move pin is one-shot');
  });

  it('starts the resident grace period when a move takes over its host', async () => {
    const { factory, nativeTabs, first, second } = setup({
      maxLiveTabs: 1,
      inactiveGraceMs: 25,
    });
    const moving = await nativeTabs.openOrUpdateTab(
      first.id,
      makeTab('moving'),
    );
    reportClean(nativeTabs, moving.senderId);
    const resident = await nativeTabs.openOrUpdateTab(
      second.id,
      makeTab('resident'),
    );
    reportClean(nativeTabs, resident.senderId);
    await new Promise((resolve) => setTimeout(resolve, 40));

    const move = nativeTabs.reparent('moving', second.id);
    nativeTabs.settleMove(move);

    assert.equal(nativeTabs.getLiveTabCount(), 2);
    assert.equal(nativeTabs.hasTab('resident'), true);
    assert.equal(factory.views[1].destroyCount, 0);

    await new Promise((resolve) => setTimeout(resolve, 45));

    assert.equal(nativeTabs.getLiveTabCount(), 1);
    assert.equal(nativeTabs.hasTab('moving'), true);
    assert.equal(nativeTabs.hasTab('resident'), false);
    assert.equal(factory.views[1].destroyCount, 1);
  });

  it('normalizes renderer bounds and rejects invalid dimensions', () => {
    const { nativeTabs, first } = setup();
    nativeTabs.updateBounds(first.id, {
      x: 10.4,
      y: 20.6,
      width: 799.8,
      height: 600.2,
    });

    assert.throws(
      () =>
        nativeTabs.updateBounds(first.id, {
          x: 0,
          y: 0,
          width: -1,
          height: 100,
        }),
      /finite and non-negative/,
    );
  });
});

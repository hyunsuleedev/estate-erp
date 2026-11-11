import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Tab } from '@estate-erp/shared';
import {
  BookUser,
  Building,
  CalendarDays,
  FileText,
  Handshake,
  Home,
  ListTodo,
  Map as MapIcon,
  MessageSquare,
  Network,
  PhoneCall,
  Settings as SettingsIcon,
  SquareTerminal,
  UserSearch,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { create } from 'zustand';
import {
  getRouteMetaCore,
  isDetachableRoute as isDetachableRouteCore,
  STATIC_ROUTE_PATHS,
  type RouteIconKey,
} from '../src/common/tabs/routeMeta';
import {
  createEmptyTabHistoryState,
  type TabHistoryState,
} from '../src/common/tabs/tabHistory';
import {
  createTabHistoryActions,
  createTabStoreMethods,
  installTabHistorySync,
  type TabStoreShape,
} from '../src/common/tabs/tabStoreBindings';
import {
  applyWorkspaceStep,
  createEmptyTabWindowState,
  navigateTabHistory,
  reopenLastClosedTabs,
  traverseTabHistory,
  type TabWindowState,
} from '../src/common/tabs/tabWindowState';
import * as workspace from '../src/common/tabs/tabWorkspace';
import type { TabWorkspaceEnv } from '../src/common/tabs/tabWorkspace';
import {
  getRouteMeta,
  isDetachableRoute,
} from '../src/renderer/features/tabs/lib/routeMeta';

/** 화면의 routeMeta.ts와 따로 적어 둔 "아이콘 이름 → 아이콘" 표. 서로 어긋나면 드러난다. */
const ICONS: Record<RouteIconKey, LucideIcon> = {
  building: Building,
  'book-user': BookUser,
  handshake: Handshake,
  'message-square': MessageSquare,
  'phone-call': PhoneCall,
  'user-search': UserSearch,
  'list-todo': ListTodo,
  'calendar-days': CalendarDays,
  map: MapIcon,
  'file-text': FileText,
  wallet: Wallet,
  users: Users,
  settings: SettingsIcon,
  'square-terminal': SquareTerminal,
  network: Network,
  wrench: Wrench,
  home: Home,
};

function makeTab(id: string, overrides: Partial<Tab> = {}): Tab {
  return {
    schemaVersion: 1,
    id,
    resourceKey: `test:${id}`,
    kind: 'generic',
    title: id,
    route: `/${id}`,
    createdAt: 1,
    ...overrides,
  };
}

function workspaceOf(...tabs: Tab[]): workspace.TabWorkspaceState {
  return {
    ...workspace.createEmptyTabWorkspace(),
    tabs,
    activeTabId: tabs[0]?.id ?? null,
  };
}

function counterEnv(): TabWorkspaceEnv {
  let id = 0;
  let now = 1_000;
  return {
    newId: () => `t${(id += 1)}`,
    now: () => (now += 1),
  };
}

describe('route metadata without icons', () => {
  const samples = [
    ...STATIC_ROUTE_PATHS,
    '/properties/property-1',
    '/properties/property-1?tab=history#price',
    '/contacts/contact-1',
    '/buyer-requirements/buyer-1',
    '/buyer-requirements/buyer-1/edit',
    '/deals/deal-1',
    '/unknown/deeper/path',
    '/',
  ];

  it('knows the fixed addresses of the app', () => {
    assert.ok(STATIC_ROUTE_PATHS.length >= 20);
    for (const route of ['/dashboard', '/properties', '/contacts', '/tasks', '/settings']) {
      assert.ok(STATIC_ROUTE_PATHS.includes(route), route);
    }
    assert.deepEqual(getRouteMetaCore('/dashboard'), {
      title: '대시보드',
      kind: 'dashboard',
      iconKey: 'square-terminal',
    });
    assert.deepEqual(getRouteMetaCore('/buyer-requirements/b1/edit'), {
      title: '구매고객 수정',
      kind: 'contact',
      iconKey: 'user-search',
    });
    assert.deepEqual(getRouteMetaCore('/unknown/deeper/path'), {
      title: '/unknown/deeper/path',
      kind: 'generic',
      iconKey: 'home',
    });
  });

  it('gives the screens the same title and kind, with the icon its name stands for', () => {
    for (const route of samples) {
      const screen = getRouteMeta(route);
      const core = getRouteMetaCore(route);
      assert.equal(screen.title, core.title, `title of ${route}`);
      assert.equal(screen.kind, core.kind, `kind of ${route}`);
      assert.equal(screen.icon, ICONS[core.iconKey], `icon of ${route}`);
    }
  });

  it('returns the same object for a fixed address every time', () => {
    assert.equal(getRouteMeta('/properties'), getRouteMeta('/properties?q=1'));
    assert.equal(getRouteMeta('/dashboard'), getRouteMeta('/dashboard'));
  });

  it('agrees on which addresses may leave the main window', () => {
    for (const route of [...samples, '/login', '/login?next=/deals', '/_auth/x', '/_x']) {
      assert.equal(isDetachableRouteCore(route), isDetachableRoute(route), route);
    }
    assert.equal(isDetachableRouteCore('/login'), false);
    assert.equal(isDetachableRouteCore('/properties/p1'), true);
  });
});

describe('moving a tab between windows (pure steps)', () => {
  it('takes a tab out without recording it as closed and picks the neighbour', () => {
    const state = { ...workspaceOf(makeTab('a'), makeTab('b'), makeTab('c')), activeTabId: 'b' };
    const step = workspace.takeTab(state, 'b');
    const next = workspace.applyTabStep(state, step);

    assert.equal(step.result?.id, 'b');
    assert.deepEqual(next.tabs.map((tab) => tab.id), ['a', 'c']);
    // 닫을 때와 같은 규칙: 그 자리에 온 오른쪽 탭.
    assert.equal(next.activeTabId, 'c');
    assert.deepEqual(next.recentlyClosedTabs, []);
  });

  it('keeps the active tab when another tab is taken, and empties cleanly', () => {
    const state = workspaceOf(makeTab('a'), makeTab('b'));
    const afterB = workspace.applyTabStep(state, workspace.takeTab(state, 'b'));
    assert.equal(afterB.activeTabId, 'a');

    const afterA = workspace.applyTabStep(afterB, workspace.takeTab(afterB, 'a'));
    assert.deepEqual(afterA.tabs, []);
    assert.equal(afterA.activeTabId, null);
  });

  it('does nothing when the tab is not in this window', () => {
    const state = workspaceOf(makeTab('a'));
    const step = workspace.takeTab(state, 'missing');
    assert.equal(step.patch, null);
    assert.equal(step.result, null);
    assert.equal(workspace.applyTabStep(state, step), state);
  });

  it('inserts with the same identity, at the asked position, and activates it', () => {
    const state = workspaceOf(makeTab('a'), makeTab('b'));
    const moved = makeTab('moved', {
      resourceKey: 'entity:property:p1',
      route: '/properties/p1',
      uiState: { scrollY: 240, formDraft: { memo: '초안' } },
    });

    const atStart = workspace.applyTabStep(state, workspace.insertTab(state, moved, 0));
    assert.deepEqual(atStart.tabs.map((tab) => tab.id), ['moved', 'a', 'b']);
    assert.equal(atStart.activeTabId, 'moved');
    assert.equal(atStart.tabs[0], moved);

    const atEnd = workspace.applyTabStep(state, workspace.insertTab(state, moved));
    assert.deepEqual(atEnd.tabs.map((tab) => tab.id), ['a', 'b', 'moved']);

    const clamped = workspace.applyTabStep(state, workspace.insertTab(state, moved, 99));
    assert.deepEqual(clamped.tabs.map((tab) => tab.id), ['a', 'b', 'moved']);
  });

  it('refuses a tab id that is already in the window', () => {
    const state = workspaceOf(makeTab('a'));
    const step = workspace.insertTab(state, makeTab('a', { title: '다른 것' }));
    assert.equal(step.result, false);
    assert.equal(step.patch, null);
  });

  it('moves a tab to an index like a drop, clamping out-of-range positions', () => {
    const state = workspaceOf(makeTab('a'), makeTab('b'), makeTab('c'), makeTab('d'));
    const order = (next: workspace.TabWorkspaceState) => next.tabs.map((tab) => tab.id);

    assert.deepEqual(
      order(workspace.applyTabStep(state, workspace.moveTabToIndex(state, 'a', 2))),
      ['b', 'c', 'a', 'd'],
    );
    assert.deepEqual(
      order(workspace.applyTabStep(state, workspace.moveTabToIndex(state, 'd', 0))),
      ['d', 'a', 'b', 'c'],
    );
    assert.deepEqual(
      order(workspace.applyTabStep(state, workspace.moveTabToIndex(state, 'b', 99))),
      ['a', 'c', 'd', 'b'],
    );
    assert.equal(workspace.moveTabToIndex(state, 'b', 1).patch, null);
    assert.equal(workspace.moveTabToIndex(state, 'missing', 0).patch, null);
  });

  it('reorders exactly like the store did for a drag over another tab', () => {
    const state = workspaceOf(makeTab('a'), makeTab('b'), makeTab('c'), makeTab('d'));
    for (const [from, to] of [
      ['a', 'c'],
      ['d', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ] as const) {
      const viaStore = workspace.applyTabStep(state, workspace.reorderTabs(state, from, to));
      const toIndex = state.tabs.findIndex((tab) => tab.id === to);
      const viaIndex = workspace.applyTabStep(
        state,
        workspace.moveTabToIndex(state, from, toIndex),
      );
      assert.deepEqual(
        viaIndex.tabs.map((tab) => tab.id),
        viaStore.tabs.map((tab) => tab.id),
        `${from} → ${to}`,
      );
    }
  });
});

/**
 * 화면에서는 탭 store와 방문 기록 store, 그 사이의 구독이 하던 일을 main에서는
 * TabWindowState 한 값으로 한다. 같은 동작을 양쪽에 주고 매 단계 결과가 같은지 본다.
 */
describe('one window value behaves like the two screen stores', () => {
  function setup() {
    const storeEnv = counterEnv();
    const pureEnv = counterEnv();
    const tabStore = create<TabStoreShape>((set, get) => ({
      ...workspace.createEmptyTabWorkspace(),
      ...createTabStoreMethods(get, set, storeEnv),
    }));
    const historyStore = create<TabHistoryState>(() => createEmptyTabHistoryState());
    installTabHistorySync(tabStore, historyStore);
    const actions = createTabHistoryActions(tabStore, historyStore, {
      hasUnsavedWork: async () => false,
    });
    let pure: TabWindowState = createEmptyTabWindowState();

    function assertSame(label: string) {
      const store = tabStore.getState();
      assert.deepEqual(pure.workspace.tabs, store.tabs, `${label}: tabs`);
      assert.equal(pure.workspace.activeTabId, store.activeTabId, `${label}: active tab`);
      assert.deepEqual(
        pure.workspace.recentlyClosedTabs,
        store.recentlyClosedTabs,
        `${label}: closed tabs`,
      );
      const history = historyStore.getState();
      assert.deepEqual(pure.history.histories, history.histories, `${label}: histories`);
      assert.deepEqual(pure.history.pending, history.pending, `${label}: pending`);
      assert.deepEqual(pure.history.retired, history.retired, `${label}: retired`);
    }

    return {
      tabStore,
      actions,
      pureEnv,
      get pure() {
        return pure;
      },
      apply<R>(label: string, step: (state: workspace.TabWorkspaceState) => workspace.TabStep<R>, store: () => R) {
        const outcome = applyWorkspaceStep(pure, step(pure.workspace));
        pure = outcome.state;
        const storeResult = store();
        assert.deepEqual(outcome.result, storeResult, `${label}: result`);
        assertSame(label);
        return outcome.result;
      },
      async history(label: string, direction: 'back' | 'forward') {
        const outcome = navigateTabHistory(
          pure,
          direction,
          { hasExternalUnsavedWork: false },
          pureEnv,
        );
        pure = outcome.state;
        const storeResult = await actions.navigateTabHistory(direction);
        assert.equal(outcome.result, storeResult, `${label}: result`);
        assertSame(label);
        return outcome.result;
      },
      async jump(label: string, index: number) {
        const outcome = traverseTabHistory(
          pure,
          { index, hasExternalUnsavedWork: false },
          pureEnv,
        );
        pure = outcome.state;
        const storeResult = await actions.goToTabHistoryIndex(index);
        assert.equal(outcome.result, storeResult, `${label}: result`);
        assertSame(label);
        return outcome.result;
      },
      reopen(label: string) {
        const outcome = reopenLastClosedTabs(pure, pureEnv);
        pure = outcome.state;
        const storeResult = actions.reopenLastClosedTabs();
        assert.equal(outcome.result, storeResult, `${label}: result`);
        assertSame(label);
        return outcome.result;
      },
    };
  }

  it('records visits, goes back and forward, and truncates forward entries', async () => {
    const h = setup();
    const store = () => h.tabStore.getState();
    const tab = h.apply(
      'open properties',
      (s) => workspace.openModule(s, { route: '/properties', kind: 'property', title: '매물관리' }, h.pureEnv),
      () => store().openModule({ route: '/properties', kind: 'property', title: '매물관리' }),
    );
    h.apply(
      'search in place',
      (s) => workspace.updateNativeTabLocation(s, tab, '/properties?q=고덕', 'property', '매물관리'),
      () => store().updateNativeTabLocation(tab, '/properties?q=고덕', 'property', '매물관리'),
    );
    h.apply(
      'sidebar to contacts',
      (s) => workspace.navigateTab(s, tab, { route: '/contacts', kind: 'contact', title: '연락처' }, {}, h.pureEnv),
      () => store().navigateTab(tab, { route: '/contacts', kind: 'contact', title: '연락처' }),
    );
    h.apply(
      'sidebar to tasks',
      (s) => workspace.navigateTab(s, tab, { route: '/tasks', kind: 'task', title: '업무' }, {}, h.pureEnv),
      () => store().navigateTab(tab, { route: '/tasks', kind: 'task', title: '업무' }),
    );

    assert.equal(await h.history('back to contacts', 'back'), 'navigated');
    assert.equal(await h.history('back to properties', 'back'), 'navigated');
    assert.equal(await h.history('forward to contacts', 'forward'), 'navigated');
    assert.equal(await h.jump('jump to the first entry', 0), 'navigated');
    assert.equal(await h.history('nothing further back', 'back'), 'ignored');

    h.apply(
      'new visit drops forward entries',
      (s) => workspace.navigateTab(s, tab, { route: '/deals', kind: 'deal', title: '거래관리' }, {}, h.pureEnv),
      () => store().navigateTab(tab, { route: '/deals', kind: 'deal', title: '거래관리' }),
    );
    assert.equal(await h.history('forward is gone', 'forward'), 'ignored');
    assert.equal(h.pure.workspace.tabs.length, 1);
  });

  it('protects a form draft: opens the previous screen in a new tab', async () => {
    const h = setup();
    const store = () => h.tabStore.getState();
    const tab = h.apply(
      'open contacts',
      (s) => workspace.openModule(s, { route: '/contacts', kind: 'contact', title: '연락처' }, h.pureEnv),
      () => store().openModule({ route: '/contacts', kind: 'contact', title: '연락처' }),
    );
    h.apply(
      'go to new property',
      (s) => workspace.navigateTab(s, tab, { route: '/properties/new', kind: 'property', title: '매물 등록' }, {}, h.pureEnv),
      () => store().navigateTab(tab, { route: '/properties/new', kind: 'property', title: '매물 등록' }),
    );
    h.apply(
      'type a draft',
      (s) => workspace.updateTabFormDraft(s, tab, 'memo', '급매'),
      () => store().updateTabFormDraft(tab, 'memo', '급매'),
    );

    assert.equal(await h.history('back with a draft', 'back'), 'opened-in-new-tab');
    const tabs = h.pure.workspace.tabs;
    assert.equal(tabs.length, 2);
    assert.equal(tabs.find((candidate) => candidate.id === tab)?.route, '/properties/new');
    assert.equal(
      tabs.find((candidate) => candidate.id === tab)?.uiState?.formDraft?.memo,
      '급매',
    );
  });

  it('reopens closed tabs with their history, most recent group first', async () => {
    const h = setup();
    const store = () => h.tabStore.getState();
    const first = h.apply(
      'open properties',
      (s) => workspace.openModule(s, { route: '/properties', kind: 'property', title: '매물관리' }, h.pureEnv),
      () => store().openModule({ route: '/properties', kind: 'property', title: '매물관리' }),
    );
    h.apply(
      'visit contacts in the same tab',
      (s) => workspace.navigateTab(s, first, { route: '/contacts', kind: 'contact', title: '연락처' }, {}, h.pureEnv),
      () => store().navigateTab(first, { route: '/contacts', kind: 'contact', title: '연락처' }),
    );
    const second = h.apply(
      'open tasks',
      (s) => workspace.openModule(s, { route: '/tasks', kind: 'task', title: '업무' }, h.pureEnv),
      () => store().openModule({ route: '/tasks', kind: 'task', title: '업무' }),
    );
    const third = h.apply(
      'open calendar',
      (s) => workspace.openModule(s, { route: '/calendar', kind: 'calendar', title: '캘린더' }, h.pureEnv),
      () => store().openModule({ route: '/calendar', kind: 'calendar', title: '캘린더' }),
    );

    h.apply(
      'close the first tab',
      (s) => workspace.closeTab(s, first, h.pureEnv),
      () => store().closeTab(first),
    );
    h.apply(
      'close the others',
      (s) => workspace.closeOtherTabs(s, third, h.pureEnv),
      () => store().closeOtherTabs(third),
    );
    assert.deepEqual(h.pure.workspace.tabs.map((tab) => tab.id), [third]);
    assert.ok(second);

    assert.ok(h.reopen('reopen the group closed last'));
    const reopenedFirst = h.reopen('reopen the tab closed first');
    assert.ok(reopenedFirst);
    assert.equal(h.reopen('nothing left to reopen'), null);

    // 다시 연 탭은 닫기 전 방문 기록으로 뒤로 갈 수 있다.
    h.apply(
      'select the reopened tab',
      (s) => workspace.activateTab(s, reopenedFirst),
      () => store().activateTab(reopenedFirst),
    );
    assert.equal(await h.history('back inside the reopened tab', 'back'), 'navigated');
    assert.equal(
      h.pure.workspace.tabs.find((tab) => tab.id === reopenedFirst)?.route,
      '/properties',
    );
  });

  it('opens a different resource in another tab and reuses an open one', () => {
    const h = setup();
    const store = () => h.tabStore.getState();
    const owner = h.apply(
      'open a property',
      (s) => workspace.createTab(s, { route: '/properties/p1', kind: 'property', title: '매물' }, h.pureEnv),
      () => store().createTab({ route: '/properties/p1', kind: 'property', title: '매물' }),
    );
    h.apply(
      'link to a contact',
      (s) => workspace.adoptTabLocation(s, owner, '/contacts/c1', 'contact', '연락처 상세', undefined, h.pureEnv),
      () => store().adoptTabLocation(owner, '/contacts/c1', 'contact', '연락처 상세'),
    );
    h.apply(
      'back to the property tab',
      (s) => workspace.activateTab(s, owner),
      () => store().activateTab(owner),
    );
    h.apply(
      'the same link again reveals the open tab',
      (s) => workspace.adoptTabLocation(s, owner, '/contacts/c1', 'contact', '연락처 상세', undefined, h.pureEnv),
      () => store().adoptTabLocation(owner, '/contacts/c1', 'contact', '연락처 상세'),
    );
    assert.equal(h.pure.workspace.tabs.length, 2);
    assert.notEqual(h.pure.workspace.activeTabId, owner);
  });
});

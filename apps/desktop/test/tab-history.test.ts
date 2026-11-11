import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import {
  isTabCommand,
  isTabMenuItems,
  tabCommandForInput,
  type TabShortcutInput,
} from '../src/common/tabCommands';
import { useTabStore } from '../src/renderer/features/tabs/store/useTabStore';
import { openLocationInNewTab } from '../src/renderer/features/tabs/lib/tabCommands';
import {
  TAB_HISTORY_LIMIT,
  canTraverse,
  navigateTabHistory,
  reopenLastClosedTabs,
  traversalTargets,
  useTabHistoryStore,
} from '../src/renderer/features/tabs/store/useTabHistoryStore';

function resetStores() {
  useTabStore.setState({
    tabs: [],
    activeTabId: null,
    recentlyClosedTabs: [],
  });
  useTabHistoryStore.setState({ histories: {}, pending: {}, retired: {} });
}

function openLauncher(): string {
  return useTabStore.getState().createTab({
    route: '/dashboard',
    kind: 'dashboard',
    title: '대시보드',
    resourceKey: null,
  });
}

function go(id: string, route: string, title = route) {
  return useTabStore.getState().navigateTab(id, { route, title, kind: 'generic' });
}

function tab(id: string) {
  return useTabStore.getState().tabs.find((candidate) => candidate.id === id);
}

function history(id: string) {
  return useTabHistoryStore.getState().histories[id];
}

describe('tab history', () => {
  beforeEach(resetStores);

  it('records screen changes and moves back and forward in the same tab', async () => {
    const id = openLauncher();
    go(id, '/properties', '매물');
    go(id, '/contacts', '연락처');
    assert.deepEqual(
      history(id).entries.map((entry) => entry.route),
      ['/dashboard', '/properties', '/contacts'],
    );
    assert.equal(history(id).index, 2);

    assert.equal(await navigateTabHistory('back'), 'navigated');
    assert.equal(tab(id)?.route, '/properties');
    assert.equal(history(id).index, 1, 'going back must not add an entry');
    assert.equal(history(id).entries.length, 3);
    assert.ok(canTraverse(history(id), 'forward'));

    assert.equal(await navigateTabHistory('back'), 'navigated');
    assert.equal(tab(id)?.route, '/dashboard');
    // 처음 launcher 탭의 identity로 돌아와야 대시보드 module과 섞이지 않는다.
    assert.equal(tab(id)?.resourceKey, `launcher:${id}`);
    assert.equal(canTraverse(history(id), 'back'), false);

    assert.equal(await navigateTabHistory('forward'), 'navigated');
    assert.equal(tab(id)?.route, '/properties');
  });

  it('drops the forward entries when a new screen is opened after going back', async () => {
    const id = openLauncher();
    go(id, '/properties');
    go(id, '/contacts');
    await navigateTabHistory('back');
    go(id, '/deals');
    assert.deepEqual(
      history(id).entries.map((entry) => entry.route),
      ['/dashboard', '/properties', '/deals'],
    );
    assert.equal(canTraverse(history(id), 'forward'), false);
  });

  it('rewrites the current entry when only the search or filter changes', () => {
    const id = openLauncher();
    go(id, '/properties');
    useTabStore
      .getState()
      .adoptTabLocation(id, '/properties?status=open', 'generic', '매물');
    assert.deepEqual(
      history(id).entries.map((entry) => entry.route),
      ['/dashboard', '/properties?status=open'],
    );
  });

  it('replaces the new-entry form once the draft is saved as a real record', () => {
    const id = openLauncher();
    go(id, '/properties/new', '새 매물');
    useTabStore.getState().replaceTabResource(id, {
      route: '/properties/p-1',
      title: '래미안 101동',
      kind: 'property',
      resourceKey: 'entity:property:p-1',
    });
    assert.deepEqual(
      history(id).entries.map((entry) => entry.route),
      ['/dashboard', '/properties/p-1'],
    );
  });

  it('shows the other tab instead of duplicating a record that is open there', async () => {
    const first = openLauncher();
    go(first, '/properties');
    go(first, '/contacts');
    const second = useTabStore.getState().createTab({
      route: '/properties',
      kind: 'generic',
      title: '매물',
    });
    useTabStore.getState().activateTab(first);

    assert.equal(await navigateTabHistory('back'), 'revealed');
    assert.equal(useTabStore.getState().activeTabId, second);
    assert.equal(tab(first)?.route, '/contacts');
    assert.equal(history(first).index, 2, 'the source tab stays where it was');
  });

  it('keeps at most the configured number of entries', () => {
    const id = openLauncher();
    for (let i = 0; i < TAB_HISTORY_LIMIT + 5; i += 1) go(id, `/screen-${i}`);
    assert.equal(history(id).entries.length, TAB_HISTORY_LIMIT);
    assert.equal(history(id).index, TAB_HISTORY_LIMIT - 1);
    assert.equal(history(id).entries.at(-1)?.route, `/screen-${TAB_HISTORY_LIMIT + 4}`);
  });

  it('lists back targets nearest first', () => {
    const id = openLauncher();
    go(id, '/a');
    go(id, '/b');
    go(id, '/c');
    assert.deepEqual(traversalTargets(history(id), 'back'), [2, 1, 0]);
    assert.deepEqual(traversalTargets(history(id), 'forward'), []);
  });
});

describe('unsaved input during back and forward', () => {
  beforeEach(resetStores);

  it('keeps the form draft and opens the previous screen in a new tab', async () => {
    const id = openLauncher();
    go(id, '/properties', '매물');
    go(id, '/contacts/new', '새 연락처');
    useTabStore.getState().updateTabFormDraft(id, 'name', '김집주인');

    assert.equal(await navigateTabHistory('back'), 'opened-in-new-tab');
    assert.equal(tab(id)?.route, '/contacts/new', 'the tab with the draft stays put');
    assert.deepEqual(tab(id)?.uiState?.formDraft, { name: '김집주인' });
    assert.equal(useTabStore.getState().tabs.length, 2);
    assert.equal(
      useTabStore.getState().tabs.find((t) => t.id !== id)?.route,
      '/properties',
    );
    assert.equal(history(id).index, 2);
  });

  it('does not move within the same record while a draft is unsaved', async () => {
    const id = useTabStore.getState().openOrRevealResource({
      route: '/buyer-requirements/r-1',
      kind: 'generic',
      title: '구매 조건',
      resourceKey: 'entity:buyer-requirement:r-1',
    });
    useTabStore.getState().adoptTabLocation(id, '/buyer-requirements/r-1/edit', 'generic', '수정');
    useTabStore.getState().updateTabFormDraft(id, 'priceMax', 150000);

    assert.equal(await navigateTabHistory('back'), 'blocked-by-unsaved-work');
    assert.equal(tab(id)?.route, '/buyer-requirements/r-1/edit');
    assert.deepEqual(tab(id)?.uiState?.formDraft, { priceMax: 150000 });
  });

  it('never clears a draft when restoring a location directly', () => {
    const id = openLauncher();
    go(id, '/contacts/new', '새 연락처');
    useTabStore.getState().updateTabFormDraft(id, 'name', '박세입자');
    const result = useTabStore.getState().restoreTabLocation(id, {
      route: '/properties',
      title: '매물',
      kind: 'generic',
      resourceKey: 'module:%2Fproperties',
    });
    assert.equal(result.status, 'blocked');
    assert.deepEqual(tab(id)?.uiState?.formDraft, { name: '박세입자' });
  });

  it('reveals an open record on Cmd+click without changing that tab', () => {
    const id = useTabStore.getState().openOrRevealResource({
      route: '/buyer-requirements/r-1/edit',
      kind: 'generic',
      title: '수정',
      resourceKey: 'entity:buyer-requirement:r-1',
    });
    const revealed = openLocationInNewTab({
      route: '/buyer-requirements/r-1',
      title: '구매 조건',
      kind: 'generic',
      resourceKey: 'entity:buyer-requirement:r-1',
    });
    assert.equal(revealed, id);
    assert.equal(tab(id)?.route, '/buyer-requirements/r-1/edit');
  });
});

describe('recently closed tabs', () => {
  beforeEach(resetStores);

  it('reopens a closed tab in its old place with its history', async () => {
    const left = openLauncher();
    const middle = openLauncher();
    go(middle, '/properties', '매물');
    go(middle, '/contacts', '연락처');
    const right = openLauncher();

    useTabStore.getState().closeTab(middle);
    assert.equal(useTabStore.getState().tabs.length, 2);

    const reopened = reopenLastClosedTabs();
    assert.ok(reopened);
    const ids = useTabStore.getState().tabs.map((candidate) => candidate.id);
    assert.deepEqual(ids, [left, reopened, right]);
    assert.equal(tab(reopened)?.route, '/contacts');
    assert.equal(useTabStore.getState().activeTabId, reopened);
    assert.deepEqual(
      history(reopened).entries.map((entry) => entry.route),
      ['/dashboard', '/properties', '/contacts'],
    );
    // launcher identity는 새 탭 id 기준으로 다시 만들어진다.
    assert.equal(history(reopened).entries[0].resourceKey, `launcher:${reopened}`);
    assert.equal(await navigateTabHistory('back'), 'navigated');
    assert.equal(tab(reopened)?.route, '/properties');
  });

  it('treats "close other tabs" as one group that comes back together', () => {
    const a = openLauncher();
    const b = openLauncher();
    const c = openLauncher();
    useTabStore.getState().closeOtherTabs(b);
    assert.deepEqual(useTabStore.getState().tabs.map((t) => t.id), [b]);
    assert.equal(useTabStore.getState().recentlyClosedTabs.length, 1);

    reopenLastClosedTabs();
    const tabs = useTabStore.getState().tabs;
    assert.equal(tabs.length, 3);
    assert.equal(tabs[1].id, b);
    assert.ok(![a, c].includes(tabs[0].id), 'reopened tabs get new ids');
    assert.equal(useTabStore.getState().recentlyClosedTabs.length, 0);
  });

  it('closes tabs on one side and keeps the clicked tab active', () => {
    const a = openLauncher();
    const b = openLauncher();
    const c = openLauncher();
    const d = openLauncher();
    useTabStore.getState().activateTab(d);
    useTabStore.getState().closeTabsToRight(b);
    assert.deepEqual(useTabStore.getState().tabs.map((t) => t.id), [a, b]);
    assert.equal(useTabStore.getState().activeTabId, b);

    reopenLastClosedTabs();
    assert.equal(useTabStore.getState().tabs.length, 4);
    useTabStore.getState().closeTabsToLeft(b);
    assert.equal(useTabStore.getState().tabs[0].id, b);
    assert.ok(useTabStore.getState().tabs.every((t) => t.id !== a));
    assert.ok(c && d);
  });

  it('reveals an already open record instead of reopening a duplicate', () => {
    const id = useTabStore.getState().openOrRevealResource({
      route: '/properties/p-1',
      kind: 'property',
      title: '래미안',
      resourceKey: 'entity:property:p-1',
    });
    openLauncher();
    useTabStore.getState().closeTab(id);
    const again = useTabStore.getState().openOrRevealResource({
      route: '/properties/p-1',
      kind: 'property',
      title: '래미안',
      resourceKey: 'entity:property:p-1',
    });
    const reopened = reopenLastClosedTabs();
    assert.equal(reopened, again);
    assert.equal(
      useTabStore.getState().tabs.filter((t) => t.resourceKey === 'entity:property:p-1').length,
      1,
    );
  });

  it('forgets closed tabs when the signed-in office changes', () => {
    const id = openLauncher();
    openLauncher();
    useTabStore.getState().closeTab(id);
    assert.ok(Object.keys(useTabHistoryStore.getState().retired).length > 0);
    useTabStore.getState().resetWorkspaceForAuthChange();
    assert.equal(useTabStore.getState().recentlyClosedTabs.length, 0);
    assert.deepEqual(useTabHistoryStore.getState().retired, {});
  });
});

function key(overrides: Partial<TabShortcutInput>): TabShortcutInput {
  return {
    type: 'keyDown',
    key: '',
    code: '',
    meta: false,
    control: false,
    alt: false,
    shift: false,
    ...overrides,
  };
}

describe('tab shortcuts', () => {
  it('maps macOS shortcuts', () => {
    const mac = (input: Partial<TabShortcutInput>) => tabCommandForInput(key(input), 'darwin');
    assert.deepEqual(mac({ meta: true, code: 'BracketLeft' }), { type: 'history', direction: 'back' });
    assert.deepEqual(mac({ meta: true, code: 'BracketRight' }), { type: 'history', direction: 'forward' });
    assert.deepEqual(mac({ meta: true, shift: true, code: 'BracketRight' }), { type: 'select-relative-tab', offset: 1 });
    assert.deepEqual(mac({ meta: true, alt: true, code: 'ArrowLeft' }), { type: 'select-relative-tab', offset: -1 });
    assert.deepEqual(mac({ meta: true, code: 'KeyT' }), { type: 'new-tab' });
    assert.deepEqual(mac({ meta: true, shift: true, code: 'KeyT' }), { type: 'reopen-closed-tab' });
    assert.deepEqual(mac({ meta: true, code: 'KeyW' }), { type: 'close-tab' });
    assert.equal(mac({ meta: true, shift: true, code: 'KeyW' }), null, 'Cmd+Shift+W still closes the window');
    assert.deepEqual(mac({ meta: true, code: 'Digit3' }), { type: 'select-tab-index', index: 2 });
    assert.deepEqual(mac({ meta: true, code: 'Digit9' }), { type: 'select-tab-index', index: 'last' });
    assert.deepEqual(mac({ control: true, code: 'Tab' }), { type: 'select-relative-tab', offset: 1 });
    assert.deepEqual(mac({ control: true, shift: true, code: 'Tab' }), { type: 'select-relative-tab', offset: -1 });
    // Option+←는 macOS에서 단어 이동이다. 가로채면 안 된다.
    assert.equal(mac({ alt: true, code: 'ArrowLeft' }), null);
    assert.equal(mac({ control: true, code: 'KeyW' }), null);
  });

  it('maps Windows shortcuts', () => {
    const win = (input: Partial<TabShortcutInput>) => tabCommandForInput(key(input), 'win32');
    assert.deepEqual(win({ control: true, code: 'BracketLeft' }), { type: 'history', direction: 'back' });
    assert.deepEqual(win({ alt: true, code: 'ArrowLeft' }), { type: 'history', direction: 'back' });
    assert.deepEqual(win({ alt: true, code: 'ArrowRight' }), { type: 'history', direction: 'forward' });
    assert.deepEqual(win({ control: true, code: 'KeyW' }), { type: 'close-tab' });
    assert.equal(win({ meta: true, code: 'KeyW' }), null);
    assert.equal(win({ control: true, shift: true, code: 'BracketLeft' }), null);
  });

  it('does not repeat destructive shortcuts while a key is held', () => {
    assert.equal(
      tabCommandForInput(key({ meta: true, code: 'KeyW', isAutoRepeat: true }), 'darwin'),
      null,
    );
    assert.deepEqual(
      tabCommandForInput(key({ control: true, code: 'Tab', isAutoRepeat: true }), 'darwin'),
      { type: 'select-relative-tab', offset: 1 },
    );
  });

  it('validates commands and menu payloads coming over IPC', () => {
    assert.ok(isTabCommand({ type: 'history', direction: 'back' }));
    assert.ok(isTabCommand({ type: 'select-tab-index', index: 7 }));
    assert.equal(isTabCommand({ type: 'select-tab-index', index: 8 }), false);
    assert.equal(isTabCommand({ type: 'history', direction: 'up' }), false);
    assert.equal(isTabCommand({ type: 'quit' }), false);
    assert.ok(isTabMenuItems([{ type: 'item', id: 'close', label: '탭 닫기' }, { type: 'separator' }]));
    assert.equal(isTabMenuItems([]), false);
    assert.equal(isTabMenuItems([{ type: 'item', id: '', label: 'x' }]), false);
    assert.equal(isTabMenuItems([{ type: 'item', id: 'a', label: 'x'.repeat(500) }]), false);
  });
});

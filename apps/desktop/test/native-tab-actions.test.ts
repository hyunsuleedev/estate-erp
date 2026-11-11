import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { Tab } from '@estate-erp/shared';
import {
  parseNativeTabAction,
  type NativeTabAction,
} from '../src/common/nativeTabActions';
import { installNativeTabStoreBridge } from '../src/renderer/features/tabs/native/nativeTabStoreBridge';
import { shouldOpenNavigationInOtherTab } from '../src/renderer/features/tabs/native/NativeTabRouterBridge';
import { applyNativeTabAction } from '../src/renderer/features/tabs/native/useNativeTabActions';
import { useTabStore } from '../src/renderer/features/tabs/store/useTabStore';

function resetStore() {
  useTabStore.setState({
    tabs: [],
    activeTabId: null,
    transferLockedTabIds: new Set(),
    recentlyClosedTabs: [],
  });
}

function nativeTab(overrides: Partial<Tab> = {}): Tab {
  return {
    schemaVersion: 1,
    id: 'tab-native',
    kind: 'property',
    title: '래미안 101동',
    route: '/properties/property-1',
    resourceKey: 'entity:property:property-1',
    createdAt: 1,
    ...overrides,
  };
}

describe('native tab action contract', () => {
  it('accepts known actions and drops unknown fields', () => {
    assert.deepEqual(
      parseNativeTabAction({
        type: 'create-tab',
        input: {
          route: '/deals?dealId=1',
          kind: 'deal',
          title: '거래',
          activate: false,
          extra: 'ignored',
        },
        extra: true,
      }),
      {
        type: 'create-tab',
        input: { route: '/deals?dealId=1', kind: 'deal', title: '거래', activate: false },
      },
    );
    assert.deepEqual(parseNativeTabAction({ type: 'close', tabId: 'other' }), {
      type: 'close',
    });
    assert.deepEqual(
      parseNativeTabAction({ type: 'update-form-draft', key: 'memo', value: { a: [1] } }),
      { type: 'update-form-draft', key: 'memo', value: { a: [1] } },
    );
  });

  it('rejects external routes, unknown kinds, and non-JSON drafts', () => {
    const rejected: unknown[] = [
      { type: 'adopt-location', route: 'https://example.com' },
      { type: 'adopt-location', route: '//example.com/x' },
      { type: 'create-tab', input: { route: '/x', title: 'x', kind: 'shell' } },
      { type: 'open-resource', input: { route: '/x', title: 'x' } },
      { type: 'update-form-draft', key: '', value: 1 },
      { type: 'update-form-draft', key: 'k', value: () => 1 },
      { type: 'update-form-draft', key: 'k', value: Number.NaN },
      { type: 'close-window' },
      null,
    ];
    for (const value of rejected) {
      assert.equal(parseNativeTabAction(value), null, JSON.stringify(value));
    }
  });
});

describe('native tab link navigation', () => {
  const own = nativeTab();

  it('stays in the tab when the link keeps the same business resource', () => {
    assert.equal(
      shouldOpenNavigationInOtherTab(own, '/properties/property-1?view=history', 'PUSH'),
      false,
    );
  });

  it('opens a different resource in another tab so this screen keeps its state', () => {
    assert.equal(shouldOpenNavigationInOtherTab(own, '/contacts/contact-1', 'PUSH'), true);
    assert.equal(shouldOpenNavigationInOtherTab(own, '/properties', 'PUSH'), true);
  });

  it('lets redirects and normalization replace the current address in place', () => {
    assert.equal(shouldOpenNavigationInOtherTab(own, '/contacts/contact-1', 'REPLACE'), false);
    assert.equal(shouldOpenNavigationInOtherTab(undefined, '/contacts', 'PUSH'), false);
  });
});

describe('native tab store mirror', () => {
  let sent: NativeTabAction[];
  let uninstall: (() => void) | undefined;

  beforeEach(() => {
    resetStore();
    sent = [];
    uninstall = installNativeTabStoreBridge(
      nativeTab({ uiState: { formDraft: { memo: '초안' } } }),
      (action) => sent.push(action),
    );
  });

  afterEach(() => {
    uninstall?.();
    resetStore();
  });

  it('exposes only its own tab as the active tab', () => {
    const state = useTabStore.getState();
    assert.equal(state.activeTabId, 'tab-native');
    assert.deepEqual(
      state.tabs.map((tab) => tab.id),
      ['tab-native'],
    );
    assert.equal(state.tabs[0].uiState?.formDraft?.memo, '초안');
  });

  it('asks the window shell to open other tabs instead of adding them locally', () => {
    useTabStore.getState().createTab({ route: '/deals', kind: 'deal', title: '거래' });
    useTabStore.getState().openModule({ route: '/contacts', kind: 'contact', title: '고객' });

    assert.equal(useTabStore.getState().tabs.length, 1);
    assert.deepEqual(sent, [
      { type: 'create-tab', input: { route: '/deals', kind: 'deal', title: '거래' } },
      { type: 'open-module', input: { route: '/contacts', kind: 'contact', title: '고객' } },
    ]);
  });

  it('applies own-tab changes locally and forwards them', () => {
    const store = useTabStore.getState();
    store.updateTabFormDraft('tab-native', 'price', 158000);
    store.updateTabTitle('tab-native', '새 제목');
    store.replaceTabResource('tab-native', {
      route: '/contacts/contact-1',
      kind: 'contact',
      title: '홍길동',
      resourceKey: 'entity:contact:contact-1',
    });
    store.closeTab('tab-native');

    const tab = useTabStore.getState().tabs[0];
    assert.equal(tab.route, '/contacts/contact-1');
    assert.equal(tab.resourceKey, 'entity:contact:contact-1');
    assert.deepEqual(
      sent.map((action) => action.type),
      ['update-form-draft', 'update-title', 'replace-resource', 'close'],
    );
  });

  it('ignores requests aimed at other tab ids', () => {
    const store = useTabStore.getState();
    store.closeTab('someone-else');
    store.updateTabFormDraft('someone-else', 'x', 1);
    store.clearTabFormDraft('someone-else');
    assert.deepEqual(sent, []);
  });

  it('restores the regular store when uninstalled', () => {
    uninstall?.();
    uninstall = undefined;
    resetStore();
    const id = useTabStore.getState().createTab({ route: '/tasks', title: '업무' });
    assert.equal(useTabStore.getState().activeTabId, id);
    assert.deepEqual(sent, []);
  });
});

describe('window shell applying native tab actions', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  function openNativeOwner(): string {
    return useTabStore.getState().createTab({
      route: '/properties/property-1',
      kind: 'property',
      title: '매물',
    });
  }

  it('opens a different resource from a link in another tab and keeps the source', () => {
    const owner = openNativeOwner();
    applyNativeTabAction(owner, { type: 'adopt-location', route: '/contacts/contact-1' });

    const { tabs, activeTabId } = useTabStore.getState();
    assert.equal(tabs.length, 2);
    assert.equal(tabs.find((tab) => tab.id === owner)?.route, '/properties/property-1');
    assert.equal(tabs.find((tab) => tab.id === activeTabId)?.route, '/contacts/contact-1');
  });

  it('keeps drafts and closes only the tab that asked', () => {
    const owner = openNativeOwner();
    const other = useTabStore.getState().createTab({ route: '/tasks', title: '업무' });

    applyNativeTabAction(owner, { type: 'update-form-draft', key: 'memo', value: '메모' });
    assert.equal(
      useTabStore.getState().tabs.find((tab) => tab.id === owner)?.uiState?.formDraft?.memo,
      '메모',
    );

    applyNativeTabAction(owner, { type: 'close' });
    assert.deepEqual(
      useTabStore.getState().tabs.map((tab) => tab.id),
      [other],
    );
  });

  it('ignores own-tab actions after the tab left this window', () => {
    applyNativeTabAction('moved-away', { type: 'close' });
    applyNativeTabAction('moved-away', { type: 'update-title', title: 'x' });
    assert.equal(useTabStore.getState().tabs.length, 0);
  });

  it('moves the tab from the sidebar and opens a new tab when unsaved work exists', async () => {
    const owner = openNativeOwner();
    const globalWithWindow = globalThis as { window?: unknown };
    const previousWindow = globalWithWindow.window;
    globalWithWindow.window = {
      electronBridge: { tabs: { hasUnsavedNativeTabWork: async () => true } },
    };
    try {
      applyNativeTabAction(owner, {
        type: 'navigate',
        input: { route: '/contacts', kind: 'contact', title: '고객' },
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    } finally {
      globalWithWindow.window = previousWindow;
    }

    const tabs = useTabStore.getState().tabs;
    assert.equal(tabs.length, 2);
    assert.equal(tabs.find((tab) => tab.id === owner)?.route, '/properties/property-1');
  });

  it('keeps the shell form draft when a native scroll snapshot arrives', () => {
    const owner = openNativeOwner();
    useTabStore.getState().updateTabFormDraft(owner, 'memo', '셸 초안');
    const tab = useTabStore.getState().tabs.find((candidate) => candidate.id === owner);
    assert.ok(tab);

    useTabStore.getState().updateNativeTabSnapshot({
      ...tab,
      uiState: { scrollY: 320, formDraft: { memo: '오래된 초안' } },
    });

    const updated = useTabStore.getState().tabs.find((candidate) => candidate.id === owner);
    assert.equal(updated?.uiState?.scrollY, 320);
    assert.equal(updated?.uiState?.formDraft?.memo, '셸 초안');
  });
});

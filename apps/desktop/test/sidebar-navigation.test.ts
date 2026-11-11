import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { navigateActiveTab } from '../src/renderer/features/tabs/lib/navigateActiveTab';
import { useTabStore } from '../src/renderer/features/tabs/store/useTabStore';

const globalWithWindow = globalThis as { window?: unknown };

function stubNativeUnsavedWork(
  query: ((tabId: string) => Promise<boolean>) | undefined,
): string[] {
  const asked: string[] = [];
  globalWithWindow.window = {
    electronBridge: {
      tabs: query
        ? {
            hasUnsavedNativeTabWork: (tabId: string) => {
              asked.push(tabId);
              return query(tabId);
            },
          }
        : {},
    },
  };
  return asked;
}

function openPropertyDetailTab(): string {
  return useTabStore.getState().createTab({
    route: '/properties/property-1',
    kind: 'property',
    title: '매물 1',
  });
}

const CONTACTS = { route: '/contacts', kind: 'contact', title: '연락처' } as const;

describe('sidebar navigation of the active tab', () => {
  beforeEach(() => {
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
      transferLockedTabIds: new Set(),
    });
  });

  afterEach(() => {
    delete globalWithWindow.window;
  });

  it('keeps a property detail with an unsaved memo and opens the menu in a new tab', async () => {
    const property = openPropertyDetailTab();
    const asked = stubNativeUnsavedWork(async () => true);

    const result = await navigateActiveTab(CONTACTS);

    const state = useTabStore.getState();
    assert.deepEqual(asked, [property]);
    assert.notEqual(result, property);
    assert.equal(state.tabs.length, 2);
    assert.equal(state.activeTabId, result);
    assert.equal(
      state.tabs.find((tab) => tab.id === property)?.route,
      '/properties/property-1',
    );
  });

  it('replaces a clean property detail in place', async () => {
    const property = openPropertyDetailTab();
    stubNativeUnsavedWork(async () => false);

    const result = await navigateActiveTab(CONTACTS);

    assert.equal(result, property);
    assert.equal(useTabStore.getState().tabs.length, 1);
    assert.equal(useTabStore.getState().tabs[0].route, '/contacts');
  });

  it('preserves the native tab when its unsaved state cannot be read', async () => {
    const property = openPropertyDetailTab();
    stubNativeUnsavedWork(async () => {
      throw new Error('ipc failed');
    });

    const result = await navigateActiveTab(CONTACTS);

    assert.notEqual(result, property);
    assert.equal(useTabStore.getState().tabs.length, 2);
  });

  it('asks main about every app screen now that each tab has its own renderer', async () => {
    const dashboard = useTabStore.getState().openModule({
      route: '/dashboard',
      kind: 'dashboard',
      title: '대시보드',
    });
    const asked = stubNativeUnsavedWork(async () => true);

    const result = await navigateActiveTab(CONTACTS);

    assert.deepEqual(asked, [dashboard]);
    assert.notEqual(result, dashboard);
    assert.equal(useTabStore.getState().tabs.length, 2);
    assert.equal(
      useTabStore.getState().tabs.find((tab) => tab.id === dashboard)?.route,
      '/dashboard',
    );
  });

  it('drops a stale click when the user switched tabs during the check', async () => {
    const property = openPropertyDetailTab();
    const other = useTabStore.getState().createTab({
      route: '/tasks',
      kind: 'task',
      title: '업무',
      activate: false,
    });
    stubNativeUnsavedWork(async () => {
      useTabStore.getState().activateTab(other);
      return false;
    });

    const result = await navigateActiveTab(CONTACTS);

    assert.equal(result, null);
    assert.equal(
      useTabStore.getState().tabs.find((tab) => tab.id === property)?.route,
      '/properties/property-1',
    );
    assert.equal(
      useTabStore.getState().tabs.find((tab) => tab.id === other)?.route,
      '/tasks',
    );
  });
});

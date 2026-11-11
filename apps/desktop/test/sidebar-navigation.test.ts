import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { navigateActiveTab } from '../src/renderer/features/tabs/lib/navigateActiveTab';
import { useTabStore } from '../src/renderer/features/tabs/store/useTabStore';

const globalWithDocument = globalThis as { document?: unknown };

/**
 * 브라우저 단독 미리보기의 화면: 이 문서가 직접 그린 탭 화면에 열린 편집기가 있는지를
 * DOM에서 본다. (Electron에서는 탭 화면이 main에 알린 상태로 main이 판단한다.
 * 그 규칙은 test/tab-registry.test.ts 에 있다.)
 */
function stubShellContent(hasOpenEditor: () => boolean): void {
  globalWithDocument.document = {
    querySelector: (selector: string) =>
      selector === '[data-native-tab-legacy-fallback]'
        ? { querySelector: () => (hasOpenEditor() ? {} : null) }
        : null,
  };
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
    });
  });

  afterEach(() => {
    delete globalWithDocument.document;
  });

  it('keeps a screen with an open editor and opens the menu in a new tab', async () => {
    const property = openPropertyDetailTab();
    stubShellContent(() => true);

    const result = await navigateActiveTab(CONTACTS);

    const state = useTabStore.getState();
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
    stubShellContent(() => false);

    const result = await navigateActiveTab(CONTACTS);

    assert.equal(result, property);
    assert.equal(useTabStore.getState().tabs.length, 1);
    assert.equal(useTabStore.getState().tabs[0].route, '/contacts');
  });

  it('moves in place when there is no screen to ask (node, tab views)', async () => {
    const property = openPropertyDetailTab();

    const result = await navigateActiveTab(CONTACTS);

    assert.equal(result, property);
    assert.equal(useTabStore.getState().tabs[0].route, '/contacts');
  });

  it('drops a stale click when the user switched tabs during the check', async () => {
    const property = openPropertyDetailTab();
    const other = useTabStore.getState().createTab({
      route: '/tasks',
      kind: 'task',
      title: '업무',
      activate: false,
    });
    stubShellContent(() => {
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

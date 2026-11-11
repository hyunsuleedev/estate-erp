import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import type { Tab } from '@estate-erp/shared';
import { tabResourceKeys } from '../src/renderer/features/tabs/lib/tabResource';
import { useTabStore } from '../src/renderer/features/tabs/store/useTabStore';

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

describe('desktop tab store', () => {
  beforeEach(() => {
    useTabStore.setState({
      tabs: [],
      activeTabId: null,
    });
  });

  it('always creates distinct tab instances for the same route', () => {
    const first = useTabStore.getState().createTab({
      route: '/dashboard',
      kind: 'dashboard',
      title: '대시보드',
      resourceKey: null,
    });
    const second = useTabStore.getState().createTab({
      route: '/dashboard',
      kind: 'dashboard',
      title: '대시보드',
      resourceKey: null,
    });

    assert.notEqual(first, second);
    assert.equal(useTabStore.getState().tabs.length, 2);
    assert.equal(useTabStore.getState().activeTabId, second);
    assert.notEqual(
      useTabStore.getState().tabs[0].resourceKey,
      useTabStore.getState().tabs[1].resourceKey,
    );
  });

  it('creates independent draft tabs even when their href is identical', () => {
    const first = useTabStore.getState().createTab({
      route: '/properties/new?siteId=site-1',
      kind: 'property',
      title: '매물 등록',
    });
    const second = useTabStore.getState().createTab({
      route: '/properties/new?siteId=site-1',
      kind: 'property',
      title: '매물 등록',
    });

    assert.equal(useTabStore.getState().tabs.length, 2);
    assert.notEqual(first, second);
    assert.deepEqual(
      useTabStore.getState().tabs.map((tab) => tab.resourceKey),
      [
        tabResourceKeys.draft('property', first),
        tabResourceKeys.draft('property', second),
      ],
    );
  });

  it('reveals an existing business resource by key without creating a duplicate', () => {
    const key = tabResourceKeys.entity('property', 'property-1');
    const first = useTabStore.getState().openOrRevealResource({
      route: '/properties/property-1',
      kind: 'property',
      title: '101동 101호',
      resourceKey: key,
    });
    useTabStore.getState().createTab({
      route: '/dashboard',
      kind: 'dashboard',
      title: '대시보드',
      resourceKey: null,
    });
    const reopened = useTabStore.getState().openOrRevealResource({
      route: '/properties/property-1?view=history',
      kind: 'property',
      title: '다른 제목',
      resourceKey: key,
    });

    assert.equal(reopened, first);
    assert.equal(useTabStore.getState().tabs.length, 2);
    assert.equal(useTabStore.getState().activeTabId, first);
    assert.equal(
      useTabStore.getState().tabs.find((tab) => tab.id === first)?.title,
      '101동 101호',
    );
  });

  it('keeps different entities separate even when their kind is the same', () => {
    const first = useTabStore.getState().openOrRevealResource({
      route: '/properties/property-1',
      kind: 'property',
      title: '매물 1',
      resourceKey: tabResourceKeys.entity('property', 'property-1'),
    });
    const second = useTabStore.getState().openOrRevealResource({
      route: '/properties/property-2',
      kind: 'property',
      title: '매물 2',
      resourceKey: tabResourceKeys.entity('property', 'property-2'),
    });

    assert.notEqual(first, second);
    assert.equal(useTabStore.getState().tabs.length, 2);
  });

  it('opens a module once per window while preserving search as view state', () => {
    const first = useTabStore.getState().openModule({
      route: '/wanted-properties?matchId=first',
      kind: 'match',
      title: '희망매물',
    });
    const second = useTabStore.getState().openModule({
      route: '/wanted-properties?matchId=second',
      kind: 'match',
      title: '희망매물',
    });

    assert.equal(second, first);
    assert.equal(useTabStore.getState().tabs.length, 1);
    assert.equal(
      useTabStore.getState().tabs[0].route,
      '/wanted-properties?matchId=second',
    );
  });

  it('replaces a draft with its saved entity without changing tab id or order', () => {
    const left = useTabStore.getState().createTab({
      route: '/dashboard',
      title: '왼쪽',
      resourceKey: null,
    });
    const draft = useTabStore.getState().createTab({
      route: '/properties/new',
      kind: 'property',
      title: '매물 등록',
    });
    const key = tabResourceKeys.entity('property', 'property-1');

    const result = useTabStore.getState().replaceTabResource(draft, {
      route: '/properties/property-1',
      kind: 'property',
      title: '매물 상세',
      resourceKey: key,
    });

    assert.equal(result, draft);
    assert.deepEqual(
      useTabStore.getState().tabs.map((tab) => tab.id),
      [left, draft],
    );
    assert.equal(useTabStore.getState().tabs[1].resourceKey, key);
    assert.equal(useTabStore.getState().activeTabId, draft);
  });

  it('reveals an existing entity and removes only the completed draft on collision', () => {
    const key = tabResourceKeys.entity('property', 'property-1');
    const existing = useTabStore.getState().openOrRevealResource({
      route: '/properties/property-1',
      kind: 'property',
      title: '기존 상세',
      resourceKey: key,
    });
    const draft = useTabStore.getState().createTab({
      route: '/properties/new',
      kind: 'property',
      title: '매물 등록',
    });

    const result = useTabStore.getState().replaceTabResource(draft, {
      route: '/properties/property-1',
      kind: 'property',
      title: '매물 상세',
      resourceKey: key,
    });

    assert.equal(result, existing);
    assert.deepEqual(
      useTabStore.getState().tabs.map((tab) => tab.id),
      [existing],
    );
    assert.equal(useTabStore.getState().activeTabId, existing);
  });

  it('updates an inactive saved draft without stealing focus from the current tab', () => {
    const draft = useTabStore.getState().createTab({
      route: '/buyer-requirements/new',
      kind: 'contact',
      title: '구매고객 등록',
    });
    const current = useTabStore.getState().createTab({
      route: '/dashboard',
      kind: 'dashboard',
      title: '대시보드',
      resourceKey: null,
    });

    useTabStore.getState().replaceTabResource(draft, {
      route: '/buyer-requirements/requirement-1',
      kind: 'contact',
      title: '구매고객 상세',
      resourceKey: tabResourceKeys.entity('buyer-requirement', 'requirement-1'),
    });

    assert.equal(useTabStore.getState().activeTabId, current);
    assert.equal(
      useTabStore.getState().tabs.find((tab) => tab.id === draft)?.route,
      '/buyer-requirements/requirement-1',
    );
  });

  it('opens a different resource with its full href without overwriting the source', () => {
    const tab = useTabStore.getState().createTab({
      route: '/properties/property-1',
      kind: 'property',
      title: '매물 1',
    });

    const opened = useTabStore
      .getState()
      .adoptTabLocation(
        tab,
        '/wanted-properties?matchId=match-1#detail',
        'match',
        '희망매물',
      );

    assert.notEqual(opened, tab);
    assert.equal(useTabStore.getState().tabs.length, 2);
    assert.equal(
      useTabStore.getState().tabs[0].route,
      '/properties/property-1',
    );
    assert.equal(
      useTabStore.getState().tabs[1].route,
      '/wanted-properties?matchId=match-1#detail',
    );
    assert.equal(
      useTabStore.getState().tabs[1].resourceKey,
      tabResourceKeys.module('/wanted-properties'),
    );
  });

  it('updates search and hash in place while staying on the same resource', () => {
    const tab = useTabStore.getState().createTab({
      route: '/properties/property-1',
      kind: 'property',
      title: '매물 1',
    });

    const result = useTabStore
      .getState()
      .adoptTabLocation(
        tab,
        '/properties/property-1?view=history#price',
        'property',
        '매물 1',
      );

    assert.equal(result, tab);
    assert.equal(useTabStore.getState().tabs.length, 1);
    assert.equal(
      useTabStore.getState().tabs[0].route,
      '/properties/property-1?view=history#price',
    );
  });

  it('keeps the selected explicit duplicate when only its entity view state changes', () => {
    const resourceKey = tabResourceKeys.entity('property', 'property-1');
    useTabStore.getState().createTab({
      route: '/properties/property-1',
      kind: 'property',
      title: '첫 번째 복제',
      resourceKey,
    });
    const selected = useTabStore.getState().createTab({
      route: '/properties/property-1',
      kind: 'property',
      title: '두 번째 복제',
      resourceKey,
    });

    const result = useTabStore
      .getState()
      .adoptTabLocation(
        selected,
        '/properties/property-1?view=history',
        'property',
        '두 번째 복제',
      );

    assert.equal(result, selected);
    assert.equal(useTabStore.getState().activeTabId, selected);
    assert.equal(
      useTabStore.getState().tabs.find((tab) => tab.id === selected)?.route,
      '/properties/property-1?view=history',
    );
  });

  it('merges a native view snapshot without rolling back shell metadata', () => {
    const current = makeTab('native', {
      route: '/properties/property-1?current=true',
      title: '최신 셸 제목',
      uiState: { scrollY: 10 },
    });
    useTabStore.setState({ tabs: [current], activeTabId: current.id });

    const updated = useTabStore.getState().updateNativeTabSnapshot({
      ...current,
      route: '/properties/property-1?stale=true',
      title: '오래된 네이티브 제목',
      uiState: { scrollY: 640 },
    });

    assert.equal(updated, true);
    assert.deepEqual(useTabStore.getState().tabs[0], {
      ...current,
      uiState: { scrollY: 640 },
    });
  });

  it('reveals an existing navigation target without destroying the source tab', () => {
    const module = useTabStore.getState().openModule({
      route: '/contacts',
      kind: 'contact',
      title: '연락처',
    });
    const property = useTabStore.getState().createTab({
      route: '/properties/property-1',
      kind: 'property',
      title: '매물 1',
    });

    const result = useTabStore
      .getState()
      .adoptTabLocation(property, '/contacts?group=vip', 'contact', '연락처');

    assert.equal(result, module);
    assert.equal(useTabStore.getState().tabs.length, 2);
    assert.equal(useTabStore.getState().activeTabId, module);
    assert.equal(
      useTabStore.getState().tabs.find((tab) => tab.id === property)?.route,
      '/properties/property-1',
    );
    assert.equal(
      useTabStore.getState().tabs.find((tab) => tab.id === module)?.route,
      '/contacts?group=vip',
    );
  });

  it('ignores closeOtherTabs for an unknown id', () => {
    const tab = makeTab('only');
    useTabStore.setState({ tabs: [tab], activeTabId: tab.id });

    useTabStore.getState().closeOtherTabs('missing');

    assert.deepEqual(useTabStore.getState().tabs, [tab]);
    assert.equal(useTabStore.getState().activeTabId, tab.id);
  });

  it('clears tenant-bound tabs, drafts, and closed tabs on auth change', () => {
    const store = useTabStore.getState();
    const id = store.createTab({
      route: '/properties/new',
      kind: 'property',
      title: '신규 매물',
    });
    store.updateTabFormDraft(id, 'property', { title: 'A 사무소 초안' });
    const closed = store.createTab({ route: '/tasks', kind: 'task', title: '업무' });
    useTabStore.getState().closeTab(closed);
    assert.equal(useTabStore.getState().recentlyClosedTabs.length, 1);

    useTabStore.getState().resetWorkspaceForAuthChange();
    const reset = useTabStore.getState();
    assert.deepEqual(reset.tabs, []);
    assert.equal(reset.activeTabId, null);
    assert.deepEqual(reset.recentlyClosedTabs, []);
  });

  describe('navigateTab (sidebar navigation)', () => {
    it('moves the current tab to another module instead of opening a new tab', () => {
      const tab = useTabStore.getState().openModule({
        route: '/dashboard',
        kind: 'dashboard',
        title: '대시보드',
      });
      useTabStore.setState((state) => ({
        tabs: state.tabs.map((candidate) => ({
          ...candidate,
          uiState: { scrollY: 320 },
        })),
      }));

      const result = useTabStore.getState().navigateTab(tab, {
        route: '/properties',
        kind: 'property',
        title: '매물관리',
      });

      const [moved] = useTabStore.getState().tabs;
      assert.equal(result, tab);
      assert.equal(useTabStore.getState().tabs.length, 1);
      assert.equal(useTabStore.getState().activeTabId, tab);
      assert.equal(moved.route, '/properties');
      assert.equal(moved.title, '매물관리');
      assert.equal(moved.resourceKey, tabResourceKeys.module('/properties'));
      assert.equal(moved.uiState, undefined);
    });

    it('turns a fresh launcher tab into the chosen page', () => {
      const launcher = useTabStore.getState().createTab({
        route: '/dashboard',
        kind: 'dashboard',
        title: '대시보드',
        resourceKey: null,
      });

      const result = useTabStore.getState().navigateTab(launcher, {
        route: '/tasks',
        kind: 'task',
        title: '업무',
      });

      assert.equal(result, launcher);
      assert.equal(useTabStore.getState().tabs.length, 1);
      assert.equal(
        useTabStore.getState().tabs[0].resourceKey,
        tabResourceKeys.module('/tasks'),
      );
    });

    it('replaces an entity tab in place', () => {
      const property = useTabStore.getState().createTab({
        route: '/properties/property-1',
        kind: 'property',
        title: '매물 1',
      });

      const result = useTabStore.getState().navigateTab(property, {
        route: '/contacts',
        kind: 'contact',
        title: '연락처',
      });

      assert.equal(result, property);
      assert.equal(useTabStore.getState().tabs.length, 1);
      assert.equal(useTabStore.getState().tabs[0].route, '/contacts');
    });

    it('reveals a tab that already shows the module and keeps its state', () => {
      const contacts = useTabStore.getState().openModule({
        route: '/contacts?group=vip',
        kind: 'contact',
        title: '연락처',
      });
      const dashboard = useTabStore.getState().openModule({
        route: '/dashboard',
        kind: 'dashboard',
        title: '대시보드',
      });

      const result = useTabStore.getState().navigateTab(dashboard, {
        route: '/contacts',
        kind: 'contact',
        title: '연락처',
      });

      assert.equal(result, contacts);
      assert.equal(useTabStore.getState().activeTabId, contacts);
      assert.equal(useTabStore.getState().tabs.length, 2);
      assert.equal(
        useTabStore.getState().tabs.find((tab) => tab.id === contacts)?.route,
        '/contacts?group=vip',
      );
      assert.equal(
        useTabStore.getState().tabs.find((tab) => tab.id === dashboard)?.route,
        '/dashboard',
      );
    });

    it('resets the current module to the menu root when clicked again', () => {
      const tab = useTabStore.getState().openModule({
        route: '/properties?status=hold',
        kind: 'property',
        title: '매물관리',
      });

      const result = useTabStore.getState().navigateTab(tab, {
        route: '/properties',
        kind: 'property',
        title: '매물관리',
      });

      assert.equal(result, tab);
      assert.equal(useTabStore.getState().tabs.length, 1);
      assert.equal(useTabStore.getState().tabs[0].route, '/properties');
    });

    it('keeps a tab with unsaved form input and opens the target in a new tab', () => {
      const draft = useTabStore.getState().createTab({
        route: '/contacts/new',
        kind: 'contact',
        title: '연락처 추가',
      });
      useTabStore.getState().updateTabFormDraft(draft, 'name', '김고객');

      const result = useTabStore.getState().navigateTab(draft, {
        route: '/contacts',
        kind: 'contact',
        title: '연락처',
      });

      const draftTab = useTabStore
        .getState()
        .tabs.find((tab) => tab.id === draft);
      assert.notEqual(result, draft);
      assert.equal(useTabStore.getState().tabs.length, 2);
      assert.equal(useTabStore.getState().activeTabId, result);
      assert.equal(draftTab?.route, '/contacts/new');
      assert.equal(draftTab?.uiState?.formDraft?.name, '김고객');
    });

    it('replaces an untouched draft tab in place', () => {
      const draft = useTabStore.getState().createTab({
        route: '/contacts/new',
        kind: 'contact',
        title: '연락처 추가',
      });

      const result = useTabStore.getState().navigateTab(draft, {
        route: '/contacts',
        kind: 'contact',
        title: '연락처',
      });

      assert.equal(result, draft);
      assert.equal(useTabStore.getState().tabs.length, 1);
      assert.equal(
        useTabStore.getState().tabs[0].resourceKey,
        tabResourceKeys.module('/contacts'),
      );
    });

    it('opens a tab when the workspace is empty', () => {
      const result = useTabStore.getState().navigateTab(null, {
        route: '/tasks',
        kind: 'task',
        title: '업무',
      });

      assert.equal(useTabStore.getState().tabs.length, 1);
      assert.equal(useTabStore.getState().activeTabId, result);
    });
  });
});

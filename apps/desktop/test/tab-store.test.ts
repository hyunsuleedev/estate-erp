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
      transferLockedTabIds: new Set(),
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
      route: '/matches?matchId=first',
      kind: 'match',
      title: '매칭',
    });
    const second = useTabStore.getState().openModule({
      route: '/matches?matchId=second',
      kind: 'match',
      title: '매칭',
    });

    assert.equal(second, first);
    assert.equal(useTabStore.getState().tabs.length, 1);
    assert.equal(
      useTabStore.getState().tabs[0].route,
      '/matches?matchId=second',
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

  it('preserves transferred identity and state and treats an exact retry as idempotent', () => {
    const transferred = makeTab('original-id', {
      resourceKey: tabResourceKeys.entity('contact', 'contact-1'),
      route: '/contacts/contact-1?from=search#phones',
      routeParams: { from: 'search' },
      uiState: { scrollY: 420, formDraft: { version: 1, memo: '메모' } },
      createdAt: 123,
    });

    const inserted = useTabStore.getState().insertTransferredTab(transferred);
    const retried = useTabStore
      .getState()
      .insertTransferredTab({ ...transferred });

    assert.deepEqual(inserted, { status: 'inserted', tabId: 'original-id' });
    assert.deepEqual(retried, { status: 'existing', tabId: 'original-id' });
    assert.deepEqual(useTabStore.getState().tabs, [transferred]);
  });

  it('rejects a transferred tab id collision with different state', () => {
    useTabStore.getState().insertTransferredTab(makeTab('same-id'));

    const result = useTabStore
      .getState()
      .insertTransferredTab(makeTab('same-id', { route: '/different' }));

    assert.equal(result.status, 'conflict');
    assert.equal(useTabStore.getState().tabs.length, 1);
    assert.equal(useTabStore.getState().tabs[0].route, '/same-id');
  });

  it('applies the final transferred snapshot in place before ownership commit', () => {
    const initial = makeTab('moving', {
      route: '/contacts/new',
      resourceKey: tabResourceKeys.draft('contact', 'moving'),
      uiState: { formDraft: { name: '처음 값' } },
    });

    useTabStore.getState().insertTransferredTab(initial);
    const latest = {
      ...initial,
      route: '/contacts/new?from=call',
      uiState: { formDraft: { name: '놓는 순간 최신 값' } },
    } satisfies Tab;

    const result = useTabStore.getState().replaceTransferredTabSnapshot(latest);

    assert.deepEqual(result, { status: 'existing', tabId: 'moving' });
    assert.deepEqual(useTabStore.getState().tabs, [latest]);
    assert.equal(useTabStore.getState().activeTabId, latest.id);
  });

  it('freezes serialized tab writes between final snapshot and transfer commit', () => {
    const tabId = useTabStore.getState().createTab({
      route: '/contacts/new',
      title: '새 연락처',
      kind: 'contact',
    });
    useTabStore.getState().updateTabFormDraft(tabId, 'name', '잠금 전');

    const snapshot = useTabStore.getState().lockTabForTransfer(tabId);
    assert.ok(snapshot);
    useTabStore.getState().updateTabTitle(tabId, '바뀌면 안 됨');
    useTabStore.getState().updateTabFormDraft(tabId, 'name', '늦은 쓰기');
    useTabStore
      .getState()
      .adoptTabLocation(tabId, '/dashboard', 'home', '대시보드');

    const locked = useTabStore.getState().tabs.find((tab) => tab.id === tabId);
    assert.equal(locked?.title, '새 연락처');
    assert.equal(locked?.route, '/contacts/new');
    assert.equal(locked?.uiState?.formDraft?.name, '잠금 전');

    useTabStore.getState().unlockTabForTransfer(tabId);
    useTabStore.getState().updateTabFormDraft(tabId, 'name', '잠금 해제');
    assert.equal(
      useTabStore.getState().tabs[0]?.uiState?.formDraft?.name,
      '잠금 해제',
    );
  });

  it('keeps a reserved source tab alive until detach commit or rollback', () => {
    const tabId = useTabStore.getState().createTab({
      route: '/properties/property-1',
      title: '매물 1',
      kind: 'property',
    });
    assert.ok(useTabStore.getState().lockTabForTransfer(tabId));

    useTabStore.getState().closeTab(tabId);
    useTabStore.getState().closeAllTabs();
    assert.equal(
      useTabStore.getState().tabs.some((tab) => tab.id === tabId),
      true,
    );

    useTabStore.getState().unlockTabForTransfer(tabId);
    useTabStore.getState().closeTab(tabId);
    assert.equal(
      useTabStore.getState().tabs.some((tab) => tab.id === tabId),
      false,
    );
  });

  it('restores a detached multi-tab workspace without changing identity or active tab', () => {
    const left = makeTab('left', {
      route: '/properties/property-1?view=history',
      resourceKey: tabResourceKeys.entity('property', 'property-1'),
      uiState: { scrollY: 180 },
    });
    const right = makeTab('right', {
      route: '/contacts/contact-1#phones',
      resourceKey: tabResourceKeys.entity('contact', 'contact-1'),
      createdAt: 2,
    });

    const result = useTabStore.getState().restoreTransferredWorkspace({
      schemaVersion: 1,
      tabs: [left, right],
      activeTabId: right.id,
    });

    assert.deepEqual(result, { status: 'restored', activeTabId: right.id });
    assert.deepEqual(useTabStore.getState().tabs, [left, right]);
    assert.equal(useTabStore.getState().activeTabId, right.id);
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
        '/matches?matchId=match-1#detail',
        'match',
        '매칭',
      );

    assert.notEqual(opened, tab);
    assert.equal(useTabStore.getState().tabs.length, 2);
    assert.equal(
      useTabStore.getState().tabs[0].route,
      '/properties/property-1',
    );
    assert.equal(
      useTabStore.getState().tabs[1].route,
      '/matches?matchId=match-1#detail',
    );
    assert.equal(
      useTabStore.getState().tabs[1].resourceKey,
      tabResourceKeys.module('/matches'),
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

  it('activates the neighboring tab when an active tab is detached', () => {
    useTabStore.setState({
      tabs: [makeTab('left'), makeTab('active'), makeTab('right')],
      activeTabId: 'active',
    });

    useTabStore.getState().removeTabById('active');

    assert.deepEqual(
      useTabStore.getState().tabs.map((tab) => tab.id),
      ['left', 'right'],
    );
    assert.equal(useTabStore.getState().activeTabId, 'right');
  });

  it('clears the active tab when the detached tab was the last tab', () => {
    useTabStore.setState({
      tabs: [makeTab('only')],
      activeTabId: 'only',
    });

    useTabStore.getState().removeTabById('only');

    assert.deepEqual(useTabStore.getState().tabs, []);
    assert.equal(useTabStore.getState().activeTabId, null);
  });

  it('ignores closeOtherTabs for an unknown id', () => {
    const tab = makeTab('only');
    useTabStore.setState({ tabs: [tab], activeTabId: tab.id });

    useTabStore.getState().closeOtherTabs('missing');

    assert.deepEqual(useTabStore.getState().tabs, [tab]);
    assert.equal(useTabStore.getState().activeTabId, tab.id);
  });

  it('clears tenant-bound tabs, drafts, and transfer locks on auth change', () => {
    const store = useTabStore.getState();
    const id = store.createTab({
      route: '/properties/new',
      kind: 'property',
      title: '신규 매물',
    });
    store.updateTabFormDraft(id, 'property', { title: 'A 사무소 초안' });
    assert.ok(store.lockTabForTransfer(id));

    useTabStore.getState().resetWorkspaceForAuthChange();
    const reset = useTabStore.getState();
    assert.deepEqual(reset.tabs, []);
    assert.equal(reset.activeTabId, null);
    assert.equal(reset.transferLockedTabIds.size, 0);
  });
});

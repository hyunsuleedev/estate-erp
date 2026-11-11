import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emptyTabBarState,
  isTabBarState,
  parseTabBarAction,
  parseTabBarActionEnvelope,
  TAB_BAR_LIMITS,
  type TabBarAction,
  type TabBarState,
} from '../src/common/tabs/tabBarContract';

function state(overrides: Partial<TabBarState> = {}): TabBarState {
  return {
    ...emptyTabBarState('main', 'darwin'),
    revision: 3,
    ackSeq: 2,
    tabs: [
      { id: 'a', title: '대시보드', route: '/dashboard', kind: 'dashboard', dirty: false },
      { id: 'b', title: '매물 상세', route: '/properties/p1', kind: 'property', dirty: true },
    ],
    activeTabId: 'b',
    history: { canGoBack: true, canGoForward: false },
    ...overrides,
  };
}

describe('tab bar actions sent to main', () => {
  it('accepts every action the tab bar can send and returns only known fields', () => {
    const valid: TabBarAction[] = [
      { type: 'activate', tabId: 'a' },
      { type: 'close', tabId: 'a' },
      { type: 'close-others', tabId: 'a' },
      { type: 'close-left', tabId: 'a' },
      { type: 'close-right', tabId: 'a' },
      { type: 'tab-menu', tabId: 'a' },
      { type: 'reorder', tabId: 'a', toIndex: 3 },
      { type: 'new-tab' },
      { type: 'reopen-closed' },
      { type: 'toggle-sidebar' },
      { type: 'history', direction: 'back' },
      { type: 'history', direction: 'forward', inNewTab: true },
      { type: 'history-menu', direction: 'back' },
      { type: 'command', command: { type: 'select-relative-tab', offset: -1 } },
      { type: 'command', command: { type: 'select-tab-index', index: 'last' } },
      { type: 'adopt', tabId: 'a', sourceWindowId: 3, toIndex: 0 },
      {
        type: 'drop-outside',
        tabId: 'a',
        // 창 밖에서 끝나면 문서 안 좌표가 범위를 벗어난다(음수 포함).
        client: { x: 1800.5, y: -220 },
        grabOffset: { x: 12, y: 8 },
        accepted: false,
      },
      {
        type: 'drop-outside',
        tabId: 'a',
        client: { x: 300, y: 400 },
        grabOffset: { x: 0, y: 0 },
        accepted: true,
        eventScreen: { x: 1300, y: 500 },
      },
    ];
    for (const action of valid) {
      assert.deepEqual(parseTabBarAction(action), action, action.type);
      assert.deepEqual(
        parseTabBarAction({ ...action, extra: 'ignored', __proto__: null }),
        action,
        `${action.type} with an unknown field`,
      );
    }
  });

  it('drops the false form of the optional history flag', () => {
    assert.deepEqual(parseTabBarAction({ type: 'history', direction: 'back', inNewTab: false }), {
      type: 'history',
      direction: 'back',
    });
  });

  it('rejects malformed actions', () => {
    const invalid: unknown[] = [
      null,
      undefined,
      'activate',
      [],
      {},
      { type: 'unknown' },
      { type: 'activate' },
      { type: 'activate', tabId: '' },
      { type: 'activate', tabId: 7 },
      { type: 'close', tabId: 'x'.repeat(TAB_BAR_LIMITS.tabId + 1) },
      { type: 'reorder', tabId: 'a' },
      { type: 'reorder', tabId: 'a', toIndex: -1 },
      { type: 'reorder', tabId: 'a', toIndex: 1.5 },
      { type: 'reorder', tabId: 'a', toIndex: Number.NaN },
      { type: 'reorder', tabId: 'a', toIndex: TAB_BAR_LIMITS.tabs },
      { type: 'reorder', tabId: 'a', toIndex: '1' },
      { type: 'history' },
      { type: 'history', direction: 'sideways' },
      { type: 'history', direction: 'back', inNewTab: 'yes' },
      { type: 'history-menu', direction: 1 },
      { type: 'command' },
      { type: 'command', command: { type: 'quit' } },
      // 다른 창의 탭을 받기: 탭, 원래 창, 자리가 모두 있어야 한다.
      { type: 'adopt', tabId: 'a', sourceWindowId: 3 },
      { type: 'adopt', tabId: 'a', toIndex: 0 },
      { type: 'adopt', sourceWindowId: 3, toIndex: 0 },
      { type: 'adopt', tabId: '', sourceWindowId: 3, toIndex: 0 },
      { type: 'adopt', tabId: 'a', sourceWindowId: 0, toIndex: 0 },
      { type: 'adopt', tabId: 'a', sourceWindowId: -1, toIndex: 0 },
      { type: 'adopt', tabId: 'a', sourceWindowId: 1.5, toIndex: 0 },
      { type: 'adopt', tabId: 'a', sourceWindowId: '3', toIndex: 0 },
      { type: 'adopt', tabId: 'a', sourceWindowId: 3, toIndex: -1 },
      { type: 'adopt', tabId: 'a', sourceWindowId: 3, toIndex: TAB_BAR_LIMITS.tabs },
      // 탭 줄 밖에서 끝난 끌기: 끝난 자리, 잡은 자리, 받았는지가 모두 있어야 한다.
      { type: 'drop-outside', tabId: 'a', client: { x: 1, y: 2 }, grabOffset: { x: 1, y: 1 } },
      { type: 'drop-outside', tabId: 'a', client: { x: 1, y: 2 }, accepted: true },
      { type: 'drop-outside', tabId: 'a', grabOffset: { x: 1, y: 1 }, accepted: true },
      {
        type: 'drop-outside',
        client: { x: 1, y: 2 },
        grabOffset: { x: 1, y: 1 },
        accepted: true,
      },
      ...[
        { client: { x: Number.POSITIVE_INFINITY, y: 2 } },
        { client: { x: Number.NaN, y: 2 } },
        { client: { x: '1', y: 2 } },
        { client: { x: TAB_BAR_LIMITS.coordinate + 1, y: 2 } },
        { client: { x: 1, y: -TAB_BAR_LIMITS.coordinate - 1 } },
        { client: [1, 2] },
        { grabOffset: { x: -1, y: 1 } },
        { grabOffset: { x: 1, y: 5_000 } },
        { grabOffset: { x: 1 } },
        { accepted: 'yes' },
        { accepted: 1 },
      ].map((bad) => ({
        type: 'drop-outside',
        tabId: 'a',
        client: { x: 1, y: 2 },
        grabOffset: { x: 1, y: 1 },
        accepted: true,
        ...bad,
      })),
      // 예전의 "끌어내면 바로 새 창" 동작은 더 받지 않는다.
      {
        type: 'drag-out-start',
        dragId: 'd',
        tabId: 'a',
        pointerScreen: { x: 1, y: 2 },
        mouseOffset: { x: 1, y: 1 },
      },
      { type: 'drag-out-move', dragId: 'd', pointerScreen: { x: 1, y: 2 } },
      { type: 'drag-out-end', dragId: 'd' },
    ];
    for (const value of invalid) {
      assert.equal(parseTabBarAction(value), null, JSON.stringify(value));
    }
  });

  it('keeps the logged screen point only when it is well formed', () => {
    const base = {
      type: 'drop-outside',
      tabId: 'a',
      client: { x: 1, y: 2 },
      grabOffset: { x: 1, y: 1 },
      accepted: true,
    } as const;
    // 기록용 값이 틀렸다고 동작을 버리지는 않는다. 그 값만 뺀다.
    for (const eventScreen of [null, 'x', { x: 1 }, { x: Number.NaN, y: 1 }]) {
      assert.deepEqual(parseTabBarAction({ ...base, eventScreen }), base);
    }
  });

  it('requires a non-negative whole sequence number on the envelope', () => {
    assert.deepEqual(parseTabBarActionEnvelope({ seq: 4, action: { type: 'new-tab' } }), {
      seq: 4,
      action: { type: 'new-tab' },
    });
    assert.deepEqual(parseTabBarActionEnvelope({ seq: 0, action: { type: 'new-tab' } }), {
      seq: 0,
      action: { type: 'new-tab' },
    });
    for (const value of [
      null,
      { action: { type: 'new-tab' } },
      { seq: -1, action: { type: 'new-tab' } },
      { seq: 1.5, action: { type: 'new-tab' } },
      { seq: '1', action: { type: 'new-tab' } },
      { seq: 2 ** 60, action: { type: 'new-tab' } },
      { seq: 1 },
      { seq: 1, action: { type: 'unknown' } },
    ]) {
      assert.equal(parseTabBarActionEnvelope(value), null, JSON.stringify(value));
    }
  });
});

describe('tab bar state sent by main', () => {
  it('accepts the empty state of both window kinds', () => {
    assert.ok(isTabBarState(emptyTabBarState('main', 'darwin')));
    assert.ok(isTabBarState(emptyTabBarState('detached', 'win32')));
    // 창의 id를 모르는 곳(브라우저 미리보기)은 0, main이 만든 상태는 그 창의 id다.
    assert.equal(emptyTabBarState('main', 'darwin').windowId, 0);
    assert.equal(emptyTabBarState('main', 'darwin', 7).windowId, 7);
    assert.ok(isTabBarState(emptyTabBarState('main', 'darwin', 7)));
    assert.equal(emptyTabBarState('main', 'darwin').canCreateTabs, true);
    assert.equal(emptyTabBarState('detached', 'darwin').canCreateTabs, false);
  });

  it('accepts a filled state, including a failed tab', () => {
    assert.ok(isTabBarState(state()));
    assert.ok(
      isTabBarState(
        state({
          tabs: [
            { id: 'a', title: '', route: '/dashboard', kind: 'dashboard', dirty: false, failed: true },
          ],
          activeTabId: 'a',
        }),
      ),
    );
    // structured clone을 거친 값도 같은 모양이다.
    assert.ok(isTabBarState(structuredClone(state())));
  });

  it('rejects states the tab bar could not draw safely', () => {
    const base = state();
    const invalid: unknown[] = [
      null,
      [],
      { ...base, schemaVersion: 2 },
      { ...base, windowId: undefined },
      { ...base, windowId: -1 },
      { ...base, windowId: 1.5 },
      { ...base, windowId: '1' },
      { ...base, revision: -1 },
      { ...base, revision: 1.5 },
      { ...base, ackSeq: '2' },
      { ...base, windowKind: 'popup' },
      { ...base, platform: 1 },
      { ...base, fullscreen: 'no' },
      { ...base, sidebarOpen: undefined },
      { ...base, canCreateTabs: 1 },
      { ...base, canReopenClosed: null },
      { ...base, tabs: 'none' },
      { ...base, tabs: [{ ...base.tabs[0], id: '' }, base.tabs[1]] },
      { ...base, tabs: [{ ...base.tabs[0], route: 'dashboard' }, base.tabs[1]] },
      { ...base, tabs: [{ ...base.tabs[0], kind: 'spaceship' }, base.tabs[1]] },
      { ...base, tabs: [{ ...base.tabs[0], dirty: 'no' }, base.tabs[1]] },
      { ...base, tabs: [{ ...base.tabs[0], failed: 'yes' }, base.tabs[1]] },
      {
        ...base,
        tabs: [{ ...base.tabs[0], title: 'x'.repeat(TAB_BAR_LIMITS.title + 1) }, base.tabs[1]],
      },
      // 같은 id가 두 번 있으면 어느 탭을 고른 것인지 알 수 없다.
      { ...base, tabs: [base.tabs[0], { ...base.tabs[1], id: 'a' }], activeTabId: 'a' },
      // 활성 탭은 목록 안에 있어야 한다.
      { ...base, activeTabId: 'missing' },
      { ...base, activeTabId: 3 },
      { ...base, history: null },
      { ...base, history: { canGoBack: true } },
    ];
    for (const value of invalid) {
      assert.equal(isTabBarState(value), false, JSON.stringify(value)?.slice(0, 160));
    }
  });

  it('rejects more tabs than the bar is prepared to hold', () => {
    const tabs = Array.from({ length: TAB_BAR_LIMITS.tabs + 1 }, (_, index) => ({
      id: `t${index}`,
      title: 't',
      route: '/dashboard',
      kind: 'dashboard' as const,
      dirty: false,
    }));
    assert.equal(isTabBarState(state({ tabs, activeTabId: null })), false);
    assert.equal(isTabBarState(state({ tabs: tabs.slice(1), activeTabId: null })), true);
  });
});

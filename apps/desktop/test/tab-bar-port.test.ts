import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emptyTabBarState,
  type TabBarActionEnvelope,
  type TabBarState,
} from '../src/common/tabs/tabBarContract';
import { createBridgeTabBarPort } from '../src/common/tabs/tabBarPort';

function state(ids: string[], overrides: Partial<TabBarState> = {}): TabBarState {
  return {
    ...emptyTabBarState('main', 'darwin'),
    revision: 1,
    tabs: ids.map((id) => ({
      id,
      title: id,
      route: `/${id}`,
      kind: 'generic' as const,
      dirty: false,
    })),
    activeTabId: ids[0] ?? null,
    ...overrides,
  };
}

function fakeBridge(initial: TabBarState | null) {
  let listener: ((state: TabBarState) => void) | null = null;
  const sent: TabBarActionEnvelope[] = [];
  return {
    sent,
    push(next: TabBarState) {
      listener?.(next);
    },
    bridge: {
      getState: () => initial,
      onState(callback: (state: TabBarState) => void) {
        listener = callback;
        return () => {
          listener = null;
        };
      },
      dispatch: (envelope: TabBarActionEnvelope) => {
        sent.push(envelope);
      },
    },
  };
}

describe('tab bar bound to main', () => {
  it('draws the state read when the document loaded, or the fallback', () => {
    const withState = fakeBridge(state(['a', 'b'], { ackSeq: 4 }));
    const port = createBridgeTabBarPort(withState.bridge, emptyTabBarState('main', 'darwin'));
    assert.deepEqual(port.getView().tabs.map((tab) => tab.id), ['a', 'b']);
    assert.equal(port.getView().activeTabId, 'a');
    port.dispatch({ type: 'new-tab' });
    assert.deepEqual(withState.sent, [{ seq: 5, action: { type: 'new-tab' } }]);

    const empty = fakeBridge(null);
    const fallback = createBridgeTabBarPort(empty.bridge, emptyTabBarState('detached', 'win32'));
    assert.deepEqual(fallback.getView().tabs, []);
    assert.equal(fallback.getView().windowKind, 'detached');
    assert.equal(fallback.getView().canCreateTabs, false);
  });

  it('keeps the same view object until something changes and tells subscribers when it does', () => {
    const fake = fakeBridge(state(['a', 'b']));
    const port = createBridgeTabBarPort(fake.bridge, emptyTabBarState('main', 'darwin'));
    let calls = 0;
    const unsubscribe = port.subscribe(() => {
      calls += 1;
    });
    const first = port.getView();
    assert.equal(port.getView(), first);

    // 예전 상태는 버린다: 알리지도 않는다.
    fake.push(state(['a'], { revision: 0 }));
    assert.equal(port.getView(), first);
    assert.equal(calls, 0);

    fake.push(state(['a', 'b', 'c'], { revision: 2, sidebarOpen: false }));
    assert.equal(calls, 1);
    assert.notEqual(port.getView(), first);
    assert.equal(port.getView().sidebarOpen, false);
    assert.equal(port.getView().tabs.length, 3);

    unsubscribe();
    fake.push(state(['a'], { revision: 3 }));
    assert.equal(calls, 1);
  });

  it('shows a pick and a drop at once and sends them with their sequence numbers', () => {
    const fake = fakeBridge(state(['a', 'b', 'c']));
    const port = createBridgeTabBarPort(fake.bridge, emptyTabBarState('main', 'darwin'));

    port.dispatch({ type: 'activate', tabId: 'c' });
    assert.equal(port.getView().activeTabId, 'c');
    port.dispatch({ type: 'reorder', tabId: 'a', toIndex: 2 });
    assert.deepEqual(port.getView().tabs.map((tab) => tab.id), ['b', 'c', 'a']);
    assert.deepEqual(fake.sent, [
      { seq: 1, action: { type: 'activate', tabId: 'c' } },
      { seq: 2, action: { type: 'reorder', tabId: 'a', toIndex: 2 } },
    ]);

    // 아무것도 바꾸지 않는 동작은 보내지 않는다.
    port.dispatch({ type: 'activate', tabId: 'c' });
    port.dispatch({ type: 'reorder', tabId: 'a', toIndex: 2 });
    assert.equal(fake.sent.length, 2);

    // main이 둘 다 반영한 상태가 오면 그대로 이어진다.
    fake.push(state(['b', 'c', 'a'], { revision: 2, ackSeq: 2, activeTabId: 'c' }));
    assert.deepEqual(port.getView().tabs.map((tab) => tab.id), ['b', 'c', 'a']);
    assert.equal(port.getView().activeTabId, 'c');
  });

  it('tells the tab strip which window it is, for the drag it starts', () => {
    const fake = fakeBridge(state(['a'], { windowId: 12 }));
    const port = createBridgeTabBarPort(fake.bridge, emptyTabBarState('main', 'darwin'));
    assert.equal(port.getView().windowId, 12);
    assert.equal(port.getView().reservedSlot, null);
  });

  it('shows a tab released outside as gone, and a dropped foreign tab as a held slot, until main answers', () => {
    const fake = fakeBridge(state(['a', 'b'], { windowId: 12 }));
    const port = createBridgeTabBarPort(fake.bridge, emptyTabBarState('main', 'darwin'));
    const release = {
      type: 'drop-outside',
      tabId: 'b',
      client: { x: 900, y: 600 },
      grabOffset: { x: 10, y: 10 },
      accepted: true,
    } as const;

    port.dispatch(release);
    assert.deepEqual(port.getView().tabs.map((tab) => tab.id), ['a']);
    assert.deepEqual(fake.sent, [{ seq: 1, action: release }]);
    // main이 탭을 옮기지 않기로 했다: 답과 함께 탭이 돌아온다.
    fake.push(state(['a', 'b'], { windowId: 12, revision: 2, ackSeq: 1 }));
    assert.deepEqual(port.getView().tabs.map((tab) => tab.id), ['a', 'b']);

    port.dispatch({ type: 'adopt', tabId: 'x', sourceWindowId: 3, toIndex: 0 });
    assert.equal(port.getView().reservedSlot, 0);
    assert.deepEqual(fake.sent.at(-1), {
      seq: 2,
      action: { type: 'adopt', tabId: 'x', sourceWindowId: 3, toIndex: 0 },
    });
    fake.push(state(['x', 'a', 'b'], { windowId: 12, revision: 3, ackSeq: 2, activeTabId: 'x' }));
    assert.equal(port.getView().reservedSlot, null);
    assert.deepEqual(port.getView().tabs.map((tab) => tab.id), ['x', 'a', 'b']);
  });
});

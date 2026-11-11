import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emptyTabBarState,
  type TabBarState,
  type TabBarTab,
} from '../src/common/tabs/tabBarContract';
import {
  TAB_BAR_METRICS,
  createTabBarModel,
  detachedTabOrigin,
  issueTabBarAction,
  receiveTabBarState,
  reorderedIds,
  reservedTabSlot,
  tabBarChrome,
  visibleActiveTabId,
  visibleTabs,
  type TabBarModel,
} from '../src/common/tabs/tabBarModel';

function tab(id: string, overrides: Partial<TabBarTab> = {}): TabBarTab {
  return { id, title: id, route: `/${id}`, kind: 'generic', dirty: false, ...overrides };
}

function serverState(
  ids: string[],
  overrides: Partial<TabBarState> = {},
): TabBarState {
  return {
    ...emptyTabBarState('main', 'darwin'),
    revision: 1,
    tabs: ids.map((id) => tab(id)),
    activeTabId: ids[0] ?? null,
    ...overrides,
  };
}

function order(model: TabBarModel): string[] {
  return visibleTabs(model).map((item) => item.id);
}

function issue(model: TabBarModel, action: Parameters<typeof issueTabBarAction>[1]) {
  const issued = issueTabBarAction(model, action);
  assert.ok(issued.envelope, `expected ${action.type} to be sent`);
  return { model: issued.model, envelope: issued.envelope };
}

describe('tab bar model: order shown while a drop is being applied', () => {
  it('keeps the dropped order until main acknowledges that drop', () => {
    let model = createTabBarModel(serverState(['a', 'b', 'c']));
    const dropped = issue(model, { type: 'reorder', tabId: 'a', toIndex: 2 });
    model = dropped.model;
    assert.deepEqual(dropped.envelope, {
      seq: 1,
      action: { type: 'reorder', tabId: 'a', toIndex: 2 },
    });
    assert.deepEqual(order(model), ['b', 'c', 'a']);

    // 놓기 전에 main이 보낸, 다른 이유(제목 변경)의 상태가 늦게 도착했다.
    model = receiveTabBarState(
      model,
      serverState(['a', 'b', 'c'], {
        revision: 2,
        ackSeq: 0,
        tabs: [tab('a'), tab('b', { title: '새 제목' }), tab('c')],
      }),
    );
    assert.deepEqual(order(model), ['b', 'c', 'a'], 'the tab must not jump back');
    assert.equal(visibleTabs(model)[0].title, '새 제목', 'other changes still show');

    // main이 그 놓기를 반영한 상태.
    model = receiveTabBarState(model, serverState(['b', 'c', 'a'], { revision: 3, ackSeq: 1 }));
    assert.equal(model.pendingOrder, null);
    assert.deepEqual(order(model), ['b', 'c', 'a']);
  });

  it('follows main when main decided differently', () => {
    let model = createTabBarModel(serverState(['a', 'b', 'c']));
    model = issue(model, { type: 'reorder', tabId: 'a', toIndex: 2 }).model;
    // main이 그 동작을 받았지만 순서를 바꾸지 않았다(예: 그사이 탭이 다른 창으로 갔다).
    model = receiveTabBarState(model, serverState(['b', 'c'], { revision: 2, ackSeq: 1 }));
    assert.deepEqual(order(model), ['b', 'c']);
  });

  it('drops closed tabs from the pending order and appends tabs opened meanwhile', () => {
    let model = createTabBarModel(serverState(['a', 'b', 'c']));
    model = issue(model, { type: 'reorder', tabId: 'c', toIndex: 0 }).model;
    model = receiveTabBarState(
      model,
      serverState(['a', 'c', 'd'], { revision: 2, ackSeq: 0 }),
    );
    assert.deepEqual(order(model), ['c', 'a', 'd']);
  });

  it('applies a second drop on top of the first before either is acknowledged', () => {
    let model = createTabBarModel(serverState(['a', 'b', 'c', 'd']));
    model = issue(model, { type: 'reorder', tabId: 'a', toIndex: 3 }).model;
    const second = issue(model, { type: 'reorder', tabId: 'd', toIndex: 0 });
    model = second.model;
    assert.equal(second.envelope.seq, 2);
    assert.deepEqual(order(model), ['d', 'b', 'c', 'a']);

    // 첫 놓기만 반영된 상태: 두 번째 놓기를 아직 되돌리지 않는다.
    model = receiveTabBarState(
      model,
      serverState(['b', 'c', 'd', 'a'], { revision: 2, ackSeq: 1 }),
    );
    assert.deepEqual(order(model), ['d', 'b', 'c', 'a']);

    model = receiveTabBarState(
      model,
      serverState(['d', 'b', 'c', 'a'], { revision: 3, ackSeq: 2 }),
    );
    assert.equal(model.pendingOrder, null);
    assert.deepEqual(order(model), ['d', 'b', 'c', 'a']);
  });

  it('does not send a drop that changes nothing, and clamps the index it sends', () => {
    const model = createTabBarModel(serverState(['a', 'b', 'c']));
    const same = issueTabBarAction(model, { type: 'reorder', tabId: 'b', toIndex: 1 });
    assert.equal(same.envelope, null);
    assert.equal(same.model, model);

    const unknown = issueTabBarAction(model, { type: 'reorder', tabId: 'zz', toIndex: 0 });
    assert.equal(unknown.envelope, null);

    const beyond = issue(model, { type: 'reorder', tabId: 'a', toIndex: 99 });
    assert.deepEqual(beyond.envelope.action, { type: 'reorder', tabId: 'a', toIndex: 2 });
    assert.deepEqual(order(beyond.model), ['b', 'c', 'a']);
  });

  it('computes a drop position the same way main does', () => {
    assert.deepEqual(reorderedIds(['a', 'b', 'c', 'd'], 'a', 2), ['b', 'c', 'a', 'd']);
    assert.deepEqual(reorderedIds(['a', 'b', 'c', 'd'], 'd', 0), ['d', 'a', 'b', 'c']);
    assert.deepEqual(reorderedIds(['a', 'b'], 'a', -3), ['a', 'b']);
    assert.deepEqual(reorderedIds(['a', 'b'], 'missing', 0), ['a', 'b']);
  });
});

describe('tab bar model: tab shown as selected', () => {
  it('shows the picked tab at once and keeps it through unrelated state', () => {
    let model = createTabBarModel(serverState(['a', 'b', 'c']));
    const picked = issue(model, { type: 'activate', tabId: 'c' });
    model = picked.model;
    assert.deepEqual(picked.envelope, { seq: 1, action: { type: 'activate', tabId: 'c' } });
    assert.equal(visibleActiveTabId(model), 'c');

    model = receiveTabBarState(model, serverState(['a', 'b', 'c'], { revision: 2, ackSeq: 0 }));
    assert.equal(visibleActiveTabId(model), 'c');

    model = receiveTabBarState(
      model,
      serverState(['a', 'b', 'c'], { revision: 3, ackSeq: 1, activeTabId: 'c' }),
    );
    assert.equal(model.pendingActive, null);
    assert.equal(visibleActiveTabId(model), 'c');
  });

  it('gives way when main selected another tab after acknowledging', () => {
    let model = createTabBarModel(serverState(['a', 'b', 'c']));
    model = issue(model, { type: 'activate', tabId: 'c' }).model;
    model = receiveTabBarState(
      model,
      serverState(['a', 'b', 'c'], { revision: 2, ackSeq: 1, activeTabId: 'b' }),
    );
    assert.equal(visibleActiveTabId(model), 'b');
  });

  it('stops showing a picked tab that was closed before main answered', () => {
    let model = createTabBarModel(serverState(['a', 'b', 'c']));
    model = issue(model, { type: 'activate', tabId: 'c' }).model;
    model = receiveTabBarState(model, serverState(['a', 'b'], { revision: 2, ackSeq: 0 }));
    assert.equal(model.pendingActive, null);
    assert.equal(visibleActiveTabId(model), 'a');
  });

  it('does not send a pick of the tab already shown, or of an unknown tab', () => {
    const model = createTabBarModel(serverState(['a', 'b']));
    assert.equal(issueTabBarAction(model, { type: 'activate', tabId: 'a' }).envelope, null);
    assert.equal(issueTabBarAction(model, { type: 'activate', tabId: 'zz' }).envelope, null);

    // 고른 직후 같은 탭을 다시 눌러도 한 번만 보낸다.
    const picked = issue(model, { type: 'activate', tabId: 'b' }).model;
    assert.equal(issueTabBarAction(picked, { type: 'activate', tabId: 'b' }).envelope, null);
    // 답이 오기 전에 원래 탭으로 돌아가는 것은 새 동작이다.
    assert.deepEqual(issue(picked, { type: 'activate', tabId: 'a' }).envelope, {
      seq: 2,
      action: { type: 'activate', tabId: 'a' },
    });
  });
});

describe('tab bar model: sequence numbers and stale states', () => {
  it('ignores a state older than the one it already has', () => {
    let model = createTabBarModel(serverState(['a', 'b'], { revision: 5 }));
    const stale = receiveTabBarState(model, serverState(['a'], { revision: 4 }));
    assert.equal(stale, model);
    model = receiveTabBarState(model, serverState(['a'], { revision: 5 }));
    assert.deepEqual(order(model), ['a'], 'the same revision is taken (bootstrap then push)');
  });

  it('continues numbering after what main already acknowledged', () => {
    // 탭바 문서가 다시 떴다: main은 이 창에서 7번까지 반영했다.
    let model = createTabBarModel(serverState(['a', 'b'], { ackSeq: 7 }));
    const first = issue(model, { type: 'new-tab' });
    assert.equal(first.envelope.seq, 8);
    model = first.model;

    // main의 순번이 더 앞서 있으면 그 뒤에서 이어 간다.
    model = receiveTabBarState(model, serverState(['a', 'b'], { revision: 2, ackSeq: 20 }));
    assert.equal(issue(model, { type: 'toggle-sidebar' }).envelope.seq, 21);
  });

  it('numbers every sent action, including those without a preview', () => {
    let model = createTabBarModel(serverState(['a', 'b']));
    const seqs: number[] = [];
    for (const action of [
      { type: 'close', tabId: 'a' },
      { type: 'tab-menu', tabId: 'b' },
      { type: 'history', direction: 'back' },
      { type: 'command', command: { type: 'new-tab' } },
    ] as const) {
      const issued = issue(model, action);
      seqs.push(issued.envelope.seq);
      model = issued.model;
    }
    assert.deepEqual(seqs, [1, 2, 3, 4]);
    assert.equal(model.pendingOrder, null);
    assert.equal(model.pendingActive, null);
  });
});

describe('tab bar model: a tab released outside the tab strip', () => {
  const release = {
    type: 'drop-outside',
    tabId: 'b',
    client: { x: 400, y: 300 },
    grabOffset: { x: 20, y: 10 },
    accepted: true,
  } as const;

  it('takes the tab out of the strip at once and follows main when the answer comes', () => {
    let model = createTabBarModel(serverState(['a', 'b', 'c'], { activeTabId: 'b' }));
    const sent = issue(model, release);
    assert.deepEqual(sent.envelope, { seq: 1, action: release });
    model = sent.model;
    // 손을 뗀 순간부터 그 탭은 이 줄에 그리지 않는다(새 창이 뜰 때까지 되돌아와 보이지 않게).
    assert.deepEqual(order(model), ['a', 'c']);
    assert.equal(visibleActiveTabId(model), null, 'no tab is shown as active meanwhile');

    // 그 전에 보낸, 다른 이유(제목 변경)의 상태가 늦게 왔다: 탭은 여전히 빠져 있다.
    model = receiveTabBarState(
      model,
      serverState(['a', 'b', 'c'], { revision: 2, ackSeq: 0, activeTabId: 'b' }),
    );
    assert.deepEqual(order(model), ['a', 'c']);

    // main이 탭을 새 창으로 옮겼다.
    model = receiveTabBarState(
      model,
      serverState(['a', 'c'], { revision: 3, ackSeq: 1, activeTabId: 'c' }),
    );
    assert.equal(model.pendingDetach, null);
    assert.deepEqual(order(model), ['a', 'c']);
    assert.equal(visibleActiveTabId(model), 'c');
  });

  it('puts the tab back when main decides to do nothing', () => {
    // 취소했거나(Escape) 탭 줄 위에서 손을 뗐다: main은 받았다고만 답한다.
    let model = createTabBarModel(serverState(['a', 'b', 'c'], { activeTabId: 'b' }));
    model = issue(model, { ...release, accepted: false }).model;
    assert.deepEqual(order(model), ['a', 'c']);

    model = receiveTabBarState(
      model,
      serverState(['a', 'b', 'c'], { revision: 2, ackSeq: 1, activeTabId: 'b' }),
    );
    assert.equal(model.pendingDetach, null);
    assert.deepEqual(order(model), ['a', 'b', 'c'], 'nothing is left behind');
    assert.equal(visibleActiveTabId(model), 'b');
  });

  it('sends nothing for a tab it does not show, or while an answer is pending', () => {
    const model = createTabBarModel(serverState(['a', 'b']));
    assert.equal(issueTabBarAction(model, { ...release, tabId: 'missing' }).envelope, null);

    const waiting = issue(model, release).model;
    assert.equal(issueTabBarAction(waiting, { ...release, tabId: 'a' }).envelope, null);
    assert.equal(issueTabBarAction(waiting, release).envelope, null, 'already taken out');

    // 답을 받은 뒤에는 다음 끌기를 보낼 수 있다.
    const answered = receiveTabBarState(
      waiting,
      serverState(['a', 'b'], { revision: 2, ackSeq: 1 }),
    );
    assert.equal(issue(answered, { ...release, tabId: 'a' }).envelope.seq, 2);
  });

  it('keeps a reorder shown while the released tab is hidden', () => {
    let model = createTabBarModel(serverState(['a', 'b', 'c', 'd']));
    model = issue(model, { type: 'reorder', tabId: 'a', toIndex: 3 }).model;
    model = issue(model, release).model;
    assert.deepEqual(order(model), ['c', 'd', 'a']);
  });
});

describe('tab bar model: a tab from another window dropped on this strip', () => {
  const adopt = { type: 'adopt', tabId: 'x', sourceWindowId: 9, toIndex: 1 } as const;

  it('holds the slot open until main has inserted the tab', () => {
    let model = createTabBarModel(serverState(['a', 'b']));
    assert.equal(reservedTabSlot(model), null);

    const sent = issue(model, adopt);
    assert.deepEqual(sent.envelope, { seq: 1, action: adopt });
    model = sent.model;
    // 탭의 제목과 주소는 main만 안다. 넣어 줄 때까지 그 칸을 비워 둔다.
    assert.equal(reservedTabSlot(model), 1);
    assert.deepEqual(order(model), ['a', 'b']);

    // 다른 이유의 상태가 먼저 와도 칸은 그대로다.
    model = receiveTabBarState(model, serverState(['a', 'b'], { revision: 2, ackSeq: 0 }));
    assert.equal(reservedTabSlot(model), 1);

    model = receiveTabBarState(
      model,
      serverState(['a', 'x', 'b'], { revision: 3, ackSeq: 1, activeTabId: 'x' }),
    );
    assert.equal(reservedTabSlot(model), null);
    assert.deepEqual(order(model), ['a', 'x', 'b']);
    assert.equal(visibleActiveTabId(model), 'x');
  });

  it('closes the slot when main refuses the tab', () => {
    let model = createTabBarModel(serverState(['a', 'b']));
    model = issue(model, adopt).model;
    model = receiveTabBarState(model, serverState(['a', 'b'], { revision: 2, ackSeq: 1 }));
    assert.equal(reservedTabSlot(model), null);
    assert.deepEqual(order(model), ['a', 'b']);
  });

  it('sends a slot inside the strip and never adopts its own tab', () => {
    const model = createTabBarModel(serverState(['a', 'b']));
    const far = issue(model, { ...adopt, toIndex: 99 });
    assert.equal(far.envelope.action.type === 'adopt' && far.envelope.action.toIndex, 2);
    assert.equal(reservedTabSlot(far.model), 2);
    assert.equal(issueTabBarAction(model, { ...adopt, tabId: 'a' }).envelope, null);
  });
});

describe('tab bar chrome', () => {
  it('reserves room for the window buttons of each platform', () => {
    assert.deepEqual(tabBarChrome({ platform: 'darwin', fullscreen: false }), {
      reserveTrafficLights: true,
      reserveWindowControls: false,
    });
    assert.deepEqual(tabBarChrome({ platform: 'darwin', fullscreen: true }), {
      reserveTrafficLights: false,
      reserveWindowControls: false,
    });
    assert.deepEqual(tabBarChrome({ platform: 'win32', fullscreen: false }), {
      reserveTrafficLights: false,
      reserveWindowControls: true,
    });
    assert.deepEqual(tabBarChrome({ platform: 'linux', fullscreen: false }), {
      reserveTrafficLights: false,
      reserveWindowControls: false,
    });
  });

  it('knows where the single tab of a detached window sits', () => {
    // 탭(36px)은 탭 줄(40px)의 바닥에 붙는다: 위에서 4px. 개발 앱의 분리된 창에서 잰 값과 같다.
    assert.equal(TAB_BAR_METRICS.height - TAB_BAR_METRICS.tabHeight, 4);
    // macOS: 신호등 자리 92 + 뒤로/앞으로 버튼 칸 60. 그 밖: 여백 16 + 60.
    assert.deepEqual(detachedTabOrigin('darwin'), { x: 152, y: 4 });
    assert.deepEqual(detachedTabOrigin('win32'), { x: 76, y: 4 });
    assert.deepEqual(detachedTabOrigin('linux'), { x: 76, y: 4 });
  });
});

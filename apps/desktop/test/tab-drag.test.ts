import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  NO_TAB_STRIP_DRAG,
  TAB_DRAG_TYPES,
  acceptAppTabDrops,
  carriesTabDragMarker,
  isAppTabDrag,
  readDraggedTab,
  tabDragMarkerType,
  tabSlotAt,
  tabSlotWidth,
  tabStripSlots,
  type TabDragEventLike,
  type TabStripDrag,
} from '../src/common/tabs/tabDrag';
import { reorderedIds } from '../src/common/tabs/tabBarModel';

const LIMITS = { min: 36, max: 200 };

describe('what a tab drag carries', () => {
  it('is an app tab drag only when both the tab and its window are carried', () => {
    assert.equal(isAppTabDrag([TAB_DRAG_TYPES.tabId, TAB_DRAG_TYPES.windowId]), true);
    assert.equal(
      isAppTabDrag(['text/plain', TAB_DRAG_TYPES.windowId, TAB_DRAG_TYPES.tabId]),
      true,
    );
    // 앱 밖에서 온 끌기(파일, 글자, 링크)나 한쪽만 실린 끌기는 아니다.
    for (const types of [
      [],
      ['Files'],
      ['text/plain', 'text/uri-list'],
      [TAB_DRAG_TYPES.tabId],
      [TAB_DRAG_TYPES.windowId],
      null,
      undefined,
    ]) {
      assert.equal(isAppTabDrag(types), false, JSON.stringify(types));
    }
    // DataTransfer.types처럼 배열이 아닌 목록도 읽는다.
    assert.equal(
      isAppTabDrag({ 0: TAB_DRAG_TYPES.tabId, 1: TAB_DRAG_TYPES.windowId, length: 2 }),
      true,
    );
  });

  it('carries no text or link type that another target would act on', () => {
    for (const type of Object.values(TAB_DRAG_TYPES)) {
      assert.match(type, /^application\/x-estaitflow-/);
      assert.equal(type, type.toLowerCase(), 'the browser lower-cases drag types');
    }
  });

  it('marks each drag so a tab strip can tell its own drag from one that came from another window', () => {
    // 끄는 동안에는 실린 값을 읽을 수 없고 이름만 보인다. 표시는 이름에 싣는다.
    const type = tabDragMarkerType('m3x9-1');
    assert.equal(type, 'application/x-estaitflow-drag-m3x9-1');
    const mine = [TAB_DRAG_TYPES.tabId, TAB_DRAG_TYPES.windowId, type];
    assert.equal(carriesTabDragMarker(mine, 'm3x9-1'), true);
    assert.equal(isAppTabDrag(mine), true, 'the marker does not hide the tab');
    // 다른 창에서 온 끌기는 다른 표시를 달고 있다.
    assert.equal(carriesTabDragMarker(mine, 'm3x9-2'), false);
    assert.equal(
      carriesTabDragMarker([TAB_DRAG_TYPES.tabId, TAB_DRAG_TYPES.windowId], 'm3x9-1'),
      false,
    );
    assert.equal(carriesTabDragMarker(null, 'm3x9-1'), false);
    // 브라우저는 이름을 소문자로 바꾼다. 표시도 소문자·숫자·줄표만 남긴다.
    assert.equal(tabDragMarkerType('AbC_1/2'), 'application/x-estaitflow-drag-abc12');
    assert.equal(carriesTabDragMarker([tabDragMarkerType('AbC_1/2')], 'AbC_1/2'), true);
  });

  it('reads the tab and its window from a drop, or nothing', () => {
    const data = (tabId: string, windowId: string) => (type: string) =>
      type === TAB_DRAG_TYPES.tabId ? tabId : type === TAB_DRAG_TYPES.windowId ? windowId : '';
    assert.deepEqual(readDraggedTab(data('tab-1', '7')), { tabId: 'tab-1', sourceWindowId: 7 });
    for (const [tabId, windowId] of [
      ['', '7'],
      ['tab-1', ''],
      ['tab-1', '0'],
      ['tab-1', '-3'],
      ['tab-1', '1.5'],
      ['tab-1', '7x'],
      ['tab-1', 'undefined'],
      ['tab-1', '9'.repeat(20)],
    ]) {
      assert.equal(readDraggedTab(data(tabId, windowId)), null, `${tabId}/${windowId}`);
    }
  });
});

describe('which slot the pointer is over', () => {
  it('shares the strip evenly within the tab width limits', () => {
    assert.equal(tabSlotWidth(1000, 4, LIMITS), 200, 'room to spare: tabs stay at the maximum');
    assert.equal(tabSlotWidth(600, 4, LIMITS), 150);
    assert.equal(tabSlotWidth(100, 10, LIMITS), 36, 'never narrower than the minimum');
    assert.equal(tabSlotWidth(600, 0, LIMITS), 200);
    assert.equal(tabSlotWidth(Number.NaN, 3, LIMITS), 200);
  });

  it('counts fixed slots from the left edge of the tab list', () => {
    // 탭 줄이 x=300에서 시작하고 한 칸이 150px, 네 칸.
    const at = (x: number) => tabSlotAt(x, 300, 150, 4);
    assert.equal(at(300), 0);
    assert.equal(at(449), 0);
    assert.equal(at(450), 1);
    assert.equal(at(749), 2);
    assert.equal(at(750), 3);
    // 탭 줄의 왼쪽 밖과 오른쪽 빈 자리는 첫 칸과 마지막 칸이다.
    assert.equal(at(-50), 0);
    assert.equal(at(5000), 3);
  });

  it('has a single slot when there is nothing to choose between', () => {
    assert.equal(tabSlotAt(500, 300, 150, 1), 0);
    assert.equal(tabSlotAt(500, 300, 150, 0), 0);
    assert.equal(tabSlotAt(500, 300, 0, 4), 0);
    assert.equal(tabSlotAt(Number.NaN, 300, 150, 4), 0);
  });
});

describe('the empty slot shown while a tab is dragged', () => {
  const tabIds = ['a', 'b', 'c', 'd'];
  const dragging = (slot: number | null, draggedTabId = 'b'): TabStripDrag => ({
    draggedTabId,
    slot,
    animate: true,
  });

  it('shows nothing while no tab is dragged', () => {
    assert.deepEqual(tabStripSlots({ tabIds, drag: NO_TAB_STRIP_DRAG }), {
      openGap: null,
      collapsedTabId: null,
      slotCount: 4,
    });
  });

  it('folds the dragged tab away and opens its slot where the pointer is', () => {
    // b(1번째)를 끈다. 칸 번호는 b를 뺀 [a, c, d] 사이에서의 자리다.
    const gapFor = (slot: number | null) => tabStripSlots({ tabIds, drag: dragging(slot) });
    // 원래 자리: 접힌 b 바로 뒤에 빈 칸이 열려 아무것도 움직이지 않는다.
    assert.deepEqual(gapFor(1), { openGap: 2, collapsedTabId: 'b', slotCount: 4 });
    // 맨 앞: a 앞.
    assert.deepEqual(gapFor(0), { openGap: 0, collapsedTabId: 'b', slotCount: 4 });
    // c 뒤(= d 앞).
    assert.deepEqual(gapFor(2), { openGap: 3, collapsedTabId: 'b', slotCount: 4 });
    // 맨 끝.
    assert.deepEqual(gapFor(3), { openGap: 4, collapsedTabId: 'b', slotCount: 4 });
    // 범위를 벗어난 칸은 끝으로 본다.
    assert.equal(gapFor(99).openGap, 4);
    assert.equal(gapFor(-2).openGap, 0);
  });

  it('opens the slot exactly where a drop would put the tab', () => {
    // 빈 칸을 탭 자리로 바꿔 읽은 순서가, 그 칸에 놓았을 때 main이 만드는 순서와 같다.
    for (const dragged of tabIds) {
      for (let slot = 0; slot < tabIds.length; slot += 1) {
        const { openGap } = tabStripSlots({ tabIds, drag: dragging(slot, dragged) });
        assert.notEqual(openGap, null);
        const shown: string[] = [];
        tabIds.forEach((id, index) => {
          if (openGap === index) shown.push(dragged);
          if (id !== dragged) shown.push(id);
        });
        if (openGap === tabIds.length) shown.push(dragged);
        assert.deepEqual(shown, reorderedIds(tabIds, dragged, slot), `${dragged} → ${slot}`);
      }
    }
  });

  it('keeps the slot at home while the pointer is outside the tab strip', () => {
    for (const [dragged, gap] of [
      ['a', 1],
      ['b', 2],
      ['d', 4],
    ] as const) {
      assert.deepEqual(tabStripSlots({ tabIds, drag: dragging(null, dragged) }), {
        openGap: gap,
        collapsedTabId: dragged,
        slotCount: 4,
      });
    }
  });

  it('makes room for a tab dragged in from another window', () => {
    const incoming = (slot: number | null): TabStripDrag => ({
      draggedTabId: null,
      slot,
      animate: true,
    });
    // 칸이 하나 늘어난다. 다른 탭은 접지 않는다.
    assert.deepEqual(tabStripSlots({ tabIds, drag: incoming(0) }), {
      openGap: 0,
      collapsedTabId: null,
      slotCount: 5,
    });
    assert.deepEqual(tabStripSlots({ tabIds, drag: incoming(4) }), {
      openGap: 4,
      collapsedTabId: null,
      slotCount: 5,
    });
    assert.equal(tabStripSlots({ tabIds, drag: incoming(9) }).openGap, 4);
    // 그 탭이 탭 줄을 벗어나면 벌려 둔 자리를 닫는다.
    assert.deepEqual(tabStripSlots({ tabIds, drag: incoming(null) }), {
      openGap: null,
      collapsedTabId: null,
      slotCount: 4,
    });
    // 빈 탭 줄에도 놓을 자리가 하나 있다.
    assert.deepEqual(tabStripSlots({ tabIds: [], drag: incoming(0) }), {
      openGap: 0,
      collapsedTabId: null,
      slotCount: 1,
    });
  });

  it('holds the slot of a dropped tab until the owner of the tab list inserts it', () => {
    assert.deepEqual(tabStripSlots({ tabIds, drag: NO_TAB_STRIP_DRAG, reservedSlot: 2 }), {
      openGap: 2,
      collapsedTabId: null,
      slotCount: 5,
    });
    // 내 탭을 끄는 중이면 그 끌기가 먼저다.
    assert.deepEqual(
      tabStripSlots({ tabIds, drag: dragging(0), reservedSlot: 2 }),
      { openGap: 0, collapsedTabId: 'b', slotCount: 4 },
    );
  });

  it('treats a dragged tab that is no longer in the strip as no drag of its own', () => {
    assert.deepEqual(tabStripSlots({ tabIds, drag: dragging(null, 'gone') }), {
      openGap: null,
      collapsedTabId: null,
      slotCount: 4,
    });
  });
});

describe('app screens that accept a tab drag without acting on it', () => {
  type Listener = (event: FakeEvent) => void;

  class FakeTarget {
    readonly listeners = new Map<string, Array<{ listener: Listener; capture: boolean }>>();

    addEventListener(type: string, listener: Listener, options: { capture: boolean }): void {
      const list = this.listeners.get(type) ?? [];
      list.push({ listener, capture: options.capture });
      this.listeners.set(type, list);
    }

    removeEventListener(type: string, listener: Listener): void {
      this.listeners.set(
        type,
        (this.listeners.get(type) ?? []).filter((entry) => entry.listener !== listener),
      );
    }

    fire(type: string, event: FakeEvent): void {
      for (const { listener } of this.listeners.get(type) ?? []) listener(event);
    }
  }

  class FakeEvent implements TabDragEventLike {
    prevented = false;
    stopped = false;
    readonly dataTransfer: { types: string[]; dropEffect: string } | null;

    constructor(
      types: string[] | null,
      readonly where = 'body',
    ) {
      this.dataTransfer = types ? { types, dropEffect: 'none' } : null;
    }

    preventDefault(): void {
      this.prevented = true;
    }

    stopImmediatePropagation(): void {
      this.stopped = true;
    }
  }

  const TAB = [TAB_DRAG_TYPES.tabId, TAB_DRAG_TYPES.windowId];

  it('answers a tab drag as a move target, before the page sees it', () => {
    const target = new FakeTarget();
    acceptAppTabDrops<FakeEvent>(target, { claim: true });
    // 들어올 때(dragenter)도 답한다: 마우스 밑의 요소가 바뀌는 순간에는 dragover가 오지 않는다.
    assert.deepEqual([...target.listeners.keys()].sort(), ['dragenter', 'dragover', 'drop']);
    assert.ok(
      [...target.listeners.values()].flat().every((entry) => entry.capture),
      'registered for the capture phase',
    );

    for (const type of ['dragenter', 'dragover', 'drop']) {
      const event = new FakeEvent(TAB);
      target.fire(type, event);
      assert.equal(event.prevented, true, type);
      assert.equal(event.dataTransfer?.dropEffect, 'move', type);
      assert.equal(event.stopped, true, `${type} is hidden from the page`);
    }
  });

  it('leaves every other drag to the page', () => {
    const target = new FakeTarget();
    acceptAppTabDrops<FakeEvent>(target, { claim: true });
    for (const types of [['Files'], ['text/plain'], [TAB_DRAG_TYPES.tabId], null]) {
      const event = new FakeEvent(types);
      target.fire('dragenter', event);
      target.fire('dragover', event);
      target.fire('drop', event);
      assert.equal(event.prevented, false, JSON.stringify(types));
      assert.equal(event.stopped, false);
      if (event.dataTransfer) assert.equal(event.dataTransfer.dropEffect, 'none');
    }
  });

  it('skips the part of the document that decides for itself, and can be removed', () => {
    const target = new FakeTarget();
    const remove = acceptAppTabDrops<FakeEvent>(target, {
      skip: (event) => event.where === 'tab-strip',
    });

    const overStrip = new FakeEvent(TAB, 'tab-strip');
    target.fire('dragover', overStrip);
    assert.equal(overStrip.prevented, false);

    const overBackdrop = new FakeEvent(TAB, 'backdrop');
    target.fire('dragover', overBackdrop);
    assert.equal(overBackdrop.prevented, true);
    assert.equal(overBackdrop.stopped, false, 'not claimed unless asked');

    remove();
    const later = new FakeEvent(TAB, 'backdrop');
    target.fire('dragover', later);
    assert.equal(later.prevented, false);
  });
});

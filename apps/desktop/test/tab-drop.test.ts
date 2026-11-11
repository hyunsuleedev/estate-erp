import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detachedTabOrigin } from '../src/common/tabs/tabBarModel';
import {
  SOURCE_TAB_STRIP_MARGIN,
  dropSurfaceAt,
  keepWindowOnScreen,
  planTabDrop,
  releasePointOnScreen,
  type TabDropScene,
} from '../src/main/tabs/tabDrop';

const SOURCE = 1;
const OTHER = 2;
const ORIGIN = detachedTabOrigin('darwin');

/** 끌기를 시작한 창(1)은 (100,100)에, 다른 창(2)은 (1400,200)에 있다. */
function scene(overrides: Partial<TabDropScene> = {}): TabDropScene {
  return {
    sourceContent: { x: 100, y: 100, width: 1200, height: 800 },
    zoomFactor: 1,
    windows: [
      { id: SOURCE, content: { x: 100, y: 100, width: 1200, height: 800 } },
      { id: OTHER, content: { x: 1400, y: 200, width: 900, height: 600 } },
    ],
    stripHeight: 40,
    escapePressed: false,
    ...overrides,
  };
}

/** 화면 좌표의 그 자리에서 손을 뗀 것처럼, 끌기를 시작한 문서 안 좌표로 바꿔 넣는다. */
function releaseAt(
  screenX: number,
  screenY: number,
  accepted: boolean,
  grabOffset = { x: 30, y: 12 },
) {
  return { client: { x: screenX - 100, y: screenY - 100 }, grabOffset, accepted };
}

describe('where a tab was released', () => {
  it('adds the position inside the document to the position of the window', () => {
    assert.deepEqual(releasePointOnScreen(scene(), { x: 250, y: 300 }), { x: 350, y: 400 });
    // 창 밖에서 끝나면 문서 안 좌표가 범위를 벗어난다. 화면 왼쪽·위의 모니터는 음수다.
    assert.deepEqual(releasePointOnScreen(scene(), { x: -900, y: -350 }), { x: -800, y: -250 });
    assert.deepEqual(releasePointOnScreen(scene(), { x: 2000.4, y: 99.6 }), { x: 2100, y: 200 });
  });

  it('scales document coordinates by the zoom of the tab bar document', () => {
    assert.deepEqual(
      releasePointOnScreen(scene({ zoomFactor: 1.25 }), { x: 200, y: 400 }),
      { x: 350, y: 600 },
    );
    // 쓸 수 없는 확대 비율은 1로 본다.
    for (const zoomFactor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.deepEqual(
        releasePointOnScreen(scene({ zoomFactor }), { x: 200, y: 400 }),
        { x: 300, y: 500 },
      );
    }
  });
});

describe('what is under the release point', () => {
  it('tells the tab strip of a window from its body', () => {
    assert.deepEqual(dropSurfaceAt(scene(), SOURCE, { x: 500, y: 120 }), {
      where: 'tab-strip',
      windowId: SOURCE,
    });
    assert.deepEqual(dropSurfaceAt(scene(), SOURCE, { x: 500, y: 400 }), {
      where: 'window-body',
      windowId: SOURCE,
    });
    assert.deepEqual(dropSurfaceAt(scene(), SOURCE, { x: 1600, y: 220 }), {
      where: 'tab-strip',
      windowId: OTHER,
    });
    assert.deepEqual(dropSurfaceAt(scene(), SOURCE, { x: 1600, y: 500 }), {
      where: 'window-body',
      windowId: OTHER,
    });
    assert.deepEqual(dropSurfaceAt(scene(), SOURCE, { x: 2500, y: 1000 }), { where: 'outside' });
    assert.deepEqual(dropSurfaceAt(scene(), SOURCE, { x: 50, y: 50 }), { where: 'outside' });
  });

  it('is generous around the strip of the window the drag started in, and exact elsewhere', () => {
    const below = 100 + 40 + SOURCE_TAB_STRIP_MARGIN - 1;
    assert.equal(dropSurfaceAt(scene(), SOURCE, { x: 500, y: below }).where, 'tab-strip');
    assert.equal(dropSurfaceAt(scene(), SOURCE, { x: 500, y: below + 1 }).where, 'window-body');
    // 창 위쪽 바깥으로 살짝 벗어난 것도 그 창의 탭 줄로 본다.
    assert.equal(dropSurfaceAt(scene(), SOURCE, { x: 500, y: 95 }).where, 'tab-strip');
    assert.equal(dropSurfaceAt(scene(), SOURCE, { x: 500, y: 85 }).where, 'outside');

    // 다른 창의 탭 줄에는 여유가 없다.
    assert.equal(dropSurfaceAt(scene(), SOURCE, { x: 1600, y: 239 }).where, 'tab-strip');
    assert.equal(dropSurfaceAt(scene(), SOURCE, { x: 1600, y: 240 }).where, 'window-body');
    assert.equal(dropSurfaceAt(scene(), SOURCE, { x: 1600, y: 199 }).where, 'outside');
    // 그 창에서 끌기를 시작했다면 그 창에 여유가 생긴다.
    assert.equal(dropSurfaceAt(scene(), OTHER, { x: 1600, y: 245 }).where, 'tab-strip');
  });

  it('lets the window in front hide what is behind it', () => {
    // 창 2가 창 1의 탭 줄 위를 덮고 있다.
    const overlapping = (front: number) => {
      const windows = [
        { id: SOURCE, content: { x: 100, y: 100, width: 1200, height: 800 } },
        { id: OTHER, content: { x: 300, y: 50, width: 600, height: 400 } },
      ];
      return scene({
        windows: front === OTHER ? [windows[1], windows[0]] : windows,
      });
    };
    const point = { x: 500, y: 200 };
    // 앞에 있는 창 2의 본문이다.
    assert.deepEqual(dropSurfaceAt(overlapping(OTHER), SOURCE, point), {
      where: 'window-body',
      windowId: OTHER,
    });
    // 창 1이 앞이면 창 1의 본문이다(탭 줄보다 아래).
    assert.deepEqual(dropSurfaceAt(overlapping(SOURCE), SOURCE, point), {
      where: 'window-body',
      windowId: SOURCE,
    });
    // 창 1의 탭 줄 높이지만 앞 창이 덮은 자리.
    assert.deepEqual(dropSurfaceAt(overlapping(OTHER), SOURCE, { x: 500, y: 120 }), {
      where: 'window-body',
      windowId: OTHER,
    });
    assert.deepEqual(dropSurfaceAt(overlapping(SOURCE), SOURCE, { x: 500, y: 120 }), {
      where: 'tab-strip',
      windowId: SOURCE,
    });
  });
});

describe('what to do with a tab released outside the tab strip', () => {
  it('puts a new window where the tab sits under the pointer', () => {
    const plan = planTabDrop(scene(), SOURCE, releaseAt(600, 500, true), ORIGIN);
    assert.equal(plan.kind, 'place');
    assert.deepEqual(plan.point, { x: 600, y: 500 });
    // 창의 왼쪽 위 = 손을 뗀 자리 − (새 창에서 탭이 놓이는 자리 + 탭 안에서 잡은 자리).
    assert.deepEqual(plan.kind === 'place' && plan.position, {
      x: 600 - (ORIGIN.x + 30),
      y: 500 - (ORIGIN.y + 12),
    });
  });

  it('scales the tab origin and the grab offset by the zoom', () => {
    const zoomed = scene({ zoomFactor: 1.5 });
    const plan = planTabDrop(
      zoomed,
      SOURCE,
      { client: { x: 400, y: 300 }, grabOffset: { x: 20, y: 10 }, accepted: true },
      ORIGIN,
    );
    assert.deepEqual(plan.point, { x: 700, y: 550 });
    assert.deepEqual(plan.kind === 'place' && plan.position, {
      x: Math.round(700 - (ORIGIN.x + 20) * 1.5),
      y: Math.round(550 - (ORIGIN.y + 10) * 1.5),
    });
  });

  it('does nothing over the tab strip of any app window', () => {
    // 끌기를 시작한 창의 탭 줄(탭 줄이 받지 않는 자리이거나, 살짝 벗어난 자리).
    assert.deepEqual(planTabDrop(scene(), SOURCE, releaseAt(200, 120, false), ORIGIN), {
      kind: 'refuse',
      point: { x: 200, y: 120 },
      reason: 'tab-strip',
    });
    assert.equal(
      planTabDrop(scene(), SOURCE, releaseAt(600, 145, true), ORIGIN).kind,
      'refuse',
      'just below the strip of the source window, over a tab view that accepted the drop',
    );
    // 다른 창의 탭 줄: 그 탭 줄이 받아 옮겼거나 받지 않았다. 어느 쪽이든 새 창은 없다.
    for (const accepted of [true, false]) {
      assert.deepEqual(planTabDrop(scene(), SOURCE, releaseAt(1600, 220, accepted), ORIGIN), {
        kind: 'refuse',
        point: { x: 1600, y: 220 },
        reason: 'tab-strip',
      });
    }
  });

  it('opens a window for a release over the body of any app window', () => {
    for (const [x, y] of [
      [600, 500],
      [1600, 500],
    ]) {
      assert.equal(planTabDrop(scene(), SOURCE, releaseAt(x, y, true), ORIGIN).kind, 'place');
    }
  });

  it('treats an unaccepted end over an app window as a cancelled drag', () => {
    // 앱 창의 본문은 놓기를 받는다. 받은 곳이 없이 그 위에서 끝났다면 Escape다.
    for (const [x, y] of [
      [600, 500],
      [1600, 500],
    ]) {
      assert.deepEqual(planTabDrop(scene(), SOURCE, releaseAt(x, y, false), ORIGIN), {
        kind: 'refuse',
        point: { x, y },
        reason: 'cancelled',
      });
    }
  });

  it('opens a window for a release outside every app window', () => {
    const plan = planTabDrop(scene(), SOURCE, releaseAt(2600, 900, false), ORIGIN);
    assert.equal(plan.kind, 'place');
    assert.deepEqual(plan.point, { x: 2600, y: 900 });
    // 왼쪽 모니터(음수 좌표)도 마찬가지다.
    assert.equal(
      planTabDrop(scene(), SOURCE, releaseAt(-700, 300, false), ORIGIN).kind,
      'place',
    );
  });

  it('takes an Escape seen during the drag as a cancel when nothing else tells', () => {
    const escaped = scene({ escapePressed: true });
    assert.deepEqual(planTabDrop(escaped, SOURCE, releaseAt(2600, 900, false), ORIGIN), {
      kind: 'refuse',
      point: { x: 2600, y: 900 },
      reason: 'escape',
    });
    // 받은 곳이 있으면 손을 뗀 것이다. 그 전에 누른 Escape와 상관없다.
    assert.equal(
      planTabDrop(escaped, SOURCE, releaseAt(600, 500, true), ORIGIN).kind,
      'place',
    );
  });

  it('ignores windows that are not shown when deciding', () => {
    // 창 2가 숨겨져 있으면(host가 목록에서 뺀다) 그 자리는 앱 밖이다.
    const onlySource = scene({ windows: scene().windows.slice(0, 1) });
    assert.equal(
      planTabDrop(onlySource, SOURCE, releaseAt(1600, 220, false), ORIGIN).kind,
      'place',
    );
  });
});

describe('keeping a placed window on the screen', () => {
  // 메뉴 막대와 Dock을 뺀 쓸 수 있는 영역: (0,33)부터 1728×1026.
  const workArea = { x: 0, y: 33, width: 1728, height: 1026 };

  it('leaves the window under the pointer when all of it fits there', () => {
    const size = { width: 900, height: 600 };
    assert.deepEqual(keepWindowOnScreen({ x: 300, y: 200 }, size, workArea), { x: 300, y: 200 });
    assert.deepEqual(keepWindowOnScreen({ x: 828, y: 459 }, size, workArea), { x: 828, y: 459 });
  });

  it('moves a window that would hang off the screen to the nearest place where all of it shows', () => {
    // 원래 창과 같은 크기(1440×900)의 새 창을 화면 가운데쯤에 놓았다: 오른쪽·아래가 넘친다.
    const size = { width: 1440, height: 900 };
    assert.deepEqual(keepWindowOnScreen({ x: 682, y: 540 }, size, workArea), {
      x: 1728 - 1440,
      y: 33 + 1026 - 900,
    });
    // 넘치지 않는 쪽은 그대로 둔다.
    assert.deepEqual(keepWindowOnScreen({ x: 100, y: 540 }, size, workArea), { x: 100, y: 159 });
    assert.deepEqual(keepWindowOnScreen({ x: 682, y: 60 }, size, workArea), { x: 288, y: 60 });
    // 왼쪽·위로 넘치는 자리(탭을 화면 왼쪽 위 모서리에 놓았다).
    assert.deepEqual(keepWindowOnScreen({ x: -150, y: 10 }, size, workArea), { x: 0, y: 33 });
  });

  it('aligns the top left of a window larger than the screen so its tab strip shows', () => {
    assert.deepEqual(
      keepWindowOnScreen({ x: 400, y: 300 }, { width: 2000, height: 1200 }, workArea),
      { x: 0, y: 33 },
    );
  });

  it('works on a screen left of or above the primary one', () => {
    const left = { x: -1920, y: 0, width: 1920, height: 1080 };
    const size = { width: 1200, height: 800 };
    assert.deepEqual(keepWindowOnScreen({ x: -1500, y: 200 }, size, left), { x: -1500, y: 200 });
    assert.deepEqual(keepWindowOnScreen({ x: -400, y: 500 }, size, left), { x: -1200, y: 280 });
    assert.deepEqual(keepWindowOnScreen({ x: -4000, y: 300 }, size, left), { x: -1920, y: 280 });
  });
});

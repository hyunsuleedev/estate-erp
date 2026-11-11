/**
 * 탭을 탭 줄 밖에 놓았을 때 무엇을 할지 정한다. Electron에 의존하지 않는 순수 함수다.
 * 창들의 자리는 host(WindowManager)가 알려 준다.
 *
 * 놓은 자리(화면 좌표)는 "끌기가 끝난 문서 안 좌표 + 끌기를 시작한 창의 자리"로 구한다
 * (Notion과 같은 방법). 다른 두 값을 쓰지 않는 이유:
 * - 지금 마우스 위치(screen.getCursorScreenPoint)는 손을 뗀 자리가 아니다. macOS는 받는
 *   곳 없이 끝난 끌기의 그림을 제자리로 되돌린 뒤에야 끝을 알리므로, 그사이 마우스가
 *   움직였을 수 있다.
 * - 끌기 이벤트의 화면 좌표(screenX/Y)는 Chromium이 OS의 화면 좌표를 바꿔서 주는 값이다.
 *   문서 안 좌표는 그 창 안에서의 자리라 모니터 배치와 상관이 없고, 창의 자리는 Electron이
 *   주는 값을 그대로 쓴다.
 * 세 값이 실제로 얼마나 다른지는 개발 실행의 기록(`[tabs] drop outside`)으로 볼 수 있다.
 */

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TabDropScene {
  /** 끌기를 시작한 창의 안쪽(탭바 문서가 차지한 자리). 화면 좌표. */
  sourceContent: ScreenRect;
  /** 탭바 문서의 확대 비율. 문서 좌표에 곱하면 화면 단위가 된다. */
  zoomFactor: number;
  /** 보이는 앱 창들의 안쪽 자리. 가장 최근에 앞에 있던 창부터(앞에 있는 창이 먼저 가린다). */
  windows: ReadonlyArray<{ id: number; content: ScreenRect }>;
  /** 탭 줄의 높이(화면 단위). 창 안쪽의 맨 위에 있다. */
  stripHeight: number;
  /** 방금 Escape를 누른 흔적이 있는지. 끌기를 취소한 것일 수 있다. */
  escapePressed: boolean;
}

export interface TabDropRelease {
  /** 끌기가 끝난 자리. 끌기를 시작한 탭바 문서 안의 좌표. */
  client: ScreenPoint;
  /** 탭 안에서 잡은 자리(탭의 왼쪽 위 모서리부터). 문서 좌표. */
  grabOffset: ScreenPoint;
  /** 앱의 화면이 그 끌기를 받았는지. 받은 곳이 없으면 취소했거나 앱 밖에 놓은 것이다. */
  accepted: boolean;
}

export type TabDropPlan =
  | {
      kind: 'place';
      /** 손을 뗀 자리. */
      point: ScreenPoint;
      /** 탭이 마우스 밑에 오도록 창을 놓을 자리(창의 왼쪽 위 모서리). */
      position: ScreenPoint;
    }
  | {
      kind: 'refuse';
      point: ScreenPoint;
      /**
       * tab-strip: 어느 창의 탭 줄 위에 놓았다(그 탭 줄이 받았거나, 받을 수 없는 자리다).
       * cancelled: 받은 곳이 없는데 앱 창 위다. 그 자리의 앱 화면은 놓기를 받으므로,
       *            받은 곳이 없다는 것은 취소했다는 뜻이다.
       * escape: 앱 밖인데 방금 Escape를 눌렀다.
       */
      reason: 'tab-strip' | 'cancelled' | 'escape';
    };

/** 끌기를 시작한 창의 탭 줄은 이만큼 넉넉하게 본다(순서만 바꾸려다 살짝 벗어난 경우). */
export const SOURCE_TAB_STRIP_MARGIN = 10;

/** 문서 안 좌표를 화면 좌표로. */
export function releasePointOnScreen(
  scene: Pick<TabDropScene, 'sourceContent' | 'zoomFactor'>,
  client: ScreenPoint,
): ScreenPoint {
  const zoom = usableZoom(scene.zoomFactor);
  return {
    x: Math.round(scene.sourceContent.x + client.x * zoom),
    y: Math.round(scene.sourceContent.y + client.y * zoom),
  };
}

export type DropSurface =
  | { where: 'tab-strip'; windowId: number }
  | { where: 'window-body'; windowId: number }
  | { where: 'outside' };

/**
 * 그 자리가 어느 창의 어디인지. 앞에 있는 창부터 본다: 앞 창의 본문이 뒤 창의 탭 줄을
 * 가리고 있으면 본문이다.
 */
export function dropSurfaceAt(
  scene: Pick<TabDropScene, 'windows' | 'stripHeight'>,
  sourceWindowId: number,
  point: ScreenPoint,
): DropSurface {
  for (const window of scene.windows) {
    const strip = { ...window.content, height: scene.stripHeight };
    const margin = window.id === sourceWindowId ? SOURCE_TAB_STRIP_MARGIN : 0;
    if (contains(strip, point, margin)) return { where: 'tab-strip', windowId: window.id };
    if (contains(window.content, point, 0)) {
      return { where: 'window-body', windowId: window.id };
    }
  }
  return { where: 'outside' };
}

export function planTabDrop(
  scene: TabDropScene,
  sourceWindowId: number,
  release: TabDropRelease,
  /** 새 창의 탭 줄에서 탭이 놓일 자리(문서 좌표). */
  tabOrigin: ScreenPoint,
): TabDropPlan {
  const point = releasePointOnScreen(scene, release.client);
  const surface = dropSurfaceAt(scene, sourceWindowId, point);
  if (surface.where === 'tab-strip') return { kind: 'refuse', point, reason: 'tab-strip' };
  if (!release.accepted) {
    if (surface.where === 'window-body') return { kind: 'refuse', point, reason: 'cancelled' };
    if (scene.escapePressed) return { kind: 'refuse', point, reason: 'escape' };
  }
  const zoom = usableZoom(scene.zoomFactor);
  return {
    kind: 'place',
    point,
    position: {
      x: Math.round(point.x - (tabOrigin.x + release.grabOffset.x) * zoom),
      y: Math.round(point.y - (tabOrigin.y + release.grabOffset.y) * zoom),
    },
  };
}

/**
 * 창이 화면 밖으로 걸치지 않게 자리를 다듬는다. 탭이 마우스 밑에 오는 자리가 화면에 다
 * 들어오면 그대로 두고, 아니면 창 전체가 보이는 가장 가까운 자리로 옮긴다(탭을 놓은
 * 화면의 쓸 수 있는 영역 기준). 창이 그 영역보다 크면 왼쪽 위를 맞춘다: 탭 줄이 보인다.
 *
 * 화면에 걸친 채로 두지 않는 이유: 새 창은 원래 창과 같은 크기라, 화면을 넓게 쓰는 창에서
 * 탭을 놓으면 대부분의 자리에서 창의 절반 가까이가 화면 밖에 놓인다. macOS도 화면에 다
 * 들어오지 않는 창을 처음 보여 줄 때 같은 식으로 화면 안에 끌어다 놓는다.
 */
export function keepWindowOnScreen(
  position: ScreenPoint,
  size: { width: number; height: number },
  workArea: ScreenRect,
): ScreenPoint {
  const fit = (value: number, start: number, extent: number, length: number) =>
    Math.round(Math.max(start, Math.min(value, Math.max(start, start + extent - length))));
  return {
    x: fit(position.x, workArea.x, workArea.width, size.width),
    y: fit(position.y, workArea.y, workArea.height, size.height),
  };
}

function usableZoom(zoomFactor: number): number {
  return Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1;
}

function contains(rect: ScreenRect, point: ScreenPoint, margin: number): boolean {
  return (
    point.x >= rect.x - margin &&
    point.x < rect.x + rect.width + margin &&
    point.y >= rect.y - margin &&
    point.y < rect.y + rect.height + margin
  );
}

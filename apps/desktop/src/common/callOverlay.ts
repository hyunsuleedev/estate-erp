/**
 * 전화 수신 팝업 층(call overlay)과 창 알림 전달 계약.
 *
 * 모든 화면이 탭 화면(WebContentsView)이 된 뒤로 셸 창이 그리는 것은 탭 화면
 * 아래에 가려진다. 그래서 전화 팝업은 탭 화면 위의 작은 층에서 그리고, 셸이
 * 띄우던 알림(toast)은 보이는 탭 화면에서 대신 띄운다. 통화 상태의 주인은
 * 지금처럼 셸의 CtiProvider다.
 */

export type CallOverlayAction =
  | { type: 'dismiss' }
  | { type: 'refresh-lookup' }
  | { type: 'patch-call-log'; patch: Record<string, unknown> }
  /** 팝업 안 링크: 셸 창에서 그 화면을 연다. */
  | { type: 'open-route'; route: string };

export interface CallOverlaySize {
  width: number;
  height: number;
}

export type WindowToastLevel = 'success' | 'info' | 'warning' | 'error';

export interface WindowToast {
  level: WindowToastLevel;
  message: string;
  description?: string;
}

const MAX_ROUTE_LENGTH = 4_096;
const MAX_TEXT_LENGTH = 1_000;
const MAX_STATE_JSON_LENGTH = 512_000;
const TOAST_LEVELS = new Set<WindowToastLevel>(['success', 'info', 'warning', 'error']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_TEXT_LENGTH;
}

/** 통화 상태는 API 응답(JSON)으로 만든 값이다. 크기와 JSON 직렬화 가능 여부만 본다. */
export function isCallOverlayState(value: unknown): boolean {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  try {
    return JSON.stringify(value).length <= MAX_STATE_JSON_LENGTH;
  } catch {
    return false;
  }
}

export function parseCallOverlayAction(value: unknown): CallOverlayAction | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  switch (value.type) {
    case 'dismiss':
      return { type: 'dismiss' };
    case 'refresh-lookup':
      return { type: 'refresh-lookup' };
    case 'patch-call-log': {
      if (!isRecord(value.patch)) return null;
      try {
        if (JSON.stringify(value.patch).length > MAX_STATE_JSON_LENGTH) return null;
      } catch {
        return null;
      }
      return { type: 'patch-call-log', patch: value.patch };
    }
    case 'open-route':
      return typeof value.route === 'string' &&
        value.route.startsWith('/') &&
        !value.route.startsWith('//') &&
        value.route.length <= MAX_ROUTE_LENGTH
        ? { type: 'open-route', route: value.route }
        : null;
    default:
      return null;
  }
}

/** 팝업 층 크기. 창보다 커질 수 없고 너무 작아도 그림자가 잘리므로 범위를 둔다. */
export function parseCallOverlaySize(value: unknown): CallOverlaySize | null {
  if (!isRecord(value)) return null;
  const { width, height } = value;
  if (
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1 ||
    width > 4_000 ||
    height > 4_000
  ) {
    return null;
  }
  return { width: Math.ceil(width), height: Math.ceil(height) };
}

/** 창 오른쪽 아래에 붙인다. 창이 작으면 왼쪽·위쪽이 창 밖으로 나가지 않게 줄인다. */
export function placeCallOverlay(
  content: { width: number; height: number },
  size: CallOverlaySize,
  titlebarHeight: number,
): { x: number; y: number; width: number; height: number } {
  const width = Math.min(size.width, Math.max(0, content.width));
  const height = Math.min(size.height, Math.max(0, content.height - titlebarHeight));
  return {
    x: Math.max(0, content.width - width),
    y: Math.max(titlebarHeight, content.height - height),
    width,
    height,
  };
}

export function parseWindowToast(value: unknown): WindowToast | null {
  if (!isRecord(value) || !TOAST_LEVELS.has(value.level as WindowToastLevel)) {
    return null;
  }
  if (!isText(value.message)) return null;
  if (value.description !== undefined && !isText(value.description)) return null;
  return {
    level: value.level as WindowToastLevel,
    message: value.message,
    ...(value.description !== undefined ? { description: value.description } : {}),
  };
}

/** 팝업 층이 창 아래쪽을 차지한 높이. 0이면 팝업이 없다. */
export interface CallOverlayInset {
  bottom: number;
}

/** sonner 기본 여백(24px). */
const DEFAULT_TOAST_OFFSET = 24;
/** 팝업 층 위쪽의 그림자 여백(24px)을 빼고 카드 위로 12px 띄운다. */
const TOAST_GAP_ABOVE_POPUP = 12;
const POPUP_SHADOW_ROOM = 24;

/**
 * 알림(toast)은 창 오른쪽 아래에 뜨는데 전화 팝업도 같은 자리에 있다.
 * 팝업이 떠 있는 동안은 알림을 팝업 카드 위로 올려 가려지지 않게 한다.
 */
export function toastBottomOffset(inset: CallOverlayInset): number {
  if (!(inset.bottom > 0)) return DEFAULT_TOAST_OFFSET;
  return Math.max(
    DEFAULT_TOAST_OFFSET,
    inset.bottom - POPUP_SHADOW_ROOM + TOAST_GAP_ABOVE_POPUP,
  );
}

import type { TabId } from '@estate-erp/shared';

/**
 * 탭을 끌어 옮기는 동작(브라우저의 기본 끌어 놓기)에서 탭바 화면이 쓰는 규칙.
 * React·Electron에 의존하지 않는 순수 함수다.
 *
 * 끄는 동안에는 아무것도 옮기지 않는다. 탭의 그림이 마우스를 따라가고, 탭 줄에는 그 탭이
 * 들어갈 빈 칸이 열린다. 손을 뗀 자리가 탭 줄이면 순서를 바꾸고(같은 창) 그 창으로
 * 옮기며(다른 창), 그 밖이면 새 창으로 옮긴다. 옮기는 일은 모두 main이 한다.
 */

/**
 * 끌기에 실어 보내는 값의 이름. 다른 창의 탭 줄은 두 값이 모두 실린 끌기만 받는다.
 * 글자·주소 형식은 싣지 않는다: 입력 칸에 글자가 들어가거나 화면이 주소를 열면 안 된다.
 */
export const TAB_DRAG_TYPES = {
  tabId: 'application/x-estaitflow-tab',
  windowId: 'application/x-estaitflow-tab-window',
} as const;

/**
 * 끌기 하나를 가리키는 표시의 이름. 끄는 동안에는 실린 값을 읽을 수 없고 이름만 보이므로,
 * 탭 줄은 이 이름으로 "내가 시작한 끌기"와 "다른 창에서 온 끌기"를 가린다.
 * 브라우저가 이름을 소문자로 바꾸므로 표시는 소문자·숫자·줄표만 쓴다.
 */
export function tabDragMarkerType(marker: string): string {
  return `application/x-estaitflow-drag-${marker.toLowerCase().replace(/[^a-z0-9-]/g, '')}`;
}

export function carriesTabDragMarker(
  types: ArrayLike<string> | null | undefined,
  marker: string,
): boolean {
  if (!types) return false;
  const wanted = tabDragMarkerType(marker);
  for (let index = 0; index < types.length; index += 1) {
    if (types[index] === wanted) return true;
  }
  return false;
}

/** 앱의 탭을 끄는 중인지. 앱 밖에서 온 끌기(파일, 글자, 링크)는 아니다. */
export function isAppTabDrag(types: ArrayLike<string> | null | undefined): boolean {
  if (!types) return false;
  let hasTab = false;
  let hasWindow = false;
  for (let index = 0; index < types.length; index += 1) {
    if (types[index] === TAB_DRAG_TYPES.tabId) hasTab = true;
    else if (types[index] === TAB_DRAG_TYPES.windowId) hasWindow = true;
  }
  return hasTab && hasWindow;
}

export interface DraggedTab {
  tabId: TabId;
  sourceWindowId: number;
}

/** 놓인 끌기에서 탭과 그 탭이 있던 창을 읽는다. 모양이 다르면 null이다. */
export function readDraggedTab(
  getData: (type: string) => string,
): DraggedTab | null {
  const tabId = getData(TAB_DRAG_TYPES.tabId);
  const rawWindowId = getData(TAB_DRAG_TYPES.windowId);
  if (!tabId || !/^\d{1,15}$/.test(rawWindowId)) return null;
  const sourceWindowId = Number(rawWindowId);
  return sourceWindowId > 0 ? { tabId, sourceWindowId } : null;
}

/** 탭 한 칸의 폭. 탭 줄의 폭을 칸 수로 고르게 나누되 정해진 범위 안에 둔다. */
export function tabSlotWidth(
  available: number,
  slotCount: number,
  limits: { min: number; max: number },
): number {
  if (slotCount <= 0 || !Number.isFinite(available)) return limits.max;
  return Math.max(limits.min, Math.min(limits.max, available / slotCount));
}

/**
 * 마우스가 있는 칸(0부터). 칸은 탭 줄의 왼쪽 끝부터 같은 폭으로 늘어서 있다고 본다.
 * 끄는 동안 다른 탭이 자리를 비켜 주며 움직이므로, 지금 그려진 탭의 자리가 아니라
 * 움직이지 않는 칸으로 따진다(그래야 경계에서 왔다 갔다 하지 않는다).
 */
export function tabSlotAt(
  pointerX: number,
  listLeft: number,
  slotWidth: number,
  slotCount: number,
): number {
  if (slotCount <= 1 || slotWidth <= 0) return 0;
  const slot = Math.floor((pointerX - listLeft) / slotWidth);
  if (!Number.isFinite(slot)) return 0;
  return Math.max(0, Math.min(slot, slotCount - 1));
}

/** 끄는 동안 탭 줄이 기억하는 것. */
export interface TabStripDrag {
  /** 이 탭 줄에서 끌고 있는 탭. 다른 창에서 끌려 온 탭이면 null이다. */
  draggedTabId: TabId | null;
  /**
   * 마우스가 있는 칸. 탭 줄 밖이면 null이다: 내 탭이면 빈 칸이 원래 자리로 돌아가고,
   * 다른 창의 탭이면 벌려 둔 자리를 닫는다.
   */
  slot: number | null;
  /** 칸이 열리고 닫히는 것을 움직임으로 보여 줄지. 끌기의 시작과 끝은 바로 바꾼다. */
  animate: boolean;
}

export const NO_TAB_STRIP_DRAG: TabStripDrag = {
  draggedTabId: null,
  slot: null,
  animate: false,
};

export interface TabStripSlots {
  /**
   * 빈 칸을 열 자리. i는 i번째 탭의 바로 앞이고, 탭 수와 같으면 맨 끝이다.
   * 빈 칸이 없으면 null이다.
   */
  openGap: number | null;
  /** 자리를 차지하지 않게 접어 둘 탭(끌고 있는 탭). 그 탭의 자리는 빈 칸이 대신한다. */
  collapsedTabId: TabId | null;
  /** 탭 줄이 나눠 갖는 칸의 수(탭 + 빈 칸 − 접힌 탭). */
  slotCount: number;
}

/**
 * 탭 줄에 그릴 빈 칸의 자리.
 *
 * - 이 줄의 탭을 끄는 중: 그 탭은 접고, 마우스가 있는 칸에 빈 칸을 연다. 칸 번호는
 *   끌린 탭을 뺀 나머지 탭들 사이에서의 자리이고, 놓으면 그 탭의 새 자리가 된다.
 *   마우스가 탭 줄 밖이면 빈 칸은 그 탭의 원래 자리에 있다.
 * - 다른 창의 탭이 들어와 있음: 마우스가 있는 칸에 빈 칸을 하나 더 연다.
 * - 놓은 탭을 main이 넣어 주기를 기다리는 중(reservedSlot): 그 칸을 열어 둔다.
 */
export function tabStripSlots(input: {
  tabIds: readonly TabId[];
  drag: TabStripDrag;
  reservedSlot?: number | null;
}): TabStripSlots {
  const { tabIds, drag } = input;
  const count = tabIds.length;
  const from = drag.draggedTabId === null ? -1 : tabIds.indexOf(drag.draggedTabId);

  if (from >= 0) {
    const slot = clampSlot(drag.slot ?? from, count - 1);
    return {
      // 끌린 탭 앞의 칸은 그대로, 뒤의 칸은 접힌 탭을 건너뛴 자리다.
      openGap: slot < from ? slot : slot + 1,
      collapsedTabId: tabIds[from],
      slotCount: count,
    };
  }

  const incoming = drag.draggedTabId === null ? drag.slot : null;
  const slot = incoming ?? input.reservedSlot ?? null;
  if (slot === null) return { openGap: null, collapsedTabId: null, slotCount: count };
  return { openGap: clampSlot(slot, count), collapsedTabId: null, slotCount: count + 1 };
}

function clampSlot(slot: number, max: number): number {
  if (!Number.isFinite(slot)) return 0;
  return Math.max(0, Math.min(Math.trunc(slot), Math.max(0, max)));
}

/** 끌기 이벤트에서 이 모듈이 쓰는 부분. DOM의 DragEvent가 이 모양이다. */
export interface TabDragEventLike {
  dataTransfer: { types: ArrayLike<string>; dropEffect: string } | null;
  preventDefault(): void;
  stopImmediatePropagation(): void;
}

export interface TabDropTargetLike<E extends TabDragEventLike> {
  addEventListener(
    type: 'dragenter' | 'dragover' | 'drop',
    listener: (event: E) => void,
    options: { capture: boolean },
  ): void;
  removeEventListener(
    type: 'dragenter' | 'dragover' | 'drop',
    listener: (event: E) => void,
    options: { capture: boolean },
  ): void;
}

/**
 * 탭 줄이 아닌 앱 화면(탭 화면, 전화 팝업 층, 탭바 문서의 바탕)이 탭 끌기를 "받는 자리"로
 * 답하게 한다. 받기만 하고 아무것도 하지 않는다: 탭을 새 창으로 옮기는 요청은 끌기를
 * 시작한 탭 줄이 끝날 때 보낸다.
 *
 * 받는 자리로 답하는 이유는 두 가지다.
 * - 끌기를 시작한 탭 줄이 "앱 화면 위에서 손을 뗐다"와 "Escape로 취소했다"를 구별할 수
 *   있다(받은 곳이 없으면 취소로 본다).
 * - macOS는 받는 곳 없이 끝난 끌기의 그림을 제자리로 되돌리는 움직임을 보여 준 뒤에야
 *   끝났다고 알린다. 받는 곳이 있으면 그 기다림이 없다.
 *
 * `claim`이 참이면 그 이벤트를 화면의 다른 코드가 보지 못하게 한다(앱 화면의 파일 놓기
 * 자리 등이 탭 끌기에 반응하지 않게). `skip`이 참을 돌려준 이벤트는 건드리지 않는다.
 *
 * 들어올 때(dragenter)도 같이 답한다. 마우스 밑의 요소가 바뀌는 순간에는 브라우저가
 * dragover 없이 dragenter만 보내고 그 답으로 받을지 정하므로, 그 순간에 손을 떼도
 * 받은 것이 되게 한다.
 */
export function acceptAppTabDrops<E extends TabDragEventLike>(
  target: TabDropTargetLike<E>,
  options: { claim?: boolean; skip?: (event: E) => boolean } = {},
): () => void {
  const accept = (event: E) => {
    const transfer = event.dataTransfer;
    if (!transfer || !isAppTabDrag(transfer.types)) return;
    if (options.skip?.(event)) return;
    event.preventDefault();
    transfer.dropEffect = 'move';
    if (options.claim) event.stopImmediatePropagation();
  };
  const capture = { capture: true };
  const types = ['dragenter', 'dragover', 'drop'] as const;
  for (const type of types) target.addEventListener(type, accept, capture);
  return () => {
    for (const type of types) target.removeEventListener(type, accept, capture);
  };
}

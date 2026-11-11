import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type MouseEvent,
  type RefObject,
} from 'react';
import type { TabBarAction } from '../../../../common/tabs/tabBarContract';
import {
  NO_TAB_STRIP_DRAG,
  TAB_DRAG_TYPES,
  carriesTabDragMarker,
  isAppTabDrag,
  readDraggedTab,
  tabDragMarkerType,
  tabSlotAt,
  tabSlotWidth,
  tabStripSlots,
  type TabStripDrag,
  type TabStripSlots,
} from '../../../../common/tabs/tabDrag';

interface Options {
  tabIds: readonly string[];
  /** 이 창의 id. 끌기에 실어 보내 다른 창의 탭 줄이 어느 창의 탭인지 알게 한다. */
  windowId: number;
  /** 다른 창의 탭을 놓고 탭 목록의 주인이 넣어 주기를 기다리는 칸. */
  reservedSlot: number | null;
  /** 탭을 다른 창으로 옮길 수 있는지(창이 여럿인 Electron에서만). 순서 바꾸기는 늘 된다. */
  detachable: boolean;
  dispatch: (action: TabBarAction) => void;
  /** 탭들이 늘어선 요소. 왼쪽 끝이 첫 칸의 시작이다. */
  listRef: RefObject<HTMLElement | null>;
  /** 탭 줄이 보이는 폭을 정하는 요소(탭이 넘치면 이 안에서 가로로 넘긴다). */
  viewportRef: RefObject<HTMLElement | null>;
  /** 탭 뒤에 붙는 새 탭 버튼 칸의 폭. */
  trailingWidth: number;
  slotLimits: { min: number; max: number };
}

interface OwnDrag {
  tabId: string;
  /** 이 끌기에 실어 둔 표시. 탭 줄 위를 지나는 끌기가 이 끌기인지 가린다. */
  marker: string;
  /** 탭 안에서 잡은 자리. 새 창이 생길 때 탭이 마우스 밑에 오게 한다. */
  grabOffset: { x: number; y: number };
}

let markerCount = 0;
/** 끌기마다 다른 표시. 문서가 다시 떠도 겹치지 않게 시각을 섞는다. */
function nextMarker(): string {
  markerCount += 1;
  return `${Date.now().toString(36)}-${markerCount.toString(36)}`;
}

export interface TabDragBindings {
  /** 탭 줄에 그릴 빈 칸과 접어 둘 탭. */
  slots: TabStripSlots;
  /** 빈 칸이 열리고 닫히는 것을 움직임으로 보여 줄지. */
  animate: boolean;
  tabProps(tabId: string): {
    draggable: true;
    onMouseDown(event: MouseEvent<HTMLElement>): void;
    onDragStart(event: DragEvent<HTMLElement>): void;
    onDragEnd(event: DragEvent<HTMLElement>): void;
  };
  stripProps: {
    onPointerMove(): void;
    onDragEnter(event: DragEvent<HTMLElement>): void;
    onDragOver(event: DragEvent<HTMLElement>): void;
    onDragLeave(event: DragEvent<HTMLElement>): void;
    onDrop(event: DragEvent<HTMLElement>): void;
  };
}

/**
 * 탭을 끌어 옮기기(브라우저의 기본 끌어 놓기).
 *
 * 끄는 동안에는 아무것도 옮기지 않는다. 탭의 그림이 마우스를 따라가고, 탭 줄에는 그 탭이
 * 들어갈 빈 칸이 열린다. 손을 뗐을 때:
 * - 이 탭 줄 위: 순서를 바꾼다.
 * - 다른 창의 탭 줄 위: 그 탭 줄이 main에 "이 탭을 이 창으로"를 보낸다.
 * - 그 밖: 이 탭 줄이 main에 끝난 자리를 보낸다. 새 창으로 옮길지는 main이 정한다.
 * 앱 밖에서 온 끌기(파일, 글자)는 받지 않는다.
 */
export function useTabDrag(options: Options): TabDragBindings {
  const [drag, setDrag] = useState<TabStripDrag>(NO_TAB_STRIP_DRAG);
  const own = useRef<OwnDrag | null>(null);
  /** 마우스를 누른 요소. 끌기 시작 이벤트는 탭에서 나므로, 어디를 잡았는지는 여기서 안다. */
  const pressed = useRef<EventTarget | null>(null);
  const pendingFrame = useRef<number | null>(null);

  const clearFrame = () => {
    if (pendingFrame.current === null) return;
    cancelAnimationFrame(pendingFrame.current);
    pendingFrame.current = null;
  };

  // 끌던 탭이 그사이 사라졌으면(닫혔거나 다른 창으로 갔다) 끌기 끝 이벤트가 오지 않는다.
  const draggedTabGone =
    drag.draggedTabId !== null && !options.tabIds.includes(drag.draggedTabId);
  useEffect(() => {
    if (!draggedTabGone) return;
    own.current = null;
    setDrag(NO_TAB_STRIP_DRAG);
  }, [draggedTabGone]);

  useEffect(() => clearFrame, []);

  /**
   * 탭 줄 위를 지나는 끌기가 이 탭 줄에서 시작한 끌기면 그것. 표시가 다르면 다른 창에서 온
   * 끌기다(이 탭 줄의 예전 끌기가 끝났다는 이벤트를 받지 못하고 남아 있더라도). 끌던 탭이
   * 사라졌으면 그 끌기는 없는 것으로 본다.
   */
  const ownDrag = (types: ArrayLike<string>): OwnDrag | null => {
    const current = own.current;
    if (!current) return null;
    if (!options.tabIds.includes(current.tabId)) {
      own.current = null;
      return null;
    }
    return carriesTabDragMarker(types, current.marker) ? current : null;
  };

  const slotAt = (clientX: number, incoming: boolean): number => {
    const { tabIds, listRef, viewportRef, trailingWidth, slotLimits } = options;
    const list = listRef.current;
    const viewport = viewportRef.current;
    if (!list || !viewport) return 0;
    // 다른 창에서 온 탭은 칸을 하나 더 차지한다.
    const slotCount = tabIds.length + (incoming ? 1 : 0);
    const width = tabSlotWidth(viewport.clientWidth - trailingWidth, slotCount, slotLimits);
    return tabSlotAt(clientX, list.getBoundingClientRect().left, width, slotCount);
  };

  const tabProps: TabDragBindings['tabProps'] = (tabId) => ({
    draggable: true,
    onMouseDown(event) {
      pressed.current = event.target;
    },
    onDragStart(event) {
      // 닫기 버튼을 잡고 끄는 것은 끌기가 아니다.
      const grabbed = pressed.current;
      if (grabbed instanceof Element && grabbed.closest('[data-tab-action]')) {
        event.preventDefault();
        return;
      }
      const element = event.currentTarget;
      const rect = element.getBoundingClientRect();
      const grabOffset = {
        x: Math.max(0, Math.min(event.clientX - rect.left, rect.width)),
        y: Math.max(0, Math.min(event.clientY - rect.top, rect.height)),
      };
      const transfer = event.dataTransfer;
      transfer.effectAllowed = 'move';
      transfer.setData(TAB_DRAG_TYPES.tabId, tabId);
      transfer.setData(TAB_DRAG_TYPES.windowId, String(options.windowId));
      const marker = nextMarker();
      transfer.setData(tabDragMarkerType(marker), '1');
      // 마우스를 따라가는 그림은 탭 자신이다. 잡은 자리 그대로라 튀지 않는다.
      transfer.setDragImage(element, grabOffset.x, grabOffset.y);
      own.current = { tabId, marker, grabOffset };
      // 끄는 탭이 보이는 탭이 된다.
      options.dispatch({ type: 'activate', tabId });
      // 끌기 그림은 이 handler가 끝난 직후에 탭의 지금 모습으로 찍힌다. 탭을 빈 칸으로
      // 바꾸는 것은 그 뒤여야 한다(지금 바꾸면 빈 그림이 찍히거나 끌기가 취소된다).
      clearFrame();
      pendingFrame.current = requestAnimationFrame(() => {
        pendingFrame.current = null;
        if (own.current?.tabId !== tabId) return;
        setDrag((previous) =>
          previous.draggedTabId === tabId
            ? previous
            : { draggedTabId: tabId, slot: null, animate: false },
        );
      });
    },
    onDragEnd(event) {
      clearFrame();
      const ended = own.current;
      own.current = null;
      setDrag(NO_TAB_STRIP_DRAG);
      // 이 탭 줄이 놓기를 받았으면(순서 바꾸기) 이미 끝난 끌기다.
      if (!ended || ended.tabId !== tabId) return;
      if (!options.detachable) return;
      // 탭 줄이 아닌 곳에서 끝났다. 새 창으로 옮길지는 main이 끝난 자리를 보고 정한다.
      options.dispatch({
        type: 'drop-outside',
        tabId,
        client: { x: event.clientX, y: event.clientY },
        grabOffset: ended.grabOffset,
        accepted: event.dataTransfer.dropEffect !== 'none',
        eventScreen: { x: event.screenX, y: event.screenY },
      });
    },
  });

  /**
   * 끌기가 탭 줄 위에 있다: 받는 자리라고 답하고, 마우스가 있는 칸에 빈 칸을 연다.
   *
   * 탭 줄 안의 요소로 들어올 때(dragenter)와 그 위에 있는 동안(dragover) 똑같이 한다.
   * 다른 탭이 자리를 비키며 움직이면 마우스가 가만히 있어도 그 밑의 요소가 바뀌는데, 그
   * 순간 브라우저는 dragover 없이 dragenter만 보내고 그 답으로 받을지 정한다. 거기서
   * 답하지 않으면 그때 뗀 손은 "탭 줄 밖에 놓은 것"이 된다.
   */
  const dragOverStrip = (event: DragEvent<HTMLElement>) => {
    const mine = ownDrag(event.dataTransfer.types);
    const incoming = mine === null;
    if (
      incoming &&
      !(options.detachable && isAppTabDrag(event.dataTransfer.types))
    ) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const draggedTabId = mine?.tabId ?? null;
    const slot = slotAt(event.clientX, incoming);
    setDrag((previous) =>
      previous.draggedTabId === draggedTabId && previous.slot === slot
        ? previous
        : {
            draggedTabId,
            slot,
            // 내 탭을 막 끌기 시작한 순간에는 탭이 접히면서 그 자리에 빈 칸이 열린다.
            // 그때는 움직임 없이 바로 바꾼다.
            animate: incoming || previous.draggedTabId === draggedTabId,
          },
    );
  };

  const stripProps: TabDragBindings['stripProps'] = {
    /**
     * 끄는 동안에는 화면에 마우스 이동이 오지 않는다. 마우스 이동이 왔다면 끌기는 끝난
     * 것이다. 끝났다는 이벤트를 받지 못해 남은 빈 칸이나 접힌 탭이 있으면 여기서 치운다.
     */
    onPointerMove() {
      if (own.current === null && drag === NO_TAB_STRIP_DRAG) return;
      clearFrame();
      own.current = null;
      setDrag(NO_TAB_STRIP_DRAG);
    },
    onDragEnter: dragOverStrip,
    onDragOver: dragOverStrip,
    onDragLeave(event) {
      // 탭 줄 안의 다른 요소로 옮겨 간 것은 벗어난 것이 아니다. 문서 밖으로 나가면
      // relatedTarget이 없다.
      const next = event.relatedTarget;
      if (next instanceof Node && event.currentTarget.contains(next)) return;
      const draggedTabId = ownDrag(event.dataTransfer.types)?.tabId ?? null;
      setDrag((previous) =>
        previous.slot === null && previous.draggedTabId === draggedTabId
          ? previous
          : { draggedTabId, slot: null, animate: true },
      );
    },
    onDrop(event) {
      const mine = ownDrag(event.dataTransfer.types);
      if (mine) {
        event.preventDefault();
        // 여기서 끝난 끌기다. 뒤따르는 끌기 끝 이벤트는 main에 묻지 않는다.
        own.current = null;
        setDrag(NO_TAB_STRIP_DRAG);
        options.dispatch({
          type: 'reorder',
          tabId: mine.tabId,
          toIndex: slotAt(event.clientX, false),
        });
        return;
      }
      if (!options.detachable || !isAppTabDrag(event.dataTransfer.types)) return;
      event.preventDefault();
      const toIndex = slotAt(event.clientX, true);
      setDrag(NO_TAB_STRIP_DRAG);
      const dragged = readDraggedTab((type) => event.dataTransfer.getData(type));
      if (!dragged || dragged.sourceWindowId === options.windowId) return;
      options.dispatch({
        type: 'adopt',
        tabId: dragged.tabId,
        sourceWindowId: dragged.sourceWindowId,
        toIndex,
      });
    },
  };

  return {
    slots: tabStripSlots({
      tabIds: options.tabIds,
      drag,
      reservedSlot: options.reservedSlot,
    }),
    animate: drag.animate,
    tabProps,
    stripProps,
  };
}

import { useCallback, useEffect } from 'react';
import type { Tab } from '@estate-erp/shared';
import { useTabStore } from '../store/useTabStore';

/**
 * 작은 임계값(수직 8px). 이 거리를 넘기면 즉시 detach 새 창 생성.
 * 그 이후엔 새 창이 마우스를 따라다니며 사용자가 떼면 그 자리에 정착.
 */
const DETACH_THRESHOLD = 8;

interface DragSession {
  tabId: string;
  pointerId: number;
  /** 마우스 down 시점의 screen 좌표 (= window.screenX/Y + clientX/Y) */
  startScreen: { x: number; y: number };
  /** 마우스가 탭 좌측 상단으로부터 떨어진 offset */
  mouseOffset: { x: number; y: number };
  /** 새 창 생성 완료(beginDrag IPC가 resolve)되었는지 */
  detached: boolean;
}

function clientToScreen(clientX: number, clientY: number): { x: number; y: number } {
  return {
    x: window.screenX + clientX,
    y: window.screenY + clientY,
  };
}

export function useDetachDrag(tabBarRef: React.RefObject<HTMLDivElement | null>) {
  const removeTabById = useTabStore((s) => s.removeTabById);

  const beginDrag = useCallback(
    async (tab: Tab, pointerScreen: { x: number; y: number }, mouseOffset: { x: number; y: number }) => {
      if (!window.electronBridge?.tabs) return;
      await window.electronBridge.tabs.beginDrag({
        tab,
        pointerScreen,
        mouseOffset,
      });
      // source 창에서 그 탭 제거 — 시각적으로 사라지고 새 창이 그 자리에 등장한 모양이 됨
      removeTabById(tab.id);
    },
    [removeTabById],
  );

  useEffect(() => {
    const tabBar = tabBarRef.current;
    if (!tabBar) return;

    let session: DragSession | null = null;

    /**
     * dnd-kit sortable이 자식 Tab에 listener를 걸기 때문에 element-level pointermove는
     * dnd-kit한테 빼앗길 수 있다. document level + capture phase로 등록해 dnd-kit보다
     * 먼저 받는다. 임계값 넘기 전엔 그대로 두고(가로 reorder는 dnd-kit이 처리),
     * 임계값 넘는 순간 detach 발동 + 그 이후 이벤트는 dnd-kit으로 가지 않게 차단.
     */

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      const tabEl = target?.closest('[data-tab-id]') as HTMLElement | null;
      if (!tabEl) return;
      // tabBar 영역 안의 탭에서만 발동
      if (!tabBar.contains(tabEl)) return;

      const tabId = tabEl.dataset.tabId;
      if (!tabId) return;

      const tabRect = tabEl.getBoundingClientRect();
      session = {
        tabId,
        pointerId: e.pointerId,
        startScreen: clientToScreen(e.clientX, e.clientY),
        mouseOffset: {
          x: e.clientX - tabRect.left,
          y: e.clientY - tabRect.top,
        },
        detached: false,
      };
      // pointerdown 시점에는 setPointerCapture / preventDefault 하지 않는다.
      // dnd-kit sortable이 자유롭게 가로 reorder를 처리하게 둔다.
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!session) return;
      if (e.pointerId !== session.pointerId) return;

      const screen = clientToScreen(e.clientX, e.clientY);

      if (!session.detached) {
        const dy = screen.y - session.startScreen.y;
        // 수직 임계값(아래로 8px)에서만 detach. 수평 이동은 dnd-kit sortable이 처리.
        if (dy < DETACH_THRESHOLD) return;

        const tab = useTabStore.getState().tabs.find(
          (t) => t.id === session!.tabId,
        );
        if (!tab) {
          session = null;
          return;
        }
        session.detached = true;
        // detach 발동 시점부터는 이 이벤트와 후속 이벤트가 dnd-kit으로 가지 않게 한다.
        // capture phase에서 stopImmediatePropagation()을 부르면 이후 listener 모두 차단.
        e.stopImmediatePropagation();
        e.preventDefault();
        // detach 시작 시점에 capture를 가져온다. 이렇게 해야 source 창 밖
        // (다른 모니터/데스크톱)으로 끌어도 pointermove가 계속 들어옴.
        try {
          tabBar.setPointerCapture(e.pointerId);
        } catch {
          // ignore — capture 실패해도 document listener가 이벤트는 받음
        }
        void beginDrag(tab, screen, session.mouseOffset);
        return;
      }

      // 이미 detached — 새 창 위치 갱신, 이벤트는 dnd-kit으로 가지 않게 차단
      e.stopImmediatePropagation();
      window.electronBridge?.tabs.updateDragPosition(screen);
    };

    const endSession = () => {
      if (!session) return;
      const wasDetached = session.detached;
      const pointerId = session.pointerId;
      try {
        if (tabBar.hasPointerCapture(pointerId)) {
          tabBar.releasePointerCapture(pointerId);
        }
      } catch {
        // ignore
      }
      session = null;
      if (wasDetached) {
        window.electronBridge?.tabs.endDrag();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!session || e.pointerId !== session.pointerId) return;
      const wasDetached = session.detached;
      endSession();
      if (wasDetached) {
        // detached 상태였다면 dnd-kit이 drop 처리하지 않게 차단
        e.stopImmediatePropagation();
      }
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (!session || e.pointerId !== session.pointerId) return;
      endSession();
    };

    // document level + capture phase. dnd-kit보다 먼저 받음.
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerCancel, true);
    // capture 중에도 lostpointercapture가 발생할 수 있음
    tabBar.addEventListener(
      'lostpointercapture',
      onPointerCancel as EventListener,
    );

    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerCancel, true);
      tabBar.removeEventListener(
        'lostpointercapture',
        onPointerCancel as EventListener,
      );
    };
  }, [tabBarRef, beginDrag]);
}

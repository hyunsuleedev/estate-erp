import { useCallback, useEffect, useRef } from 'react';
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

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      const tabEl = target?.closest('[data-tab-id]') as HTMLElement | null;
      if (!tabEl) return;

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

      // 마우스 capture: source 창 밖으로 나가도 pointermove를 source에 계속 보냄
      try {
        tabBar.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!session) return;
      if (e.pointerId !== session.pointerId) return;

      const screen = clientToScreen(e.clientX, e.clientY);

      if (!session.detached) {
        const dy = screen.y - session.startScreen.y;
        // 수직 임계값(아래로 8px)에서만 detach. 수평 이동은 dnd-kit sortable이 처리.
        if (dy < DETACH_THRESHOLD) return;

        const tab = useTabStore.getState().tabs.find((t) => t.id === session!.tabId);
        if (!tab) {
          session = null;
          return;
        }
        session.detached = true;
        void beginDrag(tab, screen, session.mouseOffset);
        return;
      }

      // 이미 detached — 새 창 위치 갱신
      window.electronBridge?.tabs.updateDragPosition(screen);
    };

    const endSession = () => {
      if (!session) return;
      const wasDetached = session.detached;
      try {
        if (tabBar.hasPointerCapture(session.pointerId)) {
          tabBar.releasePointerCapture(session.pointerId);
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
      endSession();
    };

    const onPointerCancel = (e: PointerEvent) => {
      if (!session || e.pointerId !== session.pointerId) return;
      endSession();
    };

    tabBar.addEventListener('pointerdown', onPointerDown);
    tabBar.addEventListener('pointermove', onPointerMove);
    tabBar.addEventListener('pointerup', onPointerUp);
    tabBar.addEventListener('pointercancel', onPointerCancel);
    // capture 중에도 lostpointercapture가 발생할 수 있음
    tabBar.addEventListener('lostpointercapture', onPointerCancel as EventListener);

    return () => {
      tabBar.removeEventListener('pointerdown', onPointerDown);
      tabBar.removeEventListener('pointermove', onPointerMove);
      tabBar.removeEventListener('pointerup', onPointerUp);
      tabBar.removeEventListener('pointercancel', onPointerCancel);
      tabBar.removeEventListener(
        'lostpointercapture',
        onPointerCancel as EventListener,
      );
    };
  }, [tabBarRef, beginDrag]);
}

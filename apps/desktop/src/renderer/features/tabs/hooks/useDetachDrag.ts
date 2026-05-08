import { useCallback, useEffect, useRef } from 'react';
import type { Tab } from '@estate-erp/shared';
import { useTabStore } from '../store/useTabStore';

const DETACH_THRESHOLD = 80; // px below tab bar bottom

/**
 * Tab 드래그 시 탭바 영역 아래로 충분히 끌어내리면 detach IPC를 호출.
 * @dnd-kit의 sortable과 별개로 작동 (sortable은 좌우 재정렬, 이 훅은 수직 detach 감지).
 */
export function useDetachDrag(tabBarRef: React.RefObject<HTMLDivElement | null>) {
  const detachInProgressRef = useRef(false);
  const removeTabById = useTabStore((s) => s.removeTabById);

  const detach = useCallback(
    async (tab: Tab, screenX: number, screenY: number) => {
      if (detachInProgressRef.current) return;
      if (!window.electronBridge?.tabs) return;
      detachInProgressRef.current = true;
      try {
        await window.electronBridge.tabs.detach({
          tab,
          position: { x: Math.round(screenX), y: Math.round(screenY) },
        });
        removeTabById(tab.id);
      } finally {
        detachInProgressRef.current = false;
      }
    },
    [removeTabById],
  );

  useEffect(() => {
    const tabBar = tabBarRef.current;
    if (!tabBar) return;

    let activeTabId: string | null = null;
    let pointerStarted = false;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      const tabEl = target?.closest('[data-tab-id]') as HTMLElement | null;
      if (!tabEl) return;
      activeTabId = tabEl.dataset.tabId ?? null;
      pointerStarted = true;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointerStarted || !activeTabId) return;
      const rect = tabBar.getBoundingClientRect();
      const dy = e.clientY - rect.bottom;
      if (dy < DETACH_THRESHOLD) return;

      // Threshold exceeded — perform detach
      const tab = useTabStore.getState().tabs.find((t) => t.id === activeTabId);
      if (!tab) {
        pointerStarted = false;
        activeTabId = null;
        return;
      }
      const idForDetach = activeTabId;
      pointerStarted = false;
      activeTabId = null;

      // screenX/screenY = global screen coords for new window placement
      void detach(tab, e.screenX, e.screenY);

      // Synthetically end the dnd-kit drag by releasing pointer capture
      try {
        (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
      } catch {
        // ignore
      }
      // Mark tab id for removal after async detach resolves; in the meantime
      // we rely on detach() resolving and removeTabById being called.
      void idForDetach;
    };

    const onPointerUp = () => {
      pointerStarted = false;
      activeTabId = null;
    };

    tabBar.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);

    return () => {
      tabBar.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [tabBarRef, detach]);
}

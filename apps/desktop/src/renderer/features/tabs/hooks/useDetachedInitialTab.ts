import { useEffect, useRef } from 'react';
import { useTabStore } from '../store/useTabStore';
import { getRouteMeta } from '../lib/routeMeta';

/**
 * Detached 윈도우에서 초기 탭 정보를 IPC로 받아 그 창의 탭 풀에 등록.
 * VSCode 모델: 떼어낸 창도 자기만의 탭 풀을 가지며, 시작 탭이 1개 들어있음.
 * `enabled === true`일 때만 동작 (메인 윈도우에서는 호출하지 않음).
 */
export function useDetachedInitialTab(enabled: boolean) {
  const openTab = useTabStore((s) => s.openTab);
  const handledRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (handledRef.current) return;
    if (!window.electronBridge?.tabs) return;

    void window.electronBridge.tabs.getInitialTab().then((tab) => {
      if (!tab) return;
      if (handledRef.current) return;
      handledRef.current = true;

      // 이미 같은 route의 탭이 있으면 그걸 활성화 (이론상 발생 안 해야 함)
      const existing = useTabStore
        .getState()
        .tabs.find((t) => t.route === tab.route);
      if (existing) {
        useTabStore.getState().activateTab(existing.id);
      } else {
        openTab({
          route: tab.route,
          kind: tab.kind as ReturnType<typeof getRouteMeta>['kind'],
          title: tab.title,
          routeParams: tab.routeParams,
        });
      }
      document.title = `${tab.title} — Estate ERP`;
    });
  }, [enabled, openTab]);
}

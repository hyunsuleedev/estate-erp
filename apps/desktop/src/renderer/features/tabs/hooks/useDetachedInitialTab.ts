import { useEffect, useRef } from 'react';
import { useNavigate } from '@tanstack/react-router';

/**
 * Detached 윈도우에서 초기 탭 정보를 IPC로 받아 라우터 navigate.
 * `enabled === true`일 때만 동작 (메인 윈도우에서는 호출하지 않음).
 */
export function useDetachedInitialTab(enabled: boolean) {
  const navigate = useNavigate();
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (navigatedRef.current) return;
    if (!window.electronBridge?.tabs) return;

    void window.electronBridge.tabs.getInitialTab().then((tab) => {
      if (!tab) return;
      navigatedRef.current = true;
      navigate({ to: tab.route });
      document.title = `${tab.title} — Estate ERP`;
    });
  }, [enabled, navigate]);
}

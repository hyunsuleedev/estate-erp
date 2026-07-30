import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useTabStore } from './store/useTabStore';
import { getRouteMeta } from './lib/routeMeta';

interface TabContentProps {
  /**
   * 빈 상태(탭 0개)일 때 자동으로 대시보드 탭을 만들지 여부.
   * 메인 윈도우는 true. detached 윈도우는 false (`useDetachedInitialTab`이
   * IPC로 받은 초기 탭을 비동기 등록하므로 자동 생성과 race 회피).
   */
  autoCreateInitialTab?: boolean;
}

/**
 * TabContent
 *
 * 핵심 흐름:
 * - 활성 탭이 바뀜(탭 클릭, 새 탭) → 라우터를 그 탭의 route로 navigate.
 * - 사용자가 사이드바/링크로 navigate → 활성 탭의 route를 그 경로로 갱신.
 *
 * 두 흐름을 한 effect 안에서 "어떤 게 먼저 변했는지" 추적해 분기.
 */
export function TabContent({ autoCreateInitialTab = true }: TabContentProps = {}) {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const openTab = useTabStore((s) => s.openTab);
  const updateTabRoute = useTabStore((s) => s.updateTabRoute);
  const updateTabTitle = useTabStore((s) => s.updateTabTitle);
  const navigate = useNavigate();
  const location = useLocation();

  // 빈 상태면 초기 탭 자동 생성 (메인 윈도우만).
  // 딥링크 보존: 브라우저(dev)에서 /contacts 등으로 직접 진입하면 그 경로로 첫 탭을 만든다.
  // Electron(file:)은 hash history라 첫 진입 경로가 '/' → 대시보드로 fallback.
  useEffect(() => {
    if (!autoCreateInitialTab) return;
    if (tabs.length === 0) {
      const path = location.pathname;
      const initialRoute = path && path !== '/' && path !== '/login' ? path : '/dashboard';
      const meta = getRouteMeta(initialRoute);
      openTab({ route: initialRoute, kind: meta.kind, title: meta.title });
    }
  }, [autoCreateInitialTab, tabs.length, openTab, location.pathname]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // 직전에 본 활성 탭 id / location pathname 을 기억해 변화 출처를 판별.
  const prevActiveTabIdRef = useRef<string | null>(null);
  const prevPathRef = useRef<string>(location.pathname);

  useEffect(() => {
    if (!activeTab) {
      prevActiveTabIdRef.current = null;
      prevPathRef.current = location.pathname;
      return;
    }

    const activeTabChanged = prevActiveTabIdRef.current !== activeTab.id;
    const pathChanged = prevPathRef.current !== location.pathname;
    const inSync = activeTab.route === location.pathname;

    if (inSync) {
      prevActiveTabIdRef.current = activeTab.id;
      prevPathRef.current = location.pathname;
      return;
    }

    if (activeTabChanged) {
      // 탭이 바뀐 게 원인 → 라우터를 활성 탭의 route로 맞춤
      navigate({ to: activeTab.route });
      prevActiveTabIdRef.current = activeTab.id;
      // path는 navigate 후 다음 렌더에 동기화됨 — 일단 현재 path 기록
      prevPathRef.current = location.pathname;
      return;
    }

    if (pathChanged) {
      // 사용자가 사이드바/링크 등으로 navigate 한 것 → 활성 탭의 route 갱신
      const meta = getRouteMeta(location.pathname);
      updateTabRoute(activeTab.id, location.pathname);
      // 사용자가 의도적으로 제목을 바꾼 경우는 보존, 기본 라벨/플레이스홀더만 갱신
      if (activeTab.title === '...' || activeTab.title === getRouteMeta(activeTab.route).title) {
        updateTabTitle(activeTab.id, meta.title);
      }
      prevPathRef.current = location.pathname;
      return;
    }

    // 어느 쪽도 변하지 않았는데 desync인 경우(드물게 첫 마운트) → 활성 탭의 route 따라감
    navigate({ to: activeTab.route });
    prevActiveTabIdRef.current = activeTab.id;
    prevPathRef.current = location.pathname;
  }, [activeTab?.id, activeTab?.route, location.pathname, navigate, updateTabRoute, updateTabTitle]);

  return (
    <div key={activeTab?.id ?? 'empty'} className="flex flex-1 flex-col min-h-0 min-w-0 p-4">
      <Outlet />
    </div>
  );
}

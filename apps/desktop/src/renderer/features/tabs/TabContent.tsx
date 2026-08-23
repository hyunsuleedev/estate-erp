import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useTabStore } from './store/useTabStore';
import { getRouteMeta } from './lib/routeMeta';
import { resolveTabResourceKey } from './lib/tabResource';

interface TabWorkspaceControllerProps {
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
export function TabWorkspaceController({
  autoCreateInitialTab = true,
}: TabWorkspaceControllerProps = {}) {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const createTab = useTabStore((s) => s.createTab);
  const adoptTabLocation = useTabStore((s) => s.adoptTabLocation);
  const navigate = useNavigate();
  const location = useLocation();
  const currentHref = location.href;

  const workspaceInitializedRef = useRef(false);
  const emptyWorkspaceHandledRef = useRef(false);

  useEffect(() => {
    const onOpenRoute = window.electronBridge?.tabs.onOpenRoute;
    if (!onOpenRoute) return;
    return onOpenRoute((route) => {
      void navigate({ href: route });
    });
  }, [navigate]);

  // 최초 빈 상태는 deep link를 보존한다. 실행 중 마지막 탭을 닫거나 분리한 뒤의
  // 빈 상태는 옛 pathname을 복제하지 않고 새 dashboard launcher로 대체한다.
  useEffect(() => {
    if (!autoCreateInitialTab) return;
    if (tabs.length > 0) {
      workspaceInitializedRef.current = true;
      emptyWorkspaceHandledRef.current = false;
      return;
    }
    if (emptyWorkspaceHandledRef.current) return;

    emptyWorkspaceHandledRef.current = true;
    const isInitialWorkspace = !workspaceInitializedRef.current;
    workspaceInitializedRef.current = true;
    const initialRoute =
      isInitialWorkspace &&
      location.pathname !== '/' &&
      location.pathname !== '/login'
        ? currentHref
        : '/dashboard';
    const meta = getRouteMeta(initialRoute);
    createTab({
      route: initialRoute,
      kind: meta.kind,
      title: meta.title,
      // 실행 중 마지막 탭이 사라진 경우에는 dashboard module reveal이 아니라
      // 새로운 launcher 탭을 만든다.
      resourceKey: isInitialWorkspace ? undefined : null,
    });
  }, [
    autoCreateInitialTab,
    tabs.length,
    createTab,
    currentHref,
    location.pathname,
  ]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // 직전에 본 활성 탭 id / full href를 기억해 변화 출처를 판별.
  const prevActiveTabIdRef = useRef<string | null>(null);
  const prevHrefRef = useRef<string>(currentHref);
  useEffect(() => {
    if (!activeTab) {
      prevActiveTabIdRef.current = null;
      prevHrefRef.current = currentHref;
      return;
    }

    const activeTabChanged = prevActiveTabIdRef.current !== activeTab.id;
    const hrefChanged = prevHrefRef.current !== currentHref;
    const inSync = activeTab.route === currentHref;

    if (inSync) {
      prevActiveTabIdRef.current = activeTab.id;
      prevHrefRef.current = currentHref;
      return;
    }

    if (activeTabChanged) {
      // 탭이 바뀐 게 원인 → 라우터를 활성 탭의 route로 맞춤
      void navigate({ href: activeTab.route, replace: true });
      prevActiveTabIdRef.current = activeTab.id;
      // href는 navigate 후 다음 렌더에 동기화됨 — 일단 현재 값을 기록
      prevHrefRef.current = currentHref;
      return;
    }

    if (hrefChanged) {
      // 사용자가 사이드바/링크 등으로 navigate 한 것. 같은 업무 리소스가 다른
      // 탭에 이미 있으면 그 탭을 reveal하고, 아니면 현재 탭의 위치를 갱신한다.
      const meta = getRouteMeta(currentHref);
      const nextResourceKey = resolveTabResourceKey(currentHref, activeTab.id);
      const keepsCustomTitle =
        activeTab.resourceKey === nextResourceKey &&
        activeTab.title !== '...' &&
        activeTab.title !== getRouteMeta(activeTab.route).title;
      adoptTabLocation(
        activeTab.id,
        currentHref,
        meta.kind,
        keepsCustomTitle ? activeTab.title : meta.title,
      );
      prevHrefRef.current = currentHref;
      return;
    }

    // 어느 쪽도 변하지 않았는데 desync인 경우(드물게 첫 마운트) → 활성 탭의 route 따라감
    void navigate({ href: activeTab.route, replace: true });
    prevActiveTabIdRef.current = activeTab.id;
    prevHrefRef.current = currentHref;
  }, [
    activeTab?.id,
    activeTab?.resourceKey,
    activeTab?.route,
    activeTab?.title,
    adoptTabLocation,
    currentHref,
    navigate,
  ]);

  return null;
}

/** Route content projection only. Workspace/router synchronization lives in the
 * persistent controller above so native attach can unmount just the Outlet. */
export function TabContent() {
  const tabs = useTabStore((state) => state.tabs);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const activeTabTransferLocked = useTabStore((state) =>
    activeTabId ? state.transferLockedTabIds.has(activeTabId) : false,
  );
  const location = useLocation();
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const canRenderActiveRoute = Boolean(
    activeTab &&
      !activeTabTransferLocked &&
      (activeTab.route === location.href ||
        activeTab.resourceKey ===
          resolveTabResourceKey(location.href, activeTab.id)),
  );

  return (
    <div
      key={activeTab?.id ?? 'empty'}
      className="flex flex-1 flex-col min-h-0 min-w-0 p-4"
    >
      {/* 탭 ID는 먼저 바뀌고 router href는 다음 render에 따라오는 구간이 있다.
          그 사이 이전 route를 새 탭 owner로 mount하면 draft state가 섞이므로 gate한다. */}
      {canRenderActiveRoute ? <Outlet /> : null}
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useTabStore } from './store/useTabStore';
import { getRouteMeta } from './lib/routeMeta';
import { resolveTabResourceKey } from './lib/tabResource';

interface TabWorkspaceControllerProps {
  /** 빈 상태(탭 0개)일 때 자동으로 대시보드 탭을 만들지 여부. */
  autoCreateInitialTab?: boolean;
}

/**
 * TabContent — 브라우저 단독 미리보기에서만 쓴다. Electron에서는 탭 목록의 주인이
 * main이고 화면은 탭마다의 탭 화면이 그린다.
 *
 * 핵심 흐름:
 * - 활성 탭이 바뀜(탭 클릭, 새 탭) → 라우터를 그 탭의 route로 navigate.
 * - 활성 탭의 route가 store에서 바뀜(사이드바 navigateTab) → 라우터가 따라감.
 * - 사용자가 페이지 안 링크로 navigate → 활성 탭의 route를 그 경로로 갱신.
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

  // 직전에 본 활성 탭 id / route / full href를 기억해 변화 출처를 판별.
  const prevActiveTabIdRef = useRef<string | null>(null);
  const prevActiveTabRouteRef = useRef<string | null>(null);
  const prevHrefRef = useRef<string>(currentHref);
  useEffect(() => {
    if (!activeTab) {
      prevActiveTabIdRef.current = null;
      prevActiveTabRouteRef.current = null;
      prevHrefRef.current = currentHref;
      return;
    }

    const activeTabChanged = prevActiveTabIdRef.current !== activeTab.id;
    const activeTabRouteChanged =
      prevActiveTabRouteRef.current !== activeTab.route;
    const hrefChanged = prevHrefRef.current !== currentHref;
    const inSync = activeTab.route === currentHref;
    prevActiveTabRouteRef.current = activeTab.route;

    if (inSync) {
      prevActiveTabIdRef.current = activeTab.id;
      prevHrefRef.current = currentHref;
      return;
    }

    if (activeTabChanged || (activeTabRouteChanged && !hrefChanged)) {
      // 탭 전환 또는 같은 탭의 store-side 이동(사이드바)이 원인 →
      // 라우터를 활성 탭의 route로 맞춤
      void navigate({ href: activeTab.route, replace: true });
      prevActiveTabIdRef.current = activeTab.id;
      // href는 navigate 후 다음 렌더에 동기화됨 — 일단 현재 값을 기록
      prevHrefRef.current = currentHref;
      return;
    }

    if (hrefChanged) {
      // 페이지 안 링크/코드가 router로 navigate 한 것. 같은 업무 리소스면 현재 탭을
      // 갱신하고, 다른 리소스는 원본 탭을 보존한 채 reveal하거나 새 탭으로 연다.
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
  const location = useLocation();
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? null;
  const canRenderActiveRoute = Boolean(
    activeTab &&
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

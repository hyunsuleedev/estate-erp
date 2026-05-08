import { useEffect, useRef } from 'react';
import { Outlet, useLocation, useNavigate, useMatches } from '@tanstack/react-router';
import { useTabStore } from './store/useTabStore';
import { getRouteMeta } from './lib/routeMeta';

/**
 * TabContent
 *
 * - 활성 탭이 바뀌면 라우터를 해당 탭의 route로 navigate.
 * - 라우터 location이 바뀌면 활성 탭의 route를 동기화 (사이드바 클릭 등으로 navigate된 경우).
 * - 빈 상태(탭 0개)일 때는 자동으로 대시보드 탭을 연다.
 *
 * Phase 1에서는 단일 라우터 + 활성 탭만 반영하는 단순 모델을 택함. 비활성 탭의 폼/스크롤 상태는
 * 보존되지 않음 (Phase 2에서 multi-router 또는 메모리 보존으로 개선 가능).
 */
export function TabContent() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const openTab = useTabStore((s) => s.openTab);
  const updateTabRoute = useTabStore((s) => s.updateTabRoute);
  const updateTabTitle = useTabStore((s) => s.updateTabTitle);
  const navigate = useNavigate();
  const location = useLocation();
  const matches = useMatches();

  const lastNavigatedRef = useRef<string | null>(null);

  // 탭이 하나도 없으면 대시보드 탭 자동 생성.
  useEffect(() => {
    if (tabs.length === 0) {
      const meta = getRouteMeta('/dashboard');
      openTab({ route: '/dashboard', kind: meta.kind, title: meta.title });
    }
  }, [tabs.length, openTab]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // 활성 탭이 바뀌거나, 활성 탭의 route가 현재 location과 다르면 navigate.
  useEffect(() => {
    if (!activeTab) return;
    if (activeTab.route !== location.pathname) {
      lastNavigatedRef.current = activeTab.route;
      navigate({ to: activeTab.route });
    }
  }, [activeTab?.id, activeTab?.route, location.pathname, navigate]);

  // 라우터 location이 바뀌었는데 활성 탭의 route와 다르면, 사용자가 다른 경로로 이동한 것.
  // 활성 탭의 route를 새 경로로 업데이트하고 제목도 갱신 (사이드바 클릭이 같은 탭 안에서
  // navigate한 경우의 처리).
  useEffect(() => {
    if (!activeTab) return;
    if (location.pathname === activeTab.route) return;
    if (location.pathname === lastNavigatedRef.current) return;

    const meta = getRouteMeta(location.pathname);
    updateTabRoute(activeTab.id, location.pathname);
    updateTabTitle(activeTab.id, meta.title);
  }, [location.pathname, activeTab?.id, activeTab?.route, updateTabRoute, updateTabTitle]);

  // 라우트 매치에서 동적 제목 추출 (예: 매물 상세 페이지의 매물명) — 향후 useDocumentTitle 패턴
  // 으로 확장 가능. Phase 1은 정적 매핑만.
  useEffect(() => {
    if (!activeTab) return;
    const lastMatch = matches[matches.length - 1];
    if (!lastMatch) return;
    // 메타에서 뽑은 정적 제목이 현재와 다르면 동기화
    const meta = getRouteMeta(activeTab.route);
    if (activeTab.title !== meta.title && activeTab.title === '...') {
      updateTabTitle(activeTab.id, meta.title);
    }
  }, [matches, activeTab?.id, activeTab?.route, activeTab?.title, updateTabTitle]);

  return (
    <div key={activeTab?.id ?? 'empty'} className="flex flex-1 flex-col min-h-0 min-w-0">
      <Outlet />
    </div>
  );
}

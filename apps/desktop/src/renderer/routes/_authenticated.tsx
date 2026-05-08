import { createFileRoute, Navigate, Outlet } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { AppSidebar } from '@/components/layout/app-sidebar';
import {
  SidebarInset,
  SidebarProvider,
  useSidebar,
} from '@/components/ui/sidebar';
import { TabBar } from '@/features/tabs/TabBar/TabBar';
import { TabContent } from '@/features/tabs/TabContent';
import { useDetachedInitialTab } from '@/features/tabs/hooks/useDetachedInitialTab';

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
});

function useWindowKind(): 'main' | 'detached' | null {
  const [kind, setKind] = useState<'main' | 'detached' | null>(null);
  useEffect(() => {
    if (!window.electronBridge?.tabs) {
      setKind('main');
      return;
    }
    void window.electronBridge.tabs.getWindowKind().then(setKind);
  }, []);
  return kind;
}

/** Listens for toggle-sidebar IPC from main process menu (Cmd+B) */
function ElectronSidebarBridge() {
  const { toggleSidebar } = useSidebar();

  useEffect(() => {
    const cleanup = window.electronBridge?.onToggleSidebar(() => {
      toggleSidebar();
    });
    return cleanup;
  }, [toggleSidebar]);

  return null;
}

function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const windowKind = useWindowKind();

  // detached 윈도우면 초기 탭 정보를 받아 라우터 navigate
  useDetachedInitialTab(windowKind === 'detached');

  if (isLoading || windowKind === null) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (windowKind === 'detached') {
    // 떼어낸 창: 탭바/사이드바 없이 단일 라우트만 렌더
    return (
      <div className="flex h-screen w-full flex-col">
        <DetachedTitleBar />
        <main className="flex flex-1 flex-col min-h-0 min-w-0 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <ElectronSidebarBridge />
      <div className="flex h-screen w-full flex-col">
        {/* 상단 탭바 (Chrome 스타일, 타이틀바 영역) */}
        <TabBar />

        {/* 사이드바 + 콘텐츠 */}
        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <SidebarInset className="flex-1 min-h-0 min-w-0">
            <div className="flex flex-1 flex-col gap-4 p-4 min-h-0 min-w-0 overflow-auto">
              <TabContent />
            </div>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}

const isMacPlatform = window.electronBridge?.platform === 'darwin';

/**
 * Detached 윈도우의 빈 타이틀바: macOS 트래픽 라이트 자리만 확보 + Windows는 시스템이 그림.
 * 윈도우 드래그 영역 역할.
 */
function DetachedTitleBar() {
  return (
    <div
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="app-titlebar flex h-9 shrink-0 items-center border-b border-border bg-sidebar"
    >
      {isMacPlatform && <div className="w-[78px]" aria-hidden />}
    </div>
  );
}

import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { AppSidebar } from '@/components/layout/app-sidebar';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import { TabBar } from '@/features/tabs/TabBar/TabBar';
import { TabContent } from '@/features/tabs/TabContent';
import { useDetachedInitialTab } from '@/features/tabs/hooks/useDetachedInitialTab';

const isMac = window.electronBridge?.platform === 'darwin';
const isWin = window.electronBridge?.platform === 'win32';

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
});

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

/** Tracks macOS fullscreen state — traffic lights disappear in fullscreen */
function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    window.electronBridge?.isFullscreen().then(setIsFullscreen);
    const cleanup = window.electronBridge?.onFullscreenChanged(setIsFullscreen);
    return cleanup;
  }, []);

  return isFullscreen;
}

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

function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const isFullscreen = useFullscreen();
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

  // macOS windowed: 80px for traffic lights, fullscreen/other platforms: 16px
  const titlebarLeftPadding = isMac && !isFullscreen ? 'pl-[80px]' : 'pl-4';

  // VSCode 모델: detached든 main이든 동일한 레이아웃 (사이드바 + 탭바 + 콘텐츠).
  // 두 창의 탭 풀은 각자 독립 (window별 zustand 인스턴스).
  // 데이터 갱신은 cross-window invalidate로 동기화.
  return (
    <SidebarProvider>
      <ElectronSidebarBridge />
      <div className="flex h-screen w-full flex-col">
        {/* Titlebar: SidebarTrigger + TabBar inline (no breadcrumb) */}
        <header className="app-titlebar flex h-12 shrink-0 items-center gap-2 border-b border-border bg-sidebar pr-2">
          <div
            className={`flex items-center gap-1 ${titlebarLeftPadding}`}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
          </div>
          <TabBar className="min-w-0" />
          {/* Windows: titleBarOverlay 자리 확보 */}
          {isWin && <div className="w-[140px] shrink-0" aria-hidden />}
        </header>

        {/* Sidebar + Content below titlebar */}
        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <SidebarInset className="flex-1 min-h-0 min-w-0">
            <div className="flex flex-1 flex-col gap-4 p-4 min-h-0 min-w-0 overflow-auto">
              <TabContent autoCreateInitialTab={windowKind !== 'detached'} />
            </div>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}

import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { SplashScreen } from '@/components/layout/splash-screen';
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
import { CtiProvider } from '@/features/cti/cti-provider';
import { CallPopup } from '@/features/cti/call-popup';

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
  const { user, isAuthenticated, isLoading } = useAuth();
  const isFullscreen = useFullscreen();
  const windowKind = useWindowKind();

  // detached 윈도우면 초기 탭 정보를 받아 라우터 navigate
  useDetachedInitialTab(windowKind === 'detached');

  if (isLoading || windowKind === null) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (!user?.office) {
    return <Navigate to="/onboarding/office" />;
  }

  // macOS windowed: 80px for traffic lights + 12px breathing room, fullscreen/other platforms: 16px
  const titlebarLeftPadding = isMac && !isFullscreen ? 'pl-[92px]' : 'pl-4';

  // VSCode 모델: detached든 main이든 동일한 레이아웃 (사이드바 + 탭바 + 콘텐츠).
  // 두 창의 탭 풀은 각자 독립 (window별 zustand 인스턴스).
  // 데이터 갱신은 cross-window invalidate로 동기화.
  return (
    <SidebarProvider>
      {/* CTI는 메인 창만 구독 — detached 창까지 구독하면 통화 1건이 창 수만큼 중복 ingest된다 */}
      <CtiProvider enabled={windowKind === 'main'}>
        <ElectronSidebarBridge />
        <div className="flex h-screen w-full flex-col">
          {/* Titlebar: SidebarTrigger + TabBar inline (no breadcrumb) */}
          <header className="app-titlebar flex h-10 shrink-0 items-center gap-2 border-b border-border bg-sidebar pr-2">
            <div
              className={`flex h-full w-(--sidebar-width) shrink-0 items-center gap-1 ${titlebarLeftPadding}`}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            >
              <span
                data-slot="desktop-brand"
                className="mr-2 select-none text-sm font-semibold tracking-[-0.02em] text-sidebar-foreground"
              >
                Estaitt
              </span>
              <span data-slot="titlebar-brand-spacer" className="min-w-0 flex-1" aria-hidden />
              <SidebarTrigger className="-ml-1" />
              <Separator orientation="vertical" className="ml-1 mr-0 data-[orientation=vertical]:h-4" />
            </div>
            <TabBar className="min-w-0" />
            {/* Windows: titleBarOverlay 자리 확보 */}
            {isWin && <div className="w-[140px] shrink-0" aria-hidden />}
          </header>

          {/* Sidebar + Content below titlebar */}
          <div className="flex flex-1 overflow-hidden">
            <AppSidebar />
            <SidebarInset className="flex-1 min-h-0 min-w-0">
              {/* p-4 는 TabContent 래퍼가 소유한다 — 페이지의 -mx-4 풀블리드가
                  직접 부모의 패딩을 상쇄할 수 있어야 한다 (web 레이아웃과 동일 관계) */}
              <div className="flex flex-1 flex-col gap-4 min-h-0 min-w-0 overflow-auto">
                <TabContent autoCreateInitialTab={windowKind !== 'detached'} />
              </div>
            </SidebarInset>
          </div>
        </div>
        {/* CTI 전화 수신 팝업 — 어느 화면에서든 우하단에 표시 */}
        <CallPopup />
      </CtiProvider>
    </SidebarProvider>
  );
}

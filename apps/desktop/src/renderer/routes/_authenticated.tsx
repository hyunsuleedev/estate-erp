import { createFileRoute, Navigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
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
import { useTabStore } from '@/features/tabs/store/useTabStore';
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

/** Detached 창은 마지막 탭을 닫으면 빈 앱 셸을 남기지 않고 창 자체를 닫는다. */
function useCloseDetachedWindowWhenEmpty(
  enabled: boolean,
  initialTabReady: boolean,
) {
  const tabCount = useTabStore((state) => state.tabs.length);
  const closeRequestedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !initialTabReady || tabCount > 0) return;
    if (closeRequestedRef.current) return;

    const closeWindow = window.electronBridge?.tabs.closeWindow;
    if (!closeWindow) return;

    closeRequestedRef.current = true;
    closeWindow();
  }, [enabled, initialTabReady, tabCount]);
}

function MainAuthenticatedShell({ isFullscreen }: { isFullscreen: boolean }) {
  // macOS windowed: 80px for traffic lights + 12px breathing room, fullscreen/other platforms: 16px
  const titlebarLeftPadding = isMac && !isFullscreen ? 'pl-[92px]' : 'pl-4';

  return (
    <SidebarProvider>
      <CtiProvider enabled>
        <ElectronSidebarBridge />
        <div data-window-shell="main" className="flex h-screen w-full flex-col">
          {/* Titlebar: SidebarTrigger + TabBar inline (no breadcrumb) */}
          <header className="app-titlebar flex h-10 shrink-0 items-center gap-0 border-b border-border bg-sidebar pr-2">
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
              <Separator orientation="vertical" className="ml-1 mr-0 self-stretch" />
            </div>
            <TabBar className="min-w-0" />
            {/* Windows: titleBarOverlay 자리 확보 */}
            {isWin ? <div className="w-[140px] shrink-0" aria-hidden /> : null}
          </header>

          {/* Sidebar + Content below titlebar */}
          <div className="flex flex-1 overflow-hidden">
            <AppSidebar />
            <SidebarInset className="flex-1 min-h-0 min-w-0">
              {/* p-4 는 TabContent 래퍼가 소유한다 — 페이지의 -mx-4 풀블리드가
                  직접 부모의 패딩을 상쇄할 수 있어야 한다 (web 레이아웃과 동일 관계) */}
              <div className="flex flex-1 flex-col gap-4 min-h-0 min-w-0 overflow-auto">
                <TabContent />
              </div>
            </SidebarInset>
          </div>
        </div>
        {/* CTI 전화 수신 팝업 — 메인 창에서만 표시 */}
        <CallPopup />
      </CtiProvider>
    </SidebarProvider>
  );
}

function DetachedAuthenticatedShell({ isFullscreen }: { isFullscreen: boolean }) {
  const titlebarSpacerWidth = isMac && !isFullscreen ? 'w-[92px]' : 'w-4';

  return (
    <CtiProvider enabled={false}>
      <div
        data-window-shell="detached"
        className="flex h-screen w-full flex-col bg-background"
      >
        <header className="app-titlebar flex h-10 shrink-0 items-center border-b border-border bg-sidebar pr-2">
          <div
            data-slot="detached-titlebar-spacer"
            className={`${titlebarSpacerWidth} h-full shrink-0`}
            aria-hidden
          />
          <TabBar className="min-w-0" showNewTabButton={false} />
          {isWin ? <div className="w-[140px] shrink-0" aria-hidden /> : null}
        </header>
        <main className="flex min-h-0 min-w-0 flex-1 overflow-auto">
          <TabContent autoCreateInitialTab={false} />
        </main>
      </div>
    </CtiProvider>
  );
}

function AuthenticatedLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const isFullscreen = useFullscreen();
  const windowKind = useWindowKind();
  const isDetached = windowKind === 'detached';

  const detachedInitialTabReady = useDetachedInitialTab(isDetached);
  useCloseDetachedWindowWhenEmpty(isDetached, detachedInitialTabReady);

  if (
    isLoading ||
    windowKind === null ||
    (isDetached && !detachedInitialTabReady)
  ) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (!user?.office) {
    return <Navigate to="/onboarding/office" />;
  }

  if (isDetached) {
    return <DetachedAuthenticatedShell isFullscreen={isFullscreen} />;
  }

  return <MainAuthenticatedShell isFullscreen={isFullscreen} />;
}

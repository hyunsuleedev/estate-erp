import {
  createFileRoute,
  Navigate,
  Outlet,
  useRouter,
} from '@tanstack/react-router';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Tab } from '@estate-erp/shared';
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
import { TabNavigationButtons } from '@/features/tabs/TabBar/TabNavigationButtons';
import {
  useNativeTabMouseNavigation,
  useTabCommands,
} from '@/features/tabs/hooks/useTabCommands';
import {
  TabContent,
  TabWorkspaceController,
} from '@/features/tabs/TabContent';
import { useDetachedInitialTab } from '@/features/tabs/hooks/useDetachedInitialTab';
import { useWindowWorkspace } from '@/features/tabs/hooks/useWindowWorkspace';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import {
  callPopupUsesOverlayLayer,
  CtiProvider,
  useCti,
} from '@/features/cti/cti-provider';
import { CallPopup } from '@/features/cti/call-popup';
import { NativeTabViewport } from '@/features/tabs/native/NativeTabViewport';
import { NativeTabRetentionReporter } from '@/features/tabs/native/NativeTabRetentionReporter';
import { getRendererSurface } from '@/features/tabs/native/rendererSurface';
import { installNativeTabStoreBridge } from '@/features/tabs/native/nativeTabStoreBridge';
import { NativeTabRouterBridge } from '@/features/tabs/native/NativeTabRouterBridge';
import { useNativeTabActions } from '@/features/tabs/native/useNativeTabActions';
import {
  useNativeSidebarState,
  useShellSidebarState,
} from '@/features/tabs/native/useWindowSidebarState';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { resolveTabResourceKey } from '@/features/tabs/lib/tabResource';
import {
  NATIVE_SPARE_TAB_ID_PREFIX,
  resolveNativeTabRoute,
} from '../../common/nativeTabs';

const isMac = window.electronBridge?.platform === 'darwin';
const isWin = window.electronBridge?.platform === 'win32';

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
});

/** Listens for toggle-sidebar IPC from main process menu (Cmd+B) */
function ElectronSidebarBridge() {
  const { toggleSidebar } = useSidebar();

  useEffect(() => {
    const cleanup = window.electronBridge?.onToggleSidebar?.(() => {
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
    void window.electronBridge?.isFullscreen?.().then(setIsFullscreen);
    const cleanup =
      window.electronBridge?.onFullscreenChanged?.(setIsFullscreen);
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
    <CtiProvider enabled>
      <MainAuthenticatedShellContent
        isFullscreen={isFullscreen}
        titlebarLeftPadding={titlebarLeftPadding}
      />
    </CtiProvider>
  );
}

function MainAuthenticatedShellContent({
  titlebarLeftPadding,
}: {
  isFullscreen: boolean;
  titlebarLeftPadding: string;
}) {
  const { activeCall } = useCti();
  // Electron에서는 전화 팝업을 탭 화면 위의 별도 층에 그리므로 통화 중에도
  // 탭 화면을 숨기지 않는다. 숨기면 보던 화면과 입력 중인 내용이 사라진다.
  const popupOnOverlayLayer = callPopupUsesOverlayLayer();
  const [sidebarOpen, setSidebarOpen] = useShellSidebarState();
  useTabCommands({ canCreateTabs: true });
  useNativeTabActions();
  return (
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <TabWorkspaceController />
      <ElectronSidebarBridge />
      <div data-window-shell="main" className="flex h-screen w-full flex-col">
        {/* Titlebar: SidebarTrigger + TabBar inline (no breadcrumb) */}
        <header className="app-titlebar flex h-10 shrink-0 items-center gap-0 border-b border-border bg-sidebar pr-2">
          <div
            className={`app-titlebar-drag-region flex h-full w-(--sidebar-width) shrink-0 items-center gap-1 ${titlebarLeftPadding}`}
          >
            <span
              data-slot="desktop-brand"
              className="mr-2 select-none text-sm font-semibold tracking-[-0.02em] text-sidebar-foreground"
            >
              Estaitt
            </span>
            <span
              data-slot="titlebar-brand-spacer"
              className="min-w-0 flex-1"
              aria-hidden
            />
            <SidebarTrigger className="-ml-1" />
            <Separator
              orientation="vertical"
              className="ml-1 mr-0 self-stretch"
            />
          </div>
          <TabNavigationButtons className="px-2" />
          <TabBar className="min-w-0" />
          {/* Windows: titleBarOverlay 자리 확보 */}
          {isWin ? <div className="w-[140px] shrink-0" aria-hidden /> : null}
        </header>

        {/* 탭바 아래(사이드바 + 화면)는 탭 화면(native 탭)이 그린다(Notion 방식).
            셸은 탭 화면이 뜨는 동안 사이드바만, 탭 화면을 못 띄울 때만 화면까지 그린다. */}
        <NativeTabViewport
          className="overflow-hidden"
          suspended={!popupOnOverlayLayer && activeCall !== null}
          mountingFallback={<ShellSidebarFrame />}
        >
          <ShellSidebarFrame>
            <TabContent />
          </ShellSidebarFrame>
        </NativeTabViewport>
      </div>
      {/* CTI 전화 수신 팝업 — 메인 창에서만. Electron에서는 탭 화면 위 별도 층에 그린다. */}
      {popupOnOverlayLayer ? null : <CallPopup />}
    </SidebarProvider>
  );
}

function DetachedAuthenticatedShell({
  isFullscreen,
}: {
  isFullscreen: boolean;
}) {
  const titlebarSpacerWidth = isMac && !isFullscreen ? 'w-[92px]' : 'w-4';
  const [sidebarOpen, setSidebarOpen] = useShellSidebarState();
  // 분리된 창은 옮겨 온 탭만 다룬다. 새 탭은 메인 창에서 연다.
  useTabCommands({ canCreateTabs: false });
  useNativeTabActions();

  return (
    <CtiProvider enabled={false}>
      <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <TabWorkspaceController autoCreateInitialTab={false} />
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
            <TabNavigationButtons className="pr-2" />
            <TabBar className="min-w-0" showNewTabButton={false} />
            {isWin ? <div className="w-[140px] shrink-0" aria-hidden /> : null}
          </header>
          <NativeTabViewport
            className="overflow-hidden"
            deferNativeFallback
            mountingFallback={<ShellSidebarFrame />}
          >
            <ShellSidebarFrame>
              <TabContent />
            </ShellSidebarFrame>
          </NativeTabViewport>
        </div>
      </SidebarProvider>
    </CtiProvider>
  );
}

/**
 * 셸이 직접 그리는 사이드바 + 화면 칸. 탭 화면이 붙으면 그 아래에 가려지고
 * 그리지 않는다. p-4는 TabContent 래퍼가 소유한다 — 페이지의 -mx-4 풀블리드가
 * 직접 부모의 패딩을 상쇄할 수 있어야 한다.
 */
function ShellSidebarFrame({ children }: { children?: ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
      <AppSidebar />
      <SidebarInset className="flex-1 min-h-0 min-w-0">
        <div className="flex flex-1 flex-col gap-4 min-h-0 min-w-0 overflow-auto">
          {children}
        </div>
      </SidebarInset>
    </div>
  );
}

function WindowAuthenticatedLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const isFullscreen = useFullscreen();
  const windowKind = useWindowKind();
  const isDetached = windowKind === 'detached';
  const userId = user?.id;
  const officeId = user?.office?.id;
  const workspaceOwner = useMemo(
    () =>
      typeof userId === 'string' && typeof officeId === 'string'
        ? { userId, officeId }
        : null,
    [officeId, userId],
  );

  const detachedInitialTabReady = useDetachedInitialTab(
    isDetached,
    workspaceOwner,
  );
  const mainWorkspaceReady = useWindowWorkspace(
    windowKind === 'main' && Boolean(workspaceOwner),
    workspaceOwner,
  );
  useCloseDetachedWindowWhenEmpty(isDetached, detachedInitialTabReady);

  if (
    isLoading ||
    windowKind === null ||
    (windowKind === 'main' && !mainWorkspaceReady) ||
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

interface NativeTabBootstrap {
  tabId: string;
  sidebarOpen: boolean;
}

/**
 * 탭 화면이 처음 그려지기 전에 자기 탭과 창의 사이드바 상태를 받아 둔다.
 * 받은 탭으로 useTabStore를 "자기 탭 하나만 담은 사본"으로 바꾼다.
 */
function useNativeTabBootstrap(): NativeTabBootstrap | null {
  const router = useRouter();
  const [bootstrap, setBootstrap] = useState<NativeTabBootstrap | null>(null);

  useEffect(() => {
    const surface = getRendererSurface();
    const bridge = window.electronBridge?.tabs;
    if (surface.kind !== 'native-tab' || !bridge) return;
    let cancelled = false;
    let uninstall: (() => void) | undefined;
    let unsubscribeAssign: (() => void) | undefined;
    // 미리 띄워 둔 예비 탭 화면은 실제 탭을 맡을 때까지 화면을 그리지 않는다.
    const isSpare = surface.tabId.startsWith(NATIVE_SPARE_TAB_ID_PREFIX);
    const ownTab: Promise<Tab | null> = isSpare
      ? new Promise((resolve) => {
          unsubscribeAssign = bridge.onAssign?.(({ tab }) => resolve(tab));
        })
      : (bridge.getNativeTabSnapshot?.() ?? Promise.resolve(null));

    void ownTab.then(async (snapshot) => {
      if (cancelled) return;
      if (isSpare && snapshot) {
        // 맡은 탭의 주소로 화면 안에서 옮긴다. 앱을 다시 띄우지 않는다.
        await router.navigate({ href: snapshot.route, replace: true });
      }
      const sidebar = (await bridge.getSidebarState?.()) ?? { open: true };
      if (cancelled) return;
      const route = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const meta = getRouteMeta(route);
      const tab: Tab = snapshot ?? {
        schemaVersion: 1,
        id: surface.tabId,
        kind: meta.kind,
        title: meta.title,
        route,
        resourceKey: resolveTabResourceKey(route, surface.tabId),
        createdAt: Date.now(),
      };
      uninstall = installNativeTabStoreBridge(tab, (action) =>
        bridge.sendTabAction?.(action),
      );
      setBootstrap({ tabId: tab.id, sidebarOpen: sidebar.open });
    });
    return () => {
      cancelled = true;
      unsubscribeAssign?.();
      uninstall?.();
    };
  }, [router]);

  return bootstrap;
}

function NativeTabAuthenticatedLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const bootstrap = useNativeTabBootstrap();
  if (isLoading || !bootstrap) return <SplashScreen />;
  if (!isAuthenticated || !user?.office) return <SplashScreen />;
  return (
    <NativeTabShell
      tabId={bootstrap.tabId}
      initialSidebarOpen={bootstrap.sidebarOpen}
    />
  );
}

/** 탭 화면(native 탭): 사이드바와 화면을 함께 그린다. 탭바는 창의 셸에 있다. */
function NativeTabShell({
  tabId,
  initialSidebarOpen,
}: {
  tabId: string;
  initialSidebarOpen: boolean;
}) {
  const [sidebarOpen, setSidebarOpen] = useNativeSidebarState(initialSidebarOpen);
  useEffect(() => {
    window.electronBridge?.tabs?.notifyReady?.();
  }, []);
  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="h-svh"
    >
      <NativeTabNavigationBridge />
      <NativeTabRouterBridge tabId={tabId} />
      <NativeTabRetentionReporter />
      <AppSidebar />
      <SidebarInset className="min-h-0 min-w-0 flex-1">
        <main
          data-window-shell="native-tab"
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto [overflow-anchor:none] bg-background p-4"
        >
          <Outlet />
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function NativeTabNavigationBridge() {
  useNativeTabMouseNavigation();
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey
      ) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement) || anchor.download) return;
      const rawHref = anchor.getAttribute('href');
      if (!rawHref?.startsWith('/')) return;
      if (resolveNativeTabRoute(rawHref)) return;
      const openInMainWindow = window.electronBridge?.tabs.openInMainWindow;
      if (!openInMainWindow) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void openInMainWindow(rawHref);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  return null;
}

function AuthenticatedLayout() {
  return getRendererSurface().kind === 'native-tab' ? (
    <NativeTabAuthenticatedLayout />
  ) : (
    <WindowAuthenticatedLayout />
  );
}

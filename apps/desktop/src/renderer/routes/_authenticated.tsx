import {
  createFileRoute,
  Navigate,
  Outlet,
  useRouter,
} from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import type { Tab } from '@estate-erp/shared';
import { SplashScreen } from '@/components/layout/splash-screen';
import { useAuth } from '@/providers/auth-provider';
import { AppSidebar } from '@/components/layout/app-sidebar';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
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
import { getPreviewTabBarPort } from '@/features/tabs/previewTabBarPort';
import { TabBarProvider } from '@/features/tabs/TabBar/tabBarContext';
import { CtiProvider } from '@/features/cti/cti-provider';
import { NativeTabRetentionReporter } from '@/features/tabs/native/NativeTabRetentionReporter';
import { getRendererSurface } from '@/features/tabs/native/rendererSurface';
import { installNativeTabStoreBridge } from '@/features/tabs/native/nativeTabStoreBridge';
import { NativeTabRouterBridge } from '@/features/tabs/native/NativeTabRouterBridge';
import { useNativeSidebarState } from '@/features/tabs/native/useWindowSidebarState';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { resolveTabResourceKey } from '@/features/tabs/lib/tabResource';
import {
  NATIVE_SPARE_TAB_ID_PREFIX,
  resolveNativeTabRoute,
} from '../../common/nativeTabs';

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
});

/**
 * 셸이 직접 그리는 사이드바 + 화면 칸. p-4는 TabContent 래퍼가 소유한다 — 페이지의
 * -mx-4 풀블리드가 직접 부모의 패딩을 상쇄할 수 있어야 한다.
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

/**
 * 브라우저 단독 미리보기(main이 없다): 탭 목록과 화면을 이 문서가 직접 갖고 그린다.
 * 창이 하나뿐이라 탭을 다른 창으로 옮기는 기능은 없다.
 */
function BrowserPreviewShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useTabCommands({ canCreateTabs: true });
  return (
    <TabBarProvider port={getPreviewTabBarPort()}>
    <SidebarProvider open={sidebarOpen} onOpenChange={setSidebarOpen}>
      <TabWorkspaceController />
      <div data-window-shell="main" className="flex h-screen w-full flex-col">
        <header className="app-titlebar flex h-10 shrink-0 items-center gap-0 border-b border-border bg-sidebar pr-2">
          <div className="app-titlebar-drag-region flex h-full w-(--sidebar-width) shrink-0 items-center gap-1 pl-4">
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
        </header>
        <div
          className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
          data-native-tab-legacy-fallback=""
        >
          <ShellSidebarFrame>
            <TabContent />
          </ShellSidebarFrame>
        </div>
      </div>
    </SidebarProvider>
    </TabBarProvider>
  );
}

function WindowAuthenticatedLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <SplashScreen />;

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (!user?.office) {
    return <Navigate to="/onboarding/office" />;
  }

  // Electron에서는 로그인 뒤의 창 화면이 이 문서가 아니다: main이 곧바로 탭바 문서로
  // 바꾸고, 화면은 탭마다의 탭 화면이 그린다. 바뀌기 전의 짧은 순간만 시작 화면을 보인다.
  if (window.electronBridge) return <SplashScreen />;

  return <BrowserPreviewShell />;
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
          // 이미 탭을 맡은 뒤에 이 문서가 다시 떴다면(새로 고침) 맡기는 신호는 다시 오지
          // 않는다. main이 이 화면에 맡긴 탭이 있는지 물어본다. 아직 예비 화면이면 없다.
          void bridge
            .getNativeTabSnapshot?.()
            .then((tab) => {
              if (tab) resolve(tab);
            })
            .catch(() => undefined);
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
  // 통화 상태의 주인은 main이다. 셸과 탭 화면은 같은 얇은 구독자를 쓴다.
  return (
    <CtiProvider>
      {getRendererSurface().kind === 'native-tab' ? (
        <NativeTabAuthenticatedLayout />
      ) : (
        <WindowAuthenticatedLayout />
      )}
    </CtiProvider>
  );
}

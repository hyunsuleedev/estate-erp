import {
  createFileRoute,
  Navigate,
  Outlet,
  useRouter,
} from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import type { Tab } from '@estate-erp/shared';
import type { NativeTabAction } from '../../common/nativeTabActions';
import { SplashScreen } from '@/components/layout/splash-screen';
import { useAuth } from '@/providers/auth-provider';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { RequiredNoticePopup } from '@/components/layout/required-notice-popup';
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
import {
  NativeTabRetentionReporter,
  blankTabRetentionUpdate,
} from '@/features/tabs/native/NativeTabRetentionReporter';
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
      <RequiredNoticePopup />
      <div data-window-shell="main" className="flex h-screen w-full flex-col">
        <header className="app-titlebar flex h-9 shrink-0 items-center gap-0 border-b border-border bg-sidebar pr-2">
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
  /**
   * 이 화면이 맡은 탭. 미리 띄워 둔 예비 화면은 탭을 맡기 전까지 null이다 —
   * 그동안에는 사이드바와 화면 틀만 그려 두고, 탭에 묶인 것(주소 알림, 입력 보호, 본문)은 달지 않는다.
   */
  tabId: string | null;
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

    if (isSpare) {
      // 예비 화면은 탭을 맡기 전에 사이드바와 화면 틀을 먼저 그려 둔다(Notion의 빈 탭과 같은 방식).
      // 새 탭을 열면 main이 이 화면을 곧바로 보여 주고, 본문만 그 뒤에 그려진다.
      // 본문(Outlet)은 탭을 맡은 뒤에만 그리므로, 아무도 열지 않은 화면이 서버를 부르지 않는다.
      void (bridge.getSidebarState?.() ?? Promise.resolve({ open: true }))
        .catch(() => ({ open: true }))
        .then((sidebar) => {
          if (cancelled) return;
          setBootstrap((current) => current ?? { tabId: null, sidebarOpen: sidebar.open });
        });
    }

    const sendAction = (action: NativeTabAction) => bridge.sendTabAction?.(action);

    void ownTab.then(async (snapshot) => {
      if (cancelled) return;
      // 본문이 비어 있는 지금 "저장 안 한 것 없음"을 알린다. 알리기 전에는 main이 이 탭을
      // 저장 전 작업이 있는 탭으로 보고, 사이드바 메뉴를 누르면 새 탭으로 연다.
      const cleanReport = snapshot ? blankTabRetentionUpdate(snapshot) : null;
      if (cleanReport) bridge.setRetention?.(cleanReport);
      if (isSpare && snapshot) {
        // 예비 화면은 탭을 맡는 순간 이미 사이드바가 보이고 눌린다. 그래서 탭 사본을 기다림
        // 없이 지금 건다 — 본문이 붙기 전에 누른 메뉴도 이 탭의 이동으로 main에 간다
        // (main이 돌려보내는 이동 명령은 받는 쪽이 붙을 때까지 preload가 들고 있다).
        uninstall = installNativeTabStoreBridge(snapshot, sendAction);
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
      uninstall ??= installNativeTabStoreBridge(tab, sendAction);
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
  /** 맡은 탭. 예비 화면이 탭을 맡기 전에는 null이고, 그때는 틀만 그린다. */
  tabId: string | null;
  initialSidebarOpen: boolean;
}) {
  // 사이드바 상태는 창의 것이다. 틀을 먼저 그린 예비 화면도 main이 보내는 값을 계속 따른다
  // (탭을 맡기 직전에 그 창의 값을 한 번 더 보낸다).
  const [sidebarOpen, setSidebarOpen] = useNativeSidebarState(initialSidebarOpen);
  useEffect(() => {
    // 사이드바와 틀을 그렸다는 신호. 예비 화면은 탭을 맡기 전에 이미 보내 두므로,
    // 새 탭을 열면 main이 기다리지 않고 바로 보여 준다.
    window.electronBridge?.tabs?.notifyReady?.();
  }, []);
  const assigned = tabId !== null;
  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      className="h-svh"
    >
      {/* 링크·마우스 옆 단추 처리는 탭에 묶이지 않는다. 틀이 보이는 순간부터 걸어 둔다. */}
      <NativeTabNavigationBridge />
      {assigned ? (
        <>
          <NativeTabRouterBridge tabId={tabId} />
          <NativeTabRetentionReporter />
          {/* 안 읽은 필독 공지는 앱을 열 때 팝업으로 띄운다. 탭 화면마다 뜨고, 한 곳에서 확인하면 함께 닫힌다. */}
          <RequiredNoticePopup />
        </>
      ) : null}
      <AppSidebar />
      <SidebarInset className="min-h-0 min-w-0 flex-1">
        <main
          data-window-shell="native-tab"
          data-tab-assigned={assigned ? "" : undefined}
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto [overflow-anchor:none] bg-background p-4"
        >
          {/* 본문은 탭을 맡은 뒤에만 그린다. 그 전의 예비 화면은 빈 본문으로 기다린다. */}
          {assigned ? <Outlet /> : null}
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

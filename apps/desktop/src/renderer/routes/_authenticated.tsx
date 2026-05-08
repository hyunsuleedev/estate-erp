import { createFileRoute, Outlet, Navigate, useMatches } from '@tanstack/react-router';
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

const routeLabels: Record<string, string> = {
  '/_authenticated/dashboard': '대시보드',
  '/_authenticated/buyer-requirements/': '구매고객',
  '/_authenticated/consultations/': '상담기록',
  '/_authenticated/properties/': '매물관리',
  '/_authenticated/properties/$id': '매물 상세',
  '/_authenticated/properties/new': '매물 등록',
  '/_authenticated/contacts/': '연락처',
  '/_authenticated/contacts/$id': '연락처 상세',
  '/_authenticated/contacts/new': '연락처 추가',
  '/_authenticated/deals/': '거래관리',
  '/_authenticated/matches/': '매칭',
  '/_authenticated/tasks/': '업무',
  '/_authenticated/calendar/': '캘린더',
  '/_authenticated/sites/': '관리단지',
  '/_authenticated/contracts/': '계약서 관리',
  '/_authenticated/network/': '네트워크',
  '/_authenticated/ai-operations/': 'AI 운영',
  '/_authenticated/employees/': '직원관리',
  '/_authenticated/settings/': '설정',
};

const isMac = window.electronBridge?.platform === 'darwin';

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
    // Get initial state
    window.electronBridge?.isFullscreen().then(setIsFullscreen);
    // Listen for changes
    const cleanup = window.electronBridge?.onFullscreenChanged(setIsFullscreen);
    return cleanup;
  }, []);

  return isFullscreen;
}

function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const matches = useMatches();
  const isFullscreen = useFullscreen();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-muted-foreground">로딩 중...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  const currentMatch = matches[matches.length - 1];
  const currentLabel = routeLabels[currentMatch?.routeId] ?? '';
  const parentLabel = matches.length > 2
    ? routeLabels[matches[matches.length - 2]?.routeId]
    : undefined;

  // macOS windowed: 80px for traffic lights, fullscreen/other platforms: 16px
  const titlebarLeftPadding = isMac && !isFullscreen ? 'pl-[80px]' : 'pl-4';

  return (
    <SidebarProvider>
      <ElectronSidebarBridge />
      <div className="flex h-screen w-full flex-col">
        {/* Titlebar: spans full width, above sidebar + content */}
        <header className="app-titlebar flex h-12 shrink-0 items-center border-b border-border bg-sidebar">
          <div
            className={`flex items-center gap-1 ${titlebarLeftPadding}`}
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mx-1 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {parentLabel && (
                  <>
                    <BreadcrumbItem className="text-xs">
                      {parentLabel}
                    </BreadcrumbItem>
                    <BreadcrumbSeparator />
                  </>
                )}
                <BreadcrumbItem>
                  <BreadcrumbPage className="text-xs font-medium">
                    {currentLabel}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </header>

        {/* Sidebar + Content below titlebar */}
        <div className="flex flex-1 overflow-hidden">
          <AppSidebar />
          <SidebarInset className="flex-1 min-h-0 min-w-0">
            <div className="flex flex-1 flex-col gap-4 p-4 min-h-0 min-w-0 overflow-auto">
              <Outlet />
            </div>
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}

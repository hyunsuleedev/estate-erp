import { useEffect } from 'react';
import { createFileRoute, Outlet, useMatches, useLocation, useNavigate } from '@tanstack/react-router';
import { SplashScreen } from '@/components/layout/splash-screen';
import { useAuth } from '@/providers/auth-provider';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { GlobalSearch } from '@/components/layout/global-search';
import { NotificationBell } from '@/components/layout/notification-bell';
import { QuickCreate } from '@/components/layout/quick-create';
import { getBreadcrumb, getNavIcon } from '@/components/layout/nav-config';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const matches = useMatches();
  const location = useLocation();
  const navigate = useNavigate();
  const redirectTo = !isLoading
    ? !isAuthenticated
      ? '/login'
      : !user?.office
        ? '/onboarding/office'
        : null
    : null;

  useEffect(() => {
    if (!redirectTo) return;
    void navigate({ to: redirectTo });
  }, [navigate, redirectTo]);

  if (isLoading || redirectTo) {
    return <SplashScreen />;
  }

  const currentMatch = matches[matches.length - 1];
  // 페이지 타이틀은 nav-config의 IA/라벨 맵에서 derive — 마지막 크럼 = 현재 페이지
  const crumbs = getBreadcrumb(currentMatch?.routeId ?? '', location.pathname, user?.role);
  const pageTitle = crumbs[crumbs.length - 1]?.label ?? '';
  const PageIcon = getNavIcon(location.pathname);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh min-h-0 min-w-0">
        {/* 디자인(Estate ERP 웹.dc.html) 헤더: 48px · 페이지 아이콘+타이틀 · 전체 검색 · 벨 */}
        <header className="flex h-12 shrink-0 items-center justify-between gap-2.5 border-b bg-background px-[18px]">
          <div className="flex min-w-0 items-center gap-2.5">
            <SidebarTrigger className="-ml-1 text-muted-foreground" />
            <Separator orientation="vertical" className="data-[orientation=vertical]:h-[18px]" />
            {PageIcon && (
              <PageIcon className="size-[17px] shrink-0 text-[#9b9893]" aria-hidden="true" />
            )}
            <span className="truncate text-[14.5px] font-semibold text-foreground">
              {pageTitle}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <GlobalSearch />
            <NotificationBell />
            <QuickCreate />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 min-h-0 min-w-0 overflow-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

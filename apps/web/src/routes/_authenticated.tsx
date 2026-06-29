import { Fragment } from 'react';
import { createFileRoute, Outlet, Navigate, useMatches, useLocation, Link } from '@tanstack/react-router';
import { SplashScreen } from '@/components/layout/splash-screen';
import { useAuth } from '@/providers/auth-provider';
import { AppSidebar } from '@/components/layout/app-sidebar';
import { GlobalSearch } from '@/components/layout/global-search';
import { NotificationBell } from '@/components/layout/notification-bell';
import { QuickCreate } from '@/components/layout/quick-create';
import { getBreadcrumb } from '@/components/layout/nav-config';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const matches = useMatches();
  const location = useLocation();

  if (isLoading) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  if (!user?.office) {
    return <Navigate to="/onboarding/office" />;
  }

  const currentMatch = matches[matches.length - 1];
  // 브레드크럼은 nav-config의 IA/라벨 맵에서 자동 derive (그룹 > 페이지 > 상세)
  const crumbs = getBreadcrumb(currentMatch?.routeId ?? '', location.pathname);

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh min-h-0 min-w-0">
        <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b px-4">
          <div className="flex min-w-0 items-center gap-2">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-4" />
            <Breadcrumb>
              <BreadcrumbList>
                {crumbs.map((crumb, index) => {
                  const isLast = index === crumbs.length - 1;
                  return (
                    <Fragment key={`${crumb.label}-${index}`}>
                      {index > 0 && <BreadcrumbSeparator />}
                      <BreadcrumbItem className="text-xs">
                        {isLast ? (
                          <BreadcrumbPage className="text-xs font-medium">
                            {crumb.label}
                          </BreadcrumbPage>
                        ) : crumb.to ? (
                          <BreadcrumbLink asChild>
                            <Link to={crumb.to}>{crumb.label}</Link>
                          </BreadcrumbLink>
                        ) : (
                          crumb.label
                        )}
                      </BreadcrumbItem>
                    </Fragment>
                  );
                })}
              </BreadcrumbList>
            </Breadcrumb>
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

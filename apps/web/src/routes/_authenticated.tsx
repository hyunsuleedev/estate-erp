import { createFileRoute, Outlet, Navigate, useMatches } from '@tanstack/react-router';
import { useAuth } from '@/providers/auth-provider';
import { AppSidebar } from '@/components/layout/app-sidebar';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
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

export const Route = createFileRoute('/_authenticated')({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const matches = useMatches();

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

  if (!user?.office) {
    return <Navigate to="/onboarding/office" />;
  }

  const currentMatch = matches[matches.length - 1];
  const currentLabel = routeLabels[currentMatch?.routeId] ?? '';
  const parentLabel = matches.length > 2
    ? routeLabels[matches[matches.length - 2]?.routeId]
    : undefined;

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="h-svh min-h-0 min-w-0">

        <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex items-center gap-2 px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
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
        <div className="flex flex-1 flex-col gap-4 p-4 pt-0 min-h-0 min-w-0 overflow-auto">
          <Outlet />
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

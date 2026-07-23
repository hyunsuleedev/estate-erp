import { createFileRoute, redirect } from '@tanstack/react-router';
import { Building2, LayoutDashboard } from 'lucide-react';

import { AppSidebar } from '@/components/layout/app-sidebar';
import { ShellThemeSwitcher } from '@/components/layout/shell-theme-switcher';
import {
  SHELL_THEMES,
  ShellThemeProvider,
  useShellTheme,
} from '@/providers/shell-theme-provider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/**
 * 셸 테마(사이드바/배경) 시안 비교용 dev 전용 프리뷰.
 * 백엔드 로그인 없이 실제 AppSidebar + 헤더 + 더미 본문으로 6종 테마를 비교한다.
 * http://localhost:5173/dev/shell-preview
 */
export const Route = createFileRoute('/dev/shell-preview')({
  beforeLoad: () => {
    if (!import.meta.env.DEV) {
      throw redirect({ to: '/' });
    }
  },
  component: ShellPreviewPage,
});

const DEMO_ROWS = [
  {
    address: '고덕그라시움 101동 1503호',
    type: '매매',
    price: '15.8억',
    status: '확인완료',
    owner: '김소유',
    next: '소유자 재연락 (7/19)',
  },
  {
    address: '고덕그라시움 103동 702호',
    type: '전세',
    price: '7.2억',
    status: '미확인',
    owner: '이영희',
    next: '광고 만료 D-3',
  },
  {
    address: '래미안힐스테이트 205동 1201호',
    type: '매매',
    price: '18.5억',
    status: '계약중',
    owner: '박재물',
    next: '중도금 일정 확인',
  },
  {
    address: '고덕아르테온 112동 902호',
    type: '월세',
    price: '3억/120',
    status: '확인완료',
    owner: '정부자',
    next: '매칭 2건 검토',
  },
];

function ShellPreviewPage() {
  return (
    <ShellThemeProvider>
      <ShellPreviewShell />
    </ShellThemeProvider>
  );
}

function ShellPreviewShell() {
  const { theme, themeId, setThemeId } = useShellTheme();

  return (
    <SidebarProvider
      style={{ '--sidebar-width': theme.sidebarWidth } as React.CSSProperties}
    >
      <AppSidebar variant={theme.sidebarVariant} />
      <SidebarInset className="h-svh min-h-0 min-w-0">
        <header className="flex h-12 shrink-0 items-center justify-between gap-2.5 border-b bg-background px-[18px]">
          <div className="flex min-w-0 items-center gap-2.5">
            <SidebarTrigger className="-ml-1 text-muted-foreground" />
            <Separator
              orientation="vertical"
              className="data-[orientation=vertical]:h-[18px]"
            />
            <LayoutDashboard
              className="size-[17px] shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span className="truncate text-[14.5px] font-semibold text-foreground">
              셸 테마 프리뷰
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ShellThemeSwitcher />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
          {/* 테마 빠른 전환 바 */}
          <div className="flex flex-wrap items-center gap-1.5">
            {SHELL_THEMES.map((t) => (
              <Button
                key={t.id}
                size="sm"
                variant={t.id === themeId ? 'default' : 'outline'}
                className="h-7 px-2.5 text-xs"
                onClick={() => setThemeId(t.id)}
              >
                {t.label}
              </Button>
            ))}
            <span className="ml-2 text-xs text-muted-foreground">
              {theme.description}
            </span>
          </div>

          {/* KPI 카드 — 배경/표면 계층 확인용 */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[
              { label: '오늘 처리할 일', value: '5건', sub: '연락 3 · 검증 2' },
              { label: '이번 달 수금 예정', value: '2,340만원', sub: '거래 4건' },
              { label: '광고 만료 임박', value: '3건', sub: 'D-3 이내' },
            ].map((kpi) => (
              <Card key={kpi.label} className="shadow-none">
                <CardHeader className="pb-1">
                  <CardDescription className="text-xs">
                    {kpi.label}
                  </CardDescription>
                  <CardTitle className="text-xl tabular-nums">
                    {kpi.value}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-muted-foreground">
                  {kpi.sub}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 데이터 표 — 행 밀도/선택 상태 확인용 */}
          <Card className="shadow-none">
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <div className="flex items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" />
                <CardTitle className="text-sm">매물장 (더미)</CardTitle>
              </div>
              <Button size="sm" className="h-7 text-xs">
                + 매물 등록
              </Button>
            </CardHeader>
            <CardContent className="pt-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>주소</TableHead>
                    <TableHead>거래</TableHead>
                    <TableHead className="text-right">가격</TableHead>
                    <TableHead>상태</TableHead>
                    <TableHead>소유자</TableHead>
                    <TableHead>다음 행동</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DEMO_ROWS.map((row) => (
                    <TableRow key={row.address}>
                      <TableCell className="font-medium">
                        {row.address}
                      </TableCell>
                      <TableCell>{row.type}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.price}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[11px]">
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.owner}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.next}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

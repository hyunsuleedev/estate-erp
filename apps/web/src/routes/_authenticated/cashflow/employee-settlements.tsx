import { createFileRoute } from '@tanstack/react-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  AlertCircle,
  CircleCheck,
  Lock,
  TrendingUp,
  Users as UsersIcon,
} from 'lucide-react';
import type { Employee, EmployeePerformance } from '@estate-erp/api-client';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

export const Route = createFileRoute('/_authenticated/cashflow/employee-settlements')({
  component: EmployeeSettlementsPage,
});

function toEok(manwon: number): string {
  const sign = manwon < 0 ? '-' : '';
  const abs = Math.abs(manwon);
  if (abs >= 10000) return `${sign}${(abs / 10000).toFixed(1)}억`;
  return `${sign}${abs.toLocaleString()}만`;
}

const roleLabel: Record<string, string> = {
  owner: '대표',
  manager: '매니저',
  agent: '중개사',
};

type Row = {
  employee: Employee;
  performance: EmployeePerformance | undefined;
  isLoading: boolean;
};

function EmployeeSettlementsPage() {
  const { user } = useAuth();
  const canView = user?.role === 'owner' || user?.role === 'manager';

  const { data: employees, isLoading: loadingList } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.employees.findAll(),
    enabled: canView,
  });

  if (!canView) return <AccessDenied />;


  const perfQueries = useQueries({
    queries: (employees ?? []).map((e) => ({
      queryKey: ['employees', e.id, 'performance'],
      queryFn: () => api.employees.getPerformance(e.id),
      enabled: !!employees,
    })),
  });

  const rows: Row[] = useMemo(() => {
    return (employees ?? []).map((e, i) => ({
      employee: e,
      performance: perfQueries[i]?.data,
      isLoading: perfQueries[i]?.isLoading ?? false,
    }));
  }, [employees, perfQueries]);

  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          (b.performance?.commissionAmountTotal ?? 0) -
          (a.performance?.commissionAmountTotal ?? 0),
      ),
    [rows],
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        commissionTotal: acc.commissionTotal + (r.performance?.commissionAmountTotal ?? 0),
        unsettled: acc.unsettled + r.employee.counts.unsettledDealCount,
        activeDeals: acc.activeDeals + r.employee.counts.activeDealCount,
      }),
      { commissionTotal: 0, unsettled: 0, activeDeals: 0 },
    );
  }, [rows]);

  const activeEmployees = (employees ?? []).filter((e) => e.isActive).length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">직원 정산</h1>
        <p className="text-sm text-muted-foreground">
          직원별 거래 참여 수수료와 미정산 거래 현황을 집계합니다.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard
          icon={<UsersIcon className="size-4" />}
          label="활성 직원"
          value={`${activeEmployees}명`}
        />
        <SummaryCard
          icon={<TrendingUp className="size-4" />}
          label="누적 배분 수수료"
          value={toEok(totals.commissionTotal)}
          highlight
        />
        <SummaryCard
          icon={<CircleCheck className="size-4" />}
          label="진행 거래"
          value={`${totals.activeDeals}건`}
        />
        <SummaryCard
          icon={<AlertCircle className="size-4" />}
          label="미정산 거래"
          value={`${totals.unsettled}건`}
          warn={totals.unsettled > 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">직원별 정산 내역</CardTitle>
          <CardDescription>
            배분 수수료 누적액 내림차순으로 정렬됩니다.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <Skeleton className="h-60 rounded-lg" />
          ) : sorted.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>직원</TableHead>
                    <TableHead>역할</TableHead>
                    <TableHead className="text-right">진행 거래</TableHead>
                    <TableHead className="text-right">미정산</TableHead>
                    <TableHead className="text-right">배분 수수료</TableHead>
                    <TableHead className="text-right">진행 업무</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map(({ employee, performance, isLoading }) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{employee.name}</span>
                          {employee.phone && (
                            <span className="text-xs text-muted-foreground">
                              {employee.phone}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {roleLabel[employee.role] ?? employee.role}
                        </Badge>
                        {!employee.isActive && (
                          <Badge className="ml-1 bg-muted text-muted-foreground" variant="outline">
                            비활성
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {employee.counts.activeDealCount}건
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {employee.counts.unsettledDealCount > 0 ? (
                          <Badge className="border-0 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                            {employee.counts.unsettledDealCount}건
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">0건</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                        {isLoading ? (
                          <Skeleton className="ml-auto h-4 w-16" />
                        ) : (
                          toEok(performance?.commissionAmountTotal ?? 0)
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {employee.counts.activeTaskCount}건
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  highlight,
  warn,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  const valueClass = highlight
    ? 'mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400'
    : warn
      ? 'mt-1 text-lg font-semibold text-amber-600 dark:text-amber-400'
      : 'mt-1 text-lg font-semibold';
  return (
    <Card className="py-4">
      <CardContent className="flex items-center justify-between gap-3 px-4">
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className={valueClass}>{value}</p>
        </div>
        <div className="rounded-md bg-muted/60 p-2 text-muted-foreground">{icon}</div>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed bg-muted/30 p-10 text-center">
      <UsersIcon className="mx-auto size-8 text-muted-foreground" />
      <p className="mt-3 text-sm font-medium">등록된 직원이 없습니다</p>
      <p className="mt-1 text-xs text-muted-foreground">
        직원관리 메뉴에서 직원을 추가하면 이 화면에 배분 수수료가 집계됩니다.
      </p>
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">직원 정산</h1>
        <p className="text-sm text-muted-foreground">
          전 직원 정산 현황은 대표와 매니저만 조회할 수 있습니다.
        </p>
      </div>
      <div className="rounded-xl border border-dashed bg-muted/30 p-10 text-center">
        <Lock className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-3 text-sm font-medium">접근 권한이 없습니다</p>
        <p className="mt-1 text-xs text-muted-foreground">
          본인 정산 내역은 좌측 “내 수수료”에서 확인할 수 있습니다.
        </p>
      </div>
    </div>
  );
}

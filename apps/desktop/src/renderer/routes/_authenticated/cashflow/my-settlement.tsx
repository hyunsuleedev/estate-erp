import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  AlertCircle,
  CircleCheck,
  Handshake,
  RotateCw,
  TrendingUp,
} from 'lucide-react';
import type { EmployeeDealParticipant } from '@estate-erp/api-client';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import { EmptyState, PageHeader } from '@/components/domain';
import { Button } from '@/components/ui/button';
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

export const Route = createFileRoute('/_authenticated/cashflow/my-settlement')({
  component: MySettlementPage,
});

const roleLabel: Record<string, string> = {
  listing_agent: '매도측',
  buying_agent: '매수측',
  dual_agent: '단독중개',
  manager: '관리',
  assistant: '보조',
  closer: '마감',
};

const stageLabel: Record<string, string> = {
  selection: '선정',
  deposit: '계약금',
  contract: '계약',
  contracted: '계약 체결',
  completed: '완료',
  closed: '종결',
};

function MySettlementPage() {
  const { user } = useAuth();
  const myId = user?.id;

  const { data: me, isLoading, isError, refetch } = useQuery({
    queryKey: ['employees', myId],
    queryFn: () => api.employees.findOne(myId!),
    enabled: !!myId,
  });

  const participants = useMemo<EmployeeDealParticipant[]>(
    () => me?.dealParticipants ?? [],
    [me],
  );

  const sorted = useMemo(
    () =>
      [...participants].sort(
        (a, b) =>
          new Date(b.deal.stageChangedAt).getTime() -
          new Date(a.deal.stageChangedAt).getTime(),
      ),
    [participants],
  );

  const totals = useMemo(() => {
    return participants.reduce(
      (acc, p) => {
        const isSettled = p.settlementStatus === 'settled';
        const amount = p.commissionAmount ?? 0;
        return {
          total: acc.total + amount,
          settled: acc.settled + (isSettled ? amount : 0),
          unsettled: acc.unsettled + (isSettled ? 0 : amount),
          unsettledCount: acc.unsettledCount + (isSettled ? 0 : 1),
        };
      },
      { total: 0, settled: 0, unsettled: 0, unsettledCount: 0 },
    );
  }, [participants]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="내 수수료"
        description="내가 참여한 거래와 배분 수수료, 정산 상태를 확인합니다. 정산 처리는 사무소 정책에 따라 대표가 진행합니다."
      />

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard
          icon={<Handshake className="size-4" />}
          label="참여 거래"
          value={`${participants.length}건`}
        />
        <SummaryCard
          icon={<TrendingUp className="size-4" />}
          label="누적 배분 수수료"
          value={formatMoney(totals.total)}
          highlight
        />
        <SummaryCard
          icon={<CircleCheck className="size-4" />}
          label="정산 완료"
          value={formatMoney(totals.settled)}
        />
        <SummaryCard
          icon={<AlertCircle className="size-4" />}
          label="미정산"
          value={`${formatMoney(totals.unsettled)} (${totals.unsettledCount}건)`}
          warn={totals.unsettledCount > 0}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">내 거래 내역</CardTitle>
          <CardDescription>최근 거래 순으로 표시됩니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-md" />
              ))}
            </div>
          ) : isError ? (
            <EmptyState
              icon={Handshake}
              title="정산 내역을 불러오지 못했습니다"
              description="네트워크 상태를 확인한 뒤 다시 시도해주세요."
              action={
                <Button variant="outline" onClick={() => refetch()}>
                  <RotateCw className="size-4" />
                  다시 시도
                </Button>
              }
            />
          ) : sorted.length === 0 ? (
            <EmptyState
              icon={Handshake}
              title="아직 참여한 거래가 없습니다"
              description="거래에 참여하면 이 화면에 내 배분 수수료가 집계됩니다."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>거래</TableHead>
                    <TableHead>단계</TableHead>
                    <TableHead>역할</TableHead>
                    <TableHead className="text-right">배분률</TableHead>
                    <TableHead className="text-right">배분액</TableHead>
                    <TableHead>정산 상태</TableHead>
                    <TableHead>정산일</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((p) => {
                    const settled = p.settlementStatus === 'settled';
                    const site = p.deal.property?.site;
                    const title = site
                      ? [site.name, p.deal.property?.unit?.name]
                          .filter(Boolean)
                          .join(' · ')
                      : '(매물 정보 없음)';
                    return (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{title}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDate(p.deal.stageChangedAt)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {stageLabel[p.deal.stage] ?? p.deal.stage}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {roleLabel[p.role] ?? p.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {p.commissionRate != null
                            ? `${Number(p.commissionRate).toFixed(0)}%`
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-emerald-600 dark:text-emerald-400">
                          {formatMoney(p.commissionAmount ?? 0)}
                        </TableCell>
                        <TableCell>
                          {settled ? (
                            <Badge className="border-0 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                              정산 완료
                            </Badge>
                          ) : (
                            <Badge className="border-0 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                              미정산
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(p.settlementDate)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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


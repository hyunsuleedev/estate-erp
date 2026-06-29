import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, Lock } from 'lucide-react';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuth } from '@/providers/auth-provider';
import { PageHeader } from '@/components/domain';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActivityTab } from './-activity-tab';
import { PrinciplesTab } from './-principles-tab';
import { ProposalsTab, summarizeProposals } from './-proposals-tab';
import { RulesTab } from './-rules-tab';

export const Route = createFileRoute('/_authenticated/ai-operations/')({
  component: AiOperationsPage,
});

function AiOperationsPage() {
  const { user } = useAuth();
  const role = user?.role ?? 'agent';
  const canManage = role === 'owner' || role === 'manager';

  const [tab, setTab] = useState('rules');

  // KPI 집계용 — 각 탭의 쿼리와 동일한 queryKey라 캐시를 공유한다 (중복 패칭 없음)
  const rulesQuery = useQuery({
    queryKey: ['agent-rules'],
    queryFn: () => api.rules.list(),
  });
  const proposalsQuery = useQuery({
    queryKey: ['proposals', 'all'],
    queryFn: () => api.proposals.list(),
  });

  const stats = useMemo(
    () => summarizeProposals(proposalsQuery.data),
    [proposalsQuery.data],
  );
  const activeRules = (rulesQuery.data ?? []).filter((r) => r.isActive).length;
  const totalRules = rulesQuery.data?.length ?? 0;
  const kpiLoading = rulesQuery.isLoading || proposalsQuery.isLoading;

  return (
    <div className="flex flex-col">
      <PageHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Bot className="size-5 text-primary" />
            AI 운영
          </span>
        }
        description="규칙 기반 자동화와 AI 제안을 사장님이 직접 통제하는 운영 콘솔입니다. 민감한 액션은 승인 없이는 실행되지 않습니다."
        actions={
          <Badge variant="outline" className="w-fit">
            Control Plane Draft
          </Badge>
        }
      />

      {!canManage && (
        <Alert className="mb-4">
          <Lock className="size-4" />
          <AlertDescription>
            AI 운영 콘솔은 사장님(owner)·매니저 전용 화면입니다. 현재 읽기 전용으로
            표시되며 규칙 변경과 제안 승인/반려는 할 수 없습니다.
          </AlertDescription>
        </Alert>
      )}

      {/* KPI 요약 — 클라이언트 집계 (규칙 + 제안) */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="활성 규칙"
          loading={kpiLoading}
          value={`${activeRules}`}
          sub={totalRules > 0 ? `전체 ${totalRules}개` : undefined}
        />
        <KpiCard
          label="승인 대기"
          loading={kpiLoading}
          value={`${stats.pending}`}
          sub={stats.pendingUrgent > 0 ? `긴급 ${stats.pendingUrgent}건` : undefined}
          tone={stats.pendingUrgent > 0 ? 'warn' : undefined}
        />
        <KpiCard label="오늘 생성된 제안" loading={kpiLoading} value={`${stats.today}`} />
        <KpiCard
          label="처리 결과 (누적)"
          loading={kpiLoading}
          value={`승인 ${stats.approved} · 반려 ${stats.rejected} · 자동 ${stats.auto}`}
          sub={stats.failed > 0 ? `실패 ${stats.failed}건` : undefined}
          tone={stats.failed > 0 ? 'warn' : undefined}
          small
        />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="rules">규칙</TabsTrigger>
            <TabsTrigger value="proposals">
              제안 이력
              {stats.pending > 0 && (
                <span className="ml-1 rounded-full bg-warning-soft px-1.5 text-[10px] font-medium text-warning tabular-nums">
                  {stats.pending}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="logs">실행 로그</TabsTrigger>
            <TabsTrigger value="principles">운영 원칙</TabsTrigger>
          </TabsList>
          <Button asChild variant="ghost" size="sm" className="text-xs text-muted-foreground">
            <Link to="/inbox">업무함(승인 큐)으로 이동 →</Link>
          </Button>
        </div>

        <TabsContent value="rules" className="mt-3">
          <RulesTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="proposals" className="mt-3">
          <ProposalsTab canManage={canManage} />
        </TabsContent>
        <TabsContent value="logs" className="mt-3">
          <ActivityTab />
        </TabsContent>
        <TabsContent value="principles" className="mt-3">
          <PrinciplesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KpiCard({
  label,
  value,
  sub,
  tone,
  loading,
  small,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'warn';
  loading?: boolean;
  small?: boolean;
}) {
  return (
    <div className="rounded-md border bg-background px-3 py-2.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      {loading ? (
        <Skeleton className="mt-1.5 h-6 w-20" />
      ) : (
        <p
          className={cn(
            'mt-0.5 font-semibold tabular-nums',
            small ? 'text-sm leading-7' : 'text-lg',
            tone === 'warn' && 'text-warning',
          )}
        >
          {value}
        </p>
      )}
      {!loading && sub && (
        <p className={cn('text-[11px]', tone === 'warn' ? 'text-warning' : 'text-muted-foreground')}>
          {sub}
        </p>
      )}
    </div>
  );
}

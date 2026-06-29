import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarClock, RefreshCw, Settings2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentRule } from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { EmptyState } from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { describeCron, getErrorMessage } from './-shared';

/** Rule.config의 원시값만 칩으로 표시 (객체/배열은 생략) */
function configEntries(config: Record<string, unknown>): Array<[string, string]> {
  return Object.entries(config)
    .filter(([, v]) => ['string', 'number', 'boolean'].includes(typeof v))
    .slice(0, 6)
    .map(([k, v]) => [k, String(v)]);
}

export function RulesTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();

  const {
    data: rules,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['agent-rules'],
    queryFn: () => api.rules.list(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ name, isActive }: { name: string; isActive: boolean }) =>
      api.rules.update(name, { isActive }),
    onSuccess: (_data, vars) => {
      toast.success(
        vars.isActive ? '규칙을 활성화했습니다' : '규칙을 비활성화했습니다',
      );
      void queryClient.invalidateQueries({ queryKey: ['agent-rules'] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      void queryClient.invalidateQueries({ queryKey: ['agent-rules'] });
    },
  });

  if (isLoading) {
    return (
      <div className="grid gap-3 xl:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border py-12">
        <p className="text-sm text-muted-foreground">규칙 목록을 불러오지 못했습니다.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="size-3.5" />
          다시 시도
        </Button>
      </div>
    );
  }

  if (!rules || rules.length === 0) {
    return (
      <EmptyState
        icon={Settings2}
        title="등록된 규칙이 없습니다"
        description="서버에 자동화 규칙이 시드되면 이 화면에서 켜고 끌 수 있습니다."
      />
    );
  }

  const pendingName = toggleMutation.isPending
    ? toggleMutation.variables?.name
    : null;

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {rules.map((rule) => (
        <RuleCard
          key={rule.name}
          rule={rule}
          canManage={canManage}
          toggling={pendingName === rule.name}
          onToggle={(isActive) => toggleMutation.mutate({ name: rule.name, isActive })}
        />
      ))}
    </div>
  );
}

function RuleCard({
  rule,
  canManage,
  toggling,
  onToggle,
}: {
  rule: AgentRule;
  canManage: boolean;
  toggling: boolean;
  onToggle: (isActive: boolean) => void;
}) {
  const scheduleText = describeCron(rule.schedule);
  const entries = configEntries(rule.config ?? {});
  // 시드 전 규칙은 PATCH 대상 레코드가 없어 토글이 실패함 → 비활성 처리
  const switchDisabled = !canManage || !rule.seeded || toggling;

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
              <span className="truncate">{rule.displayName}</span>
              {rule.isSystem && (
                <Badge variant="outline" className="text-[10px]">
                  시스템
                </Badge>
              )}
              <span className="font-mono text-[10px] font-normal text-muted-foreground">
                {rule.version}
              </span>
            </CardTitle>
            {rule.description && (
              <CardDescription className="text-xs leading-5">
                {rule.description}
              </CardDescription>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <Switch
              checked={rule.isActive}
              disabled={switchDisabled}
              onCheckedChange={(checked) => onToggle(checked)}
              aria-label={`${rule.displayName} 활성화`}
            />
            <span className="text-[11px] text-muted-foreground">
              {rule.isActive ? '사용중' : '중지됨'}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {rule.triggerType === 'schedule' ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" />
              {scheduleText ?? '스케줄 미지정'}
              {rule.schedule && scheduleText !== rule.schedule && (
                <span className="font-mono text-[10px] text-muted-foreground/70">
                  ({rule.schedule})
                </span>
              )}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <Zap className="size-3.5" />
              이벤트: <span className="font-mono">{rule.eventName ?? '—'}</span>
            </span>
          )}
        </div>
        {entries.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {entries.map(([key, value]) => (
              <span
                key={key}
                className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
              >
                {key}: {value}
              </span>
            ))}
          </div>
        )}
        {!rule.seeded && (
          <p className="text-[11px] text-warning">
            서버 동기화 대기중 — 시드가 완료되면 켜고 끌 수 있습니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

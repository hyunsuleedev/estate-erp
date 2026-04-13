import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Info, Landmark, Lock, Zap } from 'lucide-react';
import type { AgentRule } from '@estate-erp/api-client';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

export const Route = createFileRoute('/_authenticated/ai-operations/rules')({
  component: RulesPage,
});

function RulesPage() {
  const queryClient = useQueryClient();

  const { data: rules, isLoading } = useQuery({
    queryKey: ['agent-rules'],
    queryFn: () => api.rules.list(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ name, isActive }: { name: string; isActive: boolean }) =>
      api.rules.update(name, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-rules'] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : '규칙 상태를 변경하지 못했어요',
      );
    },
  });

  return (
    <div className="flex flex-col gap-6">
      {isLoading ? (
        <div className="grid gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : !rules || rules.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">등록된 규칙이 없어요</CardTitle>
            <CardDescription>
              서버가 시작되면 시스템 규칙이 자동으로 등록돼요. 잠시 후 다시 확인해주세요.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {rules.map((rule) => (
            <RuleCard
              key={rule.name}
              rule={rule}
              onToggle={(isActive) =>
                toggleMutation.mutate({ name: rule.name, isActive })
              }
              pending={
                toggleMutation.isPending &&
                toggleMutation.variables?.name === rule.name
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RuleCard({
  rule,
  onToggle,
  pending,
}: {
  rule: AgentRule;
  onToggle: (isActive: boolean) => void;
  pending: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <RuleIcon rule={rule} />
            </div>
            <div className="space-y-1">
              <CardTitle className="text-base leading-snug">
                {rule.displayName}
              </CardTitle>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <OriginBadge rule={rule} />
                <Badge variant="outline">{formatTrigger(rule)}</Badge>
                <code className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
                  {rule.name}@{rule.version}
                </code>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {rule.isSystem && (
              <span className="hidden items-center gap-1 text-xs text-muted-foreground md:flex">
                <Lock className="size-3" />
                시스템 규칙
              </span>
            )}
            <Switch
              checked={rule.isActive}
              disabled={pending || !rule.seeded}
              onCheckedChange={onToggle}
            />
          </div>
        </div>
      </CardHeader>
      {rule.description && (
        <CardContent className="pt-0">
          <p className="text-sm leading-6 text-muted-foreground">
            {rule.description}
          </p>
        </CardContent>
      )}
    </Card>
  );
}

function RuleIcon({ rule }: { rule: AgentRule }) {
  if (rule.triggerType === 'event') return <Zap className="size-5" />;
  return <Clock className="size-5" />;
}

function OriginBadge({ rule }: { rule: AgentRule }) {
  if (rule.isSystem) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Landmark className="size-3" />
        시스템
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <Info className="size-3" />
      커스텀
    </Badge>
  );
}

function formatTrigger(rule: AgentRule): string {
  if (rule.triggerType === 'event') {
    return `이벤트 · ${rule.eventName ?? '-'}`;
  }
  if (!rule.schedule) return '스케줄';
  return formatCron(rule.schedule);
}

// 간단한 cron 한국어 해석. 완벽하지 않지만 흔한 케이스만 커버.
// "0 30 7 * * *"  → 매일 07:30
// step 표현식 "*" + "/N" 은 매 N분으로 해석.
// 해석 실패 시 cron 표현식 그대로 반환.
function formatCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  // 6-field (sec min hour day month dow) or 5-field
  const hasSeconds = parts.length === 6;
  const [min, hour] = hasSeconds ? [parts[1], parts[2]] : [parts[0], parts[1]];

  if (
    /^\d+$/.test(min ?? '') &&
    /^\d+$/.test(hour ?? '')
  ) {
    return `매일 ${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  }
  const everyN = min?.match(/^\*\/(\d+)$/);
  if (everyN) {
    return `매 ${everyN[1]}분`;
  }
  return cron;
}

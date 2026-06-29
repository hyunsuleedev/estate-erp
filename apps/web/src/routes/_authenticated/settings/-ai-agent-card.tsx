/**
 * AI 직원 설정 카드 — 전체 on/off(Office.agentEnabled) + 규칙별 활성화/trust tier.
 * 규칙 실행 이력·제안 상세는 /ai-operations 에서 확인.
 */
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Bot, CalendarClock, RotateCw, Zap } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentRule, OfficeProfile } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';

const TRUST_TIER_LABELS: Record<string, string> = {
  auto: '자동 실행',
  approval_required: '승인 후 실행',
  inform_only: '알림만',
};

/** 모든 시스템 규칙의 코드상 기본 trust tier (Rule 구현의 fallback 값) */
const DEFAULT_TRUST_TIER = 'approval_required';

const TRUST_SENTINEL_DEFAULT = '__default__';

export function AiAgentCard({
  office,
  canEdit,
}: {
  office: OfficeProfile | undefined;
  canEdit: boolean;
}) {
  const qc = useQueryClient();

  const {
    data: rules,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['agent-rules'],
    queryFn: () => api.rules.list(),
  });

  const agentEnabled = office?.agentEnabled ?? true;
  const trustConfig = office?.agentTrustConfig ?? {};

  const agentConfigMutation = useMutation({
    mutationFn: (dto: Parameters<typeof api.offices.updateAgentConfig>[0]) =>
      api.offices.updateAgentConfig(dto),
    onSuccess: (_data, dto) => {
      toast.success(
        typeof dto.agentEnabled === 'boolean'
          ? dto.agentEnabled
            ? 'AI 직원을 활성화했습니다.'
            : 'AI 직원을 중지했습니다.'
          : '실행 권한을 변경했습니다.',
      );
      qc.invalidateQueries({ queryKey: ['office-profile'] });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : 'AI 직원 설정 변경에 실패했습니다.',
      ),
  });

  const ruleToggleMutation = useMutation({
    mutationFn: ({ name, isActive }: { name: string; isActive: boolean }) =>
      api.rules.update(name, { isActive }),
    onSuccess: (_data, { isActive }) => {
      toast.success(isActive ? '규칙을 활성화했습니다.' : '규칙을 비활성화했습니다.');
      qc.invalidateQueries({ queryKey: ['agent-rules'] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : '규칙 변경에 실패했습니다.'),
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="size-4" />
              AI 직원
            </CardTitle>
            <CardDescription>
              규칙 엔진이 매물·계약·광고 상태를 감시하고 제안(승인 대기함)을 만듭니다.
              실행 이력과 제안 처리는 AI 운영 페이지에서 확인하세요.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {agentEnabled ? '사용 중' : '중지됨'}
            </span>
            <Switch
              checked={agentEnabled}
              disabled={!canEdit || !office || agentConfigMutation.isPending}
              onCheckedChange={(checked) =>
                agentConfigMutation.mutate({ agentEnabled: checked })
              }
              aria-label="AI 직원 사용"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">실행 권한 안내</span> — 규칙이
          만든 제안은 권한 수준에 따라 처리됩니다.{' '}
          <span className="font-medium">자동 실행</span>은 즉시 수행,{' '}
          <span className="font-medium">승인 후 실행</span>은 승인 대기함에서 확인 후 수행,{' '}
          <span className="font-medium">알림만</span>은 안내만 하고 실행하지 않습니다.
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed border-border/60 px-3 py-4">
            <p className="text-sm text-muted-foreground">규칙 목록을 불러오지 못했습니다.</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RotateCw className="size-3.5" />
              다시 시도
            </Button>
          </div>
        ) : !rules || rules.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 px-3 py-4 text-center text-sm text-muted-foreground">
            등록된 규칙이 없습니다.
          </p>
        ) : (
          <div className={agentEnabled ? 'space-y-2' : 'space-y-2 opacity-60'}>
            {rules.map((rule) => (
              <RuleRow
                key={rule.name}
                rule={rule}
                trustOverride={trustConfig[rule.name] ?? null}
                disabled={!canEdit || !agentEnabled}
                togglePending={ruleToggleMutation.isPending}
                trustPending={agentConfigMutation.isPending}
                onToggle={(isActive) =>
                  ruleToggleMutation.mutate({ name: rule.name, isActive })
                }
                onTrustChange={(tier) =>
                  agentConfigMutation.mutate({
                    agentTrustConfig: {
                      [rule.name]: tier === TRUST_SENTINEL_DEFAULT ? null : tier,
                    },
                  })
                }
              />
            ))}
          </div>
        )}

        <div className="flex justify-end">
          <Button asChild variant="outline" size="sm">
            <Link to="/ai-operations">
              AI 운영 상세
              <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function RuleRow({
  rule,
  trustOverride,
  disabled,
  togglePending,
  trustPending,
  onToggle,
  onTrustChange,
}: {
  rule: AgentRule;
  trustOverride: string | null;
  disabled: boolean;
  togglePending: boolean;
  trustPending: boolean;
  onToggle: (isActive: boolean) => void;
  onTrustChange: (tier: string) => void;
}) {
  const trustValue = trustOverride ?? TRUST_SENTINEL_DEFAULT;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2.5">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{rule.displayName}</p>
          {rule.triggerType === 'schedule' ? (
            <Badge variant="outline" className="gap-1 text-[11px] font-normal">
              <CalendarClock className="size-3" />
              정기 점검
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 text-[11px] font-normal">
              <Zap className="size-3" />
              이벤트
            </Badge>
          )}
          {!rule.seeded ? (
            <Badge variant="secondary" className="text-[11px] font-normal">
              동기화 대기
            </Badge>
          ) : null}
        </div>
        {rule.description ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">{rule.description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <Select
          value={trustValue}
          onValueChange={onTrustChange}
          disabled={disabled || trustPending}
        >
          <SelectTrigger size="sm" className="w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TRUST_SENTINEL_DEFAULT}>
              기본값 ({TRUST_TIER_LABELS[DEFAULT_TRUST_TIER]})
            </SelectItem>
            {Object.entries(TRUST_TIER_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Switch
          checked={rule.isActive}
          disabled={disabled || !rule.seeded || togglePending}
          onCheckedChange={onToggle}
          aria-label={`${rule.displayName} 활성화`}
        />
      </div>
    </div>
  );
}

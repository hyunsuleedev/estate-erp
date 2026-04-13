import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Gavel,
  Home,
  Info,
  Landmark,
  Megaphone,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import type {
  Proposal,
  ProposalPriority,
  ProposalStatus,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { timeAgo, timeUntil } from '@/lib/time-ago';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';

export const Route = createFileRoute('/_authenticated/ai-operations/proposals')({
  component: ProposalsInboxPage,
});

// ─────────────────────────────────────────────────────────────────────────────
// 설정 상수 — paperclip의 typeIcon / typeLabel 패턴 참조
// ─────────────────────────────────────────────────────────────────────────────

type StatusTab = 'pending' | 'all';

const PRIORITY_ORDER: ProposalPriority[] = ['urgent', 'normal', 'low'];

const PRIORITY_LABEL: Record<ProposalPriority, string> = {
  urgent: '긴급',
  normal: '일반',
  low: '참고',
};

const PRIORITY_DESC: Record<ProposalPriority, string> = {
  urgent: '지금 바로 검토가 필요해요',
  normal: '오늘 안에 처리하면 좋아요',
  low: '여유 있을 때 확인하세요',
};

const typeIcon: Record<string, typeof Bot> = {
  ad_takedown: Megaphone,
  new_external_listings: Megaphone,
  lease_renewal_prepare: Home,
  lease_renewal_notice: Home,
  lease_rejection_deadline: Home,
  lease_contract_prep: Home,
  registry_risk_detected: Gavel,
  match_suggestion: Users,
  consultation_followup: Bell,
};

const typeLabel: Record<string, string> = {
  ad_takedown: '광고 내림',
  new_external_listings: '신규 광고',
  lease_renewal_prepare: '갱신 준비',
  lease_renewal_notice: '갱신 통지',
  lease_rejection_deadline: '거절 마감',
  lease_contract_prep: '재계약 준비',
  registry_risk_detected: '등기부 리스크',
  match_suggestion: '매칭 제안',
  consultation_followup: '상담 후속',
};

function typeOf(type: string) {
  return { Icon: typeIcon[type] ?? FileText, label: typeLabel[type] ?? type };
}

// ─────────────────────────────────────────────────────────────────────────────
// 거부 사유
// ─────────────────────────────────────────────────────────────────────────────

const REJECT_REASONS = [
  { value: 'already_handled', label: '이미 처리함' },
  { value: 'false_positive', label: '잘못된 감지 (false positive)' },
  { value: 'not_now', label: '지금은 아님 (나중에 다시)' },
  { value: 'not_applicable', label: '해당 사항 없음' },
  { value: 'other', label: '기타 (직접 입력)' },
] as const;

type RejectReason = (typeof REJECT_REASONS)[number]['value'];

// ─────────────────────────────────────────────────────────────────────────────
// 메인 페이지
// ─────────────────────────────────────────────────────────────────────────────

function ProposalsInboxPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<StatusTab>('pending');
  const [rejectTarget, setRejectTarget] = useState<Proposal | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: proposals = [], isLoading } = useQuery({
    queryKey: ['proposals', tab],
    queryFn: () =>
      api.proposals.list(tab === 'pending' ? { status: 'pending' } : {}),
  });

  const approveMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) =>
      api.proposals.approve(id, { note }),
    onSuccess: (updated) => {
      setActionError(null);
      toast.success(`승인했어요 — ${updated.title}`);
      void queryClient.invalidateQueries({ queryKey: ['proposals'] });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
      toast.error(`승인 실패: ${msg}`);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.proposals.reject(id, { note }),
    onSuccess: (updated) => {
      setActionError(null);
      toast.success(`거부했어요 — ${updated.title}`);
      setRejectTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['proposals'] });
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
      toast.error(`거부 실패: ${msg}`);
    },
  });

  const pendingCount = useMemo(
    () => proposals.filter((p) => p.status === 'pending').length,
    [proposals],
  );

  // paperclip 스타일: 탭은 "pending"/"all" 이지만, 한국 중개 맥락에서는
  // 우선순위별 그룹핑이 더 의미있어서 본문은 3단 섹션 유지.
  const grouped = useMemo(() => {
    const groups: Record<ProposalPriority, Proposal[]> = {
      urgent: [],
      normal: [],
      low: [],
    };
    for (const p of proposals) {
      const priority = (p.priority as ProposalPriority) ?? 'normal';
      groups[priority].push(p);
    }
    // 각 그룹을 최신 순으로 정렬
    for (const key of PRIORITY_ORDER) {
      groups[key].sort(
        (a, b) =>
          new Date(b.proposedAt).getTime() - new Date(a.proposedAt).getTime(),
      );
    }
    return groups;
  }, [proposals]);

  return (
    <div className="flex flex-col gap-6">
      {/* 탭 — paperclip 스타일 */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as StatusTab)}>
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            대기 중
            {pendingCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-500/20 px-1.5 text-[10px] font-semibold text-yellow-700 dark:text-yellow-400">
                {pendingCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">전체</TabsTrigger>
        </TabsList>
      </Tabs>

      {actionError && (
        <p className="text-sm text-destructive">{actionError}</p>
      )}

      {/* 본문 */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-36 w-full" />
        </div>
      ) : proposals.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-8">
          {PRIORITY_ORDER.map((priority) => {
            const items = grouped[priority];
            if (items.length === 0) return null;
            return (
              <PrioritySection
                key={priority}
                priority={priority}
                items={items}
                onApprove={(id) => approveMutation.mutate({ id })}
                onReject={(p) => setRejectTarget(p)}
                isPending={approveMutation.isPending || rejectMutation.isPending}
                pendingActionId={
                  approveMutation.isPending
                    ? approveMutation.variables?.id
                    : rejectMutation.isPending
                      ? rejectMutation.variables?.id
                      : null
                }
                pendingAction={
                  approveMutation.isPending
                    ? 'approve'
                    : rejectMutation.isPending
                      ? 'reject'
                      : null
                }
              />
            );
          })}
        </div>
      )}

      {/* 거부 다이얼로그 */}
      <RejectDialog
        target={rejectTarget}
        onClose={() => setRejectTarget(null)}
        onSubmit={(note) => {
          if (!rejectTarget) return;
          rejectMutation.mutate({ id: rejectTarget.id, note });
        }}
        pending={rejectMutation.isPending}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 섹션 (우선순위 그룹)
// ─────────────────────────────────────────────────────────────────────────────

function PrioritySection({
  priority,
  items,
  onApprove,
  onReject,
  isPending,
  pendingActionId,
  pendingAction,
}: {
  priority: ProposalPriority;
  items: Proposal[];
  onApprove: (id: string) => void;
  onReject: (proposal: Proposal) => void;
  isPending: boolean;
  pendingActionId: string | null | undefined;
  pendingAction: 'approve' | 'reject' | null;
}) {
  return (
    <section className="space-y-3">
      <header className="flex items-baseline gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {PRIORITY_LABEL[priority]}
        </h2>
        <span className="text-xs text-muted-foreground/70">
          {items.length}건 · {PRIORITY_DESC[priority]}
        </span>
      </header>
      <div className="grid gap-3">
        {items.map((proposal) => (
          <ProposalCard
            key={proposal.id}
            proposal={proposal}
            onApprove={() => onApprove(proposal.id)}
            onReject={() => onReject(proposal)}
            isPending={isPending && pendingActionId === proposal.id}
            pendingAction={pendingActionId === proposal.id ? pendingAction : null}
          />
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 카드 — paperclip ApprovalCard 디자인 언어
// ─────────────────────────────────────────────────────────────────────────────

function ProposalCard({
  proposal,
  onApprove,
  onReject,
  isPending,
  pendingAction,
}: {
  proposal: Proposal;
  onApprove: () => void;
  onReject: () => void;
  isPending: boolean;
  pendingAction: 'approve' | 'reject' | null;
}) {
  const { Icon, label: kindLabel } = typeOf(proposal.type);
  const source = parseGeneratedBy(proposal.generatedBy);
  const [expanded, setExpanded] = useState(false);

  const isActionable =
    proposal.status === 'pending' && proposal.trustTier !== 'inform_only';
  const isInformOnly = proposal.trustTier === 'inform_only';

  return (
    <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
      {/* 상단: 아이콘 + 제목 + 상태 pill */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background/80">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-border/70 bg-background/70 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                >
                  {kindLabel}
                </Badge>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span>생성 주체</span>
                  <SourceIdentity source={source} />
                </span>
                {isInformOnly && (
                  <Badge variant="outline" className="text-[11px]">
                    알림만
                  </Badge>
                )}
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-semibold leading-6 text-foreground">
                  {proposal.title}
                </h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  {timeAgo(proposal.proposedAt)} 생성
                  {proposal.expiresAt && (
                    <>
                      {' '}· <span>{timeUntil(proposal.expiresAt)}</span>
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        </div>
        <div className="shrink-0">
          <StatusPill status={proposal.status} />
        </div>
      </div>

      {/* 본문 — 설명 + 근거 */}
      <div className="mt-4 border-t border-border/60 pt-4">
        <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
          {proposal.description}
        </p>

        {proposal.reasoning && (
          <button
            type="button"
            className="mt-3 flex items-center gap-1 text-xs text-muted-foreground transition hover:text-foreground"
            onClick={() => setExpanded((prev) => !prev)}
          >
            {expanded ? (
              <ChevronDown className="size-3" />
            ) : (
              <ChevronRight className="size-3" />
            )}
            근거 보기
          </button>
        )}
        {expanded && proposal.reasoning && (
          <div className="mt-2 rounded-lg border border-border/60 bg-muted/30 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
            {proposal.reasoning}
          </div>
        )}
      </div>

      {/* 결정 노트 (처리된 후에만) */}
      {proposal.decisionNote && (
        <div className="mt-4 rounded-lg border border-border/60 bg-muted/30 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">결정 메모.</span>{' '}
          {proposal.decisionNote}
        </div>
      )}

      {/* 실행 에러 */}
      {proposal.status === 'failed' && proposal.executionError && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3.5 py-3 text-xs leading-5 text-destructive">
          <span className="font-medium">실행 실패.</span> {proposal.executionError}
        </div>
      )}

      {/* 푸터 액션 */}
      {isActionable && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              className="bg-green-700 text-white hover:bg-green-600"
              onClick={onApprove}
              disabled={isPending}
            >
              <CheckCircle2 className="size-4" />
              {pendingAction === 'approve' ? '승인 중…' : '승인'}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={onReject}
              disabled={isPending}
            >
              <XCircle className="size-4" />
              {pendingAction === 'reject' ? '거부 중…' : '거부'}
            </Button>
          </div>
          <div className="text-[11px] text-muted-foreground">
            ID: {proposal.id.slice(0, 8)}
          </div>
        </div>
      )}

      {/* 알림만 타입 — 닫기 버튼만 */}
      {isInformOnly && proposal.status === 'pending' && (
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
          <p className="text-xs text-muted-foreground">
            이 제안은 정보 제공용이에요. 직접 조치를 취한 뒤 닫아주세요.
          </p>
          <Button size="sm" variant="outline" onClick={onReject}>
            닫기
          </Button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 상태 pill
// ─────────────────────────────────────────────────────────────────────────────

function StatusPill({ status }: { status: ProposalStatus }) {
  const config = statusConfig(status);
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
        config.bg,
        config.border,
        config.text,
      )}
    >
      <config.icon className="h-3.5 w-3.5" />
      <span>{config.label}</span>
    </div>
  );
}

function statusConfig(status: ProposalStatus) {
  switch (status) {
    case 'pending':
      return {
        icon: Clock,
        label: '대기 중',
        bg: 'bg-yellow-500/5',
        border: 'border-yellow-500/30',
        text: 'text-yellow-700 dark:text-yellow-400',
      };
    case 'approved':
      return {
        icon: CheckCircle2,
        label: '승인됨',
        bg: 'bg-green-500/5',
        border: 'border-green-500/30',
        text: 'text-green-700 dark:text-green-400',
      };
    case 'executed':
      return {
        icon: CheckCircle2,
        label: '실행 완료',
        bg: 'bg-green-500/5',
        border: 'border-green-500/30',
        text: 'text-green-700 dark:text-green-400',
      };
    case 'rejected':
      return {
        icon: XCircle,
        label: '거부됨',
        bg: 'bg-red-500/5',
        border: 'border-red-500/30',
        text: 'text-red-700 dark:text-red-400',
      };
    case 'expired':
      return {
        icon: Clock,
        label: '만료',
        bg: 'bg-muted/30',
        border: 'border-border/60',
        text: 'text-muted-foreground',
      };
    case 'failed':
      return {
        icon: AlertTriangle,
        label: '실행 실패',
        bg: 'bg-red-500/5',
        border: 'border-red-500/30',
        text: 'text-red-700 dark:text-red-400',
      };
    case 'auto_resolved':
      return {
        icon: CheckCircle2,
        label: '자동 해소',
        bg: 'bg-muted/30',
        border: 'border-border/60',
        text: 'text-muted-foreground',
      };
    default:
      return {
        icon: Info,
        label: status,
        bg: 'bg-muted/30',
        border: 'border-border/60',
        text: 'text-muted-foreground',
      };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 생성 주체 표시 (paperclip "Requested by ○○" 패턴)
// ─────────────────────────────────────────────────────────────────────────────

type ParsedSource =
  | { kind: 'rule'; name: string }
  | { kind: 'mcp'; name: string }
  | { kind: 'event'; name: string }
  | { kind: 'raw'; raw: string };

function parseGeneratedBy(generatedBy: string): ParsedSource {
  const parts = generatedBy.split(':');
  if (parts[0] === 'rule' && parts[1]) return { kind: 'rule', name: parts[1] };
  if (parts[0] === 'mcp' && parts[1]) return { kind: 'mcp', name: parts[1] };
  if (parts[0] === 'event' && parts[1]) return { kind: 'event', name: parts[1] };
  return { kind: 'raw', raw: generatedBy };
}

function SourceIdentity({ source }: { source: ParsedSource }) {
  const { icon: IconComp, label, tone } = sourceIconAndLabel(source);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[11px] font-medium',
        tone,
      )}
    >
      <IconComp className="size-3" />
      {label}
    </span>
  );
}

function sourceIconAndLabel(source: ParsedSource): {
  icon: typeof Bot;
  label: string;
  tone: string;
} {
  if (source.kind === 'rule') {
    return {
      icon: Landmark,
      label: `규칙 · ${typeLabel[source.name] ?? source.name}`,
      tone: 'bg-blue-500/5 text-blue-700 dark:text-blue-400',
    };
  }
  if (source.kind === 'mcp') {
    return {
      icon: Bot,
      label: `MCP · ${source.name}`,
      tone: 'bg-purple-500/5 text-purple-700 dark:text-purple-400',
    };
  }
  if (source.kind === 'event') {
    return {
      icon: Bell,
      label: `이벤트 · ${source.name}`,
      tone: 'bg-amber-500/5 text-amber-700 dark:text-amber-400',
    };
  }
  return {
    icon: Info,
    label: source.raw,
    tone: 'bg-muted/40 text-muted-foreground',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 빈 상태
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: StatusTab }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-card/40 py-16 text-center">
      <Sparkles className="mb-3 h-8 w-8 text-muted-foreground/30" />
      <p className="text-sm text-muted-foreground">
        {tab === 'pending'
          ? '대기 중인 AI 제안이 없어요. 조용히 지켜보고 있어요.'
          : '아직 AI 제안이 없어요.'}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 거부 다이얼로그
// ─────────────────────────────────────────────────────────────────────────────

function RejectDialog({
  target,
  onClose,
  onSubmit,
  pending,
}: {
  target: Proposal | null;
  onClose: () => void;
  onSubmit: (note: string) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState<RejectReason>('already_handled');
  const [customNote, setCustomNote] = useState('');

  const handleSubmit = () => {
    const note =
      reason === 'other'
        ? customNote.trim() || '기타'
        : (REJECT_REASONS.find((r) => r.value === reason)?.label ?? reason);
    onSubmit(note);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
      setReason('already_handled');
      setCustomNote('');
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>제안 거부</DialogTitle>
        </DialogHeader>
        {target && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">{target.title}</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">거부 사유</Label>
              <div className="grid gap-2">
                {REJECT_REASONS.map((r) => (
                  <label
                    key={r.value}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm transition',
                      reason === r.value
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-muted/50',
                    )}
                  >
                    <input
                      type="radio"
                      name="reject-reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      className="size-3.5"
                    />
                    <span>{r.label}</span>
                  </label>
                ))}
              </div>
            </div>
            {reason === 'other' && (
              <div className="space-y-2">
                <Label className="text-sm">사유 입력</Label>
                <Textarea
                  placeholder="이 제안을 왜 거부하는지 간단히 적어주세요."
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  rows={3}
                />
              </div>
            )}
            <Separator />
            <p className="text-xs text-muted-foreground">
              거부 사유는 규칙 개선 데이터로 활용돼요.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={
              pending || (reason === 'other' && customNote.trim().length === 0)
            }
          >
            {pending ? '처리 중…' : '거부 확정'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

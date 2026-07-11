import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  Scale,
  Sparkles,
  X,
} from 'lucide-react';
import type { Proposal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/domain';
import { formatDate, formatDateTime, formatDday } from '@/lib/format';
import { ContextChips } from './-context-chips';
import { RejectNoteDialog } from './-reject-dialog';
import { getErrorMessage, startUndoableAction } from './-undoable';

/** 규칙 엔진 Proposal type → 한국어 라벨 (미정의 type 은 원문 노출) */
export const PROPOSAL_TYPE_LABELS: Record<string, string> = {
  transaction_report_deadline: '거래신고 기한',
  lease_expiry: '임대 만기',
  ad_takedown: '광고 취하',
  new_external_listings: '신규 외부매물',
  price_change: '가격 변동',
};

export function proposalTypeLabel(type: string): string {
  return PROPOSAL_TYPE_LABELS[type] ?? type;
}

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  normal: 'bg-sky-500',
  low: 'bg-zinc-400',
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: '긴급',
  normal: '일반',
  low: '참고',
};

function timeAgoKo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

/**
 * transaction_report_deadline 제안에서 신고 기한을 파싱한다.
 * 규칙이 description/reasoning 에 "신고 기한 YYYY-MM-DD" 를 포함시킨다.
 */
export function parseReportDeadline(p: Proposal): {
  deadline: Date | null;
  overdue: boolean;
} {
  const text = `${p.description ?? ''}\n${p.reasoning ?? ''}`;
  const m = text.match(/신고 기한[^0-9]*(\d{4}-\d{2}-\d{2})/);
  const overdueByTitle = /기한 경과/.test(p.title);
  if (!m) return { deadline: null, overdue: overdueByTitle };
  const deadline = new Date(`${m[1]}T23:59:59`);
  return { deadline, overdue: overdueByTitle || deadline.getTime() < Date.now() };
}

/** 신고 기한 D-day 강조 뱃지 */
function ReportDeadlineBadge({
  proposal,
  size = 'sm',
}: {
  proposal: Proposal;
  size?: 'sm' | 'lg';
}) {
  const { deadline, overdue } = parseReportDeadline(proposal);
  if (!deadline && !overdue) return null;
  const dday = deadline ? formatDday(deadline) : 'D+?';
  const danger = overdue || proposal.priority === 'urgent';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full font-semibold tabular-nums',
        size === 'lg' ? 'px-2.5 py-1 text-sm' : 'px-2 py-0.5 text-[11px]',
        danger
          ? 'bg-destructive-soft text-destructive'
          : 'bg-warning-soft text-warning',
      )}
    >
      <CalendarClock className={size === 'lg' ? 'size-4' : 'size-3'} />
      {overdue ? `기한 경과 ${dday}` : `신고 기한 ${dday}`}
      {deadline && size === 'lg' && (
        <span className="font-normal opacity-80">· {formatDate(deadline)}</span>
      )}
    </span>
  );
}

/**
 * 규칙 엔진 Proposal 카드 — EntityDraft 카드와 같은 큐에 섞여 표시된다.
 */
export function ProposalCard({
  proposal,
  showQuickActions,
  nameOf,
}: {
  proposal: Proposal;
  showQuickActions: boolean;
  nameOf: (id: string | null) => string | null;
}) {
  const qc = useQueryClient();
  const [detailOpen, setDetailOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const isReportDeadline = proposal.type === 'transaction_report_deadline';
  const isPending = proposal.status === 'pending';
  const decidedByName = nameOf(proposal.decidedBy);

  const quickApprove = () => {
    const prev = qc.getQueryData<Proposal[]>(['proposals']);
    startUndoableAction({
      message: `'${proposal.title}' 승인`,
      applyOptimistic: () =>
        qc.setQueryData<Proposal[]>(['proposals'], (rows) =>
          rows?.map((r) =>
            r.id === proposal.id ? { ...r, status: 'approved' as const } : r,
          ),
        ),
      commit: () => api.proposals.approve(proposal.id),
      rollback: () => {
        if (prev) qc.setQueryData(['proposals'], prev);
        else void qc.invalidateQueries({ queryKey: ['proposals'] });
      },
      onSuccess: () => {
        toast.success('제안을 승인했습니다 — 후속 작업을 실행합니다');
        void qc.invalidateQueries({ queryKey: ['proposals'] });
      },
      onError: (error) => {
        toast.error(getErrorMessage(error));
        void qc.invalidateQueries({ queryKey: ['proposals'] });
      },
    });
  };

  const quickReject = (note: string) => {
    const prev = qc.getQueryData<Proposal[]>(['proposals']);
    startUndoableAction({
      message: '제안을 거부했습니다',
      applyOptimistic: () =>
        qc.setQueryData<Proposal[]>(['proposals'], (rows) =>
          rows?.map((r) =>
            r.id === proposal.id ? { ...r, status: 'rejected' as const } : r,
          ),
        ),
      commit: () => api.proposals.reject(proposal.id, { note }),
      rollback: () => {
        if (prev) qc.setQueryData(['proposals'], prev);
        else void qc.invalidateQueries({ queryKey: ['proposals'] });
      },
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: ['proposals'] });
      },
      onError: (error) => {
        toast.error(getErrorMessage(error));
        void qc.invalidateQueries({ queryKey: ['proposals'] });
      },
    });
  };

  return (
    <>
      <div
        className={cn(
          'group overflow-hidden rounded-xl border bg-card transition-colors',
          proposal.priority === 'urgent' &&
            isPending &&
            'border-red-200 dark:border-red-900/60',
        )}
      >
        <div className="flex items-start">
          <button
            type="button"
            onClick={() => setDetailOpen(true)}
            className="flex flex-1 items-start gap-3 p-4 text-left transition-colors hover:bg-muted/30"
          >
            <div className="pt-1">
              <span
                className={cn(
                  'inline-block size-2 rounded-full',
                  PRIORITY_DOT[proposal.priority] ?? 'bg-zinc-400',
                )}
                title={PRIORITY_LABEL[proposal.priority] ?? proposal.priority}
              />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {PRIORITY_LABEL[proposal.priority] ?? proposal.priority}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {proposalTypeLabel(proposal.type)}
                </Badge>
                <Badge variant="outline" className="text-[10px]">
                  <Sparkles className="mr-0.5 size-2.5" />
                  규칙 제안
                </Badge>
                {!isPending && (
                  <StatusBadge
                    kind="proposalStatus"
                    status={proposal.status}
                    size="sm"
                  />
                )}
                {isReportDeadline && <ReportDeadlineBadge proposal={proposal} />}
              </div>
              <h3 className="mt-1 text-[15px] font-semibold leading-snug">
                {proposal.title}
              </h3>
              <p className="mt-1 line-clamp-2 whitespace-pre-line text-[13px] text-muted-foreground">
                {proposal.description}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
                <span>{timeAgoKo(proposal.proposedAt)}</span>
                <span className="opacity-60">·</span>
                <span className="font-mono opacity-80">{proposal.generatedBy}</span>
                {proposal.decisionNote && (
                  <span className="truncate">거부 사유: {proposal.decisionNote}</span>
                )}
                {decidedByName && proposal.decidedAt && (
                  <span>
                    {decidedByName} · {formatDateTime(proposal.decidedAt)} 결정
                  </span>
                )}
              </div>
            </div>
          </button>

          {showQuickActions && isPending && (
            <div className="flex shrink-0 items-center gap-1.5 py-4 pr-4">
              <Button size="sm" className="gap-1" onClick={quickApprove}>
                <Check className="size-4" />
                승인
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 text-muted-foreground"
                onClick={() => setRejectOpen(true)}
              >
                <X className="size-4" />
                거부
              </Button>
            </div>
          )}
        </div>
      </div>

      <ProposalDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        proposal={proposal}
        nameOf={nameOf}
      />

      <RejectNoteDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        onConfirm={quickReject}
      />
    </>
  );
}

function ProposalDetailDialog({
  open,
  onOpenChange,
  proposal,
  nameOf,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  proposal: Proposal;
  nameOf: (id: string | null) => string | null;
}) {
  const qc = useQueryClient();
  const [rejectOpen, setRejectOpen] = useState(false);
  const isPending = proposal.status === 'pending';
  const isReportDeadline = proposal.type === 'transaction_report_deadline';
  const decidedByName = nameOf(proposal.decidedBy);

  const approveMutation = useMutation({
    mutationFn: () => api.proposals.approve(proposal.id),
    onSuccess: () => {
      toast.success('제안을 승인했습니다 — 후속 작업을 실행합니다');
      void qc.invalidateQueries({ queryKey: ['proposals'] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const rejectMutation = useMutation({
    mutationFn: (note: string) => api.proposals.reject(proposal.id, { note }),
    onSuccess: () => {
      toast.success('제안을 거부했습니다');
      void qc.invalidateQueries({ queryKey: ['proposals'] });
      onOpenChange(false);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <DialogHeader className="space-y-2 border-b px-6 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              {proposalTypeLabel(proposal.type)}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              <Sparkles className="mr-0.5 size-2.5" />
              규칙 제안
            </Badge>
            <StatusBadge kind="proposalStatus" status={proposal.status} size="sm" />
          </div>
          <DialogTitle className="text-lg leading-snug">
            {proposal.title}
          </DialogTitle>
          {isReportDeadline && (
            <div>
              <ReportDeadlineBadge proposal={proposal} size="lg" />
            </div>
          )}
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          <p className="whitespace-pre-line text-[13px] leading-relaxed">
            {proposal.description}
          </p>

          {proposal.reasoning && (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <Scale className="size-3.5" />
                {isReportDeadline ? '법적 근거' : '제안 근거'}
              </div>
              <p className="whitespace-pre-line text-[12px] leading-relaxed text-muted-foreground">
                {proposal.reasoning}
              </p>
            </div>
          )}

          <ContextChips
            listingId={proposal.listingId}
            propertyId={proposal.propertyId}
            contactId={proposal.contactId}
            dealId={proposal.dealId}
            contractId={proposal.contractId}
          />

          {proposal.executionError && (
            <div className="rounded-md bg-red-50 p-2 text-[12px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
              <AlertTriangle className="mr-1 inline size-3" />
              실행 실패: {proposal.executionError}
            </div>
          )}

          {!isPending && (
            <div className="space-y-1 rounded-md border bg-background p-3 text-[12px] text-muted-foreground">
              {proposal.decidedAt && (
                <div>
                  결정: {formatDateTime(proposal.decidedAt)}
                  {decidedByName ? ` · ${decidedByName}` : ''}
                </div>
              )}
              {proposal.decisionNote && <div>사유: {proposal.decisionNote}</div>}
              {proposal.executedAt && (
                <div>실행 완료: {formatDateTime(proposal.executedAt)}</div>
              )}
            </div>
          )}
        </div>

        {isPending && (
          <div className="flex flex-wrap items-center gap-2 border-t bg-background px-6 py-3">
            <Button
              size="sm"
              className="gap-1"
              disabled={approveMutation.isPending}
              onClick={() => approveMutation.mutate()}
            >
              <Check className="size-4" />
              {proposal.actionType === 'create_task' ||
              isReportDeadline
                ? '승인 — 업무 생성'
                : '승인'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="gap-1 text-muted-foreground"
              disabled={rejectMutation.isPending}
              onClick={() => setRejectOpen(true)}
            >
              <X className="size-4" />
              거부
            </Button>
            <div className="ml-auto text-[11px] text-muted-foreground">
              {timeAgoKo(proposal.proposedAt)} · {proposal.generatedBy}
            </div>
          </div>
        )}

        <RejectNoteDialog
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          onConfirm={(note) => rejectMutation.mutate(note)}
        />
      </DialogContent>
    </Dialog>
  );
}

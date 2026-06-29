import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Inbox, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import type { Proposal, ProposalStatus } from '@estate-erp/api-client';

import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/format';
import { STATUS_CONFIG } from '@/lib/status-config';
import {
  ConfirmDialog,
  DetailField,
  EmptyState,
  EntityChip,
  FilterBar,
  FilterCount,
  FilterSearch,
  FilterSelect,
  StatusBadge,
} from '@/components/domain';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  PRIORITY_META,
  PROPOSAL_TYPE_LABELS,
  TRUST_TIER_LABELS,
  describeGeneratedBy,
  getErrorMessage,
} from './-shared';

const STATUS_OPTIONS = Object.entries(STATUS_CONFIG.proposalStatus).map(
  ([value, meta]) => ({ value, label: meta.label }),
);

const PRIORITY_OPTIONS = (
  Object.entries(PRIORITY_META) as Array<[string, { label: string }]>
).map(([value, meta]) => ({ value, label: meta.label }));

export function ProposalsTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<Proposal | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Proposal | null>(null);
  const [rejectNote, setRejectNote] = useState('');

  const {
    data: proposals,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['proposals', 'all'],
    queryFn: () => api.proposals.list(),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['proposals'] });
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.proposals.approve(id),
    onSuccess: () => {
      toast.success('제안을 승인했습니다 — 후속 액션이 실행됩니다');
      setApproveTarget(null);
      invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      invalidate();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      api.proposals.reject(id, { note }),
    onSuccess: () => {
      toast.success('제안을 반려했습니다');
      setRejectTarget(null);
      setRejectNote('');
      invalidate();
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      invalidate();
    },
  });

  const typeOptions = useMemo(() => {
    const types = [...new Set((proposals ?? []).map((p) => p.type))];
    return types
      .sort()
      .map((t) => ({ value: t, label: PROPOSAL_TYPE_LABELS[t] ?? t }));
  }, [proposals]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (proposals ?? [])
      .filter((p) => {
        if (status && p.status !== status) return false;
        if (type && p.type !== type) return false;
        if (priority && p.priority !== priority) return false;
        if (q && !`${p.title} ${p.description}`.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.proposedAt).getTime() - new Date(a.proposedAt).getTime(),
      );
  }, [proposals, search, status, type, priority]);

  const selected = useMemo(
    () => (proposals ?? []).find((p) => p.id === selectedId) ?? null,
    [proposals, selectedId],
  );

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border py-12">
        <p className="text-sm text-muted-foreground">제안 이력을 불러오지 못했습니다.</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCw className="size-3.5" />
          다시 시도
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FilterBar>
        <FilterSearch value={search} onChange={setSearch} placeholder="제목·내용 검색" />
        <FilterSelect label="유형" value={type} onChange={setType} options={typeOptions} />
        <FilterSelect label="상태" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <FilterSelect
          label="우선순위"
          value={priority}
          onChange={setPriority}
          options={PRIORITY_OPTIONS}
        />
        <FilterCount n={filtered.length} />
      </FilterBar>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="표시할 제안이 없습니다"
          description="규칙이 실행되면 AI 제안이 이곳에 쌓입니다."
        />
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs text-muted-foreground">상태</TableHead>
                <TableHead className="text-xs text-muted-foreground">제안</TableHead>
                <TableHead className="text-xs text-muted-foreground">우선순위</TableHead>
                <TableHead className="text-xs text-muted-foreground">처리 방식</TableHead>
                <TableHead className="text-xs text-muted-foreground">생성</TableHead>
                <TableHead className="text-xs text-muted-foreground">처리</TableHead>
                {canManage && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow
                  key={p.id}
                  className="h-10 cursor-pointer text-sm"
                  onClick={() => setSelectedId(p.id)}
                >
                  <TableCell>
                    <StatusBadge kind="proposalStatus" status={p.status} size="sm" />
                  </TableCell>
                  <TableCell className="max-w-[320px]">
                    <div className="truncate font-medium">{p.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {PROPOSAL_TYPE_LABELS[p.type] ?? p.type}
                      {p.description ? ` · ${p.description}` : ''}
                    </div>
                  </TableCell>
                  <TableCell>
                    <PriorityLabel priority={p.priority} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {TRUST_TIER_LABELS[p.trustTier] ?? p.trustTier}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {formatDateTime(p.proposedAt)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground tabular-nums">
                    {p.executedAt
                      ? formatDateTime(p.executedAt)
                      : p.decidedAt
                        ? formatDateTime(p.decidedAt)
                        : '—'}
                  </TableCell>
                  {canManage && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {p.status === 'pending' && (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="승인"
                            onClick={() => setApproveTarget(p)}
                          >
                            <Check className="size-3.5 text-success" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            aria-label="반려"
                            onClick={() => {
                              setRejectNote('');
                              setRejectTarget(p);
                            }}
                          >
                            <X className="size-3.5 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 상세 Sheet */}
      <Sheet open={selected !== null} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-[520px]">
          {selected && (
            <ProposalDetail
              proposal={selected}
              canManage={canManage}
              onApprove={() => setApproveTarget(selected)}
              onReject={() => {
                setRejectNote('');
                setRejectTarget(selected);
              }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* 승인 확인 */}
      <ConfirmDialog
        open={approveTarget !== null}
        onOpenChange={(open) => !open && setApproveTarget(null)}
        title="제안을 승인하시겠습니까?"
        description={
          approveTarget
            ? `"${approveTarget.title}" — 승인 즉시 연결된 액션이 실행됩니다.`
            : undefined
        }
        confirmLabel="승인"
        loading={approveMutation.isPending}
        onConfirm={() => {
          if (approveTarget) approveMutation.mutate(approveTarget.id);
        }}
      />

      {/* 반려 (사유 필수) */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open && !rejectMutation.isPending) setRejectTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>제안 반려</DialogTitle>
            <DialogDescription>
              {rejectTarget ? `"${rejectTarget.title}" 제안을 반려합니다.` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-note">
              반려 사유 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reject-note"
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="반려 사유를 입력하세요 (규칙 개선에 활용됩니다)"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              disabled={rejectMutation.isPending}
              onClick={() => setRejectTarget(null)}
            >
              취소
            </Button>
            <Button
              variant="destructive"
              disabled={rejectMutation.isPending || rejectNote.trim().length === 0}
              onClick={() => {
                if (rejectTarget) {
                  rejectMutation.mutate({ id: rejectTarget.id, note: rejectNote.trim() });
                }
              }}
            >
              반려
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PriorityLabel({ priority }: { priority: Proposal['priority'] }) {
  const meta = PRIORITY_META[priority] ?? { label: priority, dotClass: 'bg-muted-foreground/40' };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={cn('size-1.5 rounded-full', meta.dotClass)} />
      {meta.label}
    </span>
  );
}

function ProposalDetail({
  proposal,
  canManage,
  onApprove,
  onReject,
}: {
  proposal: Proposal;
  canManage: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const contextChips: Array<{
    kind: 'listing' | 'property' | 'contact' | 'deal' | 'contract';
    id: string;
    label: string;
    propertyId?: string;
  }> = [];
  if (proposal.listingId) {
    contextChips.push({
      kind: 'listing',
      id: proposal.listingId,
      label: '매물',
      propertyId: proposal.propertyId ?? undefined,
    });
  }
  if (proposal.propertyId && !proposal.listingId) {
    contextChips.push({ kind: 'property', id: proposal.propertyId, label: '매물(관리)' });
  }
  if (proposal.contactId) {
    contextChips.push({ kind: 'contact', id: proposal.contactId, label: '연락처' });
  }
  if (proposal.dealId) {
    contextChips.push({ kind: 'deal', id: proposal.dealId, label: '거래' });
  }
  if (proposal.contractId) {
    contextChips.push({ kind: 'contract', id: proposal.contractId, label: '계약' });
  }

  return (
    <>
      <SheetHeader className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind="proposalStatus" status={proposal.status} />
          <Badge variant="outline" className="text-[10px]">
            {PROPOSAL_TYPE_LABELS[proposal.type] ?? proposal.type}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {TRUST_TIER_LABELS[proposal.trustTier] ?? proposal.trustTier}
          </Badge>
        </div>
        <SheetTitle className="text-base">{proposal.title}</SheetTitle>
        <SheetDescription className="whitespace-pre-wrap text-sm">
          {proposal.description}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 px-4 pb-6">
        {canManage && proposal.status === 'pending' && (
          <div className="flex gap-2">
            <Button size="sm" onClick={onApprove}>
              <Check className="size-3.5" />
              승인
            </Button>
            <Button size="sm" variant="outline" onClick={onReject}>
              <X className="size-3.5" />
              반려
            </Button>
          </div>
        )}

        {proposal.executionError && (
          <Alert variant="destructive">
            <AlertTitle>실행 실패</AlertTitle>
            <AlertDescription className="break-all text-xs">
              {proposal.executionError}
            </AlertDescription>
          </Alert>
        )}

        {proposal.reasoning && (
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="mb-1 text-xs font-medium text-muted-foreground">생성 근거</p>
            <p className="whitespace-pre-wrap text-sm">{proposal.reasoning}</p>
          </div>
        )}

        <div className="space-y-1.5">
          <DetailField label="우선순위">
            <PriorityLabel priority={proposal.priority} />
          </DetailField>
          <DetailField label="생성 출처" value={describeGeneratedBy(proposal.generatedBy)} />
          <DetailField label="생성일" value={formatDateTime(proposal.proposedAt)} />
          <DetailField
            label="만료일"
            value={proposal.expiresAt ? formatDateTime(proposal.expiresAt) : undefined}
          />
          <DetailField
            label="처리일"
            value={proposal.decidedAt ? formatDateTime(proposal.decidedAt) : undefined}
          />
          <DetailField label="처리 메모" value={proposal.decisionNote ?? undefined} />
          <DetailField
            label="실행일"
            value={proposal.executedAt ? formatDateTime(proposal.executedAt) : undefined}
          />
        </div>

        {contextChips.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">연결된 데이터</p>
            <div className="flex flex-wrap gap-1.5">
              {contextChips.map((chip) => (
                <EntityChip
                  key={`${chip.kind}-${chip.id}`}
                  kind={chip.kind}
                  id={chip.id}
                  label={chip.label}
                  propertyId={chip.propertyId}
                />
              ))}
            </div>
          </div>
        )}

        {proposal.actionPayload && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">
              액션 페이로드{proposal.actionType ? ` (${proposal.actionType})` : ''}
            </p>
            <pre className="max-h-64 overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[11px] leading-4">
              {JSON.stringify(proposal.actionPayload, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </>
  );
}

/** 처리 통계 (index의 KPI 카드에서 사용) — 승인/반려/자동 카운트 클라이언트 집계 */
export function summarizeProposals(proposals: Proposal[] | undefined) {
  const list = proposals ?? [];
  const isToday = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    return (
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate()
    );
  };
  const doneStatuses: ProposalStatus[] = ['approved', 'executed'];
  return {
    pending: list.filter((p) => p.status === 'pending').length,
    pendingUrgent: list.filter((p) => p.status === 'pending' && p.priority === 'urgent')
      .length,
    today: list.filter((p) => isToday(p.proposedAt)).length,
    approved: list.filter(
      (p) => doneStatuses.includes(p.status) && p.decidedBy !== null,
    ).length,
    rejected: list.filter((p) => p.status === 'rejected').length,
    auto: list.filter(
      (p) =>
        p.status === 'auto_resolved' ||
        (p.trustTier === 'auto' && p.status !== 'pending'),
    ).length,
    failed: list.filter((p) => p.status === 'failed').length,
  };
}

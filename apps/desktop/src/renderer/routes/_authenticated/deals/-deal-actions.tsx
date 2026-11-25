import { useState, useEffect, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, type BuyerRequirement, type DealListItem as Deal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { invalidateListingDerivedCaches } from '@/lib/listing-cache';
import { getStatusMeta } from '@/lib/status-config';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/domain';
import {
  formatPaymentKind,
  getCancelledByLabels,
  getDealTitle,
  getDealTransactionType,
  getPartyLabels,
  type DealRowActions,
} from './-deal-view-utils';
import { CreateContractDialog } from './-deal-detail';
import { dealQueries, invalidateDealData } from '@/queries/deals';

const CONTRACT_REQUIRED_STAGES = new Set(['settling', 'completed', 'closed']);

function getErrorMessage(error: unknown, fallback = '요청을 처리하지 못했습니다. 다시 시도해 주세요.') {
  return apiErrorMessage(error, fallback);
}

/**
 * 거래의 단계 변경·취소·삭제. 거래관리 목록(패널)과 거래 전체 화면(/deals/$id)이
 * 같은 확인 흐름과 같은 대화상자를 쓰도록 한 곳에 둔다.
 * 반환한 dialogs를 화면 어딘가에 그대로 그려야 한다.
 */
export function useDealActions({
  onOpenDeal,
  onDeleted,
  onRestored,
}: {
  /** 계약서가 없어 단계 변경이 막혔을 때 "거래 열기"로 갈 곳 */
  onOpenDeal: (dealId: string) => void;
  onDeleted?: (deal: Deal) => void;
  /** 되살린 뒤 갈 곳. 없으면 onOpenDeal (거래관리는 종료된 거래 탭에서 진행 중 탭으로 옮긴다) */
  onRestored?: (dealId: string) => void;
}): {
  actions: Pick<
    DealRowActions,
    'onRequestStage' | 'onRequestCancel' | 'onRequestRestore' | 'onRequestDelete' | 'isUpdating'
  >;
  /** 확인 없이 바로 단계를 옮긴다 (보드에서 카드를 끌어 놓을 때) */
  moveStage: (deal: Deal, stage: string) => void;
  dialogs: ReactNode;
} {
  const queryClient = useQueryClient();
  const [pendingStage, setPendingStage] = useState<{ deal: Deal; stage: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Deal | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Deal | null>(null);
  // 계약서 없이 중도금/잔금 이후로 넘기려 할 때: 확인 창 대신 계약서 작성 창을 열고, 만들면 그 단계로 넘긴다
  const [contractFirst, setContractFirst] = useState<{ deal: Deal; stage: string } | null>(null);
  const needsContractFirst = (deal: Deal, stage: string) =>
    CONTRACT_REQUIRED_STAGES.has(stage) && !deal.contract;
  // 잔금 완료·정산 종료로 넘긴 거래: 손님의 희망 조건을 완료로 바꿀지 묻는다 (자동으로 바꾸지 않는다)
  const [requirementPromptDeal, setRequirementPromptDeal] = useState<Deal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null);

  const invalidateDeals = () => {
    invalidateDealData(queryClient);
    void queryClient.invalidateQueries({ queryKey: ['commission-payments'] });
    // Deal 단계는 파생 상태의 원천 — 매물 목록·그리드·네트워크 노출도 함께 갱신
    invalidateListingDerivedCaches(queryClient);
  };

  const stageMutation = useMutation({
    mutationFn: ({ deal, stage }: { deal: Deal; stage: string }) =>
      api.deals.updateStage(deal.id, { stage }),
    onMutate: async ({ deal, stage }) => {
      await queryClient.cancelQueries({ queryKey: dealQueries.all });
      const previousDeals = queryClient.getQueryData<Deal[]>(dealQueries.active().queryKey);

      queryClient.setQueryData<Deal[]>(dealQueries.active().queryKey, (currentDeals) =>
        currentDeals?.map((currentDeal) =>
          currentDeal.id === deal.id
            ? { ...currentDeal, stage, stageChangedAt: new Date().toISOString() }
            : currentDeal,
        ),
      );

      return { previousDeals };
    },
    onSuccess: (updatedDeal, { deal, stage }) => {
      queryClient.setQueryData<Deal[]>(dealQueries.active().queryKey, (currentDeals) =>
        currentDeals?.map((current) => (current.id === updatedDeal.id ? updatedDeal : current)),
      );
      toast.success(`'${getStatusMeta('dealStage', stage).label}' 단계로 변경되었습니다.`);
      setPendingStage(null);
      // 잔금 완료로 넘길 때 묻고, 그때 답 없이 닫았으면 정산 종료로 넘길 때 한 번 더 묻는다.
      // "그대로 두기"를 고른 거래는 더 묻지 않는다.
      const enteringCompleted = stage === 'completed' && deal.stage !== 'completed' && deal.stage !== 'closed';
      const enteringClosed = stage === 'closed' && deal.stage !== 'closed';
      if (
        (enteringCompleted || enteringClosed) &&
        (deal.matchId || deal.buyerIntakeId) &&
        !isRequirementPromptDismissed(deal.id)
      ) {
        setRequirementPromptDeal(updatedDeal);
      }
    },
    onError: (error, { deal, stage }, context) => {
      if (context?.previousDeals) {
        queryClient.setQueryData(dealQueries.active().queryKey, context.previousDeals);
      }
      setPendingStage(null);
      const needsContract =
        error instanceof ApiError &&
        error.statusCode === 400 &&
        CONTRACT_REQUIRED_STAGES.has(stage) &&
        !deal.contract;
      if (needsContract) {
        toast.error('계약서를 작성해야 중도금/잔금 이후 단계로 변경할 수 있습니다.', {
          description: '본계약 거래 상세의 계약 요약에서 계약서를 먼저 작성하세요.',
          action: {
            label: '거래 열기',
            onClick: () => onOpenDeal(deal.id),
          },
        });
      } else {
        toast.error(getErrorMessage(error, '단계를 바꾸지 못했습니다. 다시 시도해 주세요.'));
      }
    },
    onSettled: () => invalidateDeals(),
  });

  const cancelMutation = useMutation({
    mutationFn: ({
      deal,
      reason,
      cancelledBy,
      paidMoneyNote,
    }: {
      deal: Deal;
      reason: string;
      cancelledBy: string;
      paidMoneyNote?: string;
    }) =>
      api.deals.cancel(deal.id, {
        cancelReason: reason || undefined,
        cancelledBy,
        paidMoneyNote: paidMoneyNote || undefined,
      }),
    onSuccess: () => {
      invalidateDeals();
      toast.success('거래를 취소했습니다. 종료 목록에서 다시 볼 수 있습니다.');
      setCancelTarget(null);
    },
    onError: (error) => toast.error(getErrorMessage(error, '거래를 취소하지 못했습니다. 다시 시도해 주세요.')),
  });

  const restoreMutation = useMutation({
    mutationFn: (deal: Deal) => api.deals.restore(deal.id),
    onSuccess: (deal) => {
      invalidateDeals();
      toast.success('거래를 되살렸습니다. 진행 중 목록에서 이어서 진행하세요.');
      setRestoreTarget(null);
      (onRestored ?? onOpenDeal)(deal.id);
    },
    onError: (error) => {
      setRestoreTarget(null);
      toast.error(getErrorMessage(error, '거래를 되살리지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (deal: Deal) => api.deals.remove(deal.id),
    onSuccess: (_, deal) => {
      invalidateDeals();
      toast.success('거래가 삭제되었습니다.');
      setDeleteTarget(null);
      onDeleted?.(deal);
    },
    onError: (error) => toast.error(getErrorMessage(error, '거래를 삭제하지 못했습니다. 다시 시도해 주세요.')),
  });

  return {
    actions: {
      onRequestStage: (deal, stage) =>
        needsContractFirst(deal, stage) ? setContractFirst({ deal, stage }) : setPendingStage({ deal, stage }),
      onRequestCancel: (deal) => setCancelTarget(deal),
      onRequestRestore: (deal) => setRestoreTarget(deal),
      onRequestDelete: (deal) => setDeleteTarget(deal),
      isUpdating: stageMutation.isPending || restoreMutation.isPending,
    },
    moveStage: (deal, stage) =>
      needsContractFirst(deal, stage) ? setContractFirst({ deal, stage }) : stageMutation.mutate({ deal, stage }),
    dialogs: (
      <>
      <ConfirmDialog
        open={pendingStage !== null}
        onOpenChange={(open) => {
          if (!open) setPendingStage(null);
        }}
        title="단계 변경"
        description={
          pendingStage
            ? `'${getDealTitle(pendingStage.deal)}' 거래를 '${getStatusMeta('dealStage', pendingStage.stage).label}' 단계로 변경할까요?${
                pendingStage.stage === 'closed' ? ' 정산 종료된 거래는 진행 보드에서 제외됩니다.' : ''
              }${
                CONTRACT_REQUIRED_STAGES.has(pendingStage.stage) && !pendingStage.deal.contract
                  ? ' 이 단계로 이동하려면 본계약 계약서가 필요합니다. 계약서를 먼저 작성해 주세요.'
                  : ''
              }${describeUnfinishedMoney(pendingStage.deal, pendingStage.stage)}`
            : undefined
        }
        confirmLabel="변경"
        loading={stageMutation.isPending}
        onConfirm={() => {
          if (pendingStage && !stageMutation.isPending) stageMutation.mutate(pendingStage);
        }}
      />

      <CancelDealDialog
        deal={cancelTarget}
        loading={cancelMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        onSubmit={(reason, cancelledBy, paidMoneyNote) => {
          if (cancelTarget && !cancelMutation.isPending) {
            cancelMutation.mutate({ deal: cancelTarget, reason, cancelledBy, paidMoneyNote });
          }
        }}
      />

      {contractFirst ? (
        <CreateContractDialog
          deal={contractFirst.deal}
          open
          advanceToStage={contractFirst.stage}
          onOpenChange={(open) => {
            if (!open) setContractFirst(null);
          }}
        />
      ) : null}

      {requirementPromptDeal ? (
        <CompleteBuyerRequirementDialog
          deal={requirementPromptDeal}
          onClose={() => setRequirementPromptDeal(null)}
        />
      ) : null}

      <ConfirmDialog
        open={restoreTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRestoreTarget(null);
        }}
        title="거래 되살리기"
        description={
          restoreTarget
            ? `'${getDealTitle(restoreTarget)}' 거래를 '${getStatusMeta('dealStage', restoreTarget.stage).label}' 단계로 되살릴까요? 취소 사유 기록은 지워집니다.${
                restoreTarget.listingId ? ' 매물은 다시 거래 중으로 표시됩니다.' : ''
              }`
            : undefined
        }
        confirmLabel="되살리기"
        loading={restoreMutation.isPending}
        onConfirm={() => {
          if (restoreTarget) restoreMutation.mutate(restoreTarget);
        }}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="거래 삭제"
        description={
          deleteTarget
            ? `'${getDealTitle(deleteTarget)}' 거래를 삭제할까요? 지급 일정과 아직 입금 전인 수수료 청구도 함께 지워지며 되돌릴 수 없습니다. 거래가 깨진 것이라면 삭제 대신 거래 취소로 기록을 남기세요.`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget);
        }}
      />
      </>
    ),
  };
}

/** 받은 가계약금·계약금을 어떻게 했는지 고르는 말 (돈 계산은 하지 않고 기록만 남긴다) */
const PAID_MONEY_CHOICES = ['돌려줌', '위약금으로 남김'] as const;

/**
 * 거래 취소 다이얼로그 — 사유와 취소 주체를 남기고, 돈이 걸린 것을 함께 정리한다:
 * 아직 안 받은 수수료 청구와 앞으로의 대금 일정은 함께 취소, 받은 돈은 기록으로 남기고 처리 메모를 적는다.
 */
function CancelDealDialog({
  deal,
  loading,
  onOpenChange,
  onSubmit,
}: {
  deal: Deal | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string, cancelledBy: string, paidMoneyNote?: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [cancelledBy, setCancelledBy] = useState('mutual');
  const [paidChoice, setPaidChoice] = useState<string>('');
  const [paidCustom, setPaidCustom] = useState('');

  useEffect(() => {
    if (deal) {
      setReason('');
      setCancelledBy('mutual');
      setPaidChoice('');
      setPaidCustom('');
    }
  }, [deal]);

  const transactionType = deal ? getDealTransactionType(deal) : undefined;
  const labels = getCancelledByLabels(transactionType);
  // 목록 줄에는 수수료 청구가 없다(합계만). 취소로 무엇이 정리되는지 보이려면 상세의 청구가 필요하다.
  const detailQuery = useQuery({
    ...dealQueries.detail(deal?.id),
    enabled: Boolean(deal),
  });
  const commissions = detailQuery.data?.commissionPayments ?? [];
  // 청구를 모르는 채로 "정리할 수수료 없음"처럼 보이면 안 된다: 올 때까지 취소 단추를 잠그고, 못 받으면 알린다.
  const commissionsLoading = deal !== null && detailQuery.isPending;
  const commissionsFailed = deal !== null && detailQuery.isError;
  const unpaidCommissions = commissions.filter(
    (payment) => ['draft', 'pending', 'overdue'].includes(payment.status) && payment.actualAmount == null,
  );
  const unpaidCommissionTotal = unpaidCommissions.reduce((sum, payment) => sum + payment.expectedAmount, 0);
  const receivedCommission = commissions.reduce((sum, payment) => sum + (payment.actualAmount ?? 0), 0);
  const payments = deal?.payments ?? [];
  const paidPayments = payments.filter((payment) => payment.paidAmount != null);
  const upcomingPayments = payments.filter(
    (payment) => payment.paidAmount == null && ['pending', 'overdue'].includes(payment.status),
  );
  const paidMoneyNote = paidChoice === 'custom' ? paidCustom.trim() : paidChoice;

  return (
    <Dialog
      open={deal !== null}
      onOpenChange={(open) => {
        if (!open && !loading) onOpenChange(false);
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>거래 취소</DialogTitle>
          <DialogDescription>
            {deal ? `'${getDealTitle(deal)}' 거래를 취소합니다. 거래는 지워지지 않고 종료 목록에 남으며, 잘못 취소했으면 되살릴 수 있습니다.` : ''}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>취소 주체 *</Label>
            <Select value={cancelledBy} onValueChange={setCancelledBy}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(labels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="deal-cancel-reason">취소 사유</Label>
            <Input
              id="deal-cancel-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={`예: ${getPartyLabels(transactionType).buyer} 대출이 나오지 않아 계약 포기`}
            />
          </div>

          {commissionsLoading ? (
            <p className="border-t pt-3 text-[12.5px] text-muted-foreground" aria-live="polite">
              함께 정리될 수수료를 확인하는 중입니다…
            </p>
          ) : null}
          {commissionsFailed ? (
            <div className="flex items-center justify-between gap-3 border-t pt-3 text-[12.5px] text-warning" role="alert">
              <span>함께 정리될 수수료를 불러오지 못했습니다. 받지 않은 청구는 취소되고 받은 수수료는 그대로 남습니다.</span>
              <Button type="button" variant="outline" size="xs" onClick={() => void detailQuery.refetch()}>
                다시 시도
              </Button>
            </div>
          ) : null}

          {/* 돈이 걸린 것 정리 */}
          {unpaidCommissions.length > 0 || receivedCommission > 0 || upcomingPayments.length > 0 ? (
            <ul className="grid gap-1 border-t pt-3 text-[12.5px] text-muted-foreground">
              {unpaidCommissions.length > 0 ? (
                <li>아직 받지 않은 수수료 청구 {unpaidCommissions.length}건({formatMoney(unpaidCommissionTotal)})은 함께 취소됩니다.</li>
              ) : null}
              {receivedCommission > 0 ? (
                <li className="text-warning">
                  받은 수수료 {formatMoney(receivedCommission)}(부가세 별도)은 그대로 남습니다. 돌려줬다면 수수료/정산에서 돌려준 돈으로 기록하세요.
                </li>
              ) : null}
              {upcomingPayments.length > 0 ? (
                <li>앞으로의 대금 일정 {upcomingPayments.length}건은 취소로 표시됩니다.</li>
              ) : null}
            </ul>
          ) : null}

          {paidPayments.length > 0 ? (
            <div className="grid gap-1.5 border-t pt-3">
              <Label>받은 돈은 어떻게 했나요?</Label>
              <p className="text-[12.5px] text-muted-foreground">
                {paidPayments
                  .map((payment) => `${formatPaymentKind(payment.kind, payment.sequence)} ${formatMoney(payment.paidAmount)}`)
                  .join(' · ')}
                {' '}— 기록으로 남고, 고른 내용이 메모로 붙습니다.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[...PAID_MONEY_CHOICES, 'custom'].map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    aria-pressed={paidChoice === choice}
                    className={cn(
                      'h-7 rounded-full border px-2.5 text-[12.5px] text-muted-foreground hover:text-foreground',
                      paidChoice === choice && 'border-foreground/40 text-foreground',
                    )}
                    onClick={() => setPaidChoice(choice)}
                  >
                    {choice === 'custom' ? '직접 적기' : choice}
                  </button>
                ))}
              </div>
              {paidChoice === 'custom' ? (
                <Input
                  autoFocus
                  value={paidCustom}
                  onChange={(event) => setPaidCustom(event.target.value)}
                  placeholder="예: 절반만 돌려줌"
                  aria-label="받은 돈 처리 메모"
                />
              ) : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={loading} onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={loading || commissionsLoading}
            onClick={() => onSubmit(reason, cancelledBy, paidMoneyNote || undefined)}
          >
            취소 처리
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const REQUIREMENT_PROMPT_DISMISSED_KEY = 'estate:deal-requirement-prompt-dismissed';

/** "그대로 두기"를 고른 거래 (이 브라우저에서만 기억한다 — 다시 묻지 않는 편의일 뿐이다) */
function isRequirementPromptDismissed(dealId: string) {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(REQUIREMENT_PROMPT_DISMISSED_KEY) ?? '[]');
    return Array.isArray(stored) && stored.includes(dealId);
  } catch {
    return false;
  }
}

function dismissRequirementPrompt(dealId: string) {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(REQUIREMENT_PROMPT_DISMISSED_KEY) ?? '[]');
    const ids = Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string') : [];
    localStorage.setItem(REQUIREMENT_PROMPT_DISMISSED_KEY, JSON.stringify([...ids.filter((id) => id !== dealId), dealId].slice(-200)));
  } catch {
    // 저장할 수 없으면 다음에 한 번 더 묻는다
  }
}

/** "전세 8억 ~ 9억", "월세 1억 / 300만", "매매 9억까지" */
function formatRequirementBudget(requirement: BuyerRequirement) {
  const range = (min: number | null, max: number | null) => {
    if (min != null && max != null) return min === max ? formatMoney(min) : `${formatMoney(min)} ~ ${formatMoney(max)}`;
    if (max != null) return `${formatMoney(max)}까지`;
    if (min != null) return `${formatMoney(min)}부터`;
    return '';
  };
  const type = requirement.transactionType;
  const label = type ? getStatusMeta('transactionType', type).label : '희망 조건';
  if (type === 'monthly') {
    // 월세는 "1억 / 300만" (보증금 / 월세, 둘 다 단위) — 한쪽 값만 있으면 "까지"를 붙이지 않는다
    const plain = (min: number | null, max: number | null) =>
      min != null && max != null && min !== max
        ? `${formatMoney(min)} ~ ${formatMoney(max)}`
        : max != null
          ? formatMoney(max)
          : min != null
            ? formatMoney(min)
            : '';
    const deposit = plain(requirement.depositMin, requirement.depositMax);
    const rent = plain(requirement.monthlyRentMin, requirement.monthlyRentMax);
    return [label, [deposit, rent].filter(Boolean).join(' / ')].filter(Boolean).join(' ');
  }
  const money =
    type === 'jeonse'
      ? range(requirement.depositMin ?? requirement.priceMin, requirement.depositMax ?? requirement.priceMax)
      : range(requirement.priceMin, requirement.priceMax);
  return [label, money].filter(Boolean).join(' ');
}

/**
 * 거래가 끝났을 때 손님의 희망 조건을 완료로 바꿀지 묻는다. 바꾸면 희망매물 서버가
 * 그 손님의 다른 진행 중 매칭을 "손님 조건 종료"로 닫는다. 그대로 두기를 고르면 아무것도 바꾸지 않는다.
 */
function CompleteBuyerRequirementDialog({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const queryClient = useQueryClient();
  const requirementsQuery = useQuery({
    queryKey: ['deal-buyer-requirements', deal.id],
    queryFn: async (): Promise<BuyerRequirement[]> => {
      if (deal.matchId) {
        const match = await api.matches.findOne(deal.matchId);
        return match.buyerRequirement ? [match.buyerRequirement] : [];
      }
      if (deal.buyerIntakeId) {
        const page = await api.buyerRequirements.findAll({ buyerIntakeId: deal.buyerIntakeId, status: 'active' });
        return page.items;
      }
      return [];
    },
  });
  const active = (requirementsQuery.data ?? []).filter((requirement) => requirement.status === 'active');
  const mutation = useMutation({
    mutationFn: async () => {
      let closedMatches = 0;
      for (const requirement of active) {
        const result = await api.buyerRequirements.updateStatus(requirement.id, 'completed');
        closedMatches += result.closedMatchCount ?? 0;
      }
      return closedMatches;
    },
    onSuccess: (closedMatches) => {
      void queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] });
      void queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast.success(
        closedMatches > 0
          ? `희망 조건을 완료로 바꾸고, 진행 중이던 매칭 ${closedMatches}건을 닫았습니다.`
          : '희망 조건을 완료로 바꿨습니다.',
      );
      onClose();
    },
    onError: (error) => toast.error(apiErrorMessage(error, '희망 조건을 바꾸지 못했습니다. 다시 시도해 주세요.')),
  });

  // 물어볼 것이 없으면 조용히 닫는다 (이미 완료됐거나 손님 조건이 없는 거래)
  useEffect(() => {
    if (requirementsQuery.isSuccess && active.length === 0) onClose();
  }, [requirementsQuery.isSuccess, active.length, onClose]);

  if (!requirementsQuery.isSuccess || active.length === 0) return null;
  const customer = active[0].contact?.name ?? deal.buyerContact?.name ?? '이 손님';

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>희망 조건도 완료로 바꿀까요?</DialogTitle>
          <DialogDescription>
            거래가 끝났습니다. {customer}님의 희망 조건이 아직 진행 중입니다.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1 text-[13px] text-[#2f2e2a]">
          {active.map((requirement) => (
            <li key={requirement.id}>· {formatRequirementBudget(requirement)}</li>
          ))}
        </ul>
        <p className="text-[12.5px] text-muted-foreground">
          완료로 바꾸면 이 손님의 다른 진행 중 매칭은 '손님 조건 종료'로 닫힙니다. 계속 집을 찾는 손님이면 그대로 두세요.
        </p>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => {
              dismissRequirementPrompt(deal.id);
              onClose();
            }}
          >
            그대로 두기
          </Button>
          <Button
            type="button"
            disabled={mutation.isPending}
            onClick={() => {
              if (!mutation.isPending) mutation.mutate();
            }}
          >
            완료로 바꾸기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * 잔금 완료·정산 종료로 넘길 때, 아직 받음으로 적지 않은 대금과 남은 수수료를 확인 창에 알린다.
 * 막지는 않는다(받음 표시를 나중에 하는 사무소도 있다). 예전에는 말없이 넘어가 대시보드·캘린더에
 * 받을 대금이 계속 남아 있었다.
 */
function describeUnfinishedMoney(deal: Deal, stage: string) {
  if (stage !== 'completed' && stage !== 'closed') return '';
  // 돈이 오가는 순서(가계약금 → 계약금 → 중도금 차수 → 잔금)로 적는다
  const order: Record<string, number> = { pre_contract: 0, contract: 1, interim: 2, balance: 3 };
  const unpaid = (deal.payments ?? [])
    .filter((payment) => payment.status !== 'cancelled' && payment.status !== 'paid' && payment.kind !== 'refund')
    .sort(
      (left, right) =>
        (order[left.kind] ?? 9) - (order[right.kind] ?? 9) || (left.sequence ?? 0) - (right.sequence ?? 0),
    );
  const parts: string[] = [];
  if (unpaid.length > 0) {
    parts.push(
      ` 아직 받음으로 적지 않은 대금이 있습니다: ${unpaid
        .map((payment) => `${formatPaymentKind(payment.kind, payment.sequence)} ${formatMoney(payment.scheduledAmount)}`)
        .join(' · ')}. 받았으면 대금·계약 탭에서 받음으로 바꿔 두세요.`,
    );
  }
  const summary = deal.commissionSummary;
  const commissionLeft = summary ? Math.max(0, summary.billed - summary.collected) : 0;
  if (stage === 'closed' && commissionLeft > 0) {
    parts.push(` 아직 받지 않은 수수료 ${formatMoney(commissionLeft)}이 있습니다.`);
  }
  return parts.join('');
}

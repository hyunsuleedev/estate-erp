import { useState, useEffect, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, type Contract, type Deal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { invalidateListingDerivedCaches } from '@/lib/listing-cache';
import { getStatusMeta } from '@/lib/status-config';
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
import { cancelledByLabels, getDealTitle, type DealRowActions } from './-deal-view-utils';

const CONTRACT_REQUIRED_STAGES = new Set(['settling', 'completed', 'closed']);

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청 처리에 실패했습니다.';
}

/**
 * 거래의 단계 변경·취소·삭제. 거래관리 목록(패널)과 거래 전체 화면(/deals/$id)이
 * 같은 확인 흐름과 같은 대화상자를 쓰도록 한 곳에 둔다.
 * 반환한 dialogs를 화면 어딘가에 그대로 그려야 한다.
 */
export function useDealActions({
  contractByDealId,
  onOpenDeal,
  onDeleted,
}: {
  contractByDealId: Map<string, Contract>;
  /** 계약서가 없어 단계 변경이 막혔을 때 "거래 열기"로 갈 곳 */
  onOpenDeal: (dealId: string) => void;
  onDeleted?: (deal: Deal) => void;
}): {
  actions: Pick<DealRowActions, 'onRequestStage' | 'onRequestCancel' | 'onRequestDelete' | 'isUpdating'>;
  /** 확인 없이 바로 단계를 옮긴다 (보드에서 카드를 끌어 놓을 때) */
  moveStage: (deal: Deal, stage: string) => void;
  dialogs: ReactNode;
} {
  const queryClient = useQueryClient();
  const [pendingStage, setPendingStage] = useState<{ deal: Deal; stage: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Deal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null);

  const invalidateDeals = () => {
    void queryClient.invalidateQueries({ queryKey: ['deals'] });
    void queryClient.invalidateQueries({ queryKey: ['commission-payments'] });
    // Deal 단계는 파생 상태의 원천 — 매물 목록·그리드·네트워크 노출도 함께 갱신
    invalidateListingDerivedCaches(queryClient);
  };

  const stageMutation = useMutation({
    mutationFn: ({ deal, stage }: { deal: Deal; stage: string }) =>
      api.deals.updateStage(deal.id, { stage }),
    onMutate: async ({ deal, stage }) => {
      await queryClient.cancelQueries({ queryKey: ['deals'] });
      const previousDeals = queryClient.getQueryData<Deal[]>(['deals']);

      queryClient.setQueryData<Deal[]>(['deals'], (currentDeals) =>
        currentDeals?.map((currentDeal) =>
          currentDeal.id === deal.id
            ? { ...currentDeal, stage, stageChangedAt: new Date().toISOString() }
            : currentDeal,
        ),
      );

      return { previousDeals };
    },
    onSuccess: (updatedDeal, { stage }) => {
      queryClient.setQueryData<Deal[]>(['deals'], (currentDeals) =>
        currentDeals?.map((deal) => (deal.id === updatedDeal.id ? updatedDeal : deal)),
      );
      toast.success(`'${getStatusMeta('dealStage', stage).label}' 단계로 변경되었습니다.`);
      setPendingStage(null);
    },
    onError: (error, { deal, stage }, context) => {
      if (context?.previousDeals) {
        queryClient.setQueryData(['deals'], context.previousDeals);
      }
      setPendingStage(null);
      const needsContract =
        error instanceof ApiError &&
        error.statusCode === 400 &&
        CONTRACT_REQUIRED_STAGES.has(stage) &&
        !contractByDealId.has(deal.id);
      if (needsContract) {
        toast.error('계약서를 작성해야 중도금/잔금 이후 단계로 변경할 수 있습니다.', {
          description: '본계약 거래 상세의 계약 요약에서 계약서를 먼저 작성하세요.',
          action: {
            label: '거래 열기',
            onClick: () => onOpenDeal(deal.id),
          },
        });
      } else {
        toast.error(getErrorMessage(error));
      }
    },
    onSettled: () => invalidateDeals(),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ deal, reason, cancelledBy }: { deal: Deal; reason: string; cancelledBy: string }) =>
      api.deals.cancel(deal.id, { cancelReason: reason || undefined, cancelledBy }),
    onSuccess: () => {
      invalidateDeals();
      toast.success('거래가 취소 처리되었습니다.');
      setCancelTarget(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (deal: Deal) => api.deals.remove(deal.id),
    onSuccess: (_, deal) => {
      invalidateDeals();
      toast.success('거래가 삭제되었습니다.');
      setDeleteTarget(null);
      onDeleted?.(deal);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return {
    actions: {
      onRequestStage: (deal, stage) => setPendingStage({ deal, stage }),
      onRequestCancel: (deal) => setCancelTarget(deal),
      onRequestDelete: (deal) => setDeleteTarget(deal),
      isUpdating: stageMutation.isPending,
    },
    moveStage: (deal, stage) => stageMutation.mutate({ deal, stage }),
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
                pendingStage.stage === 'closed' ? ' 정산종료된 거래는 진행 보드에서 제외됩니다.' : ''
              }${
                CONTRACT_REQUIRED_STAGES.has(pendingStage.stage) && !contractByDealId.has(pendingStage.deal.id)
                  ? ' 이 단계로 이동하려면 본계약 계약서가 필요합니다. 계약서를 먼저 작성해 주세요.'
                  : ''
              }`
            : undefined
        }
        confirmLabel="변경"
        loading={stageMutation.isPending}
        onConfirm={() => {
          if (pendingStage) stageMutation.mutate(pendingStage);
        }}
      />

      <CancelDealDialog
        deal={cancelTarget}
        loading={cancelMutation.isPending}
        onOpenChange={(open) => {
          if (!open) setCancelTarget(null);
        }}
        onSubmit={(reason, cancelledBy) => {
          if (cancelTarget) cancelMutation.mutate({ deal: cancelTarget, reason, cancelledBy });
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
            ? `'${getDealTitle(deleteTarget)}' 거래를 삭제할까요? 지급 스케줄·수수료 청구 등 연결 데이터도 함께 삭제될 수 있으며 되돌릴 수 없습니다.`
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

/** 거래 취소 다이얼로그 — 사유 + 취소 주체 기록 (stage와 직교하는 isCancelled 플래그) */
function CancelDealDialog({
  deal,
  loading,
  onOpenChange,
  onSubmit,
}: {
  deal: Deal | null;
  loading: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string, cancelledBy: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [cancelledBy, setCancelledBy] = useState('mutual');

  useEffect(() => {
    if (deal) {
      setReason('');
      setCancelledBy('mutual');
    }
  }, [deal]);

  return (
    <Dialog
      open={deal !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>거래 취소</DialogTitle>
          <DialogDescription>
            {deal ? `'${getDealTitle(deal)}' 거래를 취소 처리합니다. 단계는 유지되고 취소 플래그로 기록됩니다.` : ''}
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
                {Object.entries(cancelledByLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>취소 사유</Label>
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="예: 매수인 자금 사정으로 계약 포기"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            닫기
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={loading}
            onClick={() => onSubmit(reason, cancelledBy)}
          >
            취소 처리
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

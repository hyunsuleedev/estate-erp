import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Handshake, List, PanelsTopLeft, Plus, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, type Deal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  ConfirmDialog,
  EmptyState,
  FilterBar,
  FilterCount,
  FilterSearch,
  FilterSelect,
  PageHeader,
} from '@/components/domain';
import { DealBoard } from './-deal-board';
import { DealCreateDialog } from './-deal-create-dialog';
import { DealDetailSheet } from './-deal-detail';
import { CancelledDealArchive, ClosedDealArchive, DealListView } from './-deal-list';
import {
  cancelledByLabels,
  dealStageOrder,
  getDealLocationLine,
  getDealTitle,
  getDealTransactionType,
  type DealRowActions,
} from './-deal-view-utils';

type DealViewMode = 'board' | 'list';

const CONTRACT_REQUIRED_STAGES = new Set(['contracted', 'settling', 'completed', 'closed']);

const TX_FILTER_OPTIONS = ['sale', 'jeonse', 'monthly'].map((value) => ({
  value,
  label: getStatusMeta('transactionType', value).label,
}));

const STAGE_FILTER_OPTIONS = dealStageOrder.map((value) => ({
  value,
  label: getStatusMeta('dealStage', value).label,
}));

const JOINT_FILTER_OPTIONS = [
  { value: 'joint', label: '공동중개만' },
  { value: 'solo', label: '단독중개만' },
];

const CONTRACT_FILTER_OPTIONS = [
  { value: 'has', label: '계약서 있음' },
  { value: 'none', label: '계약서 없음' },
];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '요청 처리에 실패했습니다.';
}

export const Route = createFileRoute('/_authenticated/deals/')({
  component: DealsPage,
});

function DealsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [txFilter, setTxFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [jointFilter, setJointFilter] = useState('');
  const [contractFilter, setContractFilter] = useState('');
  const [viewMode, setViewMode] = useState<DealViewMode>('board');
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingStage, setPendingStage] = useState<{ deal: Deal; stage: string } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Deal | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null);
  const deferredSearch = useDeferredValue(searchQuery);
  const referenceDate = useMemo(() => new Date(), []);

  const dealsQuery = useQuery({
    queryKey: ['deals'],
    queryFn: () => api.deals.findAll(),
  });
  const deals = useMemo(() => dealsQuery.data ?? [], [dealsQuery.data]);

  const contractsQuery = useQuery({
    queryKey: ['contracts'],
    queryFn: () => api.contracts.findAll(),
  });
  const contractByDealId = useMemo(
    () => new Map((contractsQuery.data ?? []).map((contract) => [contract.dealId, contract])),
    [contractsQuery.data],
  );

  const invalidateDeals = () => {
    void queryClient.invalidateQueries({ queryKey: ['deals'] });
    void queryClient.invalidateQueries({ queryKey: ['commission-payments'] });
  };

  const stageMutation = useMutation({
    mutationFn: ({ deal, stage }: { deal: Deal; stage: string }) =>
      api.deals.updateStage(deal.id, { stage }),
    onSuccess: (_, { stage }) => {
      invalidateDeals();
      toast.success(`'${getStatusMeta('dealStage', stage).label}' 단계로 변경되었습니다.`);
      setPendingStage(null);
    },
    onError: (error, { deal, stage }) => {
      setPendingStage(null);
      const needsContract =
        error instanceof ApiError &&
        error.statusCode === 400 &&
        CONTRACT_REQUIRED_STAGES.has(stage) &&
        !contractByDealId.has(deal.id);
      if (needsContract) {
        toast.error('계약서가 있어야 본계약 이후 단계로 변경할 수 있습니다.', {
          description: '거래 상세의 계약 요약에서 계약서를 먼저 작성하세요.',
          action: {
            label: '거래 열기',
            onClick: () => setSelectedDealId(deal.id),
          },
        });
      } else {
        toast.error(getErrorMessage(error));
      }
    },
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
      if (selectedDealId === deal.id) setSelectedDealId(null);
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const filteredDeals = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return deals.filter((deal) => {
      const transactionType = getDealTransactionType(deal);
      if (txFilter && transactionType !== txFilter) return false;
      if (stageFilter && deal.stage !== stageFilter) return false;
      if (jointFilter === 'joint' && !deal.isJointBrokerage) return false;
      if (jointFilter === 'solo' && deal.isJointBrokerage) return false;
      if (contractFilter === 'has' && !contractByDealId.has(deal.id)) return false;
      if (contractFilter === 'none' && contractByDealId.has(deal.id)) return false;

      if (!query) return true;

      return [
        getDealTitle(deal),
        getDealLocationLine(deal),
        deal.buyerContact?.name,
        deal.buyerContact?.phone,
        deal.sellerContact?.name,
        deal.sellerContact?.phone,
        deal.partnerBroker?.name,
        deal.partnerBroker?.phone,
        deal.memo,
        deal.specialTerms,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [deals, deferredSearch, txFilter, stageFilter, jointFilter, contractFilter, contractByDealId]);

  const activeDeals = useMemo(
    () => filteredDeals.filter((deal) => !deal.isCancelled && deal.stage !== 'closed'),
    [filteredDeals],
  );
  const closedDeals = useMemo(
    () => filteredDeals.filter((deal) => !deal.isCancelled && deal.stage === 'closed'),
    [filteredDeals],
  );
  const cancelledDeals = useMemo(
    () => filteredDeals.filter((deal) => deal.isCancelled),
    [filteredDeals],
  );
  const selectedDeal = useMemo(
    () => deals.find((deal) => deal.id === selectedDealId) ?? null,
    [deals, selectedDealId],
  );

  useEffect(() => {
    if (selectedDealId && !dealsQuery.isLoading && !deals.some((deal) => deal.id === selectedDealId)) {
      setSelectedDealId(null);
    }
  }, [deals, dealsQuery.isLoading, selectedDealId]);

  const kpis = useMemo(() => {
    const valid = deals.filter((deal) => !deal.isCancelled);
    const active = valid.filter((deal) => deal.stage !== 'closed');
    return {
      activeCount: active.length,
      expectedCommission: active.reduce((sum, deal) => sum + (deal.commissionSummary?.billed ?? 0), 0),
      completedCount: valid.filter((deal) => deal.stage === 'completed').length,
      jointCount: active.filter((deal) => deal.isJointBrokerage).length,
    };
  }, [deals]);

  const rowActions: DealRowActions = {
    onSelect: setSelectedDealId,
    onRequestStage: (deal, stage) => setPendingStage({ deal, stage }),
    onRequestCancel: (deal) => setCancelTarget(deal),
    onRequestDelete: (deal) => setDeleteTarget(deal),
    isUpdating: stageMutation.isPending,
  };

  const hasFilters =
    Boolean(deferredSearch.trim()) || Boolean(txFilter) || Boolean(stageFilter) || Boolean(jointFilter) || Boolean(contractFilter);

  return (
    <div className="flex min-h-0 flex-col gap-4 pt-4">
      <PageHeader
        title="거래"
        description="매칭에서 이관된 거래부터 정산 종료까지 파이프라인으로 관리합니다."
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            새 거래
          </Button>
        }
        className="mb-0"
      />

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiTile label="진행 거래" value={`${kpis.activeCount}건`} />
        <KpiTile
          label="예상 수수료 (진행)"
          value={kpis.expectedCommission ? formatMoney(kpis.expectedCommission) : '—'}
        />
        <KpiTile label="잔금완료" value={`${kpis.completedCount}건`} />
        <KpiTile label="공동중개 (진행)" value={`${kpis.jointCount}건`} />
      </div>

      <FilterBar>
        <FilterSearch value={searchQuery} onChange={setSearchQuery} placeholder="매물·고객·주소 검색" />
        <FilterSelect label="거래유형" value={txFilter} onChange={setTxFilter} options={TX_FILTER_OPTIONS} />
        <FilterSelect label="단계" value={stageFilter} onChange={setStageFilter} options={STAGE_FILTER_OPTIONS} />
        <FilterSelect label="공동중개" value={jointFilter} onChange={setJointFilter} options={JOINT_FILTER_OPTIONS} />
        <FilterSelect label="계약서" value={contractFilter} onChange={setContractFilter} options={CONTRACT_FILTER_OPTIONS} />
        <FilterCount n={filteredDeals.length} />
        <div className="flex w-fit items-center rounded-md bg-muted p-0.5">
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setViewMode('board')}
            className={cn(
              'h-7 rounded px-2',
              viewMode === 'board' && 'bg-background text-foreground shadow-xs hover:bg-background',
            )}
          >
            <PanelsTopLeft className="size-3.5" />
            보드
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="xs"
            onClick={() => setViewMode('list')}
            className={cn(
              'h-7 rounded px-2',
              viewMode === 'list' && 'bg-background text-foreground shadow-xs hover:bg-background',
            )}
          >
            <List className="size-3.5" />
            리스트
          </Button>
        </div>
      </FilterBar>

      {dealsQuery.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : dealsQuery.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-12 text-center">
          <p className="text-sm text-muted-foreground">거래 목록을 불러오지 못했습니다.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void dealsQuery.refetch()}>
            <RotateCcw className="size-4" />
            재시도
          </Button>
        </div>
      ) : deals.length === 0 ? (
        <EmptyState
          icon={Handshake}
          title="등록된 거래가 없습니다"
          description="매칭에서 거래로 전환하거나, 새 거래를 직접 생성하세요."
          action={
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="size-4" />
              새 거래
            </Button>
          }
        />
      ) : (
        <>
          {viewMode === 'board' ? (
            <DealBoard
              deals={activeDeals}
              selectedDealId={selectedDeal?.id ?? null}
              referenceDate={referenceDate}
              actions={rowActions}
            />
          ) : (
            <DealListView
              deals={activeDeals}
              contractByDealId={contractByDealId}
              selectedDealId={selectedDeal?.id ?? null}
              referenceDate={referenceDate}
              actions={rowActions}
            />
          )}

          {activeDeals.length === 0 && hasFilters ? (
            <div className="rounded-lg border border-dashed bg-muted/50 px-4 py-10 text-center text-sm text-muted-foreground">
              조건에 맞는 진행 거래가 없습니다.
            </div>
          ) : null}

          <ClosedDealArchive
            deals={closedDeals}
            open={showClosed}
            onToggle={() => setShowClosed((prev) => !prev)}
            actions={rowActions}
          />
          <CancelledDealArchive
            deals={cancelledDeals}
            open={showCancelled}
            onToggle={() => setShowCancelled((prev) => !prev)}
            actions={rowActions}
          />
        </>
      )}

      <DealDetailSheet
        deal={selectedDeal}
        contract={selectedDeal ? (contractByDealId.get(selectedDeal.id) ?? null) : null}
        open={selectedDeal !== null}
        referenceDate={referenceDate}
        onOpenChange={(open) => {
          if (!open) setSelectedDealId(null);
        }}
        actions={rowActions}
      />

      <DealCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(deal) => setSelectedDealId(deal.id)}
      />

      <ConfirmDialog
        open={pendingStage !== null}
        onOpenChange={(open) => {
          if (!open) setPendingStage(null);
        }}
        title="단계 변경"
        description={
          pendingStage
            ? `'${getDealTitle(pendingStage.deal)}' 거래를 '${getStatusMeta('dealStage', pendingStage.stage).label}' 단계로 변경할까요?${
                pendingStage.stage === 'closed' ? ' 정산종료된 거래는 보드에서 제외되고 아카이브로 이동합니다.' : ''
              }${
                CONTRACT_REQUIRED_STAGES.has(pendingStage.stage) && !contractByDealId.has(pendingStage.deal.id)
                  ? ' 이 단계는 계약서가 필요합니다. 계약서가 없으면 변경이 거부됩니다.'
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
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums text-foreground">{value}</div>
    </div>
  );
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

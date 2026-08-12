import { invalidateListingDerivedCaches } from '@/lib/listing-cache';
import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Handshake,
  List,
  PanelsTopLeft,
  Plus,
  RotateCcw,
  Rows3,
  Rows4,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ApiError, type Deal } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
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
import { ConfirmDialog, EmptyState, FilterSelect } from '@/components/domain';
import { DealBoard } from './-deal-board';
import { DealCreateDialog } from './-deal-create-dialog';
import { DealDetailSheet } from './-deal-detail';
import { CancelledDealArchive, DealListView } from './-deal-list';
import {
  cancelledByLabels,
  dealStageOrder,
  getDealLocationLine,
  getDealPipelineHealth,
  getDealTitle,
  getDealTransactionType,
  type DealPipelineHealthState,
  type DealRowActions,
} from './-deal-view-utils';

type DealViewMode = 'board' | 'list';

const CONTRACT_REQUIRED_STAGES = new Set(['settling', 'completed', 'closed']);

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

const HEALTH_FILTER_OPTIONS: Array<{ value: DealPipelineHealthState; label: string }> = [
  { value: 'overdue', label: '일정 지연' },
  { value: 'stale', label: '단계 정체' },
  { value: 'unscheduled', label: '다음 일정 미정' },
  { value: 'healthy', label: '정상 진행' },
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
  const [healthFilter, setHealthFilter] = useState('');
  const [viewMode, setViewMode] = useState<DealViewMode>('board');
  const [compactCards, setCompactCards] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
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
    () =>
      new Map(
        (contractsQuery.data ?? [])
          .filter((contract) => contract.dealId !== null)
          .map((contract) => [contract.dealId as string, contract]),
      ),
    [contractsQuery.data],
  );

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
            onClick: () => setSelectedDealId(deal.id),
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
      if (healthFilter && getDealPipelineHealth(deal, referenceDate).state !== healthFilter) return false;

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
  }, [
    deals,
    deferredSearch,
    txFilter,
    stageFilter,
    jointFilter,
    contractFilter,
    contractByDealId,
    healthFilter,
    referenceDate,
  ]);

  const activeDeals = useMemo(
    () => filteredDeals.filter((deal) => !deal.isCancelled && deal.stage !== 'closed'),
    [filteredDeals],
  );
  const cancelledDeals = useMemo(
    () => filteredDeals.filter((deal) => deal.isCancelled),
    [filteredDeals],
  );
  const atRiskDealCount = useMemo(
    () => activeDeals.filter((deal) => getDealPipelineHealth(deal, referenceDate).isAtRisk).length,
    [activeDeals, referenceDate],
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

  const rowActions: DealRowActions = {
    onSelect: setSelectedDealId,
    onRequestStage: (deal, stage) => setPendingStage({ deal, stage }),
    onRequestCancel: (deal) => setCancelTarget(deal),
    onRequestDelete: (deal) => setDeleteTarget(deal),
    isUpdating: stageMutation.isPending,
  };

  const hasFilters =
    Boolean(deferredSearch.trim()) ||
    Boolean(txFilter) ||
    Boolean(stageFilter) ||
    Boolean(jointFilter) ||
    Boolean(contractFilter) ||
    Boolean(healthFilter);

  return (
    <div data-deals-page className="-m-4 flex min-h-0 flex-1 flex-col bg-white">
      {/* 1행: 검색 + 현재 파이프라인 요약 + 생성 */}
      <section className="shrink-0 border-b border-border bg-white px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative min-w-[260px] max-w-md flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="매물, 고객, 주소 검색"
              className="h-8 border-transparent bg-[#f7f6f3] pl-8 pr-8 text-[13px] shadow-none hover:border-border focus:border-input focus:bg-white"
            />
            {searchQuery ? (
              <button
                type="button"
                aria-label="검색어 지우기"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div
            className="ml-auto flex shrink-0 items-center gap-2.5 text-[12px] text-muted-foreground"
            aria-label={`진행 거래 ${activeDeals.length}건, 일정 주의 ${atRiskDealCount}건`}
          >
            <span>
              진행 <strong className="font-semibold tabular-nums text-foreground">{activeDeals.length}</strong>
            </span>
            <span className="h-3.5 w-px bg-border" aria-hidden="true" />
            <span>
              일정 주의{' '}
              <strong
                className={cn(
                  'font-semibold tabular-nums',
                  atRiskDealCount > 0 ? 'text-amber-700' : 'text-foreground',
                )}
              >
                {atRiskDealCount}
              </strong>
            </span>
          </div>

          <Button type="button" size="sm" className="shrink-0 px-3.5" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" aria-hidden="true" />
            새 거래
          </Button>
        </div>
      </section>

      {/* 2행: 데이터베이스 보기 + 필터 + 밀도 */}
      <section className="shrink-0 overflow-x-auto border-b border-border bg-[#faf9f6] px-3 py-2">
        <div className="flex w-full min-w-max items-center gap-1.5">
          <div className="flex shrink-0 rounded-lg bg-[#f1f0ed] p-[3px]">
            <button
              type="button"
              aria-pressed={viewMode === 'board'}
              onClick={() => setViewMode('board')}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors',
                viewMode === 'board'
                  ? 'bg-white text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <PanelsTopLeft className="size-3.5" aria-hidden="true" />
              보드
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors',
                viewMode === 'list'
                  ? 'bg-white text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <List className="size-3.5" aria-hidden="true" />
              리스트
            </button>
          </div>

          <div className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />

          <div className="flex shrink-0 rounded-lg bg-[#f1f0ed] p-[3px]">
            {[{ value: '', label: '전체' }, ...TX_FILTER_OPTIONS].map((option) => (
              <button
                key={option.value || 'all'}
                type="button"
                aria-pressed={txFilter === option.value}
                onClick={() => setTxFilter(option.value)}
                className={cn(
                  'h-7 rounded-md px-2.5 text-[12px] font-medium transition-colors',
                  txFilter === option.value
                    ? 'bg-[#37352f] text-white shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <FilterSelect
            label="단계"
            value={stageFilter}
            onChange={setStageFilter}
            options={STAGE_FILTER_OPTIONS}
            className="h-8 border-[#e7e5df] bg-white px-2.5 text-[12px] shadow-none"
          />
          <FilterSelect
            label="공동중개"
            value={jointFilter}
            onChange={setJointFilter}
            options={JOINT_FILTER_OPTIONS}
            className="h-8 border-[#e7e5df] bg-white px-2.5 text-[12px] shadow-none"
          />
          <FilterSelect
            label="계약서"
            value={contractFilter}
            onChange={setContractFilter}
            options={CONTRACT_FILTER_OPTIONS}
            className="h-8 border-[#e7e5df] bg-white px-2.5 text-[12px] shadow-none"
          />
          <FilterSelect
            label="진행 상태"
            value={healthFilter}
            onChange={setHealthFilter}
            options={HEALTH_FILTER_OPTIONS}
            className="h-8 border-[#e7e5df] bg-white px-2.5 text-[12px] shadow-none"
          />

          {hasFilters ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              className="h-8 gap-1 px-2 text-[11px] text-muted-foreground"
              onClick={() => {
                setSearchQuery('');
                setTxFilter('');
                setStageFilter('');
                setJointFilter('');
                setContractFilter('');
                setHealthFilter('');
              }}
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              초기화
            </Button>
          ) : null}

          <span className="ml-auto px-1 text-[12px] tabular-nums text-muted-foreground">
            {filteredDeals.length.toLocaleString()}건
          </span>

          {viewMode === 'board' ? (
            <div className="flex shrink-0 items-center rounded-lg border border-[#e7e5df] bg-white p-[3px]">
              <button
                type="button"
                aria-label="카드 자세히 보기"
                aria-pressed={!compactCards}
                title="카드 자세히"
                onClick={() => setCompactCards(false)}
                className={cn(
                  'flex size-7 items-center justify-center rounded-md transition-colors',
                  !compactCards
                    ? 'bg-[#f1f0ed] text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Rows4 className="size-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="카드 간결하게 보기"
                aria-pressed={compactCards}
                title="카드 간결하게"
                onClick={() => setCompactCards(true)}
                className={cn(
                  'flex size-7 items-center justify-center rounded-md transition-colors',
                  compactCards
                    ? 'bg-[#f1f0ed] text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Rows3 className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col overflow-auto bg-white px-3 py-3">
        {dealsQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-16 w-full" />
            ))}
          </div>
        ) : dealsQuery.isError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 border border-dashed border-[#e7e5df] px-4 py-12 text-center">
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
            className="flex-1"
            action={
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                새 거래
              </Button>
            }
          />
        ) : (
          <div className="space-y-3">
            {viewMode === 'board' ? (
              <DealBoard
                deals={activeDeals}
                selectedDealId={selectedDeal?.id ?? null}
                referenceDate={referenceDate}
                compact={compactCards}
                actions={rowActions}
                onStageDrop={(deal, stage) => stageMutation.mutate({ deal, stage })}
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
              <div className="border border-dashed border-[#e7e5df] bg-[#faf9f6] px-4 py-10 text-center text-sm text-muted-foreground">
                조건에 맞는 진행 거래가 없습니다.
              </div>
            ) : null}

            <CancelledDealArchive
              deals={cancelledDeals}
              open={showCancelled}
              onToggle={() => setShowCancelled((prev) => !prev)}
              actions={rowActions}
            />
          </div>
        )}
      </section>

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

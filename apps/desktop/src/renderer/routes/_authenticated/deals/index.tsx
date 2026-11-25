import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ApiError } from '@estate-erp/api-client';
import {
  Activity,
  Archive,
  CircleDot,
  Columns3,
  FileText,
  Handshake,
  List,
  ListFilter,
  Plus,
  RotateCcw,
  Rows3,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getStatusMeta } from '@/lib/status-config';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/domain';
import {
  ToolbarFilterChip,
  ToolbarPillSearch,
  ToolbarPillTabs,
  ToolbarPillToggle,
  ToolbarSelectPanel,
  toolbarGhostButtonClassName,
} from '../properties/-components/property-toolbar';
import { DealBoard, DealBoardSkeleton } from './-deal-board';
import { DealCreateDialog } from './-deal-create-dialog';
import { useDealActions } from './-deal-actions';
import { DealInspector } from './-deal-detail';
import { EndedDeals } from './-ended-deals';
import { DealListView } from './-deal-list';
import type { Deal } from '@estate-erp/api-client';
import {
  dealStageOrder,
  getDealLocationLine,
  getDealPipelineHealth,
  getDealTitle,
  getDealTransactionType,
  type DealPipelineHealthState,
  type DealRowActions,
} from './-deal-view-utils';
import { dealQueries } from '@/queries/deals';

type DealViewMode = 'board' | 'list';

const TX_TAB_OPTIONS = [
  { value: 'all', label: '전체' },
  ...['sale', 'jeonse', 'monthly'].map((value) => ({
    value,
    label: getStatusMeta('transactionType', value).label,
  })),
];

const STAGE_FILTER_OPTIONS = dealStageOrder.filter((value) => value !== 'closed').map((value) => ({
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

interface DealsSearch {
  dealId?: string;
}

export const Route = createFileRoute('/_authenticated/deals/')({
  validateSearch: (search: Record<string, unknown>): DealsSearch => ({
    dealId:
      typeof search.dealId === 'string' && search.dealId.trim()
        ? search.dealId
        : undefined,
  }),
  component: DealsPage,
});

function DealsPage() {
  const { dealId: deepLinkDealId } = Route.useSearch();
  const [searchQuery, setSearchQuery] = useState('');
  const [txFilter, setTxFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [jointFilter, setJointFilter] = useState('');
  const [contractFilter, setContractFilter] = useState('');
  const [healthFilter, setHealthFilter] = useState('');
  const [viewMode, setViewMode] = useState<DealViewMode>('list');
  const [compactCards, setCompactCards] = useState(false);
  const [isFilterRowOpen, setIsFilterRowOpen] = useState(true);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(
    deepLinkDealId ?? null,
  );
  const [scope, setScope] = useState<'active' | 'archive'>('active');
  const [createOpen, setCreateOpen] = useState(false);
  const deferredSearch = useDeferredValue(searchQuery);
  const referenceDate = useMemo(() => new Date(), []);

  const dealsQuery = useQuery({
    ...dealQueries.active(),
    enabled: scope === 'active',
  });
  const deals = useMemo(() => dealsQuery.data ?? [], [dealsQuery.data]);

  useEffect(() => {
    if (deepLinkDealId) setSelectedDealId(deepLinkDealId);
  }, [deepLinkDealId]);


  const filteredDeals = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return deals.filter((deal) => {
      const transactionType = getDealTransactionType(deal);
      if (txFilter && transactionType !== txFilter) return false;
      if (stageFilter && deal.stage !== stageFilter) return false;
      if (jointFilter === 'joint' && !deal.isJointBrokerage) return false;
      if (jointFilter === 'solo' && deal.isJointBrokerage) return false;
      if (contractFilter === 'has' && !deal.contract) return false;
      if (contractFilter === 'none' && deal.contract) return false;
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
    healthFilter,
    referenceDate,
  ]);

  const activeDeals = useMemo(
    () => filteredDeals.filter((deal) => !deal.isCancelled && deal.stage !== 'closed'),
    [filteredDeals],
  );
  const listedDeal = deals.find((deal) => deal.id === selectedDealId);
  const detailQuery = useQuery({
    ...dealQueries.detail(selectedDealId),
    enabled: Boolean(selectedDealId),
  });
  // 옆 패널은 상세를 보인다(수수료 청구 · 배분 · 연락처 상세는 목록 줄에 없다).
  // 상세가 오기 전에는 목록 줄로 먼저 그린다 — 수수료 구역은 청구가 올 때까지 기다린다.
  const selectedDeal = detailQuery.data ?? (listedDeal as Deal | undefined);
  const navigateDeals = Route.useNavigate();
  // 주소(?dealId=)나 다른 화면에서 연 거래를 불러오지 못했을 때: 빈 패널·날 단추를 남기지 않고 한 번 알린다.
  // 없는 거래(404)·형식이 틀린 id(400)는 주소에서 지워 새로 고침·뒤로 가기 때 다시 묻지 않는다.
  const reportedDealErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedDealId || listedDeal || !detailQuery.isError) return;
    if (reportedDealErrorRef.current === selectedDealId) return;
    reportedDealErrorRef.current = selectedDealId;
    const failedId = selectedDealId;
    const error = detailQuery.error;
    const notFound = error instanceof ApiError && (error.statusCode === 404 || error.statusCode === 400);
    setSelectedDealId(null);
    if (notFound) {
      toast.error('거래를 찾을 수 없습니다. 지워졌을 수 있습니다.');
    } else {
      toast.error('거래를 불러오지 못했습니다.', {
        action: {
          label: '다시 시도',
          onClick: () => {
            reportedDealErrorRef.current = null;
            setSelectedDealId(failedId);
          },
        },
      });
    }
    if (deepLinkDealId === failedId) void navigateDeals({ search: {}, replace: true });
  }, [selectedDealId, listedDeal, detailQuery.isError, detailQuery.error, deepLinkDealId, navigateDeals]);

  // 상세 패널은 매물관리와 같은 방식으로 열고 닫는다: 닫을 때는 미끄러져 나간 뒤에 선택을 지운다.
  const [isInspectorClosing, setIsInspectorClosing] = useState(false);
  const [inspectorMotion, setInspectorMotion] = useState(true);
  const openDealInspector = useCallback((dealId: string) => {
    setInspectorMotion(!document.activeElement?.matches(':focus-visible'));
    setIsInspectorClosing(false);
    setSelectedDealId(dealId);
  }, []);
  const closeDealInspector = useCallback((animate = true) => {
    setInspectorMotion(animate);
    setIsInspectorClosing(true);
  }, []);
  const finishClosingDealInspector = useCallback(() => {
    setSelectedDealId(null);
    setIsInspectorClosing(false);
  }, []);
  // 닫히는 중인 거래는 목록·보드에서 선택 표시를 바로 뺀다
  const openDealId = isInspectorClosing ? null : (selectedDeal?.id ?? null);

  const {
    actions: dealActions,
    moveStage,
    dialogs: dealDialogs,
  } = useDealActions({
    onOpenDeal: openDealInspector,
    onDeleted: (deal) => {
      if (selectedDealId === deal.id) setSelectedDealId(null);
    },
    // 종료된 거래 탭에서 되살렸으면 진행 중 탭으로 옮겨 그 거래를 이어서 보여 준다
    onRestored: (dealId) => {
      setScope('active');
      openDealInspector(dealId);
    },
  });
  const rowActions: DealRowActions = {
    onSelect: openDealInspector,
    onCloseDetail: closeDealInspector,
    ...dealActions,
  };

  // 필터 줄의 칩 네 개. 고르면 닫히고, 같은 값을 다시 누르면 풀린다.
  const filterChips = [
    { label: '단계', icon: <CircleDot />, value: stageFilter, onChange: setStageFilter, options: STAGE_FILTER_OPTIONS },
    { label: '공동중개', icon: <Users />, value: jointFilter, onChange: setJointFilter, options: JOINT_FILTER_OPTIONS },
    { label: '계약서', icon: <FileText />, value: contractFilter, onChange: setContractFilter, options: CONTRACT_FILTER_OPTIONS },
    { label: '진행 상태', icon: <Activity />, value: healthFilter, onChange: setHealthFilter, options: HEALTH_FILTER_OPTIONS },
  ];
  const hasChipFilters = filterChips.some((chip) => Boolean(chip.value));
  const resetFilters = () => {
    setSearchQuery('');
    setTxFilter('');
    setStageFilter('');
    setJointFilter('');
    setContractFilter('');
    setHealthFilter('');
  };

  const hasFilters =
    Boolean(deferredSearch.trim()) ||
    Boolean(txFilter) ||
    Boolean(stageFilter) ||
    Boolean(jointFilter) ||
    Boolean(contractFilter) ||
    Boolean(healthFilter);

  // 진행 중인 거래와 끝난 거래(정산 종료·취소)를 오가는 단추. 두 목록의 툴바 오른쪽 같은 자리에 둔다.
  const scopeToggle = (
    <ToolbarPillToggle
      shape="muted"
      ariaLabel="거래 목록 구분"
      value={scope}
      onChange={(next) => {
        if (next === scope) return;
        setScope(next);
        setSelectedDealId(null);
      }}
      options={[
        { value: 'active', label: '진행', icon: <CircleDot /> },
        { value: 'archive', label: '종료', icon: <Archive /> },
      ]}
    />
  );

  // 툴바 오른쪽 묶음. 진행·종료 두 목록이 같은 자리에 같은 단추를 둬서 오갈 때 화면이 이어진다.
  // 보드는 진행 중인 거래의 단계판이라 종료 목록에서는 고를 수 없다(자리는 지키고 흐리게 둔다).
  // 종료 목록에서는 리스트로 보이지만 고른 보기는 그대로 두어, 진행으로 돌아오면 보던 보기로 이어진다.
  const toolbarActions = (
    <>
      {scopeToggle}
      <ToolbarPillToggle
        shape="muted"
        ariaLabel="거래 보기 방식"
        value={scope === 'archive' ? 'list' : viewMode}
        onChange={(next) => {
          if (scope === 'active') setViewMode(next);
        }}
        options={[
          { value: 'list', label: '리스트', icon: <List /> },
          {
            value: 'board',
            label: '보드',
            icon: <Columns3 />,
            disabled: scope === 'archive',
            disabledTitle: '보드는 진행 중인 거래에서 볼 수 있습니다.',
          },
        ]}
      />
      <Button
        type="button"
        size="sm"
        aria-label="새 거래"
        className="h-[30px] shrink-0 rounded-[8px] px-3"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="size-3.5" aria-hidden="true" />
        {/* 툴바 폭이 768px보다 좁으면 아이콘만 */}
        <span className="@max-3xl:hidden">새 거래</span>
      </Button>
    </>
  );

  return (
    <div data-deals-page className="relative -m-4 flex min-h-0 flex-1 flex-col bg-white">
      {scope === 'archive' ? <EndedDeals onOpen={openDealInspector} trailing={toolbarActions} /> : <>
      {/* 1행 "찾기": 매물관리와 같은 순서 — 거래유형 · 검색 · 필터 접기 │ 요약 · 보기 전환 · 새 거래 */}
      <section className="shrink-0 border-b border-border bg-white px-3 py-2.5">
        <div className="@container flex min-w-0 items-center gap-2">
          <ToolbarPillTabs
            shape="muted"
            ariaLabel="거래유형"
            value={txFilter || 'all'}
            options={TX_TAB_OPTIONS}
            onChange={(value) => setTxFilter(value === 'all' ? '' : value)}
          />

          <div className="flex min-w-0 max-w-[360px] flex-1">
            <ToolbarPillSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="매물, 고객, 주소"
              ariaLabel="거래 검색"
            />
          </div>

          <button
            type="button"
            aria-label={isFilterRowOpen ? '필터 줄 접기' : '필터 줄 펼치기'}
            aria-pressed={isFilterRowOpen}
            title="필터"
            onClick={() => setIsFilterRowOpen((open) => !open)}
            className={cn(
              'inline-flex size-[30px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[rgba(60,52,40,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20',
              // 접힌 채로 조건이 걸려 있으면 파랗게 알린다
              !isFilterRowOpen && hasChipFilters
                ? 'text-[#2383e2]'
                : 'text-[#6f6c66] hover:text-foreground',
            )}
          >
            <ListFilter className="size-3.5" />
          </button>
          {viewMode === 'board' ? (
            <button
              type="button"
              aria-label="카드 간결하게 보기"
              aria-pressed={compactCards}
              title={compactCards ? '카드 자세히' : '카드 간결하게'}
              onClick={() => setCompactCards((compact) => !compact)}
              className={cn(
                '-ml-1 inline-flex size-[30px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[rgba(60,52,40,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20',
                compactCards
                  ? 'bg-[rgba(60,52,40,0.06)] text-foreground'
                  : 'text-[#6f6c66] hover:text-foreground',
              )}
            >
              <Rows3 className="size-3.5" />
            </button>
          ) : null}

          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!isFilterRowOpen && hasFilters ? (
              <button
                type="button"
                className={cn(toolbarGhostButtonClassName, 'rounded-full')}
                onClick={resetFilters}
              >
                <RotateCcw className="size-3.5" />
                초기화
              </button>
            ) : null}
            {toolbarActions}
          </div>
        </div>
      </section>

      {/* 2행 "좁히기": 구분선 없이 본문으로 이어진다. 필터 아이콘으로 접는다. */}
      {isFilterRowOpen ? (
        <section className="flex shrink-0 items-start gap-2 bg-white px-3 pt-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
            {filterChips.map((chip) => (
              <ToolbarFilterChip
                key={chip.label}
                label={chip.label}
                shape="soft"
                icon={chip.icon}
                summary={
                  chip.value
                    ? (chip.options.find((option) => option.value === chip.value)?.label ?? chip.value)
                    : null
                }
                onClear={() => chip.onChange('')}
                contentClassName="w-[180px] p-0"
              >
                {(close) => (
                  <ToolbarSelectPanel
                    options={chip.options}
                    value={chip.value}
                    allValue=""
                    onChange={chip.onChange}
                    onClose={close}
                  />
                )}
              </ToolbarFilterChip>
            ))}
          </div>

          <div className="flex h-7 shrink-0 items-center gap-0.5">
            <span className="px-1.5 text-[12.5px] tabular-nums text-muted-foreground">
              {filteredDeals.length.toLocaleString()}건
            </span>
            {hasFilters ? (
              <button
                type="button"
                className={cn(toolbarGhostButtonClassName, 'rounded-full')}
                onClick={resetFilters}
              >
                <RotateCcw className="size-3.5" />
                초기화
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className="flex min-h-0 flex-1 flex-col overflow-auto bg-white px-3 py-3">
        {dealsQuery.isLoading && viewMode === 'board' ? (
          <DealBoardSkeleton compact={compactCards} />
        ) : dealsQuery.isLoading ? (
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
            description="손님이 집을 정하면 희망매물에서 '거래 전환'을 누르거나, 새 거래로 바로 만드세요. 계약금·잔금 일정과 수수료는 거래 안에서 관리합니다."
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
                selectedDealId={openDealId}
                referenceDate={referenceDate}
                compact={compactCards}
                actions={rowActions}
                onStageDrop={moveStage}
                onCreate={() => setCreateOpen(true)}
              />
            ) : (
              <DealListView
                key={activeDeals[0]?.officeId}
                onStageDrop={moveStage}
                deals={activeDeals}
                selectedDealId={openDealId}
                referenceDate={referenceDate}
                actions={rowActions}
              />
            )}

            {activeDeals.length === 0 && hasFilters ? (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                조건에 맞는 진행 거래가 없습니다.
              </div>
            ) : null}

          </div>
        )}
      </section>

      </>}
      {selectedDeal ? (
        <DealInspector
          deal={selectedDeal}
          contract={selectedDeal.contract ?? null}
          closing={isInspectorClosing}
          animate={inspectorMotion}
          referenceDate={referenceDate}
          onClose={closeDealInspector}
          onExited={finishClosingDealInspector}
          actions={rowActions}
        />
      ) : null}

      <DealCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        // 종료 목록에서 만들었으면 새 거래가 보이는 진행 목록으로 옮긴다
        onCreated={(deal) => {
          setScope('active');
          openDealInspector(deal.id);
        }}
      />

      {dealDialogs}
    </div>
  );
}

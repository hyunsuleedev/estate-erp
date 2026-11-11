import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  GitBranch,
  ListOrdered,
  Plus,
  RefreshCw,
  RotateCcw,
  UserSearch,
} from 'lucide-react';
import { toast } from 'sonner';
import type { BuyerRequirement, Match } from '@estate-erp/api-client';
import { MatchStage, normalizeMatchStage } from '@estate-erp/shared';
import {
  buildViewingCalendarEventPayload,
  getMatchSearchText,
  getMatchStageBlockReason,
  getMatchStageGroups,
  getMatchStageLabel,
  getMatchTitle,
  getUpcomingViewingEvent,
  groupMatchesByRequirement,
  shouldMoveToViewingOnSchedule,
  toCalendarEventUpdatePayload,
  type MatchRowActions,
} from './-match-view-utils';
import {
  BUYER_TABLE_MIN_WIDTH_CLASS,
  BuyerMatchGroup,
  BuyerMatchTableHeader,
  StageMatchView,
} from './-match-groups';
import { MatchDetailDialog } from './-match-detail-dialog';
import { MatchCreateDialog } from './-match-create-dialog';
import { MatchConvertDialog } from './-match-convert-dialog';
import { WantedFilterBar } from './-wanted-filter-bar';
import {
  EMPTY_REQUIREMENT_FILTERS,
  hasRequirementFilters,
  matchesRequirementFilters,
  NO_MATCH_STAGE,
  scopeRequirementFilters,
  type RequirementFilters,
} from './-wanted-filters';
import {
  ToolbarPillSearch,
  ToolbarPillTabs,
  ToolbarPillToggle,
} from '../properties/-components/property-toolbar';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getStatusMeta } from '@/lib/status-config';
import { ConfirmDialog, EmptyState } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';

type MatchViewMode = 'buyer' | 'stage';

/** 해당 상태의 희망 조건 전체. 서버가 페이지당 100건으로 끊으므로 끝까지 이어 받는다. */
async function fetchBuyerRequirements(
  status: string,
): Promise<BuyerRequirement[]> {
  const items: BuyerRequirement[] = [];
  for (let page = 1; ; page += 1) {
    const result = await api.buyerRequirements.findAll({
      status,
      limit: 100,
      page,
    });
    items.push(...result.items);
    if (page >= result.pagination.totalPages) return items;
  }
}

const TRANSACTION_TYPE_TABS = [
  { value: '', label: '전체' },
  ...['sale', 'jeonse', 'monthly'].map((value) => ({
    value,
    label: getStatusMeta('transactionType', value).label,
  })),
];

const NO_MATCH_STAGE_OPTIONS = [{ value: NO_MATCH_STAGE, label: '매칭 없음' }];

export const Route = createFileRoute('/_authenticated/wanted-properties/')({
  validateSearch: (search: Record<string, unknown>): { matchId?: string } => ({
    matchId: typeof search.matchId === 'string' ? search.matchId : undefined,
  }),
  component: WantedPropertiesPage,
});

function WantedPropertiesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { matchId: deepLinkMatchId } = Route.useSearch();

  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilters, setStageFilters] = useState<string[]>([]);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('');
  const [requirementFilters, setRequirementFilters] =
    useState<RequirementFilters>(EMPTY_REQUIREMENT_FILTERS);
  const [viewMode, setViewMode] = useState<MatchViewMode>('buyer');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [convertMatchId, setConvertMatchId] = useState<string | null>(null);
  const [deleteMatchId, setDeleteMatchId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  /** 고객 행에서 열면 그 조건으로 고정한다. 툴바에서 열면 null. */
  const [createRequirementId, setCreateRequirementId] = useState<string | null>(
    null,
  );
  const deferredSearch = useDeferredValue(searchQuery);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // 키보드 단축키: Cmd/Ctrl+F 검색 포커스, 1~2 뷰 전환 (입력 중/다이얼로그 안에서는 무시)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'f') {
        event.preventDefault();
        searchWrapRef.current?.querySelector('input')?.focus();
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest('[role="dialog"]'))
      ) {
        return;
      }

      const viewByKey: Record<string, MatchViewMode> = {
        '1': 'buyer',
        '2': 'stage',
      };
      const nextView = viewByKey[event.key];
      if (nextView) {
        setViewMode(nextView);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const {
    data: matches = [],
    isLoading: isMatchesLoading,
    isError: isMatchesError,
    refetch: refetchMatches,
  } = useQuery({
    queryKey: ['matches'],
    queryFn: () => api.matches.findAll(),
  });
  const {
    data: requirements = [],
    isLoading: isRequirementsLoading,
    isError: isRequirementsError,
    refetch: refetchRequirements,
  } = useQuery({
    queryKey: ['buyer-requirements', 'wanted-properties', 'open'],
    queryFn: () => fetchBuyerRequirements('active,hold'),
  });
  // 단계별 보기는 완료된 조건의 매칭도 보여준다. 매칭 응답에는 희망 단지가 없어
  // 필터 판정에 쓸 수 없으므로 조건을 따로 받는다. 고객별 보기에서는 필요 없다.
  const {
    data: completedRequirements = [],
    isLoading: isCompletedLoading,
    isError: isCompletedError,
    refetch: refetchCompleted,
  } = useQuery({
    queryKey: ['buyer-requirements', 'wanted-properties', 'completed'],
    queryFn: () => fetchBuyerRequirements('completed'),
    enabled: viewMode === 'stage',
  });

  // 매칭과 조건이 모두 있어야 한다. 하나만 실패한 채 그리면 매칭이 있는 조건을
  // '매칭 없음'으로 보여주거나, 조건 필터로 매칭을 잘못 걸러내게 된다.
  const isLoading =
    isMatchesLoading ||
    isRequirementsLoading ||
    (viewMode === 'stage' && isCompletedLoading);
  const isError =
    isMatchesError ||
    isRequirementsError ||
    (viewMode === 'stage' && isCompletedError);
  const refetch = () => {
    void refetchMatches();
    void refetchRequirements();
    if (viewMode === 'stage') void refetchCompleted();
  };

  const openMatchCreate = (requirementId: string | null = null) => {
    setCreateRequirementId(requirementId);
    setCreateOpen(true);
  };

  // 딥링크 진입 (?matchId=...) → 상세 자동 오픈 후 URL 정리
  useEffect(() => {
    if (deepLinkMatchId) {
      setSelectedMatchId(deepLinkMatchId);
      navigate({ search: {}, replace: true });
    }
  }, [deepLinkMatchId, navigate]);

  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) =>
      api.matches.updateStage(id, { stage }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast.success(
        variables.stage === MatchStage.CLOSED
          ? '매칭을 종료했습니다'
          : `${getMatchStageLabel(variables.stage)} 단계로 변경했습니다`,
      );
    },
    onError: (error: Error) => {
      toast.error(`단계 변경에 실패했습니다: ${error.message}`);
    },
  });

  const memoMutation = useMutation({
    mutationFn: ({ match, memo }: { match: Match; memo: string | null }) =>
      api.matches.updateMemo(match.id, {
        memo,
        expectedUpdatedAt: match.updatedAt,
      }),
    onSuccess: (updatedMatch) => {
      queryClient.setQueryData<Match[]>(['matches'], (current) =>
        current?.map((match) =>
          match.id === updatedMatch.id ? updatedMatch : match,
        ),
      );
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast.success('메모를 저장했습니다');
    },
    onError: (error: Error) => {
      toast.error(`메모 저장에 실패했습니다: ${error.message}`);
    },
  });

  const viewingScheduleMutation = useMutation({
    mutationFn: async ({
      match,
      startLocalValue,
    }: {
      match: Match;
      startLocalValue: string;
    }) => {
      const blockReason = getMatchStageBlockReason(match, MatchStage.VIEWING);
      if (blockReason) {
        throw new Error(blockReason);
      }

      const payload = buildViewingCalendarEventPayload(match, startLocalValue);
      const upcomingViewingEvent = getUpcomingViewingEvent(match);

      if (upcomingViewingEvent) {
        await api.calendarEvents.update(
          upcomingViewingEvent.id,
          toCalendarEventUpdatePayload(payload),
        );
      } else {
        await api.calendarEvents.create(payload);
      }

      if (shouldMoveToViewingOnSchedule(match.stage)) {
        await api.matches.updateStage(match.id, { stage: MatchStage.VIEWING });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success('방문 일정을 저장했습니다');
    },
    onError: (error: Error) => {
      toast.error(`방문 일정 저장에 실패했습니다: ${error.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.matches.remove(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      setDeleteMatchId(null);
      if (selectedMatchId === id) {
        setSelectedMatchId(null);
      }
      toast.success('매칭을 삭제했습니다');
    },
    onError: (error: Error) => {
      toast.error(`매칭 삭제에 실패했습니다: ${error.message}`);
    },
  });

  // dealCreated 진입은 항상 거래 생성 확인 다이얼로그를 거친다
  const handleStageChange = (id: string, stage: string) => {
    const match = matches.find((candidate) => candidate.id === id);
    if (match) {
      const blockReason = getMatchStageBlockReason(match, stage);
      if (blockReason) {
        toast.error('단계 이동 전 확인이 필요합니다', {
          description: blockReason,
        });
        return;
      }
    }

    if (stage === MatchStage.DEAL_CREATED) {
      setConvertMatchId(id);
      return;
    }
    stageMutation.mutate({ id, stage });
  };

  const actions: MatchRowActions = {
    isUpdating: stageMutation.isPending,
    isScheduling: viewingScheduleMutation.isPending,
    savingMemoId: memoMutation.isPending
      ? (memoMutation.variables?.match.id ?? null)
      : null,
    onStageChange: handleStageChange,
    onSaveMemo: async (match, memo) => {
      await memoMutation.mutateAsync({ match, memo });
    },
    onRequestDelete: setDeleteMatchId,
    onOpenDetail: setSelectedMatchId,
    onScheduleViewing: (match, startLocalValue) =>
      viewingScheduleMutation.mutate({ match, startLocalValue }),
  };

  const selectedMatch = useMemo(
    () => matches.find((match) => match.id === selectedMatchId) ?? null,
    [matches, selectedMatchId],
  );
  const convertMatch = useMemo(
    () => matches.find((match) => match.id === convertMatchId) ?? null,
    [matches, convertMatchId],
  );
  const deleteMatch = useMemo(
    () => matches.find((match) => match.id === deleteMatchId) ?? null,
    [matches, deleteMatchId],
  );

  // '매칭 없음'은 매칭이 없는 조건을 뜻하므로 매칭만 보여주는 단계별 보기에는 해당하지 않는다.
  const activeStageFilters = useMemo(
    () =>
      viewMode === 'stage'
        ? stageFilters.filter((stage) => stage !== NO_MATCH_STAGE)
        : stageFilters,
    [stageFilters, viewMode],
  );

  const filterableRequirements = useMemo(
    () =>
      viewMode === 'stage'
        ? [...requirements, ...completedRequirements]
        : requirements,
    [completedRequirements, requirements, viewMode],
  );
  const requirementById = useMemo(
    () => new Map(filterableRequirements.map((item) => [item.id, item])),
    [filterableRequirements],
  );
  const activeRequirementFilters = useMemo(
    () => scopeRequirementFilters(requirementFilters, filterableRequirements),
    [filterableRequirements, requirementFilters],
  );

  const filteredMatches = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();
    const filtersActive = hasRequirementFilters(activeRequirementFilters);

    return matches.filter((match) => {
      if (
        activeStageFilters.length > 0 &&
        !activeStageFilters.includes(normalizeMatchStage(match.stage))
      ) {
        return false;
      }

      if (filtersActive) {
        const requirement = requirementById.get(match.buyerReqId);
        if (
          !requirement ||
          !matchesRequirementFilters(requirement, activeRequirementFilters)
        ) {
          return false;
        }
      }

      if (
        transactionTypeFilter &&
        match.listing?.transactionType !== transactionTypeFilter
      ) {
        return false;
      }

      return !query || getMatchSearchText(match).includes(query);
    });
  }, [
    activeRequirementFilters,
    activeStageFilters,
    deferredSearch,
    matches,
    requirementById,
    transactionTypeFilter,
  ]);

  const groupedBuyerMatches = useMemo(
    () =>
      groupMatchesByRequirement({
        requirements,
        matches,
        search: deferredSearch,
        stageFilters: activeStageFilters,
        transactionType: transactionTypeFilter,
        requirementFilters: activeRequirementFilters,
      }),
    [
      activeRequirementFilters,
      activeStageFilters,
      deferredSearch,
      matches,
      requirements,
      transactionTypeFilter,
    ],
  );
  const groupedMatchCount = groupedBuyerMatches.reduce(
    (count, group) => count + group.matches.length,
    0,
  );

  const stageGroupedMatches = useMemo(
    () => getMatchStageGroups(filteredMatches),
    [filteredMatches],
  );

  const visibleItemIds = useMemo(
    () =>
      viewMode === 'buyer'
        ? groupedBuyerMatches.map((group) => group.buyerReqId)
        : filteredMatches.map((match) => match.id),
    [filteredMatches, groupedBuyerMatches, viewMode],
  );

  // 선택은 현재 뷰와 필터 결과에만 유지한다. 숨겨진 항목이 선택된 채 남아
  // 이후 벌크 액션 범위를 오해하게 만드는 것을 방지한다.
  useEffect(() => {
    const visibleIds = new Set(visibleItemIds);
    setSelectedItemIds((current) => {
      const next = new Set(
        Array.from(current).filter((id) => visibleIds.has(id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [visibleItemIds]);

  const selectedVisibleItemCount = visibleItemIds.reduce(
    (count, id) => count + (selectedItemIds.has(id) ? 1 : 0),
    0,
  );
  const allVisibleItemsSelected =
    visibleItemIds.length > 0 &&
    selectedVisibleItemCount === visibleItemIds.length;
  const visibleSelectionState: boolean | 'indeterminate' =
    allVisibleItemsSelected
      ? true
      : selectedVisibleItemCount > 0
        ? 'indeterminate'
        : false;

  const updateItemSelection = (itemIds: string[], selected: boolean) => {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      for (const itemId of itemIds) {
        if (selected) {
          next.add(itemId);
        } else {
          next.delete(itemId);
        }
      }
      return next;
    });
  };

  // 고객별 목록은 매물관리처럼 여백 없는 표로 그린다. 로딩·오류·빈 화면은 기존 여백을 쓴다.
  const showBuyerTable =
    viewMode === 'buyer' &&
    !isLoading &&
    !isError &&
    groupedBuyerMatches.length > 0;

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    activeStageFilters.length > 0 ||
    transactionTypeFilter.length > 0 ||
    hasRequirementFilters(activeRequirementFilters);

  const resetFilters = () => {
    setSearchQuery('');
    setStageFilters([]);
    setTransactionTypeFilter('');
    setRequirementFilters(EMPTY_REQUIREMENT_FILTERS);
  };

  const handleTransactionTypeChange = (value: string) => {
    setTransactionTypeFilter(value);
    // 월세 칩은 월세 탭에만 있으므로, 탭을 떠나면 보이지 않는 조건이 남지 않게 지운다
    if (value !== 'monthly') {
      setRequirementFilters((current) => ({ ...current, monthlyRent: null }));
    }
  };

  return (
    <div
      data-matches-page
      className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col bg-background"
    >
      {/* 매물관리 1행 툴바와 같은 구성: 거래유형 탭 · 검색 · 보기 전환 · 등록 */}
      <section
        aria-label="매칭 보기 및 필터"
        className="shrink-0 border-b border-border bg-white px-3 py-2.5"
      >
        <div className="flex min-w-0 items-center gap-2">
          <ToolbarPillTabs
            ariaLabel="거래유형"
            value={transactionTypeFilter}
            options={TRANSACTION_TYPE_TABS}
            onChange={handleTransactionTypeChange}
          />

          <div ref={searchWrapRef} className="flex min-w-[200px] max-w-[520px] flex-1">
            <ToolbarPillSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="고객, 연락처, 매물, 주소 검색"
              ariaLabel="희망매물 검색"
            />
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <ToolbarPillToggle
              ariaLabel="희망매물 보기 방식"
              value={viewMode}
              onChange={setViewMode}
              options={[
                { value: 'buyer', label: '고객별', icon: <GitBranch /> },
                { value: 'stage', label: '단계별', icon: <ListOrdered /> },
              ]}
            />
            <Button
              type="button"
              size="sm"
              className="h-[30px] shrink-0 rounded-full px-3.5"
              onClick={() => openMatchCreate()}
            >
              <Plus className="size-3.5" />
              매칭 생성
            </Button>
          </div>
        </div>
      </section>

      <WantedFilterBar
        filters={activeRequirementFilters}
        onFiltersChange={setRequirementFilters}
        requirements={filterableRequirements}
        stageOptionsPrefix={viewMode === 'buyer' ? NO_MATCH_STAGE_OPTIONS : []}
        stageFilters={activeStageFilters}
        onStageFiltersChange={setStageFilters}
        transactionType={transactionTypeFilter}
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
      />

      <main
        className={cn(
          'min-h-0 min-w-0 flex-1 overflow-auto',
          showBuyerTable ? 'bg-white' : 'bg-muted/20 p-3',
        )}
      >
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border/80 bg-background px-4 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              희망매물 목록을 불러오지 못했습니다.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => refetch()}
            >
              <RefreshCw className="size-4" />
              재시도
            </Button>
          </div>
        ) : viewMode === 'buyer' && requirements.length === 0 ? (
          <EmptyState
            icon={UserSearch}
            title="진행 중인 희망 조건이 없습니다"
            description="고객의 구함 의뢰를 등록하면 여기에서 조건에 맞는 매물을 연결할 수 있습니다."
            action={
              <Button
                type="button"
                onClick={() => void navigate({ to: '/buyer-requirements/new' })}
              >
                <Plus className="size-4" />
                구함 의뢰 추가
              </Button>
            }
          />
        ) : viewMode === 'stage' && matches.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title="등록된 매칭이 없습니다"
            description="구매고객 조건에 맞는 매물을 연결해 매칭 파이프라인을 시작하세요."
            action={
              <Button type="button" onClick={() => openMatchCreate()}>
                <Plus className="size-4" />
                매칭 생성
              </Button>
            }
          />
        ) : (viewMode === 'buyer'
            ? groupedBuyerMatches.length
            : filteredMatches.length) === 0 ? (
          <ViewEmpty
            message="현재 검색과 필터에 맞는 항목이 없습니다."
            onReset={resetFilters}
          />
        ) : showBuyerTable ? (
          <div data-buyer-match-table className={BUYER_TABLE_MIN_WIDTH_CLASS}>
            <BuyerMatchTableHeader
              checked={visibleSelectionState}
              onToggleAll={(selected) =>
                updateItemSelection(visibleItemIds, selected)
              }
            />
            {groupedBuyerMatches.map((group) => (
              <BuyerMatchGroup
                key={group.buyerReqId}
                buyerRequirement={group.buyerRequirement}
                matches={group.matches}
                actions={actions}
                selected={selectedItemIds.has(group.buyerReqId)}
                onSelectedChange={(selected) =>
                  updateItemSelection([group.buyerReqId], selected)
                }
                onCreateMatch={() => openMatchCreate(group.buyerReqId)}
              />
            ))}
          </div>
        ) : (
          <div className="min-h-0">
            <MatchListStickyHeader
              checked={visibleSelectionState}
              selectedCount={selectedVisibleItemCount}
              summary={`매칭 ${filteredMatches.length.toLocaleString()}건`}
              onToggleAll={(selected) =>
                updateItemSelection(visibleItemIds, selected)
              }
              onClear={() => setSelectedItemIds(new Set())}
            />

            <StageMatchView
              groups={stageGroupedMatches}
              actions={actions}
              selectedItemIds={selectedItemIds}
              onSelectionChange={updateItemSelection}
            />
          </div>
        )}
      </main>

      {/* 매물관리 표의 하단 줄과 같다: 선택 작업 줄 + 건수 상태줄 */}
      {showBuyerTable && selectedVisibleItemCount > 0 && (
        <div className="flex min-h-9 shrink-0 items-center gap-2 border-t border-border bg-white px-3 py-1.5 text-xs">
          <span className="font-medium text-foreground">
            희망 조건 {selectedVisibleItemCount.toLocaleString()}건 선택
          </span>
          <button
            type="button"
            className="ml-auto text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setSelectedItemIds(new Set())}
          >
            선택 해제
          </button>
        </div>
      )}
      {showBuyerTable && (
        <div
          data-buyer-table-status
          className="flex min-h-7 shrink-0 items-center gap-2 border-t border-border bg-[#faf9f6] px-3 text-[11px] text-muted-foreground tabular-nums"
        >
          희망 조건 {groupedBuyerMatches.length.toLocaleString()}건 · 매칭{' '}
          {groupedMatchCount.toLocaleString()}건
        </div>
      )}

      <MatchDetailDialog
        match={selectedMatch}
        open={selectedMatchId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedMatchId(null);
          }
        }}
        actions={actions}
      />

      <MatchCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        matches={matches}
        scope={
          createRequirementId
            ? { kind: 'demand', requirementId: createRequirementId }
            : undefined
        }
      />

      <MatchConvertDialog
        match={convertMatch}
        open={convertMatchId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setConvertMatchId(null);
          }
        }}
      />

      <ConfirmDialog
        open={deleteMatchId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteMatchId(null);
          }
        }}
        title="매칭을 삭제하시겠습니까?"
        description={
          deleteMatch
            ? `${deleteMatch.buyerRequirement?.contact?.name ?? '미지정'} · ${getMatchTitle(deleteMatch)} 매칭이 삭제됩니다. 진행 이력이 함께 사라지므로 종료 처리를 권장합니다.`
            : undefined
        }
        confirmLabel="삭제"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteMatchId) {
            deleteMutation.mutate(deleteMatchId);
          }
        }}
      />
    </div>
  );
}

function MatchListStickyHeader({
  checked,
  selectedCount,
  summary,
  onToggleAll,
  onClear,
}: {
  checked: boolean | 'indeterminate';
  selectedCount: number;
  summary: string;
  onToggleAll: (selected: boolean) => void;
  onClear: () => void;
}) {
  return (
    <div
      data-match-list-sticky-header
      className="sticky -top-3 z-20 -mx-3 -mt-3 mb-3 flex h-10 items-center gap-2 border-b border-border/70 bg-background/95 px-3 backdrop-blur-sm"
    >
      <Checkbox
        id="matches-select-all"
        checked={checked}
        onCheckedChange={(value) => onToggleAll(value === true)}
        aria-label="현재 매칭 목록 전체 선택"
      />
      <label
        htmlFor="matches-select-all"
        className="cursor-pointer text-xs font-medium"
      >
        {selectedCount > 0
          ? `${selectedCount.toLocaleString()}개 선택됨`
          : '전체 선택'}
      </label>
      <span className="ml-auto text-xs text-muted-foreground tabular-nums">
        {summary}
      </span>
      {selectedCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={onClear}
        >
          선택 해제
        </Button>
      )}
    </div>
  );
}

function ViewEmpty({
  message,
  onReset,
}: {
  message: string;
  onReset?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border/80 bg-background px-4 py-10 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {onReset && (
        <Button type="button" variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="size-3.5" />
          검색·필터 초기화
        </Button>
      )}
    </div>
  );
}

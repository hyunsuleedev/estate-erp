import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  GitBranch,
  ListOrdered,
  Plus,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { toast } from 'sonner';
import type { Match } from '@estate-erp/api-client';
import { MatchStage, normalizeMatchStage } from '@estate-erp/shared';
import {
  buildViewingCalendarEventPayload,
  getMatchKpis,
  getMatchStageBlockReason,
  getMatchStageGroups,
  getMatchStageLabel,
  getMatchTitle,
  getUpcomingViewingEvent,
  matchStageOrder,
  shouldMoveToViewingOnSchedule,
  toCalendarEventUpdatePayload,
  type MatchRowActions,
} from './-match-view-utils';
import { BuyerMatchGroup, StageMatchView } from './-match-groups';
import { MatchDetailDialog } from './-match-detail-dialog';
import { MatchCreateDialog } from './-match-create-dialog';
import { MatchConvertDialog } from './-match-convert-dialog';
import { api } from '@/lib/api';
import { getStatusMeta } from '@/lib/status-config';
import {
  ConfirmDialog,
  EmptyState,
  FilterSearch,
  FilterSelect,
} from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MultiSelect } from '@/components/ui/multi-select';
import { Skeleton } from '@/components/ui/skeleton';

type MatchViewMode = 'buyer' | 'stage';

interface BuyerMatchGroupData {
  buyerReqId: string;
  buyerRequirement: NonNullable<Match['buyerRequirement']>;
  matches: Match[];
}

const TRANSACTION_TYPE_OPTIONS = ['sale', 'jeonse', 'monthly'].map((value) => ({
  value,
  label: getStatusMeta('transactionType', value).label,
}));

export const Route = createFileRoute('/_authenticated/matches/')({
  validateSearch: (search: Record<string, unknown>): { matchId?: string } => ({
    matchId: typeof search.matchId === 'string' ? search.matchId : undefined,
  }),
  component: MatchesPage,
});

function MatchesPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { matchId: deepLinkMatchId } = Route.useSearch();

  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilters, setStageFilters] = useState<string[]>([]);
  const [transactionTypeFilter, setTransactionTypeFilter] = useState('');
  const [viewMode, setViewMode] = useState<MatchViewMode>('buyer');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [convertMatchId, setConvertMatchId] = useState<string | null>(null);
  const [deleteMatchId, setDeleteMatchId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
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
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['matches'],
    queryFn: () => api.matches.findAll(),
  });

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

  const filteredMatches = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return matches.filter((match) => {
      if (
        stageFilters.length > 0 &&
        !stageFilters.includes(normalizeMatchStage(match.stage))
      ) {
        return false;
      }

      if (
        transactionTypeFilter &&
        match.listing?.transactionType !== transactionTypeFilter
      ) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        getMatchTitle(match),
        match.listing?.property?.site?.roadAddress,
        match.listing?.property?.site?.jibunAddress,
        match.buyerRequirement?.contact?.name,
        match.buyerRequirement?.contact?.phone,
        match.memo,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [deferredSearch, matches, stageFilters, transactionTypeFilter]);

  const kpis = useMemo(() => getMatchKpis(matches), [matches]);

  const groupedBuyerMatches = useMemo<BuyerMatchGroupData[]>(() => {
    const grouped = new Map<string, BuyerMatchGroupData>();

    for (const match of filteredMatches) {
      const buyerRequirement = match.buyerRequirement;
      if (!buyerRequirement) {
        continue;
      }

      const existing = grouped.get(match.buyerReqId);
      if (existing) {
        existing.matches.push(match);
        continue;
      }

      grouped.set(match.buyerReqId, {
        buyerReqId: match.buyerReqId,
        buyerRequirement,
        matches: [match],
      });
    }

    return Array.from(grouped.values()).sort((left, right) =>
      (left.buyerRequirement.contact?.name ?? '').localeCompare(
        right.buyerRequirement.contact?.name ?? '',
        'ko',
      ),
    );
  }, [filteredMatches]);

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

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    stageFilters.length > 0 ||
    transactionTypeFilter.length > 0;

  const resetFilters = () => {
    setSearchQuery('');
    setStageFilters([]);
    setTransactionTypeFilter('');
  };

  return (
    <div
      data-matches-page
      className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col bg-background"
    >
      <section
        aria-label="매칭 요약"
        className="flex shrink-0 flex-wrap items-center gap-y-2 border-b border-border bg-background px-4 py-2.5"
      >
        <MatchSummaryItem label="진행" value={kpis.active} />
        <MatchSummaryItem label="임장" value={kpis.viewing} />
        <MatchSummaryItem label="거래 전환" value={kpis.converted} />
        <MatchSummaryItem label="종료" value={kpis.closed} />
        <p className="ml-auto text-xs text-muted-foreground tabular-nums">
          고객 {groupedBuyerMatches.length.toLocaleString()}명 · 전체{' '}
          {matches.length.toLocaleString()}건
        </p>
      </section>

      <section
        aria-label="매칭 보기 및 필터"
        className="shrink-0 border-b border-border bg-background"
      >
        <div className="flex flex-wrap items-center gap-2 bg-muted/30 px-3 py-2">
          <div ref={searchWrapRef}>
            <FilterSearch
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="고객, 연락처, 매물, 주소 검색"
              className="w-72 max-w-full"
            />
          </div>

          <MultiSelect
            options={matchStageOrder.map((stage) => ({
              value: stage,
              label: getMatchStageLabel(stage),
            }))}
            selected={stageFilters}
            onChange={setStageFilters}
            ariaLabel="매칭 단계 필터"
            placeholder="단계"
            className="h-8 max-w-80 shadow-none"
            maxCount={3}
          />

          <FilterSelect
            label="거래유형"
            value={transactionTypeFilter}
            onChange={setTransactionTypeFilter}
            options={TRANSACTION_TYPE_OPTIONS}
            className="h-8 shadow-none"
          />

          {hasActiveFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground"
              onClick={resetFilters}
            >
              <RotateCcw className="size-3.5" />
              초기화
            </Button>
          )}

          <p className="ml-auto text-xs text-muted-foreground tabular-nums">
            {filteredMatches.length.toLocaleString()}건
          </p>

          <div className="flex items-center gap-1 rounded-md border bg-background p-1">
            <Button
              variant={viewMode === 'buyer' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('buyer')}
              className="gap-1.5 text-xs"
              title="단축키 1"
            >
              <GitBranch className="size-3.5" />
              고객별
            </Button>
            <Button
              variant={viewMode === 'stage' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('stage')}
              className="gap-1.5 text-xs"
              title="단축키 2"
            >
              <ListOrdered className="size-3.5" />
              단계별
            </Button>
          </div>

          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={() => setCreateOpen(true)}
          >
            <Plus className="size-4" />
            매칭 생성
          </Button>
        </div>
      </section>

      <main className="min-h-0 min-w-0 flex-1 overflow-auto bg-muted/20 p-3">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border/80 bg-background px-4 py-14 text-center">
            <p className="text-sm text-muted-foreground">
              매칭 목록을 불러오지 못했습니다.
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
        ) : matches.length === 0 ? (
          <EmptyState
            icon={GitBranch}
            title="등록된 매칭이 없습니다"
            description="구매고객 조건에 맞는 매물을 연결해 매칭 파이프라인을 시작하세요."
            action={
              <Button type="button" onClick={() => setCreateOpen(true)}>
                <Plus className="size-4" />
                매칭 생성
              </Button>
            }
          />
        ) : filteredMatches.length === 0 ? (
          <ViewEmpty
            message="현재 검색과 필터에 맞는 매칭이 없습니다."
            onReset={resetFilters}
          />
        ) : (
          <div className="min-h-0">
            <MatchListStickyHeader
              checked={visibleSelectionState}
              selectedCount={selectedVisibleItemCount}
              summary={
                viewMode === 'buyer'
                  ? `고객 ${groupedBuyerMatches.length.toLocaleString()}명 · 매칭 ${filteredMatches.length.toLocaleString()}건`
                  : `매칭 ${filteredMatches.length.toLocaleString()}건`
              }
              onToggleAll={(selected) =>
                updateItemSelection(visibleItemIds, selected)
              }
              onClear={() => setSelectedItemIds(new Set())}
            />

            {viewMode === 'buyer' && (
              <div className="space-y-2">
                {groupedBuyerMatches.length === 0 ? (
                  <ViewEmpty message="고객별로 묶어 보여줄 매칭이 없습니다." />
                ) : (
                  groupedBuyerMatches.map((group) => (
                    <BuyerMatchGroup
                      key={group.buyerReqId}
                      buyerRequirement={group.buyerRequirement}
                      matches={group.matches}
                      actions={actions}
                      selected={selectedItemIds.has(group.buyerReqId)}
                      onSelectedChange={(selected) =>
                        updateItemSelection([group.buyerReqId], selected)
                      }
                    />
                  ))
                )}
              </div>
            )}

            {viewMode === 'stage' && (
              <StageMatchView
                groups={stageGroupedMatches}
                actions={actions}
                selectedItemIds={selectedItemIds}
                onSelectionChange={updateItemSelection}
              />
            )}
          </div>
        )}
      </main>

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

function MatchSummaryItem({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline gap-2 border-r border-border/70 px-4 first:pl-0 last:border-r-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <strong className="text-sm font-semibold tabular-nums">
        {value.toLocaleString()}
      </strong>
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

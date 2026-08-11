import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, GitBranch, List, ListOrdered, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { Match } from '@estate-erp/api-client';
import { MatchStage, normalizeMatchStage } from '@estate-erp/shared';
import {
  buildViewingCalendarEventPayload,
  formatMatchPrice,
  formatRequirementSummary,
  getMatchKpis,
  getMatchListingGroups,
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
import { MatchActionsMenu } from './-match-board';
import { BuyerMatchGroup, PropertyMatchGroup, StageMatchView } from './-match-groups';
import { MatchDetailDialog } from './-match-detail-dialog';
import { MatchCreateDialog } from './-match-create-dialog';
import { MatchConvertDialog } from './-match-convert-dialog';
import { api } from '@/lib/api';
import { getStatusMeta } from '@/lib/status-config';
import { formatDate } from '@/lib/format';
import {
  ConfirmDialog,
  EmptyState,
  FilterBar,
  FilterCount,
  FilterSearch,
  FilterSelect,
  PageHeader,
  StatusBadge,
} from '@/components/domain';
import { Button } from '@/components/ui/button';
import { MultiSelect } from '@/components/ui/multi-select';
import { Skeleton } from '@/components/ui/skeleton';

type MatchViewMode = 'buyer' | 'property' | 'stage' | 'list';

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
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const [convertMatchId, setConvertMatchId] = useState<string | null>(null);
  const [deleteMatchId, setDeleteMatchId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const deferredSearch = useDeferredValue(searchQuery);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // 키보드 단축키: Cmd/Ctrl+F 검색 포커스, 1~4 뷰 전환 (입력 중/다이얼로그 안에서는 무시)
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
        '2': 'property',
        '3': 'stage',
        '4': 'list',
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

  const viewingScheduleMutation = useMutation({
    mutationFn: async ({ match, startLocalValue }: { match: Match; startLocalValue: string }) => {
      const blockReason = getMatchStageBlockReason(
        match,
        MatchStage.VIEWING,
      );
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
    onStageChange: handleStageChange,
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

  const groupedPropertyMatches = useMemo(
    () => getMatchListingGroups(filteredMatches),
    [filteredMatches],
  );
  const stageGroupedMatches = useMemo(
    () => getMatchStageGroups(filteredMatches),
    [filteredMatches],
  );

  return (
    <div className="flex min-h-0 flex-col gap-4 pt-4">
      <PageHeader
        title="매칭"
        description="내부 후보 → 고객 관심 → 임장 가능 확인 → 임장 → 협상 → 거래 전환을 추적합니다."
        actions={
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" />
            매칭 생성
          </Button>
        }
      />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="진행 매칭" value={kpis.active} />
        <KpiTile label="방문 단계" value={kpis.viewing} />
        <KpiTile label="거래 전환" value={kpis.converted} />
        <KpiTile label="종료" value={kpis.closed} />
      </div>

      <FilterBar>
        <div ref={searchWrapRef} className="contents">
          <FilterSearch
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="고객명, 연락처, 매물명, 주소 검색"
          />
        </div>

        <MultiSelect
          options={matchStageOrder.map((stage) => ({
            value: stage,
            label: getMatchStageLabel(stage),
          }))}
          selected={stageFilters}
          onChange={setStageFilters}
          placeholder="단계 필터"
          maxCount={4}
        />

        <FilterSelect
          label="거래유형"
          value={transactionTypeFilter}
          onChange={setTransactionTypeFilter}
          options={TRANSACTION_TYPE_OPTIONS}
        />

        <FilterCount n={filteredMatches.length} />

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
            variant={viewMode === 'property' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('property')}
            className="gap-1.5 text-xs"
            title="단축키 2"
          >
            <Building2 className="size-3.5" />
            매물별
          </Button>
          <Button
            variant={viewMode === 'stage' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('stage')}
            className="gap-1.5 text-xs"
            title="단축키 3"
          >
            <ListOrdered className="size-3.5" />
            단계별
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="gap-1.5 text-xs"
            title="단축키 4"
          >
            <List className="size-3.5" />
            전체
          </Button>
        </div>
      </FilterBar>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border/80 px-4 py-14 text-center">
          <p className="text-sm text-muted-foreground">매칭 목록을 불러오지 못했습니다.</p>
          <Button type="button" variant="outline" size="sm" onClick={() => refetch()}>
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
      ) : (
        <div className="min-h-0">
          {viewMode === 'buyer' && (
            <div className="space-y-4">
              {groupedBuyerMatches.length === 0 ? (
                <ViewEmpty message="고객별로 묶어 보여줄 매칭이 없습니다." />
              ) : (
                groupedBuyerMatches.map((group) => (
                  <BuyerMatchGroup
                    key={group.buyerReqId}
                    buyerRequirement={group.buyerRequirement}
                    matches={group.matches}
                    actions={actions}
                  />
                ))
              )}
            </div>
          )}

          {viewMode === 'property' && (
            <div className="space-y-4">
              {groupedPropertyMatches.length === 0 ? (
                <ViewEmpty message="매물별로 묶어 보여줄 매칭이 없습니다." />
              ) : (
                groupedPropertyMatches.map((group) => (
                  <PropertyMatchGroup key={group.listingId} group={group} actions={actions} />
                ))
              )}
            </div>
          )}

          {viewMode === 'stage' && <StageMatchView groups={stageGroupedMatches} actions={actions} />}

          {viewMode === 'list' && <MatchListTable matches={filteredMatches} actions={actions} />}
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

      <MatchCreateDialog open={createOpen} onOpenChange={setCreateOpen} matches={matches} />

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

function KpiTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border/60 bg-background px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function ViewEmpty({ message }: { message: string }) {
  return (
    <div className="rounded-md border border-dashed border-border/80 px-4 py-10 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function MatchListTable({
  matches,
  actions,
}: {
  matches: Match[];
  actions: MatchRowActions;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">단계</th>
              <th className="px-4 py-3 font-medium">고객</th>
              <th className="px-4 py-3 font-medium">매물</th>
              <th className="px-4 py-3 font-medium">조건</th>
              <th className="px-4 py-3 font-medium">메모</th>
              <th className="px-4 py-3 font-medium">최근 수정</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {matches.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  매칭이 없습니다.
                </td>
              </tr>
            ) : (
              matches.map((match) => (
                <tr
                  key={match.id}
                  className="border-t border-border/60 align-top hover:bg-muted/30"
                  onDoubleClick={() => actions.onOpenDetail(match.id)}
                  title="더블클릭하여 상세보기"
                >
                  <td className="px-4 py-3">
                    <StatusBadge kind="matchStage" status={match.stage} size="sm" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {match.buyerRequirement?.contact?.name ?? '미지정'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {match.buyerRequirement?.contact?.phone ?? '—'}
                      </p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      <p className="font-medium">{getMatchTitle(match)}</p>
                      <div className="flex flex-wrap items-center gap-2">
                        {match.listing?.transactionType && (
                          <StatusBadge
                            kind="transactionType"
                            status={match.listing.transactionType}
                            size="sm"
                          />
                        )}
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatMatchPrice(match)}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatRequirementSummary(match)}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    <p className="line-clamp-2">{match.memo ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(match.updatedAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end">
                      <MatchActionsMenu match={match} actions={actions} />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Plus,
  RefreshCw,
  RotateCcw,
  UserSearch,
} from 'lucide-react';
import { toast } from 'sonner';
import type { BuyerRequirement, Match } from '@estate-erp/api-client';
import { MatchStage } from '@estate-erp/shared';
import {
  buildViewingCalendarEventPayload,
  getMatchStageBlockReason,
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
} from './-match-groups';
import { MatchDetailDialog } from './-match-detail-dialog';
import { RequirementPeek } from './-requirement-peek';
import { MatchCreateDialog } from './-match-create-dialog';
import { MatchConvertDialog } from './-match-convert-dialog';
import { WantedFilterBar } from './-wanted-filter-bar';
import { WantedViewBar } from './-wanted-view-bar';
import type {
  RequirementEditHandler,
  RequirementRefreshHandler,
} from './-requirement-cells';
import {
  currentStatus,
  mergeLatestRequirement,
  mergeSavedRequirement,
} from './-requirement-edit';
import {
  countRequirementFilters,
  EMPTY_REQUIREMENT_FILTERS,
  hasRequirementFilters,
  NO_MATCH_STAGE,
  scopeRequirementFilters,
  type RequirementFilters,
} from './-wanted-filters';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { getStatusMeta } from '@/lib/status-config';
import { ConfirmDialog, EmptyState } from '@/components/domain';
import { getRouteMeta } from '@/features/tabs/lib/routeMeta';
import { useTabStore } from '@/features/tabs/store/useTabStore';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

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
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  // 고객 줄의 "열기"로 여는 옆 상세 패널. 매물관리 · 문서관리와 같은 방식으로 열고 닫는다:
  // 닫을 때는 미끄러져 나간 뒤에 선택을 지운다.
  const [peekRequirementId, setPeekRequirementId] = useState<string | null>(null);
  const [isPeekClosing, setIsPeekClosing] = useState(false);
  const [peekMotion, setPeekMotion] = useState(true);
  const openPeek = useCallback((requirementId: string) => {
    setPeekMotion(!document.activeElement?.matches(':focus-visible'));
    setIsPeekClosing(false);
    setPeekRequirementId(requirementId);
  }, []);
  const closePeek = useCallback((animate = true) => {
    setPeekMotion(animate);
    setIsPeekClosing(true);
  }, []);
  const finishClosingPeek = useCallback(() => {
    setPeekRequirementId(null);
    setIsPeekClosing(false);
  }, []);
  const [convertMatchId, setConvertMatchId] = useState<string | null>(null);
  const [deleteMatchId, setDeleteMatchId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  /** 고객 행에서 열면 그 조건으로 고정한다. 툴바에서 열면 null. */
  const [createRequirementId, setCreateRequirementId] = useState<string | null>(
    null,
  );
  const deferredSearch = useDeferredValue(searchQuery);
  /**
   * 칸 편집기가 열려 있는 조건 (목록에서 마지막으로 본 값). 다른 탭에서 고쳐 목록이 새로 오면 이 조건이
   * 필터에서 벗어나거나 목록에서 빠질 수 있다(완료 · 삭제). 그래도 편집기를 닫을 때까지는 줄을 남긴다 —
   * 줄이 사라지면 편집기와 고치던 입력이 함께 사라진다.
   */
  const [editingRequirement, setEditingRequirement] =
    useState<BuyerRequirement | null>(null);
  /** 필터 줄은 접을 수 있다. 접혀 있는 동안에는 도구 줄의 필터 버튼이 걸린 조건 수를 알린다. */
  const [isFilterRowOpen, setIsFilterRowOpen] = useState(true);
  /** 값이 바뀌면 검색 칸을 열고 커서를 둔다 */
  const [searchFocusSignal, setSearchFocusSignal] = useState(0);

  // 키보드 단축키: Cmd/Ctrl+F 또는 '/' 검색, 1~2 뷰 전환 (입력 중/다이얼로그 안에서는 무시)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'f') {
        event.preventDefault();
        setSearchFocusSignal((value) => value + 1);
        return;
      }

      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) {
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

      // 문서관리와 같은 검색 단축키. 창이나 메뉴가 열려 있으면 그쪽 조작을 가로채지 않는다.
      if (event.key === '/') {
        if (document.querySelector('[role="dialog"], [role="menu"]')) return;
        event.preventDefault();
        setSearchFocusSignal((value) => value + 1);
        return;
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
  // 매칭과 조건이 모두 있어야 한다. 하나만 실패한 채 그리면 매칭이 있는 조건을
  // '매칭 없음'으로 보여주거나, 조건 필터로 매칭을 잘못 걸러내게 된다.
  const isLoading = isMatchesLoading || isRequirementsLoading;
  const isError = isMatchesError || isRequirementsError;
  // 칸 편집기가 열려 있는 동안에는 목록을 다시 받다 실패해도 표를 오류 화면으로 바꾸지 않는다.
  // 바꾸면 편집기와 고치던 입력이 사라진다. 받아 둔 목록을 그대로 두고, 편집기를 닫으면 오류 화면이 보인다.
  const showError = isError && editingRequirement === null;
  const refetch = () => {
    void refetchMatches();
    void refetchRequirements();
  };

  const openMatchCreate = (requirementId: string | null = null) => {
    setCreateRequirementId(requirementId);
    setCreateOpen(true);
  };

  // 이 화면에서 새로 만드는 것은 희망매물(고객의 구함 의뢰)이다 (사용자 의견 2026-11-17:
  // "매칭 생성이 아니라 희망매물 생성이어야지"). 고객 원장과 같이 등록 화면을 새 탭으로 열어 이 목록은 그대로 둔다.
  // 어디서 열었는지 함께 넘겨, 취소하면 고객 원장이 아니라 이 화면으로 돌아오게 한다.
  const createTab = useTabStore((state) => state.createTab);
  // 옆 패널의 확장 버튼: 희망조건 전체 화면을 새 탭으로 연다
  const openRequirementTab = (requirementId: string) => {
    const route = `/buyer-requirements/${requirementId}`;
    const meta = getRouteMeta(route);
    createTab({ route, kind: meta.kind, title: meta.title });
  };
  const openRequirementCreate = () => {
    const route = '/buyer-requirements/new?from=wanted-properties';
    const meta = getRouteMeta(route);
    createTab({ route, kind: meta.kind, title: meta.title });
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

  // 칸을 저장하기 직전에 그 조건의 지금 값을 받는다. 구매 조건 수정에는 서버의 동시 수정 검사가 없어서,
  // 화면이 아직 받지 못한 변경(다른 직원 · 다른 탭)이 있어도 모른 채 저장하게 된다.
  // 편집기는 받아 온 값 위에 입력을 다시 얹고, 저장해도 되는지(거래유형이 바뀌지 않았는지 등) 다시 판단한다.
  const refreshRequirement: RequirementRefreshHandler = async (requirement) => {
    const latest = await api.buyerRequirements.findOne(requirement.id);
    // 받아 오는 사이 목록이 더 새 값을 받아 왔으면(다른 탭의 저장) 그쪽이 지금 값이다.
    // 방금 받은 것으로 덮으면 화면이 예전으로 돌아가고, 편집기도 예전 값 위에서 판단하게 된다.
    const listed = queryClient
      .getQueryData<BuyerRequirement[]>(['buyer-requirements', 'wanted-properties', 'open'])
      ?.find((item) => item.id === latest.id);
    if (listed && listed.updatedAt > latest.updatedAt) return listed;
    for (const scope of ['open', 'completed']) {
      queryClient.setQueryData<BuyerRequirement[]>(
        ['buyer-requirements', 'wanted-properties', scope],
        (list) => mergeLatestRequirement(list, latest),
      );
    }
    if (latest.updatedAt !== requirement.updatedAt) {
      // 목록이 예전 것이었다. 이 조건만이 아닐 수 있으니 뒤에서 다시 받는다
      void queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] });
    }
    return latest;
  };

  // 고객별 표의 칸에서 희망 조건을 고친다 (매물관리 표의 칸 편집과 같은 흐름).
  // 실패하면 던져서 편집기가 그 자리에서 알리고 입력을 남기게 한다.
  const saveRequirement: RequirementEditHandler = async (requirement, change) => {
    const saved =
      change.kind === 'status'
        ? await api.buyerRequirements.updateStatus(requirement.id, change.status)
        : await api.buyerRequirements.update(requirement.id, change.patch);

    // 응답에서 고친 칸만 받아 둔 목록에 덮어 칸이 곧장 바뀌게 하고, 정확한 목록은 뒤에서 다시 받는다.
    // (응답 전체를 덮으면 저장하는 사이 새로 온 목록의 손대지 않은 값이 응답의 예전 값으로 돌아간다.)
    // 매칭에 실려 오는 조건(매칭 상세)과 고객 원장도 같은 조건을 보여 준다.
    for (const scope of ['open', 'completed']) {
      queryClient.setQueryData<BuyerRequirement[]>(
        ['buyer-requirements', 'wanted-properties', scope],
        (list) => mergeSavedRequirement(list, saved, change),
      );
    }
    // 저장 전에 받기 시작한 목록이 있어도 여기서 멈추고 다시 받으므로(invalidateQueries의 기본 동작),
    // 저장 전 값이 뒤늦게 도착해 고친 칸을 덮지 않는다.
    for (const queryKey of [['buyer-requirements'], ['matches'], ['brokerage-cases']]) {
      void queryClient.invalidateQueries({ queryKey });
    }

    if (change.kind === 'status' && change.status === 'completed') {
      // 이 목록은 진행 · 보류 조건만 보여 주므로 완료하면 줄이 사라진다. 이유를 알리고 되돌릴 길을 둔다.
      const previous = currentStatus(requirement);
      toast.success('완료로 바꿨습니다', {
        description: `${requirement.contact?.name ?? '미지정'} · 진행 중인 조건만 보는 이 목록에서는 빠집니다`,
        action:
          previous === 'active' || previous === 'hold'
            ? {
                label: '되돌리기',
                onClick: () => void undoCompleted(requirement.id, previous),
              }
            : undefined,
      });
    }
  };

  // 되돌리기는 알림이 떠 있는 동안 언제든 눌릴 수 있다. 그 사이 다른 곳에서 상태를 다시 바꿨다면
  // (더는 완료가 아니라면) 되돌리지 않는다 — 누른 사람이 본 적 없는 새 상태를 예전 값으로 덮게 된다.
  const undoCompleted = async (id: string, previous: 'active' | 'hold') => {
    try {
      const latest = await api.buyerRequirements.findOne(id);
      if (currentStatus(latest) !== 'completed') {
        toast.info('그 사이 상태가 바뀌어 되돌리지 않았습니다');
        void queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] });
        return;
      }
      await saveRequirement(latest, { kind: 'status', status: previous });
    } catch {
      toast.error('상태를 되돌리지 못했습니다');
    }
  };

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

  const activeRequirementFilters = useMemo(
    () => scopeRequirementFilters(requirementFilters, requirements),
    [requirementFilters, requirements],
  );

  // 편집 중인 조건이 지금 목록에 있으면 그 값.
  const editingListed = useMemo(
    () =>
      editingRequirement
        ? requirements.find((item) => item.id === editingRequirement.id)
        : undefined,
    [editingRequirement, requirements],
  );
  // 목록에 있는 동안에는 늘 목록의 지금 값을 기억해 둔다. 목록에서 빠졌을 때 남겨 두는 줄을
  // "편집기를 열 때의 값"으로 그리면 편집기가 이미 본 값보다 예전으로 돌아간다 — 그 사이 감지한
  // 거래유형 충돌이 풀려서, 매매가로 넣은 금액이 전세가 된 조건에 저장된다.
  useEffect(() => {
    if (!editingListed) return;
    setEditingRequirement((current) =>
      current && current.id === editingListed.id ? editingListed : current,
    );
  }, [editingListed]);
  /**
   * 편집 중인 조건이 목록에서 빠졌다(다른 곳에서 완료 · 삭제). 줄은 마지막으로 본 값으로 남기지만
   * 이 조건의 지금 값은 더 알 수 없다 — 빠지면서 다른 값도 함께 바뀌었을 수 있다.
   * 그래서 남겨 둔 줄에서는 저장하지 않는다. 입력은 편집기에 그대로 둔다.
   */
  const editingDetached = editingRequirement !== null && editingListed === undefined;

  const groupedBuyerMatches = useMemo(() => {
    const listed =
      editingRequirement && editingDetached
        ? [...requirements, editingRequirement]
        : requirements;
    return groupMatchesByRequirement({
      requirements: listed,
      matches,
      search: deferredSearch,
      stageFilters: stageFilters,
      transactionType: transactionTypeFilter,
      requirementFilters: activeRequirementFilters,
      keepRequirementId: editingRequirement?.id ?? null,
    });
  }, [
    activeRequirementFilters,
    stageFilters,
    deferredSearch,
    editingDetached,
    editingRequirement,
    matches,
    requirements,
    transactionTypeFilter,
  ]);
  // 옆 패널에 열린 고객. 필터 · 검색으로 목록에서 빠지면 패널도 닫힌다(보이지 않는 줄의 패널이 남지 않게).
  const peekGroup =
    groupedBuyerMatches.find((group) => group.buyerReqId === peekRequirementId) ?? null;
  const openPeekId = isPeekClosing ? null : (peekGroup?.buyerReqId ?? null);
  // 패널의 연결 매물은 목록의 단계 필터 · 검색과 상관없이 이 고객의 매칭 전부다.
  // 줄에 보이는 매칭(peekGroup.matches)은 필터로 걸러진 것이라, 그대로 쓰면 패널이 매물을 빠뜨린다.
  const peekMatches = useMemo(
    () => matches.filter((match) => match.buyerReqId === peekRequirementId),
    [matches, peekRequirementId],
  );
  useEffect(() => {
    if (peekRequirementId && !peekGroup) finishClosingPeek();
  }, [finishClosingPeek, peekGroup, peekRequirementId]);
  const groupedMatchCount = groupedBuyerMatches.reduce(
    (count, group) => count + group.matches.length,
    0,
  );

  const visibleItemIds = useMemo(
    () => groupedBuyerMatches.map((group) => group.buyerReqId),
    [groupedBuyerMatches],
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
    !isLoading &&
    !showError &&
    groupedBuyerMatches.length > 0;

  const hasActiveFilters =
    searchQuery.trim().length > 0 ||
    stageFilters.length > 0 ||
    transactionTypeFilter.length > 0 ||
    hasRequirementFilters(activeRequirementFilters);
  // 필터 줄의 알약 수와 같다: 단계 + 희망 조건 필터 (검색어와 거래유형 탭은 늘 보이므로 세지 않는다)
  const activeFilterCount =
    (stageFilters.length > 0 ? 1 : 0) +
    countRequirementFilters(activeRequirementFilters);

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
      // relative · overflow-hidden: 옆 상세 패널이 이 화면 오른쪽에서 미끄러져 나온다
      className="relative -m-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background"
    >
      {/* 위쪽: 매물관리와 같은 거래유형 묶음 탭 + Notion형 도구 줄, 그 아래 아이콘 알약 필터 줄.
          줄마다 아래 선을 스스로 긋는다 (매물관리처럼 도구 줄과 필터 줄 사이에 선이 있고,
          필터 줄을 접어도 선이 두 겹이 되지 않는다). */}
      <header
        data-wanted-header
        aria-label="희망매물 보기 및 필터"
        className="shrink-0 bg-white"
      >
        <WantedViewBar
          transactionType={transactionTypeFilter}
          transactionTypeTabs={TRANSACTION_TYPE_TABS}
          onTransactionTypeChange={handleTransactionTypeChange}
          isFilterRowOpen={isFilterRowOpen}
          onToggleFilterRow={() => setIsFilterRowOpen((open) => !open)}
          activeFilterCount={activeFilterCount}
          search={searchQuery}
          onSearchChange={setSearchQuery}
          searchFocusSignal={searchFocusSignal}
          actions={
            <div className="flex items-center gap-1.5">
              {/* 매칭(매물 연결)은 고객 줄의 + 와 매물관리의 '고객 연결'에서 한다. 여기에는 버튼을 두지 않는다. */}
              <Button
                type="button"
                size="sm"
                aria-label="희망매물 생성"
                className="h-[30px] shrink-0 rounded-[8px] px-3 text-[13px]"
                onClick={openRequirementCreate}
              >
                <Plus className="size-3.5" />
                <span className="@max-3xl:hidden">희망매물 생성</span>
              </Button>
            </div>
          }
        />
        {isFilterRowOpen && (
          <WantedFilterBar
            filters={activeRequirementFilters}
            onFiltersChange={setRequirementFilters}
            requirements={requirements}
            stageOptionsPrefix={NO_MATCH_STAGE_OPTIONS}
            stageFilters={stageFilters}
            onStageFiltersChange={setStageFilters}
            transactionType={transactionTypeFilter}
            hasActiveFilters={hasActiveFilters}
            onReset={resetFilters}
          />
        )}
      </header>

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
        ) : showError ? (
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
        ) : requirements.length === 0 && editingRequirement === null ? (
          <EmptyState
            icon={UserSearch}
            title="진행 중인 희망 조건이 없습니다"
            description="고객의 구함 의뢰를 등록하면 여기에서 조건에 맞는 매물을 연결할 수 있습니다."
            action={
              <Button type="button" onClick={openRequirementCreate}>
                <Plus className="size-4" />
                희망매물 생성
              </Button>
            }
          />
        ) : groupedBuyerMatches.length === 0 ? (
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
                peekOpen={openPeekId === group.buyerReqId}
                onTogglePeek={() =>
                  openPeekId === group.buyerReqId ? closePeek() : openPeek(group.buyerReqId)
                }
                onEditRequirement={saveRequirement}
                onRefreshRequirement={refreshRequirement}
                onRequirementEditingChange={(editing) =>
                  setEditingRequirement((current) =>
                    editing
                      ? group.buyerRequirement
                      : current?.id === group.buyerReqId
                        ? null
                        : current,
                  )
                }
                requirementEditBlocked={
                  editingDetached && group.buyerReqId === editingRequirement?.id
                    ? '완료되었거나 지워진 조건이라 이 목록에서는 저장할 수 없습니다.'
                    : undefined
                }
              />
            ))}
          </div>
        ) : null}
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

      {peekGroup && (
        <RequirementPeek
          requirement={peekGroup.buyerRequirement}
          matches={peekMatches}
          closing={isPeekClosing}
          animate={peekMotion}
          onClose={closePeek}
          onExited={finishClosingPeek}
          onOpenFull={openRequirementTab}
          onOpenMatch={setSelectedMatchId}
        />
      )}

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

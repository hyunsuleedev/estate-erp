import {
  useEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  GitBranch,
  Loader2,
  Megaphone,
  PencilLine,
  Phone,
  Plus,
  Ruler,
  Tag,
  User,
  UserCheck,
} from 'lucide-react';
import type {
  ActivityLog,
  Match,
  MatchDealLink,
} from '@estate-erp/api-client';
import {
  DealStage,
  MATCH_CLOSED_REASON_LABELS,
  MatchStage,
  normalizeDealStage,
  normalizeMatchStage,
} from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatPhoneNumber } from '@/lib/contacts';
import { getStatusMeta } from '@/lib/status-config';
import { useAuth } from '@/providers/auth-provider';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/domain';
import { EditableCell } from '@/components/data-table';
import { CellTableNavigationProvider } from '@/components/data-table/cell-navigation';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MatchConvertDialog } from '../../wanted-properties/-match-convert-dialog';
import {
  buildViewingCalendarEventPayload,
  buyerProgressStages,
  formatViewingEventTime,
  getActiveDealLink,
  getDealProgressNodeState,
  getDealProgressStages,
  getDealStageLabel,
  getDefaultViewingStartDate,
  getElapsedDays,
  getMatchStageActionCopy,
  getMatchStageBlockReason,
  getMatchStageDotClass,
  getMatchStageHeaderClass,
  getMatchStageLabel,
  getNextMatchStage,
  getProgressNodeState,
  getUpcomingViewingEvent,
  shouldMoveToViewingOnSchedule,
  toCalendarEventUpdatePayload,
  toDateTimeLocalInputValue,
  type MatchProgressStage,
} from '../../wanted-properties/-match-view-utils';
import type { PropertyListingGroup } from './property-listings-table';
import {
  computeBudgetFit,
  formatBuyerArea,
  formatBuyerBudget,
} from './property-match-format';
import { PropertyMatchConnectDialog } from './property-match-connect-dialog';
import {
  MatchTableColumnHeader, MatchTableSortControl,
} from './property-match-table-controls';
import {
  getMatchTableLayout, matchTableColumns, sortMatchGroups,
  type MatchColumnWidths, type MatchTableSort,
} from './property-match-table-state';
import { useMatchTablePreferences } from './use-match-table-preferences';

// 매물관리 표에서 한 의뢰를 펼쳤을 때 나오는 "연결 구매고객" 목록.
// 고객 한 명이 한 줄이고, 줄을 펼치면 단계 경로와 다음 작업이 나온다.

// 머리글과 고객 줄이 같은 열 폭을 쓴다. 칸 사이 간격 대신 칸 안쪽 여백을 둔다.
const GRID_COLS = 'grid grid-cols-[var(--match-table-columns)]';
// 머리글: 세로선 없이 이름만 칸 여백에 맞춘다.
const HEADER_GRID = `${GRID_COLS} items-center`;
// 고객 줄: 노션 표처럼 칸마다 오른쪽 세로선. 맨 앞 화살표 칸과 마지막 칸은 선이 없다.
const ROW_GRID = `${GRID_COLS} items-center [&>*:not(:first-child)]:min-h-9 [&>*:not(:first-child)]:self-stretch [&>*:not(:first-child)]:content-center [&>*:not(:first-child)]:px-2.5 [&>*:not(:first-child):not(:last-child)]:border-r [&>*:not(:first-child):not(:last-child)]:border-border`;

const matchColumnIcons = {
  customer: <User />, phone: <Phone />, trade: <Tag />, budget: <WonCircleIcon />,
  area: <Ruler />, stage: <CircleDashed />, memo: <PencilLine />, assignee: <UserCheck />,
};

function getPropertyActiveAdvertisementCount(group: PropertyListingGroup) {
  return group.listings.reduce(
    (total, listing) =>
      total +
      (listing.activeAdvertisementCount ??
        listing.activeAdvertisements?.length ??
        0),
    0,
  );
}

// 패널 머리글의 탭 하나. 연결 구매고객 ↔ 광고 전환.
function PanelTab({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors',
        active
          ? 'bg-foreground/[0.07] font-medium text-foreground'
          : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
      )}
      onClick={onClick}
    >
      <span
        aria-hidden="true"
        className={cn(
          'shrink-0 [&>svg]:size-3.5',
          active ? '[&>svg]:text-foreground/70' : '[&>svg]:text-[#a3a09a]',
        )}
      >
        {icon}
      </span>
      {label}
      <span
        className={cn(
          'tabular-nums',
          active ? 'text-muted-foreground' : 'text-muted-foreground/60',
        )}
      >
        {count}
      </span>
    </button>
  );
}

export function getPropertyMatchCount(group: PropertyListingGroup) {
  return group.listings.reduce(
    (total, listing) => total + (listing._count?.matches ?? 0),
    0,
  );
}

/** 패널이 그려지기 전, 가상 스크롤이 쓸 높이 추정값 */
export function estimatePropertyMatchPanelHeight(group: PropertyListingGroup) {
  return 138 + Math.max(1, getPropertyMatchCount(group)) * 37;
}

// ── 단계 이력 (활동 로그에서 뽑는다) ────────────────────────────────────────

type StageHistory = {
  /** 단계별로 마지막에 도달한 시각 */
  enteredAt: Partial<Record<string, string>>;
  /** 지금 단계에 들어온 시각. 기록으로 확인되지 않으면 null (추정하지 않는다) */
  since: string | null;
  events: { id: string; at: string; text: string }[];
};

function readStageChange(log: ActivityLog) {
  const change = log.changes?.stage as
    | { before?: unknown; after?: unknown }
    | undefined;
  if (!change || typeof change.after !== 'string') return null;
  return {
    before: typeof change.before === 'string' ? change.before : null,
    after: change.after,
  };
}

/** 받은 로그의 가장 최근 단계 변경이 매칭의 현재 단계와 맞는지 */
function isHistoryCurrent(match: Match, logs: ActivityLog[]) {
  let latest: { at: number; after: string } | null = null;
  for (const log of logs) {
    const change = readStageChange(log);
    if (!change) continue;
    const at = new Date(log.createdAt).getTime();
    if (!latest || at > latest.at) latest = { at, after: change.after };
  }
  return (
    !latest ||
    normalizeMatchStage(latest.after) === normalizeMatchStage(match.stage)
  );
}

/**
 * complete = 이 매칭의 활동 로그를 빠짐없이 받았는지.
 * 일부만 받았으면 "기록이 없다"를 "단계가 안 바뀌었다"로 해석할 수 없다.
 */
function buildStageHistory(
  match: Match,
  logs: ActivityLog[],
  complete: boolean,
): StageHistory {
  const ordered = logs
    .slice()
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  const enteredAt: Partial<Record<string, string>> = {};
  const events: StageHistory['events'] = [];
  let firstStage: string | null = null;

  for (const log of ordered) {
    const change = readStageChange(log);
    if (change) {
      const before = change.before ? normalizeMatchStage(change.before) : null;
      const after = normalizeMatchStage(change.after);
      firstStage ??= before;
      enteredAt[after] = log.createdAt;
      events.push({
        id: log.id,
        at: log.createdAt,
        text: before
          ? `${getMatchStageLabel(before)} → ${getMatchStageLabel(after)}`
          : getMatchStageLabel(after),
      });
    } else if (log.changes && 'memo' in log.changes) {
      events.push({ id: log.id, at: log.createdAt, text: '메모 수정' });
    }
  }

  // 로그를 전부 받았을 때만: 첫 단계는 연결한 날 시작했고,
  // 단계 변경 기록이 없으면 연결한 뒤 계속 같은 단계에 있었다는 뜻이다.
  if (complete) {
    const startStage = firstStage ?? normalizeMatchStage(match.stage);
    enteredAt[startStage] ??= match.createdAt;
  }
  events.unshift({
    id: `${match.id}-created`,
    at: match.createdAt,
    text: '고객 연결',
  });

  // 되돌린 경우 지금 단계보다 뒤의 날짜는 더 이상 유효하지 않다.
  const current = normalizeMatchStage(match.stage);
  const reference =
    current === MatchStage.CLOSED
      ? match.closedFromStage
        ? normalizeMatchStage(match.closedFromStage)
        : null
      : current;
  const referenceIndex = reference
    ? buyerProgressStages.indexOf(reference as MatchProgressStage)
    : -1;
  buyerProgressStages.forEach((stage, index) => {
    if (index > referenceIndex) delete enteredAt[stage];
  });

  return {
    enteredAt,
    since: enteredAt[current] ?? null,
    events: events.reverse(),
  };
}

// ── 표시용 계산 ─────────────────────────────────────────────────────────────

function formatMonthDay(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getMonth() + 1}. ${date.getDate()}.`;
}

function formatElapsed(days: number | null) {
  if (days == null) return '';
  return days === 0 ? '오늘' : `${days}일째`;
}

/** 지금 단계에 머문 일수. 기록으로 확인되지 않으면 null */
function getStageDays(history: StageHistory | undefined) {
  return history?.since ? getElapsedDays(history.since) : null;
}

/** 이 매물의 가격이 고객 예산 상한 안인지. 비교할 값이 없으면 null */
function getBudgetFit(match: Match) {
  return computeBudgetFit(match.listing, match.buyerRequirement);
}

const STAGE_GUIDE: Record<string, { next: string; title: string }> = {
  [MatchStage.SUGGESTED]: {
    next: '매물 제안하기',
    title: '고객에게 이 매물을 제안하세요',
  },
  [MatchStage.BUYER_INTERESTED]: {
    next: '고객 답변 확인',
    title: '고객의 방문 의사를 확인하세요',
  },
  [MatchStage.VIEWING_CONFIRMED]: {
    next: '집주인 확인',
    title: '집주인과 방문 일정을 조율하세요',
  },
  [MatchStage.VIEWING]: {
    next: '방문 일정 잡기',
    title: '방문을 진행하고 결과를 남기세요',
  },
  [MatchStage.NEGOTIATING]: {
    next: '가격·입주일 협의',
    title: '가격과 입주일을 조율하세요',
  },
};

function getStageIndex(stage: string) {
  return buyerProgressStages.indexOf(
    normalizeMatchStage(stage) as MatchProgressStage,
  );
}

// ── 패널 ────────────────────────────────────────────────────────────────────

type PanelActions = {
  isUpdating: boolean;
  isScheduling: boolean;
  onStageChange: (matchId: string, stage: string) => void;
  onScheduleViewing: (match: Match, startLocalValue: string) => void;
};

export function PropertyMatchPanel({
  group,
  activeTab,
  onTabChange,
  onHeightChange,
  adPanel,
}: {
  group: PropertyListingGroup;
  /** 머리글 탭으로 전환하는 현재 탭 */
  activeTab: 'match' | 'ad';
  onTabChange: (groupId: string, tab: 'match' | 'ad') => void;
  /** 실제 높이를 표에 알려 가상 스크롤이 아래 행 위치를 맞추게 한다 */
  onHeightChange?: (groupId: string, height: number) => void;
  /** '광고' 탭 내용 (index.tsx가 소유) */
  adPanel: ReactNode;
}) {
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [convertMatchId, setConvertMatchId] = useState<string | null>(null);
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [showClosed, setShowClosed] = useState(false);
  const { user } = useAuth();
  const { preferences, updatePreferences } = useMatchTablePreferences(
    user?.office?.id ?? 'local', user?.id ?? 'guest',
  );
  const [previewWidths, setPreviewWidths] = useState<MatchColumnWidths | null>(null);
  const layout = getMatchTableLayout(previewWidths ?? preferences.widths);
  const setSort = (sort: MatchTableSort) =>
    updatePreferences((current) => ({ ...current, sort }));
  const listingIds = useMemo(
    () => group.listings.map((listing) => listing.id),
    [group.listings],
  );
  const {
    data: matches = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: [
      'matches',
      'property-list-panel',
      group.id,
      listingIds.join(','),
    ],
    queryFn: async () => {
      const results = await Promise.all(
        listingIds.map((listingId) => api.matches.findAll({ listingId })),
      );
      return results.flat();
    },
  });

  // 단계별 도달 날짜와 머문 일수는 활동 로그에서만 알 수 있다.
  const historyQueries = useQueries({
    queries: matches.map((match) => ({
      queryKey: ['matches', 'stage-history', match.id],
      queryFn: () =>
        api.activityLogs.list({
          entityType: 'match',
          entityId: match.id,
          limit: 100,
        }),
      staleTime: 30_000,
    })),
  });
  const historyByMatchId = useMemo(() => {
    const map = new Map<string, StageHistory>();
    matches.forEach((match, index) => {
      // 조회 중이거나 실패한 매칭은 이력을 만들지 않는다 (날짜·일수 표시 안 함).
      // 재조회가 실패하면 예전 응답이 남아 있으므로 오류 상태도 함께 본다.
      const query = historyQueries[index];
      const data = query?.data;
      if (!data || query.isError) return;
      // 받은 로그가 지금 단계보다 예전 것이면(단계 변경 직후) 쓰지 않는다.
      if (!isHistoryCurrent(match, data.items)) return;
      map.set(
        match.id,
        buildStageHistory(
          match,
          data.items,
          data.pagination.total <= data.items.length,
        ),
      );
    });
    return map;
    // historyQueries는 매 렌더 새 배열이라 응답 갱신 시각으로 비교한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, historyQueries
      .map((query) => `${query.dataUpdatedAt}:${query.isError}`).join(',')]);

  useEffect(() => {
    const element = rootRef.current;
    // 높이는 '연결 구매고객' 탭에서만 가변적이라 그때만 실측을 보고한다.
    // (광고 탭은 index.tsx가 추정 높이를 쓴다)
    if (!element || !onHeightChange || activeTab !== 'match') return;
    const report = () =>
      onHeightChange(group.id, Math.ceil(element.getBoundingClientRect().height));
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [group.id, onHeightChange, activeTab]);

  const stageMutation = useMutation({
    mutationFn: ({ matchId, stage }: { matchId: string; stage: string }) =>
      api.matches.updateStage(matchId, { stage }),
    onSuccess: (_updatedMatch, variables) => {
      toast.success(
        variables.stage === MatchStage.CLOSED
          ? '매칭을 종료했습니다.'
          : `${getMatchStageLabel(variables.stage)} 단계로 변경했습니다.`,
      );
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
    },
    onError: (error: Error) => {
      toast.error(error.message || '매칭 단계 변경에 실패했습니다.');
    },
  });

  const memoMutation = useMutation({
    mutationFn: ({ match, memo }: { match: Match; memo: string | null }) =>
      api.matches.updateMemo(match.id, {
        memo,
        expectedUpdatedAt: match.updatedAt,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      toast.success('매칭 메모를 저장했습니다.');
    },
    onError: (error: Error) => {
      toast.error(error.message || '매칭 메모 저장에 실패했습니다.');
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
      if (blockReason) throw new Error(blockReason);

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
      toast.success('방문 일정을 저장했습니다.');
    },
    onError: (error: Error) => {
      toast.error(`방문 일정 저장에 실패했습니다: ${error.message}`);
    },
  });

  const handleStageChange = (matchId: string, stage: string) => {
    // 단계 변경이나 방문 일정 저장이 끝나기 전에는 다른 단계 변경을 받지 않는다.
    // (일정 저장은 끝나면서 임장 단계로 옮기므로, 그 사이의 종료가 덮어써진다.)
    if (stageMutation.isPending || viewingScheduleMutation.isPending) return;
    const match = matches.find((candidate) => candidate.id === matchId);
    if (match) {
      if (normalizeMatchStage(match.stage) === normalizeMatchStage(stage)) return;
      const blockReason = getMatchStageBlockReason(match, stage);
      if (blockReason) {
        toast.error('단계 이동 전 확인이 필요합니다.', {
          description: blockReason,
        });
        return;
      }
    }

    if (stage === MatchStage.DEAL_CREATED) {
      setConvertMatchId(matchId);
      return;
    }

    stageMutation.mutate({ matchId, stage });
  };

  const actions: PanelActions = {
    isUpdating: stageMutation.isPending,
    isScheduling: viewingScheduleMutation.isPending,
    onStageChange: handleStageChange,
    onScheduleViewing: (match, startLocalValue) => {
      if (stageMutation.isPending || viewingScheduleMutation.isPending) return;
      viewingScheduleMutation.mutate({ match, startLocalValue });
    },
  };

  const { won, rest, closed } = useMemo(() => {
    // 거래 전환 고객은 위, 종료 고객은 아래에 유지하고 각 그룹 안에서 정렬한다.
    return sortMatchGroups(matches, preferences.sort, getStageIndex,
      (match) => getStageDays(historyByMatchId.get(match.id)));
  }, [historyByMatchId, matches, preferences.sort]);

  const visibleMatchIds = useMemo(
    () => [...won, ...rest, ...(showClosed ? closed : [])].map((match) => match.id),
    [won, rest, closed, showClosed],
  );

  // 선택은 이 패널에 보이는 매칭에만 속한다. 상세 펼침/상위 매물 선택과 독립적이다.
  useEffect(() => {
    const visibleIds = new Set(activeTab === 'match' ? visibleMatchIds : []);
    setSelectedMatchIds((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [activeTab, visibleMatchIds]);

  const toggleMatchSelection = (matchId: string, selected: boolean) => {
    setSelectedMatchIds((current) => {
      const next = new Set(current);
      if (selected) next.add(matchId);
      else next.delete(matchId);
      return next;
    });
  };
  const allVisibleSelected =
    visibleMatchIds.length > 0 &&
    visibleMatchIds.every((id) => selectedMatchIds.has(id));

  const activeCount = won.length + rest.length;
  const adCount = getPropertyActiveAdvertisementCount(group);
  const convertMatch =
    matches.find((match) => match.id === convertMatchId) ?? null;

  const renderRow = (match: Match, dim: boolean) => (
    <MatchRow
      key={match.id}
      match={match}
      history={historyByMatchId.get(match.id)}
      dim={dim}
      isOpen={openMatchId === match.id}
      isSelected={selectedMatchIds.has(match.id)}
      onSelectedChange={(selected) => toggleMatchSelection(match.id, selected)}
      actions={actions}
      isSavingMemo={
        memoMutation.isPending && memoMutation.variables?.match.id === match.id
      }
      onToggle={() =>
        setOpenMatchId((current) => (current === match.id ? null : match.id))
      }
      onSaveMemo={(memo) =>
        memoMutation.mutateAsync({ match, memo }).then(() => undefined)
      }
    />
  );

  return (
    <div
      ref={rootRef}
      data-property-match-panel
      id={`property-expand-panel-${group.id}`}
      role="region"
      aria-label={`${group.property?.site?.name ?? '매물'} 연결 구매고객`}
      className="border-b border-border bg-background py-3 pl-6 pr-4"
    >
      <div className="overflow-x-auto">
        {/* 선택 여백도 스크롤 안에 둬 잘림 없이 기존 데이터 열 위치를 유지한다. */}
        <div className="pl-9" style={activeTab === 'match' ? {
          '--match-table-columns': layout.gridTemplateColumns,
          minWidth: layout.minWidth,
          width: layout.width,
        } as CSSProperties : { minWidth: 1054, width: '100%' }}>
          <div className="mb-1 flex h-7 items-center gap-1 text-[13px]">
            <PanelTab
              icon={<GitBranch />}
              label="연결 구매고객"
              count={isLoading ? getPropertyMatchCount(group) : activeCount}
              active={activeTab === 'match'}
              onClick={() => onTabChange(group.id, 'match')}
            />
            <PanelTab
              icon={<Megaphone />}
              label="광고"
              count={adCount}
              active={activeTab === 'ad'}
              onClick={() => onTabChange(group.id, 'ad')}
            />
            {activeTab === 'match' && won.length > 0 && (
              <span className="text-xs text-muted-foreground/70">
                · 거래 진행 {won.length}
              </span>
            )}
            {activeTab === 'match' && selectedMatchIds.size > 0 && (
              <div className="ml-2 flex items-center gap-2 text-xs">
                <span role="status" className="text-foreground">
                  {selectedMatchIds.size}명 선택됨
                </span>
                <button
                  type="button"
                  className="h-[26px] rounded-[5px] px-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setSelectedMatchIds(new Set())}
                >
                  선택 해제
                </button>
              </div>
            )}
            <span className="flex-1" />
            {activeTab === 'match' && (
              <MatchTableSortControl
                sort={preferences.sort}
                onSort={setSort}
                onResetWidths={() => updatePreferences((current) => ({ ...current, widths: {} }))}
              />
            )}
          </div>

          {activeTab === 'ad' ? (
            adPanel
          ) : isLoading ? (
            <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              구매고객을 불러오는 중...
            </div>
          ) : isError ? (
            <div className="flex h-20 items-center justify-between px-1">
              <span className="text-xs text-destructive">
                연결된 구매고객을 불러오지 못했습니다.
              </span>
              <Button variant="outline" size="xs" onClick={() => void refetch()}>
                다시 시도
              </Button>
            </div>
          ) : (
            <div role="table" aria-label="연결 구매고객 표">
              {/* 전체 선택은 헤더 전체가 아닌 체크박스 영역의 호버에만 반응한다. */}
              <div className="relative -ml-9 pl-9">
                {visibleMatchIds.length > 0 && (
                  <MatchSelectionCheckbox
                    label="표시된 구매고객 모두 선택"
                    checked={
                      allVisibleSelected
                        ? true
                        : selectedMatchIds.size > 0
                          ? 'indeterminate'
                          : false
                    }
                    onCheckedChange={(checked) =>
                      setSelectedMatchIds(new Set(checked ? visibleMatchIds : []))
                    }
                  />
                )}
                <div
                  data-property-match-header
                  role="row"
                  className={cn(
                    HEADER_GRID,
                    'h-9 border-b border-border text-[13px] font-normal leading-[21px] text-muted-foreground',
                  )}
                >
                  <span role="columnheader" aria-label="상세 펼침" />
                  {matchTableColumns.map((column) => (
                    <MatchTableColumnHeader
                      key={column.id}
                      column={column}
                      icon={matchColumnIcons[column.id]}
                      sort={preferences.sort}
                      onSort={setSort}
                      onPreviewResize={setPreviewWidths}
                      onCommitResize={(widths) => updatePreferences((current) => ({ ...current, widths }))}
                      onResetWidth={(id) => updatePreferences((current) => {
                        const widths = { ...current.widths };
                        delete widths[id];
                        return { ...current, widths };
                      })}
                    />
                  ))}
                </div>
              </div>

              {matches.length === 0 && (
                <div className="flex h-10 items-center border-b border-border pl-8 text-xs text-muted-foreground">
                  연결된 구매고객이 없습니다.
                </div>
              )}

              {won.map((match) => renderRow(match, false))}
              {won.length > 0 && rest.length > 0 && (
                <div className="flex h-[30px] items-end border-b border-border pb-1.5 pl-8 text-[11.5px] text-muted-foreground/70">
                  다른 고객 {rest.length}명 · 이 매물은 거래 진행 중
                </div>
              )}
              {rest.map((match) => renderRow(match, won.length > 0))}

              <button
                type="button"
                className="flex h-9 w-full items-center gap-1.5 rounded pl-[34px] text-left text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="size-3" />
                고객 연결
              </button>

              {closed.length > 0 && (
                <>
                  <button
                    type="button"
                    aria-expanded={showClosed}
                    className="flex h-8 items-center gap-1.5 rounded pl-1 text-[13px] text-muted-foreground hover:text-foreground"
                    onClick={() => setShowClosed((value) => !value)}
                  >
                    <ChevronRight
                      className={cn(
                        'size-3 transition-transform',
                        showClosed && 'rotate-90',
                      )}
                    />
                    종료 {closed.length}명
                  </button>
                  {showClosed && closed.map((match) => renderRow(match, true))}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <PropertyMatchConnectDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        group={group}
        matches={matches}
      />

      <MatchConvertDialog
        match={convertMatch}
        open={convertMatchId !== null}
        onOpenChange={(open) => {
          if (!open) setConvertMatchId(null);
        }}
      />
    </div>
  );
}

// ── 열 머리글 (매물 표 머리글과 같은 아이콘 + 이름) ─────────────────────────

function WonCircleIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 9l1.5 6L12 10l2.5 5L16 9" />
    </svg>
  );
}

// ── 고객 한 줄 ──────────────────────────────────────────────────────────────

function MatchSelectionCheckbox({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean | 'indeterminate';
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label
      data-match-selection-control
      className={cn(
        'absolute inset-y-0 left-0 flex w-9 cursor-pointer items-center justify-center transition-opacity duration-200 ease-in-out motion-reduce:transition-none',
        checked !== false
          ? 'opacity-100'
          : 'opacity-0 group-hover/match-selection:opacity-70 hover:!opacity-100 has-[:focus-visible]:!opacity-100 [@media(hover:none)]:opacity-100',
      )}
      onClick={(event) => event.stopPropagation()}
    >
      <Checkbox
        aria-label={label}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        onClick={(event) => event.stopPropagation()}
        className="cursor-pointer rounded-[3px] shadow-none data-[state=unchecked]:!border-muted-foreground/50 data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground"
      />
    </label>
  );
}

function MatchRow({
  match,
  history,
  dim,
  isOpen,
  isSelected,
  onSelectedChange,
  actions,
  isSavingMemo,
  onToggle,
  onSaveMemo,
}: {
  match: Match;
  history: StageHistory | undefined;
  /** 거래로 넘어간 다른 고객이 있거나 종료된 매칭이면 회색으로 물러난다 */
  dim: boolean;
  isOpen: boolean;
  isSelected: boolean;
  onSelectedChange: (selected: boolean) => void;
  actions: PanelActions;
  isSavingMemo: boolean;
  onToggle: () => void;
  onSaveMemo: (memo: string | null) => Promise<void>;
}) {
  const buyer = match.buyerRequirement;
  const buyerName = buyer?.contact?.name ?? '구매자 미상';
  const buyerPhone = buyer?.contact?.phone;
  const stage = normalizeMatchStage(match.stage);
  const isClosed = stage === MatchStage.CLOSED;
  const fit = getBudgetFit(match);
  const area = formatBuyerArea(buyer);
  const days = getStageDays(history);

  return (
    <>
      <div className="group/match-selection relative -ml-9 pl-9">
        <MatchSelectionCheckbox
          label={`${buyerName} 선택`}
          checked={isSelected}
          onCheckedChange={onSelectedChange}
        />
        <div
          data-property-match-row={match.id}
          role="row"
          data-selected={isSelected || undefined}
          data-state={isOpen ? 'open' : undefined}
          className={cn(
            ROW_GRID,
            'group/row min-h-[37px] cursor-pointer border-b border-border text-[14px] font-[450] leading-[21px] text-foreground hover:bg-muted',
          )}
          // 고객 링크·전화번호 복사·단계·메모는 각 셀에서 처리하고,
          // 나머지 칸은 상세를 펼친다. (키보드는 맨 앞 화살표 버튼을 사용)
          onClick={onToggle}
        >
          <div role="cell"><button
            type="button"
            aria-expanded={isOpen}
            aria-controls={`property-match-detail-${match.id}`}
            aria-label={`${buyerName} 상세 ${isOpen ? '접기' : '펼치기'}`}
            className="grid h-9 w-6 place-items-center rounded text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
          >
            <ChevronRight
              className={cn('size-3.5 transition-transform motion-reduce:transition-none', isOpen && 'rotate-90')}
            />
          </button></div>

          <div
            role="cell"
            className={cn(
              'flex min-w-0 items-center gap-1.5',
              'font-medium',
              dim ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {buyer?.contact?.id ? (
              <Link
                data-property-match-buyer
                to="/contacts/$id"
                params={{ id: buyer.contact.id }}
                className="inline-flex h-6 min-w-0 max-w-full items-center gap-1.5 rounded-full bg-transparent py-0.5 pl-0.5 pr-2 font-[450] transition-colors duration-150 hover:bg-info-soft/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 motion-reduce:transition-none"
                title={`${buyerName} 연락처 열기`}
                onClick={(event) => event.stopPropagation()}
              >
                <span
                  aria-hidden="true"
                  className="flex size-5 shrink-0 select-none items-center justify-center rounded-full bg-info-soft text-[11px] font-medium leading-none text-info-strong"
                >
                  {buyer.contact?.name?.trim().slice(0, 1) || <User className="size-3" />}
                </span>
                <span className="truncate">{buyerName}</span>
              </Link>
            ) : (
              <span className="min-w-0 truncate">{buyerName}</span>
            )}
            {buyer?.urgency === 'urgent' && !isClosed && (
              <span
                className={cn(
                  'shrink-0 text-[11px] font-medium',
                  dim ? 'text-muted-foreground/70' : 'text-destructive',
                )}
              >
                {getStatusMeta('buyerUrgency', 'urgent').label}
              </span>
            )}
          </div>

          <div
            role="cell"
            className={cn('min-w-0 cursor-text select-text truncate tabular-nums', dim && 'text-muted-foreground')}
            title={buyerPhone ? formatPhoneNumber(buyerPhone) : undefined}
            onClick={(event) => event.stopPropagation()}
          >
            {buyerPhone ? (
              formatPhoneNumber(buyerPhone)
            ) : (
              <span className="text-muted-foreground/50">-</span>
            )}
          </div>

          <div role="cell" className="min-w-0 overflow-hidden">
            {buyer?.transactionType ? (
              dim ? (
                <span className="text-muted-foreground">
                  {getStatusMeta('transactionType', buyer.transactionType).label}
                </span>
              ) : (
                <StatusBadge
                  kind="transactionType"
                  status={buyer.transactionType}
                  size="sm"
                  className="h-5 rounded-[4px] py-0 text-[14px] font-[450] leading-5"
                />
              )
            ) : (
              <span className="text-muted-foreground/50">-</span>
            )}
          </div>

          <div
            role="cell"
            className={cn(
              'min-w-0 tabular-nums',
              dim ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {/* 칸이 좁으면 판정 글자가 먼저 줄고, 그래도 넘치면 예산도 말줄임한다.
                어느 쪽도 옆 열로 넘어가지 않는다. */}
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="min-w-0 truncate" title={formatBuyerBudget(buyer)}>
                {formatBuyerBudget(buyer)}
              </span>
              {fit && (
                <span
                  className={cn(
                    'min-w-0 shrink-[999] truncate text-[12px]',
                    !dim && fit.over
                      ? 'text-destructive'
                      : 'text-muted-foreground',
                  )}
                  title={fit.label}
                >
                  {fit.label}
                </span>
              )}
            </div>
          </div>

          <div
            role="cell"
            className={cn(
              'min-w-0 truncate tabular-nums',
              dim ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {area ?? <span className="text-muted-foreground/50">-</span>}
          </div>

          <div role="cell" className="min-w-0 !px-0" onClick={(event) => event.stopPropagation()}>
            <StageMenu match={match} dim={dim} actions={actions} />
          </div>

          {/* 편집기가 칸 전체를 덮도록 칸 여백은 버튼 안으로 옮긴다 */}
          <div
            role="cell"
            className="min-w-0 !px-0"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            <MatchMemoCell
              match={match}
              buyerName={buyerName}
              isSaving={isSavingMemo}
              dim={dim}
              onSave={onSaveMemo}
            />
          </div>

          <div role="cell" className={cn('truncate', dim && 'text-muted-foreground')}>
            {buyer?.assignedTo?.name ?? ''}
          </div>
        </div>
      </div>

      {isOpen && (
        <MatchDetail
          match={match}
          history={history}
          fit={fit}
          days={days}
          actions={actions}
        />
      )}
    </>
  );
}

// ── 단계 알약 + 변경 메뉴 ───────────────────────────────────────────────────

const STAGE_PICKER_GROUPS = [
  {
    label: '검토',
    stages: [MatchStage.SUGGESTED, MatchStage.BUYER_INTERESTED],
  },
  {
    label: '진행',
    stages: [
      MatchStage.VIEWING_CONFIRMED,
      MatchStage.VIEWING,
      MatchStage.NEGOTIATING,
    ],
  },
  { label: '결과', stages: [MatchStage.DEAL_CREATED, MatchStage.CLOSED] },
];

function MatchStageChip({
  stage,
  dim = false,
}: {
  stage: string;
  dim?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-0 shrink-0 items-center gap-[5px] rounded-full pl-[7px] pr-[9px] text-[14px] font-[450] leading-5',
        dim
          ? 'bg-neutral-soft text-muted-foreground'
          : getMatchStageHeaderClass(stage),
      )}
    >
      <span
        className={cn(
          'size-2 shrink-0 rounded-full',
          dim ? 'bg-muted-foreground/40' : getMatchStageDotClass(stage),
        )}
      />
      <span className="truncate">{getMatchStageLabel(stage)}</span>
    </span>
  );
}

function StageMenu({
  match,
  dim,
  actions,
}: {
  match: Match;
  dim: boolean;
  actions: PanelActions;
}) {
  const [open, setOpen] = useState(false);
  const [highlightedStage, setHighlightedStage] = useState('');
  const [triggerHeight, setTriggerHeight] = useState(36);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const skipRestoreFocus = useRef(false);
  const stage = normalizeMatchStage(match.stage);
  const isClosed = stage === MatchStage.CLOSED;
  const stageIndex = getStageIndex(stage);
  const busy = actions.isUpdating || actions.isScheduling;
  const resumeStage = match.closedFromStage
    ? normalizeMatchStage(match.closedFromStage)
    : MatchStage.SUGGESTED;
  const groups = isClosed
    ? [
        { label: '다시 진행', stages: [resumeStage] },
        { label: '종료', stages: [MatchStage.CLOSED] },
      ]
    : STAGE_PICKER_GROUPS;
  const blockedReason =
    highlightedStage && highlightedStage !== stage
      ? getMatchStageBlockReason(match, highlightedStage)
      : null;

  const changeOpen = (nextOpen: boolean) => {
    if (nextOpen && busy) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setTriggerHeight(
        triggerRef.current?.getBoundingClientRect().height ?? 36,
      );
      setHighlightedStage(stage);
    }
  };
  const selectStage = (candidate: string) => {
    if (busy) return;
    if (candidate !== stage && getMatchStageBlockReason(match, candidate)) {
      setHighlightedStage(candidate);
      return;
    }
    // Closing a picker on its current value must not create an activity entry.
    // Conversion opens its existing dialog, which should own focus afterward.
    skipRestoreFocus.current =
      candidate !== stage && candidate === MatchStage.DEAL_CREATED;
    setOpen(false);
    if (candidate !== stage) actions.onStageChange(match.id, candidate);
  };

  return (
    <DropdownMenu open={open} onOpenChange={changeOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          disabled={busy}
          aria-label={`단계 ${getMatchStageLabel(stage)} · 변경`}
          onPointerDown={(event) => {
            // The menu overlaps this cell. Open on click so the opening
            // pointer release cannot select the item underneath it.
            if (event.button === 0 && !event.ctrlKey) event.preventDefault();
          }}
          onClick={() => changeOpen(!open)}
          className="flex h-full min-h-9 w-full min-w-0 items-center gap-1.5 px-2.5 text-left text-[14px] font-[450] leading-[21px] outline-none hover:bg-foreground/[0.035] focus-visible:shadow-[inset_0_0_0_2px_#2383e2] data-[state=open]:bg-primary/[0.04] data-[state=open]:shadow-[inset_0_0_0_2px_#2383e2] disabled:cursor-wait"
        >
          <span data-property-match-stage-chip className="inline-flex min-w-0">
            <MatchStageChip stage={stage} dim={dim} />
          </span>
          {!isClosed && stageIndex >= 0 && (
            <span
              className="shrink-0 text-[12px] tabular-nums text-muted-foreground"
              aria-label={`${buyerProgressStages.length}단계 중 ${stageIndex + 1}단계`}
            >
              {stageIndex + 1}/{buyerProgressStages.length}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        data-property-match-stage-picker
        aria-label="매칭 단계 선택"
        side="bottom"
        align="start"
        alignOffset={-1}
        sideOffset={-triggerHeight - 1}
        collisionPadding={8}
        loop
        className="w-60 overflow-hidden rounded-[6px] border-0 p-0 shadow-[0_20px_24px_rgba(25,25,25,0.05),0_5px_8px_rgba(25,25,25,0.027),0_0_0_1px_rgba(42,28,0,0.07)] data-[state=open]:animate-none data-[state=closed]:animate-none"
        onCloseAutoFocus={(event) => {
          if (skipRestoreFocus.current) event.preventDefault();
          skipRestoreFocus.current = false;
        }}
        onKeyDown={(event) => event.stopPropagation()}
        onKeyDownCapture={(event) => {
          if (
            event.key === 'Enter' &&
            (event.nativeEvent.isComposing || event.keyCode === 229)
          ) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <div className="max-h-[min(360px,calc(var(--radix-dropdown-menu-content-available-height)-64px))] overflow-y-auto scroll-py-1 py-1">
          {groups.map((group, index) => (
            <DropdownMenuGroup
              key={group.label}
              className={cn('p-1', index > 0 && 'border-t border-border')}
            >
              <DropdownMenuLabel className="px-2 py-1 text-[12px] font-medium text-muted-foreground">
                {group.label}
              </DropdownMenuLabel>
              {group.stages.map((candidate) => {
                const current = candidate === stage;
                const blockReason = current
                  ? null
                  : getMatchStageBlockReason(match, candidate);
                return (
                  <DropdownMenuItem
                    key={candidate}
                    textValue={getMatchStageLabel(candidate)}
                    aria-label={`${getMatchStageLabel(candidate)}${current ? ', 현재 단계' : blockReason ? ', 선택 불가' : ''}`}
                    aria-description={blockReason ?? undefined}
                    disabled={busy}
                    data-unavailable={Boolean(blockReason)}
                    title={blockReason ?? undefined}
                    onFocus={() => setHighlightedStage(candidate)}
                    onSelect={(event) => {
                      if (busy || blockReason) event.preventDefault();
                      selectStage(candidate);
                    }}
                    className="h-7 gap-2 rounded-[6px] px-2 py-1 text-[14px] font-[450] focus:bg-foreground/[0.055]"
                  >
                    <span
                      className={cn('inline-flex', blockReason && 'opacity-45')}
                    >
                      <MatchStageChip stage={candidate} />
                    </span>
                    {current && (
                      <Check
                        aria-hidden="true"
                        className="ml-auto size-3.5 text-muted-foreground"
                      />
                    )}
                    {blockReason && (
                      <CircleAlert
                        aria-hidden="true"
                        className="ml-auto size-3.5 text-muted-foreground/60"
                      />
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
          ))}
        </div>
        {blockedReason && (
          <div
            role="status"
            className="border-t border-border px-3 py-2 text-[12px] leading-[18px] text-muted-foreground"
          >
            {blockedReason}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── 줄에서 바로 고치는 메모 ─────────────────────────────────────────────────
// 매물 표의 의뢰 메모와 같은 편집기(EditableCell)를 쓴다: 누르면 칸 위에
// 떠오르는 입력 상자, Enter 저장 · Shift+Enter 줄바꿈 · Esc 취소 · 바깥 클릭 저장.

function MatchMemoCell({
  match,
  buyerName,
  isSaving,
  dim,
  onSave,
}: {
  match: Match;
  buyerName: string;
  isSaving: boolean;
  dim: boolean;
  onSave: (memo: string | null) => Promise<void>;
}) {
  const memo = match.memo?.trim() ?? '';

  return (
    // This nested table has its own controls; Escape should return to this
    // memo trigger rather than the parent property's spreadsheet selection.
    <CellTableNavigationProvider value={null}>
      <EditableCell
        recordId={match.id}
        field="matchMemo"
        value={match.memo ?? ''}
        onSave={async (_recordId, _field, newValue) => {
          const next = String(newValue ?? '').trim();
          if (next === memo) return;
          await onSave(next || null);
        }}
        editType="text"
        ariaLabel={`${buyerName} 매칭 메모`}
        multiline
        commitOnBlur
        activation="click"
        portalAnchor="self"
        editorChrome="floating"
        hoverHighlight={false}
        className="min-h-9 rounded-none px-2.5 py-[7.5px] text-[14px] font-[450] leading-[21px] focus-visible:ring-inset focus-visible:ring-offset-0"
      >
        <span
          data-property-match-memo
          className={cn(
            'line-clamp-2 min-w-0 w-full whitespace-normal break-words',
            memo
              ? dim ? 'text-muted-foreground' : 'text-foreground'
              : 'text-transparent group-hover/row:text-muted-foreground group-focus-within/row:text-muted-foreground',
          )}
        >
          {isSaving ? '저장 중…' : memo || '메모 추가'}
        </span>
      </EditableCell>
    </CellTableNavigationProvider>
  );
}

// ── 줄 아래 펼침: 화살표 경로 + 다음 작업 ───────────────────────────────────

const CHEVRON_FIRST =
  'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)';
const CHEVRON_MIDDLE =
  'polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)';
const CHEVRON_LAST = 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 10px 50%)';

function PathStep({
  label,
  sub,
  position,
  className,
  title,
  current,
  onClick,
}: {
  label: string;
  sub: string;
  position: 'first' | 'middle' | 'last';
  className: string;
  title?: string;
  current?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="max-w-full truncate">{label}</span>
      <span className="min-h-[13px] whitespace-nowrap text-[11px] font-normal tabular-nums opacity-80">
        {sub}
      </span>
    </>
  );
  const stepClassName = cn(
    'flex h-11 min-w-0 flex-1 flex-col items-start justify-center gap-px text-left text-xs',
    position === 'first' ? 'rounded-l-[5px] pl-3 pr-3.5' : 'pl-[22px] pr-3.5',
    position === 'last' && 'rounded-r-[5px]',
    onClick && 'hover:brightness-95',
    className,
  );
  const style = {
    clipPath:
      position === 'first'
        ? CHEVRON_FIRST
        : position === 'last'
          ? CHEVRON_LAST
          : CHEVRON_MIDDLE,
  };

  return onClick ? (
    <button
      type="button"
      role="listitem"
      title={title}
      aria-current={current ? 'step' : undefined}
      className={stepClassName}
      style={style}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <div
      role="listitem"
      title={title}
      aria-current={current ? 'step' : undefined}
      className={stepClassName}
      style={style}
    >
      {content}
    </div>
  );
}

const positionOf = (index: number, length: number) =>
  index === 0 ? 'first' : index === length - 1 ? 'last' : 'middle';

function MatchStagePath({
  match,
  history,
  days,
  actions,
}: {
  match: Match;
  history: StageHistory | undefined;
  days: number | null;
  actions: PanelActions;
}) {
  const stage = normalizeMatchStage(match.stage);
  const isClosed = stage === MatchStage.CLOSED;
  const isConverted = stage === MatchStage.DEAL_CREATED;

  return (
    <div
      role="list"
      aria-label="매칭 진행 경로"
      className="flex max-w-[940px] gap-0.5"
    >
      {buyerProgressStages.map((candidate, index) => {
        const state = getProgressNodeState(match, candidate);
        const isCurrent = candidate === stage;
        const blockReason =
          isClosed || isCurrent
            ? null
            : getMatchStageBlockReason(match, candidate);
        const date = formatMonthDay(history?.enteredAt[candidate]);
        const sub =
          state === 'current' && !isConverted
            ? [date, formatElapsed(days)].filter(Boolean).join(' · ')
            : state === 'failed'
              ? [date, '여기서 종료'].filter(Boolean).join(' · ')
              : date;

        return (
          <PathStep
            key={candidate}
            label={getMatchStageLabel(candidate)}
            sub={sub}
            position={positionOf(index, buyerProgressStages.length)}
            current={isCurrent}
            title={
              blockReason ??
              (isClosed
                ? undefined
                : isCurrent
                  ? '현재 단계'
                  : state === 'completed'
                    ? '이 단계로 되돌리기'
                    : '이 단계로 이동')
            }
            className={cn(
              isCurrent
                ? cn('font-semibold', getMatchStageHeaderClass(candidate))
                : state === 'completed'
                  ? 'bg-foreground/[0.07] text-muted-foreground'
                  : state === 'failed'
                    ? 'bg-destructive-soft font-semibold text-destructive'
                    : 'bg-foreground/[0.035] text-muted-foreground/60',
              blockReason && 'cursor-not-allowed opacity-55',
            )}
            onClick={
              isClosed || isCurrent || actions.isUpdating || actions.isScheduling
                ? undefined
                : () => actions.onStageChange(match.id, candidate)
            }
          />
        );
      })}
    </div>
  );
}

function DealStagePath({
  deal,
  onOpen,
}: {
  deal: MatchDealLink;
  onOpen: () => void;
}) {
  const current = normalizeDealStage(deal.stage);
  // 거래 종료(closed)는 실제로 그 단계일 때만 보여준다.
  const stages = getDealProgressStages(deal.stage).filter(
    (candidate) => candidate !== DealStage.CLOSED || current === DealStage.CLOSED,
  );

  return (
    <div
      role="list"
      aria-label="거래 진행 경로"
      className="flex max-w-[600px] gap-0.5"
    >
      {stages.map((candidate, index) => {
        const state = getDealProgressNodeState(deal.stage, candidate);
        return (
          <PathStep
            key={candidate}
            label={getDealStageLabel(candidate)}
            sub=""
            position={positionOf(index, stages.length)}
            current={state === 'current'}
            title="거래관리에서 변경"
            className={
              state === 'current'
                ? 'bg-success-soft font-semibold text-success'
                : state === 'completed'
                  ? 'bg-foreground/[0.07] text-muted-foreground'
                  : 'bg-foreground/[0.035] text-muted-foreground/60'
            }
            onClick={onOpen}
          />
        );
      })}
    </div>
  );
}

function DetailLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1.5 mt-3.5 text-[11.5px] text-muted-foreground">
      {children}
    </div>
  );
}

function MatchDetail({
  match,
  history,
  fit,
  days,
  actions,
}: {
  match: Match;
  history: StageHistory | undefined;
  fit: { label: string; over: boolean } | null;
  days: number | null;
  actions: PanelActions;
}) {
  const navigate = useNavigate();
  const buyer = match.buyerRequirement;
  const stage = normalizeMatchStage(match.stage);
  const isClosed = stage === MatchStage.CLOSED;
  const isConverted = stage === MatchStage.DEAL_CREATED;
  const deal = getActiveDealLink(match);
  const nextStage = getNextMatchStage(stage);
  const actionCopy = getMatchStageActionCopy(stage);
  const blockReason =
    nextStage && !isConverted ? getMatchStageBlockReason(match, nextStage) : null;
  const upcomingViewing = getUpcomingViewingEvent(match);
  const canSchedule =
    stage === MatchStage.VIEWING_CONFIRMED || stage === MatchStage.VIEWING;
  const [viewingStart, setViewingStart] = useState(() =>
    toDateTimeLocalInputValue(
      upcomingViewing
        ? new Date(upcomingViewing.start)
        : getDefaultViewingStartDate(),
    ),
  );
  const [showHistory, setShowHistory] = useState(false);
  const disabled = actions.isUpdating || actions.isScheduling;
  const resumeStage = match.closedFromStage
    ? normalizeMatchStage(match.closedFromStage)
    : MatchStage.SUGGESTED;
  const closedReason = match.closedReason
    ? (MATCH_CLOSED_REASON_LABELS as Record<string, string>)[match.closedReason]
    : null;
  const area = formatBuyerArea(buyer);
  const openDeal = () => {
    if (deal) navigate({ to: '/deals', search: { dealId: deal.id } });
  };

  const title = isClosed
    ? `종료된 매칭입니다${closedReason ? ` · ${closedReason}` : ''}`
    : isConverted
      ? deal
        ? `거래관리에서 ${getDealStageLabel(deal.stage)} 단계를 진행 중입니다`
        : '연결된 거래가 없습니다'
      : (STAGE_GUIDE[stage]?.title ?? getMatchStageLabel(stage));

  return (
    <div
      id={`property-match-detail-${match.id}`}
      data-property-match-detail={match.id}
      className="border-b border-border pb-4 pl-[34px] pr-2.5 pt-2"
    >
      <MatchStagePath
        match={match}
        history={history}
        days={days}
        actions={actions}
      />

      <div className="mt-2 grid gap-x-14 lg:grid-cols-[minmax(300px,420px)_minmax(260px,1fr)]">
        <div className="min-w-0">
          <h4 className="mt-2 text-sm font-semibold text-foreground">{title}</h4>

          {blockReason && (
            <div
              role="alert"
              className="mt-2.5 flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-strong"
            >
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{blockReason}</span>
            </div>
          )}

          {isConverted && deal && (
            <>
              <DetailLabel>
                거래 진행{' '}
                <span className="text-muted-foreground/70">
                  · 여기서는 보기만 · 누르면 거래관리로 이동
                </span>
              </DetailLabel>
              <DealStagePath deal={deal} onOpen={openDeal} />
            </>
          )}

          {canSchedule && (
            <>
              <DetailLabel>
                방문 일정
                {upcomingViewing && (
                  <span className="text-muted-foreground/70">
                    {' '}
                    · 예정 {formatViewingEventTime(upcomingViewing)}
                  </span>
                )}
              </DetailLabel>
              <div className="flex items-center gap-2">
                <Input
                  type="datetime-local"
                  aria-label="방문 일시"
                  value={viewingStart}
                  disabled={disabled}
                  className="h-8 w-[220px] text-[13px]"
                  onChange={(event) => setViewingStart(event.target.value)}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 shadow-none"
                  disabled={disabled || !viewingStart}
                  onClick={() => actions.onScheduleViewing(match, viewingStart)}
                >
                  {upcomingViewing
                    ? '일정 변경'
                    : shouldMoveToViewingOnSchedule(stage)
                      ? '일정 잡고 임장으로'
                      : '일정 저장'}
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="min-w-0">
          <DetailLabel>고객 조건</DetailLabel>
          <dl className="grid grid-cols-[44px_1fr] gap-y-1 text-[12.5px] tabular-nums">
            {buyer?.transactionType && (
              <>
                <dt className="text-muted-foreground/70">거래</dt>
                <dd>
                  {getStatusMeta('transactionType', buyer.transactionType).label}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground/70">예산</dt>
            <dd>
              {formatBuyerBudget(buyer)}
              {fit && (
                <span className={cn(fit.over && 'text-destructive')}>
                  {' · '}
                  {fit.label}
                </span>
              )}
            </dd>
            {area && (
              <>
                <dt className="text-muted-foreground/70">면적</dt>
                <dd>{area}</dd>
              </>
            )}
            {buyer?.moveInDate && (
              <>
                <dt className="text-muted-foreground/70">입주</dt>
                <dd>{formatMonthDay(buyer.moveInDate)}</dd>
              </>
            )}
            {buyer?.memo?.trim() && (
              <>
                <dt className="text-muted-foreground/70">기타</dt>
                <dd className="whitespace-pre-wrap">{buyer.memo.trim()}</dd>
              </>
            )}
          </dl>

          {match.memo?.trim() && (
            <>
              <DetailLabel>매칭 메모</DetailLabel>
              <p className="whitespace-pre-wrap text-[12.5px] text-foreground">
                {match.memo.trim()}
              </p>
            </>
          )}

          {history && history.events.length > 0 && (
            <div className="mt-3.5 text-xs text-muted-foreground">
              <button
                type="button"
                aria-expanded={showHistory}
                className="-ml-1.5 inline-flex h-6 items-center gap-1 rounded px-1.5 hover:bg-foreground/[0.06] hover:text-foreground"
                onClick={() => setShowHistory((value) => !value)}
              >
                <ChevronRight
                  className={cn(
                    'size-3 transition-transform',
                    showHistory && 'rotate-90',
                  )}
                />
                전체 이력 {history.events.length}건
              </button>
              {showHistory && (
                <ul className="mt-1">
                  {history.events.map((event) => (
                    <li key={event.id} className="flex h-6 items-center gap-2.5">
                      <time className="w-12 shrink-0 tabular-nums text-muted-foreground/70">
                        {formatMonthDay(event.at)}
                      </time>
                      {event.text}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2.5">
        {!isClosed && !isConverted && (
          <button
            type="button"
            disabled={disabled}
            className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-destructive-soft hover:text-destructive disabled:opacity-50"
            onClick={() => actions.onStageChange(match.id, MatchStage.CLOSED)}
          >
            {actionCopy?.closeLabel ?? '매칭 종료'}
          </button>
        )}
        <span className="flex-1" />
        {isClosed ? (
          <Button
            type="button"
            size="sm"
            className="h-[30px]"
            disabled={disabled}
            onClick={() => actions.onStageChange(match.id, resumeStage)}
          >
            {getMatchStageLabel(resumeStage)}에서 다시 진행
          </Button>
        ) : isConverted ? (
          deal && (
            <Button type="button" size="sm" className="h-[30px]" onClick={openDeal}>
              거래관리 열기
              <ArrowRight className="size-3.5" />
            </Button>
          )
        ) : (
          nextStage && (
            <Button
              type="button"
              size="sm"
              className="h-[30px]"
              disabled={disabled || Boolean(blockReason)}
              onClick={() => actions.onStageChange(match.id, nextStage)}
            >
              {actionCopy?.progressLabel ??
                `다음: ${getMatchStageLabel(nextStage)}`}
              <ArrowRight className="size-3.5" />
            </Button>
          )
        )}
      </div>
    </div>
  );
}

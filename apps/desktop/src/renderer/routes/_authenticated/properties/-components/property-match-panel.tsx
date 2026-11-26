import {
  useCallback, useEffect, useId, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { invalidateMatchData } from '@/queries/matches';
import { toast } from 'sonner';
import {
  AlignLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  CircleAlert,
  CircleDashed,
  GitBranch,
  Loader2,
  Megaphone,
  MessageSquare,
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
  UpdateMatchAgreedTermsDto,
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
import { PropertyPanelSelectionCheckbox as MatchSelectionCheckbox } from './property-panel-selection-checkbox';
import { Input } from '@/components/ui/input';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ContactNameChip, StatusBadge } from '@/components/domain';
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
  formatMatchPrice,
  formatViewingEventTime,
  getActiveDealLink,
  getDealProgressNodeState,
  getDealProgressStages,
  getDealStageLabel,
  getElapsedDays,
  getMatchStageActionCopy,
  getMatchStageBlockReason,
  getMatchStageDotClass,
  getMatchStageHeaderClass,
  getMatchStageLabel,
  getMatchTitle,
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
  formatDateOnly,
  toDateInputValue,
} from './property-match-format';
import { formatManwonEcho, parseManwon } from '@/lib/manwon';
import { formatPrice } from '@estate-erp/shared';
import { formatDateTime, formatMoney } from '@/lib/format';
import { PropertyMatchConnectDialog } from './property-match-connect-dialog';
import {
  MatchTableColumnHeader, MatchTableSortControl,
} from './property-match-table-controls';
import {
  getMatchTableLayout, matchTableColumns, sortMatchGroups,
  type MatchColumnWidths, type MatchTableSort,
} from './property-match-table-state';
import { useMatchTablePreferences } from './use-match-table-preferences';
import { useAdTablePreferences } from './use-ad-table-preferences';
import { AdTableSortControl } from './property-ad-table-controls';
import { PropertyAdActions } from './property-ad-actions';
import { getAdTableLayout, type AdColumnWidths, type AdTableControls, type AdTableSort } from './property-ad-table-state';
import {
  createInitialPublishDraft,
  setPropertyAdDraftAmount,
  togglePropertyAdDraftFlag,
  type PropertyAdPanelMode,
  type PropertyAdPublishDraft,
  type PropertyAdRequestDrafts,
} from './property-ad-request-drafts';
import { propertyErrorMessage } from '../-error-message';

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
  /** 이 매칭의 활동 로그를 빠짐없이 받았는지. 받았을 때만 "날짜가 없는 지난 단계 = 건너뜀"으로 읽는다. */
  complete: boolean;
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
    complete,
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
    title: '고객의 임장 의사를 확인하세요',
  },
  [MatchStage.VIEWING_CONFIRMED]: {
    next: '집주인 확인',
    title: '소유자와 임장 일정을 조율하세요',
  },
  [MatchStage.VIEWING]: {
    next: '임장 진행',
    title: '임장을 마쳤으면 임장 완료로 넘기세요',
  },
  [MatchStage.BUYER_REVIEWING]: {
    next: '고객 반응 확인',
    title: '고객이 본 집들을 놓고 검토 중입니다. 반응을 확인하세요',
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
  /** 협상 중 합의 조건 저장. 보낸 칸만 바뀐다. */
  onSaveAgreedTerms: (match: Match, terms: UpdateMatchAgreedTermsDto) => void;
  /** 저장이 실패할 때마다 바뀐다 — 입력칸을 서버 값으로 다시 그리는 데 쓴다 */
  agreedTermsResetKey: number;
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
  onHeightChange?: (groupId: string, height: number, tab: 'match' | 'ad') => void;
  /** '광고' 탭 내용 (index.tsx가 소유) */
  adPanel: (controls: AdTableControls) => ReactNode;
}) {
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [convertMatchId, setConvertMatchId] = useState<string | null>(null);
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);
  const [selectedMatchIds, setSelectedMatchIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedAdIds, setSelectedAdIds] = useState<Set<string>>(() => new Set());
  const [adMode, setAdMode] = useState<PropertyAdPanelMode>(null);
  const [adRequestDrafts, setAdRequestDrafts] = useState<PropertyAdRequestDrafts>({});
  const [adPublishDrafts, setAdPublishDrafts] = useState<PropertyAdPublishDraft[]>([]);
  const [manualAdOpen, setManualAdOpen] = useState(false);
  const visibleAdIds = useMemo(() => group.listings.flatMap(
    listing => (listing.activeAdvertisements ?? []).map(ad => ad.id),
  ), [group.listings]);
  useEffect(() => {
    const visibleIds = new Set(activeTab === 'ad' ? visibleAdIds : []);
    setSelectedAdIds(current => {
      const next = new Set([...current].filter(id => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
    if (activeTab !== 'ad') {
      setAdMode(null);
      setAdRequestDrafts({});
      setAdPublishDrafts([]);
      setManualAdOpen(false);
    }
  }, [activeTab, visibleAdIds]);
  const [showClosed, setShowClosed] = useState(false);
  const { user } = useAuth();
  const { preferences, updatePreferences } = useMatchTablePreferences(
    user?.office?.id ?? 'local', user?.id ?? 'guest',
  );
  const [previewWidths, setPreviewWidths] = useState<MatchColumnWidths | null>(null);
  const layout = getMatchTableLayout(previewWidths ?? preferences.widths);
  const setSort = (sort: MatchTableSort) =>
    updatePreferences((current) => ({ ...current, sort }));
  const { preferences: adPreferences, updatePreferences: updateAdPreferences } = useAdTablePreferences(
    user?.office?.id ?? 'local', user?.id ?? 'guest',
  );
  const [adPreviewWidths, setAdPreviewWidths] = useState<AdColumnWidths | null>(null);
  const adLayout = getAdTableLayout(adPreviewWidths ?? adPreferences.widths);
  const setAdSort = (sort: AdTableSort) => updateAdPreferences(current => ({ ...current, sort }));
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
    // 연결 구매고객 탭과 광고 탭(인라인 요청·신규 게재 추가 포함) 모두 실측 높이를 보고한다.
    if (!element || !onHeightChange) return;
    const report = () =>
      onHeightChange(group.id, Math.ceil(element.getBoundingClientRect().height), activeTab);
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
      invalidateMatchData(queryClient);
      queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
    },
    onError: (error: Error) => {
      toast.error(propertyErrorMessage(error, '매칭 단계를 바꾸지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  const memoMutation = useMutation({
    mutationFn: ({ match, memo }: { match: Match; memo: string | null }) =>
      api.matches.updateMemo(match.id, {
        memo,
        expectedUpdatedAt: match.updatedAt,
      }),
    onSuccess: () => {
      invalidateMatchData(queryClient);
      toast.success('매칭 메모를 저장했습니다.');
    },
    onError: (error: Error) => {
      toast.error(propertyErrorMessage(error, '매칭 메모를 저장하지 못했습니다. 다시 시도해 주세요.'));
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
      invalidateMatchData(queryClient);
      queryClient.invalidateQueries({ queryKey: ['calendar-events'] });
      toast.success('임장 일정을 저장했습니다.');
    },
    onError: (error: Error) => {
      toast.error(propertyErrorMessage(error, '임장 일정을 저장하지 못했습니다. 다시 시도해 주세요.'));
    },
  });

  const [agreedTermsResetKey, setAgreedTermsResetKey] = useState(0);
  const agreedTermsMutation = useMutation({
    mutationFn: ({ match, terms }: { match: Match; terms: UpdateMatchAgreedTermsDto }) =>
      api.matches.updateAgreedTerms(match.id, terms),
    onSuccess: () => {
      invalidateMatchData(queryClient);
    },
    onError: (error: Error) => {
      toast.error(propertyErrorMessage(error, '합의 조건을 저장하지 못했습니다. 다시 시도해 주세요.'));
      // 저장되지 않은 값이 저장된 것처럼 입력칸에 남지 않도록, 서버 값을 다시 받고 입력칸을 새로 그린다.
      setAgreedTermsResetKey((key) => key + 1);
      invalidateMatchData(queryClient);
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
    onSaveAgreedTerms: (match, terms) => agreedTermsMutation.mutate({ match, terms }),
    agreedTermsResetKey,
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

  /**
   * 쓰는 중인 매칭 메모와 그 저장. 펼친 카드가 아니라 패널이 맡는다.
   * - 저장에 실패한 뒤 카드를 접거나 다른 고객을 펼쳐도 쓴 글이 남고, 다시 펼치면 입력칸이 그 글로 열린다.
   * - 저장하는 동안 카드를 접었다 펼쳐 글을 더 고쳐도, 먼저 보낸 저장이 끝나면서 새 글을 지우지 않는다
   *   (카드가 저장을 맡으면 접힌 카드는 "그 뒤에 고쳤는지"를 알 수 없다).
   */
  const [memoDrafts, setMemoDrafts] = useState<Record<string, string>>({});
  // 저장이 끝났을 때 "지금 글"과 견주려고 가장 새 값을 바로 읽을 수 있게 둔다
  const memoDraftsRef = useRef(memoDrafts);
  const savingMemoIdsRef = useRef(new Set<string>());
  const setMemoDraft = useCallback((matchId: string, draft: string | null) => {
    const current = memoDraftsRef.current;
    if (draft === null ? !(matchId in current) : current[matchId] === draft) return;
    const next = { ...current };
    if (draft === null) delete next[matchId];
    else next[matchId] = draft;
    memoDraftsRef.current = next;
    setMemoDrafts(next);
  }, []);
  const saveMemo = memoMutation.mutateAsync;
  const commitMemoDraft = useCallback(
    async (match: Match) => {
      const draft = memoDraftsRef.current[match.id];
      // 같은 매칭의 저장이 나가 있으면 또 보내지 않는다. 글은 그대로 남아 끝난 뒤 다시 저장할 수 있다.
      if (draft === undefined || savingMemoIdsRef.current.has(match.id)) return;
      const next = draft.trim();
      if (next === (match.memo?.trim() ?? '')) {
        setMemoDraft(match.id, null);
        return;
      }
      savingMemoIdsRef.current.add(match.id);
      try {
        await saveMemo({ match, memo: next || null });
        // 보낸 뒤 더 고쳤으면 그 글을 남긴다
        if (memoDraftsRef.current[match.id] === draft) setMemoDraft(match.id, null);
      } catch {
        // 알림은 저장 쪽이 띄운다. 글은 그대로 둔다.
      } finally {
        savingMemoIdsRef.current.delete(match.id);
      }
    },
    [saveMemo, setMemoDraft],
  );

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
      onCommitMemo={() => void commitMemoDraft(match)}
      memoDraft={memoDrafts[match.id] ?? null}
      onMemoDraftChange={(draft) => setMemoDraft(match.id, draft)}
    />
  );

  return (
    <div
      ref={rootRef}
      data-property-match-panel
      id={`property-expand-panel-${group.id}`}
      role="region"
      aria-label={`${group.property?.site?.name ?? '매물'} 연결 고객`}
      className="border-b border-border bg-background py-3 pl-6 pr-4"
    >
      <div className="overflow-x-auto" style={activeTab === 'ad' ? {
        '--cell-editor-font-size': '14px', '--cell-editor-line-height': '21px', '--cell-editor-font-weight': 450,
      } as CSSProperties : undefined}>
        {/* 선택 여백도 스크롤 안에 둬 잘림 없이 기존 데이터 열 위치를 유지한다. */}
        <div className="pl-9" style={activeTab === 'match' ? {
          '--match-table-columns': layout.gridTemplateColumns,
          minWidth: layout.minWidth,
          width: layout.width,
        } as CSSProperties : {
          '--ad-table-columns': adLayout.gridTemplateColumns,
          minWidth: adLayout.minWidth,
          width: adLayout.width,
        } as CSSProperties}>
          <div className="mb-1 flex h-7 items-center gap-1 text-[13px]">
            <PanelTab
              icon={<GitBranch />}
              label="연결 고객"
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
            {(activeTab === 'match' ? selectedMatchIds.size : selectedAdIds.size) > 0 && (
              <div className="ml-2 flex items-center gap-2 text-xs">
                <span role="status" className="text-foreground">
                  {activeTab === 'match' ? `${selectedMatchIds.size}명 선택됨` : `${selectedAdIds.size}개 선택됨`}
                </span>
                <button
                  type="button"
                  className="h-[26px] rounded-[5px] px-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => activeTab === 'match' ? setSelectedMatchIds(new Set()) : setSelectedAdIds(new Set())}
                >
                  선택 해제
                </button>
              </div>
            )}
            <span className="flex-1" />
            {activeTab === 'ad' && (
              <PropertyAdActions
                group={group}
                selectedIds={selectedAdIds}
                onClearSelection={() => setSelectedAdIds(new Set())}
                mode={adMode}
                isEditMode={adMode === 'edit'}
                onToggleEditMode={() => {
                  setAdMode((current) => (current === 'edit' ? null : 'edit'));
                  setAdRequestDrafts({});
                  setAdPublishDrafts([]);
                }}
                onToggleRequestMode={() => {
                  setManualAdOpen(false);
                  setAdMode('request');
                }}
                onCancelRequestMode={() => {
                  setAdMode(null);
                  setAdRequestDrafts({});
                  setAdPublishDrafts([]);
                }}
                requestDrafts={adRequestDrafts}
                publishDrafts={adPublishDrafts}
                onRequestSubmitted={() => {
                  setAdMode(null);
                  setAdRequestDrafts({});
                  setAdPublishDrafts([]);
                }}
                manualOpen={manualAdOpen}
                onManualOpenChange={setManualAdOpen}
              />
            )}
            {activeTab === 'match' && (
              <MatchTableSortControl
                sort={preferences.sort}
                onSort={setSort}
                onResetWidths={() => updatePreferences((current) => ({ ...current, widths: {} }))}
              />
            )}
            {activeTab === 'ad' && (
              <AdTableSortControl
                sort={adPreferences.sort}
                onSort={setAdSort}
                onResetWidths={() => updateAdPreferences(current => ({ ...current, widths: {} }))}
              />
            )}
          </div>

          {activeTab === 'ad' ? (
            adPanel({
              preferences: adPreferences,
              selection: {
                selectedIds: selectedAdIds,
                onChange: (id, selected) => setSelectedAdIds(current => {
                  const next = new Set(current);
                  if (selected) next.add(id);
                  else next.delete(id);
                  return next;
                }),
                onSelectAll: selected => setSelectedAdIds(new Set(selected ? visibleAdIds : [])),
              },
              mode: adMode,
              editMode: adMode === 'edit',
              requestDrafts: adRequestDrafts,
              publishDrafts: adPublishDrafts,
              onChangeRequestAmount: (listing, ad, field, value) =>
                setAdRequestDrafts((current) =>
                  setPropertyAdDraftAmount(current, listing, ad, field, value),
                ),
              onToggleRequestFlag: (advertisementId, flag) =>
                setAdRequestDrafts((current) =>
                  togglePropertyAdDraftFlag(current, advertisementId, flag),
                ),
              onClearRequestFlag: (advertisementId) =>
                setAdRequestDrafts((current) => {
                  const existing = current[advertisementId];
                  if (!existing || (!existing.readvertise && !existing.takedown)) {
                    return current;
                  }
                  const next = { ...existing };
                  delete next.readvertise;
                  delete next.takedown;
                  const updated = { ...current };
                  if (
                    next.primary === undefined &&
                    next.monthlyRent === undefined
                  ) {
                    delete updated[advertisementId];
                  } else {
                    updated[advertisementId] = next;
                  }
                  return updated;
                }),
              onUpdatePublishDraft: (tempId, patch) =>
                setAdPublishDrafts((current) =>
                  current.map((item) =>
                    item.tempId === tempId ? { ...item, ...patch } : item,
                  ),
                ),
              onRemovePublishDraft: (tempId) =>
                setAdPublishDrafts((current) =>
                  current.filter((item) => item.tempId !== tempId),
                ),
              onAddManualAd: () => {
                if (adMode === 'request') {
                  setAdPublishDrafts((current) => [
                    ...current,
                    createInitialPublishDraft(group.listings, current),
                  ]);
                } else if (adMode === 'edit') {
                  setManualAdOpen(true);
                } else {
                  toast.info("수동으로 광고 기록을 추가·수정하려면 '기록 수정·추가' 모드를 켜 주세요. 에이전트에게 실제 광고 작업을 맡기려면 '광고 요청'을 이용해 주세요.");
                }
              },
              onSort: setAdSort,
              onPreviewResize: setAdPreviewWidths,
              onCommitResize: widths => updateAdPreferences(current => ({ ...current, widths })),
              onResetWidth: id => updateAdPreferences(current => {
                const widths = { ...current.widths };
                delete widths[id];
                return { ...current, widths };
              }),
            })
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
  onCommitMemo,
  memoDraft,
  onMemoDraftChange,
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
  /** 쓰는 중인 매칭 메모를 저장한다 */
  onCommitMemo: () => void;
  /** 쓰는 중인 매칭 메모. 없으면 null */
  memoDraft: string | null;
  onMemoDraftChange: (draft: string | null) => void;
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

          <div role="cell" className="min-w-0 py-[7.5px]">
            <BuyerMemoCell match={match} dim={dim} />
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
          isSavingMemo={isSavingMemo}
          onCommitMemo={onCommitMemo}
          memoDraft={memoDraft}
          onMemoDraftChange={onMemoDraftChange}
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
      MatchStage.BUYER_REVIEWING,
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

// ── 줄의 고객 메모 ──────────────────────────────────────────────────────────
// 줄을 훑으며 알고 싶은 것은 "이 고객이 무엇을 원하는 사람인가"다. 그래서 줄에는 고객 조건의
// 메모를 보여 준다. 이 메모는 그 고객의 모든 매칭과 희망매물 화면이 함께 쓰므로 여기서 고치지 않는다
// (한 집의 표에서 고친 글이 다른 곳까지 바뀌지 않게). 이 매칭만의 메모는 펼친 "진행" 카드에서 고친다.

function BuyerMemoCell({ match, dim }: { match: Match; dim: boolean }) {
  const memo = match.buyerRequirement?.memo?.trim() ?? '';
  if (!memo) return null;
  return (
    <span
      data-property-match-buyer-memo
      title={memo}
      className={cn(
        'line-clamp-2 min-w-0 whitespace-normal break-words text-[14px] font-[450] leading-[21px]',
        dim ? 'text-muted-foreground' : 'text-foreground',
      )}
    >
      {memo}
    </span>
  );
}

// ── 펼친 카드의 매칭 메모 (눌러서 고치기) ───────────────────────────────────
// Enter 저장 · Shift+Enter 줄바꿈 · Esc 취소 · 바깥을 누르면 저장.
// 저장에 실패하면 입력을 닫지 않는다(쓴 글을 잃지 않고 다시 저장할 수 있게).

function MatchMemoField({
  match,
  isSaving,
  onCommit,
  draft,
  onDraftChange,
}: {
  match: Match;
  isSaving: boolean;
  /** 지금 글을 저장한다. 저장과 "보낸 뒤 더 고쳤는지" 확인은 패널이 한다 */
  onCommit: () => void;
  /** 쓰는 중인 글. 패널이 들고 있어 카드를 접어도 남는다. null이면 입력칸이 닫혀 있다 */
  draft: string | null;
  onDraftChange: (draft: string | null) => void;
}) {
  const saved = match.memo?.trim() ?? '';
  const setDraft = onDraftChange;
  const commit = onCommit;
  const buyerName = match.buyerRequirement?.contact?.name ?? '구매자';

  if (draft === null) {
    return (
      <button
        type="button"
        data-property-match-memo
        aria-label={`${buyerName} 매칭 메모${saved ? '' : ' 추가'}`}
        onClick={() => setDraft(saved)}
        className="-mx-1.5 -my-1 block w-[calc(100%+12px)] rounded-md px-1.5 py-1 text-left text-sm transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {saved ? (
          <span className="whitespace-pre-wrap break-words">{saved}</span>
        ) : (
          <EmptyValue />
        )}
      </button>
    );
  }

  return (
    <textarea
      autoFocus
      rows={Math.min(6, Math.max(2, draft.split('\n').length))}
      value={draft}
      aria-label={`${buyerName} 매칭 메모`}
      aria-busy={isSaving}
      placeholder="이 집에 대한 이 고객의 반응, 약속한 것"
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        // 한글을 조합하는 중의 Enter는 글자를 확정하는 키다
        if (event.nativeEvent.isComposing) return;
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          setDraft(null);
        }
      }}
      className="-mx-1.5 -my-1 block w-[calc(100%+12px)] resize-none rounded-md border-0 bg-white px-1.5 py-1 text-sm leading-[21px] shadow-none outline-none ring-2 ring-ring/40 placeholder:text-muted-foreground/70"
    />
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
  done,
  onClick,
}: {
  label: string;
  sub: string;
  position: 'first' | 'middle' | 'last';
  className: string;
  title?: string;
  current?: boolean;
  /** 확정해서 끝낸 단계 — 이름 앞에 체크를 붙인다 */
  done?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="flex max-w-full items-center gap-1">
        {done && <Check className="size-3 shrink-0" strokeWidth={2.4} aria-hidden="true" />}
        <span className="truncate">{label}</span>
      </span>
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

/**
 * 단계 띠. 색이 뜻하는 것:
 * - 초록 + 체크: 확정해서 끝낸 단계 (지금 단계가 무엇이든 한 가지 색)
 * - 단계 색 + 굵은 글씨: 지금 단계. 들어왔을 뿐 아직 끝난 것이 아니다
 * - 회색: 아직 오지 않은 단계, 그리고 거치지 않고 건너뛴 단계("건너뜀")
 * 임장 없이 계약으로 가는 경우가 있어 띠를 눌러 어느 단계로든 옮길 수 있다.
 */
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
        // 지나온 자리인데 들어온 기록이 없으면 거치지 않고 건너뛴 단계다.
        // 로그를 다 받지 못했으면 판단하지 않는다(끝낸 단계로 둔다).
        const isSkipped =
          state === 'completed' &&
          Boolean(history?.complete) &&
          !history?.enteredAt[candidate];
        const sub = isSkipped
          ? '건너뜀'
          : state === 'current' && !isConverted
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
            done={state === 'completed' && !isSkipped}
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
                : isSkipped
                  ? 'bg-foreground/[0.035] text-muted-foreground'
                  : state === 'completed'
                    ? isClosed
                      ? 'bg-foreground/[0.07] text-muted-foreground'
                      : 'bg-success-soft/60 text-success'
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

// ── 펼친 영역의 카드 (Notion 카드: 흰 판 + 옅은 테두리, 안은 "아이콘 + 이름 | 값" 속성 줄) ──
// 왼쪽 "진행"과 오른쪽 "고객 조건"이 같은 틀을 쓴다. 문장으로 안내하지 않고 속성 줄로 보여 준다.

function DetailCard({
  label,
  head,
  children,
  footer,
}: {
  /** 화면 낭독기용 이름 */
  label: string;
  head: ReactNode;
  children: ReactNode;
  /** 선으로 나눈 아래 칸 */
  footer?: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="min-w-0 overflow-hidden rounded-[10px] bg-white shadow-[0_0_0_1px_rgba(42,28,0,0.09),0_2px_4px_rgba(25,25,25,0.04),0_10px_20px_-12px_rgba(25,25,25,0.12)]"
    >
      <div className="flex min-h-[42px] items-center gap-2 px-3.5 pb-1 pt-2.5 text-sm">
        {head}
      </div>
      <dl className="px-1.5 pb-2">{children}</dl>
      {footer && (
        <div className="border-t border-border bg-muted/50 px-1.5 py-1.5">{footer}</div>
      )}
    </section>
  );
}

function PropertyRow({
  icon,
  label,
  children,
  multiline,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-start rounded-md hover:bg-foreground/[0.03]">
      <dt className="flex min-h-8 items-center gap-2 px-2 text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-sidebar-icon">
        {icon}
        {label}
      </dt>
      <dd
        className={cn(
          'min-h-8 px-2 py-[5.5px] text-sm tabular-nums text-foreground',
          multiline
            ? 'whitespace-pre-wrap break-words'
            : 'flex flex-wrap items-center gap-1.5',
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** 값이 없는 속성 — Notion의 "비어 있음" */
function EmptyValue({ children = '비어 있음' }: { children?: ReactNode }) {
  return <span className="text-muted-foreground/70">{children}</span>;
}

/**
 * 속성 줄 안의 입력칸 — 평소에는 글처럼 보이고, 올리거나 고칠 때만 칸이 드러난다.
 * 테두리는 색이 아니라 두께로 없앤다(app.css의 전역 테두리 색 규칙이 색 클래스보다 앞선다).
 */
const quietInputClassName =
  'h-7 rounded-md border-0 bg-transparent px-1.5 text-sm tabular-nums shadow-none transition-colors hover:bg-foreground/[0.05] focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:ring-2 aria-invalid:ring-destructive/40';

/** 속성 값 자리의 누를 수 있는 글 (눌러서 고치기) */
const valueButtonClassName =
  '-mx-1.5 inline-flex h-7 items-center rounded-md px-1.5 text-sm tabular-nums transition-colors hover:bg-foreground/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50';

function BuyerConditionCard({
  match,
  fit,
}: {
  match: Match;
  fit: { label: string; over: boolean } | null;
}) {
  const buyer = match.buyerRequirement;
  const area = formatBuyerArea(buyer);
  const buyerMemo = buyer?.memo?.trim();

  return (
    <DetailCard
      label="고객 조건"
      head={
        <>
          {buyer?.contact?.id ? (
            <span className="-ml-1 flex min-w-0 font-semibold">
              <ContactNameChip contactId={buyer.contact.id} name={buyer.contact.name} />
            </span>
          ) : (
            <span className="font-semibold">{buyer?.contact?.name ?? '구매자 미상'}</span>
          )}
          <span className="shrink-0 text-xs text-muted-foreground">고객 조건</span>
        </>
      }
    >
      {buyer?.transactionType && (
        <PropertyRow icon={<Tag />} label="거래">
          <StatusBadge kind="transactionType" status={buyer.transactionType} size="sm" />
        </PropertyRow>
      )}
      <PropertyRow icon={<WonCircleIcon />} label="예산">
        {formatBuyerBudget(buyer)}
        {fit && (
          <span
            className={cn(
              'inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs',
              'before:size-2 before:rounded-full before:bg-current',
              fit.over
                ? 'bg-destructive-soft text-destructive-strong'
                : 'bg-success-soft text-success',
            )}
          >
            {fit.label}
          </span>
        )}
      </PropertyRow>
      {area && (
        <PropertyRow icon={<Ruler />} label="면적">
          {area}
        </PropertyRow>
      )}
      {buyer?.moveInDate && (
        <PropertyRow icon={<CalendarDays />} label="입주">
          {formatMonthDay(buyer.moveInDate)}
        </PropertyRow>
      )}
      {buyerMemo && (
        <PropertyRow icon={<AlignLeft />} label="고객 메모" multiline>
          {buyerMemo}
        </PropertyRow>
      )}
    </DetailCard>
  );
}

// ── 방문 일시 고르기 (달력 + 시간, 다른 화면의 날짜 칸과 같은 Popover) ───────

/** 30분 단위 시간 — 오전 7시부터 밤 10시까지 */
const VIEWING_TIME_OPTIONS = Array.from({ length: 31 }, (_, index) => {
  const minutes = 7 * 60 + index * 30;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
});

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * 값은 "YYYY-MM-DDTHH:mm"(이 PC의 시각) 또는 빈 글.
 * 날짜와 시간을 둘 다 골라 "적용"을 눌러야 값이 바뀐다 — 고르다 만 값이 저장되지 않게 한다.
 */
function ViewingTimePicker({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dateKey, setDateKey] = useState('');
  const [time, setTime] = useState('');
  const today = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return start;
  }, []);

  // 열 때마다 지금 값에서 시작한다(닫으며 버린 선택이 남지 않게)
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDateKey(value.slice(0, 10));
      setTime(value.slice(11, 16));
    }
    setOpen(next);
  };

  const selected = dateKey ? new Date(`${dateKey}T00:00`) : undefined;
  // 저장된 시각이 30분 단위가 아니어도 목록에서 고를 수 있게 넣어 둔다
  const timeOptions = time && !VIEWING_TIME_OPTIONS.includes(time)
    ? [...VIEWING_TIME_OPTIONS, time].sort()
    : VIEWING_TIME_OPTIONS;
  const picked = dateKey && time ? `${dateKey}T${time}` : '';
  // 오늘 날짜에서 이미 지난 시각은 고르지 못한다(지난 방문은 "예정된 방문"으로 잡히지 않는다)
  const isPast = picked !== '' && new Date(picked).getTime() < Date.now();

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={value ? `임장 일시 ${formatDateTime(value)}, 눌러서 변경` : '임장 일시 정하기'}
          className={valueButtonClassName}
        >
          {value ? formatDateTime(value) : <EmptyValue />}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          defaultMonth={selected ?? today}
          disabled={{ before: today }}
          onSelect={(date) => setDateKey(date ? toDateKey(date) : '')}
        />
        <div className="flex items-center gap-2 border-t border-border p-2">
          <Select value={time} onValueChange={setTime}>
            <SelectTrigger size="sm" aria-label="임장 시간" className="h-8 w-[108px] tabular-nums">
              <SelectValue placeholder="시간" />
            </SelectTrigger>
            <SelectContent className="max-h-64">
              {timeOptions.map((option) => (
                <SelectItem key={option} value={option} className="tabular-nums">
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" role={isPast ? 'alert' : undefined}>
            {isPast ? '지난 시각입니다' : !dateKey ? '날짜를 고르세요' : !time ? '시간을 고르세요' : ''}
          </span>
          <Button
            type="button"
            size="sm"
            className="h-8"
            disabled={!picked || isPast || picked === value}
            onClick={() => {
              onChange(picked);
              setOpen(false);
            }}
          >
            적용
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── 이 고객이 함께 보고 있는 다른 매물 (고객 검토 단계) ────────────────────

/** 고객이 실제로 보았거나 보러 갈 매물 — 임장부터 협상까지 */
const COMPARED_STAGES: string[] = [
  MatchStage.VIEWING,
  MatchStage.BUYER_REVIEWING,
  MatchStage.NEGOTIATING,
];

/**
 * 고객은 여러 집을 보고 고른다. 같은 희망조건으로 진행 중인 다른 매물을 보여 줘서
 * 중개사가 "이 고객이 지금 어떤 집들을 놓고 고민하는지"를 한 번에 보게 한다.
 */
function BuyerOtherMatches({ match }: { match: Match }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['matches', 'buyer-compared', match.buyerReqId],
    queryFn: () =>
      api.matches.findAll({
        buyerReqId: match.buyerReqId,
        stage: COMPARED_STAGES.join(','),
      }),
    staleTime: 30_000,
  });
  const others = (data ?? []).filter((other) => other.id !== match.id);

  if (isLoading) return <EmptyValue>불러오는 중…</EmptyValue>;
  if (isError) return <span role="alert" className="text-muted-foreground">불러오지 못했습니다</span>;
  if (others.length === 0) return <EmptyValue>이 매물만 보고 있습니다</EmptyValue>;

  return (
    <ul className="w-full">
      {others.map((other) => (
        <li key={other.id} className="flex min-h-7 items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{getMatchTitle(other)}</span>
          <span className="shrink-0 text-muted-foreground">{formatMatchPrice(other)}</span>
          <StatusBadge kind="matchStage" status={other.stage} size="sm" />
        </li>
      ))}
    </ul>
  );
}

// ── 합의 조건 (협상 단계에서 적어 둔다. 모두 선택) ─────────────────────────

/**
 * 금액 한 칸. 칸을 벗어나거나 Enter를 누르면 저장한다.
 * 읽을 수 없는 글은 저장하지 않고 그대로 남겨 고치게 한다(추측해서 숫자로 바꾸지 않는다).
 */
function AgreedAmountField({
  label,
  unit,
  saved,
  disabled,
  onSave,
  onValidityChange,
}: {
  label: string;
  /** 자리 표시 예시를 고르는 데만 쓴다. 읽는 규칙은 앱 공통(lib/manwon) 하나다 */
  unit: '억' | '만원';
  /** 서버에 저장된 값 (만원) */
  saved: number | null;
  disabled: boolean;
  onSave: (manwon: number | null) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  // "31억 5,000만"·"180만"처럼 보이는 그대로 적어 두고, 다시 읽어도 같은 값이 된다
  const toText = (manwon: number | null) => (manwon == null ? '' : manwon === 0 ? '0' : formatPrice(manwon));
  const readValue = (raw: string) => {
    const result = parseManwon(raw);
    return result.valid ? result.value : Number.NaN;
  };
  const [text, setText] = useState(() => toText(saved));
  const parsed = readValue(text);
  const invalid = Number.isNaN(parsed);
  const hintId = useId();

  // 서버 값이 바뀌면(저장 완료·다른 사람의 수정) 입력칸을 맞춘다. 저장 실패는 칸을 새로 그려서 되돌린다.
  // 다만 지금 고치고 있는 글이 같은 값을 뜻하면 그대로 둔다("31억5천"을 "31억 5,000만"으로 바꿔 치지 않는다).
  useEffect(() => {
    setText((current) => (readValue(current) === saved ? current : toText(saved)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);

  useEffect(() => {
    onValidityChange(!invalid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invalid]);

  const commit = () => {
    if (invalid || parsed === saved) return;
    onSave(parsed);
  };

  return (
    <PropertyRow icon={<WonCircleIcon />} label={label}>
      <span className="-mx-1.5 mr-1 inline-flex items-center gap-1">
        <Input
          autoComplete="off"
          placeholder={unit === '억' ? '예: 31억 5천' : '예: 5천, 180'}
          aria-label={`${label}(만원)`}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          value={text}
          disabled={disabled}
          className={cn(quietInputClassName, 'w-[120px] placeholder:text-muted-foreground/70')}
          onChange={(event) => setText(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) commit();
          }}
        />
      </span>
      {/* 읽은 값을 되비춘다 — "31억5천" → "= 31억 5,000만" */}
      <span
        id={hintId}
        role={invalid ? 'alert' : undefined}
        className={cn(
          'text-xs tabular-nums',
          invalid ? 'text-destructive-strong' : 'text-muted-foreground',
        )}
      >
        {invalid
          ? `금액을 읽을 수 없습니다 (예: ${unit === '억' ? '31억 5천' : '5천'})`
          : parsed != null && text.trim() !== toText(parsed)
            ? formatManwonEcho(parsed)
            : ''}
      </span>
    </PropertyRow>
  );
}

function AgreedTermsFields({
  match,
  disabled,
  onSave,
  onValidityChange,
}: {
  match: Match;
  disabled: boolean;
  onSave: (terms: UpdateMatchAgreedTermsDto) => void;
  /** 읽을 수 없는 금액이 남아 있으면 거래전환을 막기 위해 알린다 */
  onValidityChange: (valid: boolean) => void;
}) {
  const isMonthly = match.listing?.transactionType === 'monthly';
  const savedMoveIn = toDateInputValue(match.agreedMoveInDate);
  const [moveIn, setMoveIn] = useState(savedMoveIn);
  const [validity, setValidity] = useState({ first: true, second: true });

  useEffect(() => {
    setMoveIn(savedMoveIn);
  }, [savedMoveIn]);

  useEffect(() => {
    onValidityChange(validity.first && validity.second);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validity.first, validity.second]);

  return (
    <>
      {isMonthly ? (
        <>
          <AgreedAmountField
            label="합의 보증금"
            unit="만원"
            saved={match.agreedDeposit}
            disabled={disabled}
            onSave={(agreedDeposit) => onSave({ agreedDeposit })}
            onValidityChange={(valid) =>
              setValidity((current) => ({ ...current, first: valid }))
            }
          />
          <AgreedAmountField
            label="합의 월세"
            unit="만원"
            saved={match.agreedMonthlyRent}
            disabled={disabled}
            onSave={(agreedMonthlyRent) => onSave({ agreedMonthlyRent })}
            onValidityChange={(valid) =>
              setValidity((current) => ({ ...current, second: valid }))
            }
          />
        </>
      ) : (
        <AgreedAmountField
          label="합의 가격"
          unit="억"
          saved={match.agreedPrice}
          disabled={disabled}
          onSave={(agreedPrice) => onSave({ agreedPrice })}
          onValidityChange={(valid) =>
            setValidity((current) => ({ ...current, first: valid }))
          }
        />
      )}
      <PropertyRow icon={<CalendarDays />} label="합의 입주일">
        <Input
          type="date"
          aria-label="합의 입주일"
          value={moveIn}
          disabled={disabled}
          className={cn(
            quietInputClassName,
            '-mx-1.5 w-[150px]',
            !moveIn && 'text-muted-foreground/70',
          )}
          onChange={(event) => setMoveIn(event.target.value)}
          onBlur={() => {
            if (moveIn !== savedMoveIn) onSave({ agreedMoveInDate: moveIn || null });
          }}
        />
      </PropertyRow>
    </>
  );
}

/** 저장된 합의 조건을 한 줄로. 아무것도 없으면 빈 글 */
function formatAgreedTerms(match: Match) {
  const isMonthly = match.listing?.transactionType === 'monthly';
  const amount = isMonthly
    ? [
        match.agreedDeposit != null ? `보증금 ${formatMoney(match.agreedDeposit)}` : null,
        match.agreedMonthlyRent != null ? `월세 ${formatMoney(match.agreedMonthlyRent)}` : null,
      ]
    : [match.agreedPrice != null ? formatMoney(match.agreedPrice) : null];
  const moveIn = formatDateOnly(match.agreedMoveInDate);
  return [...amount, moveIn ? `입주 ${moveIn}` : null].filter(Boolean).join(' · ');
}

// ── 펼친 영역 ───────────────────────────────────────────────────────────────
// 단계 띠 아래에 카드 두 장: 왼쪽 "진행"(이 매칭에서 지금 다루는 것과 버튼), 오른쪽 "고객 조건".
// 안내는 문장이 아니라 "다음 할 일" 속성 한 줄로 둔다.

function MatchDetail({
  match,
  history,
  fit,
  days,
  actions,
  isSavingMemo,
  onCommitMemo,
  memoDraft,
  onMemoDraftChange,
}: {
  match: Match;
  history: StageHistory | undefined;
  fit: { label: string; over: boolean } | null;
  days: number | null;
  actions: PanelActions;
  isSavingMemo: boolean;
  onCommitMemo: () => void;
  memoDraft: string | null;
  onMemoDraftChange: (draft: string | null) => void;
}) {
  const navigate = useNavigate();
  const stage = normalizeMatchStage(match.stage);
  const isClosed = stage === MatchStage.CLOSED;
  const isConverted = stage === MatchStage.DEAL_CREATED;
  const deal = getActiveDealLink(match);
  const nextStage = getNextMatchStage(stage);
  const actionCopy = getMatchStageActionCopy(stage);
  const blockReason =
    nextStage && !isConverted ? getMatchStageBlockReason(match, nextStage) : null;
  const upcomingViewing = getUpcomingViewingEvent(match);
  // 방문 날짜는 임장 조율에서 한 번만 정한다(정하고 확정 = 임장으로).
  // 임장에서는 정해진 날짜를 글로 보여 주고, 눌렀을 때만 입력칸을 연다.
  const isArrangingViewing = stage === MatchStage.VIEWING_CONFIRMED;
  const isViewing = stage === MatchStage.VIEWING;
  const isReviewing = stage === MatchStage.BUYER_REVIEWING;
  // 정해진 방문이 없으면 비워 둔다. 고르지 않은 날짜를 미리 넣어 두면 그대로 확정될 수 있다.
  const savedViewingStart = () =>
    upcomingViewing ? toDateTimeLocalInputValue(new Date(upcomingViewing.start)) : '';
  const [viewingStart, setViewingStart] = useState(savedViewingStart);
  const [areTermsValid, setAreTermsValid] = useState(true);
  const disabled = actions.isUpdating || actions.isScheduling;
  const resumeStage = match.closedFromStage
    ? normalizeMatchStage(match.closedFromStage)
    : MatchStage.SUGGESTED;
  const closedReason = match.closedReason
    ? (MATCH_CLOSED_REASON_LABELS as Record<string, string>)[match.closedReason]
    : null;
  const agreedSummary = formatAgreedTerms(match);
  const elapsed = formatElapsed(days);
  const openDeal = () => {
    if (deal) navigate({ to: '/deals', search: { dealId: deal.id } });
  };

  // 단계가 바뀌면 고치던 방문 날짜는 버린다(저장하지 않은 값이 다른 단계의 입력칸에 남지 않게).
  useEffect(() => {
    setViewingStart(savedViewingStart());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, upcomingViewing?.id, upcomingViewing?.start]);

  // "다음 할 일" — 문장으로 지시하지 않고 할 일의 이름만 적는다
  const nextTask = isClosed
    ? null
    : isConverted
      ? deal
        ? `거래관리 · ${getDealStageLabel(deal.stage)}`
        : null
      : isViewing && upcomingViewing
        ? '임장 진행'
        : isViewing
          ? '임장 마무리'
          : (STAGE_GUIDE[stage]?.next ?? null);

  const footer = (
    <div className="flex flex-wrap items-center gap-1 px-1.5">
      {isClosed ? (
        <Button
          type="button"
          size="sm"
          className="h-7"
          disabled={disabled}
          onClick={() => actions.onStageChange(match.id, resumeStage)}
        >
          {getMatchStageLabel(resumeStage)}에서 다시 진행
        </Button>
      ) : isConverted ? (
        deal && (
          <Button type="button" size="sm" className="h-7" onClick={openDeal}>
            거래관리 열기
            <ArrowRight className="size-3.5" />
          </Button>
        )
      ) : isArrangingViewing ? (
        // 날짜를 정하는 것이 곧 이 단계의 확정이다 — 일정을 저장하면서 임장으로 넘어간다.
        // 방문 없이 가려면 단계 띠에서 뒤 단계를 누른다.
        <Button
          type="button"
          size="sm"
          className="h-7"
          disabled={disabled || !viewingStart || Boolean(blockReason)}
          title={!viewingStart ? '임장 일시를 먼저 정해 주세요' : undefined}
          onClick={() => actions.onScheduleViewing(match, viewingStart)}
        >
          <Check className="size-3.5" />
          {actionCopy?.confirmLabel ?? '임장 일정 확정'}
        </Button>
      ) : (
        nextStage && (
          <Button
            type="button"
            size="sm"
            className="h-7"
            disabled={
              disabled ||
              Boolean(blockReason) ||
              (stage === MatchStage.NEGOTIATING && !areTermsValid)
            }
            onClick={() => actions.onStageChange(match.id, nextStage)}
          >
            <Check className="size-3.5" />
            {actionCopy?.confirmLabel ?? `${getMatchStageLabel(stage)} 확정`}
          </Button>
        )
      )}
      {!isClosed && !isConverted && (
        <button
          type="button"
          disabled={disabled}
          className="h-7 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-destructive-soft hover:text-destructive-strong disabled:opacity-50"
          onClick={() => actions.onStageChange(match.id, MatchStage.CLOSED)}
        >
          {actionCopy?.closeLabel ?? '매칭 종료'}
        </button>
      )}
    </div>
  );

  return (
    <div
      id={`property-match-detail-${match.id}`}
      data-property-match-detail={match.id}
      className="border-b border-border pb-5 pl-[34px] pr-2.5 pt-2"
    >
      <MatchStagePath
        match={match}
        history={history}
        days={days}
        actions={actions}
      />

      <div className="mt-3.5 grid max-w-[940px] items-start gap-4 lg:grid-cols-2">
        <DetailCard
          label="진행"
          head={
            <>
              <span className="font-semibold">진행</span>
              <StatusBadge kind="matchStage" status={stage} size="sm" />
              {!isClosed && !isConverted && elapsed && (
                <span className="text-xs tabular-nums text-muted-foreground">{elapsed}</span>
              )}
            </>
          }
          footer={footer}
        >
          {nextTask && (
            <PropertyRow icon={<CircleDashed />} label="다음 할 일">
              {nextTask}
            </PropertyRow>
          )}

          {isClosed && (
            <PropertyRow icon={<CircleAlert />} label="종료 사유">
              {closedReason ?? <EmptyValue />}
            </PropertyRow>
          )}

          {isArrangingViewing && (
            <PropertyRow icon={<CalendarDays />} label="임장 일시">
              {/* 고른 값은 아래 "방문 일정 확정"을 누를 때 저장된다 */}
              <ViewingTimePicker
                value={viewingStart}
                disabled={disabled}
                onChange={setViewingStart}
              />
            </PropertyRow>
          )}

          {isViewing && (
            <PropertyRow icon={<CalendarDays />} label="임장 일시">
              {/* 임장 단계에서는 고르는 즉시 일정을 고친다.
                  보여 주는 값은 늘 저장된 일정이다 — 고른 값을 먼저 보여 주면 저장이 실패했을 때
                  저장된 것처럼 남고, 같은 값을 다시 고를 수 없어 재시도가 막힌다. */}
              <ViewingTimePicker
                value={savedViewingStart()}
                disabled={disabled}
                onChange={(next) => {
                  if (next) actions.onScheduleViewing(match, next);
                }}
              />
            </PropertyRow>
          )}

          {isReviewing && (
            <PropertyRow icon={<GitBranch />} label="다른 매물">
              <BuyerOtherMatches match={match} />
            </PropertyRow>
          )}

          {stage === MatchStage.NEGOTIATING && (
            <AgreedTermsFields
              key={actions.agreedTermsResetKey}
              match={match}
              disabled={disabled}
              onSave={(terms) => actions.onSaveAgreedTerms(match, terms)}
              onValidityChange={setAreTermsValid}
            />
          )}

          {isConverted && agreedSummary && (
            <PropertyRow icon={<WonCircleIcon />} label="합의 조건">
              {agreedSummary}
            </PropertyRow>
          )}

          {/* 이 고객 × 이 집에만 해당하는 기록. 고객 조건의 메모(오른쪽 카드)와 다르다 */}
          <PropertyRow icon={<MessageSquare />} label="매칭 메모" multiline>
            <MatchMemoField
              match={match}
              isSaving={isSavingMemo}
              onCommit={onCommitMemo}
              draft={memoDraft}
              onDraftChange={onMemoDraftChange}
            />
          </PropertyRow>

          {isConverted && deal && (
            <div className="px-2 pb-1 pt-1.5">
              <DealStagePath deal={deal} onOpen={openDeal} />
            </div>
          )}

          {blockReason && (
            <div
              role="alert"
              className="mx-2 mb-1 mt-1.5 flex gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-strong"
            >
              <CircleAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>{blockReason}</span>
            </div>
          )}
        </DetailCard>

        <BuyerConditionCard match={match} fit={fit} />
      </div>
    </div>
  );
}

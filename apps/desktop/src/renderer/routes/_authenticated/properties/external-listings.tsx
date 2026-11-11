import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Building2,
  Check,
  CheckCircle,
  ChevronDown,
  CircleDot,
  CircleDollarSign,
  Compass,
  CopyPlus,
  DoorOpen,
  ExternalLink,
  FileText,
  Hash,
  Layers3,
  ListOrdered,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Ruler,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserRound,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type {
  ExternalListing,
  ExternalListingDiscoveryStatus,
  ExternalListingGroup,
  ExternalListingTransactionType,
  ListingGroupInput,
} from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import {
  CellEditProvider,
  DataTable,
  EditableCell,
} from '@/components/data-table';
import { useAuth } from '@/providers/auth-provider';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import type { MultiSelectOption } from '@/components/ui/multi-select';
import { sortExternalListingGroups } from './-external-listing-sort';
import { getPriceChange, type PriceChangeTerms } from './-external-listing-price';
import {
  AddFilterMenu,
  ChecklistFilterPanel,
  summarizeSelection,
  toolbarGhostButtonClassName,
  ToolbarFilterChip,
  ToolbarPillTabs,
  ToolbarSearchBar,
  ToolbarToggleChip,
  type AddFilterItem,
} from './-components/property-toolbar';
import {
  formatNumericRangeLabel,
  MONTHLY_RENT_RANGE_MAX,
  MONTHLY_RENT_RANGE_MIN,
  MONTHLY_RENT_RANGE_PRESETS,
  NumericRangeFilterPanel,
  PopoverTitle,
  PRICE_RANGE_MAX,
  PRICE_RANGE_PRESETS,
  type NumericRangePreset,
} from './-components/numeric-range-filter';

const transactionTypes: Array<{
  value: ExternalListingTransactionType;
  label: string;
}> = [
  { value: 'sale', label: '매매' },
  { value: 'jeonse', label: '전세' },
  { value: 'monthly', label: '월세' },
];

// 범위 필터 기준값 (만원). 매매·전세는 매물관리와 같은 눈금, 월세 보증금은 더 잘게 나눈다.
const SALE_PRICE_RANGE_MAX = PRICE_RANGE_MAX * 10000;
const SALE_PRICE_RANGE_PRESETS: NumericRangePreset[] = PRICE_RANGE_PRESETS.map(
  (preset) => ({
    ...preset,
    min: preset.min * 10000,
    max: preset.max * 10000,
  }),
);
const DEPOSIT_RANGE_MAX = 100000;
const DEPOSIT_RANGE_PRESETS: NumericRangePreset[] = [
  { label: '~1천만', min: 0, max: 1000 },
  { label: '1~3천만', min: 1000, max: 3000 },
  { label: '3~5천만', min: 3000, max: 5000 },
  { label: '5천~1억', min: 5000, max: 10000 },
  { label: '1~3억', min: 10000, max: 30000 },
  { label: '3~5억', min: 30000, max: 50000 },
  { label: '5억~', min: 50000, max: DEPOSIT_RANGE_MAX },
  { label: '전체', min: 0, max: DEPOSIT_RANGE_MAX, isAll: true },
];

const MAX_MANUAL_ENTRY_DRAFTS = 3_000;
const EXTERNAL_LISTING_BATCH_SIZE = 100;

const DISCOVERY_STATUS_META: Record<
  ExternalListingDiscoveryStatus,
  { label: string; description: string; className: string }
> = {
  new: {
    label: '신규',
    description: '이전 자료에 같은 매물과 광고가 없습니다.',
    className: 'bg-success-soft text-success',
  },
  added: {
    label: '추가',
    description: '기존 매물에 새로운 광고가 추가됐습니다.',
    className: 'bg-warning-soft text-warning-strong',
  },
  existing: {
    label: '기존',
    description: '이전 자료에도 동일한 광고가 있습니다.',
    className: 'text-muted-foreground',
  },
};

const MARKET_DETAIL_COLUMN_IDS = [
  'priceMin',
  'priceMax',
  'direction',
  'features',
] as const;
const MARKET_DETAIL_COLUMN_ID_SET = new Set<string>(MARKET_DETAIL_COLUMN_IDS);

export const Route = createFileRoute(
  '/_authenticated/properties/external-listings',
)({
  component: ExternalListingsPage,
});

function ExternalListingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  // 스냅샷 상태가 바뀌면 목록·건수뿐 아니라 펼침 패널의 입력·활성 상태도 달라진다.
  const invalidateSnapshotQueries = () => {
    for (const key of [
      'external-listing-groups',
      'external-listing-active-session',
      'external-listing-group-detail',
    ]) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  };
  const [transactionType, setTransactionType] =
    useState<ExternalListingTransactionType>('sale');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [areMarketDetailColumnsCollapsed, setAreMarketDetailColumnsCollapsed] =
    useState(true);
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [buildingQuery, setBuildingQuery] = useState('');
  const [hoQuery, setHoQuery] = useState('');
  const [featureQuery, setFeatureQuery] = useState('');
  const [onlyOwner, setOnlyOwner] = useState(false);
  const [onlyAd, setOnlyAd] = useState(false);
  const [onlySeango, setOnlySeango] = useState(false);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  // 월세 범위 (월세 탭 전용 — 보증금은 priceMin/Max가 담당)
  const [monthlyRentMin, setMonthlyRentMin] = useState('');
  const [monthlyRentMax, setMonthlyRentMax] = useState('');
  const [isSiteFilterOpen, setIsSiteFilterOpen] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [innerTab, setInnerTab] = useState<'new' | 'old'>('new');
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showKeepConfirm, setShowKeepConfirm] = useState(false);
  // 확인창을 연 시점의 대상으로 고정해 확인한 건수와 실제 유지 대상이 어긋나지 않게 한다.
  const [keepTarget, setKeepTarget] = useState<{
    groupIds: string[];
    listingCount: number;
  }>({ groupIds: [], listingCount: 0 });
  const [sessionError, setSessionError] = useState<string | null>(null);

  const { data: officeSites = [] } = useQuery({
    queryKey: ['office-sites'],
    queryFn: () => api.officeSites.findAll(),
  });

  const siteOptions = useMemo<MultiSelectOption[]>(
    () =>
      officeSites
        .filter((os) => os.site)
        .map((os) => ({
          value: os.siteId,
          label: os.site!.name,
        })),
    [officeSites],
  );

  // 스냅샷 세션은 (단지, 거래유형) 단일 스코프. 따라서 단지가 정확히 1개 선택된
  // 상태에서만 세션 기능이 활성화된다.
  const scopeSiteId =
    selectedSiteIds.length === 1 ? selectedSiteIds[0] : undefined;

  const { data: activeSession = null, refetch: refetchActiveSession } = useQuery({
    queryKey: ['external-listing-active-session', scopeSiteId, transactionType],
    queryFn: () =>
      api.externalListings.getActiveSession(scopeSiteId!, transactionType),
    enabled: !!scopeSiteId,
  });

  // 거래유형/단지 전환 시 innerTab은 'new'로 리셋.
  useEffect(() => {
    setInnerTab('new');
  }, [scopeSiteId, transactionType]);

  const groupsQueryKey = [
    'external-listing-groups',
    transactionType,
    selectedSiteIds,
    searchQuery,
    activeSession?.id,
    innerTab,
  ];
  const {
    data: groups = [],
    isLoading,
    isError: isGroupsError,
    refetch: refetchGroups,
  } = useQuery({
    queryKey: groupsQueryKey,
    queryFn: () =>
      api.externalListings.findAllGroups({
        transactionType,
        // 세션 모드면 siteId 단일 스코프, 아니면 기존 siteIds 멀티
        siteId: activeSession ? scopeSiteId : undefined,
        siteIds: activeSession ? undefined : selectedSiteIds,
        search: searchQuery.trim() || undefined,
        bucket: activeSession ? innerTab : undefined,
      }),
  });

  const canManageSession =
    !!activeSession &&
    (user?.role === 'owner' ||
      user?.role === 'manager' ||
      activeSession.startedById === user?.id);

  const startSessionMutation = useMutation({
    mutationFn: () =>
      api.externalListings.createSession({
        siteId: scopeSiteId!,
        transactionType,
      }),
    onSuccess: () => {
      setSessionError(null);
      setInnerTab('old');
      invalidateSnapshotQueries();
    },
    onError: (err: unknown) => {
      setSessionError(
        err instanceof Error ? err.message : '스냅샷을 시작하지 못했습니다.',
      );
    },
  });

  // 확인창의 건수를 최신 값으로 보여주고, 그 건수로 닫아 그사이 입력이 바뀌면 거부되게 한다.
  const openCompleteConfirm = async () => {
    const { data } = await refetchActiveSession();
    if (data) setShowCompleteConfirm(true);
  };

  const completeSessionMutation = useMutation({
    mutationFn: (expectedListingCount: number) =>
      api.externalListings.completeSession(activeSession!.id, {
        expectedListingCount,
      }),
    onSuccess: (result) => {
      invalidateSnapshotQueries();
      setShowCompleteConfirm(false);
      const { comparison } = result;
      setSessionError(
        `스냅샷 완료: 신규 매물 ${comparison.newGroups.length}건, 광고 추가 ${comparison.addedListings.length}건, 사라진 매물 ${comparison.removedGroups.length}건, 내려간 광고 ${comparison.removedListings.length}건, 가격 변경 ${comparison.priceChanges.length}건`,
      );
    },
    onError: (err: unknown) => {
      setSessionError(
        err instanceof Error ? err.message : '완료 처리에 실패했습니다.',
      );
      setShowCompleteConfirm(false);
    },
  });

  const cancelSessionMutation = useMutation({
    mutationFn: () => api.externalListings.cancelSession(activeSession!.id),
    onSuccess: () => {
      invalidateSnapshotQueries();
      setShowCancelConfirm(false);
    },
    onError: (err: unknown) => {
      setSessionError(
        err instanceof Error ? err.message : '세션 취소에 실패했습니다.',
      );
      setShowCancelConfirm(false);
    },
  });

  // 행을 바로 빼서 여러 매물을 연달아 유지할 때 기다리지 않게 한다.
  // 연달아 누른 행이 처리 중일 때 새로고침하면 그 행이 잠깐 되살아나므로 모두 끝난 뒤
  // 한 번만 한다. 완료가 겹치면 isMutating은 서로를 세어 둘 다 건너뛰므로 직접 센다.
  const keepRequestsInFlight = useRef(0);
  const keepGroupsMutation = useMutation({
    mutationFn: (groupIds: string[]) =>
      api.externalListings.keepSnapshotListings(activeSession!.id, groupIds),
    onMutate: async (groupIds) => {
      keepRequestsInFlight.current += 1;
      setShowKeepConfirm(false);
      const queryKey = groupsQueryKey;
      await queryClient.cancelQueries({ queryKey });
      const previous =
        queryClient.getQueryData<ExternalListingGroup[]>(queryKey);
      const kept = new Set(groupIds);
      queryClient.setQueryData(
        queryKey,
        previous?.filter((group) => !kept.has(group.id)),
      );
      return { queryKey, previous };
    },
    onError: (err, _groupIds, ctx) => {
      if (ctx) queryClient.setQueryData(ctx.queryKey, ctx.previous);
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : '광고를 유지하지 못했습니다.',
      );
    },
    onSettled: () => {
      keepRequestsInFlight.current -= 1;
      if (keepRequestsInFlight.current === 0) invalidateSnapshotQueries();
    },
  });
  const isKeepMode = !!activeSession && innerTab === 'old';

  // ── Inline group updates (memo / ho) ──────────────────────────
  const updateGroupMutation = useMutation({
    mutationFn: ({
      id,
      dto,
    }: {
      id: string;
      dto: {
        memo?: string | null;
        ho?: string | null;
      };
    }) => api.externalListings.updateGroup(id, dto),
    // Optimistic update so the table feels instant.
    onMutate: async ({ id, dto }) => {
      await queryClient.cancelQueries({
        queryKey: ['external-listing-groups'],
      });
      const snapshots = queryClient.getQueriesData<ExternalListingGroup[]>({
        queryKey: ['external-listing-groups'],
      });
      for (const [key, prev] of snapshots) {
        if (!prev) continue;
        queryClient.setQueryData(
          key,
          prev.map((g) => (g.id === id ? { ...g, ...dto } : g)),
        );
      }
      return { snapshots };
    },
    onError: (err, _vars, ctx) => {
      if (ctx) {
        for (const [key, prev] of ctx.snapshots) {
          queryClient.setQueryData(key, prev);
        }
      }
      toast.error(
        err instanceof Error && err.message
          ? err.message
          : '저장에 실패했습니다.',
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['external-listing-groups'] });
    },
  });

  // ── 랭킹 셀에서 동일주소 광고를 인라인으로 펼친 행 ───────────────
  const [expandedRankingRowIds, setExpandedRankingRowIds] = useState<
    Set<string>
  >(() => new Set());
  const toggleRankingRow = useCallback((groupId: string) => {
    setExpandedRankingRowIds((previous) => {
      const next = new Set(previous);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  }, []);

  // ── Client-side filters (서버 검색과 별개로 즉시 반응) ────────────
  const filteredGroups = useMemo(() => {
    const bq = buildingQuery.trim().toLowerCase();
    const hq = hoQuery.trim().toLowerCase();
    const fq = featureQuery.trim().toLowerCase();
    const pMin =
      priceMin.trim() && Number.isFinite(Number(priceMin))
        ? Number(priceMin)
        : null;
    const pMax =
      priceMax.trim() && Number.isFinite(Number(priceMax))
        ? Number(priceMax)
        : null;
    const mrMin =
      monthlyRentMin.trim() && Number.isFinite(Number(monthlyRentMin))
        ? Number(monthlyRentMin)
        : null;
    const mrMax =
      monthlyRentMax.trim() && Number.isFinite(Number(monthlyRentMax))
        ? Number(monthlyRentMax)
        : null;
    // 우선 가격은 main.price(매매)나 deposit(전세/월세) 기준으로 범위 체크.
    const priceOf = (g: ExternalListingGroup): number | null => {
      const m = g.mainExternalListing;
      if (!m) return null;
      if (transactionType === 'sale') return m.price ?? null;
      return m.deposit ?? null;
    };

    const filtered = groups.filter((g) => {
      // 동 필터: buildingName 문자열
      if (bq) {
        const dongText = (g.buildingName ?? '').toLowerCase();
        if (!dongText.includes(bq)) return false;
      }
      // 호수 필터: 사용자가 기록한 텍스트
      if (hq) {
        const hoText = (g.ho ?? '').toLowerCase();
        if (!hoText.includes(hq)) return false;
      }
      // 매물특징 필터: articleFeatureDesc + memo
      if (fq) {
        const descText = (
          g.mainExternalListing?.articleFeatureDesc ?? ''
        ).toLowerCase();
        const memoText = (g.memo ?? '').toLowerCase();
        if (!descText.includes(fq) && !memoText.includes(fq)) return false;
      }
      // 집주인(소유주 확인된 매물만)
      if (onlyOwner && !g.ownerVerified) return false;
      // 내광고는 CP 원본의 실제 게시일이 확인된 행만 해당한다.
      if (onlyAd && !formatMonthDay(g.ownAdvertisementYmd)) return false;
      // 세안고
      if (onlySeango) {
        const desc = g.mainExternalListing?.articleFeatureDesc ?? '';
        if (!hasSeangoMarker(desc) && !hasSeangoMarker(g.memo)) return false;
      }
      // 가격 범위
      if (pMin != null || pMax != null) {
        const p = priceOf(g);
        if (p == null) return false;
        if (pMin != null && p < pMin) return false;
        if (pMax != null && p > pMax) return false;
      }
      // 월세 범위 (월세 탭 전용)
      if (transactionType === 'monthly' && (mrMin != null || mrMax != null)) {
        const r = g.mainExternalListing?.monthlyRent ?? null;
        if (r == null) return false;
        if (mrMin != null && r < mrMin) return false;
        if (mrMax != null && r > mrMax) return false;
      }
      return true;
    });
    return sortExternalListingGroups(filtered, sorting, transactionType);
  }, [
    groups,
    buildingQuery,
    hoQuery,
    featureQuery,
    onlyOwner,
    onlyAd,
    onlySeango,
    priceMin,
    priceMax,
    monthlyRentMin,
    monthlyRentMax,
    sorting,
    transactionType,
  ]);

  const tableSummary = useMemo(() => {
    const summary = { listings: 0, new: 0, added: 0, mine: 0, priceChanged: 0 };
    for (const group of filteredGroups) {
      summary.listings += group.listingCount ?? 0;
      if (group.discoveryStatus === 'new') summary.new += 1;
      if (group.discoveryStatus === 'added') summary.added += 1;
      if (formatMonthDay(group.ownAdvertisementYmd)) summary.mine += 1;
      if (
        getPriceChange(
          group.mainExternalListing,
          transactionType,
          group.priceChangeSince,
        )
      ) {
        summary.priceChanged += 1;
      }
    }
    return summary;
  }, [filteredGroups, transactionType]);

  const activeFilterCount =
    (buildingQuery.trim() ? 1 : 0) +
    (hoQuery.trim() ? 1 : 0) +
    (featureQuery.trim() ? 1 : 0) +
    (onlyOwner ? 1 : 0) +
    (onlyAd ? 1 : 0) +
    (onlySeango ? 1 : 0) +
    (priceMin.trim() || priceMax.trim() ? 1 : 0) +
    (transactionType === 'monthly' &&
    (monthlyRentMin.trim() || monthlyRentMax.trim())
      ? 1
      : 0);

  const resetFilters = () => {
    setBuildingQuery('');
    setHoQuery('');
    setFeatureQuery('');
    setOnlyOwner(false);
    setOnlyAd(false);
    setOnlySeango(false);
    setPriceMin('');
    setPriceMax('');
    setMonthlyRentMin('');
    setMonthlyRentMax('');
  };

  const columns = useMemo(
    () =>
      buildColumns(
        transactionType,
        {
          onUpdateMemo: (id, memo) =>
            updateGroupMutation.mutate({ id, dto: { memo: memo || null } }),
          onUpdateHo: (id, ho) =>
            updateGroupMutation.mutate({ id, dto: { ho: ho || null } }),
          expandedListingIds: expandedRankingRowIds,
          onToggleListings: toggleRankingRow,
          onKeepGroup: isKeepMode
            ? (groupId) => keepGroupsMutation.mutate([groupId])
            : undefined,
        },
        areMarketDetailColumnsCollapsed,
      ),
    [
      transactionType,
      areMarketDetailColumnsCollapsed,
      expandedRankingRowIds,
      toggleRankingRow,
      updateGroupMutation,
      isKeepMode,
      keepGroupsMutation,
    ],
  );

  const handleManualButtonClick = () => {
    setSessionError(null);
    setShowManualDialog(true);
  };

  const handleTransactionTypeChange = (next: ExternalListingTransactionType) => {
    // 월세 보증금과 매매·전세가는 눈금이 달라 값을 그대로 옮기면 칩과 결과가 어긋난다
    if ((next === 'monthly') !== (transactionType === 'monthly')) {
      setPriceMin('');
      setPriceMax('');
    }
    setTransactionType(next);
  };

  const priceFilterLabel =
    transactionType === 'sale'
      ? '매매가'
      : transactionType === 'jeonse'
        ? '전세가'
        : '보증금';
  const priceRangeMax =
    transactionType === 'monthly' ? DEPOSIT_RANGE_MAX : SALE_PRICE_RANGE_MAX;
  const priceRange = toSliderRange(priceMin, priceMax, 0, priceRangeMax);
  const monthlyRentRange = toSliderRange(
    monthlyRentMin,
    monthlyRentMax,
    MONTHLY_RENT_RANGE_MIN,
    MONTHLY_RENT_RANGE_MAX,
  );
  const formatMonthlyRentLabel = (min: number, max: number) =>
    formatNumericRangeLabel(
      min,
      max,
      MONTHLY_RENT_RANGE_MIN,
      MONTHLY_RENT_RANGE_MAX,
      '만원',
      '전체 월세',
    );

  // 자주 쓰지 않는 필터. 값이 있으면 칩으로, 없으면 "+ 필터" 메뉴 안에만 있다.
  const moreFilterItems: (AddFilterItem & { onClear: () => void })[] = [
    {
      key: 'feature',
      label: '특징·메모',
      icon: <FileText />,
      summary: featureQuery.trim() || null,
      onClear: () => setFeatureQuery(''),
      contentClassName: 'w-[280px] p-3',
      render: () => (
        <div className="space-y-3">
          <PopoverTitle
            title="특징·메모"
            description="매물 특징과 내 메모에 이 글자가 있는 광고만 표시합니다."
          />
          <Input
            aria-label="특징·메모 필터"
            value={featureQuery}
            onChange={(event) => setFeatureQuery(event.target.value)}
            placeholder="특징·메모 검색"
            className="h-8 text-[13px]"
          />
        </div>
      ),
    },
  ];

  return (
    // 매물관리와 동일하게 콘텐츠 패딩을 네 방향 모두 상쇄해 첫 필터를 상단에 붙인다.
    <div className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      <Tabs
        value={transactionType}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
      >
        {/* 매물관리와 같은 2줄 툴바: 1행 찾기, 2행 좁히기. 건수는 표 아래 상태줄이 맡는다. */}
        <section
          data-advertising-note-primary-filters
          className="shrink-0 border-b border-border bg-white px-3 py-2.5"
        >
          <div className="@container flex min-w-0 items-center gap-2">
            <ToolbarPillTabs
              ariaLabel="거래유형"
              value={transactionType}
              options={transactionTypes}
              onChange={handleTransactionTypeChange}
            />

            <ToolbarSearchBar
              label={
                summarizeSelection(siteOptions, selectedSiteIds) ?? '단지 전체'
              }
              isPlaceholder={selectedSiteIds.length === 0}
              active={
                selectedSiteIds.length > 0 ||
                buildingQuery.trim() !== '' ||
                hoQuery.trim() !== ''
              }
              dong={buildingQuery}
              unit={hoQuery}
              onDongChange={setBuildingQuery}
              onUnitChange={setHoQuery}
              onClear={() => {
                setSelectedSiteIds([]);
                setBuildingQuery('');
                setHoQuery('');
              }}
              open={isSiteFilterOpen}
              onOpenChange={setIsSiteFilterOpen}
              search={searchQuery}
              onSearchChange={setSearchQuery}
              searchPlaceholder="단지, 특징, 메모, 부동산"
              locationAriaLabel="단지 필터"
              searchAriaLabel="광고노트 통합 검색"
            >
              <ChecklistFilterPanel
                options={siteOptions}
                selected={selectedSiteIds}
                onChange={setSelectedSiteIds}
                searchPlaceholder="단지명 검색"
                emptyText="일치하는 단지가 없습니다."
                listClassName="max-h-[280px]"
              />
            </ToolbarSearchBar>

            <div className="ml-auto flex shrink-0 items-center gap-2">
              {scopeSiteId && !activeSession && (
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="스냅샷 시작"
                  className="h-[30px] shrink-0 rounded-full px-3 text-xs"
                  disabled={startSessionMutation.isPending}
                  onClick={() => startSessionMutation.mutate()}
                >
                  <CircleDot className="size-3.5" />
                  <span className="@max-3xl:hidden">스냅샷 시작</span>
                </Button>
              )}
              <Button
                size="sm"
                aria-label="광고 입력"
                className="h-[30px] shrink-0 rounded-full px-3.5"
                onClick={handleManualButtonClick}
              >
                <Plus className="size-3.5" />
                {/* 툴바 폭이 768px보다 좁으면 아이콘만 */}
                <span className="@max-3xl:hidden">광고 입력</span>
              </Button>
            </div>
          </div>
        </section>

        <section
          data-advertising-note-secondary-filters
          className="flex shrink-0 items-center gap-2 border-b border-border bg-white px-3 py-2"
        >
          <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ToolbarToggleChip
              label="집주인"
              active={onlyOwner}
              onToggle={() => setOnlyOwner((value) => !value)}
            />
            <ToolbarToggleChip
              label="내광고만"
              active={onlyAd}
              onToggle={() => setOnlyAd((value) => !value)}
            />
            <ToolbarToggleChip
              label="세안고"
              active={onlySeango}
              onToggle={() => setOnlySeango((value) => !value)}
            />

            <ToolbarFilterChip
              label={priceFilterLabel}
              summary={
                priceMin.trim() || priceMax.trim()
                  ? formatManwonRangeLabel(
                      priceRange[0],
                      priceRange[1],
                      priceRangeMax,
                    )
                  : null
              }
              onClear={() => {
                setPriceMin('');
                setPriceMax('');
              }}
              contentClassName="w-[430px] max-w-[calc(100vw-24px)] overflow-hidden p-0"
            >
              {(close) => (
                <NumericRangeFilterPanel
                  ariaLabel={`${priceFilterLabel} 필터`}
                  title={priceFilterLabel}
                  description="대표 광고 금액 기준"
                  initialRange={priceRange}
                  min={0}
                  max={priceRangeMax}
                  step={transactionType === 'monthly' ? 1000 : 5000}
                  presets={
                    transactionType === 'monthly'
                      ? DEPOSIT_RANGE_PRESETS
                      : SALE_PRICE_RANGE_PRESETS
                  }
                  tickLabels={
                    transactionType === 'monthly'
                      ? ['전체', '2.5억', '5억', '7.5억', '최대']
                      : ['전체', '10억', '20억', '최대']
                  }
                  formatLabel={(min, max) =>
                    formatManwonRangeLabel(min, max, priceRangeMax)
                  }
                  thumbLabels={[
                    `최소 ${priceFilterLabel}`,
                    `최대 ${priceFilterLabel}`,
                  ]}
                  onApply={(range) => {
                    const [min, max] = toFilterValues(range, 0, priceRangeMax);
                    setPriceMin(min);
                    setPriceMax(max);
                    close();
                  }}
                  onClear={() => {
                    setPriceMin('');
                    setPriceMax('');
                    close();
                  }}
                  onCancel={close}
                />
              )}
            </ToolbarFilterChip>

            {transactionType === 'monthly' && (
              <ToolbarFilterChip
                label="월세"
                summary={
                  monthlyRentMin.trim() || monthlyRentMax.trim()
                    ? formatMonthlyRentLabel(
                        monthlyRentRange[0],
                        monthlyRentRange[1],
                      )
                    : null
                }
                onClear={() => {
                  setMonthlyRentMin('');
                  setMonthlyRentMax('');
                }}
                contentClassName="w-[430px] max-w-[calc(100vw-24px)] overflow-hidden p-0"
              >
                {(close) => (
                  <NumericRangeFilterPanel
                    ariaLabel="월세 필터"
                    title="월세"
                    description="월 납부액 기준 · 만원 단위"
                    initialRange={monthlyRentRange}
                    min={MONTHLY_RENT_RANGE_MIN}
                    max={MONTHLY_RENT_RANGE_MAX}
                    step={10}
                    presets={MONTHLY_RENT_RANGE_PRESETS}
                    tickLabels={['전체', '200만', '400만', '최대']}
                    formatLabel={formatMonthlyRentLabel}
                    thumbLabels={['최소 월세', '최대 월세']}
                    onApply={(range) => {
                      const [min, max] = toFilterValues(
                        range,
                        MONTHLY_RENT_RANGE_MIN,
                        MONTHLY_RENT_RANGE_MAX,
                      );
                      setMonthlyRentMin(min);
                      setMonthlyRentMax(max);
                      close();
                    }}
                    onClear={() => {
                      setMonthlyRentMin('');
                      setMonthlyRentMax('');
                      close();
                    }}
                    onCancel={close}
                  />
                )}
              </ToolbarFilterChip>
            )}

            {moreFilterItems
              .filter((item) => item.summary !== null)
              .map((item) => (
                <ToolbarFilterChip
                  key={item.key}
                  label={item.label}
                  summary={item.summary}
                  onClear={item.onClear}
                  contentClassName={item.contentClassName}
                >
                  {(close) => item.render(close)}
                </ToolbarFilterChip>
              ))}

            <AddFilterMenu items={moreFilterItems} />
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              className={toolbarGhostButtonClassName}
              onClick={resetFilters}
            >
              <RotateCcw className="size-3.5" />
              초기화
            </button>
          )}
        </section>

        {/* 테이블 영역 */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          {activeSession && (
            <div
              data-advertising-note-snapshot-bar
              className="@container flex shrink-0 items-center gap-3 border-b border-border bg-muted px-3 py-1.5"
            >
              <span className="inline-flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-foreground">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-warning"
                />
                스냅샷 진행 중
              </span>
              <ToolbarPillTabs
                ariaLabel="스냅샷 입력 구분"
                value={innerTab}
                options={[
                  {
                    value: 'new',
                    label: '입력됨',
                    count: activeSession.receivedListingCount,
                  },
                  {
                    value: 'old',
                    label: '미입력',
                    count: activeSession.pendingRemovalCount,
                  },
                ]}
                onChange={setInnerTab}
              />
              <span className="min-w-0 truncate text-xs text-muted-foreground-strong @max-4xl:hidden">
                완료하면 입력되지 않은 광고가 내려갑니다
              </span>

              <div className="ml-auto flex shrink-0 items-center gap-2">
                <span className="text-xs text-muted-foreground-strong @max-5xl:hidden">
                  {activeSession.startedBy?.name ?? '알 수 없음'} ·{' '}
                  {new Date(activeSession.startedAt).toLocaleString('ko-KR', {
                    month: 'numeric',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}{' '}
                  시작
                </span>
                {isKeepMode && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-[30px] rounded-full bg-white px-3 text-xs"
                    disabled={filteredGroups.length === 0}
                    onClick={() => {
                      setKeepTarget({
                        groupIds: filteredGroups.map((group) => group.id),
                        listingCount: tableSummary.listings,
                      });
                      setShowKeepConfirm(true);
                    }}
                  >
                    <Check className="size-3.5" />
                    {activeFilterCount > 0 || searchQuery.trim()
                      ? `표시된 ${filteredGroups.length.toLocaleString('ko-KR')}건 유지`
                      : '전체 유지'}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="스냅샷 취소"
                  className="h-[30px] rounded-full bg-white px-3 text-xs"
                  disabled={
                    !canManageSession || cancelSessionMutation.isPending
                  }
                  onClick={() => setShowCancelConfirm(true)}
                >
                  <XCircle className="size-3.5" />
                  취소
                </Button>
                <Button
                  size="sm"
                  aria-label="스냅샷 완료"
                  className="h-[30px] rounded-full px-3 text-xs"
                  disabled={
                    !canManageSession || completeSessionMutation.isPending
                  }
                  onClick={() => void openCompleteConfirm()}
                  title={
                    canManageSession
                      ? undefined
                      : '권한 부족: 본인 세션 또는 매니저/오너만 완료 가능'
                  }
                >
                  <CheckCircle className="size-3.5" />
                  완료
                </Button>
              </div>
            </div>
          )}

          {sessionError && (
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-3 py-1.5 text-xs text-foreground">
              <span>{sessionError}</span>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setSessionError(null)}
              >
                닫기
              </Button>
            </div>
          )}

          {transactionTypes.map((t) => (
            <TabsContent
              key={t.value}
              value={t.value}
              className="m-0 flex min-h-0 min-w-0 flex-1 flex-col"
            >
              {isGroupsError ? (
                <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
                  <p className="text-sm text-muted-foreground">
                    외부 매물 목록을 불러오지 못했습니다.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => refetchGroups()}
                  >
                    <RefreshCw className="mr-1 size-3.5" />
                    다시 시도
                  </Button>
                </div>
              ) : !isLoading && groups.length === 0 ? (
                <EmptyState
                  icon={Building2}
                  title={
                    !activeSession
                      ? '표시할 광고가 없습니다'
                      : innerTab === 'new'
                        ? '아직 입력한 광고가 없습니다'
                        : '미입력 매물이 없습니다'
                  }
                  description={
                    !activeSession
                      ? selectedSiteIds.length > 0
                        ? '선택한 단지에 입력된 광고가 없습니다. 단지 선택을 조정해 보세요.'
                        : '광고를 입력하면 여기에 표시됩니다.'
                      : innerTab === 'new'
                        ? '광고 입력으로 추가하거나, 미입력 탭에서 기존 광고를 유지하세요.'
                        : activeSession.pendingRemovalCount > 0
                          ? `입력된 매물에 미입력 광고 ${activeSession.pendingRemovalCount.toLocaleString('ko-KR')}건이 남아 있습니다. 입력됨 탭에서 펼쳐 확인하세요.`
                          : '이 탭의 매물은 모두 입력됐습니다.'
                  }
                />
              ) : (
                <CellEditProvider>
                  <DataTable
                    columns={columns}
                    data={filteredGroups}
                    layout="full-height"
                    variant="notion"
                    rowHeight={40}
                    pinnedColumns={[
                      'keep',
                      'discoveryStatus',
                      'myAd',
                      'owner',
                      'site',
                      'dong',
                      'ho',
                    ]}
                    columnGroupControls={[
                      {
                        collapsed: areMarketDetailColumnsCollapsed,
                        onToggle: () => {
                          if (!areMarketDetailColumnsCollapsed) {
                            setSorting((previous) =>
                              previous.some(({ id }) =>
                                MARKET_DETAIL_COLUMN_ID_SET.has(id),
                              )
                                ? []
                                : previous,
                            );
                          }
                          setAreMarketDetailColumnsCollapsed(
                            (previous) => !previous,
                          );
                        },
                        anchorColumnId: 'price',
                        columnIds: MARKET_DETAIL_COLUMN_IDS,
                        label: '가격 범위·특징',
                        showLabel: true,
                      },
                    ]}
                    sorting={sorting}
                    onSortingChange={setSorting}
                    expandedRowIds={expandedRankingRowIds}
                    renderExpandedRow={(group) => (
                      <ExternalListingRankPanel group={group} />
                    )}
                    isLoading={isLoading}
                    renderStatusBar={() => (
                      <>
                        <span className="tabular-nums">
                          매물 {filteredGroups.length.toLocaleString()}건 · 광고{' '}
                          {tableSummary.listings.toLocaleString()}건
                          {groups.length !== filteredGroups.length
                            ? ` · 전체 매물 ${groups.length.toLocaleString()}건`
                            : ''}
                        </span>
                        <TableSummaryItem
                          label="신규"
                          count={tableSummary.new}
                          dotClassName="bg-success"
                        />
                        <TableSummaryItem
                          label="추가"
                          count={tableSummary.added}
                          dotClassName="bg-warning"
                        />
                        <TableSummaryItem
                          label="가격 변경"
                          count={tableSummary.priceChanged}
                          dotClassName="bg-destructive"
                        />
                        <TableSummaryItem
                          label="내 광고"
                          count={tableSummary.mine}
                          dotClassName="bg-info"
                        />
                      </>
                    )}
                    emptyMessage={
                      activeFilterCount > 0
                        ? '필터에 맞는 매물이 없습니다'
                        : '매물이 없습니다'
                    }
                  />
                </CellEditProvider>
              )}
            </TabsContent>
          ))}
        </section>
      </Tabs>

      <ManualEntryDialog
        open={showManualDialog}
        onOpenChange={setShowManualDialog}
        siteOptions={siteOptions}
        defaultSiteId={scopeSiteId}
        defaultTransactionType={transactionType}
        onSuccess={(siteId, entryTransactionType) => {
          // 스냅샷 완료·취소 버튼은 단지 1개를 고른 범위에서 보인다.
          setSelectedSiteIds([siteId]);
          if (entryTransactionType !== transactionType) {
            handleTransactionTypeChange(entryTransactionType);
          }
          invalidateSnapshotQueries();
        }}
      />

      <ConfirmDialog
        open={showCompleteConfirm}
        onOpenChange={setShowCompleteConfirm}
        title={
          activeSession?.receivedListingCount === 0
            ? '입력된 광고가 없습니다. 모두 내릴까요?'
            : '스냅샷을 완료하시겠습니까?'
        }
        description={
          activeSession?.receivedListingCount === 0
            ? `이 단지·거래유형의 광고 ${activeSession.pendingRemovalCount.toLocaleString('ko-KR')}건이 모두 내려갑니다. 닫은 뒤에는 광고를 수정하거나 지울 수 없고, 호수와 메모는 유지됩니다.`
            : `${
                activeSession?.pendingRemovalCount === 0
                  ? `입력한 광고 ${(activeSession?.receivedListingCount ?? 0).toLocaleString('ko-KR')}건이 모두 남습니다.`
                  : `입력한 광고 ${(activeSession?.receivedListingCount ?? 0).toLocaleString('ko-KR')}건이 남고, 입력되지 않은 광고 ${(activeSession?.pendingRemovalCount ?? 0).toLocaleString('ko-KR')}건은 입력 방식과 관계없이 내려갑니다.`
              } 닫은 뒤에는 광고를 수정하거나 지울 수 없고, 호수와 메모는 유지됩니다.`
        }
        confirmLabel={
          activeSession?.receivedListingCount === 0 ? '모두 내리기' : '완료'
        }
        onConfirm={() => {
          if (activeSession) {
            completeSessionMutation.mutate(activeSession.receivedListingCount);
          }
        }}
        pending={completeSessionMutation.isPending}
      />

      <ConfirmDialog
        open={showKeepConfirm}
        onOpenChange={setShowKeepConfirm}
        title={`표시된 매물 ${keepTarget.groupIds.length.toLocaleString('ko-KR')}건을 유지할까요?`}
        description={`광고 ${keepTarget.listingCount.toLocaleString('ko-KR')}건이 다시 입력하지 않아도 완료 후 남습니다. 실제로 내려간 광고까지 남을 수 있으니 확인한 뒤 유지하세요.`}
        confirmLabel="유지"
        onConfirm={() => keepGroupsMutation.mutate(keepTarget.groupIds)}
        pending={keepGroupsMutation.isPending}
      />

      <ConfirmDialog
        open={showCancelConfirm}
        onOpenChange={setShowCancelConfirm}
        title="작업을 취소하시겠습니까?"
        description="세션 락이 해제됩니다. 세션 중 입력한 신규 매물은 그대로 유지됩니다."
        confirmLabel="세션 취소"
        onConfirm={() => cancelSessionMutation.mutate()}
        pending={cancelSessionMutation.isPending}
      />
    </div>
  );
}

/** 필터 값은 만원 문자열로 들고 있고, 비어 있으면 그쪽은 제한이 없다. */
function toSliderRange(
  minValue: string,
  maxValue: string,
  rangeMin: number,
  rangeMax: number,
): [number, number] {
  const min = Number(minValue);
  const max = Number(maxValue);
  const lower =
    minValue.trim() && Number.isFinite(min)
      ? Math.max(rangeMin, Math.min(min, rangeMax))
      : rangeMin;
  const upper =
    maxValue.trim() && Number.isFinite(max)
      ? Math.max(lower, Math.min(max, rangeMax))
      : rangeMax;
  return [lower, upper];
}

function toFilterValues(
  [min, max]: [number, number],
  rangeMin: number,
  rangeMax: number,
): [string, string] {
  return [
    min <= rangeMin ? '' : String(min),
    max >= rangeMax ? '' : String(max),
  ];
}

function formatManwonRangeLabel(min: number, max: number, rangeMax: number) {
  if (min <= 0 && max >= rangeMax) return '전체 가격';
  if (min <= 0) return `${formatPrice(max)} 이하`;
  if (max >= rangeMax) return `${formatPrice(min)} 이상`;
  if (min === max) return formatPrice(min);
  return `${formatPrice(min)}–${formatPrice(max)}`;
}

// ── 랭킹 상세 — 매물관리 광고 컬럼과 같은 인라인 확장 행 ─────────────

function ExternalListingRankPanel({ group }: { group: ExternalListingGroup }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['external-listing-group-detail', group.id],
    queryFn: () => api.externalListings.findGroupById(group.id),
  });

  const queryClient = useQueryClient();
  const { data: session = null } = useQuery({
    queryKey: [
      'external-listing-active-session',
      group.siteId,
      group.transactionType,
    ],
    queryFn: () =>
      api.externalListings.getActiveSession(
        group.siteId,
        group.transactionType,
      ),
  });
  const [editing, setEditing] = useState<ExternalListing | 'new' | null>(null);
  const [listingToRemove, setListingToRemove] =
    useState<ExternalListing | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const refreshAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['external-listing-groups'] });
    queryClient.invalidateQueries({
      queryKey: ['external-listing-group-detail', group.id],
    });
    queryClient.invalidateQueries({
      queryKey: ['external-listing-active-session'],
    });
  };
  const saveListingMutation = useMutation({
    mutationFn: async (values: SnapshotListingValues) => {
      if (!session) throw new Error('열린 스냅샷이 없습니다.');
      const { articleNo, ...fields } = values;
      if (editing && editing !== 'new') {
        return api.externalListings.updateSnapshotListing(
          session.id,
          editing.id,
          fields,
        );
      }
      return api.externalListings.addSnapshotListing(session.id, group.id, {
        source: 'manual',
        listing: {
          ...fields,
          articleNo: articleNo.trim() || generateManualArticleNo(),
        },
      });
    },
    onSuccess: () => {
      setEditing(null);
      setActionError(null);
      refreshAfterChange();
    },
    onError: (err: unknown) => {
      setEditing(null);
      setActionError(
        err instanceof Error ? err.message : '광고를 저장하지 못했습니다.',
      );
    },
  });
  const removeListingMutation = useMutation({
    mutationFn: (listingId: string) => {
      if (!session) throw new Error('열린 스냅샷이 없습니다.');
      return api.externalListings.removeSnapshotListing(session.id, listingId);
    },
    onSuccess: () => {
      setListingToRemove(null);
      setActionError(null);
      refreshAfterChange();
    },
    onError: (err: unknown) => {
      setListingToRemove(null);
      setActionError(
        err instanceof Error ? err.message : '광고를 지우지 못했습니다.',
      );
    },
  });

  // 상세 응답에는 내려간 광고도 있지만 이 패널은 현재 광고만 비교한다.
  const listings = (data?.listings ?? []).filter((item) => item.isActive);
  const isEnteredInSession = (item: ExternalListing) =>
    !!session && new Date(item.lastSeenAt) >= new Date(session.startedAt);
  const hasEnteredListing = listings.some(isEnteredInSession);
  const locationLabel = [group.site?.name, group.buildingName, group.ho]
    .filter(Boolean)
    .join(' · ');
  // 보증금과 월세가 함께 움직이는 월세는 한 값으로 비교할 수 없다.
  const comparablePrices =
    group.transactionType === 'monthly'
      ? []
      : listings
          .map((item) =>
            group.transactionType === 'sale' ? item.price : item.deposit,
          )
          .filter((price): price is number => !!price);
  const lowestPrice =
    comparablePrices.length > 1 &&
    Math.min(...comparablePrices) !== Math.max(...comparablePrices)
      ? Math.min(...comparablePrices)
      : null;
  const gridClassName = session
    ? 'grid-cols-[40px_56px_244px_216px_72px_64px_176px]'
    : 'grid-cols-[40px_56px_244px_216px_72px_64px]';

  return (
    <div
      id={`external-listing-rank-panel-${group.id}`}
      role="region"
      aria-label={`${locationLabel || '동일주소'} 광고 랭킹 상세`}
      className="border-b border-border bg-muted/60 px-3 py-3"
    >
      {/* 표를 옆으로 밀어도 패널은 보이는 자리에 남는다. */}
      <div className="sticky left-3 w-fit max-w-full">
        <div className="mb-2 flex min-w-0 items-center gap-1.5">
          <ListOrdered className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="shrink-0 text-[13px] font-semibold text-foreground">
            동일주소 광고{' '}
            {data?.listingCount ?? group.listingCount ?? listings.length}건
          </span>
          <span className="shrink-0 text-xs text-muted-foreground-strong">
            · 노출 순서 비교
          </span>
          {hasEnteredListing && (
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => setEditing('new')}
              className="ml-auto shrink-0 bg-white px-2 text-xs shadow-none"
            >
              <CopyPlus className="size-3" />
              동일 광고 추가
            </Button>
          )}
        </div>

        {actionError && (
          <p role="alert" className="mb-2 text-xs text-destructive">
            {actionError}
          </p>
        )}

        {isLoading ? (
          <div className="w-[692px] max-w-full space-y-1.5">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-11 w-full rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex w-[692px] max-w-full items-center gap-2 rounded-md border border-border bg-white px-3 py-2">
            <p className="text-xs text-muted-foreground-strong">
              동일주소 광고를 불러오지 못했습니다.
            </p>
            <Button
              variant="outline"
              size="xs"
              className="ml-auto"
              onClick={() => refetch()}
            >
              <RefreshCw className="size-3" />
              다시 시도
            </Button>
          </div>
        ) : listings.length === 0 ? (
          <p className="text-xs text-muted-foreground-strong">
            이 주소에 입력된 광고가 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border bg-white">
            <div
              className={cn(
                'grid h-8 items-center gap-x-2 border-b border-border bg-muted/40 px-3 text-xs font-medium text-muted-foreground-strong',
                gridClassName,
              )}
            >
              <span>순위</span>
              <span>주인</span>
              <span>부동산</span>
              <span>가격</span>
              <span>확인일</span>
              <span>출처</span>
              {session && <span className="text-right">이번 스냅샷</span>}
            </div>

            {listings.map((listing) => {
              const href = listing.cpPcArticleUrl ?? listing.sourceUrl;
              const realtorName =
                listing.realtorName ??
                listing.originalRealtorName ??
                '중개사 미상';
              const isOwner =
                !!listing.verificationTypeCode?.startsWith('OWNER');
              const isEntered = isEnteredInSession(listing);
              const price =
                group.transactionType === 'sale'
                  ? listing.price
                  : listing.deposit;

              return (
                <div
                  key={listing.id}
                  className={cn(
                    'grid min-h-11 items-center gap-x-2 border-b border-border/70 px-3 py-1.5 last:border-b-0',
                    gridClassName,
                  )}
                >
                  <div className="text-[13px] font-semibold tabular-nums text-foreground">
                    {listing.ranking != null ? `${listing.ranking}위` : '—'}
                  </div>
                  <OwnerLabel isOwner={isOwner} />
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {realtorName}
                      </p>
                      {listing.id === group.mainExternalListingId && (
                        <NotionTag
                          title="표에 표시되는 대표 광고"
                          className="shrink-0 bg-neutral-soft text-muted-foreground-strong"
                        >
                          대표
                        </NotionTag>
                      )}
                    </div>
                    {listing.articleFeatureDesc && (
                      <p className="truncate text-xs text-muted-foreground-strong">
                        {listing.articleFeatureDesc}
                      </p>
                    )}
                  </div>
                  <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-foreground">
                    <ListingPrice
                      listing={listing}
                      transactionType={group.transactionType}
                    />
                    <PriceChangeHint
                      listing={listing}
                      transactionType={group.transactionType}
                      priceChangeSince={group.priceChangeSince}
                    />
                    {price === lowestPrice && (
                      <NotionTag className="shrink-0 bg-success-soft text-success">
                        최저
                      </NotionTag>
                    )}
                  </div>
                  <div className="truncate text-xs tabular-nums text-muted-foreground-strong">
                    {formatYmd(listing.articleConfirmYmd)}
                  </div>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex min-w-0 items-center gap-1 text-xs text-muted-foreground-strong hover:text-foreground hover:underline"
                    >
                      <span className="truncate">
                        {getExternalSourceLabel(listing.source)}
                      </span>
                      <ExternalLink className="size-3 shrink-0" />
                    </a>
                  ) : (
                    <span className="truncate text-xs text-muted-foreground-strong">
                      {getExternalSourceLabel(listing.source)}
                    </span>
                  )}
                  {session && (
                    <div className="flex items-center justify-end gap-1">
                      <NotionTag
                        className={
                          isEntered
                            ? 'bg-success-soft text-success'
                            : 'bg-neutral-soft text-muted-foreground-strong'
                        }
                      >
                        {isEntered ? '입력됨' : '미입력'}
                      </NotionTag>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        aria-label={`${realtorName} 광고 ${isEntered ? '수정' : '다시 입력'}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditing(listing);
                        }}
                        className="shrink-0 px-1.5 text-xs shadow-none"
                      >
                        {isEntered ? '수정' : '다시 입력'}
                      </Button>
                      {isEntered && (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          aria-label={`${realtorName} 광고 삭제`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setListingToRemove(listing);
                          }}
                          className="shrink-0 px-1.5 text-xs shadow-none"
                        >
                          삭제
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={listingToRemove != null}
        onOpenChange={(open) => {
          if (!open) setListingToRemove(null);
        }}
        title="이 광고를 이번 스냅샷에서 뺄까요?"
        description="이번에 처음 입력한 광고는 지워지고, 기존 광고는 스냅샷을 닫을 때 내려갑니다."
        confirmLabel="삭제"
        onConfirm={() => {
          if (listingToRemove) removeListingMutation.mutate(listingToRemove.id);
        }}
        pending={removeListingMutation.isPending}
      />
      {editing && (
        <SnapshotListingDialog
          listing={editing === 'new' ? null : editing}
          transactionType={group.transactionType}
          pending={saveListingMutation.isPending}
          onCancel={() => setEditing(null)}
          onSubmit={(values) => saveListingMutation.mutate(values)}
        />
      )}
    </div>
  );
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  pending: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{description}</p>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            돌아가기
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={pending}>
            {pending ? '처리 중...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 열린 스냅샷의 광고 추가·수정 ─────────────────────────────

interface SnapshotListingValues {
  articleNo: string;
  direction: string | null;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
  realtorName: string | null;
  representativeTelNo: string | null;
  articleFeatureDesc: string | null;
}

function SnapshotListingDialog({
  listing,
  transactionType,
  pending,
  onCancel,
  onSubmit,
}: {
  /** null이면 동일 광고 추가. */
  listing: ExternalListing | null;
  transactionType: ExternalListingTransactionType;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: SnapshotListingValues) => void;
}) {
  const toText = (value: number | null | undefined) =>
    value == null ? '' : String(value);
  const [articleNo, setArticleNo] = useState('');
  const [direction, setDirection] = useState(listing?.direction ?? '');
  const [price, setPrice] = useState(toText(listing?.price));
  const [deposit, setDeposit] = useState(toText(listing?.deposit));
  const [monthlyRent, setMonthlyRent] = useState(toText(listing?.monthlyRent));
  const [realtorName, setRealtorName] = useState(listing?.realtorName ?? '');
  const [telNo, setTelNo] = useState(listing?.representativeTelNo ?? '');
  const [feature, setFeature] = useState(listing?.articleFeatureDesc ?? '');

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{listing ? '광고 수정' : '동일 광고 추가'}</DialogTitle>
          <DialogDescription>
            {listing
              ? '저장하면 이번 스냅샷에 입력된 광고로 처리됩니다.'
              : '같은 매물의 광고로 묶어 저장합니다. 대표 광고는 바뀌지 않습니다.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-3 gap-y-3">
          {!listing && (
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">매물번호</Label>
              <Input
                placeholder="비워두면 자동 생성"
                value={articleNo}
                onChange={(event) => setArticleNo(event.target.value)}
              />
            </div>
          )}
          {transactionType === 'sale' ? (
            <div className="col-span-2 space-y-1.5">
              <Label className="text-xs">매매가 (만원)</Label>
              <Input
                type="number"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
              />
            </div>
          ) : (
            <div
              className={cn(
                'space-y-1.5',
                transactionType === 'jeonse' && 'col-span-2',
              )}
            >
              <Label className="text-xs">
                {transactionType === 'jeonse' ? '전세보증금' : '보증금'} (만원)
              </Label>
              <Input
                type="number"
                value={deposit}
                onChange={(event) => setDeposit(event.target.value)}
              />
            </div>
          )}
          {transactionType === 'monthly' && (
            <div className="space-y-1.5">
              <Label className="text-xs">월세 (만원)</Label>
              <Input
                type="number"
                value={monthlyRent}
                onChange={(event) => setMonthlyRent(event.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">등록 중개사</Label>
            <Input
              value={realtorName}
              onChange={(event) => setRealtorName(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">연락처</Label>
            <Input
              value={telNo}
              onChange={(event) => setTelNo(event.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">향</Label>
            <Input
              value={direction}
              onChange={(event) => setDirection(event.target.value)}
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label className="text-xs">특징/메모</Label>
            <Textarea
              rows={3}
              value={feature}
              onChange={(event) => setFeature(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={pending}
          >
            취소
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              onSubmit({
                articleNo,
                direction: direction.trim() || null,
                price: transactionType === 'sale' ? parseManwon(price) : null,
                deposit:
                  transactionType === 'sale' ? null : parseManwon(deposit),
                monthlyRent:
                  transactionType === 'monthly'
                    ? parseManwon(monthlyRent)
                    : null,
                realtorName: realtorName.trim() || null,
                representativeTelNo: telNo.trim() || null,
                articleFeatureDesc: feature.trim() || null,
              })
            }
          >
            {pending ? '저장 중...' : '저장'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

type ListingPriceTerms = Pick<
  ExternalListing,
  'price' | 'deposit' | 'monthlyRent'
>;

function sqmToPyeong(sqm: number | string | null | undefined): number | null {
  if (sqm == null) return null;
  const n = typeof sqm === 'string' ? parseFloat(sqm) : sqm;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n / 3.305785);
}

function formatYmd(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr.length !== 8) return '—';
  return `${dateStr.slice(2, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

function formatMonthDay(dateStr: string | null | undefined): string | null {
  if (!dateStr || !/^\d{8}$/.test(dateStr)) return null;
  const month = Number(dateStr.slice(4, 6));
  const day = Number(dateStr.slice(6, 8));
  return `${month}/${day}`;
}

const DIRECTION_LABELS: Record<string, string> = {
  E: '동향',
  EE: '동향',
  ES: '남동향',
  SE: '남동향',
  S: '남향',
  SS: '남향',
  SW: '남서향',
  WS: '남서향',
  W: '서향',
  WW: '서향',
  WN: '북서향',
  NW: '북서향',
  N: '북향',
  NN: '북향',
  NE: '북동향',
  EN: '북동향',
};

function formatListingDirection(direction: string | null | undefined): string {
  const value = direction?.trim();
  if (!value) return '—';
  return DIRECTION_LABELS[value.toUpperCase()] ?? value;
}

function getExternalSourceLabel(source: string | null | undefined): string {
  const normalized = source?.trim().toLowerCase();
  if (!normalized) return '출처';
  if (normalized.includes('naver')) return '네이버';
  if (normalized.includes('asil')) return '아실';
  if (normalized.includes('manual') || normalized.includes('수동'))
    return '입력';
  return source ?? '출처';
}

const SEANGO_REGEX = /세\s*안\s*고|갭\s*투\s*자?/;
function hasSeangoMarker(text: string | null | undefined): boolean {
  return !!text && SEANGO_REGEX.test(text);
}

function NotionTag({
  children,
  className,
  title,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  ariaLabel?: string;
}) {
  return (
    <span
      title={title}
      aria-label={ariaLabel}
      className={cn(
        'inline-flex max-w-full items-center rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-[18px]',
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

function EmptyValue() {
  return <span className="font-normal text-muted-foreground">—</span>;
}

/** 집주인 확인은 강조하고 나머지는 물러나게 해 칩 없이도 구분되게 한다. */
function OwnerLabel({ isOwner }: { isOwner: boolean }) {
  return (
    <span
      className={cn(
        'whitespace-nowrap text-[13px]',
        isOwner ? 'font-medium text-foreground' : 'text-muted-foreground',
      )}
    >
      {isOwner ? '집주인' : '중개사'}
    </span>
  );
}

/** 억과 만을 각자 칸에 맞춰 위아래로 훑을 때 자릿수가 어긋나지 않게 한다. */
function PriceAmount({ value }: { value: number | null | undefined }) {
  if (!value) return <EmptyValue />;
  const eok = Math.floor(value / 10000);
  const man = value % 10000;
  return (
    <span className="inline-flex gap-1 whitespace-nowrap tabular-nums">
      <span className="min-w-[34px] text-right">{eok > 0 ? `${eok}억` : ''}</span>
      <span className="min-w-[50px] text-right">
        {man > 0 ? `${man.toLocaleString()}만` : ''}
      </span>
    </span>
  );
}

function ListingPrice({
  listing,
  transactionType,
}: {
  listing: ListingPriceTerms | null | undefined;
  transactionType: ExternalListingTransactionType;
}) {
  if (transactionType === 'monthly') {
    return (
      <span className="inline-flex items-center whitespace-nowrap tabular-nums">
        <PriceAmount value={listing?.deposit} />
        <span className="mx-1 font-normal text-muted-foreground">/</span>
        <span className="min-w-[44px] text-right">
          {listing?.monthlyRent ? formatPrice(listing.monthlyRent) : '—'}
        </span>
      </span>
    );
  }
  return (
    <PriceAmount
      value={transactionType === 'sale' ? listing?.price : listing?.deposit}
    />
  );
}

function PriceChangeHint({
  listing,
  transactionType,
  priceChangeSince,
}: {
  listing: PriceChangeTerms | null | undefined;
  transactionType: ExternalListingTransactionType;
  priceChangeSince: string | null | undefined;
}) {
  const change = getPriceChange(listing, transactionType, priceChangeSince);
  if (!change || !listing) return null;
  const previousLabel = formatListingPrice(
    {
      price: listing.previousPrice,
      deposit: listing.previousDeposit,
      monthlyRent: listing.previousMonthlyRent,
    },
    transactionType,
  );
  const parts = [
    { key: 'main', prefix: '', amount: change.mainAmount },
    { key: 'rent', prefix: '월 ', amount: change.rentAmount },
  ];
  return (
    <span
      title={`이전 ${previousLabel}`}
      className="flex min-w-0 flex-col overflow-hidden whitespace-nowrap text-[12px] font-medium leading-[15px] tabular-nums"
    >
      <span className="sr-only">이전 {previousLabel}</span>
      {parts.map(({ key, prefix, amount }) =>
        amount == null ? null : (
          <span
            key={key}
            className={amount < 0 ? 'text-info-strong' : 'text-destructive-strong'}
          >
            {prefix}
            <span aria-hidden="true">{amount < 0 ? '▼' : '▲'}</span>
            {formatPrice(Math.abs(amount))}
            <span className="sr-only">{amount < 0 ? ' 내림' : ' 올림'}</span>
          </span>
        ),
      )}
    </span>
  );
}

function TableSummaryItem({
  label,
  count,
  dotClassName,
}: {
  label: string;
  count: number;
  dotClassName: string;
}) {
  if (count === 0) return null;
  return (
    <span className="ml-2 hidden items-center gap-1 tabular-nums lg:inline-flex">
      <span
        aria-hidden="true"
        className={cn('size-1.5 rounded-full', dotClassName)}
      />
      {label} {count.toLocaleString()}
    </span>
  );
}

// ── 범위 필터 카드 — 기본: 프리셋 Select / 상세: 듀얼 슬라이더 ─────────

interface ColumnFactoryContext {
  onUpdateMemo: (groupId: string, memo: string) => void;
  onUpdateHo: (groupId: string, ho: string) => void;
  expandedListingIds: ReadonlySet<string>;
  onToggleListings: (groupId: string) => void;
  /** 열린 스냅샷의 미입력 탭에서만 있다. */
  onKeepGroup?: (groupId: string) => void;
}

function TableHeaderLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span
      data-advertising-note-header-label
      className="inline-flex min-w-0 items-center gap-1 text-[12px] font-normal text-muted-foreground"
    >
      <span
        aria-hidden="true"
        className="shrink-0 [&>svg]:size-3 [&>svg]:text-muted-foreground/70"
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function buildColumns(
  transactionType: ExternalListingTransactionType,
  ctx: ColumnFactoryContext,
  areMarketDetailColumnsCollapsed: boolean,
): ColumnDef<ExternalListingGroup, unknown>[] {
  const columns: ColumnDef<ExternalListingGroup, unknown>[] = [];

  // ── 미입력 탭 — 다시 입력하지 않고 이번 스냅샷에 남긴다 ─────────
  const { onKeepGroup } = ctx;
  if (onKeepGroup) {
    columns.push({
      id: 'keep',
      header: () => (
        <TableHeaderLabel icon={<Check className="size-4" />} label="유지" />
      ),
      size: 68,
      enableResizing: false,
      enableSorting: false,
      cell: ({ row }) => (
        <Button
          type="button"
          variant="outline"
          size="xs"
          aria-label={`${row.original.buildingName ?? ''} ${row.original.ho ?? ''} 매물 유지`}
          onClick={(event) => {
            event.stopPropagation();
            onKeepGroup(row.original.id);
          }}
          className="px-2 text-xs shadow-none"
        >
          유지
        </Button>
      ),
    });
  }

  // ── 1. 상태 — 이전 입력과 비교한 신규/추가/기존 구분 ───────────
  columns.push({
    id: 'discoveryStatus',
    header: () => (
      <TableHeaderLabel icon={<CircleDot className="size-4" />} label="상태" />
    ),
    size: 60,
    enableResizing: false,
    enableSorting: false,
    cell: ({ row }) => {
      const status = row.original.discoveryStatus ?? 'existing';
      const meta = DISCOVERY_STATUS_META[status];
      return (
        <NotionTag
          title={meta.description}
          ariaLabel={`입력 상태 ${meta.label}. ${meta.description}`}
          className={cn('min-w-10 justify-center', meta.className)}
        >
          {meta.label}
        </NotionTag>
      );
    },
  });

  // ── 2. 내광고 — 관계 판단의 첫 기준, 실제 게시일은 월-일 ───────
  columns.push({
    id: 'myAd',
    header: () => (
      <TableHeaderLabel icon={<Megaphone className="size-4" />} label="광고" />
    ),
    size: 76,
    enableResizing: false,
    cell: ({ row }) => {
      const group = row.original;
      const postedAt = formatMonthDay(group.ownAdvertisementYmd);
      if (postedAt) {
        return (
          <span
            aria-label={`내 광고 게시일 ${formatYmd(group.ownAdvertisementYmd)}`}
            className="inline-flex max-w-full items-center gap-1 rounded-[4px] bg-info-soft px-1.5 py-0.5 text-[12px] font-medium leading-[18px] whitespace-nowrap tabular-nums text-info-strong"
          >
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-info"
            />
            {postedAt}
          </span>
        );
      }

      return (
        <span aria-label="내 광고 없음" className="pl-1.5">
          <EmptyValue />
        </span>
      );
    },
  });

  // ── 3. 주인 — 집주인 확인 여부를 내광고와 함께 고정 ───────────
  columns.push({
    id: 'owner',
    header: () => (
      <TableHeaderLabel icon={<UserRound className="size-4" />} label="주인" />
    ),
    size: 62,
    enableResizing: false,
    cell: ({ row }) => <OwnerLabel isOwner={!!row.original.ownerVerified} />,
  });

  // ── 4. 단지 — 관계 판단 뒤 매물을 식별하는 sticky 컬럼 ─────────
  columns.push({
    id: 'site',
    header: () => (
      <TableHeaderLabel icon={<Building2 className="size-4" />} label="단지" />
    ),
    size: 150,
    enableResizing: false,
    cell: ({ row }) => (
      <span
        title={row.original.site?.name}
        className="block truncate text-[13px] text-foreground"
      >
        {row.original.site?.name ?? <EmptyValue />}
      </span>
    ),
  });

  // ── 5. 동 — 단지와 별도 정렬 가능 ─────────────────────────
  columns.push({
    id: 'dong',
    header: () => (
      <TableHeaderLabel icon={<Hash className="size-4" />} label="동" />
    ),
    size: 64,
    enableResizing: false,
    cell: ({ row }) => (
      <span className="block truncate text-[13px] font-medium tabular-nums text-foreground">
        {row.original.buildingName ?? <EmptyValue />}
      </span>
    ),
  });

  // ── 6. 호 — 매물 식별에 필요한 마지막 sticky 컬럼 ───────────
  columns.push({
    id: 'ho',
    header: () => (
      <TableHeaderLabel icon={<DoorOpen className="size-4" />} label="호" />
    ),
    size: 84,
    enableResizing: false,
    meta: {
      cellClassName: 'hover:bg-muted',
    },
    cell: ({ row }) => (
      <HoCell
        groupId={row.original.id}
        initial={row.original.ho}
        onSave={ctx.onUpdateHo}
      />
    ),
  });

  // ── 7. 층 (floorInfo: 저/중/고 또는 층수/전체층) ───────────
  columns.push({
    id: 'floor',
    header: () => (
      <TableHeaderLabel icon={<Layers3 className="size-4" />} label="층" />
    ),
    size: 62,
    enableResizing: false,
    cell: ({ row }) => (
      <span className="block truncate text-[13px] tabular-nums text-muted-foreground-strong">
        {row.original.mainExternalListing?.floorInfo ?? <EmptyValue />}
      </span>
    ),
  });

  // ── 8. 타입 — 외부 광고의 평형 타입 식별값 ─────────────────
  columns.push({
    id: 'type',
    header: () => (
      <TableHeaderLabel icon={<Tag className="size-4" />} label="타입" />
    ),
    size: 64,
    cell: ({ row }) => (
      <span className="block truncate text-[13px] text-muted-foreground-strong">
        {row.original.areaName ?? <EmptyValue />}
      </span>
    ),
  });

  // ── 9. 면적 — 전용/공급 평을 독립된 숫자 열로 표시 ───────────
  columns.push({
    id: 'area',
    header: () => (
      <TableHeaderLabel icon={<Ruler className="size-4" />} label="면적" />
    ),
    size: 78,
    cell: ({ row }) => {
      const g = row.original;
      const main = g.mainExternalListing;
      const exclusivePyeong = sqmToPyeong(
        main?.exclusiveAreaM2 ?? g.exclusiveAreaM2,
      );
      const supplyPyeong = sqmToPyeong(main?.supplyAreaM2);
      const areaLabel =
        exclusivePyeong != null
          ? `${exclusivePyeong}${supplyPyeong != null ? `/${supplyPyeong}` : ''}평`
          : supplyPyeong != null
            ? `${supplyPyeong}평`
            : '-';
      const areaDescription =
        exclusivePyeong != null
          ? `전용 ${exclusivePyeong}평${supplyPyeong != null ? ` · 공급 ${supplyPyeong}평` : ''}`
          : supplyPyeong != null
            ? `공급 ${supplyPyeong}평`
            : undefined;

      return (
        <span
          aria-label={areaDescription}
          title={areaDescription}
          className="block truncate whitespace-nowrap text-[13px] tabular-nums text-muted-foreground-strong"
        >
          {areaLabel}
        </span>
      );
    },
  });

  // ── 10. 랭킹 (내 광고 순위/동일주소 개수) ─────────────────
  columns.push({
    id: 'duplicate',
    header: () => (
      <TableHeaderLabel
        icon={<ListOrdered className="size-4" />}
        label="랭킹"
      />
    ),
    size: 68,
    cell: ({ row }) => {
      const g = row.original;
      const ranking = g.offerRanking ?? null;
      const sameAddrCnt =
        g.mainExternalListing?.sameAddrCnt ?? g.listingCount ?? null;
      const isOpen = ctx.expandedListingIds.has(g.id);
      const hasOwnAd = !!formatMonthDay(g.ownAdvertisementYmd);
      // 내 광고가 1위가 아니면 밀린 것이므로 드러낸다.
      const isOwnAdBehind = hasOwnAd && ranking != null && ranking > 1;
      const hasCompetition = (sameAddrCnt ?? 0) > 1;
      const detailLabel = ranking
        ? `${hasOwnAd ? '내 광고' : '대표 광고'} ${ranking}위, 동일주소 ${sameAddrCnt ?? 0}개`
        : `동일주소 ${sameAddrCnt ?? 0}개`;
      return (
        <div
          className="-mx-1 flex h-full items-center"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Button
            type="button"
            variant={isOpen ? 'secondary' : 'ghost'}
            size="xs"
            aria-expanded={isOpen}
            aria-controls={`external-listing-rank-panel-${g.id}`}
            aria-label={`${detailLabel} 광고 상세 ${isOpen ? '접기' : '펼치기'}`}
            title={isOpen ? '동일주소 광고 접기' : '동일주소 광고 펼치기'}
            onClick={() => ctx.onToggleListings(g.id)}
            className="gap-0.5 px-1 text-[13px] font-normal tabular-nums shadow-none"
          >
            {ranking && sameAddrCnt ? (
              <>
                <span
                  className={cn(
                    'font-semibold',
                    isOwnAdBehind
                      ? 'text-warning-strong'
                      : hasCompetition
                        ? 'text-foreground'
                        : 'text-muted-foreground',
                  )}
                >
                  {ranking}
                </span>
                <span className="text-muted-foreground">/{sameAddrCnt}</span>
              </>
            ) : (
              <span className="text-muted-foreground">
                {sameAddrCnt != null ? `${sameAddrCnt}개` : '—'}
              </span>
            )}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'size-3 text-muted-foreground transition-transform duration-150',
                isOpen && 'rotate-180',
              )}
            />
          </Button>
        </div>
      );
    },
  });

  // ── 11. 가격 (탭별 다름) ──────────────────────────────────
  columns.push({
    id: 'price',
    header: () => (
      <TableHeaderLabel
        icon={<CircleDollarSign className="size-4" />}
        label={
          transactionType === 'sale'
            ? '매매가'
            : transactionType === 'jeonse'
              ? '전세가'
              : '보증금/월세'
        }
      />
    ),
    size: transactionType === 'monthly' ? 238 : 186,
    cell: ({ row }) => (
      <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold text-foreground">
        <ListingPrice
          listing={row.original.mainExternalListing}
          transactionType={transactionType}
        />
        <PriceChangeHint
          listing={row.original.mainExternalListing}
          transactionType={transactionType}
          priceChangeSince={row.original.priceChangeSince}
        />
      </div>
    ),
  });

  // ── 11–12. 동일주소 활성 광고의 최소·최대 가격 ─────────────
  const rangePriceColumnSize = transactionType === 'monthly' ? 124 : 112;
  columns.push({
    id: 'priceMin',
    header: () => (
      <TableHeaderLabel
        icon={<TrendingDown className="size-4" />}
        label={transactionType === 'monthly' ? '최소보증금' : '최소가'}
      />
    ),
    size: rangePriceColumnSize,
    cell: ({ row }) => (
      <span className="text-[13px] text-muted-foreground-strong">
        <PriceAmount value={row.original.priceMin} />
      </span>
    ),
  });

  columns.push({
    id: 'priceMax',
    header: () => (
      <TableHeaderLabel
        icon={<TrendingUp className="size-4" />}
        label={transactionType === 'monthly' ? '최대보증금' : '최대가'}
      />
    ),
    size: rangePriceColumnSize,
    cell: ({ row }) => (
      <span className="text-[13px] text-muted-foreground-strong">
        <PriceAmount value={row.original.priceMax} />
      </span>
    ),
  });

  // ── 14. 방향 — 입력된 원본 코드를 사용자 표기로 변환 ────────
  columns.push({
    id: 'direction',
    header: () => (
      <TableHeaderLabel icon={<Compass className="size-4" />} label="방향" />
    ),
    size: 72,
    cell: ({ row }) => (
      <span className="block truncate text-[13px] text-muted-foreground-strong">
        {formatListingDirection(row.original.mainExternalListing?.direction)}
      </span>
    ),
  });

  // ── 15. 매물특징 — 입력된 광고 원문 요약 ───────────
  columns.push({
    id: 'features',
    header: () => (
      <TableHeaderLabel
        icon={<FileText className="size-4" />}
        label="매물특징"
      />
    ),
    size: 280,
    minSize: 220,
    enableSorting: false,
    cell: ({ row }) => {
      const g = row.original;
      const main = g.mainExternalListing;
      const desc = main?.articleFeatureDesc ?? '';
      const seango = hasSeangoMarker(desc) || hasSeangoMarker(g.memo);
      return (
        <div
          className="flex min-w-0 items-center gap-1.5 text-[13px] text-foreground"
          title={desc || undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {seango && (
            <NotionTag className="shrink-0 bg-neutral-soft text-neutral-strong">
              세안고
            </NotionTag>
          )}
          {desc ? (
            <span className="truncate">{desc}</span>
          ) : !seango ? (
            <EmptyValue />
          ) : null}
        </div>
      );
    },
  });

  // ── 16. 내 메모 — 사무소 전용 편집 데이터 ──────────────────
  columns.push({
    id: 'memo',
    header: () => (
      <TableHeaderLabel
        icon={<FileText className="size-4" />}
        label="내 메모"
      />
    ),
    // 유지 칸이 생겨도 1440px 창에서 표가 옆으로 넘치지 않게 메모가 양보한다.
    size: (transactionType === 'monthly' ? 178 : 230) - (onKeepGroup ? 68 : 0),
    minSize: 110,
    enableSorting: false,
    meta: {
      fill: true,
      cellClassName: 'hover:bg-muted/50',
    },
    cell: ({ row }) => (
      <MemoCell
        groupId={row.original.id}
        initial={row.original.memo}
        onSave={ctx.onUpdateMemo}
      />
    ),
  });

  return columns.filter((column) => {
    const columnId = column.id ?? '';
    if (
      areMarketDetailColumnsCollapsed &&
      MARKET_DETAIL_COLUMN_ID_SET.has(columnId)
    ) {
      return false;
    }
    return true;
  });
}

// ── Property-table style text editors ───────────────────────────

function HoCell({
  groupId,
  initial,
  onSave,
}: {
  groupId: string;
  initial: string | null;
  onSave: (groupId: string, ho: string) => void;
}) {
  const value = initial?.trim() ?? '';

  return (
    <EditableCell
      recordId={groupId}
      field="ho"
      value={value}
      onSave={(recordId, _field, nextValue) => {
        const next = String(nextValue ?? '').trim();
        if (next === value) return;
        onSave(recordId, next);
      }}
      editType="text"
      activation="doubleClick"
      portalAnchor="tableCell"
      editorChrome="floating"
      hoverHighlight={false}
    >
      <span
        title="더블클릭해서 호수 입력"
        className="flex h-full w-full items-center truncate text-[13px] font-medium tabular-nums text-foreground"
      >
        {value || <EmptyValue />}
      </span>
    </EditableCell>
  );
}

function MemoCell({
  groupId,
  initial,
  onSave,
}: {
  groupId: string;
  initial: string | null;
  onSave: (groupId: string, memo: string) => void;
}) {
  const value = initial ?? '';
  const displayValue = value.trim();

  return (
    <EditableCell
      recordId={groupId}
      field="memo"
      value={value}
      onSave={(recordId, _field, nextValue) => {
        const next = String(nextValue ?? '');
        if (next === value) return;
        onSave(recordId, next);
      }}
      editType="text"
      activation="doubleClick"
      portalAnchor="tableCell"
      editorChrome="floating"
      hoverHighlight={false}
    >
      <span
        title={displayValue || '더블클릭해서 메모 입력'}
        className="block w-full truncate text-[13px] text-foreground"
      >
        {displayValue || <EmptyValue />}
      </span>
    </EditableCell>
  );
}

function formatListingPrice(
  listing: {
    price: number | null;
    deposit: number | null;
    monthlyRent: number | null;
  },
  transactionType: ExternalListingTransactionType,
) {
  if (transactionType === 'monthly') {
    const deposit = listing.deposit ? formatPrice(listing.deposit) : '-';
    const monthlyRent = listing.monthlyRent
      ? formatPrice(listing.monthlyRent)
      : '-';
    return `${deposit} / ${monthlyRent}`;
  }
  if (transactionType === 'jeonse') {
    return listing.deposit ? formatPrice(listing.deposit) : '-';
  }
  return listing.price ? formatPrice(listing.price) : '-';
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

interface ManualEntryForm {
  siteId: string;
  transactionType: ExternalListingTransactionType;
  articleNo: string;
  dongId: string;
  ho: string;
  siteUnitTypeId: string;
  direction: string;
  price: string;
  deposit: string;
  monthlyRent: string;
  realtorName: string;
  representativeTelNo: string;
  articleFeatureDesc: string;
  /** 같은 매물의 묶음을 만든 첫 광고. 저장할 때 한 묶음으로 보낸다. */
  duplicateOfClientId?: string;
}

interface ManualEntryDraft extends ManualEntryForm {
  clientId: string;
}

function createInitialForm(
  siteId: string | undefined,
  transactionType: ExternalListingTransactionType,
): ManualEntryForm {
  return {
    siteId: siteId ?? '',
    transactionType,
    articleNo: '',
    dongId: '',
    ho: '',
    siteUnitTypeId: '',
    direction: '',
    price: '',
    deposit: '',
    monthlyRent: '',
    realtorName: '',
    representativeTelNo: '',
    articleFeatureDesc: '',
  };
}

function parseManwon(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function createManualEntryDraft(
  form: ManualEntryForm,
  clientId = `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
): ManualEntryDraft {
  return {
    ...form,
    clientId,
    articleNo: form.articleNo.trim() || generateManualArticleNo(),
  };
}

function generateManualArticleNo(): string {
  return `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatManualEntryDraftPrice(draft: ManualEntryDraft): string {
  if (draft.transactionType === 'monthly') {
    const deposit = parseManwon(draft.deposit);
    const monthlyRent = parseManwon(draft.monthlyRent);
    return `${deposit == null ? '-' : formatPrice(deposit)} / ${monthlyRent == null ? '-' : formatPrice(monthlyRent)}`;
  }

  const amount = parseManwon(
    draft.transactionType === 'sale' ? draft.price : draft.deposit,
  );
  return amount == null ? '가격 미입력' : formatPrice(amount);
}

function ManualEntryDialog({
  open,
  onOpenChange,
  siteOptions,
  defaultSiteId,
  defaultTransactionType,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  siteOptions: MultiSelectOption[];
  defaultSiteId: string | undefined;
  defaultTransactionType: ExternalListingTransactionType;
  onSuccess: (siteId: string, transactionType: ExternalListingTransactionType) => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ManualEntryForm>(() =>
    createInitialForm(defaultSiteId, defaultTransactionType),
  );
  const [drafts, setDrafts] = useState<ManualEntryDraft[]>([]);
  const [showDraftDialog, setShowDraftDialog] = useState(false);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [isDuplicatingDraft, setIsDuplicatingDraft] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(createInitialForm(defaultSiteId, defaultTransactionType));
    setDrafts([]);
    setShowDraftDialog(false);
    setEditingDraftId(null);
    setIsDuplicatingDraft(false);
    setSubmittedCount(0);
    setErrorMessage(null);
  }, [defaultSiteId, defaultTransactionType, open]);

  const {
    data: entrySession = null,
    isLoading: isEntrySessionLoading,
    isError: isEntrySessionError,
    refetch: refetchEntrySession,
  } = useQuery({
    queryKey: [
      'external-listing-active-session',
      form.siteId,
      form.transactionType,
    ],
    queryFn: () =>
      api.externalListings.getActiveSession(form.siteId, form.transactionType),
    enabled: open && !!form.siteId,
  });

  const { data: siteDetail } = useQuery({
    queryKey: ['site-detail', form.siteId],
    queryFn: () => api.sites.findOne(form.siteId),
    enabled: !!form.siteId,
  });

  const { data: dongs = [] } = useQuery({
    queryKey: ['dongs', form.siteId],
    queryFn: () => api.dongs.findAll(form.siteId),
    enabled: !!form.siteId,
  });

  const siteUnitTypes = siteDetail?.siteUnitTypes ?? [];

  const visibleDongs = useMemo(
    () => dongs.filter((d) => !d.isPlaceholder),
    [dongs],
  );

  const draftListViewportRef = useRef<HTMLDivElement>(null);
  const draftListVirtualizer = useVirtualizer({
    count: drafts.length,
    getScrollElement: () => draftListViewportRef.current,
    estimateSize: () => 52,
    getItemKey: (index) => drafts[index]?.clientId ?? index,
    overscan: 8,
  });

  const resetForm = () => {
    setForm(createInitialForm(defaultSiteId, defaultTransactionType));
    setDrafts([]);
    setShowDraftDialog(false);
    setEditingDraftId(null);
    setIsDuplicatingDraft(false);
    setSubmittedCount(0);
    setErrorMessage(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const handleDraftDialogOpenChange = (next: boolean) => {
    setShowDraftDialog(next);
    if (!next) {
      setForm(createInitialForm(form.siteId, form.transactionType));
      setEditingDraftId(null);
      setIsDuplicatingDraft(false);
      setErrorMessage(null);
    }
  };

  const openNewDraftDialog = () => {
    setForm(createInitialForm(form.siteId, form.transactionType));
    setEditingDraftId(null);
    setIsDuplicatingDraft(false);
    setErrorMessage(null);
    setShowDraftDialog(true);
  };

  const openDraftForEditing = (draft: ManualEntryDraft) => {
    setForm(draft);
    setEditingDraftId(draft.clientId);
    setIsDuplicatingDraft(false);
    setErrorMessage(null);
    setShowDraftDialog(true);
  };

  const openDuplicateDraft = (draft: ManualEntryDraft) => {
    setForm({
      ...createInitialForm(draft.siteId, draft.transactionType),
      dongId: draft.dongId,
      ho: draft.ho,
      siteUnitTypeId: draft.siteUnitTypeId,
      direction: draft.direction,
      duplicateOfClientId: draft.duplicateOfClientId ?? draft.clientId,
    });
    setEditingDraftId(null);
    setIsDuplicatingDraft(true);
    setErrorMessage(null);
    setShowDraftDialog(true);
  };

  const commitDraftToList = () => {
    if (!editingDraftId && drafts.length >= MAX_MANUAL_ENTRY_DRAFTS) {
      setErrorMessage(
        `한 번에 최대 ${MAX_MANUAL_ENTRY_DRAFTS.toLocaleString('ko-KR')}건까지 등록할 수 있습니다.`,
      );
      setShowDraftDialog(false);
      return;
    }
    const nextDraft = createManualEntryDraft(form, editingDraftId ?? undefined);
    setDrafts((current) =>
      editingDraftId
        ? current.map((draft) =>
            draft.clientId === editingDraftId ? nextDraft : draft,
          )
        : [...current, nextDraft],
    );
    setForm(createInitialForm(form.siteId, form.transactionType));
    setEditingDraftId(null);
    setIsDuplicatingDraft(false);
    setErrorMessage(null);
    setShowDraftDialog(false);
  };

  const removeDraft = (clientId: string) => {
    setDrafts((current) =>
      current.filter((draft) => draft.clientId !== clientId),
    );
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.siteId) throw new Error('단지를 선택하세요.');
      if (drafts.length === 0) throw new Error('등록할 광고를 추가하세요.');
      if (drafts.length > MAX_MANUAL_ENTRY_DRAFTS) {
        throw new Error(
          `한 번에 최대 ${MAX_MANUAL_ENTRY_DRAFTS.toLocaleString('ko-KR')}건까지 등록할 수 있습니다.`,
        );
      }
      setSubmittedCount(0);
      const session =
        entrySession ??
        (await api.externalListings.createSession({
          siteId: form.siteId,
          transactionType: form.transactionType,
        }));

      // 중복매물로 추가한 광고는 첫 광고를 대표로 한 묶음에 넣는다.
      const groupsByRoot = new Map<string, ListingGroupInput>();
      for (const draft of drafts) {
        const dong = dongs.find((item) => item.id === draft.dongId);
        const unitType = siteUnitTypes.find(
          (item) => item.id === draft.siteUnitTypeId,
        );
        const listing = {
          articleNo: draft.articleNo,
          buildingName: dong?.name ?? null,
          ho: draft.ho.trim() || null,
          areaName: unitType?.name ?? null,
          exclusiveAreaM2: unitType?.exclusiveAreaM2 ?? null,
          supplyAreaM2: unitType?.supplyAreaM2 ?? null,
          direction: draft.direction.trim() || unitType?.direction || null,
          price:
            draft.transactionType === 'sale' ? parseManwon(draft.price) : null,
          deposit:
            draft.transactionType === 'sale'
              ? null
              : parseManwon(draft.deposit),
          monthlyRent:
            draft.transactionType === 'monthly'
              ? parseManwon(draft.monthlyRent)
              : null,
          realtorName: draft.realtorName.trim() || null,
          representativeTelNo: draft.representativeTelNo.trim() || null,
          articleFeatureDesc: draft.articleFeatureDesc.trim() || null,
        };
        const rootId = draft.duplicateOfClientId ?? draft.clientId;
        const bundle = groupsByRoot.get(rootId);
        if (bundle) {
          bundle.listings.push(listing);
        } else {
          groupsByRoot.set(rootId, {
            representativeArticleNo: listing.articleNo,
            listings: [listing],
          });
        }
      }

      // 요청당 건수 제한 안에서 묶음을 쪼개지 않고 나눠 보낸다.
      const chunks: ListingGroupInput[][] = [];
      let chunk: ListingGroupInput[] = [];
      let chunkCount = 0;
      for (const bundle of groupsByRoot.values()) {
        if (
          chunk.length > 0 &&
          chunkCount + bundle.listings.length > EXTERNAL_LISTING_BATCH_SIZE
        ) {
          chunks.push(chunk);
          chunk = [];
          chunkCount = 0;
        }
        chunk.push(bundle);
        chunkCount += bundle.listings.length;
      }
      if (chunk.length > 0) chunks.push(chunk);

      let submitted = 0;
      for (const groups of chunks) {
        await api.externalListings.batchUpsert({
          sessionId: session.id,
          source: 'manual',
          groups,
        });
        submitted += groups.reduce(
          (sum, bundle) => sum + bundle.listings.length,
          0,
        );
        setSubmittedCount(submitted);
      }
    },
    onSuccess: () => {
      onSuccess(form.siteId, form.transactionType);
      resetForm();
      onOpenChange(false);
    },
    onError: (err) => {
      setErrorMessage(
        err instanceof Error ? err.message : '등록에 실패했습니다.',
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ['external-listing-active-session'],
      });
    },
  });

  const selectedSiteLabel =
    siteOptions.find((site) => site.value === form.siteId)?.label ??
    '선택한 단지';
  const selectedTransactionLabel =
    transactionTypes.find((type) => type.value === form.transactionType)
      ?.label ?? '';

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b border-border/70 px-5 pb-4 pt-5">
          <DialogTitle>광고 입력</DialogTitle>
          <DialogDescription>
            단지와 거래유형을 고정한 뒤 광고를 하나씩 목록에 추가하세요.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pt-4">
          <div className="rounded-lg border border-border bg-muted/20 p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_132px] gap-2">
              <div className="min-w-0 space-y-1.5">
                <Label className="text-xs font-medium text-foreground">
                  입력할 단지 *
                </Label>
                <Select
                  value={form.siteId}
                  disabled={drafts.length > 0}
                  onValueChange={(siteId) => {
                    setForm((current) => ({
                      ...current,
                      siteId,
                      dongId: '',
                      ho: '',
                      siteUnitTypeId: '',
                    }));
                    setErrorMessage(null);
                  }}
                >
                  <SelectTrigger className="h-9 w-full bg-white">
                    <SelectValue placeholder="단지를 선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {siteOptions.map((site) => (
                      <SelectItem key={site.value} value={site.value}>
                        {site.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-foreground">
                  거래유형 *
                </Label>
                <Select
                  value={form.transactionType}
                  disabled={drafts.length > 0}
                  onValueChange={(value) => {
                    setForm((current) => ({
                      ...current,
                      transactionType: value as ExternalListingTransactionType,
                      price: '',
                      deposit: '',
                      monthlyRent: '',
                    }));
                    setErrorMessage(null);
                  }}
                >
                  <SelectTrigger className="h-9 w-full bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sale">매매</SelectItem>
                    <SelectItem value="jeonse">전세</SelectItem>
                    <SelectItem value="monthly">월세</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {drafts.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                목록에 광고가 있어 단지와 거래유형을 고정했습니다. 목록을 비우면
                다시 선택할 수 있습니다.
              </p>
            )}

            {form.siteId && (
              <div
                aria-live="polite"
                className={cn(
                  'mt-2.5 flex min-h-8 items-center gap-2 rounded-md px-2.5 text-xs',
                  isEntrySessionError
                    ? 'bg-destructive-soft text-destructive'
                    : entrySession
                      ? 'bg-success-soft text-success'
                      : 'bg-warning-soft/60 text-foreground',
                )}
              >
                {isEntrySessionLoading ? (
                  <>
                    <RefreshCw className="size-3.5 animate-spin text-muted-foreground" />
                    <span className="text-muted-foreground">
                      스냅샷 상태를 확인하는 중입니다.
                    </span>
                  </>
                ) : isEntrySessionError ? (
                  <>
                    <XCircle className="size-3.5" />
                    <span>스냅샷 상태를 확인하지 못했습니다.</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      className="ml-auto h-6 px-2"
                      onClick={() => refetchEntrySession()}
                    >
                      다시 확인
                    </Button>
                  </>
                ) : entrySession ? (
                  <>
                    <CheckCircle className="size-3.5" />
                    <span>진행 중인 스냅샷에 입력됩니다.</span>
                  </>
                ) : (
                  <>
                    <CircleDot className="size-3.5 text-warning" />
                    <span>등록과 함께 이 단지의 새 스냅샷을 시작합니다.</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 pb-4 pt-4">
          {!form.siteId ? (
            <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-muted/15 px-6 text-center">
              <span className="mb-3 flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Building2 className="size-4" />
              </span>
              <p className="text-sm font-medium text-foreground">
                먼저 단지를 선택하세요
              </p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
                선택한 단지와 거래유형을 기준으로 동·평형 정보를 불러오고
                광고노트를 저장합니다.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-foreground">
                      입력 목록
                    </h3>
                    <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                      {drafts.length.toLocaleString('ko-KR')}건
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    한 번에 최대{' '}
                    {MAX_MANUAL_ENTRY_DRAFTS.toLocaleString('ko-KR')}건까지
                    등록할 수 있습니다.
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {drafts.length > 0 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => {
                        setDrafts([]);
                        setErrorMessage(null);
                      }}
                    >
                      목록 비우기
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={drafts.length >= MAX_MANUAL_ENTRY_DRAFTS}
                    onClick={openNewDraftDialog}
                  >
                    <Plus className="size-3.5" />
                    광고 추가
                  </Button>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-border bg-white">
                {drafts.length === 0 ? (
                  <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
                    <span className="mb-3 flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <ListOrdered className="size-4" />
                    </span>
                    <p className="text-sm font-medium text-foreground">
                      아직 추가한 광고가 없습니다
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      광고 추가를 눌러 1건씩 입력하면 여기에 쌓입니다.
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      className="mt-4"
                      onClick={openNewDraftDialog}
                    >
                      <Plus className="size-3.5" />첫 광고 추가
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-[32px_minmax(132px,1.25fr)_minmax(92px,.75fr)_minmax(112px,.85fr)_minmax(120px,1fr)_94px] items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[10.5px] font-medium text-muted-foreground">
                      <span>#</span>
                      <span>동 · 호</span>
                      <span>평형</span>
                      <span>가격</span>
                      <span>등록 중개사</span>
                      <span className="text-right">관리</span>
                    </div>
                    <div
                      ref={draftListViewportRef}
                      className="max-h-[32vh] overflow-y-auto"
                    >
                      <div
                        className="relative w-full"
                        style={{
                          height: `${draftListVirtualizer.getTotalSize()}px`,
                        }}
                      >
                        {draftListVirtualizer
                          .getVirtualItems()
                          .map((virtualRow) => {
                            const index = virtualRow.index;
                            const draft = drafts[index];
                            if (!draft) return null;
                            const dongName = dongs.find(
                              (dong) => dong.id === draft.dongId,
                            )?.name;
                            const unitTypeName = siteUnitTypes.find(
                              (unitType) =>
                                unitType.id === draft.siteUnitTypeId,
                            )?.name;
                            const location = [dongName, draft.ho.trim()]
                              .filter(Boolean)
                              .join(' · ');

                            return (
                              <div
                                key={draft.clientId}
                                ref={draftListVirtualizer.measureElement}
                                data-index={virtualRow.index}
                                className={cn(
                                  'absolute left-0 top-0 grid w-full grid-cols-[32px_minmax(132px,1.25fr)_minmax(92px,.75fr)_minmax(112px,.85fr)_minmax(120px,1fr)_94px] items-center gap-2 border-b border-border/70 px-3 py-2.5 text-xs hover:bg-muted/15',
                                  index === drafts.length - 1 && 'border-b-0',
                                )}
                                style={{
                                  transform: `translateY(${virtualRow.start}px)`,
                                }}
                              >
                                <span className="tabular-nums text-muted-foreground">
                                  {index + 1}
                                </span>
                                <span className="truncate font-medium text-foreground">
                                  {draft.duplicateOfClientId && (
                                    <span className="mr-1 text-muted-foreground">
                                      동일
                                    </span>
                                  )}
                                  {location || '동·호 미입력'}
                                </span>
                                <span className="truncate text-muted-foreground">
                                  {unitTypeName || '-'}
                                </span>
                                <span className="truncate font-medium tabular-nums text-foreground">
                                  {formatManualEntryDraftPrice(draft)}
                                </span>
                                <div className="min-w-0">
                                  <p className="truncate text-foreground">
                                    {draft.realtorName.trim() ||
                                      '중개사 미입력'}
                                  </p>
                                  {draft.representativeTelNo.trim() && (
                                    <p className="truncate text-[10.5px] text-muted-foreground">
                                      {draft.representativeTelNo.trim()}
                                    </p>
                                  )}
                                </div>
                                <div className="flex justify-end gap-0.5">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    title="중복매물 추가"
                                    aria-label={`${index + 1}번째 광고를 중복매물로 추가`}
                                    disabled={
                                      drafts.length >= MAX_MANUAL_ENTRY_DRAFTS
                                    }
                                    onClick={() => openDuplicateDraft(draft)}
                                  >
                                    <CopyPlus className="size-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    aria-label={`${index + 1}번째 광고 수정`}
                                    onClick={() => openDraftForEditing(draft)}
                                  >
                                    <Pencil className="size-3" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-xs"
                                    className="text-muted-foreground hover:text-destructive"
                                    aria-label={`${index + 1}번째 광고 삭제`}
                                    onClick={() => removeDraft(draft.clientId)}
                                  >
                                    <Trash2 className="size-3" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {errorMessage && (
            <p className="mt-3 text-xs text-destructive">{errorMessage}</p>
          )}
        </div>

        <DialogFooter className="border-t border-border/70 px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
          >
            취소
          </Button>
          <Button
            size="sm"
            disabled={
              !form.siteId ||
              drafts.length === 0 ||
              isEntrySessionLoading ||
              isEntrySessionError ||
              mutation.isPending
            }
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? `${submittedCount.toLocaleString('ko-KR')}/${drafts.length.toLocaleString('ko-KR')}건 등록 중...`
              : !form.siteId
                ? '단지를 먼저 선택하세요'
                : drafts.length === 0
                  ? '광고를 추가하세요'
                  : isEntrySessionLoading
                    ? '확인 중...'
                    : entrySession
                      ? `${drafts.length.toLocaleString('ko-KR')}건 등록`
                      : `${drafts.length.toLocaleString('ko-KR')}건 시작하고 등록`}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={showDraftDialog} onOpenChange={handleDraftDialogOpenChange}>
        <DialogContent className="z-[70] max-h-[calc(100vh-2rem)] gap-0 overflow-hidden p-0 shadow-2xl sm:max-w-xl">
          <DialogHeader className="border-b border-border/70 px-5 pb-4 pt-5">
            <DialogTitle>
              {editingDraftId
                ? '광고 수정'
                : isDuplicatingDraft
                  ? '중복매물 추가'
                  : '광고 1건 추가'}
            </DialogTitle>
            <DialogDescription>
              {isDuplicatingDraft
                ? '동·호·평형·향만 복사했습니다. 같은 매물의 광고로 묶어 저장합니다.'
                : `${selectedSiteLabel} · ${selectedTransactionLabel} 광고 내용을 입력하세요.`}
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-2 gap-x-3 gap-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">동</Label>
                <Select
                  value={form.dongId}
                  onValueChange={(dongId) =>
                    setForm((current) => ({ ...current, dongId }))
                  }
                  disabled={visibleDongs.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        visibleDongs.length === 0 ? '동 정보 없음' : '동 선택'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleDongs.map((dong) => (
                      <SelectItem key={dong.id} value={dong.id}>
                        {dong.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">호수</Label>
                <Input
                  placeholder="예: 1503호"
                  value={form.ho}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      ho: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">평형</Label>
                <Select
                  value={form.siteUnitTypeId}
                  onValueChange={(siteUnitTypeId) =>
                    setForm((current) => ({ ...current, siteUnitTypeId }))
                  }
                  disabled={siteUnitTypes.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={
                        siteUnitTypes.length === 0
                          ? '평형 정보 없음'
                          : '평형 선택'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {siteUnitTypes.map((unitType) => (
                      <SelectItem key={unitType.id} value={unitType.id}>
                        {unitType.name}
                        {unitType.exclusiveAreaM2
                          ? ` · 전용 ${Number(unitType.exclusiveAreaM2).toFixed(2)}㎡`
                          : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">향</Label>
                <Input
                  placeholder="예: 남향"
                  value={form.direction}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      direction: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">매물번호</Label>
                <Input
                  placeholder="비워두면 자동 생성"
                  value={form.articleNo}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      articleNo: event.target.value,
                    }))
                  }
                />
              </div>

              {form.transactionType === 'sale' && (
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">매매가 (만원)</Label>
                  <Input
                    type="number"
                    placeholder="예: 158000"
                    value={form.price}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        price: event.target.value,
                      }))
                    }
                  />
                </div>
              )}

              {form.transactionType === 'jeonse' && (
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">전세보증금 (만원)</Label>
                  <Input
                    type="number"
                    placeholder="예: 80000"
                    value={form.deposit}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        deposit: event.target.value,
                      }))
                    }
                  />
                </div>
              )}

              {form.transactionType === 'monthly' && (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs">보증금 (만원)</Label>
                    <Input
                      type="number"
                      placeholder="예: 5000"
                      value={form.deposit}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          deposit: event.target.value,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">월세 (만원)</Label>
                    <Input
                      type="number"
                      placeholder="예: 150"
                      value={form.monthlyRent}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          monthlyRent: event.target.value,
                        }))
                      }
                    />
                  </div>
                </>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs">등록 중개사</Label>
                <Input
                  placeholder="예: 강동부동산"
                  value={form.realtorName}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      realtorName: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">연락처</Label>
                <Input
                  placeholder="예: 02-0000-0000"
                  value={form.representativeTelNo}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      representativeTelNo: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="col-span-2 space-y-1.5">
                <Label className="text-xs">특징/메모</Label>
                <Textarea
                  rows={3}
                  placeholder="매물 특징, 확인 사항 등"
                  value={form.articleFeatureDesc}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      articleFeatureDesc: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border/70 px-5 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleDraftDialogOpenChange(false)}
            >
              취소
            </Button>
            <Button type="button" size="sm" onClick={commitDraftToList}>
              {editingDraftId
                ? '목록에 반영'
                : isDuplicatingDraft
                  ? '중복매물로 추가'
                  : '목록에 추가'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}

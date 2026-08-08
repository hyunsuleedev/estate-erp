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
  Lock,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Ruler,
  Search,
  Tag,
  Trash2,
  TrendingDown,
  TrendingUp,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import type {
  ExternalListingDiscoveryStatus,
  ExternalListingGroup,
  ExternalListingTransactionType,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  MultiSelect,
  type MultiSelectOption,
} from '@/components/ui/multi-select';
import { sortExternalListingGroups } from './-external-listing-sort';

const transactionTypes: Array<{
  value: ExternalListingTransactionType;
  label: string;
}> = [
  { value: 'sale', label: '매매' },
  { value: 'jeonse', label: '전세' },
  { value: 'monthly', label: '월세' },
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
    className: 'bg-[#e8f3ec] text-[#2f6b45]',
  },
  added: {
    label: '추가',
    description: '기존 매물에 새로운 광고가 추가됐습니다.',
    className: 'bg-[#fdecc8] text-[#8a5d16]',
  },
  existing: {
    label: '기존',
    description: '이전 자료에도 동일한 광고가 있습니다.',
    className: 'bg-[#f1f1ef] text-[#787774]',
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
  // 범위 카드의 '상세'(듀얼 슬라이더) 모드 토글
  const [priceDetailMode, setPriceDetailMode] = useState(false);
  const [monthlyDetailMode, setMonthlyDetailMode] = useState(false);
  const [showManualDialog, setShowManualDialog] = useState(false);
  const [innerTab, setInnerTab] = useState<'new' | 'old'>('new');
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
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

  const { data: activeSession = null } = useQuery({
    queryKey: ['external-listing-active-session', scopeSiteId, transactionType],
    queryFn: () =>
      api.externalListings.getActiveSession(scopeSiteId!, transactionType),
    enabled: !!scopeSiteId,
  });

  // 거래유형/단지 전환 시 innerTab은 'new'로 리셋.
  useEffect(() => {
    setInnerTab('new');
  }, [scopeSiteId, transactionType]);

  const {
    data: groups = [],
    isLoading,
    isError: isGroupsError,
    refetch: refetchGroups,
  } = useQuery({
    queryKey: [
      'external-listing-groups',
      transactionType,
      selectedSiteIds,
      searchQuery,
      activeSession?.id,
      innerTab,
    ],
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

  const completeSessionMutation = useMutation({
    mutationFn: () => api.externalListings.completeSession(activeSession!.id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: ['external-listing-active-session'],
      });
      queryClient.invalidateQueries({ queryKey: ['external-listing-groups'] });
      setShowCompleteConfirm(false);
      setSessionError(
        `스냅샷 완료: 구 데이터 ${result.staleListingsMarked}건 처리`,
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
      queryClient.invalidateQueries({
        queryKey: ['external-listing-active-session'],
      });
      queryClient.invalidateQueries({ queryKey: ['external-listing-groups'] });
      setShowCancelConfirm(false);
    },
    onError: (err: unknown) => {
      setSessionError(
        err instanceof Error ? err.message : '세션 취소에 실패했습니다.',
      );
      setShowCancelConfirm(false);
    },
  });

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
        },
        areMarketDetailColumnsCollapsed,
      ),
    [
      transactionType,
      areMarketDetailColumnsCollapsed,
      expandedRankingRowIds,
      toggleRankingRow,
      updateGroupMutation,
    ],
  );

  const handleManualButtonClick = () => {
    setSessionError(null);
    setShowManualDialog(true);
  };

  // 범위 카드 구성 — 거래유형별 라벨/프리셋 (만원)
  const priceFilterLabel =
    transactionType === 'sale'
      ? '매매가'
      : transactionType === 'jeonse'
        ? '전세가'
        : '보증금';
  const priceRangeMax = transactionType === 'monthly' ? 100000 : 250000;
  const priceRangeStep = transactionType === 'monthly' ? 1000 : 5000;
  const priceRangePresets =
    transactionType === 'sale'
      ? [30000, 50000, 80000, 100000, 150000, 200000, 250000]
      : transactionType === 'jeonse'
        ? [10000, 30000, 50000, 80000, 100000, 150000, 200000]
        : [1000, 3000, 5000, 10000, 30000, 50000, 100000];

  return (
    // 매물관리와 동일하게 콘텐츠 패딩을 네 방향 모두 상쇄해 첫 필터를 상단에 붙인다.
    <div className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      {activeSession && (
        <div className="mx-6 mt-3 flex items-center gap-2 rounded-md border border-warning-soft bg-warning-soft/50 px-3 py-2 text-sm">
          <Lock className="size-4 text-warning" />
          <span className="text-foreground">
            스냅샷 세션 진행 중 —{' '}
            <b>{activeSession.startedBy?.name ?? '알 수 없음'}</b>님이{' '}
            {new Date(activeSession.startedAt).toLocaleString('ko-KR')} 시작
          </span>
        </div>
      )}

      {sessionError && (
        <div className="mx-6 mt-3 flex items-center justify-between rounded-md border px-3 py-2 text-xs">
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

      <Tabs
        value={transactionType}
        onValueChange={(v) =>
          setTransactionType(v as ExternalListingTransactionType)
        }
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-0"
      >
        <section
          data-advertising-note-primary-filters
          className="shrink-0 border-b border-border bg-white px-3 py-2.5"
        >
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              <TabsList className="max-w-full shrink-0 justify-start border border-border/80 bg-[#f5f4f1] p-0.5">
                {transactionTypes.map((t) => (
                  <TabsTrigger
                    key={t.value}
                    value={t.value}
                    className="flex-none border-0 px-3 text-[13px] text-muted-foreground shadow-none data-[state=active]:border data-[state=active]:border-[#d9d9d6] data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"
                  >
                    {t.label}
                  </TabsTrigger>
                ))}
              </TabsList>

              <MultiSelect
                options={siteOptions}
                selected={selectedSiteIds}
                onChange={setSelectedSiteIds}
                ariaLabel="단지 필터"
                placeholder="단지 전체"
                searchPlaceholder="단지명 검색"
                emptyText="일치하는 단지가 없습니다."
                maxCount={1}
                className={cn(
                  'h-8 min-w-[150px] max-w-[280px] shrink-0 border-transparent bg-[#f7f6f3] px-2.5 text-[13px] shadow-none hover:border-border',
                  selectedSiteIds.length > 0 &&
                    'border-foreground/25 bg-foreground/[0.06]',
                )}
                badgeClassName="m-0 h-5 border-border bg-white px-1.5 text-[11px] text-foreground shadow-none"
                popoverClassName="w-[360px]"
              />

              <QuickFilterInput
                value={buildingQuery}
                onChange={setBuildingQuery}
                placeholder="동"
                ariaLabel="동 필터"
                className="w-20 shrink-0"
              />
              <QuickFilterInput
                value={hoQuery}
                onChange={setHoQuery}
                placeholder="호"
                ariaLabel="호 필터"
                className="w-20 shrink-0"
              />
              <QuickFilterInput
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="단지, 특징, 메모, 부동산"
                ariaLabel="광고노트 통합 검색"
                withSearchIcon
                className="ml-1 min-w-[170px] max-w-64 flex-1"
              />
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {!isLoading && (
                <span className="mr-1 text-[11px] tabular-nums text-muted-foreground">
                  {filteredGroups.length !== groups.length
                    ? `${filteredGroups.length}/${groups.length}건`
                    : `${groups.length}건`}
                </span>
              )}
              {activeSession && (
                <>
                  <Button
                    size="sm"
                    className="h-8 px-3 text-xs"
                    disabled={
                      !canManageSession || completeSessionMutation.isPending
                    }
                    onClick={() => setShowCompleteConfirm(true)}
                    title={
                      canManageSession
                        ? undefined
                        : '권한 부족: 본인 세션 또는 매니저/오너만 완료 가능'
                    }
                  >
                    <CheckCircle className="size-3.5" />
                    완료
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    disabled={
                      !canManageSession || cancelSessionMutation.isPending
                    }
                    onClick={() => setShowCancelConfirm(true)}
                  >
                    <XCircle className="size-3.5" />
                    취소
                  </Button>
                </>
              )}
              <Button
                size="sm"
                className="h-8 shrink-0 px-3.5"
                onClick={handleManualButtonClick}
              >
                <Plus className="size-3.5" />
                광고 입력
              </Button>
            </div>
          </div>
        </section>

        <section
          data-advertising-note-secondary-filters
          className="shrink-0 overflow-x-auto border-b border-border bg-[#faf9f6] px-3 py-2"
        >
          <div className="flex w-full min-w-max items-center gap-2">
            <div className="flex shrink-0 items-center gap-1.5">
              <FilterToggleChip
                label="집주인"
                active={onlyOwner}
                onToggle={() => setOnlyOwner((value) => !value)}
              />
              <FilterToggleChip
                label="내광고만"
                active={onlyAd}
                onToggle={() => setOnlyAd((value) => !value)}
              />
              <FilterToggleChip
                label="세안고"
                active={onlySeango}
                onToggle={() => setOnlySeango((value) => !value)}
              />
            </div>

            <div className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />

            <div className="flex shrink-0 items-center gap-1.5">
              <AdRangeFilterPopover
                label={priceFilterLabel}
                value={formatRangeFilterSummary(priceMin, priceMax)}
                active={Boolean(priceMin || priceMax)}
              >
                <RangeFilterCard
                  title={`${priceFilterLabel} 범위`}
                  max={priceRangeMax}
                  step={priceRangeStep}
                  presets={priceRangePresets}
                  lo={priceMin}
                  hi={priceMax}
                  onLoChange={setPriceMin}
                  onHiChange={setPriceMax}
                  detail={priceDetailMode}
                  onToggleDetail={() => setPriceDetailMode((value) => !value)}
                />
              </AdRangeFilterPopover>
              {transactionType === 'monthly' && (
                <AdRangeFilterPopover
                  label="월세"
                  value={formatRangeFilterSummary(
                    monthlyRentMin,
                    monthlyRentMax,
                  )}
                  active={Boolean(monthlyRentMin || monthlyRentMax)}
                >
                  <RangeFilterCard
                    title="월세 범위"
                    max={500}
                    step={10}
                    presets={[50, 100, 150, 200, 300, 500]}
                    lo={monthlyRentMin}
                    hi={monthlyRentMax}
                    onLoChange={setMonthlyRentMin}
                    onHiChange={setMonthlyRentMax}
                    detail={monthlyDetailMode}
                    onToggleDetail={() =>
                      setMonthlyDetailMode((value) => !value)
                    }
                  />
                </AdRangeFilterPopover>
              )}
              <QuickFilterInput
                value={featureQuery}
                onChange={setFeatureQuery}
                placeholder="특징·메모 검색"
                ariaLabel="특징·메모 필터"
                className="w-[220px]"
                inputClassName="border-border bg-white"
              />
            </div>

            {activeFilterCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="ml-auto h-8 gap-1.5 px-2.5 text-xs text-muted-foreground"
                onClick={resetFilters}
              >
                <RotateCcw className="size-3.5" />
                초기화
              </Button>
            )}
          </div>
        </section>

        {/* 테이블 영역 */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-white">
          {activeSession && (
            <div className="flex items-center gap-1 border-b px-6 py-2">
              <Button
                size="xs"
                variant={innerTab === 'new' ? 'default' : 'ghost'}
                onClick={() => setInnerTab('new')}
              >
                신규
              </Button>
              <Button
                size="xs"
                variant={innerTab === 'old' ? 'default' : 'ghost'}
                onClick={() => setInnerTab('old')}
              >
                구 데이터
              </Button>
              <span className="ml-auto text-xs text-muted-foreground">
                완료 시 구 데이터가 내려갑니다
              </span>
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
                <EmptyState hasSiteFilter={selectedSiteIds.length > 0} />
              ) : (
                <CellEditProvider>
                  <DataTable
                    columns={columns}
                    data={filteredGroups}
                    layout="full-height"
                    variant="notion"
                    rowHeight={40}
                    pinnedColumns={[
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
                        label: '최소가–매물특징',
                      },
                    ]}
                    sorting={sorting}
                    onSortingChange={setSorting}
                    expandedRowIds={expandedRankingRowIds}
                    renderExpandedRow={(group) => (
                      <ExternalListingRankPanel group={group} />
                    )}
                    enableRowSelection
                    isLoading={isLoading}
                    renderStatusBar={() => (
                      <span>
                        광고 {filteredGroups.length.toLocaleString()}건 표시
                        {groups.length !== filteredGroups.length
                          ? ` · 전체 ${groups.length.toLocaleString()}건`
                          : ''}
                      </span>
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
        onSuccess={() => {
          queryClient.invalidateQueries({
            queryKey: ['external-listing-groups'],
          });
          queryClient.invalidateQueries({
            queryKey: ['external-listing-active-session'],
          });
        }}
      />

      <ConfirmDialog
        open={showCompleteConfirm}
        onOpenChange={setShowCompleteConfirm}
        title="스냅샷을 완료하시겠습니까?"
        description="이번 세션 중 다시 입력되지 않은 매물은 비활성 처리됩니다. Group 정보와 호수 매칭은 보존됩니다."
        confirmLabel="완료"
        onConfirm={() => completeSessionMutation.mutate()}
        pending={completeSessionMutation.isPending}
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

function QuickFilterInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  withSearchIcon = false,
  className,
  inputClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
  withSearchIcon?: boolean;
  className?: string;
  inputClassName?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      {withSearchIcon && (
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      )}
      <Input
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          'h-8 border-transparent bg-[#f7f6f3] pr-7 text-[13px] shadow-none hover:border-border focus:border-input focus:bg-white',
          withSearchIcon ? 'pl-8' : 'pl-2',
          inputClassName,
        )}
      />
      {value && (
        <button
          type="button"
          aria-label={`${ariaLabel} 지우기`}
          onClick={() => onChange('')}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function FilterToggleChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        'inline-flex h-8 items-center rounded-md border border-border bg-white px-2.5 text-xs text-muted-foreground shadow-none transition-colors hover:text-foreground',
        active &&
          'border-foreground/25 bg-foreground/[0.06] font-medium text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function AdRangeFilterPopover({
  label,
  value,
  active,
  children,
}: {
  label: string;
  value: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn(
            'h-8 max-w-[190px] gap-1.5 bg-white px-2.5 text-xs font-normal text-muted-foreground shadow-none',
            active &&
              'border-foreground/25 bg-foreground/[0.06] text-foreground',
          )}
        >
          <span className="font-medium">{label}</span>
          <span className="truncate tabular-nums">{value}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-auto border-0 bg-transparent p-0 shadow-none"
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

function formatRangeFilterSummary(min: string, max: string): string {
  if (!min.trim() && !max.trim()) return '전체';

  const minNumber = Number(min);
  const maxNumber = Number(max);
  const minLabel =
    min.trim() && Number.isFinite(minNumber) ? formatPrice(minNumber) : '최소';
  const maxLabel =
    max.trim() && Number.isFinite(maxNumber) ? formatPrice(maxNumber) : '최대';
  return `${minLabel}–${maxLabel}`;
}

// ── 랭킹 상세 — 매물관리 광고 컬럼과 같은 인라인 확장 행 ─────────────

function ExternalListingRankPanel({ group }: { group: ExternalListingGroup }) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['external-listing-group-detail', group.id],
    queryFn: () => api.externalListings.findGroupById(group.id),
  });

  const listings = data?.listings ?? [];
  const locationLabel = [group.site?.name, group.buildingName, group.ho]
    .filter(Boolean)
    .join(' · ');

  return (
    <div
      id={`external-listing-rank-panel-${group.id}`}
      role="region"
      aria-label={`${locationLabel || '동일주소'} 광고 랭킹 상세`}
      className="border-b border-border bg-[#f3f9fb] py-3 pl-[48px] pr-4"
    >
      <div className="mb-2 flex min-w-0 items-center gap-1.5">
        <ListOrdered className="size-3.5 shrink-0 text-[#337ea9]" />
        <span className="shrink-0 text-xs font-semibold text-[#337ea9]">
          동일주소 광고{' '}
          {data?.listingCount ?? group.listingCount ?? listings.length}건
        </span>
        <span className="shrink-0 text-[11.5px] text-[#6b9fba]">
          · 네이버 노출 순서 비교
        </span>
        {locationLabel && (
          <span className="ml-auto truncate text-[11px] text-muted-foreground">
            {locationLabel}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="max-w-[720px] space-y-1.5">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-11 w-full rounded-md" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex max-w-[720px] items-center gap-2 rounded-md border border-[#d8ebf3] bg-white px-3 py-2">
          <p className="text-xs text-muted-foreground">
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
        <p className="text-xs text-muted-foreground">
          이 주소에 수집된 광고가 없습니다.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[620px] max-w-[720px]">
            <div className="flex items-center gap-1.5 pb-1.5 pl-[13px] pr-1">
              <span className="w-[52px] shrink-0 text-[11px] font-semibold text-muted-foreground">
                순위
              </span>
              <span className="w-[64px] shrink-0 text-[11px] font-semibold text-muted-foreground">
                주인
              </span>
              <span className="w-[200px] shrink-0 text-[11px] font-semibold text-muted-foreground">
                부동산
              </span>
              <span className="w-[125px] shrink-0 text-[11px] font-semibold text-muted-foreground">
                가격
              </span>
              <span className="w-[82px] shrink-0 text-[11px] font-semibold text-muted-foreground">
                확인일
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              {listings.map((listing) => {
                const href = listing.cpPcArticleUrl ?? listing.sourceUrl;
                const realtorName =
                  listing.realtorName ??
                  listing.originalRealtorName ??
                  '중개사 미상';
                const isOwner = listing.verificationTypeCode === 'OWNER';

                return (
                  <div
                    key={listing.id}
                    className="flex min-h-11 items-center gap-1.5 rounded-lg border border-[#d8ebf3] bg-white px-3 py-2"
                  >
                    <div className="w-[52px] shrink-0 text-[12.5px] font-semibold tabular-nums text-[#337ea9]">
                      {listing.ranking != null ? `${listing.ranking}위` : '-'}
                    </div>
                    <div className="w-[64px] shrink-0">
                      <NotionTag
                        className={
                          isOwner
                            ? 'bg-[#eef3ed] text-[#44745a]'
                            : 'bg-[#f1f1ef] text-[#787774]'
                        }
                      >
                        {isOwner ? '집주인' : '중개사'}
                      </NotionTag>
                    </div>
                    <div className="w-[200px] shrink-0">
                      <p className="truncate text-[12.5px] font-semibold text-foreground">
                        {realtorName}
                      </p>
                      {listing.articleFeatureDesc && (
                        <p className="truncate text-[10.5px] text-muted-foreground">
                          {listing.articleFeatureDesc}
                        </p>
                      )}
                    </div>
                    <div className="w-[125px] shrink-0 truncate text-[12.5px] font-medium tabular-nums text-foreground">
                      {formatListingPrice(listing, group.transactionType)}
                    </div>
                    <div className="w-[82px] shrink-0 truncate text-[12px] tabular-nums text-foreground/70">
                      {formatYmd(listing.articleConfirmYmd)}
                    </div>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11.5px] font-medium text-[#337ea9] hover:underline"
                      >
                        {getExternalSourceLabel(listing.source)}
                        <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        {getExternalSourceLabel(listing.source)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
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

function EmptyState({ hasSiteFilter }: { hasSiteFilter: boolean }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
      <Building2 className="size-10 text-muted-foreground/40" />
      <p className="text-sm font-medium text-muted-foreground">
        표시할 외부 매물이 없습니다.
      </p>
      <p className="text-xs text-muted-foreground">
        {hasSiteFilter
          ? '선택한 단지에 수집된 매물이 없습니다. 단지 선택을 조정해보세요.'
          : '크롤러 또는 MCP로 외부 매물 데이터를 수집하면 여기에 표시됩니다.'}
      </p>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────

function sqmToPyeong(sqm: number | string | null | undefined): number | null {
  if (sqm == null) return null;
  const n = typeof sqm === 'string' ? parseFloat(sqm) : sqm;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n / 3.305785);
}

function formatYmd(dateStr: string | null | undefined): string {
  if (!dateStr || dateStr.length !== 8) return '-';
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
  if (!value) return '-';
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
        'inline-flex max-w-full items-center rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5',
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

// ── 범위 필터 카드 — 기본: 프리셋 Select / 상세: 듀얼 슬라이더 ─────────

const RANGE_INPUT_CLS =
  'pointer-events-none absolute inset-x-0 top-0 m-0 h-6 w-full appearance-none bg-transparent outline-none ' +
  '[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow ' +
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:shadow';

function RangeFilterCard({
  title,
  max,
  step,
  presets,
  lo,
  hi,
  onLoChange,
  onHiChange,
  detail,
  onToggleDetail,
}: {
  title: string;
  max: number;
  step: number;
  presets: number[];
  /** 만원 단위 문자열 상태 ('' = 제한 없음) */
  lo: string;
  hi: string;
  onLoChange: (value: string) => void;
  onHiChange: (value: string) => void;
  detail: boolean;
  onToggleDetail: () => void;
}) {
  const loNum = Math.min(lo.trim() ? Number(lo) : 0, max);
  const hiNum = Math.min(hi.trim() ? Number(hi) : max, max);
  const fillLeft = (Math.min(loNum, hiNum) / max) * 100;
  const fillWidth = (Math.max(hiNum - loNum, 0) / max) * 100;
  const rangeLabel = `${lo.trim() ? formatPrice(Number(lo)) : '최소'} ~ ${
    hi.trim() ? formatPrice(Number(hi)) : '최대'
  }`;

  return (
    <div className="w-[300px] rounded-xl border bg-white p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-foreground">
          {title}
        </span>
        {/* 상세(슬라이더) 모드 토글 스위치 */}
        <button
          type="button"
          onClick={onToggleDetail}
          className="flex cursor-pointer items-center gap-1.5"
        >
          <span
            className={cn(
              'relative h-[18px] w-[34px] rounded-full transition-colors',
              detail ? 'bg-primary' : 'bg-border',
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 size-3.5 rounded-full bg-white shadow-sm transition-[left]',
                detail ? 'left-[18px]' : 'left-0.5',
              )}
            />
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            상세
          </span>
        </button>
      </div>
      {detail ? (
        <>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">선택</span>
            <span className="text-[12.5px] font-semibold tabular-nums text-foreground">
              {rangeLabel}
            </span>
          </div>
          <div className="relative h-6">
            <div className="absolute inset-x-0 top-[11px] h-0.5 rounded-full bg-border" />
            <div
              className="absolute top-[11px] h-0.5 rounded-full bg-primary"
              style={{ left: `${fillLeft}%`, width: `${fillWidth}%` }}
            />
            <input
              type="range"
              min={0}
              max={max}
              step={step}
              value={loNum}
              onChange={(e) => {
                const v = Math.min(Number(e.target.value), hiNum);
                onLoChange(v <= 0 ? '' : String(v));
              }}
              className={RANGE_INPUT_CLS}
            />
            <input
              type="range"
              min={0}
              max={max}
              step={step}
              value={hiNum}
              onChange={(e) => {
                const v = Math.max(Number(e.target.value), loNum);
                onHiChange(v >= max ? '' : String(v));
              }}
              className={RANGE_INPUT_CLS}
            />
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <Select
            value={lo.trim() ? lo : 'all'}
            onValueChange={(v) => onLoChange(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="h-8 flex-1 bg-white text-[12.5px] tabular-nums">
              <SelectValue placeholder="최소" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                최소
              </SelectItem>
              {presets.map((p) => (
                <SelectItem
                  key={p}
                  value={String(p)}
                  className="text-xs tabular-nums"
                >
                  {formatPrice(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground/60">~</span>
          <Select
            value={hi.trim() ? hi : 'all'}
            onValueChange={(v) => onHiChange(v === 'all' ? '' : v)}
          >
            <SelectTrigger className="h-8 flex-1 bg-white text-[12.5px] tabular-nums">
              <SelectValue placeholder="최대" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">
                최대
              </SelectItem>
              {presets.map((p) => (
                <SelectItem
                  key={p}
                  value={String(p)}
                  className="text-xs tabular-nums"
                >
                  {formatPrice(p)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// ── Table column factory (electron-estate parity) ──────────────────

interface ColumnFactoryContext {
  onUpdateMemo: (groupId: string, memo: string) => void;
  onUpdateHo: (groupId: string, ho: string) => void;
  expandedListingIds: ReadonlySet<string>;
  onToggleListings: (groupId: string) => void;
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

  // ── 1. 상태 — 이전 수집과 비교한 신규/추가/기존 구분 ───────────
  columns.push({
    id: 'discoveryStatus',
    header: () => (
      <TableHeaderLabel icon={<CircleDot className="size-4" />} label="상태" />
    ),
    size: 58,
    enableResizing: false,
    enableSorting: false,
    cell: ({ row }) => {
      const status = row.original.discoveryStatus ?? 'existing';
      const meta = DISCOVERY_STATUS_META[status];
      return (
        <NotionTag
          title={meta.description}
          ariaLabel={`수집 상태 ${meta.label}. ${meta.description}`}
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
    size: 68,
    enableResizing: false,
    cell: ({ row }) => {
      const group = row.original;
      const postedAt = formatMonthDay(group.ownAdvertisementYmd);
      if (postedAt) {
        return (
          <span
            aria-label={`내 광고 게시일 ${formatYmd(group.ownAdvertisementYmd)}`}
            className="inline-flex max-w-full items-center gap-1 rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[12px] font-medium leading-5 whitespace-nowrap tabular-nums text-[#337ea9]"
          >
            <span
              aria-hidden="true"
              className="size-1.5 shrink-0 rounded-full bg-[#529cca]"
            />
            {postedAt}
          </span>
        );
      }

      return (
        <span
          aria-label="내 광고 없음"
          className="inline-flex max-w-full items-center gap-1 rounded-[4px] bg-[#f1f1ef] px-1.5 py-0.5 text-[12px] font-medium leading-5 whitespace-nowrap text-[#787774]"
        >
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-[#b4b4b1]"
          />
          없음
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
    cell: ({ row }) => (
      <NotionTag
        className={
          row.original.ownerVerified
            ? 'bg-[#eef3ed] text-[#44745a]'
            : 'bg-[#f1f1ef] text-[#787774]'
        }
      >
        {row.original.ownerVerified ? '집주인' : '중개사'}
      </NotionTag>
    ),
  });

  // ── 4. 단지 — 관계 판단 뒤 매물을 식별하는 sticky 컬럼 ─────────
  columns.push({
    id: 'site',
    header: () => (
      <TableHeaderLabel icon={<Building2 className="size-4" />} label="단지" />
    ),
    size: 200,
    enableResizing: false,
    cell: ({ row }) => (
      <span className="truncate text-[14px] font-semibold text-slate-900">
        {row.original.site?.name ?? '-'}
      </span>
    ),
  });

  // ── 5. 동 — 단지와 별도 정렬 가능 ─────────────────────────
  columns.push({
    id: 'dong',
    header: () => (
      <TableHeaderLabel icon={<Hash className="size-4" />} label="동" />
    ),
    size: 70,
    enableResizing: false,
    cell: ({ row }) => (
      <span className="truncate text-[13px] font-medium text-slate-900">
        {row.original.buildingName ?? '-'}
      </span>
    ),
  });

  // ── 6. 호 — 매물 식별에 필요한 마지막 sticky 컬럼 ───────────
  columns.push({
    id: 'ho',
    header: () => (
      <TableHeaderLabel icon={<DoorOpen className="size-4" />} label="호" />
    ),
    size: 104,
    enableResizing: false,
    meta: {
      cellClassName: 'hover:bg-muted/50',
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
    size: 56,
    enableResizing: false,
    cell: ({ row }) => (
      <span className="truncate text-[13px] font-medium tabular-nums text-slate-700">
        {row.original.mainExternalListing?.floorInfo ?? '-'}
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
      <span className="block truncate text-[13px] font-medium text-slate-900">
        {row.original.areaName ?? '-'}
      </span>
    ),
  });

  // ── 9. 면적 — 전용/공급 평을 독립된 숫자 열로 표시 ───────────
  columns.push({
    id: 'area',
    header: () => (
      <TableHeaderLabel icon={<Ruler className="size-4" />} label="면적" />
    ),
    size: 72,
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
          className="block truncate whitespace-nowrap text-[12px] font-medium tabular-nums text-slate-600"
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
      const label =
        ranking && sameAddrCnt
          ? `${ranking}/${sameAddrCnt}`
          : sameAddrCnt != null
            ? `${sameAddrCnt}개`
            : '-';
      const detailLabel = ranking
        ? `내 광고 ${ranking}위, 동일주소 ${sameAddrCnt ?? 0}개`
        : `동일주소 ${sameAddrCnt ?? 0}개`;
      return (
        <div
          className="-mx-2.5 flex h-full items-center justify-center"
          onClick={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <Button
            type="button"
            variant={isOpen ? 'secondary' : 'outline'}
            size="xs"
            aria-expanded={isOpen}
            aria-controls={`external-listing-rank-panel-${g.id}`}
            aria-label={`${detailLabel} 광고 상세 ${isOpen ? '접기' : '펼치기'}`}
            title={isOpen ? '동일주소 광고 접기' : '동일주소 광고 펼치기'}
            onClick={() => ctx.onToggleListings(g.id)}
            className="min-w-12 px-1.5 text-[11px] tabular-nums shadow-none"
          >
            {label}
            <ChevronDown
              aria-hidden="true"
              className={cn(
                'size-3 transition-transform duration-150',
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
    size: transactionType === 'monthly' ? 128 : 110,
    cell: ({ row }) => {
      const listing = row.original.mainExternalListing;
      if (transactionType === 'monthly') {
        return (
          <div className="flex flex-col gap-0.5 tabular-nums">
            <span className="whitespace-nowrap text-[13px] font-semibold text-slate-950">
              {listing?.deposit ? formatPrice(listing.deposit) : '-'}
            </span>
            <span className="whitespace-nowrap text-[12px] text-slate-500">
              월 {listing?.monthlyRent ? formatPrice(listing.monthlyRent) : '-'}
            </span>
          </div>
        );
      }
      const price =
        transactionType === 'sale' ? listing?.price : listing?.deposit;
      return (
        <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-slate-950">
          {price ? formatPrice(price) : '-'}
        </span>
      );
    },
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
      <span className="whitespace-nowrap text-[13px] font-medium tabular-nums text-slate-700">
        {row.original.priceMin != null
          ? formatPrice(row.original.priceMin)
          : '-'}
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
      <span className="whitespace-nowrap text-[13px] font-medium tabular-nums text-slate-700">
        {row.original.priceMax != null
          ? formatPrice(row.original.priceMax)
          : '-'}
      </span>
    ),
  });

  // ── 14. 방향 — 네이버 원본 코드를 사용자 표기로 변환 ────────
  columns.push({
    id: 'direction',
    header: () => (
      <TableHeaderLabel icon={<Compass className="size-4" />} label="방향" />
    ),
    size: 72,
    cell: ({ row }) => (
      <span className="truncate text-[13px] text-slate-700">
        {formatListingDirection(row.original.mainExternalListing?.direction)}
      </span>
    ),
  });

  // ── 15. 매물특징 — 외부 광고에서 수집한 원문 요약 ───────────
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
          className="flex min-w-0 items-center gap-1.5 text-[13px] text-slate-700"
          title={desc || undefined}
          onClick={(e) => e.stopPropagation()}
        >
          {seango && (
            <NotionTag className="shrink-0 bg-[#e7f3f8] text-[#337ea9]">
              세안고
            </NotionTag>
          )}
          {desc ? (
            <span className="truncate">{desc}</span>
          ) : !seango ? (
            <span className="text-muted-foreground">-</span>
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
    size: 320,
    minSize: 240,
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
      <span className="flex h-full w-full items-center truncate text-[13px] font-medium tabular-nums text-slate-800">
        {value || <span className="text-slate-400">-</span>}
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
      <p className="w-full truncate text-[13px] text-slate-700">
        {displayValue || <span className="text-slate-400">-</span>}
      </p>
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
    articleNo:
      form.articleNo.trim() ||
      `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
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
  onSuccess: () => void;
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
      if (!entrySession) {
        await api.externalListings.createSession({
          siteId: form.siteId,
          transactionType: form.transactionType,
        });
      }

      const listings = drafts.map((draft) => {
        const dong = dongs.find((item) => item.id === draft.dongId);
        const unitType = siteUnitTypes.find(
          (item) => item.id === draft.siteUnitTypeId,
        );
        return {
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
      });
      const combinedResult = {
        received: 0,
        created: 0,
        updated: 0,
        groupsCreated: 0,
        groupsReused: 0,
        errors: [] as Array<{ articleNo: string; message: string }>,
      };

      for (
        let offset = 0;
        offset < listings.length;
        offset += EXTERNAL_LISTING_BATCH_SIZE
      ) {
        const chunk = listings.slice(
          offset,
          offset + EXTERNAL_LISTING_BATCH_SIZE,
        );
        const result = await api.externalListings.batchUpsert({
          source: 'manual',
          siteId: form.siteId,
          transactionType: form.transactionType,
          listings: chunk,
        });
        combinedResult.received += result.received;
        combinedResult.created += result.created;
        combinedResult.updated += result.updated;
        combinedResult.groupsCreated += result.groupsCreated;
        combinedResult.groupsReused += result.groupsReused;
        combinedResult.errors.push(...result.errors);
        setSubmittedCount(Math.min(offset + chunk.length, listings.length));
      }

      return combinedResult;
    },
    onSuccess: (result) => {
      if (result.errors.length > 0) {
        setErrorMessage(
          result.errors[0]?.message ?? '등록 중 오류가 발생했습니다.',
        );
        return;
      }
      onSuccess();
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
                ? '동·호·평형·향만 복사했습니다. 새 광고의 가격·중개사 정보를 입력하세요.'
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

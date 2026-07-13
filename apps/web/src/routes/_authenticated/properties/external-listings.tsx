import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Building2,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter,
  Link2,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  X,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  ExternalListingGroup,
  ExternalListingGroupStatus,
  ExternalListingTransactionType,
  SnapshotSession,
} from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import { DataTable } from '@/components/data-table';
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
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  MultiSelect,
  type MultiSelectOption,
} from '@/components/ui/multi-select';

const transactionTypes: Array<{
  value: ExternalListingTransactionType;
  label: string;
}> = [
  { value: 'sale', label: '매매' },
  { value: 'jeonse', label: '전세' },
  { value: 'monthly', label: '월세' },
];

const statusMeta: Record<
  ExternalListingGroupStatus,
  { label: string; className: string }
> = {
  unmatched: {
    label: '미매칭',
    className: 'bg-[#f1f1ef] text-[#5f5e5b]',
  },
  matched: {
    label: '매칭',
    className: 'bg-[#e7f3f8] text-[#337ea9]',
  },
  verified: {
    label: '확정',
    className: 'bg-[#eef3ed] text-[#44745a]',
  },
  on_hold: {
    label: '보류',
    className: 'bg-[#fbf3db] text-[#9f6b00]',
  },
};

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
  const [selectedSiteIds, setSelectedSiteIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [buildingQuery, setBuildingQuery] = useState('');
  const [hoQuery, setHoQuery] = useState('');
  const [featureQuery, setFeatureQuery] = useState('');
  const [onlyOwner, setOnlyOwner] = useState(false);
  const [onlyAd, setOnlyAd] = useState(false);
  const [onlySeango, setOnlySeango] = useState(false);
  const [onlyFavorite, setOnlyFavorite] = useState(false);
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
  const [showStartConfirm, setShowStartConfirm] = useState(false);
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
    queryKey: [
      'external-listing-active-session',
      scopeSiteId,
      transactionType,
    ],
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

  const createSessionMutation = useMutation({
    mutationFn: () =>
      api.externalListings.createSession({
        siteId: scopeSiteId!,
        transactionType,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: [
          'external-listing-active-session',
          scopeSiteId,
          transactionType,
        ],
      });
      setShowStartConfirm(false);
      setInnerTab('new');
      setShowManualDialog(true);
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof Error ? err.message : '스냅샷 세션 시작에 실패했습니다.';
      setSessionError(msg);
      setShowStartConfirm(false);
    },
  });

  const completeSessionMutation = useMutation({
    mutationFn: () =>
      api.externalListings.completeSession(activeSession!.id),
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

  // ── Inline group updates (favorite / status / memo / inferredHo) ─
  const updateGroupMutation = useMutation({
    mutationFn: ({
      id,
      dto,
    }: {
      id: string;
      dto: {
        favorite?: boolean;
        status?: ExternalListingGroupStatus;
        memo?: string | null;
        inferredHo?: string | null;
      };
    }) => api.externalListings.updateGroup(id, dto),
    // Optimistic update so the table feels instant.
    onMutate: async ({ id, dto }) => {
      await queryClient.cancelQueries({ queryKey: ['external-listing-groups'] });
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
        err instanceof Error && err.message ? err.message : '저장에 실패했습니다.',
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['external-listing-groups'] });
    },
  });

  // ── 호실(Unit) 수동 링크/해제 — unit 객체가 함께 갱신돼야 하므로 낙관적 갱신 없이 invalidate
  const linkUnitMutation = useMutation({
    mutationFn: ({ id, unitId }: { id: string; unitId: string | null }) =>
      api.externalListings.updateGroup(id, { unitId }),
    onSuccess: (_data, vars) => {
      toast.success(vars.unitId ? '호실이 연결되었습니다.' : '호실 연결이 해제되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['external-listing-groups'] });
    },
    onError: (err) =>
      toast.error(
        err instanceof Error && err.message ? err.message : '호실 연결에 실패했습니다.',
      ),
  });

  // ── 그룹 내 형제 매물 펼치기 다이얼로그 ──────────────────────────
  const [siblingGroup, setSiblingGroup] = useState<ExternalListingGroup | null>(null);

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

    return groups.filter((g) => {
      // 동 필터: buildingName 문자열
      if (bq) {
        const dongText = (g.buildingName ?? '').toLowerCase();
        if (!dongText.includes(bq)) return false;
      }
      // 호수 필터: inferredHo 또는 unit.name
      if (hq) {
        const hoText = (g.inferredHo ?? g.unit?.name ?? '').toLowerCase();
        if (!hoText.includes(hq)) return false;
      }
      // 매물특징 필터: articleFeatureDesc + memo
      if (fq) {
        const descText =
          (g.mainExternalListing?.articleFeatureDesc ?? '').toLowerCase();
        const memoText = (g.memo ?? '').toLowerCase();
        if (!descText.includes(fq) && !memoText.includes(fq)) return false;
      }
      // 즐겨찾기
      if (onlyFavorite && !g.favorite) return false;
      // 집주인(소유주 확인된 매물만)
      if (onlyOwner && !g.ownerVerified) return false;
      // 광고 O만 (= mainExternalListing.isActive)
      if (onlyAd && !g.mainExternalListing?.isActive) return false;
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
  }, [
    groups,
    buildingQuery,
    hoQuery,
    featureQuery,
    onlyFavorite,
    onlyOwner,
    onlyAd,
    onlySeango,
    priceMin,
    priceMax,
    monthlyRentMin,
    monthlyRentMax,
    transactionType,
  ]);

  const activeFilterCount =
    (buildingQuery.trim() ? 1 : 0) +
    (hoQuery.trim() ? 1 : 0) +
    (featureQuery.trim() ? 1 : 0) +
    (onlyFavorite ? 1 : 0) +
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
    setOnlyFavorite(false);
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
      buildColumns(transactionType, {
        onUpdateStatus: (id, status) =>
          updateGroupMutation.mutate({ id, dto: { status } }),
        onUpdateMemo: (id, memo) =>
          updateGroupMutation.mutate({ id, dto: { memo: memo || null } }),
        onUpdateInferredHo: (id, ho) =>
          updateGroupMutation.mutate({ id, dto: { inferredHo: ho || null } }),
        onLinkUnit: (id, unitId) => linkUnitMutation.mutate({ id, unitId }),
        onShowListings: (group) => setSiblingGroup(group),
      }),
    [transactionType, updateGroupMutation, linkUnitMutation],
  );

  const handleManualButtonClick = () => {
    if (!scopeSiteId) {
      setSessionError('입력을 시작하려면 단지를 1개만 선택하세요.');
      return;
    }
    if (activeSession) {
      setShowManualDialog(true);
    } else {
      setShowStartConfirm(true);
    }
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
    <div className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col bg-white">
      {/* 페이지 헤더 */}
      <div className="flex shrink-0 items-center gap-2.5 border-b px-6 py-3">
        <h1 className="text-lg font-bold tracking-[-0.02em] text-foreground">
          광고노트
        </h1>
        <div className="flex-1" />
        {activeSession && (
          <>
            <Button
              size="sm"
              variant="default"
              className="h-[34px] rounded-[9px] px-3.5 text-[13px]"
              disabled={!canManageSession || completeSessionMutation.isPending}
              onClick={() => setShowCompleteConfirm(true)}
              title={
                canManageSession
                  ? undefined
                  : '권한 부족: 본인 세션 또는 매니저/오너만 완료 가능'
              }
            >
              <CheckCircle className="mr-1 size-4" />
              완료
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-[34px] rounded-[9px] px-3.5 text-[13px]"
              disabled={!canManageSession || cancelSessionMutation.isPending}
              onClick={() => setShowCancelConfirm(true)}
            >
              <XCircle className="mr-1 size-4" />
              취소
            </Button>
          </>
        )}
        <Button
          size="sm"
          className="h-[34px] rounded-[9px] px-3.5 text-[13px]"
          onClick={handleManualButtonClick}
        >
          <Plus className="mr-1 size-4" />
          입력
        </Button>
      </div>

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
        {/* 필터 행 */}
        <div className="shrink-0 border-b px-6 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <TabsList className="h-auto rounded-lg bg-secondary p-[3px]">
              {transactionTypes.map((t) => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="rounded-md border-0 px-[13px] py-[5px] text-[13px] font-medium text-muted-foreground shadow-none data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {!isLoading && (
              <span className="text-[12.5px] tabular-nums text-muted-foreground/80">
                {activeFilterCount > 0 &&
                filteredGroups.length !== groups.length
                  ? `${filteredGroups.length}/${groups.length}건`
                  : `${groups.length}건`}
              </span>
            )}

            <div className="flex h-8 min-w-[150px] flex-[0_1_248px] items-center gap-1.5 rounded-lg border bg-muted px-2.5">
              <Search className="size-3.5 shrink-0 text-muted-foreground/70" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="단지 · 메모 · 부동산 검색"
                className="w-full min-w-0 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/60"
              />
            </div>
            <div className="flex-1" />
            <MultiSelect
              options={siteOptions}
              selected={selectedSiteIds}
              onChange={setSelectedSiteIds}
              placeholder="관리 단지 선택"
              className="h-8 min-w-[180px] rounded-lg bg-white text-[12.5px]"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn(
                'h-8 rounded-lg bg-white px-3 text-[12.5px] font-normal text-foreground/80',
                isFilterOpen && 'border-foreground/40',
              )}
              onClick={() => setIsFilterOpen((v) => !v)}
            >
              <Filter className="mr-1.5 size-3.5 text-muted-foreground/70" />
              상세 필터
              {activeFilterCount > 0 && (
                <span className="ml-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-[5px] text-[11px] font-semibold text-primary-foreground">
                  {activeFilterCount}
                </span>
              )}
              {isFilterOpen ? (
                <ChevronUp className="ml-1 size-3.5 text-muted-foreground/70" />
              ) : (
                <ChevronDown className="ml-1 size-3.5 text-muted-foreground/70" />
              )}
            </Button>
            {activeFilterCount > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-[12.5px] font-medium text-orange hover:text-orange"
                onClick={resetFilters}
              >
                <RotateCcw className="mr-1 size-3.5" />
                초기화
              </Button>
            )}
          </div>

          {isFilterOpen && (
            <div className="mt-3 flex flex-col gap-3.5 rounded-[10px] border bg-muted/50 p-4">
              {/* 텍스트 필터: 동/호수/매물특징 */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="filter-building"
                    className="text-xs text-muted-foreground"
                  >
                    동
                  </Label>
                  <Input
                    id="filter-building"
                    value={buildingQuery}
                    onChange={(e) => setBuildingQuery(e.target.value)}
                    placeholder="143"
                    className="h-8 w-[104px] bg-white text-[13px]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="filter-ho"
                    className="text-xs text-muted-foreground"
                  >
                    호수
                  </Label>
                  <Input
                    id="filter-ho"
                    value={hoQuery}
                    onChange={(e) => setHoQuery(e.target.value)}
                    placeholder="1501"
                    className="h-8 w-[104px] bg-white text-[13px]"
                  />
                </div>
                <div className="flex min-w-[240px] flex-1 items-center gap-2">
                  <Label
                    htmlFor="filter-feature"
                    className="whitespace-nowrap text-xs text-muted-foreground"
                  >
                    매물특징
                  </Label>
                  <Input
                    id="filter-feature"
                    value={featureQuery}
                    onChange={(e) => setFeatureQuery(e.target.value)}
                    placeholder="급매 · 올수리 · 세안고 등"
                    className="h-8 bg-white text-[13px]"
                  />
                </div>
              </div>

              {/* 조건 토글 칩 */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="mr-0.5 text-xs text-muted-foreground">
                  조건
                </span>
                {(
                  [
                    { label: '집주인', active: onlyOwner, toggle: setOnlyOwner },
                    { label: '광고 O만', active: onlyAd, toggle: setOnlyAd },
                    { label: '세안고', active: onlySeango, toggle: setOnlySeango },
                    {
                      label: '즐겨찾기',
                      active: onlyFavorite,
                      toggle: setOnlyFavorite,
                    },
                  ] as const
                ).map((chip) => (
                  <button
                    key={chip.label}
                    type="button"
                    onClick={() => chip.toggle(!chip.active)}
                    className={cn(
                      'flex h-[30px] cursor-pointer items-center gap-1.5 rounded-[7px] border px-3 text-[12.5px] font-medium transition-colors',
                      chip.active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-white text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* 범위 필터 카드 (electron-estate 스타일) */}
              <div className="flex flex-wrap gap-3.5">
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
                  onToggleDetail={() => setPriceDetailMode((v) => !v)}
                />
                {transactionType === 'monthly' && (
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
                    onToggleDetail={() => setMonthlyDetailMode((v) => !v)}
                  />
                )}
              </div>
            </div>
          )}
        </div>

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
                  <Button variant="outline" size="sm" onClick={() => refetchGroups()}>
                    <RefreshCw className="mr-1 size-3.5" />
                    다시 시도
                  </Button>
                </div>
              ) : !isLoading && groups.length === 0 ? (
                <EmptyState hasSiteFilter={selectedSiteIds.length > 0} />
              ) : (
                <DataTable
                  columns={columns}
                  data={filteredGroups}
                  layout="full-height"
                  variant="notion"
                  rowHeight="auto"
                  enableRowSelection
                  renderSelectionAccessory={(group) => (
                    <FavoriteToggle
                      favorite={group.favorite}
                      onToggle={() =>
                        updateGroupMutation.mutate({
                          id: group.id,
                          dto: { favorite: !group.favorite },
                        })
                      }
                    />
                  )}
                  isLoading={isLoading}
                  renderStatusBar={() => (
                    <span>
                      광고 {filteredGroups.length.toLocaleString()}건 표시
                      {groups.length !== filteredGroups.length ? ` · 전체 ${groups.length.toLocaleString()}건` : ''}
                    </span>
                  )}
                  emptyMessage={
                    activeFilterCount > 0
                      ? '필터에 맞는 매물이 없습니다'
                      : '매물이 없습니다'
                  }
                />
              )}
            </TabsContent>
          ))}
        </section>
      </Tabs>

      <ManualEntryDialog
        open={showManualDialog}
        onOpenChange={setShowManualDialog}
        siteOptions={siteOptions}
        defaultSiteId={scopeSiteId ?? selectedSiteIds[0]}
        defaultTransactionType={transactionType}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['external-listing-groups'] });
          queryClient.invalidateQueries({
            queryKey: ['external-listing-active-session'],
          });
        }}
      />

      <ConfirmDialog
        open={showStartConfirm}
        onOpenChange={setShowStartConfirm}
        title="새 스냅샷을 시작하시겠습니까?"
        description={
          '현재 목록이 "구 데이터"로 이동하고, 새로 입력한 매물만 "신규"에 표시됩니다. 완료 버튼을 누르기 전까지는 변경되지 않으며, 취소 시 구 데이터가 복구됩니다.'
        }
        confirmLabel="시작"
        onConfirm={() => createSessionMutation.mutate()}
        pending={createSessionMutation.isPending}
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

      <GroupListingsDialog
        group={siblingGroup}
        onOpenChange={(open) => {
          if (!open) setSiblingGroup(null);
        }}
      />
    </div>
  );
}

// ── 그룹 내 형제 매물 펼치기 다이얼로그 ──────────────────────────────

function GroupListingsDialog({
  group,
  onOpenChange,
}: {
  group: ExternalListingGroup | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['external-listing-group-detail', group?.id],
    queryFn: () => api.externalListings.findGroupById(group!.id),
    enabled: !!group,
  });

  const listings = data?.listings ?? [];
  const tType = group?.transactionType ?? 'sale';

  return (
    <Dialog open={!!group} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            그룹 매물 {data?.listingCount ?? listings.length ?? ''}건
            <span className="ml-2 text-sm font-normal text-muted-foreground">
              {group?.site?.name}
              {group?.buildingName ? ` · ${group.buildingName}` : ''}
              {group?.unit?.name
                ? ` · ${group.unit.name}`
                : group?.inferredHo
                  ? ` · ${group.inferredHo}(추정)`
                  : ''}
            </span>
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-sm text-muted-foreground">매물 목록을 불러오지 못했습니다.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="mr-1 size-3.5" />
              다시 시도
            </Button>
          </div>
        ) : listings.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            이 그룹에 수집된 매물이 없습니다.
          </p>
        ) : (
          <div className="max-h-[55vh] divide-y overflow-y-auto rounded-md border">
            {listings.map((listing) => {
              const href = listing.cpPcArticleUrl ?? listing.sourceUrl;
              return (
                <div key={listing.id} className="flex items-start gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <NotionTag
                        className={
                          listing.isActive
                            ? 'bg-[#e7f3f8] text-[#337ea9]'
                            : 'bg-[#fbe4e4] text-[#9f5555]'
                        }
                      >
                        {listing.isActive ? '광고 O' : '광고 X'}
                      </NotionTag>
                      <span className="text-[13px] font-medium tabular-nums text-slate-950">
                        {formatListingPrice(listing, tType)}
                      </span>
                      {listing.ranking != null && (
                        <NotionTag className="bg-[#f1f1ef] text-[#5f5e5b] tabular-nums">
                          순위 {listing.ranking}
                        </NotionTag>
                      )}
                      {listing.verificationTypeCode === 'OWNER' && (
                        <NotionTag className="bg-[#eef3ed] text-[#44745a]">집주인</NotionTag>
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {listing.realtorName ?? '중개사 미상'} · 확인일{' '}
                      {formatYmd(listing.articleConfirmYmd)} · {listing.articleNo}
                    </p>
                    {listing.articleFeatureDesc && (
                      <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/80">
                        {listing.articleFeatureDesc}
                      </p>
                    )}
                  </div>
                  {href && (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex shrink-0 items-center gap-1 rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[11px] font-medium text-[#337ea9] hover:bg-[#dcecf3]"
                    >
                      <ExternalLink className="size-3" />
                      {getExternalSourceLabel(listing.source)}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
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

function getExternalSourceLabel(source: string | null | undefined): string {
  const normalized = source?.trim().toLowerCase();
  if (!normalized) return '출처';
  if (normalized.includes('naver')) return '네이버';
  if (normalized.includes('asil')) return '아실';
  if (normalized.includes('manual') || normalized.includes('수동')) return '입력';
  return source ?? '출처';
}

const SEANGO_REGEX = /세\s*안\s*고|갭\s*투\s*자?/;
function hasSeangoMarker(text: string | null | undefined): boolean {
  return !!text && SEANGO_REGEX.test(text);
}

function NotionTag({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5',
        className,
      )}
    >
      <span className="truncate">{children}</span>
    </span>
  );
}

function StatusTag({ status }: { status: ExternalListingGroupStatus }) {
  const meta = statusMeta[status];
  return <NotionTag className={meta.className}>{meta.label}</NotionTag>;
}

function FavoriteToggle({
  favorite,
  onToggle,
}: {
  favorite: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={favorite ? '즐겨찾기 해제' : '즐겨찾기'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={cn(
        'flex size-4 items-center justify-center rounded-[3px] transition-colors hover:bg-[#f1f1ef] hover:text-yellow-500',
        favorite ? 'text-yellow-400' : 'text-muted-foreground/55',
      )}
    >
      <Star
        className={cn('size-3.5', favorite && 'fill-yellow-400')}
        strokeWidth={1.6}
      />
    </button>
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
  onUpdateStatus: (groupId: string, status: ExternalListingGroupStatus) => void;
  onUpdateMemo: (groupId: string, memo: string) => void;
  onUpdateInferredHo: (groupId: string, ho: string) => void;
  onLinkUnit: (groupId: string, unitId: string | null) => void;
  onShowListings: (group: ExternalListingGroup) => void;
}

function buildColumns(
  transactionType: ExternalListingTransactionType,
  ctx: ColumnFactoryContext,
): ColumnDef<ExternalListingGroup, unknown>[] {
  const columns: ColumnDef<ExternalListingGroup, unknown>[] = [];

  // ── 정보 (광고 · 집주인) ───────────────────────────────────
  columns.push({
    id: 'info',
    header: '정보',
    size: 72,
    cell: ({ row }) => {
      const g = row.original;
      const main = g.mainExternalListing;
      const isActive = !!main?.isActive;
      return (
        <div className="flex flex-col gap-1 py-1">
          <NotionTag className={isActive ? 'bg-[#e7f3f8] text-[#337ea9]' : 'bg-[#fbe4e4] text-[#9f5555]'}>
            {isActive ? '광고 O' : '광고 X'}
          </NotionTag>
          <NotionTag className={g.ownerVerified ? 'bg-[#eef3ed] text-[#44745a]' : 'bg-[#f1f1ef] text-[#787774]'}>
            {g.ownerVerified ? '집주인' : '중개사'}
          </NotionTag>
        </div>
      );
    },
  });

  // ── 중복 (순위/동일주소 개수 — 클릭 시 그룹 매물 펼치기) ────────
  columns.push({
    id: 'duplicate',
    header: '중복',
    size: 54,
    cell: ({ row }) => {
      const g = row.original;
      const ranking = g.offerRanking ?? null;
      const sameAddrCnt =
        g.mainExternalListing?.sameAddrCnt ?? g.listingCount ?? null;
      const label =
        ranking && sameAddrCnt
          ? `${ranking}/${sameAddrCnt}`
          : sameAddrCnt != null
            ? `${sameAddrCnt}개`
            : '-';
      return (
        <button
          type="button"
          title="그룹 내 매물 전체 보기"
          onClick={(e) => {
            e.stopPropagation();
            ctx.onShowListings(g);
          }}
          className="cursor-pointer"
        >
          <NotionTag className="bg-[#f1f1ef] text-[#5f5e5b] tabular-nums transition-colors hover:bg-[#e3e3e0]">
            {label}
          </NotionTag>
        </button>
      );
    },
  });

  // ── 3. 아파트 (단지명) ─────────────────────────────────────
  columns.push({
    id: 'site',
    header: '아파트',
    size: 200,
    cell: ({ row }) => (
      <span className="truncate text-[13px] font-medium">
        {row.original.site?.name ?? '-'}
      </span>
    ),
  });

  // ── 4. 타입 (areaName + pyeong/pyeong) ─────────────────────
  columns.push({
    id: 'type',
    header: '타입',
    size: 80,
    cell: ({ row }) => {
      const g = row.original;
      const main = g.mainExternalListing;
      const exclusivePyeong = sqmToPyeong(
        main?.exclusiveAreaM2 ?? g.exclusiveAreaM2,
      );
      const supplyPyeong = sqmToPyeong(main?.supplyAreaM2);
      return (
        <div className="flex min-w-0 flex-col gap-1 text-[12px]">
          <span className="truncate font-medium text-slate-800">{g.areaName ?? '-'}</span>
          {exclusivePyeong != null && (
            <span className="truncate text-[11px] tabular-nums text-slate-500">
              {exclusivePyeong}/{supplyPyeong ?? '-'}평
            </span>
          )}
        </div>
      );
    },
  });

  // ── 5. 동 ────────────────────────────────────────────────
  columns.push({
    id: 'dong',
    header: '동',
    size: 70,
    cell: ({ row }) => (
      <span className="truncate text-[13px]">
        {row.original.buildingName ?? '-'}
      </span>
    ),
  });

  // ── 6. 호 (+ floorInfo, 인라인 편집 + Unit 수동 링크) ──────────
  columns.push({
    id: 'ho',
    header: '호',
    size: 96,
    cell: ({ row }) => {
      const g = row.original;
      const main = g.mainExternalListing;
      // If a Unit is linked, the ho is authoritative (read-only with unlink).
      if (g.unit?.name) {
        return (
          <div className="flex min-w-0 items-start gap-1 text-[12px]">
            <div
              className="flex min-w-0 flex-col"
              title="호실이 확정되었습니다. 변경하려면 연결을 해제하세요."
            >
              <span className="flex items-center gap-1 truncate font-medium text-slate-800">
                <Link2 className="size-3 shrink-0 text-[#337ea9]" />
                {g.unit.name}
              </span>
              {main?.floorInfo && (
                <span className="truncate text-[11px] text-slate-500">
                  {main.floorInfo}
                </span>
              )}
            </div>
            <button
              type="button"
              title="호실 연결 해제"
              onClick={(e) => {
                e.stopPropagation();
                ctx.onLinkUnit(g.id, null);
              }}
              className="mt-0.5 rounded-[3px] p-0.5 text-muted-foreground/50 transition-colors hover:bg-[#f1f1ef] hover:text-destructive"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      }
      return (
        <div className="flex min-w-0 items-start gap-0.5">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <HoInput
              groupId={g.id}
              initial={g.inferredHo}
              onSave={ctx.onUpdateInferredHo}
            />
            {main?.floorInfo && (
              <span className="truncate text-[11px] text-slate-500">
                {main.floorInfo}
              </span>
            )}
          </div>
          <UnitLinkPopover group={g} onLink={(unitId) => ctx.onLinkUnit(g.id, unitId)} />
        </div>
      );
    },
  });

  // ── 7. 상태 (인라인 Select) ──────────────────────────────
  columns.push({
    id: 'status',
    header: '상태',
    size: 100,
    cell: ({ row }) => {
      const g = row.original;
      return (
        <Select
          value={g.status}
          onValueChange={(v) =>
            ctx.onUpdateStatus(g.id, v as ExternalListingGroupStatus)
          }
        >
          <SelectTrigger
            className="h-auto w-fit border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 [&>svg]:hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <StatusTag status={g.status} />
          </SelectTrigger>
          <SelectContent align="start">
            {Object.entries(statusMeta).map(([value, meta]) => (
              <SelectItem key={value} value={value} className="text-xs">
                <NotionTag className={meta.className}>{meta.label}</NotionTag>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    },
  });

  // ── 8. 가격 (탭별 다름) ───────────────────────────────────
  if (transactionType === 'sale') {
    columns.push({
      id: 'price',
      header: '매매가',
      size: 110,
      cell: ({ row }) => (
        <span className="text-[13px] font-medium tabular-nums text-slate-950">
          {row.original.mainExternalListing?.price
            ? formatPrice(row.original.mainExternalListing.price)
            : '-'}
        </span>
      ),
    });
  } else if (transactionType === 'jeonse') {
    columns.push({
      id: 'deposit',
      header: '전세가',
      size: 110,
      cell: ({ row }) => (
        <span className="text-[13px] font-medium tabular-nums text-slate-950">
          {row.original.mainExternalListing?.deposit
            ? formatPrice(row.original.mainExternalListing.deposit)
            : '-'}
        </span>
      ),
    });
  } else {
    columns.push({
      id: 'deposit',
      header: '보증금',
      size: 95,
      cell: ({ row }) => (
        <span className="text-[13px] tabular-nums text-slate-950">
          {row.original.mainExternalListing?.deposit
            ? formatPrice(row.original.mainExternalListing.deposit)
            : '-'}
        </span>
      ),
    });
    columns.push({
      id: 'monthlyRent',
      header: '월세',
      size: 80,
      cell: ({ row }) => (
        <span className="text-[13px] tabular-nums text-slate-950">
          {row.original.mainExternalListing?.monthlyRent
            ? formatPrice(row.original.mainExternalListing.monthlyRent)
            : '-'}
        </span>
      ),
    });
  }

  // ── 9. 최소최대 (같은 주소 가격 범위) ──────────────────────
  columns.push({
    id: 'minMax',
    header: '최소최대',
    size: 110,
    cell: ({ row }) => {
      const g = row.original;
      const main = g.mainExternalListing;
      const max =
        main?.sameAddrMaxPrc ??
        (g.priceMax != null ? formatPrice(g.priceMax) : null);
      const min =
        main?.sameAddrMinPrc ??
        (g.priceMin != null ? formatPrice(g.priceMin) : null);
      if (!max && !min) {
        return <span className="text-[12px] text-muted-foreground">-</span>;
      }
      if (!max || max === min) {
        return (
          <span className="text-[12px] tabular-nums text-slate-700">
            {max ?? min}
          </span>
        );
      }
      return (
        <div className="flex flex-col gap-0.5 text-[12px] leading-4 tabular-nums">
          <span className="whitespace-nowrap text-slate-700">
            <span className="mr-1 text-[10px] text-slate-400">최고</span>
            {max}
          </span>
          <span className="whitespace-nowrap text-slate-700">
            <span className="mr-1 text-[10px] text-slate-400">최저</span>
            {min ?? '-'}
          </span>
        </div>
      );
    },
  });

  // ── 10. 방향 ────────────────────────────────────────────
  columns.push({
    id: 'direction',
    header: '방향',
    size: 60,
    cell: ({ row }) => (
      <span className="text-[13px] text-slate-800">
        {row.original.mainExternalListing?.direction ?? '-'}
      </span>
    ),
  });

  // ── 11. 확인일 (최신/최초 + 경과일) ───────────────────────
  columns.push({
    id: 'dates',
    header: '확인일',
    size: 112,
    cell: ({ row }) => {
      const g = row.original;
      const latest = formatYmd(g.maxYmd);
      const first = formatYmd(g.minYmd);
      const hasLatest = latest !== '-';
      const hasFirst = first !== '-';
      const showFirst = hasFirst && first !== latest;
      const subText = [
        showFirst ? `최초 ${first}` : null,
        g.confirmDateDiff != null ? `${g.confirmDateDiff}일` : null,
      ]
        .filter(Boolean)
        .join(' · ');

      if (!hasLatest && !hasFirst && !subText) {
        return <span className="text-[12px] text-muted-foreground">-</span>;
      }

      return (
        <div className="flex flex-col gap-0.5 text-[12px] leading-4 tabular-nums">
          <span className="text-slate-800">{hasLatest ? latest : first}</span>
          {subText && (
            <span className="text-[11px] text-slate-400">{subText}</span>
          )}
        </div>
      );
    },
  });

  // ── 12. 부동산 ──────────────────────────────────────────
  columns.push({
    id: 'realtor',
    header: '부동산',
    size: 100,
    minSize: 88,
    maxSize: 180,
    cell: ({ row }) => (
      <span className="block w-full whitespace-normal break-words text-[12px] leading-4 text-slate-700">
        {row.original.mainExternalListing?.realtorName ?? '-'}
      </span>
    ),
  });

  // ── 13. 출처 (외부 링크) ──────────────────────────────────
  columns.push({
    id: 'link',
    header: '출처',
    size: 64,
    cell: ({ row }) => {
      const main = row.original.mainExternalListing;
      if (!main) {
        return <span className="text-[12px] text-muted-foreground">-</span>;
      }
      const href = main.cpPcArticleUrl ?? main.sourceUrl;
      const sourceLabel = getExternalSourceLabel(main.source);
      if (!href) {
        return (
          <NotionTag className="bg-[#f1f1ef] text-[#787774]">
            {sourceLabel}
          </NotionTag>
        );
      }
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={`${sourceLabel} 링크 열기`}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex max-w-full items-center rounded-[4px] bg-[#e7f3f8] px-1.5 py-0.5 text-[11px] font-medium leading-5 text-[#337ea9] hover:bg-[#dcecf3] hover:underline"
        >
          <span className="truncate">{sourceLabel}</span>
        </a>
      );
    },
  });

  // ── 14. 매물특징 + 메모(인라인) ────────────────────────────
  columns.push({
    id: 'features',
    header: '매물특징',
    size: 400,
    minSize: 280,
    cell: ({ row }) => {
      const g = row.original;
      const main = g.mainExternalListing;
      const desc = main?.articleFeatureDesc ?? '';
      const seango = hasSeangoMarker(desc) || hasSeangoMarker(g.memo);
      return (
        <div className="flex flex-col gap-1">
          <div
            className="text-[11px] whitespace-pre-line leading-snug text-foreground/80"
            onClick={(e) => e.stopPropagation()}
          >
            {seango && <NotionTag className="mr-1 bg-[#e7f3f8] text-[#337ea9]">세안고</NotionTag>}
            {desc || '-'}
          </div>
          <CommentInput
            groupId={g.id}
            initial={g.memo}
            onSave={ctx.onUpdateMemo}
          />
        </div>
      );
    },
  });

  return columns;
}

// ── Inline ho (호수) editor — only used when unit is not yet linked ──

function HoInput({
  groupId,
  initial,
  onSave,
}: {
  groupId: string;
  initial: string | null;
  onSave: (groupId: string, ho: string) => void;
}) {
  const [value, setValue] = useState(initial ?? '');
  useEffect(() => {
    setValue(initial ?? '');
  }, [initial]);

  const commit = () => {
    const next = value.trim();
    if ((initial ?? '') === next) return;
    onSave(groupId, next);
  };

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(initial ?? '');
          e.currentTarget.blur();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      placeholder="호수"
      className="h-6 border-transparent bg-transparent px-1.5 py-0 text-[12px] shadow-none tabular-nums hover:border-[#eeeeec] focus-visible:border-slate-300 focus-visible:ring-0"
    />
  );
}

// ── Unit 수동 링크 팝오버 (동 → 호 선택) ─────────────────────────────

function UnitLinkPopover({
  group,
  onLink,
}: {
  group: ExternalListingGroup;
  onLink: (unitId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [dongId, setDongId] = useState('');

  const { data: dongs = [], isLoading: isDongsLoading } = useQuery({
    queryKey: ['dongs', group.siteId],
    queryFn: () => api.dongs.findAll(group.siteId),
    enabled: open,
  });

  // 단일 동 건물(placeholder)이면 동 선택을 건너뛰고 바로 호실을 보여준다.
  const placeholderDong = useMemo(
    () => dongs.find((d) => d.isPlaceholder) ?? null,
    [dongs],
  );
  const visibleDongs = useMemo(() => dongs.filter((d) => !d.isPlaceholder), [dongs]);
  const effectiveDongId = dongId || placeholderDong?.id || '';

  const { data: units = [], isLoading: isUnitsLoading } = useQuery({
    queryKey: ['units', group.siteId, effectiveDongId],
    queryFn: () => api.units.findAll({ siteId: group.siteId, dongId: effectiveDongId }),
    enabled: open && !!effectiveDongId,
  });

  const sortedUnits = useMemo(
    () =>
      [...units].sort((a, b) => {
        const af = a.floor ?? 0;
        const bf = b.floor ?? 0;
        if (af !== bf) return bf - af;
        return a.name.localeCompare(b.name, 'ko', { numeric: true });
      }),
    [units],
  );

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      // 네이버가 준 동명 원문과 이름이 같은 동을 기본 선택
      setDongId('');
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="호실(Unit) 연결"
          onClick={(e) => e.stopPropagation()}
          className="mt-1 rounded-[3px] p-0.5 text-muted-foreground/50 transition-colors hover:bg-[#f1f1ef] hover:text-[#337ea9]"
        >
          <Link2 className="size-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-3"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-medium">호실 연결</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {group.site?.name}
          {group.buildingName ? ` · ${group.buildingName}` : ''} 그룹을 실제 호실에
          연결합니다.
        </p>
        <div className="mt-2 space-y-2">
          {visibleDongs.length > 0 && (
            <Select value={dongId} onValueChange={(v) => setDongId(v)}>
              <SelectTrigger className="h-8 w-full text-xs">
                <SelectValue
                  placeholder={isDongsLoading ? '동 불러오는 중...' : '동 선택'}
                />
              </SelectTrigger>
              <SelectContent>
                {visibleDongs.map((d) => (
                  <SelectItem key={d.id} value={d.id} className="text-xs">
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {!effectiveDongId ? (
            <p className="py-2 text-center text-[11px] text-muted-foreground">
              {isDongsLoading
                ? '동 정보를 불러오는 중...'
                : visibleDongs.length === 0
                  ? '등록된 동/호실 정보가 없습니다. 관리단지에서 호실을 먼저 등록하세요.'
                  : '동을 먼저 선택하세요.'}
            </p>
          ) : isUnitsLoading ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : sortedUnits.length === 0 ? (
            <p className="py-2 text-center text-[11px] text-muted-foreground">
              이 동에 등록된 호실이 없습니다.
            </p>
          ) : (
            <div className="max-h-48 overflow-y-auto rounded-md border">
              {sortedUnits.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => {
                    onLink(u.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between border-b px-2.5 py-1.5 text-left text-xs transition-colors last:border-b-0 hover:bg-[#f1f1ef]"
                >
                  <span className="font-medium">{u.name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {u.siteUnitType?.name ?? ''}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Inline comment editor ──────────────────────────────────────────

function CommentInput({
  groupId,
  initial,
  onSave,
}: {
  groupId: string;
  initial: string | null;
  onSave: (groupId: string, memo: string) => void;
}) {
  const [value, setValue] = useState(initial ?? '');
  useEffect(() => {
    setValue(initial ?? '');
  }, [initial]);

  const commit = () => {
    if ((initial ?? '') === value) return;
    onSave(groupId, value);
  };

  return (
    <Input
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        }
        if (e.key === 'Escape') {
          setValue(initial ?? '');
          e.currentTarget.blur();
        }
      }}
      onClick={(e) => e.stopPropagation()}
      placeholder="메모 입력..."
      className="h-6 border-transparent bg-transparent px-2 text-[11px] shadow-none hover:border-[#eeeeec] focus-visible:border-slate-300 focus-visible:ring-0"
    />
  );
}

function formatListingPrice(
  listing: { price: number | null; deposit: number | null; monthlyRent: number | null },
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
  unitId: string;
  /** 호수 미선택 시 평형만 지정 */
  siteUnitTypeId: string;
  direction: string;
  price: string;
  deposit: string;
  monthlyRent: string;
  realtorName: string;
  representativeTelNo: string;
  articleFeatureDesc: string;
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
    unitId: '',
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
  const [form, setForm] = useState<ManualEntryForm>(() =>
    createInitialForm(defaultSiteId, defaultTransactionType),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const { data: units = [] } = useQuery({
    queryKey: ['units', form.siteId, form.dongId],
    queryFn: () =>
      api.units.findAll({ siteId: form.siteId, dongId: form.dongId }),
    enabled: !!form.siteId && !!form.dongId,
  });

  const siteUnitTypes = siteDetail?.siteUnitTypes ?? [];

  const selectedDong = useMemo(
    () => dongs.find((d) => d.id === form.dongId),
    [dongs, form.dongId],
  );
  const selectedUnit = useMemo(
    () => units.find((u) => u.id === form.unitId),
    [units, form.unitId],
  );
  const selectedSiteUnitType = useMemo(
    () => siteUnitTypes.find((t) => t.id === form.siteUnitTypeId),
    [siteUnitTypes, form.siteUnitTypeId],
  );

  const sortedUnits = useMemo(() => {
    return [...units].sort((a, b) => {
      const af = a.floor ?? 0;
      const bf = b.floor ?? 0;
      if (af !== bf) return bf - af;
      return a.name.localeCompare(b.name, 'ko', { numeric: true });
    });
  }, [units]);

  const visibleDongs = useMemo(
    () => dongs.filter((d) => !d.isPlaceholder),
    [dongs],
  );

  const resetForm = () => {
    setForm(createInitialForm(defaultSiteId, defaultTransactionType));
    setErrorMessage(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) resetForm();
    onOpenChange(next);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (!form.siteId) throw new Error('단지를 선택하세요.');
      const articleNo = form.articleNo.trim() || `manual-${Date.now()}`;

      // 호수를 선택한 경우 그 Unit의 SiteUnitType에서 평형/면적 자동 채움.
      // 호수를 모르면 사용자가 고른 평형(siteUnitType)에서 면적을 가져온다.
      const unitType =
        selectedUnit?.siteUnitType ?? selectedSiteUnitType ?? null;

      return api.externalListings.batchUpsert({
        source: 'manual',
        siteId: form.siteId,
        transactionType: form.transactionType,
        listings: [
          {
            articleNo,
            unitId: selectedUnit?.id ?? null,
            buildingName: selectedDong?.name ?? null,
            inferredHo: selectedUnit?.name ?? null,
            areaName: unitType?.name ?? null,
            exclusiveAreaM2:
              unitType?.exclusiveAreaM2 ??
              selectedUnit?.exclusiveAreaM2 ??
              null,
            supplyAreaM2:
              unitType?.supplyAreaM2 ?? selectedUnit?.supplyAreaM2 ?? null,
            floorInfo:
              selectedUnit?.floor != null ? `${selectedUnit.floor}` : null,
            direction: form.direction.trim() || unitType?.direction || null,
            price: form.transactionType === 'sale' ? parseManwon(form.price) : null,
            deposit:
              form.transactionType === 'sale'
                ? null
                : parseManwon(form.deposit),
            monthlyRent:
              form.transactionType === 'monthly'
                ? parseManwon(form.monthlyRent)
                : null,
            realtorName: form.realtorName.trim() || null,
            representativeTelNo: form.representativeTelNo.trim() || null,
            articleFeatureDesc: form.articleFeatureDesc.trim() || null,
          },
        ],
      });
    },
    onSuccess: (result) => {
      if (result.errors.length > 0) {
        setErrorMessage(result.errors[0]?.message ?? '등록 중 오류가 발생했습니다.');
        return;
      }
      onSuccess();
      resetForm();
      onOpenChange(false);
    },
    onError: (err) => {
      setErrorMessage(err instanceof Error ? err.message : '등록에 실패했습니다.');
    },
  });

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>외부 매물 입력</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-sm">단지 *</Label>
              <Select
                value={form.siteId}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    siteId: v,
                    dongId: '',
                    unitId: '',
                    siteUnitTypeId: '',
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="단지 선택" />
                </SelectTrigger>
                <SelectContent>
                  {siteOptions.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">거래유형 *</Label>
              <Select
                value={form.transactionType}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    transactionType: v as ExternalListingTransactionType,
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">매매</SelectItem>
                  <SelectItem value="jeonse">전세</SelectItem>
                  <SelectItem value="monthly">월세</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">매물번호</Label>
              <Input
                placeholder="비워두면 자동 생성"
                value={form.articleNo}
                onChange={(e) => setForm({ ...form, articleNo: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-sm">동</Label>
              <Select
                value={form.dongId}
                onValueChange={(v) =>
                  setForm({ ...form, dongId: v, unitId: '' })
                }
                disabled={!form.siteId || visibleDongs.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !form.siteId
                        ? '단지 먼저 선택'
                        : visibleDongs.length === 0
                          ? '동 정보 없음'
                          : '동 선택'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {visibleDongs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">호수 (선택)</Label>
              <Select
                value={form.unitId || 'none'}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    unitId: v === 'none' ? '' : v,
                    // 호수를 선택하면 siteUnitType은 Unit에서 자동 유래되므로 초기화
                    siteUnitTypeId: v === 'none' ? form.siteUnitTypeId : '',
                  })
                }
                disabled={!form.dongId}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      !form.dongId ? '동 먼저 선택' : '호수 선택'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">호수 모름</SelectItem>
                  {sortedUnits.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                      {u.siteUnitType?.name ? ` · ${u.siteUnitType.name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="text-sm">
                평형 {form.unitId ? '(호수에서 자동)' : '(호수 미선택 시)'}
              </Label>
              <Select
                value={
                  form.unitId
                    ? (selectedUnit?.siteUnitType?.id ?? '')
                    : form.siteUnitTypeId
                }
                onValueChange={(v) => setForm({ ...form, siteUnitTypeId: v })}
                disabled={!form.siteId || !!form.unitId || siteUnitTypes.length === 0}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={
                      siteUnitTypes.length === 0
                        ? '평형 정보 없음'
                        : '평형 선택'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {siteUnitTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.exclusiveAreaM2
                        ? ` · 전용 ${Number(t.exclusiveAreaM2).toFixed(2)}㎡`
                        : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm">향</Label>
              <Input
                placeholder="예: 남향"
                value={form.direction}
                onChange={(e) =>
                  setForm({ ...form, direction: e.target.value })
                }
              />
            </div>
            {form.transactionType === 'sale' && (
              <div className="col-span-2">
                <Label className="text-sm">매매가 (만원)</Label>
                <Input
                  type="number"
                  placeholder="예: 158000"
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })}
                />
              </div>
            )}
            {form.transactionType === 'jeonse' && (
              <div className="col-span-2">
                <Label className="text-sm">전세보증금 (만원)</Label>
                <Input
                  type="number"
                  placeholder="예: 80000"
                  value={form.deposit}
                  onChange={(e) =>
                    setForm({ ...form, deposit: e.target.value })
                  }
                />
              </div>
            )}
            {form.transactionType === 'monthly' && (
              <>
                <div>
                  <Label className="text-sm">보증금 (만원)</Label>
                  <Input
                    type="number"
                    placeholder="예: 5000"
                    value={form.deposit}
                    onChange={(e) =>
                      setForm({ ...form, deposit: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label className="text-sm">월세 (만원)</Label>
                  <Input
                    type="number"
                    placeholder="예: 150"
                    value={form.monthlyRent}
                    onChange={(e) =>
                      setForm({ ...form, monthlyRent: e.target.value })
                    }
                  />
                </div>
              </>
            )}
            <div>
              <Label className="text-sm">등록 중개사</Label>
              <Input
                placeholder="예: 강동부동산"
                value={form.realtorName}
                onChange={(e) =>
                  setForm({ ...form, realtorName: e.target.value })
                }
              />
            </div>
            <div>
              <Label className="text-sm">연락처</Label>
              <Input
                placeholder="예: 02-0000-0000"
                value={form.representativeTelNo}
                onChange={(e) =>
                  setForm({ ...form, representativeTelNo: e.target.value })
                }
              />
            </div>
            <div className="col-span-2">
              <Label className="text-sm">특징/메모</Label>
              <Textarea
                rows={3}
                placeholder="매물 특징, 확인 사항 등"
                value={form.articleFeatureDesc}
                onChange={(e) =>
                  setForm({ ...form, articleFeatureDesc: e.target.value })
                }
              />
            </div>
          </div>
          {errorMessage && (
            <p className="mt-3 text-xs text-destructive">{errorMessage}</p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleOpenChange(false)}
          >
            취소
          </Button>
          <Button
            size="sm"
            disabled={!form.siteId || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? '저장 중...' : '등록'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

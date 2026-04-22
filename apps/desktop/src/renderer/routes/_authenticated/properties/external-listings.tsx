import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Filter,
  Lock,
  Plus,
  RotateCcw,
  Search,
  Star,
  XCircle,
} from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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

const statusFilters: Array<{
  value: 'all' | ExternalListingGroupStatus;
  label: string;
}> = [
  { value: 'all', label: '전체' },
  { value: 'unmatched', label: '미매칭' },
  { value: 'matched', label: '매칭' },
  { value: 'verified', label: '확정' },
  { value: 'on_hold', label: '보류' },
];

const statusMeta: Record<
  ExternalListingGroupStatus,
  { label: string; className: string }
> = {
  unmatched: {
    label: '미매칭',
    className: 'bg-amber-50 text-amber-700',
  },
  matched: {
    label: '매칭',
    className: 'bg-blue-50 text-blue-700',
  },
  verified: {
    label: '확정',
    className: 'bg-emerald-50 text-emerald-700',
  },
  on_hold: {
    label: '보류',
    className: 'bg-zinc-100 text-zinc-600',
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
  const [status, setStatus] = useState<'all' | ExternalListingGroupStatus>(
    'all',
  );
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

  const { data: groups = [], isLoading } = useQuery({
    queryKey: [
      'external-listing-groups',
      transactionType,
      selectedSiteIds,
      status,
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
        status: status === 'all' ? undefined : status,
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
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      for (const [key, prev] of ctx.snapshots) {
        queryClient.setQueryData(key, prev);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['external-listing-groups'] });
    },
  });

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
    (priceMin.trim() || priceMax.trim() ? 1 : 0);

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
  };

  const columns = useMemo(
    () =>
      buildColumns(transactionType, {
        onToggleFavorite: (id, favorite) =>
          updateGroupMutation.mutate({ id, dto: { favorite } }),
        onUpdateStatus: (id, status) =>
          updateGroupMutation.mutate({ id, dto: { status } }),
        onUpdateMemo: (id, memo) =>
          updateGroupMutation.mutate({ id, dto: { memo: memo || null } }),
        onUpdateInferredHo: (id, ho) =>
          updateGroupMutation.mutate({ id, dto: { inferredHo: ho || null } }),
      }),
    [transactionType, updateGroupMutation],
  );

  const handleManualButtonClick = () => {
    if (!scopeSiteId) {
      setSessionError('수동 입력을 시작하려면 단지를 1개만 선택하세요.');
      return;
    }
    if (activeSession) {
      setShowManualDialog(true);
    } else {
      setShowStartConfirm(true);
    }
  };

  return (
    <div className="-m-4 flex flex-1 flex-col gap-4 p-4 min-h-0">
      {activeSession && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
          <Lock className="size-4 text-amber-700" />
          <span className="text-amber-900">
            스냅샷 세션 진행 중 —{' '}
            <b>{activeSession.startedBy?.name ?? '알 수 없음'}</b>님이{' '}
            {new Date(activeSession.startedAt).toLocaleString('ko-KR')} 시작
          </span>
        </div>
      )}

      {sessionError && (
        <div className="flex items-center justify-between rounded-md border border-muted px-3 py-2 text-xs">
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
        className="flex flex-1 flex-col gap-3 min-h-0"
      >
        <div className="flex items-center gap-3">
          <TabsList>
            {transactionTypes.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="px-6">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {!isLoading && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {activeFilterCount > 0 &&
              filteredGroups.length !== groups.length
                ? `${filteredGroups.length}/${groups.length}건`
                : `${groups.length}건`}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {activeSession && (
              <>
                <Button
                  size="sm"
                  variant="default"
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
                  <CheckCircle className="mr-1 size-4" />
                  완료
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    !canManageSession || cancelSessionMutation.isPending
                  }
                  onClick={() => setShowCancelConfirm(true)}
                >
                  <XCircle className="mr-1 size-4" />
                  취소
                </Button>
              </>
            )}
            <Button size="sm" onClick={handleManualButtonClick}>
              <Plus className="mr-1 size-4" />
              수동 입력
            </Button>
          </div>
        </div>

        {/* 필터 카드 — 테이블과 시각적으로 분리 */}
        <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/20 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="단지·메모 검색 (서버)"
                className="h-9 bg-background pl-9"
              />
            </div>
            <MultiSelect
              options={siteOptions}
              selected={selectedSiteIds}
              onChange={setSelectedSiteIds}
              placeholder="관리 단지 선택"
              className="min-w-[220px] bg-background"
            />
            <Button
              type="button"
              variant={isFilterOpen ? 'default' : 'outline'}
              size="sm"
              className={cn(!isFilterOpen && 'bg-background')}
              onClick={() => setIsFilterOpen((v) => !v)}
            >
              <Filter className="mr-1 size-4" />
              상세 필터
              {activeFilterCount > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-2 h-5 px-1.5 text-[10px]"
                >
                  {activeFilterCount}
                </Badge>
              )}
              {isFilterOpen ? (
                <ChevronUp className="ml-1 size-4" />
              ) : (
                <ChevronDown className="ml-1 size-4" />
              )}
            </Button>

            <div className="ml-auto flex flex-wrap items-center gap-1">
              {statusFilters.map((s) => (
                <Button
                  key={s.value}
                  type="button"
                  variant={status === s.value ? 'default' : 'outline'}
                  size="xs"
                  className={cn(status !== s.value && 'bg-background')}
                  onClick={() => setStatus(s.value)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          {isFilterOpen && (
            <div className="mt-1 flex flex-col gap-3 rounded-lg border border-border/60 bg-background px-3 py-3">
              {/* Row 1: 동/호수/매물특징 */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="filter-building"
                    className="w-12 text-xs text-muted-foreground"
                  >
                    동
                  </Label>
                  <Input
                    id="filter-building"
                    value={buildingQuery}
                    onChange={(e) => setBuildingQuery(e.target.value)}
                    placeholder="101"
                    className="h-8 w-[120px]"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="filter-ho"
                    className="w-10 text-xs text-muted-foreground"
                  >
                    호수
                  </Label>
                  <Input
                    id="filter-ho"
                    value={hoQuery}
                    onChange={(e) => setHoQuery(e.target.value)}
                    placeholder="1503"
                    className="h-8 w-[120px]"
                  />
                </div>
                <div className="flex flex-1 items-center gap-2 min-w-[240px]">
                  <Label
                    htmlFor="filter-feature"
                    className="w-16 text-xs text-muted-foreground"
                  >
                    매물특징
                  </Label>
                  <Input
                    id="filter-feature"
                    value={featureQuery}
                    onChange={(e) => setFeatureQuery(e.target.value)}
                    placeholder="급매·올수리·세안고 등"
                    className="h-8"
                  />
                </div>
              </div>

              {/* Row 2: 토글 4개 */}
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <Checkbox
                    checked={onlyOwner}
                    onCheckedChange={(v) => setOnlyOwner(v === true)}
                  />
                  <span>집주인</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <Checkbox
                    checked={onlyAd}
                    onCheckedChange={(v) => setOnlyAd(v === true)}
                  />
                  <span>광고 O만</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <Checkbox
                    checked={onlySeango}
                    onCheckedChange={(v) => setOnlySeango(v === true)}
                  />
                  <span>세안고</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-xs">
                  <Checkbox
                    checked={onlyFavorite}
                    onCheckedChange={(v) => setOnlyFavorite(v === true)}
                  />
                  <span className="flex items-center gap-1">
                    <Star
                      className={cn(
                        'size-3.5',
                        onlyFavorite
                          ? 'fill-yellow-400 text-yellow-400'
                          : 'text-muted-foreground',
                      )}
                    />
                    즐겨찾기
                  </span>
                </label>
              </div>

              {/* Row 3: 가격 범위 + 초기화 */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <Label className="w-12 text-xs text-muted-foreground">
                    가격
                  </Label>
                  <Input
                    type="number"
                    value={priceMin}
                    onChange={(e) => setPriceMin(e.target.value)}
                    placeholder="최소"
                    className="h-8 w-[110px] tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground">~</span>
                  <Input
                    type="number"
                    value={priceMax}
                    onChange={(e) => setPriceMax(e.target.value)}
                    placeholder="최대"
                    className="h-8 w-[110px] tabular-nums"
                  />
                  <span className="text-xs text-muted-foreground">만원</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={resetFilters}
                  disabled={activeFilterCount === 0}
                >
                  <RotateCcw className="mr-1 size-3.5" />
                  초기화
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* 테이블 카드 */}
        <section className="flex flex-1 flex-col min-h-0 overflow-hidden rounded-xl border border-border/60 bg-background">
          {activeSession && (
            <div className="flex items-center gap-1 border-b border-border/60 px-4 py-2">
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
              className="m-0 flex flex-1 flex-col min-h-0"
            >
              {!isLoading && groups.length === 0 ? (
                <EmptyState hasSiteFilter={selectedSiteIds.length > 0} />
              ) : (
                <DataTable
                  columns={columns}
                  data={filteredGroups}
                  layout="full-height"
                  rowHeight={60}
                  isLoading={isLoading}
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

const SEANGO_REGEX = /세\s*안\s*고|갭\s*투\s*자?/;
function hasSeangoMarker(text: string | null | undefined): boolean {
  return !!text && SEANGO_REGEX.test(text);
}

// ── Table column factory (electron-estate parity) ──────────────────

interface ColumnFactoryContext {
  onToggleFavorite: (groupId: string, next: boolean) => void;
  onUpdateStatus: (groupId: string, status: ExternalListingGroupStatus) => void;
  onUpdateMemo: (groupId: string, memo: string) => void;
  onUpdateInferredHo: (groupId: string, ho: string) => void;
}

function buildColumns(
  transactionType: ExternalListingTransactionType,
  ctx: ColumnFactoryContext,
): ColumnDef<ExternalListingGroup, unknown>[] {
  const columns: ColumnDef<ExternalListingGroup, unknown>[] = [];

  // ── 1. 즐겨찾기(★) ─────────────────────────────────────────
  columns.push({
    id: 'favorite',
    header: '',
    size: 44,
    enableResizing: false,
    cell: ({ row }) => {
      const g = row.original;
      return (
        <button
          type="button"
          aria-label={g.favorite ? '즐겨찾기 해제' : '즐겨찾기'}
          onClick={(e) => {
            e.stopPropagation();
            ctx.onToggleFavorite(g.id, !g.favorite);
          }}
          className={cn(
            'flex items-center justify-center transition-transform hover:scale-110',
            g.favorite ? 'text-yellow-400' : 'text-muted-foreground/60',
          )}
        >
          <Star
            className={cn('size-5', g.favorite && 'fill-yellow-400')}
            strokeWidth={1.5}
          />
        </button>
      );
    },
  });

  // ── 2. 정보 (광고 · 집주인 · 매물개수/순위) ───────────────────
  columns.push({
    id: 'info',
    header: '정보',
    size: 110,
    cell: ({ row }) => {
      const g = row.original;
      const main = g.mainExternalListing;
      const isActive = !!main?.isActive;
      const ranking = g.offerRanking ?? null;
      const sameAddrCnt = main?.sameAddrCnt ?? g.listingCount ?? null;
      return (
        <div className="flex items-stretch gap-1.5">
          <div className="flex flex-col gap-0.5">
            <Badge
              className={cn(
                'border-0 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white',
                isActive ? 'bg-blue-500' : 'bg-red-500',
              )}
            >
              {isActive ? '광고 O' : '광고 X'}
            </Badge>
            <Badge
              className={cn(
                'border-0 px-1.5 py-0.5 text-center text-[10px] font-semibold text-white',
                g.ownerVerified ? 'bg-green-500' : 'bg-gray-500',
              )}
            >
              {g.ownerVerified ? '집주인' : '중개사'}
            </Badge>
          </div>
          <div className="flex min-h-[40px] w-7 flex-col items-center justify-center rounded border border-border text-[10px]">
            {ranking ? (
              <>
                <div className="font-semibold tabular-nums">{ranking}/</div>
                <div className="font-semibold tabular-nums">
                  {sameAddrCnt ?? '-'}
                </div>
              </>
            ) : (
              <>
                <div className="font-semibold tabular-nums">
                  {sameAddrCnt ?? '-'}
                </div>
                <div className="text-muted-foreground">개</div>
              </>
            )}
          </div>
        </div>
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
        <div className="flex min-w-0 flex-col text-[12px]">
          <span className="truncate">{g.areaName ?? '-'}</span>
          {exclusivePyeong != null && (
            <span className="truncate text-muted-foreground tabular-nums">
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

  // ── 6. 호 (+ floorInfo, 인라인 편집) ──────────────────────
  columns.push({
    id: 'ho',
    header: '호',
    size: 80,
    cell: ({ row }) => {
      const g = row.original;
      const main = g.mainExternalListing;
      // If a Unit is linked, the ho is authoritative (read-only). Otherwise
      // show an editable input bound to inferredHo.
      if (g.unit?.name) {
        return (
          <div
            className="flex min-w-0 flex-col text-[12px]"
            title="호실이 확정되어 수정할 수 없습니다. 수정하려면 Unit 링크를 해제하세요."
          >
            <span className="truncate font-medium">{g.unit.name}</span>
            {main?.floorInfo && (
              <span className="truncate text-muted-foreground">
                {main.floorInfo}
              </span>
            )}
          </div>
        );
      }
      return (
        <div className="flex min-w-0 flex-col gap-0.5">
          <HoInput
            groupId={g.id}
            initial={g.inferredHo}
            onSave={ctx.onUpdateInferredHo}
          />
          {main?.floorInfo && (
            <span className="truncate text-[11px] text-muted-foreground">
              {main.floorInfo}
            </span>
          )}
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
            className="h-7 w-full border-border/60 px-2 text-[11px]"
            onClick={(e) => e.stopPropagation()}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(statusMeta).map(([value, meta]) => (
              <SelectItem key={value} value={value} className="text-xs">
                {meta.label}
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
        <span className="text-[13px] font-medium tabular-nums">
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
        <span className="text-[13px] font-medium tabular-nums">
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
        <span className="text-[13px] tabular-nums">
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
        <span className="text-[13px] tabular-nums">
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
      return (
        <div className="flex flex-col gap-0.5 text-[11px]">
          <Badge variant="outline" className="justify-start px-1.5 py-0 tabular-nums">
            {max ?? '-'}
          </Badge>
          <Badge variant="outline" className="justify-start px-1.5 py-0 tabular-nums">
            {min ?? '-'}
          </Badge>
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
      <span className="text-[13px]">
        {row.original.mainExternalListing?.direction ?? '-'}
      </span>
    ),
  });

  // ── 11. 날짜 (maxYmd/minYmd + 경과일) ─────────────────────
  columns.push({
    id: 'dates',
    header: '날짜',
    size: 150,
    cell: ({ row }) => {
      const g = row.original;
      return (
        <div className="flex items-center gap-1.5">
          <div className="flex flex-col gap-0.5 text-[11px]">
            <Badge variant="outline" className="justify-start px-1.5 py-0 tabular-nums">
              {formatYmd(g.maxYmd)}
            </Badge>
            <Badge variant="outline" className="justify-start px-1.5 py-0 tabular-nums">
              {formatYmd(g.minYmd)}
            </Badge>
          </div>
          <div className="flex min-h-[40px] w-8 flex-col items-center justify-center rounded border border-border text-[10px]">
            <div className="font-semibold tabular-nums">
              {g.confirmDateDiff ?? '-'}
            </div>
            <div className="text-muted-foreground">일</div>
          </div>
        </div>
      );
    },
  });

  // ── 12. 부동산 ──────────────────────────────────────────
  columns.push({
    id: 'realtor',
    header: '부동산',
    size: 130,
    cell: ({ row }) => (
      <span className="truncate text-[12px]">
        {row.original.mainExternalListing?.realtorName ?? '-'}
      </span>
    ),
  });

  // ── 13. 링크 (네이버 외부 이동) ────────────────────────────
  columns.push({
    id: 'link',
    header: '링크',
    size: 60,
    cell: ({ row }) => {
      const main = row.original.mainExternalListing;
      if (!main?.cpPcArticleUrl) {
        return <span className="text-[12px] text-muted-foreground">-</span>;
      }
      return (
        <Button
          asChild
          size="xs"
          className="h-6 bg-green-500 px-2 text-[11px] hover:bg-green-600"
        >
          <a
            href={main.cpPcArticleUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            N
          </a>
        </Button>
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
            {seango && (
              <span className="mr-1 inline-block rounded bg-blue-500 px-1.5 py-[2px] text-[10px] font-semibold text-white">
                세안고
              </span>
            )}
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
      className="h-6 border-border/40 px-1.5 py-0 text-[12px] shadow-none tabular-nums"
    />
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
      className="h-6 border-border/40 px-2 text-[11px] shadow-none"
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
          <DialogTitle>외부 매물 수동 입력</DialogTitle>
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

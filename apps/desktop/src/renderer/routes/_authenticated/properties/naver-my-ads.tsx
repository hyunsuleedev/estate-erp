import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Link2,
  Loader2,
  Megaphone,
  RefreshCw,
  Search,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  Listing,
  OfficeAdvertisementGroup,
  OfficeAdvertisementGroupStatus,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatMoney, formatRent } from '@/lib/format';
import {
  EmptyState,
  FilterBar,
  FilterCount,
  FilterSearch,
  PageHeader,
  StatusBadge,
} from '@/components/domain';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const PAGE_SIZE = 30;

const groupStatusMeta: Record<
  OfficeAdvertisementGroupStatus,
  { label: string; className: string }
> = {
  needs_unit_confirmation: {
    label: '호수 확인 필요',
    className: 'bg-warning-soft text-warning',
  },
  linked: { label: '연결됨', className: 'bg-success-soft text-success' },
  ignored: { label: '무시', className: 'bg-muted text-muted-foreground' },
};

const statusTabs: Array<{ value: '' | OfficeAdvertisementGroupStatus; label: string }> = [
  { value: '', label: '전체' },
  { value: 'needs_unit_confirmation', label: '호수 확인 필요' },
  { value: 'linked', label: '연결됨' },
  { value: 'ignored', label: '무시' },
];

export const Route = createFileRoute('/_authenticated/properties/naver-my-ads')({
  component: NaverMyAdsPage,
});

function NaverMyAdsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'' | OfficeAdvertisementGroupStatus>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [linkTarget, setLinkTarget] = useState<OfficeAdvertisementGroup | null>(null);

  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['office-ad-groups', { status, search, page }],
    queryFn: () =>
      api.officeAdvertisements.findAllGroups({
        status: status || undefined,
        search: search.trim() || undefined,
        page,
        limit: PAGE_SIZE,
      }),
  });

  // 상태별 카운트 (탭 뱃지용)
  const statusCounts = useStatusCounts();

  const groups = data?.items ?? [];
  const pagination = data?.pagination;

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, next }: { id: string; next: OfficeAdvertisementGroupStatus }) =>
      api.officeAdvertisements.updateGroup(id, { status: next }),
    onSuccess: (_data, vars) => {
      toast.success(
        vars.next === 'ignored' ? '광고 그룹을 무시 처리했습니다.' : '광고 그룹을 복원했습니다.',
      );
      queryClient.invalidateQueries({ queryKey: ['office-ad-groups'] });
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : '처리에 실패했습니다.'),
  });

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (value: '' | OfficeAdvertisementGroupStatus) => {
    setStatus(value);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-4 pt-4">
      <PageHeader
        title="내 광고"
        description="크롤러·MCP가 수집한 우리 사무소의 네이버 광고를 ERP 매물과 연결해 관리합니다."
      />

      <FilterBar>
        <FilterSearch value={search} onChange={handleSearch} placeholder="단지명·동·메모 검색" />
        <div className="flex items-center gap-1">
          {statusTabs.map((tabOption) => (
            <button
              key={tabOption.value}
              type="button"
              onClick={() => handleStatusChange(tabOption.value)}
              className={cn(
                'h-8 rounded-md px-3 text-xs font-medium transition-colors',
                status === tabOption.value
                  ? 'bg-background shadow-xs'
                  : 'text-muted-foreground hover:bg-background/60',
              )}
            >
              {tabOption.label}
              {tabOption.value !== '' && statusCounts[tabOption.value] != null && (
                <span className="ml-1 tabular-nums text-muted-foreground">
                  {statusCounts[tabOption.value]}
                </span>
              )}
            </button>
          ))}
        </div>
        <FilterCount n={pagination?.total ?? 0} />
      </FilterBar>

      <section className="overflow-hidden rounded-lg border bg-background">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-muted-foreground">내 광고 목록을 불러오지 못했습니다.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-3.5" />
              다시 시도
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <EmptyState
            icon={Megaphone}
            title={
              search.trim() || status
                ? '조건에 맞는 광고 그룹이 없습니다'
                : '수집된 내 광고가 없습니다'
            }
            description="크롤러 또는 MCP로 내 광고를 수집하면 여기에 표시됩니다."
            className="py-16"
          />
        ) : (
          <div className="divide-y">
            {groups.map((group) => (
              <AdGroupRow
                key={group.id}
                group={group}
                onLink={() => setLinkTarget(group)}
                onIgnore={() => updateStatusMutation.mutate({ id: group.id, next: 'ignored' })}
                onRestore={() =>
                  updateStatusMutation.mutate({ id: group.id, next: 'needs_unit_confirmation' })
                }
              />
            ))}
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between border-t px-4 py-2">
            <span className="text-xs text-muted-foreground">
              {pagination.page} / {pagination.totalPages} 페이지 · 총{' '}
              {pagination.total.toLocaleString()}건
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-3.5" />
                이전
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                다음
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        )}
      </section>

      <LinkAdGroupDialog
        group={linkTarget}
        onOpenChange={(open) => {
          if (!open) setLinkTarget(null);
        }}
      />
    </div>
  );
}

/** 상태별 그룹 수 (탭 뱃지) — limit 1 조회로 pagination.total만 사용 */
function useStatusCounts() {
  const statuses: OfficeAdvertisementGroupStatus[] = [
    'needs_unit_confirmation',
    'linked',
    'ignored',
  ];
  const needsUnit = useQuery({
    queryKey: ['office-ad-groups', 'count', statuses[0]],
    queryFn: () => api.officeAdvertisements.findAllGroups({ status: statuses[0], limit: 1 }),
    select: (d) => d.pagination.total,
  });
  const linked = useQuery({
    queryKey: ['office-ad-groups', 'count', statuses[1]],
    queryFn: () => api.officeAdvertisements.findAllGroups({ status: statuses[1], limit: 1 }),
    select: (d) => d.pagination.total,
  });
  const ignored = useQuery({
    queryKey: ['office-ad-groups', 'count', statuses[2]],
    queryFn: () => api.officeAdvertisements.findAllGroups({ status: statuses[2], limit: 1 }),
    select: (d) => d.pagination.total,
  });
  return {
    needs_unit_confirmation: needsUnit.data,
    linked: linked.data,
    ignored: ignored.data,
  } as Record<OfficeAdvertisementGroupStatus, number | undefined>;
}

// ─────────────────────────────────────────────────────────────
// 광고 그룹 행
// ─────────────────────────────────────────────────────────────

function groupOwnPriceLabel(group: OfficeAdvertisementGroup): string {
  if (group.transactionType === 'monthly') {
    return formatRent(group.ownDeposit, group.ownMonthlyRent);
  }
  return formatMoney(group.ownPrice ?? group.ownDeposit);
}

function formatYmd(value: string | null | undefined): string | null {
  if (!value || value.length !== 8) return null;
  return `${value.slice(2, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
}

function AdGroupRow({
  group,
  onLink,
  onIgnore,
  onRestore,
}: {
  group: OfficeAdvertisementGroup;
  onLink: () => void;
  onIgnore: () => void;
  onRestore: () => void;
}) {
  const meta = groupStatusMeta[group.status];
  const main = group.mainAdvertisement;
  const linkedListing = group.listingAdvertisement?.listing;
  const adUrl = main?.cpPcArticleUrl ?? main?.sourceUrl;
  const confirmYmd = formatYmd(main?.articleConfirmYmd);

  const locationLabel = [group.buildingName, group.hoHint ?? group.dongHint]
    .filter(Boolean)
    .join(' ');

  const relatedRange =
    group.relatedPriceMin != null || group.relatedPriceMax != null
      ? `${formatMoney(group.relatedPriceMin)}~${formatMoney(group.relatedPriceMax)}`
      : null;

  return (
    <div className={cn('px-4 py-3', group.status === 'ignored' && 'opacity-60')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-foreground">
              {group.siteName ?? '단지 미상'}
            </span>
            {locationLabel && (
              <span className="text-sm text-muted-foreground">{locationLabel}</span>
            )}
            {group.areaName && (
              <Badge variant="outline" className="text-[10px]">
                {group.areaName}
              </Badge>
            )}
            {group.transactionType && (
              <StatusBadge kind="transactionType" status={group.transactionType} size="sm" />
            )}
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[11px] font-medium',
                meta.className,
              )}
            >
              {meta.label}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            내 광고가 <b className="tabular-nums text-foreground">{groupOwnPriceLabel(group)}</b>
            {main?.ranking != null && ` · 노출 순위 ${main.ranking}위`}
            {group.relatedCount > 0 &&
              ` · 같은 호 광고 ${group.relatedCount}건${relatedRange ? ` (${relatedRange})` : ''}`}
            {confirmYmd && ` · 확인 ${confirmYmd}`}
          </p>
          {group.memo && (
            <p className="mt-0.5 truncate text-xs text-muted-foreground/80">메모: {group.memo}</p>
          )}
          {group.status === 'linked' && linkedListing && (
            <p className="mt-1 flex items-center gap-1.5 text-xs">
              <Link2 className="size-3.5 text-success" />
              <span className="text-muted-foreground">연결 매물:</span>
              <Link
                to="/properties/$id"
                params={{ id: linkedListing.propertyId }}
                className="font-medium text-info hover:underline"
              >
                {linkedListing.property?.site?.name ?? '매물'}
                {linkedListing.property?.unit?.name
                  ? ` ${linkedListing.property.unit.name}`
                  : ''}
              </Link>
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {adUrl && (
            <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" asChild>
              <a href={adUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="size-3.5" />
                원문
              </a>
            </Button>
          )}
          {group.status !== 'linked' && group.status !== 'ignored' && (
            <>
              <Button size="sm" className="h-7 gap-1 px-2.5 text-xs" onClick={onLink}>
                <Link2 className="size-3.5" />
                매물 연결
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={onIgnore}
              >
                무시
              </Button>
            </>
          )}
          {group.status === 'linked' && linkedListing && (
            <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs" asChild>
              <Link to="/properties/$id" params={{ id: linkedListing.propertyId }}>
                매물 보기
              </Link>
            </Button>
          )}
          {group.status === 'ignored' && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs"
              onClick={onRestore}
            >
              <Undo2 className="size-3.5" />
              복원
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 매물 연결 다이얼로그 — 내부 Listing 검색 → ListingAdvertisement 연결
// ─────────────────────────────────────────────────────────────

function listingPriceLabel(listing: Listing): string {
  if (listing.transactionType === 'monthly') {
    return formatRent(listing.deposit, listing.monthlyRent);
  }
  return formatMoney(listing.price ?? listing.deposit);
}

function LinkAdGroupDialog({
  group,
  onOpenChange,
}: {
  group: OfficeAdvertisementGroup | null;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (group) setSearch(group.siteName ?? '');
  }, [group]);

  const { data: listingsData, isFetching } = useQuery({
    queryKey: ['listings', 'ad-link-picker', search],
    queryFn: () =>
      api.listings.findAll({
        search: search.trim() || undefined,
        limit: 10,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
    enabled: !!group,
  });

  const listings = listingsData?.items ?? [];

  const linkMutation = useMutation({
    mutationFn: async (listing: Listing) => {
      if (!group) throw new Error('연결할 광고 그룹이 없습니다.');
      // 1) 해당 매물의 네이버 광고 기록을 찾고, 없으면 생성
      const existing = await api.listingAdvertisements.findAll({
        listingId: listing.id,
        channel: 'naver',
        limit: 5,
      });
      let advertisementId = existing.items[0]?.id;
      if (!advertisementId) {
        const created = await api.listingAdvertisements.create({
          listingId: listing.id,
          channel: 'naver',
          status: 'active',
          source: 'manual',
          advertisedPrice: group.ownPrice,
          advertisedDeposit: group.ownDeposit,
          advertisedMonthlyRent: group.ownMonthlyRent,
          externalAdId: group.mainAdvertisement?.articleNo ?? null,
        });
        advertisementId = created.id;
      }
      // 2) 광고 그룹 ↔ 광고 기록 연결
      return api.officeAdvertisements.linkGroupToListingAdvertisement(group.id, {
        listingAdvertisementId: advertisementId,
      });
    },
    onSuccess: () => {
      toast.success('내 광고가 ERP 매물과 연결되었습니다.');
      queryClient.invalidateQueries({ queryKey: ['office-ad-groups'] });
      queryClient.invalidateQueries({ queryKey: ['listing-advertisements'] });
      onOpenChange(false);
    },
    onError: (err) =>
      toast.error(err instanceof Error && err.message ? err.message : '연결에 실패했습니다.'),
  });

  return (
    <Dialog open={!!group} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>매물 연결</DialogTitle>
        </DialogHeader>
        {group && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <p className="font-medium">
              {group.siteName ?? '단지 미상'}
              {group.buildingName ? ` ${group.buildingName}` : ''}
              {group.hoHint ? ` ${group.hoHint}` : ''}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {group.areaName ? `${group.areaName} · ` : ''}내 광고가{' '}
              {groupOwnPriceLabel(group)}
            </p>
          </div>
        )}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="단지명·주소로 내 매물 검색"
            className="h-8 pl-8 text-sm"
          />
        </div>
        <div className="max-h-64 overflow-y-auto rounded-md border">
          {isFetching && listings.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : listings.length === 0 ? (
            <div className="px-3 py-6 text-center">
              <Building2 className="mx-auto size-5 text-muted-foreground/50" />
              <p className="mt-1 text-xs text-muted-foreground">
                검색 결과가 없습니다. 매물장에서 먼저 매물을 등록하세요.
              </p>
            </div>
          ) : (
            listings.map((listing) => (
              <button
                key={listing.id}
                type="button"
                disabled={linkMutation.isPending}
                onClick={() => linkMutation.mutate(listing)}
                className="flex w-full items-center justify-between gap-3 border-b px-3 py-2.5 text-left text-sm transition-colors last:border-b-0 hover:bg-muted/60 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium">
                      {listing.property?.site?.name ?? '단지 미상'}
                      {listing.property?.unit?.name ? ` ${listing.property.unit.name}` : ''}
                    </span>
                    <StatusBadge
                      kind="transactionType"
                      status={listing.transactionType}
                      size="sm"
                    />
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {listingPriceLabel(listing)}
                  </span>
                </span>
                <StatusBadge kind="checkStatus" status={listing.checkStatus} size="sm" />
              </button>
            ))
          )}
        </div>
        {linkMutation.isPending && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            연결 중...
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Building2, Link2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import type { BuyerRequirement, ListingsFilter } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatArea, formatDate, formatMoney, formatRent } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/domain';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

/** 매칭 후보 탐색 범위 칩 — 희망단지 우선, 그다음 희망지역, 마지막 조건 전체 */
interface CandidateScope {
  key: string;
  label: string;
  params: Partial<ListingsFilter>;
}

export function MatchSection({ requirement }: { requirement: BuyerRequirement }) {
  const queryClient = useQueryClient();
  const matches = requirement.matches ?? [];
  const matchedListingIds = useMemo(
    () => new Set(matches.map((m) => m.listingId)),
    [matches],
  );

  const scopes = useMemo<CandidateScope[]>(() => {
    const list: CandidateScope[] = [];
    for (const ps of requirement.preferredSites ?? []) {
      if (ps.site) {
        list.push({ key: `site:${ps.siteId}`, label: ps.site.name, params: { siteId: ps.siteId } });
      }
    }
    for (const pr of requirement.preferredRegions ?? []) {
      if (pr.ward?.name) {
        list.push({
          key: `ward:${pr.ward.code}`,
          label: pr.ward.name,
          params: { eupmyeondong: pr.ward.name },
        });
      } else if (pr.district?.name) {
        list.push({
          key: `district:${pr.district.code}`,
          label: pr.district.name,
          params: { sigungu: pr.district.name },
        });
      }
    }
    list.push({ key: 'all', label: '조건 전체', params: {} });
    return list;
  }, [requirement]);

  const [scopeKey, setScopeKey] = useState<string>(scopes[0]?.key ?? 'all');
  const activeScope = scopes.find((s) => s.key === scopeKey) ?? scopes[scopes.length - 1];

  const candidateParams = useMemo<ListingsFilter>(() => {
    const params: ListingsFilter = { limit: 8, sortBy: 'createdAt', sortOrder: 'desc' };
    if (requirement.transactionType) params.transactionType = requirement.transactionType;
    if (requirement.transactionType === 'monthly') {
      if (requirement.depositMin != null) params.depositMin = requirement.depositMin;
      if (requirement.depositMax != null) params.depositMax = requirement.depositMax;
      if (requirement.monthlyRentMax != null) params.monthlyRentMax = requirement.monthlyRentMax;
    } else {
      if (requirement.priceMin != null) params.priceMin = requirement.priceMin;
      if (requirement.priceMax != null) params.priceMax = requirement.priceMax;
    }
    if (requirement.areaMin != null) params.areaMin = requirement.areaMin;
    if (requirement.areaMax != null) params.areaMax = requirement.areaMax;
    return { ...params, ...activeScope?.params };
  }, [requirement, activeScope]);

  const {
    data: candidatesData,
    isLoading: candidatesLoading,
    isError: candidatesError,
    refetch: refetchCandidates,
  } = useQuery({
    queryKey: ['buyer-requirements', 'candidates', requirement.id, candidateParams],
    queryFn: () => api.listings.findAll(candidateParams),
  });

  const candidates = (candidatesData?.items ?? []).filter((listing) => !matchedListingIds.has(listing.id));

  const [creatingId, setCreatingId] = useState<string | null>(null);
  const createMatchMutation = useMutation({
    mutationFn: (listingId: string) =>
      api.matches.create({ listingId, buyerReqId: requirement.id }),
    onSuccess: async () => {
      toast.success('매칭이 생성되었습니다.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] }),
        queryClient.invalidateQueries({ queryKey: ['matches'] }),
      ]);
    },
    onError: () => {
      toast.error('매칭 생성에 실패했습니다. 이미 같은 매칭이 있는지 확인해주세요.');
    },
    onSettled: () => setCreatingId(null),
  });

  return (
    <section className="space-y-4">
      {/* ── 연결 매칭 ── */}
      <div className="rounded-lg border">
        <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold">
            연결 매칭{' '}
            <span className="font-normal text-muted-foreground">{matches.length}건</span>
          </h3>
          <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
            <Link to="/matches">
              매칭 화면으로 이동
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </div>
        {matches.length === 0 ? (
          <div className="px-4 py-6">
            <EmptyState
              icon={Link2}
              title="연결된 매칭이 없습니다"
              description="아래 매칭 후보에서 매물을 연결해보세요."
            />
          </div>
        ) : (
          <ul className="divide-y">
            {matches.map((m) => {
              const site = m.listing?.property?.site;
              const listing = m.listing;
              return (
                <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Building2 className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {site?.name ?? '매물'}
                      </span>
                      {listing && (
                        <StatusBadge
                          kind="transactionType"
                          status={listing.transactionType}
                          size="sm"
                        />
                      )}
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {listing?.transactionType === 'monthly'
                        ? formatRent(listing?.deposit, listing?.monthlyRent)
                        : formatMoney(listing?.price)}
                      <span className="mx-1.5 text-border">·</span>
                      {formatDate(m.createdAt)}
                    </p>
                  </div>
                  <StatusBadge kind="matchStage" status={m.stage} size="sm" />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── 매칭 후보 ── */}
      <div className="rounded-lg border">
        <div className="flex flex-wrap items-center gap-2 border-b bg-muted/40 px-4 py-2.5">
          <h3 className="text-sm font-semibold">매칭 후보</h3>
          <div className="flex flex-wrap gap-1">
            {scopes.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => setScopeKey(s.key)}
                className={cn(
                  'rounded-md border px-2 py-0.5 text-xs transition-colors',
                  s.key === activeScope?.key
                    ? 'border-primary/40 bg-primary/10 font-medium text-primary'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {candidatesLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : candidatesError ? (
          <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">매칭 후보를 불러오지 못했습니다.</p>
            <Button variant="outline" size="sm" onClick={() => refetchCandidates()}>
              <RefreshCw className="size-3.5" />
              다시 시도
            </Button>
          </div>
        ) : candidates.length === 0 ? (
          <div className="px-4 py-6">
            <EmptyState
              icon={Building2}
              title="조건에 맞는 후보 매물이 없습니다"
              description="탐색 범위를 바꾸거나 조건을 조정해보세요."
            />
          </div>
        ) : (
          <ul className="divide-y">
            {candidates.map((l) => {
              const site = l.property?.site;
              const unit = l.property?.unit;
              const dongName =
                unit?.dong && !unit.dong.isPlaceholder ? unit.dong.name : null;
              const area = unit?.exclusiveAreaM2 ?? unit?.siteUnitType?.exclusiveAreaM2;
              return (
                <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">
                        {site?.name ?? '매물'}
                        {dongName ? ` ${dongName}` : ''}
                        {unit?.name ? ` ${unit.name}` : ''}
                      </span>
                      <StatusBadge kind="transactionType" status={l.transactionType} size="sm" />
                      <StatusBadge kind="checkStatus" status={l.checkStatus} size="sm" />
                    </div>
                    <p className="text-xs tabular-nums text-muted-foreground">
                      {l.transactionType === 'monthly'
                        ? formatRent(l.deposit, l.monthlyRent)
                        : formatMoney(l.price)}
                      {area != null && (
                        <>
                          <span className="mx-1.5 text-border">·</span>
                          {formatArea(area)}
                        </>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 text-xs"
                    disabled={createMatchMutation.isPending}
                    onClick={() => {
                      setCreatingId(l.id);
                      createMatchMutation.mutate(l.id);
                    }}
                  >
                    {creatingId === l.id && createMatchMutation.isPending
                      ? '생성 중…'
                      : '매칭 생성'}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

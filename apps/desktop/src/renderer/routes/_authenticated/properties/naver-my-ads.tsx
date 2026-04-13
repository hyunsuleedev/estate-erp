import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useDeferredValue, useMemo, useState } from 'react';
import { AlertCircle, Building2, Megaphone, Search, Sparkles } from 'lucide-react';
import type { Listing } from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const checkStatusMeta: Record<string, { label: string; className: string }> = {
  unverified: { label: '미확인', className: 'bg-zinc-100 text-zinc-600' },
  verified: { label: '확인', className: 'bg-emerald-50 text-emerald-700' },
  in_contract: { label: '계약중', className: 'bg-blue-50 text-blue-700' },
  hold: { label: '보류', className: 'bg-amber-50 text-amber-700' },
  done: { label: '완료', className: 'bg-zinc-100 text-zinc-500' },
};

const transactionTypeMeta: Record<string, { label: string; className: string }> = {
  sale: { label: '매매', className: 'bg-rose-50 text-rose-700' },
  jeonse: { label: '전세', className: 'bg-blue-50 text-blue-700' },
  monthly: { label: '월세', className: 'bg-violet-50 text-violet-700' },
};

const managementFilterOptions = ['all', 'ready', 'review', 'excluded'] as const;
type ManagementFilter = (typeof managementFilterOptions)[number];

export const Route = createFileRoute('/_authenticated/properties/naver-my-ads')({
  component: NaverMyAdsPage,
});

function NaverMyAdsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<ManagementFilter>('all');
  const deferredSearch = useDeferredValue(searchQuery);

  const { data, isLoading } = useQuery({
    queryKey: ['naver-my-ads-listings'],
    queryFn: () =>
      api.listings.findAll({
        page: 1,
        limit: 200,
        includeHidden: true,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
  });

  const listings = data?.items ?? [];

  const filteredListings = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase();

    return listings.filter((listing) => {
      const bucket = getAdManagementBucket(listing);

      if (filter !== 'all' && bucket !== filter) {
        return false;
      }

      if (!query) {
        return true;
      }

      return [
        getListingTitle(listing),
        listing.property?.site?.roadAddress,
        listing.property?.site?.jibunAddress,
        listing.memo,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [deferredSearch, filter, listings]);

  const readyListings = filteredListings.filter((listing) => getAdManagementBucket(listing) === 'ready');
  const reviewListings = filteredListings.filter((listing) => getAdManagementBucket(listing) === 'review');
  const excludedListings = filteredListings.filter((listing) => getAdManagementBucket(listing) === 'excluded');

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">내광고관리</h1>
          <span className="text-xs text-muted-foreground">{filteredListings.length}건</span>
        </div>
        <p className="text-sm text-muted-foreground">
          실제 광고 연동 전 단계로, ERP 매물을 기준으로 광고 운영 대상을 분류합니다.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile icon={Megaphone} label="운영 가능" value={`${listings.filter((listing) => getAdManagementBucket(listing) === 'ready').length}건`} hint="확인 완료 · 공개 가능" />
        <MetricTile icon={AlertCircle} label="검토 필요" value={`${listings.filter((listing) => getAdManagementBucket(listing) === 'review').length}건`} hint="미확인 · 보류" />
        <MetricTile icon={Sparkles} label="광고 메모 있음" value={`${listings.filter((listing) => Boolean(listing.memo?.trim())).length}건`} hint="운영 판단 참고" />
        <MetricTile icon={Building2} label="제외 대상" value={`${listings.filter((listing) => getAdManagementBucket(listing) === 'excluded').length}건`} hint="숨김 · 계약중 · 완료" />
      </div>

      <section className="rounded-xl border border-border/60 bg-background">
        <div className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="매물명, 주소, 메모로 검색"
              className="pl-9"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ManagementFilterButton current={filter} value="all" label="전체" onClick={setFilter} />
            <ManagementFilterButton current={filter} value="ready" label="운영 가능" onClick={setFilter} />
            <ManagementFilterButton current={filter} value="review" label="검토 필요" onClick={setFilter} />
            <ManagementFilterButton current={filter} value="excluded" label="제외 대상" onClick={setFilter} />
          </div>
        </div>

        <div className="grid gap-4 p-4 xl:grid-cols-3">
          <ManagementColumn title="운영 가능" hint="즉시 노출 후보" listings={readyListings} />
          <ManagementColumn title="검토 필요" hint="상태 재확인 필요" listings={reviewListings} />
          <ManagementColumn title="제외 대상" hint="광고 중단 또는 제외" listings={excludedListings} />
        </div>

        {isLoading && (
          <div className="border-t border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
            불러오는 중...
          </div>
        )}
      </section>
    </div>
  );
}

function ManagementColumn({
  title,
  hint,
  listings,
}: {
  title: string;
  hint: string;
  listings: Listing[];
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-border/60 bg-muted/20">
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <Badge variant="secondary">{listings.length}</Badge>
      </div>

      <div className="divide-y divide-border/60">
        {listings.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">해당 매물이 없습니다.</div>
        ) : (
          listings.map((listing) => <AdManagementCard key={listing.id} listing={listing} />)
        )}
      </div>
    </section>
  );
}

function AdManagementCard({ listing }: { listing: Listing }) {
  return (
    <div className="space-y-3 px-4 py-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">{getListingTitle(listing)}</p>
          <Badge className={cn('border-0', transactionTypeMeta[listing.transactionType]?.className)}>
            {transactionTypeMeta[listing.transactionType]?.label ?? listing.transactionType}
          </Badge>
          <Badge className={cn('border-0', checkStatusMeta[listing.checkStatus]?.className)}>
            {checkStatusMeta[listing.checkStatus]?.label ?? listing.checkStatus}
          </Badge>
          {listing.isHidden && <Badge variant="outline">숨김</Badge>}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Building2 className="size-3.5" />
          <span>
            {listing.property?.site?.roadAddress ?? listing.property?.site?.jibunAddress ?? '주소 정보 없음'}
          </span>
        </div>
      </div>

      <div className="rounded-lg bg-background px-3 py-2">
        <p className="text-sm font-medium">{formatListingPrice(listing)}</p>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {listing.memo?.trim() || '광고 운영 메모 없음'}
        </p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">수정 {formatShortDate(listing.updatedAt)}</span>
        <Button asChild variant="outline" size="xs">
          <Link to="/properties/$id" params={{ id: listing.propertyId }}>
            매물 보기
          </Link>
        </Button>
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Megaphone;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-semibold tracking-tight">{value}</p>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </div>
        <div className="rounded-lg bg-muted/60 p-2 text-muted-foreground">
          <Icon className="size-4" />
        </div>
      </div>
    </div>
  );
}

function ManagementFilterButton({
  current,
  value,
  label,
  onClick,
}: {
  current: ManagementFilter;
  value: ManagementFilter;
  label: string;
  onClick: (value: ManagementFilter) => void;
}) {
  return (
    <Button type="button" variant={current === value ? 'default' : 'outline'} size="xs" onClick={() => onClick(value)}>
      {label}
    </Button>
  );
}

function getAdManagementBucket(listing: Listing): Exclude<ManagementFilter, 'all'> {
  if (listing.isHidden || listing.checkStatus === 'done' || listing.checkStatus === 'in_contract') {
    return 'excluded';
  }

  if (listing.checkStatus === 'verified') {
    return 'ready';
  }

  return 'review';
}

function getListingTitle(listing: Listing) {
  return [listing.property?.site?.name, listing.property?.unit?.name].filter(Boolean).join(' ') || '매물 정보 없음';
}

function formatListingPrice(listing: Listing) {
  if (listing.transactionType === 'monthly') {
    const deposit = listing.deposit ? formatPrice(listing.deposit) : '-';
    const monthlyRent = listing.monthlyRent ? formatPrice(listing.monthlyRent) : '-';
    return `${deposit} / ${monthlyRent}`;
  }

  const amount = listing.price ?? listing.deposit;
  return amount ? formatPrice(amount) : '-';
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

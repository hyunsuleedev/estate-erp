import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Building2,
  ExternalLink,
  Megaphone,
  Search,
  Sparkles,
} from 'lucide-react';
import type { ListingAdvertisementWithListing } from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const advertisementStatusMeta: Record<string, { label: string; className: string }> = {
  planned: { label: '예정', className: 'bg-sky-50 text-sky-700' },
  draft: { label: '초안', className: 'bg-zinc-100 text-zinc-600' },
  active: { label: '광고중', className: 'bg-emerald-50 text-emerald-700' },
  paused: { label: '일시중지', className: 'bg-amber-50 text-amber-700' },
  ended: { label: '종료', className: 'bg-zinc-100 text-zinc-500' },
  error: { label: '오류', className: 'bg-red-50 text-red-700' },
};

const transactionTypeMeta: Record<string, { label: string; className: string }> = {
  sale: { label: '매매', className: 'bg-rose-50 text-rose-700' },
  jeonse: { label: '전세', className: 'bg-blue-50 text-blue-700' },
  monthly: { label: '월세', className: 'bg-cyan-50 text-cyan-700' },
};

const managementFilterOptions = ['all', 'active', 'review', 'ended'] as const;
type ManagementFilter = (typeof managementFilterOptions)[number];

export const Route = createFileRoute('/_authenticated/properties/my-ads')({
  component: MyAdsPage,
});

function MyAdsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<ManagementFilter>('all');

  const { data, isError, isLoading } = useQuery({
    queryKey: ['my-ads-advertisements', searchQuery],
    queryFn: () =>
      api.listingAdvertisements.findAll({
        page: 1,
        limit: 100,
        search: searchQuery.trim() || undefined,
        sortBy: 'updatedAt',
        sortOrder: 'desc',
      }),
  });

  const advertisements = data?.items ?? [];

  const filteredAdvertisements = useMemo(() => {
    return advertisements.filter((advertisement) => {
      const bucket = getAdManagementBucket(advertisement);
      return filter === 'all' || bucket === filter;
    });
  }, [advertisements, filter]);

  return (
    <div className="-m-4 flex min-h-0 flex-1 flex-col bg-white">
      <section className="border-b border-border bg-white px-3 py-3">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold tracking-tight">내광고관리</h1>
          <span className="text-xs text-muted-foreground">{filteredAdvertisements.length}건</span>
        </div>
        <p className="text-sm text-muted-foreground">
          내 사무소의 광고 기록을 기준으로 게재 중, 검토 필요, 종료 광고를 관리합니다.
        </p>
      </div>
      </section>

      <section className="grid gap-3 border-b border-border bg-white px-3 py-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          icon={Megaphone}
          label="광고중"
          value={`${advertisements.filter((ad) => getAdManagementBucket(ad) === 'active').length}건`}
          hint="현재 게재 중"
        />
        <MetricTile
          icon={AlertCircle}
          label="검토 필요"
          value={`${advertisements.filter((ad) => getAdManagementBucket(ad) === 'review').length}건`}
          hint="초안 · 예정 · 중지 · 오류"
        />
        <MetricTile
          icon={Sparkles}
          label="광고 메모 있음"
          value={`${advertisements.filter((ad) => Boolean(ad.memo?.trim())).length}건`}
          hint="광고 기록 메모 기준"
        />
        <MetricTile
          icon={Building2}
          label="종료"
          value={`${advertisements.filter((ad) => getAdManagementBucket(ad) === 'ended').length}건`}
          hint="내림 완료"
        />
      </section>

      <section className="border-b border-border bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative mr-1 w-72 max-w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="광고 채널, 매물명, 주소, 메모로 검색"
              className="h-8 border-transparent bg-white pl-8 text-[13px] shadow-none hover:border-border focus:border-input"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ManagementFilterButton current={filter} value="all" label="전체" onClick={setFilter} />
            <ManagementFilterButton current={filter} value="active" label="광고중" onClick={setFilter} />
            <ManagementFilterButton current={filter} value="review" label="검토 필요" onClick={setFilter} />
            <ManagementFilterButton current={filter} value="ended" label="종료" onClick={setFilter} />
          </div>
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-hidden bg-white">
        {isLoading && (
          <div className="border-t border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
            불러오는 중...
          </div>
        )}

        {isError && (
          <div className="border-t border-border/60 px-4 py-10 text-center text-sm text-destructive">
            광고 데이터를 불러오지 못했습니다.
          </div>
        )}

        {!isLoading && !isError && (
          <MyAdsTable advertisements={filteredAdvertisements} />
        )}
      </section>
    </div>
  );
}

function MyAdsTable({ advertisements }: { advertisements: ListingAdvertisementWithListing[] }) {
  return (
    <div className="h-full overflow-auto">
      <table className="w-full min-w-[1120px] table-fixed border-separate border-spacing-0 text-left">
        <thead className="sticky top-0 z-10 bg-white">
          <tr>
            <TableHead className="w-[110px]">상태</TableHead>
            <TableHead className="w-[100px]">채널</TableHead>
            <TableHead className="w-[260px]">매물</TableHead>
            <TableHead className="w-[120px]">거래</TableHead>
            <TableHead className="w-[140px]">광고가</TableHead>
            <TableHead className="w-[240px]">광고 메모</TableHead>
            <TableHead className="w-[110px]">시작일</TableHead>
            <TableHead className="w-[110px]">확인일</TableHead>
            <TableHead className="w-[104px] text-right">작업</TableHead>
          </tr>
        </thead>
        <tbody>
          {advertisements.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-4 py-14 text-center text-sm text-muted-foreground">
                해당 광고가 없습니다.
              </td>
            </tr>
          ) : (
            advertisements.map((advertisement) => (
              <MyAdsTableRow key={advertisement.id} advertisement={advertisement} />
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function MyAdsTableRow({ advertisement }: { advertisement: ListingAdvertisementWithListing }) {
  const listing = advertisement.listing;
  const statusMeta = advertisementStatusMeta[advertisement.status];

  return (
    <tr className="group cursor-default hover:bg-slate-50">
      <TableCell>
        <Badge className={cn('border-0', statusMeta?.className)}>
          {statusMeta?.label ?? advertisement.status}
        </Badge>
      </TableCell>
      <TableCell>
        <span className="text-[13px] font-medium text-slate-700">{getChannelLabel(advertisement.channel)}</span>
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold text-slate-900">{getListingTitle(advertisement)}</span>
          <span className="truncate text-[12px] text-slate-500">
            {listing?.property?.site?.roadAddress ?? listing?.property?.site?.jibunAddress ?? '주소 정보 없음'}
          </span>
        </div>
      </TableCell>
      <TableCell>
        {listing ? (
          <Badge className={cn('border-0', transactionTypeMeta[listing.transactionType]?.className)}>
            {transactionTypeMeta[listing.transactionType]?.label ?? listing.transactionType}
          </Badge>
        ) : (
          <span className="text-[13px] text-slate-400">-</span>
        )}
      </TableCell>
      <TableCell>
        <span className="text-[13px] font-medium tabular-nums text-slate-800">
          {formatAdvertisementPrice(advertisement)}
        </span>
      </TableCell>
      <TableCell>
        <span className="line-clamp-2 text-[12px] leading-5 text-slate-600">
          {advertisement.memo?.trim() || '광고 메모 없음'}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-[13px] text-slate-600">
          {advertisement.startedAt ? formatShortDate(advertisement.startedAt) : '-'}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-[13px] text-slate-600">
          {advertisement.lastCheckedAt ? formatShortDate(advertisement.lastCheckedAt) : '-'}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          {advertisement.url && (
            <Button asChild variant="ghost" size="icon" title="광고 열기">
              <a href={advertisement.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" />
              </a>
            </Button>
          )}
          {listing && (
            <Button asChild variant="outline" size="xs">
              <Link to="/properties/$id" params={{ id: listing.propertyId }}>
                매물
              </Link>
            </Button>
          )}
        </div>
      </TableCell>
    </tr>
  );
}

function TableHead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        'border-b border-border bg-white px-3 py-2 text-[12px] font-medium text-slate-500',
        className,
      )}
    >
      {children}
    </th>
  );
}

function TableCell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td className={cn('border-b border-border/70 px-3 py-2.5 align-middle', className)}>
      {children}
    </td>
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

function getAdManagementBucket(advertisement: ListingAdvertisementWithListing): Exclude<ManagementFilter, 'all'> {
  if (advertisement.status === 'active') {
    return 'active';
  }

  if (advertisement.status === 'ended') {
    return 'ended';
  }

  return 'review';
}

function getListingTitle(advertisement: ListingAdvertisementWithListing) {
  const listing = advertisement.listing;
  return [listing?.property?.site?.name, listing?.property?.unit?.name].filter(Boolean).join(' ') || '매물 정보 없음';
}

function getChannelLabel(channel: string) {
  const labels: Record<string, string> = {
    naver: '네이버',
    asil: '아실',
    zigbang: '직방',
    dabang: '다방',
    hanbang: '한방',
    etc: '기타',
  };
  return labels[channel] ?? channel;
}

function formatAdvertisementPrice(advertisement: ListingAdvertisementWithListing) {
  const listing = advertisement.listing;
  if (listing?.transactionType === 'monthly') {
    const deposit = advertisement.advertisedDeposit ? formatPrice(advertisement.advertisedDeposit) : '-';
    const monthlyRent = advertisement.advertisedMonthlyRent
      ? formatPrice(advertisement.advertisedMonthlyRent)
      : '-';
    return `${deposit} / ${monthlyRent}`;
  }

  const amount = advertisement.advertisedPrice ?? advertisement.advertisedDeposit;
  return amount ? formatPrice(amount) : '-';
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

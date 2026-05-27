import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ExternalLink,
  Link2,
  Search,
} from 'lucide-react';
import type {
  ListingAdvertisementWithListing,
  OfficeAdvertisementGroup,
  OfficeAdvertisementGroupStatus,
} from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const advertisementStatusMeta: Record<string, { label: string; className: string }> = {
  planned: { label: '예정', className: 'bg-[#f1f1ef] text-[#5f5e5b]' },
  draft: { label: '초안', className: 'bg-[#f1f1ef] text-[#787774]' },
  active: { label: '광고중', className: 'bg-[#eef3ed] text-[#44745a]' },
  paused: { label: '중지', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
  ended: { label: '종료', className: 'bg-[#f1f1ef] text-[#787774]' },
  error: { label: '오류', className: 'bg-[#fbe4e4] text-[#9f5555]' },
};

const transactionTypeMeta: Record<string, { label: string; className: string }> = {
  sale: { label: '매매', className: 'bg-[#fdebec] text-[#8f4b46]' },
  jeonse: { label: '전세', className: 'bg-[#e7f3f8] text-[#337ea9]' },
  monthly: { label: '월세', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
};

const managementFilterOptions = ['all', 'active', 'review', 'ended'] as const;
type ManagementFilter = (typeof managementFilterOptions)[number];
const myAdsViewOptions = ['internal', 'naver_pending', 'naver_linked', 'naver_ignored'] as const;
type MyAdsView = (typeof myAdsViewOptions)[number];

const myAdsViewLabels: Record<MyAdsView, string> = {
  internal: '내부광고',
  naver_pending: '네이버 확인필요',
  naver_linked: '연결완료',
  naver_ignored: '무시됨',
};

const officeAdvertisementStatusMeta: Record<OfficeAdvertisementGroupStatus, { label: string; className: string }> = {
  needs_unit_confirmation: { label: '확인필요', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
  linked: { label: '연결완료', className: 'bg-[#eef3ed] text-[#44745a]' },
  ignored: { label: '무시됨', className: 'bg-[#f1f1ef] text-[#787774]' },
};

export const Route = createFileRoute('/_authenticated/properties/my-ads')({
  component: MyAdsPage,
});

function MyAdsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<ManagementFilter>('all');
  const [view, setView] = useState<MyAdsView>('internal');

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

  const officeAdvertisementStatus = getOfficeAdvertisementStatusForView(view);
  const {
    data: officeAdvertisementData,
    isError: isOfficeAdvertisementError,
    isLoading: isOfficeAdvertisementLoading,
  } = useQuery({
    queryKey: ['my-ads-office-advertisements', view, searchQuery],
    queryFn: () =>
      api.officeAdvertisements.findAllGroups({
        page: 1,
        limit: 100,
        source: 'naver',
        status: officeAdvertisementStatus,
        search: searchQuery.trim() || undefined,
        onlyUnlinked: view === 'naver_pending',
      }),
  });

  const advertisements = data?.items ?? [];
  const officeAdvertisementGroups = officeAdvertisementData?.items ?? [];

  const filteredAdvertisements = useMemo(() => {
    return advertisements.filter((advertisement) => {
      const bucket = getAdManagementBucket(advertisement);
      return filter === 'all' || bucket === filter;
    });
  }, [advertisements, filter]);

  const handleViewTabChange = (value: string) => {
    if (myAdsViewOptions.includes(value as MyAdsView)) {
      setView(value as MyAdsView);
    }
  };

  return (
    <div className="-m-4 flex min-h-0 flex-1 flex-col bg-white">
      <section className="border-b border-border bg-white px-3 py-2">
        <Tabs value={view} onValueChange={handleViewTabChange} className="min-w-0 gap-0">
          <TabsList className="max-w-full justify-start bg-muted">
            {myAdsViewOptions.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                onClick={() => setView(tab)}
                className="flex-none border-0 px-3 text-[13px] shadow-none data-[state=active]:border data-[state=active]:border-[#d9d9d6] data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"
              >
                <span>{myAdsViewLabels[tab]}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </section>

      <section className="border-b border-[#eeeeec] bg-white px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative mr-1 w-72 max-w-full">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="광고 채널, 매물명, 주소, 메모로 검색"
              className="h-8 border-transparent bg-[#f7f7f5] pl-8 text-[13px] shadow-none hover:border-[#d9d9d6] focus:border-[#d9d9d6] focus:bg-white"
            />
          </div>

          {view === 'internal' && (
            <div className="ml-1 flex flex-wrap items-center gap-2">
              <ManagementFilterButton current={filter} value="all" label="전체" onClick={setFilter} />
              <ManagementFilterButton current={filter} value="active" label="광고중" onClick={setFilter} />
              <ManagementFilterButton current={filter} value="review" label="검토 필요" onClick={setFilter} />
              <ManagementFilterButton current={filter} value="ended" label="종료" onClick={setFilter} />
            </div>
          )}
          {view !== 'internal' && (
            <div className="ml-auto text-[12px] text-muted-foreground">
              네이버 내 광고 원본과 연관 광고를 그룹 단위로 저장합니다.
            </div>
          )}
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-hidden bg-white">
        {view === 'internal' && isLoading && (
          <div className="border-t border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
            불러오는 중...
          </div>
        )}

        {view === 'internal' && isError && (
          <div className="border-t border-border/60 px-4 py-10 text-center text-sm text-destructive">
            광고 데이터를 불러오지 못했습니다.
          </div>
        )}

        {view === 'internal' && !isLoading && !isError && (
          <MyAdsTable advertisements={filteredAdvertisements} />
        )}

        {view !== 'internal' && isOfficeAdvertisementLoading && (
          <div className="border-t border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
            네이버 내 광고 데이터를 불러오는 중...
          </div>
        )}

        {view !== 'internal' && isOfficeAdvertisementError && (
          <div className="border-t border-border/60 px-4 py-10 text-center text-sm text-destructive">
            네이버 내 광고 데이터를 불러오지 못했습니다.
          </div>
        )}

        {view !== 'internal' && !isOfficeAdvertisementLoading && !isOfficeAdvertisementError && (
          <OfficeAdvertisementGroupsTable groups={officeAdvertisementGroups} view={view} />
        )}
      </section>
    </div>
  );
}

function OfficeAdvertisementGroupsTable({
  groups,
  view,
}: {
  groups: OfficeAdvertisementGroup[];
  view: MyAdsView;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        <table className="w-full min-w-[1280px] table-fixed border-separate border-spacing-0 caption-bottom text-left text-sm">
          <thead className="sticky top-0 z-20 bg-white">
            <tr>
              <TableHead className="w-[112px]">상태</TableHead>
              <TableHead className="w-[104px]">채널</TableHead>
              <TableHead className="w-[230px]">단지</TableHead>
              <TableHead className="w-[72px]">동</TableHead>
              <TableHead className="w-[80px]">호수</TableHead>
              <TableHead className="w-[104px]">거래</TableHead>
              <TableHead className="w-[148px]">내 광고가</TableHead>
              <TableHead className="w-[152px]">타 광고</TableHead>
              <TableHead className="w-[90px]">연관</TableHead>
              <TableHead className="w-[120px]">확인일</TableHead>
              <TableHead className="w-[112px] text-right">작업</TableHead>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={11} className="h-32 border-b border-[#eeeeec] px-4 text-center text-sm text-muted-foreground">
                  {view === 'naver_pending'
                    ? '내부 광고 연결이 필요한 네이버 내 광고가 없습니다.'
                    : '해당 네이버 내 광고 그룹이 없습니다.'}
                </td>
              </tr>
            ) : (
              groups.map((group) => <OfficeAdvertisementGroupRow key={group.id} group={group} />)
            )}
          </tbody>
        </table>
      </div>
      <div className="flex min-h-7 items-center gap-2 border-t border-border/60 bg-muted/30 px-3 text-[11px] text-muted-foreground">
        <span>총 {groups.length}그룹</span>
        <span className="text-[#b4b4b1]">/</span>
        <span>확인필요 {groups.filter((group) => group.status === 'needs_unit_confirmation').length}건</span>
        <span>연관 광고 {groups.reduce((sum, group) => sum + group.relatedCount, 0)}건</span>
      </div>
    </div>
  );
}

function OfficeAdvertisementGroupRow({ group }: { group: OfficeAdvertisementGroup }) {
  const statusMeta = officeAdvertisementStatusMeta[group.status];
  const mainUrl = group.mainAdvertisement?.cpPcArticleUrl ?? group.mainAdvertisement?.sourceUrl;

  return (
    <tr className="group h-10 cursor-default">
      <TableCell>
        <NotionTag className={statusMeta.className}>{statusMeta.label}</NotionTag>
      </TableCell>
      <TableCell>
        <NotionTag className="bg-[#f1f1ef] text-[#5f5e5b]">{getChannelLabel(group.source)}</NotionTag>
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold text-slate-900">
            {group.siteName ?? group.buildingName ?? '단지 정보 없음'}
          </span>
          <span className="truncate text-[12px] text-slate-500">
            {group.mainAdvertisement?.articleName ?? group.memo ?? '네이버 내 광고 원본'}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <span className="truncate text-[13px] font-medium text-slate-900">{group.dongHint ?? '-'}</span>
      </TableCell>
      <TableCell>
        <span className={cn('truncate text-[13px] font-medium', group.hoHint ? 'text-slate-900' : 'text-amber-700')}>
          {group.hoHint ?? '확인필요'}
        </span>
      </TableCell>
      <TableCell>
        {group.transactionType ? (
          <NotionTag className={transactionTypeMeta[group.transactionType]?.className}>
            {transactionTypeMeta[group.transactionType]?.label ?? group.transactionType}
          </NotionTag>
        ) : (
          <span className="text-[13px] text-slate-400">-</span>
        )}
      </TableCell>
      <TableCell>
        <span className="text-[13px] font-medium tabular-nums text-slate-800">
          {formatOfficeAdvertisementGroupPrice(group)}
        </span>
      </TableCell>
      <TableCell>
        <span className="text-[13px] tabular-nums text-slate-700">
          {formatRelatedAdvertisementRange(group)}
        </span>
      </TableCell>
      <TableCell>
        <NotionTag className="bg-[#f1f1ef] text-[#787774]">{group.relatedCount}건</NotionTag>
      </TableCell>
      <TableCell>
        <span className="text-[13px] text-slate-600">
          {group.mainAdvertisement?.articleConfirmYmd
            ? formatNaverYmd(group.mainAdvertisement.articleConfirmYmd)
            : formatShortDate(group.lastSeenAt)}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-0.5">
          {mainUrl && (
            <Button asChild variant="ghost" size="icon" title="네이버 광고 열기" className="size-7">
              <a href={mainUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
          <Button variant="outline" size="xs" disabled title="내부 광고 선택 연결은 다음 단계에서 활성화됩니다.">
            <Link2 className="mr-1 size-3" />
            연결
          </Button>
        </div>
      </TableCell>
    </tr>
  );
}

function MyAdsTable({ advertisements }: { advertisements: ListingAdvertisementWithListing[] }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        <table className="w-full min-w-[1260px] table-fixed border-separate border-spacing-0 caption-bottom text-left text-sm">
          <thead className="sticky top-0 z-20 bg-white">
            <tr>
              <TableHead className="w-[108px]">상태</TableHead>
              <TableHead className="w-[104px]">채널</TableHead>
              <TableHead className="w-[250px]">단지</TableHead>
              <TableHead className="w-[72px]">동</TableHead>
              <TableHead className="w-[72px]">호수</TableHead>
              <TableHead className="w-[104px]">거래</TableHead>
              <TableHead className="w-[144px]">광고가</TableHead>
              <TableHead className="w-[260px]">광고 메모</TableHead>
              <TableHead className="w-[112px]">시작일</TableHead>
              <TableHead className="w-[112px]">확인일</TableHead>
              <TableHead className="w-[104px] text-right">작업</TableHead>
            </tr>
          </thead>
          <tbody>
            {advertisements.length === 0 ? (
              <tr>
                <td colSpan={11} className="h-32 border-b border-[#eeeeec] px-4 text-center text-sm text-muted-foreground">
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
      <div className="flex min-h-7 items-center gap-2 border-t border-border/60 bg-muted/30 px-3 text-[11px] text-muted-foreground">
        <span>총 {advertisements.length}건</span>
        <span className="text-[#b4b4b1]">/</span>
        <span>광고중 {advertisements.filter((ad) => getAdManagementBucket(ad) === 'active').length}건</span>
        <span>검토 필요 {advertisements.filter((ad) => getAdManagementBucket(ad) === 'review').length}건</span>
        <span>종료 {advertisements.filter((ad) => getAdManagementBucket(ad) === 'ended').length}건</span>
      </div>
    </div>
  );
}

function MyAdsTableRow({ advertisement }: { advertisement: ListingAdvertisementWithListing }) {
  const listing = advertisement.listing;
  const statusMeta = advertisementStatusMeta[advertisement.status];

  return (
    <tr className="group h-10 cursor-default">
      <TableCell>
        <NotionTag className={statusMeta?.className}>
          {statusMeta?.label ?? advertisement.status}
        </NotionTag>
      </TableCell>
      <TableCell>
        <NotionTag className="bg-[#f1f1ef] text-[#5f5e5b]">{getChannelLabel(advertisement.channel)}</NotionTag>
      </TableCell>
      <TableCell>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[13px] font-semibold text-slate-900">{getSiteName(advertisement)}</span>
          <span className="truncate text-[12px] text-slate-500">
            {listing?.property?.site?.roadAddress ?? listing?.property?.site?.jibunAddress ?? '주소 정보 없음'}
          </span>
        </div>
      </TableCell>
      <TableCell>
        <span className="truncate text-[13px] font-medium text-slate-900">
          {getDongName(advertisement)}
        </span>
      </TableCell>
      <TableCell>
        <span className="truncate text-[13px] font-medium text-slate-900">
          {getUnitName(advertisement)}
        </span>
      </TableCell>
      <TableCell>
        {listing ? (
          <NotionTag className={transactionTypeMeta[listing.transactionType]?.className}>
            {transactionTypeMeta[listing.transactionType]?.label ?? listing.transactionType}
          </NotionTag>
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
        <div className="flex justify-end gap-0.5">
          {advertisement.url && (
            <Button asChild variant="ghost" size="icon" title="광고 열기" className="size-7">
              <a href={advertisement.url} target="_blank" rel="noreferrer">
                <ExternalLink className="size-3.5" />
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
        'relative h-9 border-b border-r border-[#eeeeec] bg-white px-2.5 text-left align-middle text-[13px] font-medium normal-case tracking-normal text-slate-500 last:border-r-0',
        className,
      )}
    >
      {children}
    </th>
  );
}

function TableCell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td
      className={cn(
        'select-none border-b border-r border-[#eeeeec] px-2.5 align-middle text-[13px] group-hover:bg-slate-50/70 last:border-r-0',
        className,
      )}
    >
      {children}
    </td>
  );
}

function NotionTag({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 max-w-full items-center rounded-[3px] px-1.5 text-[12px] font-medium leading-none',
        className,
      )}
    >
      {children}
    </span>
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
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className={cn(
        'h-7 rounded-[3px] px-2 text-[12px] text-[#5f5e5b] hover:bg-[#f1f1ef]',
        current === value && 'bg-[#37352f] text-white hover:bg-[#37352f] hover:text-white',
      )}
      onClick={() => onClick(value)}
    >
      {label}
    </Button>
  );
}

function getOfficeAdvertisementStatusForView(view: MyAdsView): OfficeAdvertisementGroupStatus | undefined {
  if (view === 'naver_pending') return 'needs_unit_confirmation';
  if (view === 'naver_linked') return 'linked';
  if (view === 'naver_ignored') return 'ignored';
  return undefined;
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

function getSiteName(advertisement: ListingAdvertisementWithListing) {
  const listing = advertisement.listing;
  return listing?.property?.site?.name ?? '매물 정보 없음';
}

function getDongName(advertisement: ListingAdvertisementWithListing) {
  const dong = advertisement.listing?.property?.unit?.dong;
  if (!dong || dong.isPlaceholder) return '-';
  return dong.name.replace(/\s*동$/, '');
}

function getUnitName(advertisement: ListingAdvertisementWithListing) {
  return advertisement.listing?.property?.unit?.name ?? '-';
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

function formatOfficeAdvertisementGroupPrice(group: OfficeAdvertisementGroup) {
  if (group.transactionType === 'monthly') {
    const deposit = group.ownDeposit ? formatPrice(group.ownDeposit) : '-';
    const monthlyRent = group.ownMonthlyRent ? formatPrice(group.ownMonthlyRent) : '-';
    return `${deposit} / ${monthlyRent}`;
  }

  const amount = group.ownPrice ?? group.ownDeposit;
  return amount ? formatPrice(amount) : '-';
}

function formatRelatedAdvertisementRange(group: OfficeAdvertisementGroup) {
  if (!group.relatedPriceMin && !group.relatedPriceMax) return '-';
  if (group.relatedPriceMin === group.relatedPriceMax) {
    return group.relatedPriceMin ? formatPrice(group.relatedPriceMin) : '-';
  }
  const min = group.relatedPriceMin ? formatPrice(group.relatedPriceMin) : '-';
  const max = group.relatedPriceMax ? formatPrice(group.relatedPriceMax) : '-';
  return `${min} ~ ${max}`;
}

function formatNaverYmd(value: string) {
  if (!/^\d{8}$/.test(value)) return value;
  return new Date(
    Number(value.slice(0, 4)),
    Number(value.slice(4, 6)) - 1,
    Number(value.slice(6, 8)),
  ).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

function formatShortDate(value: string) {
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

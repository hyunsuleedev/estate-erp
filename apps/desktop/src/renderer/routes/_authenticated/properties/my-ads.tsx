import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import {
  ExternalLink,
  Link2,
  Search,
} from 'lucide-react';
import type {
  OfficeAdvertisementGroup,
  OfficeAdvertisementGroupStatus,
} from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

const transactionTypeMeta: Record<string, { label: string; className: string }> = {
  sale: { label: '매매', className: 'bg-[#fdebec] text-[#8f4b46]' },
  jeonse: { label: '전세', className: 'bg-[#e7f3f8] text-[#337ea9]' },
  monthly: { label: '월세', className: 'bg-[#fbf3db] text-[#8f6b1f]' },
};

const topTabOptions = ['internal', 'naver'] as const;
type TopTab = (typeof topTabOptions)[number];

const internalNaverStatusOptions = ['naver_pending', 'naver_linked', 'naver_ignored'] as const;
type InternalNaverStatus = (typeof internalNaverStatusOptions)[number];

const topTabLabels: Record<TopTab, string> = {
  internal: '내부광고',
  naver: '네이버광고',
};

const internalNaverStatusLabels: Record<InternalNaverStatus, string> = {
  naver_pending: '네이버 연결필요',
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
  const [topTab, setTopTab] = useState<TopTab>('internal');
  const [internalNaverStatus, setInternalNaverStatus] = useState<InternalNaverStatus>('naver_pending');

  const officeAdvertisementStatus =
    topTab === 'internal' ? getOfficeAdvertisementStatusForInternalStatus(internalNaverStatus) : undefined;
  const {
    data: officeAdvertisementData,
    isError: isOfficeAdvertisementError,
    isLoading: isOfficeAdvertisementLoading,
  } = useQuery({
    queryKey: ['my-ads-office-advertisements', topTab, internalNaverStatus, searchQuery],
    queryFn: () =>
      api.officeAdvertisements.findAllGroups({
        page: 1,
        limit: 100,
        source: 'naver',
        status: officeAdvertisementStatus,
        search: searchQuery.trim() || undefined,
        onlyUnlinked: topTab === 'internal' && internalNaverStatus === 'naver_pending',
      }),
  });

  const officeAdvertisementGroups = officeAdvertisementData?.items ?? [];

  const handleTopTabChange = (value: string) => {
    if (topTabOptions.includes(value as TopTab)) {
      setTopTab(value as TopTab);
    }
  };

  const handleInternalNaverStatusChange = (value: string) => {
    if (internalNaverStatusOptions.includes(value as InternalNaverStatus)) {
      setInternalNaverStatus(value as InternalNaverStatus);
    }
  };

  return (
    <div className="-m-4 flex min-h-0 flex-1 flex-col bg-white">
      <section className="border-b border-border bg-white px-3 py-2">
        <Tabs value={topTab} onValueChange={handleTopTabChange} className="min-w-0 gap-0">
          <TabsList className="max-w-full justify-start bg-muted">
            {topTabOptions.map((tab) => (
              <TabsTrigger
                key={tab}
                value={tab}
                onClick={() => setTopTab(tab)}
                className="flex-none border-0 px-3 text-[13px] shadow-none data-[state=active]:border data-[state=active]:border-[#d9d9d6] data-[state=active]:bg-white data-[state=active]:text-slate-950 data-[state=active]:shadow-sm"
              >
                <span>{topTabLabels[tab]}</span>
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

          {topTab === 'internal' && (
            <Tabs
              value={internalNaverStatus}
              onValueChange={handleInternalNaverStatusChange}
              className="min-w-0 gap-0"
            >
              <TabsList className="h-8 max-w-full justify-start bg-transparent p-0">
                {internalNaverStatusOptions.map((tab) => (
                  <TabsTrigger
                    key={tab}
                    value={tab}
                    onClick={() => setInternalNaverStatus(tab)}
                    className="h-7 flex-none rounded-[3px] border-0 px-2 text-[12px] text-[#5f5e5b] shadow-none hover:bg-[#f1f1ef] data-[state=active]:bg-[#37352f] data-[state=active]:text-white data-[state=active]:shadow-none"
                  >
                    <span>{internalNaverStatusLabels[tab]}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          {topTab === 'naver' && (
            <div className="ml-auto text-[12px] text-muted-foreground">
              네이버에서 가져온 내 광고 원본과 같은 주소의 연관 광고를 함께 봅니다.
            </div>
          )}
        </div>
      </section>

      <section className="min-h-0 flex-1 overflow-hidden bg-white">
        {topTab === 'naver' && isOfficeAdvertisementLoading && (
          <div className="border-t border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
            네이버 광고 데이터를 불러오는 중...
          </div>
        )}

        {topTab === 'naver' && isOfficeAdvertisementError && (
          <div className="border-t border-border/60 px-4 py-10 text-center text-sm text-destructive">
            네이버 광고 데이터를 불러오지 못했습니다.
          </div>
        )}

        {topTab === 'naver' && !isOfficeAdvertisementLoading && !isOfficeAdvertisementError && (
          <OfficeAdvertisementGroupsTable groups={officeAdvertisementGroups} />
        )}

        {topTab === 'internal' && isOfficeAdvertisementLoading && (
          <div className="border-t border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
            네이버 내 광고 데이터를 불러오는 중...
          </div>
        )}

        {topTab === 'internal' && isOfficeAdvertisementError && (
          <div className="border-t border-border/60 px-4 py-10 text-center text-sm text-destructive">
            네이버 내 광고 데이터를 불러오지 못했습니다.
          </div>
        )}

        {topTab === 'internal' && !isOfficeAdvertisementLoading && !isOfficeAdvertisementError && (
          <OfficeAdvertisementGroupsTable groups={officeAdvertisementGroups} status={internalNaverStatus} />
        )}
      </section>
    </div>
  );
}

function OfficeAdvertisementGroupsTable({
  groups,
  status,
}: {
  groups: OfficeAdvertisementGroup[];
  status?: InternalNaverStatus;
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
                  {getOfficeAdvertisementEmptyMessage(status)}
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

function getOfficeAdvertisementEmptyMessage(status?: InternalNaverStatus) {
  if (status === 'naver_pending') return '내부 광고 연결이 필요한 네이버 내 광고가 없습니다.';
  if (status === 'naver_linked') return '내부 광고와 연결된 네이버 광고가 없습니다.';
  if (status === 'naver_ignored') return '무시된 네이버 광고가 없습니다.';
  return '네이버 광고 그룹이 없습니다.';
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

function getOfficeAdvertisementStatusForInternalStatus(
  status: InternalNaverStatus,
): OfficeAdvertisementGroupStatus | undefined {
  if (status === 'naver_pending') return 'needs_unit_confirmation';
  if (status === 'naver_linked') return 'linked';
  if (status === 'naver_ignored') return 'ignored';
  return undefined;
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

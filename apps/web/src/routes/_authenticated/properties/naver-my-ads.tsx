import { createFileRoute, Link } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  Building2,
  Calendar,
  CalendarCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Coins,
  ExternalLink,
  Hash,
  Layers,
  LayoutGrid,
  Link2,
  Loader2,
  MapPin,
  Megaphone,
  RefreshCw,
  Ruler,
  Search,
  Undo2,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
  Listing,
  OfficeAdvertisement,
  OfficeAdvertisementGroup,
  OfficeAdvertisementGroupStatus,
} from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney, formatRent } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/domain';
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

/** 노출 순위 → 톤 (1~3위 / 4~10위 / 10위 밖) */
function rankTone(ranking: number | null | undefined): string {
  if (ranking == null) return 'bg-muted text-muted-foreground';
  if (ranking <= 3) return 'bg-warning-soft text-warning';
  if (ranking <= 10) return 'bg-success-soft text-success';
  return 'bg-destructive-soft text-destructive';
}

/** 리스트 테이블 그리드 (헤더/행 공통) */
const GRID_COLS =
  'grid grid-cols-[160px_60px_80px_56px_64px_96px_64px_64px_112px_86px_86px_96px_76px_minmax(220px,1fr)]';

export const Route = createFileRoute('/_authenticated/properties/naver-my-ads')({
  component: NaverMyAdsPage,
});

function NaverMyAdsPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'' | OfficeAdvertisementGroupStatus>('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    <div className="-m-4 flex min-h-0 min-w-0 flex-1 flex-col bg-background">
      {/* 헤더: 상태 탭 + 검색 */}
      <div className="flex flex-wrap items-center gap-2.5 border-b px-6 py-3">
        <div className="flex flex-wrap gap-1.5">
          {statusTabs.map((tabOption) => {
            const active = status === tabOption.value;
            const count =
              tabOption.value !== '' ? statusCounts[tabOption.value] : undefined;
            return (
              <button
                key={tabOption.value}
                type="button"
                onClick={() => handleStatusChange(tabOption.value)}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors',
                  active
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                {tabOption.label}
                {count != null && (
                  <span
                    className={cn(
                      'inline-flex h-4 min-w-[17px] items-center justify-center rounded-full px-1.5 text-[10.5px] font-semibold tabular-nums',
                      active ? 'bg-background/25 text-background' : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <div className="flex h-8 w-[230px] max-w-full items-center gap-2 rounded-lg border bg-muted px-3">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="단지 · 동/호 · 메모 검색"
            className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* 본문: 게재 현황 테이블 */}
      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading ? (
          <div className="space-y-2 p-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-md" />
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
        ) : (
          <div className="min-w-[1260px]">
            {/* 컬럼 헤더 */}
            <div className={cn(GRID_COLS, 'sticky top-0 z-[2] border-b bg-background')}>
              <HeaderCell icon={Building2} label="단지" className="sticky left-0 z-[1] bg-background" />
              <HeaderCell icon={MapPin} label="동" />
              <HeaderCell icon={Hash} label="호" />
              <HeaderCell label="상세" />
              <HeaderCell icon={LayoutGrid} label="평형" />
              <HeaderCell icon={Ruler} label="면적" />
              <HeaderCell icon={Megaphone} label="채널" />
              <HeaderCell icon={ArrowLeftRight} label="거래" />
              <HeaderCell icon={Coins} label="내 광고가" />
              <HeaderCell icon={Calendar} label="최초 관측" />
              <HeaderCell icon={CalendarCheck} label="확인일" />
              <HeaderCell icon={BarChart3} label="순위" />
              <HeaderCell icon={Layers} label="층" />
              <HeaderCell label="상태 · 작업" last />
            </div>

            {groups.length === 0 ? (
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
              groups.map((group) => (
                <AdGroupRow
                  key={group.id}
                  group={group}
                  expanded={expandedId === group.id}
                  onToggleExpand={() =>
                    setExpandedId((prev) => (prev === group.id ? null : group.id))
                  }
                  onLink={() => setLinkTarget(group)}
                  onIgnore={() => updateStatusMutation.mutate({ id: group.id, next: 'ignored' })}
                  onRestore={() =>
                    updateStatusMutation.mutate({ id: group.id, next: 'needs_unit_confirmation' })
                  }
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* 푸터: 카운트 + 순위 범례 + 페이지네이션 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t bg-muted/40 px-6 py-1.5 text-[11.5px] text-muted-foreground">
        <span className="tabular-nums">
          표시 {groups.length} / 전체 {(pagination?.total ?? 0).toLocaleString()}건
        </span>
        <div className="flex-1" />
        <span className="inline-flex items-center gap-1">
          <span className="size-[9px] rounded-[3px] bg-warning-soft" />
          1~3위
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-[9px] rounded-[3px] bg-success-soft" />
          4~10위
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-[9px] rounded-[3px] bg-destructive-soft" />
          10위 밖
        </span>
        {pagination && pagination.totalPages > 1 && (
          <div className="ml-2 flex items-center gap-1">
            <span className="tabular-nums">
              {pagination.page} / {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-0.5 px-1.5 text-[11px]"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="size-3" />
              이전
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-0.5 px-1.5 text-[11px]"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              다음
              <ChevronRight className="size-3" />
            </Button>
          </div>
        )}
      </div>

      <LinkAdGroupDialog
        group={linkTarget}
        onOpenChange={(open) => {
          if (!open) setLinkTarget(null);
        }}
      />
    </div>
  );
}

/** 컬럼 헤더 셀 */
function HeaderCell({
  icon: Icon,
  label,
  className,
  last,
}: {
  icon?: typeof Building2;
  label: string;
  className?: string;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex h-9 items-center gap-1.5 whitespace-nowrap px-2.5 text-[11.5px] text-muted-foreground/80',
        !last && 'border-r border-border/60',
        className,
      )}
    >
      {Icon && <Icon className="size-[13px] text-muted-foreground/60" />}
      {label}
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

/** m² 면적 표기 — "112.4/84.9㎡" (공급/전용) */
function areaLine(group: OfficeAdvertisementGroup): string {
  const supply = group.supplyAreaM2 != null ? Number(group.supplyAreaM2) : null;
  const exclusive = group.exclusiveAreaM2 != null ? Number(group.exclusiveAreaM2) : null;
  if (supply != null && exclusive != null) return `${supply}/${exclusive}㎡`;
  if (exclusive != null) return `${exclusive}㎡`;
  if (supply != null) return `${supply}㎡`;
  return '—';
}

function sourceLabel(source: string): string {
  return source === 'naver' ? '네이버' : source;
}

/** 거래유형별 대표 금액 (만원) — 비교용 */
function primaryAmount(
  transactionType: string | null,
  amounts: { price: number | null; deposit: number | null },
): number | null {
  if (transactionType === 'monthly') return amounts.deposit;
  return amounts.price ?? amounts.deposit;
}

function AdGroupRow({
  group,
  expanded,
  onToggleExpand,
  onLink,
  onIgnore,
  onRestore,
}: {
  group: OfficeAdvertisementGroup;
  expanded: boolean;
  onToggleExpand: () => void;
  onLink: () => void;
  onIgnore: () => void;
  onRestore: () => void;
}) {
  const meta = groupStatusMeta[group.status];
  const main = group.mainAdvertisement;
  const linkedListing = group.listingAdvertisement?.listing;
  const adUrl = main?.cpPcArticleUrl ?? main?.sourceUrl;
  const confirmYmd = formatYmd(main?.articleConfirmYmd);
  const ads = group.advertisements ?? [];
  const hasComp = ads.length > 1;
  // memo는 펼침 패널에서만 보이므로, 경쟁 광고가 없어도 memo가 있으면 펼칠 수 있어야 함
  const canExpand = hasComp || Boolean(group.memo);

  const dongLabel = group.buildingName ?? group.dongHint;
  const linkedHoLabel = linkedListing?.property?.unit?.name ?? group.hoHint;

  return (
    <div className={cn(group.status === 'ignored' && 'opacity-60')}>
      {/* 본 행 */}
      <div
        onClick={canExpand ? onToggleExpand : undefined}
        className={cn(
          GRID_COLS,
          'group items-stretch border-b border-border/60',
          canExpand && 'cursor-pointer',
          expanded ? 'bg-[#fafaf9]' : 'hover:bg-[#fafaf9]',
        )}
      >
        {/* 단지 (sticky) */}
        <div
          className={cn(
            'sticky left-0 z-[1] flex min-h-10 min-w-0 items-center border-r border-border/60 px-2.5',
            expanded ? 'bg-[#fafaf9]' : 'bg-background group-hover:bg-[#fafaf9]',
          )}
        >
          <span className="truncate text-[13px] font-semibold text-foreground">
            {group.siteName ?? '단지 미상'}
          </span>
        </div>
        {/* 동 */}
        <Cell>{dongLabel ?? '—'}</Cell>
        {/* 호 — 미연결은 "연결" 칩 */}
        <Cell>
          {group.status === 'linked' ? (
            <span className="text-[13px] text-foreground">{linkedHoLabel ?? '—'}</span>
          ) : group.status === 'needs_unit_confirmation' ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLink();
              }}
              className="inline-flex h-5 items-center gap-0.5 whitespace-nowrap rounded-md border border-info-soft bg-info-soft/50 px-1.5 text-[10.5px] font-medium text-info hover:bg-info-soft"
            >
              <Link2 className="size-[11px]" />
              연결
            </button>
          ) : (
            <span className="text-[13px] text-muted-foreground">{group.hoHint ?? '—'}</span>
          )}
        </Cell>
        {/* 상세 (경쟁 광고 비교 펼침) */}
        <Cell className="justify-center px-1">
          {canExpand && (
            <span
              className={cn(
                'inline-flex h-5 items-center gap-0.5 whitespace-nowrap rounded-full border px-1.5 text-[11px] font-semibold',
                expanded
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background text-muted-foreground group-hover:bg-muted',
              )}
            >
              상세
              {expanded ? (
                <ChevronUp className="size-[11px]" />
              ) : (
                <ChevronDown className="size-[11px]" />
              )}
            </span>
          )}
        </Cell>
        {/* 평형 */}
        <Cell>{group.areaName ?? '—'}</Cell>
        {/* 면적 */}
        <Cell className="text-[11.5px] tabular-nums">{areaLine(group)}</Cell>
        {/* 채널 */}
        <Cell>
          <span className="inline-flex h-[22px] items-center whitespace-nowrap rounded-md bg-secondary px-2 text-[11.5px] font-medium text-secondary-foreground/80">
            {sourceLabel(group.source)}
          </span>
        </Cell>
        {/* 거래유형 */}
        <Cell>
          {group.transactionType ? (
            <StatusBadge kind="transactionType" status={group.transactionType} size="sm" />
          ) : (
            '—'
          )}
        </Cell>
        {/* 내 광고가 */}
        <Cell className="text-[13px] font-semibold text-foreground tabular-nums">
          {groupOwnPriceLabel(group)}
        </Cell>
        {/* 최초 관측 */}
        <Cell className="text-[11.5px] tabular-nums">{formatDate(group.firstSeenAt)}</Cell>
        {/* 네이버 확인일 */}
        <Cell className="text-[11.5px] tabular-nums">{confirmYmd ?? '—'}</Cell>
        {/* 노출 순위 */}
        <Cell>
          <span
            className={cn(
              'inline-flex h-[21px] items-center gap-0.5 whitespace-nowrap rounded-md px-2 text-[11.5px] font-semibold tabular-nums',
              rankTone(main?.ranking),
            )}
          >
            {main?.ranking != null ? `${main.ranking}위` : '순위 —'}
            {main?.sameAddrCnt != null && (
              <span className="font-normal opacity-70">/ {main.sameAddrCnt}</span>
            )}
          </span>
        </Cell>
        {/* 층 */}
        <Cell className="text-[11.5px]">{group.floorInfo ?? '—'}</Cell>
        {/* 상태 · 작업 */}
        <div className="flex min-h-10 items-center justify-between gap-2 px-2.5">
          <span
            className={cn(
              'whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-medium',
              meta.className,
            )}
          >
            {meta.label}
          </span>
          <div
            className="flex shrink-0 items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            {adUrl && (
              <Button variant="ghost" size="sm" className="h-6 gap-1 px-1.5 text-[11px]" asChild>
                <a href={adUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-3" />
                  원문
                </a>
              </Button>
            )}
            {group.status !== 'linked' && group.status !== 'ignored' && (
              <>
                <Button size="sm" className="h-6 gap-1 px-2 text-[11px]" onClick={onLink}>
                  <Link2 className="size-3" />
                  매물 연결
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2 text-[11px]"
                  onClick={onIgnore}
                >
                  무시
                </Button>
              </>
            )}
            {group.status === 'linked' && linkedListing && (
              <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" asChild>
                <Link to="/properties/$id" params={{ id: linkedListing.propertyId }}>
                  매물 보기
                </Link>
              </Button>
            )}
            {group.status === 'ignored' && (
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1 px-2 text-[11px]"
                onClick={onRestore}
              >
                <Undo2 className="size-3" />
                복원
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 펼침: 같은 주소 광고 순위 비교 (+메모) — 경쟁 광고가 없어도 메모만으로 펼침 가능 */}
      {expanded && canExpand && (
        <div className="border-b border-border/60 bg-muted/50 py-3.5 pl-12 pr-5">
          <div className="mb-2.5 flex flex-wrap items-center gap-2">
            <BarChart3 className="size-4 text-warning" />
            <span className="text-xs font-semibold text-foreground">네이버 노출 순위 비교</span>
            <span className="text-[11.5px] text-muted-foreground">
              · 같은 주소 광고 {ads.length}건
              {group.areaName ? ` · ${group.areaName} 기준` : ''}
            </span>
            {group.memo && (
              <span className="truncate text-[11.5px] text-muted-foreground/80">
                메모: {group.memo}
              </span>
            )}
          </div>
          {hasComp && (
            <div className="max-w-[880px] overflow-hidden rounded-[10px] border bg-background">
              <div className="grid grid-cols-[54px_1fr_130px_90px_110px_96px] border-b bg-muted/70">
                {['순위', '부동산', '가격', '확인일', '광고 옵션', '내 광고比'].map((label) => (
                  <div
                    key={label}
                    className="flex h-[30px] items-center px-3 text-[11px] text-muted-foreground"
                  >
                    {label}
                  </div>
                ))}
              </div>
              {ads.map((ad) => (
                <CompetitorRow key={ad.id} ad={ad} group={group} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 본 행 공용 셀 */
function Cell({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex min-h-10 items-center whitespace-nowrap border-r border-border/60 px-2.5 text-[13px] text-foreground/80',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** 펼침 패널 — 같은 주소 경쟁 광고 1건 */
function CompetitorRow({
  ad,
  group,
}: {
  ad: OfficeAdvertisement;
  group: OfficeAdvertisementGroup;
}) {
  const own = primaryAmount(group.transactionType, {
    price: group.ownPrice,
    deposit: group.ownDeposit,
  });
  const amount = primaryAmount(group.transactionType, {
    price: ad.price,
    deposit: ad.deposit,
  });

  const priceLabel =
    group.transactionType === 'monthly'
      ? formatRent(ad.deposit, ad.monthlyRent)
      : formatMoney(ad.price ?? ad.deposit);

  // 월세는 보증금이 같아도 월세가 다르면 '동일'이 아님 — 2차 비교축
  const ownRent = group.transactionType === 'monthly' ? group.ownMonthlyRent : null;
  const adRent = group.transactionType === 'monthly' ? ad.monthlyRent : null;

  let cmp: { label: string; className: string };
  if (ad.isMine) {
    cmp = { label: '내 광고', className: 'bg-warning-soft text-warning' };
  } else if (own == null || amount == null) {
    cmp = { label: '—', className: 'bg-muted text-muted-foreground' };
  } else if (amount === own) {
    if (group.transactionType === 'monthly') {
      // 월세 거래는 보증금이 같아도 월세까지 비교해야 함 — 어느 쪽이든 미상(null)이면 비교 불가
      if (ownRent == null || adRent == null) {
        cmp = { label: '—', className: 'bg-muted text-muted-foreground' };
      } else if (adRent === ownRent) {
        cmp = { label: '동일', className: 'bg-muted text-muted-foreground' };
      } else {
        cmp =
          adRent > ownRent
            ? {
                label: `월 +${(adRent - ownRent).toLocaleString()}만`,
                className: 'bg-success-soft text-success',
              }
            : {
                label: `월 -${(ownRent - adRent).toLocaleString()}만`,
                className: 'bg-destructive-soft text-destructive',
              };
      }
    } else {
      cmp = { label: '동일', className: 'bg-muted text-muted-foreground' };
    }
  } else if (amount > own) {
    cmp = { label: `+${formatMoney(amount - own)}`, className: 'bg-success-soft text-success' };
  } else {
    cmp = {
      label: `-${formatMoney(own - amount)}`,
      className: 'bg-destructive-soft text-destructive',
    };
  }

  return (
    <div
      className={cn(
        'grid grid-cols-[54px_1fr_130px_90px_110px_96px] items-center border-b border-border/60 last:border-b-0',
        ad.isMine && 'bg-warning-soft/30',
      )}
    >
      <div
        className={cn(
          'flex min-h-[38px] items-center px-3 text-xs font-bold tabular-nums',
          ad.ranking != null && ad.ranking <= 3 ? 'text-warning' : 'text-foreground/80',
        )}
      >
        {ad.ranking != null ? `${ad.ranking}위` : '—'}
      </div>
      <div className="flex min-h-[38px] min-w-0 items-center gap-1.5 px-3 text-xs text-foreground">
        <span className="truncate">{ad.realtorName ?? ad.articleName ?? '—'}</span>
        {ad.isMine && (
          <span className="shrink-0 text-[10px] font-semibold text-warning">내 광고</span>
        )}
      </div>
      <div className="flex min-h-[38px] items-center px-3 text-xs font-semibold text-foreground tabular-nums">
        {priceLabel}
      </div>
      <div className="flex min-h-[38px] items-center px-3 text-[11.5px] text-foreground/70 tabular-nums">
        {formatYmd(ad.articleConfirmYmd) ?? '—'}
      </div>
      <div className="flex min-h-[38px] items-center gap-1 px-3">
        {ad.seango && (
          <span className="inline-flex h-[18px] items-center rounded-full bg-violet-soft px-1.5 text-[10.5px] font-medium text-violet">
            선광고
          </span>
        )}
        {ad.epju && (
          <span className="inline-flex h-[18px] items-center rounded-full bg-info-soft px-1.5 text-[10.5px] font-medium text-info">
            e편주
          </span>
        )}
        {!ad.seango && !ad.epju && (
          <span className="text-[11px] text-muted-foreground/60">—</span>
        )}
      </div>
      <div className="flex min-h-[38px] items-center px-3">
        <span
          className={cn(
            'inline-flex h-[18px] items-center whitespace-nowrap rounded-full px-1.5 text-[10.5px] font-medium tabular-nums',
            cmp.className,
          )}
        >
          {cmp.label}
        </span>
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

import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Loader2, Plus, Search } from 'lucide-react';
import type { BuyerRequirement, Match } from '@estate-erp/api-client';
import { MatchStage, normalizeMatchStage, formatFloorRange } from '@estate-erp/shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { formatPhoneNumber } from '@/lib/contacts';
import { formatMoney } from '@/lib/format';
import { getStatusMeta } from '@/lib/status-config';
import { StatusBadge } from '@/components/domain';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { getMatchStageLabel } from '../../wanted-properties/-match-view-utils';
import type {
  ListingSummary,
  PropertyListingGroup,
} from './property-listings-table';
import {
  computeBudgetFit,
  formatBuyerArea,
  formatBuyerBudget,
} from './property-match-format';

// 매물관리 > 연결 구매고객 > "고객 연결".
// 매물은 이미 정해져 있으므로 묻지 않는다. 희망매물에 등록된 진행 중인 구매고객을
// 이 매물 조건과 비교해 보여 주고, 한 번 눌러 바로 연결한다.

const ROW_GRID =
  'grid grid-cols-[minmax(110px,1.1fr)_112px_52px_minmax(150px,1.3fr)_92px_84px_76px] items-center gap-x-3';

function formatListingPrice(listing: ListingSummary) {
  if (listing.transactionType === 'monthly') {
    const deposit = listing.deposit != null ? formatMoney(listing.deposit) : '-';
    const rent =
      listing.monthlyRent != null ? formatMoney(listing.monthlyRent) : '-';
    return `${deposit} / ${rent}`;
  }
  return formatMoney(listing.price ?? listing.deposit);
}

// 방금 연결한 표시의 키. 고객만으로 기억하면 거래 조건(매매/전세)을 바꿨을 때
// 그 조건에는 연결하지 않은 고객까지 '연결됨'으로 보인다.
const connectionKey = (listingId: string, buyerReqId: string) =>
  `${listingId}:${buyerReqId}`;

export function PropertyMatchConnectDialog({
  open,
  onOpenChange,
  group,
  matches,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  group: PropertyListingGroup;
  /** 이 매물에 이미 연결된 매칭 — 같은 고객을 두 번 연결하지 않게 표시한다 */
  matches: Match[];
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim());
  const [listingId, setListingId] = useState(group.listings[0]?.id ?? '');
  // 기본은 이 매물과 거래유형이 같은 고객만. 끄면 진행 중인 고객 전부.
  const [sameTypeOnly, setSameTypeOnly] = useState(true);
  const [connectedIds, setConnectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const listing =
    group.listings.find((candidate) => candidate.id === listingId) ??
    group.listings[0];

  useEffect(() => {
    if (!open) {
      setQuery('');
      setSameTypeOnly(true);
      setConnectedIds(new Set());
      setListingId(group.listings[0]?.id ?? '');
    }
  }, [group.listings, open]);

  const buyers = useQuery({
    queryKey: [
      'buyer-requirements',
      'property-match-connect',
      deferredQuery,
      sameTypeOnly ? listing?.transactionType : 'all',
    ],
    queryFn: () =>
      api.buyerRequirements.findAll({
        search: deferredQuery || undefined,
        status: 'active',
        transactionType: sameTypeOnly ? listing?.transactionType : undefined,
        limit: 50,
      }),
    enabled: open && Boolean(listing),
  });

  // 선택한 거래 조건에 이미 걸린 매칭 (구매조건 id → 매칭)
  const matchByBuyerReqId = useMemo(() => {
    const map = new Map<string, Match>();
    for (const match of matches) {
      if (match.listingId === listing?.id) map.set(match.buyerReqId, match);
    }
    return map;
  }, [listing?.id, matches]);

  const siteId = group.property?.siteId;
  const rows = useMemo(() => {
    const items = buyers.data?.items ?? [];
    const rank = (buyer: BuyerRequirement) => {
      const fit = computeBudgetFit(listing, buyer);
      const wantsSite =
        siteId != null &&
        (buyer.preferredSites ?? []).some((site) => site.siteId === siteId);
      // 희망 단지 > 예산 안 > 판정 불가 > 예산 초과
      return (wantsSite ? 0 : 10) + (fit ? (fit.over ? 2 : 0) : 1);
    };
    return items
      .map((buyer) => ({
        buyer,
        fit: computeBudgetFit(listing, buyer),
        wantsSite:
          siteId != null &&
          (buyer.preferredSites ?? []).some((site) => site.siteId === siteId),
        order: rank(buyer),
      }))
      // 이미 이 거래 조건에 연결된 고객은 맨 아래로 내린다.
      .sort(
        (a, b) =>
          Number(matchByBuyerReqId.has(a.buyer.id)) -
            Number(matchByBuyerReqId.has(b.buyer.id)) || a.order - b.order,
      );
  }, [buyers.data?.items, listing, matchByBuyerReqId, siteId]);

  const connect = useMutation({
    mutationFn: (buyer: BuyerRequirement) => {
      if (!listing) throw new Error('연결할 거래 조건이 없습니다.');
      return api.matches.create({
        listingId: listing.id,
        buyerReqId: buyer.id,
      });
    },
    onSuccess: (match, buyer) => {
      setConnectedIds((previous) =>
        new Set(previous).add(connectionKey(match.listingId, buyer.id)),
      );
      queryClient.invalidateQueries({ queryKey: ['matches'] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      queryClient.invalidateQueries({ queryKey: ['listing-intakes'] });
      queryClient.invalidateQueries({ queryKey: ['buyer-requirements'] });
      queryClient.invalidateQueries({ queryKey: ['brokerage-cases'] });
      toast.success(
        `${buyer.contact?.name ?? '구매고객'} 고객을 연결했습니다. 내부 후보로 시작합니다.`,
      );
    },
    onError: (error: Error) => {
      toast.error(`고객 연결에 실패했습니다: ${error.message}`);
    },
  });

  const property = group.property;
  const withSuffix = (name: string | null | undefined, suffix: string) =>
    name && /^\d+$/.test(name) ? `${name}${suffix}` : name;
  const location = [
    property?.site?.name,
    withSuffix(property?.unit?.dong?.name, '동'),
    property?.unit?.name ? withSuffix(property.unit.name, '호') : formatFloorRange(property?.unit ?? {}),
  ]
    .filter((part) => part && part !== '-')
    .join(' ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(640px,calc(100vh-4rem))] flex-col gap-0 overflow-hidden p-0 sm:max-w-[860px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-5 pb-3 pt-5">
          <DialogTitle className="text-[15px] font-semibold">
            고객 연결
          </DialogTitle>
          <DialogDescription className="mt-1 text-[13px] text-muted-foreground">
            {location || '이 매물'}에 연결할 구매고객을 고르세요. 연결하면 내부
            후보 단계로 시작합니다.
          </DialogDescription>

          {/* 매매·전세처럼 거래 조건이 여럿일 때만 어느 조건에 연결할지 고른다 */}
          {group.listings.length > 1 ? (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {group.listings.map((candidate) => {
                const active = candidate.id === listing?.id;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    aria-pressed={active}
                    className={cn(
                      'inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] tabular-nums transition-colors',
                      active
                        ? 'bg-foreground/[0.07] font-semibold text-foreground'
                        : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
                    )}
                    onClick={() => setListingId(candidate.id)}
                  >
                    {
                      getStatusMeta('transactionType', candidate.transactionType)
                        .label
                    }
                    <span className="font-normal text-muted-foreground">
                      {formatListingPrice(candidate)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            listing && (
              <div className="mt-2 flex items-center gap-2 text-[13px] tabular-nums text-muted-foreground">
                <StatusBadge
                  kind="transactionType"
                  status={listing.transactionType}
                  size="sm"
                />
                {formatListingPrice(listing)}
              </div>
            )
          )}
        </div>

        <div className="flex items-center gap-2 border-y border-border px-5">
          <Search className="size-4 shrink-0 text-muted-foreground/70" />
          <input
            autoFocus
            value={query}
            placeholder="고객 이름, 연락처로 검색"
            aria-label="구매고객 검색"
            className="h-10 min-w-0 flex-1 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground/60"
            onChange={(event) => setQuery(event.target.value)}
          />
          {buyers.isFetching && (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground/70" />
          )}
          <button
            type="button"
            aria-pressed={sameTypeOnly}
            title={
              sameTypeOnly
                ? '거래유형과 관계없이 모든 고객 보기'
                : '이 매물과 거래유형이 같은 고객만 보기'
            }
            className={cn(
              'inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs transition-colors',
              sameTypeOnly
                ? 'bg-foreground/[0.07] font-medium text-foreground'
                : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
            )}
            onClick={() => setSameTypeOnly((value) => !value)}
          >
            {sameTypeOnly && <Check className="size-3" />}
            {listing
              ? `${getStatusMeta('transactionType', listing.transactionType).label} 고객만`
              : '거래유형 일치'}
          </button>
        </div>

        <div className="min-h-[220px] flex-1 overflow-y-auto px-5 pb-2">
          <div
            className={cn(
              ROW_GRID,
              'sticky top-0 z-[1] h-8 border-b border-border bg-background text-[11.5px] text-muted-foreground',
            )}
          >
            <span>고객</span>
            <span>연락처</span>
            <span>거래</span>
            <span>예산</span>
            <span>면적</span>
            <span>담당</span>
            <span />
          </div>

          {buyers.isLoading ? (
            <div className="flex h-32 items-center justify-center text-[13px] text-muted-foreground">
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              구매고객을 불러오는 중...
            </div>
          ) : buyers.isError ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-[13px] text-destructive">
              구매고객을 불러오지 못했습니다.
              <button
                type="button"
                className="h-7 rounded px-2 text-xs text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
                onClick={() => void buyers.refetch()}
              >
                다시 시도
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
              {deferredQuery
                ? `"${deferredQuery}"에 맞는 진행 중인 구매고객이 없습니다.`
                : '조건에 맞는 진행 중인 구매고객이 없습니다.'}
              {sameTypeOnly && (
                <button
                  type="button"
                  className="h-7 rounded px-2 text-xs text-foreground hover:bg-foreground/[0.06]"
                  onClick={() => setSameTypeOnly(false)}
                >
                  거래유형과 관계없이 보기
                </button>
              )}
            </div>
          ) : (
            rows.map(({ buyer, fit, wantsSite }) => {
              const existing = matchByBuyerReqId.get(buyer.id);
              const justConnected =
                listing != null &&
                connectedIds.has(connectionKey(listing.id, buyer.id));
              const isPending =
                connect.isPending && connect.variables?.id === buyer.id;
              const name = buyer.contact?.name ?? '구매자 미상';
              const area = formatBuyerArea(buyer);
              const existingLabel = existing
                ? normalizeMatchStage(existing.stage) === MatchStage.CLOSED
                  ? '종료된 매칭'
                  : getMatchStageLabel(existing.stage)
                : null;

              return (
                <div
                  key={buyer.id}
                  data-connect-buyer={buyer.id}
                  className={cn(
                    ROW_GRID,
                    'min-h-10 border-b border-border text-[13px]',
                    existing || justConnected
                      ? 'text-muted-foreground/70'
                      : 'hover:bg-foreground/[0.04]',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        'min-w-0 truncate',
                        !(existing || justConnected) &&
                          'font-medium text-foreground',
                      )}
                    >
                      {name}
                    </span>
                    {buyer.urgency === 'urgent' && (
                      <span className="shrink-0 text-[11px] font-medium text-destructive">
                        {getStatusMeta('buyerUrgency', 'urgent').label}
                      </span>
                    )}
                    {wantsSite && (
                      <span
                        className="shrink-0 rounded-full bg-info-soft px-1.5 text-[11px] text-info"
                        title="이 단지를 희망 단지로 등록한 고객"
                      >
                        희망 단지
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs tabular-nums text-muted-foreground">
                    {buyer.contact?.phone
                      ? formatPhoneNumber(buyer.contact.phone)
                      : '-'}
                  </div>
                  <div className="min-w-0">
                    {buyer.transactionType ? (
                      <StatusBadge
                        kind="transactionType"
                        status={buyer.transactionType}
                        size="sm"
                      />
                    ) : (
                      <span className="text-muted-foreground/50">-</span>
                    )}
                  </div>
                  <div className="flex min-w-0 items-baseline gap-1.5 tabular-nums">
                    <span className="min-w-0 truncate">
                      {formatBuyerBudget(buyer)}
                    </span>
                    {fit && (
                      <span
                        className={cn(
                          'min-w-0 shrink-[999] truncate text-[11.5px]',
                          fit.over
                            ? 'text-destructive'
                            : 'text-muted-foreground/70',
                        )}
                        title={fit.label}
                      >
                        {fit.label}
                      </span>
                    )}
                  </div>
                  <div className="truncate tabular-nums text-muted-foreground">
                    {area ?? '-'}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {buyer.assignedTo?.name ?? ''}
                  </div>
                  <div className="flex justify-end">
                    {existingLabel ? (
                      <span
                        className="truncate text-xs text-muted-foreground/70"
                        title="이 거래 조건에 이미 연결된 고객입니다"
                      >
                        {existingLabel}
                      </span>
                    ) : justConnected ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Check className="size-3" />
                        연결됨
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={connect.isPending}
                        aria-label={`${name} 고객 연결`}
                        className="inline-flex h-7 items-center gap-1 rounded-[5px] px-2 text-xs font-medium text-foreground hover:bg-foreground/[0.08] disabled:opacity-50"
                        onClick={() => connect.mutate(buyer)}
                      >
                        {isPending ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Plus className="size-3" />
                        )}
                        연결
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border px-5 py-2.5 text-[11.5px] text-muted-foreground/80">
          희망매물에 등록된 진행 중인 구매조건만 보입니다. 예산 판정은 이 매물
          가격과 고객 예산 상한을 비교한 값입니다.
        </div>
      </DialogContent>
    </Dialog>
  );
}

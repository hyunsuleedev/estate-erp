import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  ListingAdvertisement,
  PropertyListing,
} from '@estate-erp/api-client';
import { formatPrice } from '@estate-erp/shared';
import {
  AlertTriangle,
  Megaphone,
  Pencil,
  Plus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  checkStatusColors,
  checkStatusLabels,
  comparePropertyListing,
  formatDateShort,
  formatListingPrice,
  transactionTypeColors,
  transactionTypeLabels,
} from '../utils';
import { MainSection, MainSectionEmpty } from './MainSection';

interface Props {
  listings: PropertyListing[];
  propertyId: string;
  onEditPrice: (listing: PropertyListing) => void;
  onAddListing?: () => void;
}

export function ListingsSection({
  listings,
  propertyId,
  onEditPrice,
  onAddListing,
}: Props) {
  const sorted = listings.slice().sort(comparePropertyListing);

  return (
    <MainSection
      title="거래 매물"
      count={listings.length}
      action={
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={onAddListing}
          disabled={!onAddListing}
        >
          <Plus className="size-3" />
          거래 추가
        </Button>
      }
    >
      {sorted.length === 0 ? (
        <MainSectionEmpty text="등록된 거래 매물이 없습니다." />
      ) : (
        <div className="space-y-2">
          {sorted.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              propertyId={propertyId}
              onEditPrice={() => onEditPrice(listing)}
            />
          ))}
        </div>
      )}
    </MainSection>
  );
}

function ListingCard({
  listing,
  propertyId,
  onEditPrice,
}: {
  listing: PropertyListing;
  propertyId: string;
  onEditPrice: () => void;
}) {
  const priceChange = computePriceChange(listing.priceHistories ?? []);
  const ads = listing.advertisements ?? [];

  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Badge
            className={cn(
              'border-0 text-[11px]',
              transactionTypeColors[listing.transactionType],
            )}
          >
            {transactionTypeLabels[listing.transactionType] ??
              listing.transactionType}
          </Badge>
          <Badge
            className={cn(
              'border-0 text-[11px]',
              checkStatusColors[listing.checkStatus],
            )}
          >
            {checkStatusLabels[listing.checkStatus] ?? listing.checkStatus}
          </Badge>
          {listing.isHidden && (
            <Badge variant="outline" className="text-[11px]">
              숨김
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={onEditPrice}
        >
          가격 수정
        </Button>
      </div>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-2">
        <div className="text-[22px] font-semibold leading-tight tracking-tight text-foreground">
          {formatListingPrice(listing)}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {priceChange && <PriceChangeIndicator change={priceChange} />}
          <span>등록 {formatDateShort(listing.createdAt)}</span>
          {listing.updatedAt !== listing.createdAt && (
            <span>· 수정 {formatDateShort(listing.updatedAt)}</span>
          )}
        </div>
      </div>
      <ListingAdRow listing={listing} ads={ads} />
      <ListingMemo listing={listing} propertyId={propertyId} />
    </div>
  );
}

function ListingMemo({
  listing,
  propertyId,
}: {
  listing: PropertyListing;
  propertyId: string;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(listing.memo ?? '');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 외부 갱신 동기화
  useEffect(() => {
    if (!editing) setDraft(listing.memo ?? '');
  }, [listing.memo, editing]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      const end = textareaRef.current.value.length;
      textareaRef.current.setSelectionRange(end, end);
    }
  }, [editing]);

  const mutation = useMutation({
    mutationFn: (memo: string | null) =>
      api.listings.update(listing.id, { memo: memo ?? undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['properties', propertyId] });
      queryClient.invalidateQueries({ queryKey: ['listings'] });
      toast.success('의뢰 메모가 저장되었습니다.');
      setEditing(false);
    },
    onError: () => {
      toast.error('의뢰 메모 저장에 실패했습니다.');
    },
  });

  const handleSave = () => {
    const next = draft.trim();
    const current = listing.memo?.trim() ?? '';
    if (next === current) {
      setEditing(false);
      return;
    }
    mutation.mutate(next.length === 0 ? null : next);
  };

  const handleCancel = () => {
    setDraft(listing.memo ?? '');
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="mt-2 space-y-1.5">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          의뢰 메모
        </div>
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleSave();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              handleCancel();
            }
          }}
          className="w-full resize-none rounded border border-border bg-white px-2 py-1.5 text-[12px] leading-5 outline-none focus:border-foreground/40"
          rows={3}
          placeholder="소유주가 의뢰한 사정 / 협상 여지 / 입주 가능 시점 등..."
        />
        <div className="flex items-center justify-end gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={handleCancel}
            disabled={mutation.isPending}
          >
            취소
          </Button>
          <Button
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={handleSave}
            disabled={mutation.isPending}
          >
            저장
          </Button>
        </div>
      </div>
    );
  }

  if (listing.memo) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="mt-2 flex w-full items-start gap-1.5 rounded px-1 py-1 text-left hover:bg-muted/40"
      >
        <Pencil className="mt-0.5 size-3 shrink-0 text-muted-foreground/60" />
        <p className="whitespace-pre-wrap text-[12px] leading-5 text-foreground">
          {listing.memo}
        </p>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="mt-2 flex w-full items-center gap-1 rounded border border-dashed border-border px-2 py-1.5 text-[11px] text-muted-foreground hover:border-foreground/40 hover:text-foreground"
    >
      <Pencil className="size-3" />
      의뢰 메모 추가
    </button>
  );
}

const adStatusMeta: Record<
  string,
  { label: string; cls: string; dot: string }
> = {
  active: {
    label: '게재중',
    cls: 'text-emerald-700',
    dot: 'bg-emerald-500',
  },
  planned: { label: '대기', cls: 'text-amber-700', dot: 'bg-amber-500' },
  draft: { label: '준비', cls: 'text-slate-600', dot: 'bg-slate-400' },
  paused: { label: '내림', cls: 'text-slate-500', dot: 'bg-slate-300' },
  ended: { label: '종료', cls: 'text-slate-400', dot: 'bg-slate-300' },
  error: { label: '오류', cls: 'text-rose-700', dot: 'bg-rose-500' },
};

const channelLabels: Record<string, string> = {
  naver: '네이버',
  kb: 'KB',
  daum: '다음',
  hanbang: '한방',
  kmls: 'KMLS',
  app: '앱',
};

function ListingAdRow({
  listing,
  ads,
}: {
  listing: PropertyListing;
  ads: ListingAdvertisement[];
}) {
  if (ads.length === 0) {
    return (
      <div className="mt-2 flex items-center gap-1.5 border-t border-border/60 pt-2 text-[11px] text-muted-foreground">
        <Megaphone className="size-3" />
        <span>광고 미게재</span>
      </div>
    );
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/60 pt-2 text-[11px]">
      <Megaphone className="size-3 text-muted-foreground" />
      {ads.map((ad) => (
        <AdChip key={ad.id} listing={listing} ad={ad} />
      ))}
    </div>
  );
}

function AdChip({
  listing,
  ad,
}: {
  listing: PropertyListing;
  ad: ListingAdvertisement;
}) {
  const meta = adStatusMeta[ad.status] ?? {
    label: ad.status,
    cls: 'text-muted-foreground',
    dot: 'bg-muted-foreground',
  };
  const channelLabel = channelLabels[ad.channel] ?? ad.channel;
  const stale = isAdvertisedPriceStale(listing, ad);
  const adPrice = formatAdPrice(listing, ad);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-border bg-white px-2 py-0.5',
        meta.cls,
      )}
    >
      <span className={cn('size-1.5 rounded-full', meta.dot)} />
      <span className="font-medium">{channelLabel}</span>
      <span className="text-[10px] text-muted-foreground">{meta.label}</span>
      {adPrice && (
        <span
          className={cn(
            'text-[10px]',
            stale ? 'text-amber-700' : 'text-muted-foreground',
          )}
          title={stale ? '광고 가격' : undefined}
        >
          {adPrice}
        </span>
      )}
      {stale && (
        <span
          className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 text-[10px] text-amber-700"
          title="현재 가격과 광고 가격이 다릅니다 — 재게재 필요"
        >
          <AlertTriangle className="size-2.5" />
          재게재 필요
        </span>
      )}
    </span>
  );
}

/**
 * 현재 listing 가격과 광고에 등록된 가격(advertisedPrice/Deposit/MonthlyRent)이
 * 다른지 확인. ad가 active 상태일 때만 의미 있음 (이미 paused/ended면 stale 표시 안 함).
 */
function isAdvertisedPriceStale(
  listing: PropertyListing,
  ad: ListingAdvertisement,
): boolean {
  if (ad.status !== 'active') return false;
  if (listing.transactionType === 'monthly') {
    if (ad.advertisedDeposit != null && ad.advertisedDeposit !== listing.deposit) {
      return true;
    }
    if (
      ad.advertisedMonthlyRent != null &&
      ad.advertisedMonthlyRent !== listing.monthlyRent
    ) {
      return true;
    }
    return false;
  }
  return ad.advertisedPrice != null && ad.advertisedPrice !== listing.price;
}

/**
 * chip 안에 보일 광고 가격 압축 표기.
 * - 매매/전세: 단일 가격 → "5억 5,000"
 * - 월세: 보증금/월세 둘 다 있으면 "1,000 / 80", 하나만 있으면 그대로
 * - 광고에 가격이 하나도 없으면 null
 */
function formatAdPrice(
  listing: PropertyListing,
  ad: ListingAdvertisement,
): string | null {
  if (listing.transactionType === 'monthly') {
    const dep = ad.advertisedDeposit;
    const rent = ad.advertisedMonthlyRent;
    if (dep != null && rent != null) {
      return `${formatPrice(dep)} / ${rent.toLocaleString()}만`;
    }
    if (dep != null) return formatPrice(dep);
    if (rent != null) return `월 ${rent.toLocaleString()}만`;
    return null;
  }
  return ad.advertisedPrice != null ? formatPrice(ad.advertisedPrice) : null;
}

function PriceChangeIndicator({
  change,
}: {
  change: { delta: number; direction: 'up' | 'down' };
}) {
  const Icon = change.direction === 'up' ? TrendingUp : TrendingDown;
  const colorClass =
    change.direction === 'up' ? 'text-rose-600' : 'text-emerald-600';
  return (
    <span className={cn('inline-flex items-center gap-0.5', colorClass)}>
      <Icon className="size-3" />
      {Math.abs(change.delta).toLocaleString()}만
    </span>
  );
}

interface PriceHistoryEntry {
  priceBefore: number | null;
  priceAfter: number | null;
  createdAt: string;
}

function computePriceChange(
  histories: PriceHistoryEntry[],
): { delta: number; direction: 'up' | 'down' } | null {
  const sorted = histories
    .slice()
    .sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  const latest = sorted[0];
  if (!latest || latest.priceAfter == null || latest.priceBefore == null) {
    return null;
  }
  const delta = latest.priceAfter - latest.priceBefore;
  if (delta === 0) return null;
  return { delta, direction: delta > 0 ? 'up' : 'down' };
}

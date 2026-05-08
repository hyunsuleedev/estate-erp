import type { PropertyListing } from '@estate-erp/api-client';
import { Plus, TrendingDown, TrendingUp } from 'lucide-react';
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
  onEditPrice: (listing: PropertyListing) => void;
  onAddListing?: () => void;
}

export function ListingsSection({ listings, onEditPrice, onAddListing }: Props) {
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
  onEditPrice,
}: {
  listing: PropertyListing;
  onEditPrice: () => void;
}) {
  const priceChange = computePriceChange(listing.priceHistories ?? []);

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
          {priceChange && (
            <PriceChangeIndicator change={priceChange} />
          )}
          <span>등록 {formatDateShort(listing.createdAt)}</span>
          {listing.updatedAt !== listing.createdAt && (
            <span>· 수정 {formatDateShort(listing.updatedAt)}</span>
          )}
        </div>
      </div>
      {listing.memo && (
        <p className="mt-1.5 line-clamp-2 text-[12px] text-muted-foreground">
          {listing.memo}
        </p>
      )}
    </div>
  );
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

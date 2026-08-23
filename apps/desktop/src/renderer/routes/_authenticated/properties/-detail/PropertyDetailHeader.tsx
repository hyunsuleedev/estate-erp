import { Edit3, MapPin, Users } from 'lucide-react';
import type { Listing, Property } from '@estate-erp/api-client';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/domain';
import {
  getIntakeConfirmationState,
  getListingAvailability,
} from '@/lib/listing-status';
import {
  formatListingPrice,
  formatPropertyArea,
  getPropertyTitle,
  siteTypeLabels,
} from './utils';

interface Props {
  property: Property;
  primaryListing: Listing | null;
  listingCount: number;
  onCreateMatch: () => void;
  onEdit: () => void;
}

export function PropertyDetailHeader({
  property,
  primaryListing,
  listingCount,
  onCreateMatch,
  onEdit,
}: Props) {
  const title = getPropertyTitle(property);
  const address =
    property.site?.roadAddress || property.site?.jibunAddress || '주소 미등록';
  const areaLabel = formatPropertyArea(
    property.unit?.exclusiveAreaM2 ??
      property.unit?.siteUnitType?.exclusiveAreaM2,
    property.unit?.supplyAreaM2 ?? property.unit?.siteUnitType?.supplyAreaM2,
  );
  const siteType = property.site?.type
    ? (siteTypeLabels[property.site.type] ?? property.site.type)
    : '매물';

  return (
    <header
      data-property-detail-header
      className="border-b border-border bg-white"
    >
      <div className="mx-auto w-full max-w-[1440px] px-4 py-4 lg:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {primaryListing && (
                <StatusBadge
                  kind="transactionType"
                  status={primaryListing.transactionType}
                  size="sm"
                />
              )}
              {primaryListing && (
                <StatusBadge
                  kind="listingAvailability"
                  status={getListingAvailability(primaryListing)}
                  size="sm"
                />
              )}
              {primaryListing?.intake && (
                <StatusBadge
                  kind="confirmationState"
                  status={getIntakeConfirmationState(primaryListing.intake)}
                  size="sm"
                />
              )}
              <span className="rounded bg-neutral-soft px-2 py-0.5 text-[11px] font-medium text-neutral-strong">
                {property.unit?.siteUnitType?.name ?? siteType}
              </span>
              {listingCount > 1 && (
                <span className="text-[11px] text-muted-foreground">
                  거래 조건 {listingCount}개
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <h1 className="truncate text-[26px] font-semibold leading-tight tracking-[-0.025em] text-foreground">
                {title}
              </h1>
              <strong className="text-[22px] font-semibold tracking-[-0.02em] text-foreground tabular-nums">
                {formatListingPrice(primaryListing)}
              </strong>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted-foreground">
              <span className="inline-flex min-w-0 items-center gap-1">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{address}</span>
              </span>
              <span aria-hidden>·</span>
              <span>{areaLabel}</span>
              {property.unit?.floor != null && (
                <>
                  <span aria-hidden>·</span>
                  <span>{property.unit.floor}층</span>
                </>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-[12px]"
              onClick={onEdit}
            >
              <Edit3 className="size-3.5" />
              {primaryListing ? '조건 수정' : '거래 조건 추가'}
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 bg-foreground text-[12px] text-background hover:bg-foreground/90"
              onClick={onCreateMatch}
            >
              <Users className="size-3.5" />
              매칭 생성
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}

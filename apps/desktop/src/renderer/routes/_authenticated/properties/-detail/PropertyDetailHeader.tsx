import { Edit3, MoreHorizontal, Share2, Users } from 'lucide-react';
import type { Property, PropertyListing } from '@estate-erp/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  checkStatusColors,
  checkStatusLabels,
  formatPropertyArea,
  getPropertyTitle,
  siteTypeLabels,
  transactionTypeColors,
  transactionTypeLabels,
} from './utils';

interface Props {
  property: Property;
  primaryListing: PropertyListing | null;
  onCreateMatch: () => void;
  onEdit: () => void;
}

export function PropertyDetailHeader({
  property,
  primaryListing,
  onCreateMatch,
  onEdit,
}: Props) {
  const title = getPropertyTitle(property);
  const address =
    property.site?.roadAddress || property.site?.jibunAddress || '주소 미등록';
  const areaLabel = formatPropertyArea(
    property.unit?.exclusiveAreaM2,
    property.unit?.supplyAreaM2,
  );
  const floorLabel = property.unit?.floor ? `${property.unit.floor}층` : null;
  const siteType = property.site?.type
    ? (siteTypeLabels[property.site.type] ?? property.site.type)
    : '매물';

  return (
    <header className="border-b border-border bg-white px-4 py-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {primaryListing && (
              <Badge
                className={cn(
                  'border-0 text-[11px]',
                  transactionTypeColors[primaryListing.transactionType],
                )}
              >
                {transactionTypeLabels[primaryListing.transactionType] ??
                  primaryListing.transactionType}
              </Badge>
            )}
            {primaryListing && (
              <Badge
                className={cn(
                  'border-0 text-[11px]',
                  checkStatusColors[primaryListing.checkStatus],
                )}
              >
                {checkStatusLabels[primaryListing.checkStatus] ??
                  primaryListing.checkStatus}
              </Badge>
            )}
            <Badge variant="secondary" className="border-0 text-[11px]">
              {property.unit?.siteUnitType?.name ?? siteType}
            </Badge>
          </div>
          <h1 className="mt-1.5 truncate text-[22px] font-semibold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px] text-muted-foreground">
            <span className="truncate">{address}</span>
            <span>·</span>
            <span>{areaLabel}</span>
            {floorLabel && (
              <>
                <span>·</span>
                <span>{floorLabel}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-[12px]"
            onClick={onEdit}
          >
            <Edit3 className="size-3.5" />
            수정
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-[12px]"
          >
            <Share2 className="size-3.5" />
            공유
          </Button>
          <Button
            size="sm"
            className="h-8 gap-1.5 bg-foreground text-[12px] text-background hover:bg-foreground/90"
            onClick={onCreateMatch}
          >
            <Users className="size-3.5" />
            매칭 생성
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2"
          >
            <MoreHorizontal className="size-3.5" />
          </Button>
        </div>
      </div>
    </header>
  );
}

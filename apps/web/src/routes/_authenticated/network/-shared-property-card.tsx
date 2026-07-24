import type { ReactNode } from 'react';
import { EyeOffIcon } from 'lucide-react';
import type { SharedPropertyListingView } from '@estate-erp/api-client';

import { cn } from '@/lib/utils';
import { formatArea, formatDate, formatMoney, formatPhone, formatRent } from '@/lib/format';
import { StatusBadge } from '@/components/domain';
import { Separator } from '@/components/ui/separator';
import { type MaskFlags, MASK_FLAG_DEFS, SITE_TYPE_LABELS } from './-network-shared';

export interface SharedPropertyCardProps {
  /** 마스킹 플래그 — 카드가 어떤 필드를 보여줄지 결정 */
  flags: MaskFlags;
  /** 마스킹(또는 전체) 매물 데이터. 타사무소 응답은 꺼진 필드가 아예 없음 */
  listing: SharedPropertyListingView;
  /**
   * true면 공유자 본인 시점 — 전체 정보를 보여주고 "비공개 처리" 요약을 별도 표기.
   * false면 상대 사무소 시점 — flags가 꺼진 필드는 데이터가 있어도 숨긴다 (미리보기용).
   */
  isMine: boolean;
  officeName?: string | null;
  sharedByName?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  /** 공유 코멘트 ("급매" 등) — 마스킹 대상 아님 */
  description?: string | null;
  createdAt?: string | null;
  /** 회수된 공유 표시 */
  inactive?: boolean;
  /** 우측 하단 액션 영역 */
  actions?: ReactNode;
  /** 채팅 첨부 등 좁은 곳용 컴팩트 모드 */
  compact?: boolean;
  className?: string;
}

function visible(isMine: boolean, flag: boolean): boolean {
  // 본인 카드는 항상 전체 표시, 타인/미리보기는 플래그를 따른다
  return isMine || flag;
}

/** 마스킹 규칙이 적용된 공유 매물 카드 — 피드/채팅 첨부/공유 미리보기 공용. */
export function SharedPropertyCard({
  flags,
  listing,
  isMine,
  officeName,
  sharedByName,
  contactName,
  contactPhone,
  description,
  createdAt,
  inactive = false,
  actions,
  compact = false,
  className,
}: SharedPropertyCardProps) {
  const showSite = visible(isMine, flags.showSiteName) && listing.siteName != null;
  const title = showSite ? listing.siteName : listing.regionLabel;

  // 위치 조각 (동 / 호 / 층)
  const locationParts: string[] = [];
  if (visible(isMine, flags.showDong) && listing.dongName) locationParts.push(listing.dongName);
  if (visible(isMine, flags.showUnit) && listing.unitName) locationParts.push(listing.unitName);
  if (visible(isMine, flags.showFloor) && listing.floor != null) {
    locationParts.push(`${listing.floor}층`);
  }

  // 가격
  const priceVisible = visible(isMine, flags.showPrice);
  const isRent = listing.transactionType === 'monthly';
  const priceText = isRent
    ? formatRent(listing.deposit, listing.monthlyRent)
    : formatMoney(listing.price);

  // 면적
  const areaVisible = visible(isMine, flags.showArea);
  const areaParts: string[] = [];
  if (areaVisible) {
    if (listing.unitTypeName) areaParts.push(listing.unitTypeName);
    if (listing.exclusiveAreaM2 != null) {
      areaParts.push(`전용 ${formatArea(listing.exclusiveAreaM2)}`);
    } else if (listing.supplyAreaM2 != null) {
      areaParts.push(`공급 ${formatArea(listing.supplyAreaM2)}`);
    }
  }

  const memoVisible = visible(isMine, flags.showMemo) && !!listing.memo;
  const photosVisible =
    visible(isMine, flags.showPhotos) && (listing.photoUrls?.length ?? 0) > 0;

  // 비공개 필드 요약 (마스킹된 필드와 원래 없는 필드의 시각적 구분)
  const hiddenLabels = MASK_FLAG_DEFS.filter((def) => !flags[def.key]).map(
    (def) => def.label,
  );

  return (
    <div
      className={cn(
        'rounded-md border bg-background',
        compact ? 'p-2.5' : 'p-3.5',
        inactive && 'opacity-60',
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge kind="transactionType" status={listing.transactionType} size="sm" />
        <StatusBadge kind="listingAvailability" status={listing.availability} size="sm" />
        <span className={cn('font-medium', compact ? 'text-sm' : 'text-[15px]')}>
          {title}
        </span>
        {!showSite && (
          <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
            <EyeOffIcon className="size-3" /> 단지명 비공개
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {SITE_TYPE_LABELS[listing.siteType] ?? listing.siteType}
        </span>
      </div>

      <div className={cn('mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-0.5')}>
        {priceVisible ? (
          <span className={cn('font-semibold tabular-nums', compact ? 'text-sm' : 'text-base')}>
            {priceText}
            {isRent && <span className="ml-1 text-xs font-normal text-muted-foreground">보증금 / 월세</span>}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
            <EyeOffIcon className="size-3.5" /> 가격 비공개
          </span>
        )}
        {areaParts.length > 0 && (
          <span className="text-sm text-muted-foreground">{areaParts.join(' · ')}</span>
        )}
        {locationParts.length > 0 && (
          <span className="text-sm text-muted-foreground">{locationParts.join(' ')}</span>
        )}
      </div>

      {memoVisible && !compact && (
        <p className="mt-1.5 line-clamp-2 text-sm whitespace-pre-wrap text-muted-foreground">
          {listing.memo}
        </p>
      )}

      {photosVisible && !compact && (
        <div className="mt-2 flex gap-1.5 overflow-hidden">
          {listing.photoUrls!.slice(0, 3).map((url) => (
            <img
              key={url}
              src={url}
              alt="매물 사진"
              className="h-16 w-24 shrink-0 rounded-sm border object-cover"
            />
          ))}
          {listing.photoUrls!.length > 3 && (
            <span className="self-end text-xs text-muted-foreground">
              +{listing.photoUrls!.length - 3}
            </span>
          )}
        </div>
      )}

      {description && (
        <p className={cn('mt-1.5 text-sm', compact && 'line-clamp-1')}>
          <span className="mr-1 text-muted-foreground">코멘트</span>
          {description}
        </p>
      )}

      {hiddenLabels.length > 0 && (
        <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
          <EyeOffIcon className="size-3" />
          비공개 항목: {hiddenLabels.join(' · ')}
          {isMine && ' (내게는 전체 표시)'}
        </p>
      )}

      {(officeName || contactName || contactPhone || createdAt || actions) && (
        <>
          <Separator className="my-2" />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            {officeName && <span className="font-medium text-foreground">{officeName}</span>}
            {sharedByName && <span>{sharedByName}</span>}
            {contactName && <span>담당 {contactName}</span>}
            {contactPhone && <span className="tabular-nums">{formatPhone(contactPhone)}</span>}
            {createdAt && <span>{formatDate(createdAt)} 공유</span>}
            {inactive && (
              <span className="rounded-sm bg-neutral-soft px-1.5 py-px text-[11px] text-muted-foreground">
                회수됨
              </span>
            )}
            {actions && <span className="ml-auto flex items-center gap-1">{actions}</span>}
          </div>
        </>
      )}
    </div>
  );
}

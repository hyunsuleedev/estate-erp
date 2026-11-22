import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { ChevronRight, EyeOff } from 'lucide-react';
import type { NetworkSharedPropertyView } from '@estate-erp/api-client';

import { cn } from '@/lib/utils';
import { formatArea, formatMoney, formatPhone, formatRent } from '@/lib/format';
import { timeAgo } from '@/lib/time-ago';
import { StatusBadge } from '@/components/domain';
import { MASK_FLAG_DEFS, SITE_TYPE_LABELS } from './-network-shared';

/**
 * 방에 공유된 매물 표. 조건을 한눈에 견주도록 한 매물이 한 줄이다.
 * 줄을 누르면 아래로 펼쳐 메모·사진·연락처와 가려진 항목을 본다.
 *
 * 다른 사무소의 매물은 서버가 가린 칸을 아예 보내지 않는다. 그런 칸은 "비공개"로 적어
 * 값이 없는 것(빈 칸)과 구분한다. 내 매물은 전부 보이고, 남에게 가려진 항목은 펼친 곳에 적는다.
 */

// 줄마다 따로 그리드를 잡으므로 칸 너비는 고정하고 매물 칸만 늘어난다 (auto·fr이 둘이면 줄끼리 어긋난다)
const GRID =
  'grid grid-cols-[28px_48px_minmax(150px,1fr)_116px_116px_124px_64px_120px] items-center gap-x-2.5';

function Hidden() {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground/70">
      <EyeOff className="size-3" aria-hidden="true" />
      비공개
    </span>
  );
}

function priceOf(view: NetworkSharedPropertyView) {
  const { listing } = view;
  return listing.transactionType === 'monthly'
    ? formatRent(listing.deposit, listing.monthlyRent)
    : formatMoney(listing.price ?? listing.deposit);
}

export function SharedListingTable({
  items,
  renderActions,
}: {
  items: NetworkSharedPropertyView[];
  /** 줄 오른쪽 끝의 동작 (문의하기, 공유 설정, 회수) */
  renderActions: (view: NetworkSharedPropertyView) => ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div role="table" aria-label="공유 매물" className="min-w-[884px]">
      <div
        role="row"
        className={cn(
          GRID,
          'sticky top-0 z-10 h-9 border-b border-border bg-white px-6 text-[13px] text-muted-foreground',
        )}
      >
        <span role="columnheader" aria-label="펼치기" />
        <span role="columnheader">거래</span>
        <span role="columnheader">매물</span>
        <span role="columnheader" className="text-right">
          가격
        </span>
        <span role="columnheader">전용면적</span>
        <span role="columnheader">공유한 곳</span>
        <span role="columnheader">공유</span>
        <span role="columnheader" aria-label="동작" />
      </div>

      {items.map((view) => (
        <SharedListingRow
          key={view.id}
          view={view}
          open={openId === view.id}
          onToggle={() => setOpenId((current) => (current === view.id ? null : view.id))}
          actions={renderActions(view)}
        />
      ))}
    </div>
  );
}

function SharedListingRow({
  view,
  open,
  onToggle,
  actions,
}: {
  view: NetworkSharedPropertyView;
  open: boolean;
  onToggle: () => void;
  actions: ReactNode;
}) {
  const { listing, isMine } = view;
  const detailId = `shared-listing-detail-${view.id}`;

  const siteVisible = listing.siteName != null;
  const title = siteVisible ? listing.siteName : listing.regionLabel;
  const location = [
    listing.dongName,
    listing.unitName,
    listing.floor != null ? `${listing.floor}층` : null,
  ].filter(Boolean);
  // 가격·면적 칸은 서버가 키를 뺐으면(undefined) 가려진 것이다
  const priceHidden = listing.price === undefined && listing.deposit === undefined;
  const areaHidden = listing.exclusiveAreaM2 === undefined && listing.supplyAreaM2 === undefined;
  const area =
    listing.exclusiveAreaM2 != null
      ? formatArea(listing.exclusiveAreaM2)
      : listing.supplyAreaM2 != null
        ? `공급 ${formatArea(listing.supplyAreaM2)}`
        : null;

  const hiddenLabels = useMemo(
    () => MASK_FLAG_DEFS.filter((def) => !view[def.key]).map((def) => def.label),
    [view],
  );
  const unavailable = listing.availability !== 'available';

  return (
    <Fragment>
      <div
        role="row"
        className={cn(
          GRID,
          'group min-h-[44px] cursor-pointer border-b border-border/70 px-6 py-1.5 text-[14px] leading-[21px] transition-colors hover:bg-[rgba(55,53,47,0.03)]',
          open && 'bg-[rgba(55,53,47,0.03)]',
          !view.isActive && 'opacity-55',
        )}
        onClick={onToggle}
      >
        <span role="cell">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            aria-label={`${title} 자세히 ${open ? '접기' : '펼치기'}`}
            onClick={(event) => {
              event.stopPropagation();
              onToggle();
            }}
            className="inline-grid size-6 place-items-center rounded text-muted-foreground outline-none hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/45"
          >
            <ChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} />
          </button>
        </span>

        <span role="cell">
          <StatusBadge kind="transactionType" status={listing.transactionType} size="sm" />
        </span>

        <span role="cell" className="min-w-0">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-foreground">{title}</span>
            {isMine ? (
              <span className="shrink-0 rounded-[4px] bg-[rgba(35,131,226,0.1)] px-1.5 text-[12px] leading-5 text-[#2383e2]">
                내 매물
              </span>
            ) : null}
            {unavailable ? (
              <StatusBadge kind="listingAvailability" status={listing.availability} size="sm" />
            ) : null}
          </span>
          <span className="block truncate text-[12.5px] text-muted-foreground">
            {[SITE_TYPE_LABELS[listing.siteType] ?? listing.siteType, ...location].join(' · ')}
            {!siteVisible ? ' · 단지명 비공개' : ''}
          </span>
        </span>

        <span role="cell" className="text-right font-medium tabular-nums text-foreground">
          {priceHidden ? <Hidden /> : priceOf(view)}
        </span>

        <span role="cell" className="min-w-0 tabular-nums">
          {areaHidden ? (
            <Hidden />
          ) : (
            <>
              <span className="block truncate text-foreground">
                {area ?? <span className="sr-only">면적 없음</span>}
              </span>
              {listing.unitTypeName ? (
                <span className="block truncate text-[12.5px] text-muted-foreground">
                  {listing.unitTypeName} 타입
                </span>
              ) : null}
            </>
          )}
        </span>

        <span role="cell" className="min-w-0">
          <span className="block truncate text-foreground">{view.office?.name ?? '사무소 미상'}</span>
          {view.contactName || view.sharedByUser?.name ? (
            <span className="block truncate text-[12.5px] text-muted-foreground">
              {view.contactName ?? view.sharedByUser?.name}
            </span>
          ) : null}
        </span>

        <span role="cell" className="whitespace-nowrap text-[12.5px] tabular-nums text-muted-foreground">
          {timeAgo(view.createdAt)}
        </span>

        <span
          role="cell"
          className="flex items-center justify-end gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          {actions}
        </span>
      </div>

      {open ? (
        <div
          id={detailId}
          className="border-b border-border/70 bg-[#fbfbfa] py-4 pl-[58px] pr-6 text-[13px] leading-[1.6]"
        >
          <dl className="grid max-w-[820px] grid-cols-[72px_minmax(0,1fr)] gap-x-4 gap-y-2">
            {view.description ? (
              <>
                <dt className="text-muted-foreground">한마디</dt>
                <dd className="text-foreground">{view.description}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">메모</dt>
            <dd className="whitespace-pre-wrap text-foreground">
              {listing.memo === undefined ? (
                <Hidden />
              ) : (
                listing.memo || <span className="text-muted-foreground">없음</span>
              )}
            </dd>
            <dt className="text-muted-foreground">연락처</dt>
            <dd className="text-foreground">
              {view.contactName || view.contactPhone ? (
                <>
                  {view.contactName}
                  {view.contactPhone ? (
                    <a
                      href={`tel:${view.contactPhone}`}
                      className="ml-2 tabular-nums underline-offset-2 hover:underline"
                    >
                      {formatPhone(view.contactPhone)}
                    </a>
                  ) : null}
                </>
              ) : (
                <span className="text-muted-foreground">
                  적어 둔 연락처가 없습니다. 문의하기로 연락하세요.
                </span>
              )}
            </dd>
            {listing.photoUrls === undefined ? (
              <>
                <dt className="text-muted-foreground">사진</dt>
                <dd>
                  <Hidden />
                </dd>
              </>
            ) : listing.photoUrls.length > 0 ? (
              <>
                <dt className="text-muted-foreground">사진</dt>
                <dd className="flex flex-wrap gap-1.5">
                  {listing.photoUrls.slice(0, 6).map((url) => (
                    <img
                      key={url}
                      src={url}
                      alt="매물 사진"
                      className="h-[72px] w-[104px] rounded-[4px] border border-border object-cover"
                    />
                  ))}
                  {listing.photoUrls.length > 6 ? (
                    <span className="self-end text-[12px] text-muted-foreground">
                      외 {listing.photoUrls.length - 6}장
                    </span>
                  ) : null}
                </dd>
              </>
            ) : null}
            {/* 내 매물: 다른 사무소에게 무엇이 가려져 있는지 */}
            {isMine ? (
              <>
                <dt className="text-muted-foreground">가린 항목</dt>
                <dd className="text-foreground">
                  {hiddenLabels.length > 0 ? (
                    <>
                      {hiddenLabels.join(' · ')}
                      <span className="ml-2 text-muted-foreground">
                        다른 사무소에는 보이지 않습니다.
                      </span>
                    </>
                  ) : (
                    '없음 (모든 항목 공개)'
                  )}
                </dd>
              </>
            ) : null}
          </dl>
        </div>
      ) : null}
    </Fragment>
  );
}

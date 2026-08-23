import type { Listing, Tenant } from '@estate-erp/api-client';
import { CalendarClock } from 'lucide-react';
import { StatusBadge } from '@/components/domain';
import {
  getIntakeConfirmationState,
  getListingAvailability,
} from '@/lib/listing-status';
import { SideCard, SideCardRow } from './SideCard';
import { formatDateShort, formatRelativeDate } from '../utils';

interface Props {
  listings: Listing[];
  tenants: Tenant[];
}

export function ExpiryCard({ listings, tenants }: Props) {
  const primaryListing = listings[0] ?? null;
  const intake = primaryListing?.intake ?? null;
  const tenantWithExpiry = tenants.find(
    (tenant) => tenant.status !== 'moved' && tenant.contractEnd,
  );

  return (
    <SideCard title="확인 일정">
      {!primaryListing ? (
        <p className="py-1 text-[12px] text-muted-foreground">
          거래 조건을 등록하면 확인 일정이 표시됩니다.
        </p>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 py-1">
            <span className="text-[12px] text-muted-foreground">매물 상태</span>
            <StatusBadge
              kind="listingAvailability"
              status={getListingAvailability(primaryListing)}
              size="sm"
            />
          </div>
          {intake && (
            <>
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-[12px] text-muted-foreground">
                  확인 상태
                </span>
                <StatusBadge
                  kind="confirmationState"
                  status={getIntakeConfirmationState(intake)}
                  size="sm"
                />
              </div>
              <SideCardRow
                label="최근 확인"
                value={
                  intake.lastCheckedAt
                    ? formatRelativeDate(intake.lastCheckedAt)
                    : '기록 없음'
                }
              />
              <SideCardRow
                label="다음 확인"
                value={
                  intake.nextConfirmAt
                    ? formatDateShort(intake.nextConfirmAt)
                    : '미정'
                }
              />
            </>
          )}
          {tenantWithExpiry && (
            <SideCardRow
              label="임대 만기"
              value={
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="size-3" />
                  {formatDateShort(tenantWithExpiry.contractEnd)}
                </span>
              }
            />
          )}
        </div>
      )}
    </SideCard>
  );
}

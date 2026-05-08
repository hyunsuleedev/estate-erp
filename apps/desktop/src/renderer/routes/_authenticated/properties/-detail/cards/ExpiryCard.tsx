import type { PropertyListing, Tenant } from '@estate-erp/api-client';
import { CalendarClock } from 'lucide-react';
import { SideCard, SideCardRow } from './SideCard';
import {
  checkStatusColors,
  checkStatusLabels,
  formatDateShort,
  formatRelativeDate,
} from '../utils';
import { cn } from '@/lib/utils';

interface Props {
  listings: PropertyListing[];
  tenants: Tenant[];
}

export function ExpiryCard({ listings, tenants }: Props) {
  const primaryListing = listings[0];
  const activeTenants = tenants.filter((t) => t.status !== 'moved');
  const tenantWithExpiry = activeTenants.find((t) => t.contractEnd);
  const lastUpdated = listings
    .map((l) => l.updatedAt)
    .filter(Boolean)
    .sort()
    .reverse()[0];

  return (
    <SideCard title="확인 / 만기">
      <div className="space-y-1.5">
        {primaryListing && (
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">확인 상태</span>
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-[11px] font-medium',
                checkStatusColors[primaryListing.checkStatus] ??
                  'bg-muted text-muted-foreground',
              )}
            >
              {checkStatusLabels[primaryListing.checkStatus] ??
                primaryListing.checkStatus}
            </span>
          </div>
        )}
        <SideCardRow
          label="최근 확인"
          value={lastUpdated ? formatRelativeDate(lastUpdated) : '-'}
        />
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
    </SideCard>
  );
}

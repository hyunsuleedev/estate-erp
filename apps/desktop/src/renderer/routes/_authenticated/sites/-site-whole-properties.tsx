/**
 * 호실 없이 대지·건물 전체로 관리하는 매물(Site → Property). 토지 전체, 단독주택·상가건물 통째 매매 등.
 *
 * 호수 표는 호실(Unit)만 보여 주므로 이런 매물은 관리단지 화면 어디에도 안 보였다.
 * 토지는 이 목록이 본문이고, 단독·상가는 호수 표 위에 한 줄씩 보인다.
 */
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ChevronRight, LandPlot, Plus } from 'lucide-react';
import type { Property } from '@estate-erp/api-client';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { EmptyState, StatusBadge } from '@/components/domain';
import { formatListingPrice } from './-site-helpers';

export const WHOLE_PROPERTY_SITE_TYPES: ReadonlySet<string> = new Set([
  'land',
  'house',
  'commercial',
]);

function useWholeSiteProperties(siteId: string, siteType: string) {
  return useQuery({
    queryKey: ['properties', { siteId, withoutUnit: true }],
    queryFn: () => api.properties.findAll({ siteId, withoutUnit: true, limit: 20 }),
    enabled: WHOLE_PROPERTY_SITE_TYPES.has(siteType),
  });
}

function WholePropertyRow({ property, label }: { property: Property; label: string }) {
  const owners = (property.propertyContacts ?? [])
    .filter((propertyContact) => propertyContact.role === 'owner' && propertyContact.contact)
    .map((propertyContact) => propertyContact.contact!.name);
  const listings = property.listings ?? [];
  return (
    <li className="flex min-h-10 min-w-0 items-center gap-2.5 border-b border-[#f1f0ec] px-1 py-1.5 last:border-b-0">
      <span className="shrink-0 text-[14px] font-medium text-foreground">{label}</span>
      {listings.slice(0, 3).map((listing) => (
        <span key={listing.id} className="inline-flex min-w-0 items-center gap-1.5">
          <StatusBadge kind="transactionType" status={listing.transactionType} size="sm" />
          <span className="truncate text-[13px] tabular-nums text-foreground">
            {formatListingPrice(listing)}
          </span>
        </span>
      ))}
      {listings.length === 0 && (
        <span className="text-[13px] text-muted-foreground">진행 중인 의뢰 없음</span>
      )}
      {owners.length > 0 && (
        <span className="min-w-0 truncate text-[13px] text-muted-foreground">
          소유자 {owners.join(', ')}
        </span>
      )}
      <Link
        to="/properties/$id"
        params={{ id: property.id }}
        className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
      >
        매물 상세
        <ChevronRight className="size-3" />
      </Link>
    </li>
  );
}

/** 토지: 호실이 없으니 이 땅의 매물이 본문이다 */
export function LandSiteProperties({ siteId }: { siteId: string }) {
  const { data, isLoading, isError, refetch } = useWholeSiteProperties(siteId, 'land');
  const items = data?.items ?? [];
  const register = (
    <Button size="sm" asChild>
      <Link to="/properties/new" search={{ siteId }}>
        <Plus className="size-3.5" />
        매물 등록
      </Link>
    </Button>
  );
  if (isLoading) return null;
  if (isError) {
    return (
      <EmptyState
        icon={LandPlot}
        title="이 땅의 매물을 불러오지 못했습니다"
        action={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            다시 시도
          </Button>
        }
      />
    );
  }
  if (items.length === 0) {
    return (
      <EmptyState
        icon={LandPlot}
        title="토지는 호수 없이 매물로 관리합니다"
        description="이 땅의 매도·임대 의뢰는 매물 등록에서 바로 접수하세요."
        action={register}
      />
    );
  }
  return (
    <div className="w-full max-w-3xl self-start">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[14px] font-medium text-foreground">이 땅의 매물</h3>
        {register}
      </div>
      <ul>
        {items.map((property) => (
          <WholePropertyRow key={property.id} property={property} label="토지 전체" />
        ))}
      </ul>
    </div>
  );
}

/** 단독·상가건물: 호수 표 위에 건물 전체 매물을 한 줄씩 */
export function WholeBuildingPropertiesStrip({
  siteId,
  siteType,
}: {
  siteId: string;
  siteType: string;
}) {
  const { data } = useWholeSiteProperties(siteId, siteType);
  const items = data?.items ?? [];
  if (siteType === 'land' || items.length === 0) return null;
  return (
    <section aria-label="건물 전체 매물" className="shrink-0 border-b border-border bg-white px-3 py-1">
      <ul>
        {items.map((property) => (
          <WholePropertyRow key={property.id} property={property} label="건물 전체" />
        ))}
      </ul>
    </section>
  );
}

import type { Property } from '@estate-erp/api-client';
import { MapPin } from 'lucide-react';
import { SideCard, SideCardRow } from './SideCard';
import { siteTypeLabels } from '../utils';

export function LocationCard({ property }: { property: Property }) {
  const dongLabel =
    property.unit?.dong && !property.unit.dong.isPlaceholder
      ? property.unit.dong.name
      : null;
  const unitName = property.unit?.name ?? null;
  const floor = property.unit?.floor ? `${property.unit.floor}층` : null;
  const siteTypeLabel = property.site?.type
    ? (siteTypeLabels[property.site.type] ?? property.site.type)
    : '-';

  return (
    <SideCard title="위치">
      <div className="flex items-start gap-2 pb-2 text-[12px]">
        <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        <span className="leading-5 text-foreground">
          {property.site?.roadAddress ||
            property.site?.jibunAddress ||
            '주소 미등록'}
        </span>
      </div>
      <div className="border-t border-border/60 pt-1">
        <SideCardRow label="단지" value={property.site?.name ?? '-'} />
        <SideCardRow label="유형" value={siteTypeLabel} />
        {dongLabel && <SideCardRow label="동" value={dongLabel} />}
        {unitName && <SideCardRow label="호" value={unitName} />}
        {floor && <SideCardRow label="층" value={floor} />}
      </div>
    </SideCard>
  );
}

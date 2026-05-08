import type { Property } from '@estate-erp/api-client';
import { formatArea, siteTypeLabels } from '../utils';
import { MainSection } from './MainSection';

interface Props {
  property: Property;
}

/**
 * 매물 상세 스펙. 현재는 정적 필드(전용/공급/타입/단지/동/호/층).
 * 후속 작업: Listing.categorySpecs JSONB 모델 도입 시 매물종류별 동적 필드.
 */
export function DetailSpecsSection({ property }: Props) {
  const items: Array<[string, string]> = [
    ['단지', property.site?.name ?? '-'],
    ['유형', property.site?.type ? (siteTypeLabels[property.site.type] ?? property.site.type) : '-'],
    [
      '동',
      property.unit?.dong && !property.unit.dong.isPlaceholder
        ? property.unit.dong.name
        : '-',
    ],
    ['호', property.unit?.name ?? '-'],
    ['층', property.unit?.floor ? `${property.unit.floor}층` : '-'],
    ['평형', property.unit?.siteUnitType?.name ?? '-'],
    ['전용', formatArea(property.unit?.exclusiveAreaM2)],
    ['공급', formatArea(property.unit?.supplyAreaM2)],
  ];

  return (
    <MainSection title="상세 스펙">
      <div className="rounded-lg border border-border bg-white">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2.5 sm:grid-cols-4">
          {items.map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="truncate text-[13px] text-foreground">
                {value || '-'}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </MainSection>
  );
}

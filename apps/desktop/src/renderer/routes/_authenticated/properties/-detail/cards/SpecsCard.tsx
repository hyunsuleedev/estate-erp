import type { Property } from '@estate-erp/api-client';
import { SideCard, SideCardRow } from './SideCard';
import { formatArea } from '../utils';

export function SpecsCard({ property }: { property: Property }) {
  const exclusive = property.unit?.exclusiveAreaM2;
  const supply = property.unit?.supplyAreaM2;
  const typeName = property.unit?.siteUnitType?.name;

  return (
    <SideCard title="스펙">
      {typeName && <SideCardRow label="평형" value={`${typeName}타입`} />}
      <SideCardRow label="전용" value={formatArea(exclusive)} />
      <SideCardRow label="공급" value={formatArea(supply)} />
    </SideCard>
  );
}

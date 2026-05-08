import type { PropertyContact, Tenant } from '@estate-erp/api-client';
import { Phone } from 'lucide-react';
import { SideCard } from './SideCard';
import { roleLabels } from '../utils';

interface Props {
  propertyContacts: PropertyContact[];
  tenants: Tenant[];
}

export function RelatedPeopleCard({ propertyContacts, tenants }: Props) {
  const activeTenants = tenants.filter((t) => t.status !== 'moved');
  const totalCount = propertyContacts.length + activeTenants.length;

  return (
    <SideCard title={`관련인 ${totalCount}`}>
      {totalCount === 0 ? (
        <p className="py-1 text-[12px] text-muted-foreground">
          등록된 관련인이 없습니다.
        </p>
      ) : (
        <ul className="-mx-1 divide-y divide-border/60">
          {propertyContacts.map((pc) => (
            <PersonRow
              key={pc.id}
              name={pc.contact?.name ?? '이름 없음'}
              role={
                roleLabels[pc.role] ??
                pc.role ??
                '관련인'
              }
              phone={pc.contact?.phone ?? null}
              shareLabel={
                pc.shareRatio != null ? `${pc.shareRatio}%` : null
              }
              isPrimary={pc.isPrimary}
            />
          ))}
          {activeTenants.map((t) => (
            <PersonRow
              key={t.id}
              name={t.contact?.name ?? '이름 없음'}
              role="세입자"
              phone={t.contact?.phone ?? null}
              shareLabel={null}
              isPrimary={false}
            />
          ))}
        </ul>
      )}
    </SideCard>
  );
}

function PersonRow({
  name,
  role,
  phone,
  shareLabel,
  isPrimary,
}: {
  name: string;
  role: string;
  phone: string | null;
  shareLabel: string | null;
  isPrimary: boolean;
}) {
  return (
    <li className="flex items-center gap-2 px-1 py-1.5">
      <div className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground">
        {name.charAt(0)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="truncate font-medium text-foreground">{name}</span>
          {isPrimary && (
            <span className="rounded bg-amber-50 px-1 text-[10px] text-amber-700">
              대표
            </span>
          )}
          {shareLabel && (
            <span className="text-[11px] text-muted-foreground">
              {shareLabel}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <span>{role}</span>
          {phone && (
            <>
              <span>·</span>
              <span className="truncate">{phone}</span>
            </>
          )}
        </div>
      </div>
      {phone && (
        <button
          type="button"
          className="grid size-6 shrink-0 place-items-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="전화"
        >
          <Phone className="size-3" />
        </button>
      )}
    </li>
  );
}

import type { Tenant } from '@estate-erp/api-client';
import { CalendarClock, Phone } from 'lucide-react';
import { formatPrice } from '@estate-erp/shared';
import { formatDateShort, getMoveInLabel, getTenantPeriod } from '../utils';
import { MainSection, MainSectionEmpty } from './MainSection';

interface Props {
  tenants: Tenant[];
}

export function TenancySection({ tenants }: Props) {
  const active = tenants.filter((t) => t.status !== 'moved');

  return (
    <MainSection title="임대 현황" count={active.length}>
      {active.length === 0 ? (
        <MainSectionEmpty text="현재 거주 중인 세입자가 없습니다." />
      ) : (
        <div className="space-y-2">
          {active.map((tenant) => (
            <TenantCard key={tenant.id} tenant={tenant} />
          ))}
        </div>
      )}
    </MainSection>
  );
}

function TenantCard({ tenant }: { tenant: Tenant }) {
  const deposit = tenant.deposit ? formatPrice(tenant.deposit) : null;
  const monthly = tenant.monthlyRent
    ? `${tenant.monthlyRent.toLocaleString()}만`
    : null;

  return (
    <div className="rounded-lg border border-border bg-white px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="grid size-8 place-items-center rounded-full bg-muted text-[12px] font-medium text-muted-foreground">
            {tenant.contact?.name?.charAt(0) ?? '?'}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-medium text-foreground">
              {tenant.contact?.name ?? '이름 없음'}
            </div>
            {tenant.contact?.phone && (
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Phone className="size-3" />
                {tenant.contact.phone}
              </div>
            )}
          </div>
        </div>
        <div className="text-right text-[13px]">
          {deposit && monthly ? (
            <div className="font-medium">
              {deposit} / 월 {monthly}
            </div>
          ) : deposit ? (
            <div className="font-medium">{deposit}</div>
          ) : monthly ? (
            <div className="font-medium">월 {monthly}</div>
          ) : (
            <span className="text-muted-foreground">계약금 미등록</span>
          )}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="size-3" />
          계약 {getTenantPeriod(tenant)}
        </span>
        {tenant.moveOutDate && (
          <span>퇴거 예정 {formatDateShort(tenant.moveOutDate)}</span>
        )}
        <span>입주 가능: {getMoveInLabel(tenant)}</span>
      </div>
    </div>
  );
}

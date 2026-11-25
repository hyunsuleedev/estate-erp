/**
 * 만기 뷰 — 우리가 적어 둔 세입자 계약 만료일·퇴거 예정일을 가까운 순서로 본다.
 * (등기변동·실거래 신호 자리는 2026-11-22에 뺐다: 연결된 데이터가 없는데 "준비 중" 상자만 있었고,
 * 제품에 AI를 넣지 않는다는 방침과도 맞지 않았다.)
 */
import { useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import type { Unit, UnitTenant } from '@estate-erp/api-client';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/domain';
import { cn } from '@/lib/utils';
import { formatDday, formatRelativeDay, formatRent } from '@/lib/format';
import { tenantStatusLabels } from './-site-helpers';

interface ExpiryRow {
  unit: Unit;
  tenant: UnitTenant;
  /** 만기 기준일 (contractEnd 우선, 없으면 moveOutDate) */
  dueDate: string;
}

function ddayTone(dueDate: string): string {
  const due = new Date(dueDate);
  const today = new Date();
  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays <= 30) return 'bg-destructive-soft text-destructive';
  if (diffDays <= 90) return 'bg-warning-soft text-warning';
  return 'bg-neutral-soft text-muted-foreground';
}

export function ExpiryBoard({
  units,
  getPlaceLabel,
  onUnitOpen,
}: {
  units: Unit[];
  /** "101동 3401호" — formatPlaceLabel로 만든 집 이름 */
  getPlaceLabel: (unit: Unit) => string;
  onUnitOpen: (unit: Unit) => void;
}) {
  const rows = useMemo<ExpiryRow[]>(() => {
    const result: ExpiryRow[] = [];
    for (const unit of units) {
      for (const property of unit.properties ?? []) {
        for (const tenant of property.tenants ?? []) {
          const dueDate = tenant.contractEnd ?? tenant.moveOutDate;
          if (!dueDate) continue;
          result.push({ unit, tenant, dueDate });
        }
      }
    }
    return result.sort(
      (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
    );
  }, [units]);

  return (
    <div className="h-full overflow-auto px-4 py-4">
      <div className="space-y-6">
        {/* ── 임대차 만기 ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <CalendarClock className="size-4 text-muted-foreground" />
              임대차 만기
            </h3>
            <span className="text-xs tabular-nums text-muted-foreground">{rows.length}건</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            세입자의 계약 만료일(없으면 퇴거 예정일)이 가까운 순서입니다.
          </p>
          {rows.length > 0 ? (
            <div className="overflow-hidden rounded-lg border border-border/60">
              {rows.map(({ unit, tenant, dueDate }, index) => (
                <button
                  key={tenant.id}
                  type="button"
                  onClick={() => onUnitOpen(unit)}
                  className={cn(
                    'flex w-full flex-wrap items-center gap-2 px-4 py-2.5 text-left transition-colors hover:bg-accent/60',
                    index > 0 && 'border-t border-border/40',
                  )}
                >
                  <span className="w-32 shrink-0 text-[13px] font-medium tabular-nums">
                    {getPlaceLabel(unit)}
                  </span>
                  <span className="min-w-0 truncate text-[13px]">{tenant.contact.name}</span>
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    {formatRent(tenant.deposit, tenant.monthlyRent)}
                  </span>
                  <Badge variant="secondary" className="text-[11.5px] font-normal">
                    {tenantStatusLabels[tenant.status] ?? tenant.status}
                  </Badge>
                  <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
                    {tenant.contractEnd ? '계약 만기' : '퇴거 예정'} {formatRelativeDay(dueDate)}
                  </span>
                  <Badge className={cn('text-[11.5px] font-medium tabular-nums', ddayTone(dueDate))}>
                    {formatDday(dueDate)}
                  </Badge>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarClock}
              title="추적할 임대차 만기가 없습니다"
              description="호실을 열어 ‘소유자·세입자’에서 세입자를 추가하고 계약 만료일을 적으면 가까운 순서로 나옵니다."
              className="rounded-lg border border-dashed py-8"
            />
          )}
        </section>

      </div>
    </div>
  );
}

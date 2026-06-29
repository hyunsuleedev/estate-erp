/**
 * 만기/변동 뷰 — 내부 CRM(Tenant 계약 종료일) 기반 임대차 만기 추적 +
 * 외부 신호(등기변동/거래 AI) 정보 구조 자리.
 */
import { useMemo } from 'react';
import { CalendarClock, FileSearch, TrendingUp } from 'lucide-react';
import type { Unit, UnitTenant } from '@estate-erp/api-client';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/domain';
import { cn } from '@/lib/utils';
import { formatDate, formatDday, formatRent } from '@/lib/format';
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
  getDongName,
  onUnitOpen,
}: {
  units: Unit[];
  getDongName: (dongId: string | null) => string;
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
        {/* ── 임대차 만기 (내부 CRM 데이터) ── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <CalendarClock className="size-4 text-muted-foreground" />
              임대차 만기
            </h3>
            <span className="text-xs tabular-nums text-muted-foreground">{rows.length}건</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            내부 CRM에 기록된 세입자 계약 종료일/퇴거 예정일 기준 · 날짜순 정렬
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
                  <span className="w-28 shrink-0 text-[13px] font-medium tabular-nums">
                    {getDongName(unit.dongId)} {unit.name}
                  </span>
                  <span className="min-w-0 truncate text-[13px]">{tenant.contact.name}</span>
                  <span className="text-[12px] tabular-nums text-muted-foreground">
                    {formatRent(tenant.deposit, tenant.monthlyRent)}
                  </span>
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    {tenantStatusLabels[tenant.status] ?? tenant.status}
                  </Badge>
                  <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
                    {tenant.contractEnd ? '계약 만기' : '퇴거 예정'} {formatDate(dueDate)}
                  </span>
                  <Badge className={cn('text-[10px] font-medium tabular-nums', ddayTone(dueDate))}>
                    {formatDday(dueDate)}
                  </Badge>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CalendarClock}
              title="추적할 임대차 만기가 없습니다"
              description="세입자에 계약 종료일을 기록하면 만기 도래 순으로 표시됩니다"
              className="rounded-lg border border-dashed py-8"
            />
          )}
        </section>

        {/* ── 외부 신호 (수집 파이프라인 연동 전) ── */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="space-y-3">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <FileSearch className="size-4 text-muted-foreground" />
              등기변동 알림
            </h3>
            <EmptyState
              icon={FileSearch}
              title="준비 중인 기능입니다"
              description="인터넷등기소 변동 이력(소유권이전·근저당·압류 등) 수집 파이프라인 연동 후 제공됩니다"
              className="rounded-lg border border-dashed py-8"
            />
          </section>
          <section className="space-y-3">
            <h3 className="flex items-center gap-1.5 text-sm font-medium">
              <TrendingUp className="size-4 text-muted-foreground" />
              거래 AI 알림
            </h3>
            <EmptyState
              icon={TrendingUp}
              title="준비 중인 기능입니다"
              description="실거래가 데이터 기반 평형/라인 유사군 거래 신호는 데이터 파이프라인 연동 후 제공됩니다"
              className="rounded-lg border border-dashed py-8"
            />
          </section>
        </div>
      </div>
    </div>
  );
}

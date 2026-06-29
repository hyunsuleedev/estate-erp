import { useMemo } from 'react';
import { Handshake, Wallet } from 'lucide-react';
import type {
  CommissionPaymentStatus,
  LedgerDealGroup,
  LedgerPayment,
} from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatDate, formatMoney } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/domain';

// ─────────────────────────────────────────────────────────────
// 수금 칸반 뷰 — 청구(payment) 단위를 수금 상태 컬럼으로 배치
// 컬럼: 초안* → 수금예정 → 일부수금 → 연체 → 수금완료 → 면제* (*: 항목 있을 때만)
// 카드 클릭 → 거래 상세 Sheet (수금 처리/조정 액션은 Sheet 안에서)
// ─────────────────────────────────────────────────────────────

interface KanbanCard {
  payment: LedgerPayment;
  dealId: string;
  location: string;
  partnerName: string | null;
}

/** 항상 노출하는 핵심 4단계 */
const CORE_COLUMNS: CommissionPaymentStatus[] = [
  'pending',
  'partial',
  'overdue',
  'collected',
];

/** 항목이 있을 때만 노출하는 보조 컬럼 */
const OPTIONAL_COLUMNS: CommissionPaymentStatus[] = ['draft', 'waived', 'cancelled'];

const COLUMN_ORDER: CommissionPaymentStatus[] = [
  'draft',
  'pending',
  'partial',
  'overdue',
  'collected',
  'waived',
  'cancelled',
];

export function LedgerKanban({
  groups,
  onOpenDeal,
}: {
  groups: LedgerDealGroup[];
  onOpenDeal: (dealId: string, paymentId?: string) => void;
}) {
  const byStatus = useMemo(() => {
    const map = new Map<CommissionPaymentStatus, KanbanCard[]>();
    for (const status of COLUMN_ORDER) map.set(status, []);
    for (const g of groups) {
      const location =
        [g.deal.siteName, g.deal.dongName, g.deal.unitName]
          .filter(Boolean)
          .join(' ') || '매물 미지정';
      for (const p of g.payments) {
        const list = map.get(p.status);
        if (!list) continue;
        list.push({
          payment: p,
          dealId: g.deal.id,
          location,
          partnerName: g.deal.partnerBroker?.name ?? null,
        });
      }
    }
    // 컬럼 내부 정렬: 예정일 임박순 (없으면 뒤로)
    for (const list of map.values()) {
      list.sort((a, b) => {
        const at = a.payment.dueDate
          ? new Date(a.payment.dueDate).getTime()
          : Number.POSITIVE_INFINITY;
        const bt = b.payment.dueDate
          ? new Date(b.payment.dueDate).getTime()
          : Number.POSITIVE_INFINITY;
        return at - bt;
      });
    }
    return map;
  }, [groups]);

  const columns = COLUMN_ORDER.filter((status) => {
    if (CORE_COLUMNS.includes(status)) return true;
    if (OPTIONAL_COLUMNS.includes(status)) {
      return (byStatus.get(status)?.length ?? 0) > 0;
    }
    return false;
  });

  const totalCards = columns.reduce(
    (acc, status) => acc + (byStatus.get(status)?.length ?? 0),
    0,
  );

  if (totalCards === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="조건에 맞는 청구 내역이 없습니다"
        description="기간이나 필터를 조정해보세요."
      />
    );
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="grid min-w-[860px] gap-3"
        style={{
          gridTemplateColumns: `repeat(${columns.length}, minmax(200px, 1fr))`,
        }}
      >
        {columns.map((status) => {
          const cards = byStatus.get(status) ?? [];
          const sum = cards.reduce((acc, c) => {
            // 수금완료 컬럼은 실수금액, 나머지는 잔여 예정액 기준 합계
            if (status === 'collected') {
              return acc + (c.payment.actualAmount ?? c.payment.expectedAmount);
            }
            return (
              acc +
              (c.payment.expectedAmount - (c.payment.actualAmount ?? 0))
            );
          }, 0);
          return (
            <div
              key={status}
              className="flex flex-col rounded-lg border bg-muted/30"
            >
              <div className="flex items-center gap-2 border-b px-3 py-2.5">
                <StatusBadge kind="commissionStatus" status={status} size="sm" />
                <span className="text-xs text-muted-foreground">
                  {cards.length}건
                </span>
                <span className="ml-auto text-xs font-semibold tabular-nums">
                  {formatMoney(sum)}
                </span>
              </div>
              <div className="flex flex-col gap-2 p-2">
                {cards.length === 0 ? (
                  <div className="rounded-md border border-dashed py-6 text-center text-[11px] text-muted-foreground">
                    없음
                  </div>
                ) : (
                  cards.map((card) => (
                    <KanbanCardItem
                      key={card.payment.id}
                      card={card}
                      onClick={() => onOpenDeal(card.dealId, card.payment.id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCardItem({
  card,
  onClick,
}: {
  card: KanbanCard;
  onClick: () => void;
}) {
  const p = card.payment;
  const sideLabel = p.clientSide === 'seller' ? '매도측' : '매수측';
  const isOverdue = p.status === 'overdue';
  const collectedPart =
    p.status === 'partial' && p.actualAmount != null ? p.actualAmount : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-md border bg-card p-2.5 text-left text-sm shadow-xs transition-colors hover:bg-accent/50',
        isOverdue && 'border-destructive/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-medium">
          {card.location}
        </span>
        <span className="shrink-0 text-xs font-semibold tabular-nums">
          {formatMoney(p.expectedAmount)}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
        <span>{sideLabel}</span>
        {p.code && <span className="font-mono text-[10px]">{p.code}</span>}
        {p.dueDate && (
          <span className={cn(isOverdue && 'font-medium text-destructive')}>
            {formatDate(p.dueDate)}
          </span>
        )}
        {card.partnerName && (
          <span className="inline-flex items-center gap-0.5">
            <Handshake className="size-3" />
            {card.partnerName}
          </span>
        )}
      </div>
      {collectedPart !== null && (
        <div className="mt-1 text-[11px] text-warning">
          수금 {formatMoney(collectedPart)} · 잔여{' '}
          {formatMoney(p.expectedAmount - collectedPart)}
        </div>
      )}
      {p.status === 'collected' && p.paidAt && (
        <div className="mt-1 text-[11px] text-success">
          {formatDate(p.paidAt)} 수금 완료
        </div>
      )}
    </button>
  );
}

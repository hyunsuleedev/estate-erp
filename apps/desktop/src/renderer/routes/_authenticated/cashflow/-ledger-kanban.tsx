/**
 * 수금 칸반. 청구를 수금 상태별로 놓는다. 업무 보드와 같은 열 모양을 쓴다.
 * 상태 변경은 금액 입력이 필요하므로 끌어서 옮기지 않고, 카드를 눌러 거래 상세에서 처리한다.
 */
import { useMemo } from 'react';
import { Handshake, Wallet } from 'lucide-react';
import type {
  CommissionPaymentStatus,
  LedgerDealGroup,
  LedgerPayment,
} from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { EmptyState, StatusBadge } from '@/components/domain';
import {
  clientSideLabel,
  dealLocation,
  displayStatus,
  effectiveDueDate,
  isClosedPayment,
  payerName,
  paymentRemaining,
  receivedAmount,
  relativeDueLabel,
  shortDate,
  toDayKey,
} from './-cashflow-utils';

/** 수금완료는 받은 돈, 면제·취소는 받지 않기로 한 돈, 그 외는 남은 돈을 보여 준다. */
function cardAmount(payment: LedgerPayment, status: CommissionPaymentStatus) {
  if (status === 'collected') {
    return receivedAmount(payment);
  }
  if (isClosedPayment(payment)) {
    return Math.max(0, payment.expectedAmount - (payment.actualAmount ?? 0));
  }
  return paymentRemaining(payment);
}

interface KanbanCard {
  group: LedgerDealGroup;
  payment: LedgerPayment;
  due: string | null;
}

/** 항상 보이는 4단계 */
const CORE_COLUMNS: CommissionPaymentStatus[] = [
  'pending',
  'partial',
  'overdue',
  'collected',
];

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
    for (const group of groups) {
      const balance = group.deal.balanceDueDate;
      for (const payment of group.payments) {
        map.get(displayStatus(payment, balance))?.push({
          group,
          payment,
          due: effectiveDueDate(payment, balance),
        });
      }
    }
    for (const list of map.values()) {
      list.sort((a, b) =>
        (toDayKey(a.due) ?? '9999').localeCompare(toDayKey(b.due) ?? '9999'),
      );
    }
    return map;
  }, [groups]);

  const columns = COLUMN_ORDER.filter(
    (status) =>
      CORE_COLUMNS.includes(status) || (byStatus.get(status)?.length ?? 0) > 0,
  );
  const totalCards = columns.reduce(
    (sum, status) => sum + (byStatus.get(status)?.length ?? 0),
    0,
  );

  if (totalCards === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="조건에 맞는 청구가 없습니다"
        description="기간이나 필터를 바꿔 보세요."
      />
    );
  }

  return (
    <div
      className="grid h-full min-w-min auto-cols-[minmax(216px,1fr)] grid-flow-col gap-3 p-3"
    >
      {columns.map((status) => {
        const cards = byStatus.get(status) ?? [];
        const sum = cards.reduce(
          (acc, { payment }) => acc + cardAmount(payment, status),
          0,
        );
        return (
          <section key={status} className="flex min-h-0 min-w-0 flex-col">
            <div className="mb-1.5 flex h-7 shrink-0 items-center gap-1.5 px-1 text-[13px]">
              <StatusBadge kind="commissionStatus" status={status} size="sm" />
              <span className="text-xs text-muted-foreground tabular-nums">
                {cards.length}
              </span>
              <span className="ml-auto text-[12.5px] font-semibold tabular-nums">
                {formatMoney(sum)}
              </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-lg bg-muted p-1.5">
              {cards.length === 0 ? (
                <p className="py-5 text-center text-[12.5px] text-[#a5a39f]">
                  없음
                </p>
              ) : (
                cards.map((card) => (
                  <CardItem
                    key={card.payment.id}
                    card={card}
                    status={status}
                    onClick={() =>
                      onOpenDeal(card.group.deal.id, card.payment.id)
                    }
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function CardItem({
  card,
  status,
  onClick,
}: {
  card: KanbanCard;
  status: CommissionPaymentStatus;
  onClick: () => void;
}) {
  const { group, payment, due } = card;
  const collected = status === 'collected';
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded-md border border-border bg-card p-2.5 text-left text-[13px] transition-colors hover:border-[#cfcdc7]"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 leading-snug font-medium break-keep">
          {dealLocation(group.deal)}
        </span>
        <span className="shrink-0 font-semibold tabular-nums">
          {formatMoney(cardAmount(payment, status))}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
        <span>
          {[clientSideLabel(payment.clientSide), payerName(group.deal, payment)]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {collected ? (
          <span>{shortDate(payment.paidAt)} 입금</span>
        ) : (
          due && (
            <span className={cn(status === 'overdue' && 'text-destructive-strong')}>
              {shortDate(due)} · {relativeDueLabel(due)}
            </span>
          )
        )}
        {(status === 'partial' || status === 'waived') && receivedAmount(payment) > 0 && (
          <span className="text-warning-strong">
            수금 {formatMoney(receivedAmount(payment))}
          </span>
        )}
        {group.deal.partnerBroker && (
          <span className="inline-flex items-center gap-0.5">
            <Handshake className="size-3" />
            {group.deal.partnerBroker.name}
          </span>
        )}
      </div>
    </button>
  );
}

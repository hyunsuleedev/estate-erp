/**
 * 수금 칸반. 청구를 수금 상태별로 놓는다. 업무 보드와 같은 열 모양을 쓴다.
 * 상태 변경은 금액 입력이 필요하므로 끌어서 옮기지 않고, 카드를 눌러 거래 상세에서 처리한다.
 */
import { useMemo, type ReactNode } from 'react';
import { Handshake } from 'lucide-react';
import type {
  CommissionPaymentStatus,
  LedgerDealGroup,
  LedgerPayment,
} from '@estate-erp/api-client';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { StatusBadge } from '@/components/domain';
import {
  clientSideLabel,
  dealLocation,
  displayStatus,
  effectiveDueDate,
  isClosedPayment,
  isOurReceivable,
  payerName,
  dayLabel,
  paymentRemaining,
  ourCollectedWonOf,
  receivedSupplyWonOf,
  relativeDueLabel,
  shortDate,
  toDayKey,
  WON_PER_MANWON,
} from './-cashflow-utils';

/**
 * 카드 금액 (원). 수금완료는 받은 돈(입금 기록 합계, 부가세 뺀 금액), 면제·취소는 받지 않기로 한 돈,
 * 그 외는 남은 돈. 열 합계는 원으로 더한 뒤 만원으로 바꿔 캐시플로우·원장과 같은 셈을 한다.
 */
function cardWon(payment: LedgerPayment, status: CommissionPaymentStatus) {
  // 받은 돈은 우리 통장에 들어온 돈 (상대가 수금한 청구는 받음 기록한 우리 몫)
  if (status === 'collected') return ourCollectedWonOf(payment);
  if (isClosedPayment(payment)) {
    return Math.max(0, payment.expectedAmount * WON_PER_MANWON - receivedSupplyWonOf(payment));
  }
  return paymentRemaining(payment) * WON_PER_MANWON;
}

/** 열 합계에 넣는 금액. 상대가 수금하는 청구의 남은 돈은 우리 받을 돈이 아니라 뺀다. */
function sumWon(payment: LedgerPayment, status: CommissionPaymentStatus) {
  if (status !== 'collected' && !isClosedPayment(payment) && !isOurReceivable(payment)) return 0;
  return cardWon(payment, status);
}

const toManwon = (won: number) => Math.round(won / WON_PER_MANWON);

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
  empty,
  onOpenDeal,
}: {
  groups: LedgerDealGroup[];
  /** 보일 청구가 없을 때 띄울 안내 (원장이 이유에 맞춰 만든다) */
  empty: ReactNode;
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

  if (totalCards === 0) return <>{empty}</>;

  return (
    <div
      className="grid h-full min-w-min auto-cols-[minmax(216px,1fr)] grid-flow-col gap-3 p-3"
    >
      {columns.map((status) => {
        const cards = byStatus.get(status) ?? [];
        const sum = toManwon(
          cards.reduce((acc, { payment }) => acc + sumWon(payment, status), 0),
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
  const receipts = (payment.receipts ?? []).filter((r) => r.kind !== 'refund');
  const lastReceipt = receipts.at(-1)?.receivedAt ?? payment.paidAt;
  const receivedManwon = toManwon(ourCollectedWonOf(payment));
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
          {formatMoney(toManwon(cardWon(payment, status)))}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
        <span>
          {[clientSideLabel(payment.clientSide, group.deal.transactionType), payerName(group.deal, payment)]
            .filter(Boolean)
            .join(' · ')}
        </span>
        {collected ? (
          <span>
            {dayLabel(lastReceipt, false)} 입금
            {receipts.length > 1 && ` · ${receipts.length}번에 나눠 받음`}
          </span>
        ) : (
          due && (
            <span className={cn(status === 'overdue' && 'text-destructive-strong')}>
              {shortDate(due)}
              {/* 상대가 수금하는 청구는 우리가 셀 기한이 아니라 'n일 경과'를 붙이지 않는다 */}
              {isOurReceivable(payment) && ` · ${relativeDueLabel(due)}`}
            </span>
          )
        )}
        {(status === 'partial' || status === 'waived') && receivedManwon > 0 && (
          <span className="text-warning-strong">
            수금 {formatMoney(receivedManwon)}
          </span>
        )}
        {!isOurReceivable(payment) && (
          <span>{status === 'collected' ? '상대 수금 · 우리 몫' : '상대 수금'}</span>
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

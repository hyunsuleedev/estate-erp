import { CalendarClock, CircleDollarSign, Landmark } from 'lucide-react';
import { CONTRACT_TRANSACTION_TYPE_LABELS } from '@estate-erp/shared';
import type { Contract } from '@estate-erp/api-client';

import { StatusBadge } from '@/components/domain';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDate, formatMoney, formatPhone } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  OVERLAY_META,
  type OverlayItem,
  type OverlayKind,
} from './-calendar-overlay';
import { withAlpha } from './-event-meta';

export function CalendarOverlayDetailDialog({
  item,
  onOpenChange,
}: {
  item: OverlayItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const meta = item ? OVERLAY_META[item.kind] : null;

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      {item && meta ? (
        <DialogContent className="max-h-[calc(100dvh-3rem)] gap-0 overflow-hidden p-0 sm:max-w-xl">
          <div className="flex items-start gap-3 border-b border-border px-6 pb-4 pt-5 pr-12">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-lg"
              style={{
                color: meta.color,
                backgroundColor: withAlpha(meta.color, '14'),
              }}
            >
              {item.source.type === 'contract' ? (
                <Landmark className="size-[18px]" />
              ) : (
                <CircleDollarSign className="size-[18px]" />
              )}
            </div>
            <DialogHeader className="min-w-0 flex-1 gap-1.5">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <DialogTitle className="min-w-0 truncate text-base">
                  {item.title}
                </DialogTitle>
                {item.source.type === 'contract' ? (
                  <StatusBadge
                    kind="contractStatus"
                    status={item.source.contract.status}
                    size="sm"
                  />
                ) : (
                  <StatusBadge
                    kind="commissionStatus"
                    status={item.source.payment.status}
                    size="sm"
                  />
                )}
              </div>
              <DialogDescription className="text-xs">
                {meta.label}에 연결된 원본 정보를 확인합니다.
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="min-h-0 overflow-y-auto px-6 py-5">
            {item.source.type === 'contract' ? (
              <ContractOverlayContent
                contract={item.source.contract}
                activeKind={item.kind}
              />
            ) : (
              <CommissionOverlayContent item={item} />
            )}
          </div>

          <DialogFooter className="border-t border-border px-6 py-4">
            <DialogClose asChild>
              <Button variant="outline">닫기</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}

function ContractOverlayContent({
  contract,
  activeKind,
}: {
  contract: Contract;
  activeKind: OverlayKind;
}) {
  const transactionType =
    CONTRACT_TRANSACTION_TYPE_LABELS[
      contract.transactionType as keyof typeof CONTRACT_TRANSACTION_TYPE_LABELS
    ] ?? contract.transactionType;

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-muted-foreground">
          계약 정보
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4">
          <DetailField label="거래 유형" value={transactionType} />
          <DetailField label="거래 금액" value={formatMoney(contract.totalPrice)} />
          <DetailField
            label="매도인"
            value={contract.sellerContact?.name ?? '—'}
          />
          <DetailField
            label="매수인"
            value={contract.buyerContact?.name ?? '—'}
          />
          {contract.monthlyRent ? (
            <DetailField
              label="월세"
              value={`${contract.monthlyRent.toLocaleString()}만`}
            />
          ) : null}
        </div>
      </section>

      <section className="border-t border-border pt-5">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-3.5 text-muted-foreground" />
          <h3 className="text-[11px] font-semibold text-muted-foreground">
            대금 일정
          </h3>
        </div>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <ContractScheduleRow
            label="계약일"
            date={contract.contractDate}
            amount={contract.statedDeposit}
            active={activeKind === 'contractDate'}
            color={OVERLAY_META.contractDate.color}
          />
          <ContractScheduleRow
            label="중도금일"
            date={contract.statedInterimDate}
            amount={contract.statedInterimPayment}
            active={activeKind === 'interimDate'}
            color={OVERLAY_META.interimDate.color}
          />
          <ContractScheduleRow
            label="잔금일"
            date={contract.statedBalanceDate}
            amount={contract.statedBalance}
            active={activeKind === 'balanceDate'}
            color={OVERLAY_META.balanceDate.color}
          />
        </div>
      </section>

      {contract.memo ? <NoteBlock label="메모" value={contract.memo} /> : null}
    </div>
  );
}

function ContractScheduleRow({
  label,
  date,
  amount,
  active,
  color,
}: {
  label: string;
  date: string | null;
  amount: number | null;
  active: boolean;
  color: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0',
        active && 'bg-muted/45',
      )}
    >
      <span
        className="h-8 w-[3px] shrink-0 rounded-full"
        style={{ backgroundColor: active ? color : withAlpha(color, '55') }}
      />
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] text-muted-foreground">{label}</span>
        <span className="mt-0.5 block text-xs font-medium tabular-nums text-foreground">
          {formatDate(date)}
        </span>
      </span>
      <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">
        {formatMoney(amount)}
      </span>
    </div>
  );
}

function CommissionOverlayContent({ item }: { item: OverlayItem }) {
  if (item.source.type !== 'commissionPayment') return null;
  const payment = item.source.payment;
  const taxInvoiceLabel = {
    none: '미발행',
    issued: '발행',
    sent: '전송 완료',
  }[payment.taxInvoiceStatus];

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-muted-foreground">
          수금 정보
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4">
          <DetailField label="수금 예정일" value={formatDate(payment.dueDate)} />
          <DetailField
            label="구분"
            value={payment.clientSide === 'seller' ? '매도측' : '매수측'}
          />
          <DetailField
            label="납부자"
            value={payment.payerContact?.name ?? '—'}
          />
          <DetailField
            label="연락처"
            value={formatPhone(payment.payerContact?.phone)}
          />
          <DetailField
            label="예정 금액"
            value={formatMoney(payment.expectedAmount)}
          />
          <DetailField
            label="수금 금액"
            value={formatMoney(payment.actualAmount)}
          />
          <DetailField label="수금 방법" value={payment.method ?? '—'} />
          <DetailField label="세금계산서" value={taxInvoiceLabel} />
        </div>
      </section>

      {payment.note ? <NoteBlock label="메모" value={payment.note} /> : null}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-xs font-medium text-foreground">
        {value}
      </div>
    </div>
  );
}

function NoteBlock({ label, value }: { label: string; value: string }) {
  return (
    <section className="border-t border-border pt-5">
      <h3 className="text-[11px] font-semibold text-muted-foreground">{label}</h3>
      <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/45 px-3.5 py-3 text-xs leading-5 text-foreground">
        {value}
      </p>
    </section>
  );
}

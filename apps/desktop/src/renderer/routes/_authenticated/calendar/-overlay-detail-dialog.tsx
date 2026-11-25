import {
  CalendarClock,
  CircleDollarSign,
  Landmark,
  Pin,
  X,
  ArrowUpRight,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { CONTRACT_TRANSACTION_TYPE_LABELS } from "@estate-erp/shared";
import type { ContractListItem as Contract, DealListItem as Deal } from "@estate-erp/api-client";

import { StatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatMoney, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  OVERLAY_META,
  type OverlayItem,
  type OverlayKind,
} from "./-calendar-overlay";
import { withAlpha } from "./-event-meta";

export function CalendarOverlayInspector({
  item,
  onClose,
  onPin,
}: {
  item: OverlayItem;
  onClose: () => void;
  onPin?: () => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-1">
          <span className="mr-auto text-[11px] text-muted-foreground">
            {OVERLAY_META[item.kind].label} · 원본 연결
          </span>
          {onPin && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="상세를 오른쪽에 고정"
              onClick={onPin}
            >
              <Pin className="size-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="재무 일정 상세 닫기"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
        <h2 className="mt-2 text-base font-semibold leading-6">{item.title}</h2>
        <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
          {item.source.type === "dealPayment"
            ? "날짜 변경은 거래의 대금 일정에서 합니다."
            : "날짜 변경은 연결된 계약·수금 원장에서 반영됩니다."}
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <OverlayContent item={item} />
      </div>
      <div className="border-t p-3">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            if (item.source.type === "contract")
              void navigate({
                to: "/contracts",
                search: { editorContractId: item.source.contract.id },
              });
            else if (item.source.type === "dealPayment")
              void navigate({
                to: "/deals",
                search: { dealId: item.source.deal.id },
              });
            else
              void navigate({
                to: "/cashflow/ledger",
                search: {
                  deal: item.source.payment.dealId,
                  payment: item.source.payment.id,
                },
              });
          }}
        >
          <ArrowUpRight className="size-4" />
          원본{" "}
          {item.source.type === "contract"
            ? "계약"
            : item.source.type === "dealPayment"
              ? "거래"
              : "수금"}{" "}
          열기
        </Button>
      </div>
    </>
  );
}

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
                backgroundColor: withAlpha(meta.color, "14"),
              }}
            >
              {item.source.type !== "commissionPayment" ? (
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
                {item.source.type === "contract" ? (
                  <StatusBadge
                    kind="contractStatus"
                    status={item.source.contract.status}
                    size="sm"
                  />
                ) : item.source.type === "dealPayment" ? (
                  <StatusBadge
                    kind="dealStage"
                    status={item.source.deal.stage}
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
            <OverlayContent item={item} />
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

function OverlayContent({ item }: { item: OverlayItem }) {
  if (item.source.type === "contract")
    return (
      <ContractOverlayContent
        contract={item.source.contract}
        activeKind={item.kind}
      />
    );
  if (item.source.type === "dealPayment")
    return (
      <DealPaymentOverlayContent
        deal={item.source.deal}
        activePaymentId={item.source.payment.id}
      />
    );
  return <CommissionOverlayContent item={item} />;
}

/** 매매는 매도인·매수인, 전세·월세는 임대인·임차인 (화면 낱말 기준) */
function partyLabels(transactionType: string | null | undefined) {
  return transactionType === "sale" || transactionType === "exchange"
    ? { seller: "매도인", buyer: "매수인" }
    : { seller: "임대인", buyer: "임차인" };
}

const DEAL_PAYMENT_LABELS: Record<string, string> = {
  pre_contract: "가계약금",
  contract: "계약금",
  interim: "중도금",
  balance: "잔금",
};

const DEAL_PAYMENT_COLOR: Record<string, string> = {
  pre_contract: OVERLAY_META.preContractDate.color,
  contract: OVERLAY_META.contractDate.color,
  interim: OVERLAY_META.interimDate.color,
  balance: OVERLAY_META.balanceDate.color,
};

function DealPaymentOverlayContent({
  deal,
  activePaymentId,
}: {
  deal: Deal;
  activePaymentId: string;
}) {
  const parties = partyLabels(deal.transactionType);
  const transactionType =
    CONTRACT_TRANSACTION_TYPE_LABELS[
      deal.transactionType as keyof typeof CONTRACT_TRANSACTION_TYPE_LABELS
    ] ?? deal.transactionType;
  // 돈이 오가는 순서대로: 가계약금 → 계약금 → 중도금(차수) → 잔금
  const order = ["pre_contract", "contract", "interim", "balance"];
  const payments = (deal.payments ?? [])
    .filter(
      (payment) =>
        payment.kind in DEAL_PAYMENT_LABELS && payment.status !== "cancelled",
    )
    .sort(
      (a, b) =>
        order.indexOf(a.kind) - order.indexOf(b.kind) ||
        a.sequence - b.sequence,
    );
  const interimCount = payments.filter((p) => p.kind === "interim").length;

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-muted-foreground">
          거래 정보
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4">
          <DetailField label="거래 유형" value={transactionType} />
          <DetailField
            label="합의 금액"
            value={formatMoney(deal.agreedPrice)}
          />
          <DetailField
            label={parties.seller}
            value={deal.sellerContact?.name ?? "—"}
          />
          <DetailField
            label={parties.buyer}
            value={deal.buyerContact?.name ?? "—"}
          />
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
          {payments.map((payment) => (
            <ContractScheduleRow
              key={payment.id}
              label={`${DEAL_PAYMENT_LABELS[payment.kind]}${
                payment.kind === "interim" && interimCount > 1
                  ? ` ${payment.sequence}차`
                  : ""
              }${payment.status === "paid" ? " · 받음" : ""}`}
              date={payment.scheduledDate}
              amount={payment.scheduledAmount}
              active={payment.id === activePaymentId}
              color={DEAL_PAYMENT_COLOR[payment.kind]}
            />
          ))}
        </div>
      </section>
    </div>
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
          <DetailField
            label="거래 금액"
            value={formatMoney(contract.totalPrice)}
          />
          <DetailField
            label={partyLabels(contract.transactionType).seller}
            value={contract.sellerContact?.name ?? "—"}
          />
          <DetailField
            label={partyLabels(contract.transactionType).buyer}
            value={contract.buyerContact?.name ?? "—"}
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
            active={activeKind === "contractDate"}
            color={OVERLAY_META.contractDate.color}
          />
          <ContractScheduleRow
            label="중도금일"
            date={contract.statedInterimDate}
            amount={contract.statedInterimPayment}
            active={activeKind === "interimDate"}
            color={OVERLAY_META.interimDate.color}
          />
          <ContractScheduleRow
            label="잔금일"
            date={contract.statedBalanceDate}
            amount={contract.statedBalance}
            active={activeKind === "balanceDate"}
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
        "flex items-center gap-3 border-b border-border px-3.5 py-3 last:border-b-0",
        active && "bg-muted/45",
      )}
    >
      <span
        className="h-8 w-[3px] shrink-0 rounded-full"
        style={{ backgroundColor: active ? color : withAlpha(color, "55") }}
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

/** 수금 방법 — 수수료/정산의 입금 창과 같은 말 (저장값 transfer 등을 그대로 보이지 않는다) */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  transfer: "계좌이체",
  cash: "현금",
  card: "카드",
  other: "기타",
};

function CommissionOverlayContent({ item }: { item: OverlayItem }) {
  if (item.source.type !== "commissionPayment") return null;
  const payment = item.source.payment;
  // 현금영수증 기록은 같은 칸에 cash_receipt 값으로 온다(수수료/정산 화면이 적는다).
  const taxInvoiceLabels: Record<string, string> = {
    none: "미발행",
    issued: "세금계산서 발행",
    sent: "세금계산서 전송 완료",
    cash_receipt: "현금영수증 발행",
  };
  const taxInvoiceLabel =
    taxInvoiceLabels[payment.taxInvoiceStatus as string] ?? "미발행";

  return (
    <div className="space-y-5">
      <section>
        <h3 className="text-[11px] font-semibold text-muted-foreground">
          수금 정보
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-4">
          <DetailField
            label="수금 예정일"
            value={formatDate(payment.dueDate)}
          />
          <DetailField
            label="구분"
            value={payment.clientSide === "seller" ? "매도측" : "매수측"}
          />
          <DetailField
            label="납부자"
            value={payment.payerContact?.name ?? "—"}
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
          <DetailField
            label="수금 방법"
            value={
              payment.method
                ? (PAYMENT_METHOD_LABELS[payment.method] ?? "기타")
                : "—"
            }
          />
          <DetailField label="발행 기록" value={taxInvoiceLabel} />
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
      <h3 className="text-[11px] font-semibold text-muted-foreground">
        {label}
      </h3>
      <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-muted/45 px-3.5 py-3 text-xs leading-5 text-foreground">
        {value}
      </p>
    </section>
  );
}

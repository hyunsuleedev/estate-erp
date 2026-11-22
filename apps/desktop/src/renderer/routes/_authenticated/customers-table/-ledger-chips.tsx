import type { CustomerLedgerRow } from "@estate-erp/api-client";
import { cn } from "@/lib/utils";
import {
  getLedgerRowSides,
  getLedgerRowStatus,
  LEDGER_ROW_STATUS_HINTS,
  LEDGER_ROW_STATUS_LABELS,
  type LedgerRowStatus,
} from "./-ledger-model";

/** 표와 상세 패널이 함께 쓰는 꼬리표. 연락처 표의 꼬리표와 같은 크기다: 높이 20 · 모서리 4 · 12px. */
export const ledgerChipClassName =
  "inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-[4px] px-1.5 text-[12px] font-medium leading-5";

const STATUS_TONE: Record<LedgerRowStatus, string> = {
  exploring: "bg-[#f1f1ef] text-[#5f5e5b] [&>[data-dot]]:bg-[#9b9a97]",
  active: "bg-[#eef3ed] text-[#44745a] [&>[data-dot]]:bg-[#44745a]",
};

/** 줄의 상태 배지: 파악 중 / 진행 중. 매물관리 표의 상태 배지처럼 앞에 점을 둔다. */
export function LedgerStatusChip({ row }: { row: CustomerLedgerRow }) {
  const status = getLedgerRowStatus(row);
  return (
    <span
      data-ledger-status={status}
      title={LEDGER_ROW_STATUS_HINTS[status]}
      className={cn(ledgerChipClassName, "gap-1", STATUS_TONE[status])}
    >
      <span data-dot aria-hidden="true" className="size-1.5 rounded-full" />
      {LEDGER_ROW_STATUS_LABELS[status]}
    </span>
  );
}

export function LedgerSideTag({ side }: { side: "buy" | "sell" }) {
  return (
    <span
      data-ledger-side={side}
      className={cn(
        ledgerChipClassName,
        "text-[#5f5e5b]",
        // 색 대신 모양으로 가른다: 구함은 테두리, 내놓음은 채움
        side === "buy" ? "border border-border bg-transparent" : "bg-[#f1f1ef]",
      )}
    >
      {side === "buy" ? "구함" : "내놓음"}
    </span>
  );
}

/** 의뢰 칸: 구함 · 내놓음 두 표시만. 건수와 내용은 상세 패널에서 본다. */
export function LedgerSideTags({ row }: { row: CustomerLedgerRow }) {
  const sides = getLedgerRowSides(row);
  if (!sides.buy && !sides.sell) return <span className="sr-only">의뢰 없음</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {sides.buy && <LedgerSideTag side="buy" />}
      {sides.sell && <LedgerSideTag side="sell" />}
    </span>
  );
}

const LIFECYCLE_TONE: Record<string, { label: string; className: string }> = {
  open: { label: "진행 중", className: "bg-[#eef3ed] text-[#44745a] [&>[data-dot]]:bg-[#44745a]" },
  hold: { label: "보류", className: "bg-[#fbf3db] text-[#8f6b1f] [&>[data-dot]]:bg-[#b98a1d]" },
  closed: { label: "종료", className: "bg-[#f1f1ef] text-[#79766f] [&>[data-dot]]:bg-[#b9b6b0]" },
};

/** 의뢰 한 건의 생명주기 (진행 중 · 보류 · 종료) */
export function LedgerLifecycleChip({ status }: { status: string }) {
  const tone = LIFECYCLE_TONE[status] ?? {
    label: status,
    className: "bg-[#f1f1ef] text-[#5f5e5b] [&>[data-dot]]:bg-[#9b9a97]",
  };
  return (
    <span className={cn(ledgerChipClassName, "gap-1", tone.className)}>
      <span data-dot aria-hidden="true" className="size-1.5 rounded-full" />
      {tone.label}
    </span>
  );
}

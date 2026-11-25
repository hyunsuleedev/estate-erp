import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { Deal, ProjectStep, ProjectStepDeal } from "@estate-erp/api-client";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api";
import { formatMoney, formatRelativeDay } from "@/lib/format";
import { getStatusMeta } from "@/lib/status-config";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPaymentKind } from "../deals/-deal-view-utils";
import { RefreshFailedNote } from "./-project-notes";
import { getDealProgressStages } from "../wanted-properties/-match-view-utils";
import { balanceShownInSchedule, describePaymentState, orderPayments } from "./-project-model";
import { describeTerms, FRESH_ON_RETURN, TypeChip } from "./-project-step-detail";
import { dealQueries } from "@/queries/deals";

/*
 * 단계 카드의 거래 묶음: 거래유형 · 금액 · 당사자 · 잔금일, (거래 단계) 흐름, 대금 일정.
 * 매물 의뢰 · 구매 의뢰 카드에서는 거래 단계를 표의 줄(매물상태 알약 옆 · 매칭 묶음의 "거래관리 · 단계")이 이미 보여 주므로
 * 흐름은 빼고 금액 · 당사자와 대금 일정만 얇게 둔다(variant "table"). 거래 단계 카드는 흐름까지(variant "card").
 * 조회는 거래·보수 탭과 같은 이름표를 써서 함께 갱신된다.
 */

/** 묶음 사이의 옅은 선(묶음마다 같은 간격) */
function BlockRule() {
  return <div aria-hidden="true" className="mb-2 h-px bg-[#37352f]/[0.06]" />;
}

/** 카드 안 묶음: 위에 아주 옅은 선 하나(표 아래에서는 표의 선이 대신한다), 작은 회색 제목 */
function BodyBlock({
  label,
  rule = true,
  className,
  children,
  ...rest
}: {
  label: string;
  rule?: boolean;
  className?: string;
  children: React.ReactNode;
} & Record<`data-${string}`, string | boolean | undefined>) {
  return (
    <section className={cn("mt-3", className)} {...rest}>
      {rule && <BlockRule />}
      <div className="mb-1 flex min-h-5 min-w-0 items-center gap-2 text-[12px] leading-[18px]">
        <span className="shrink-0 font-medium text-[#37352f]/50">{label}</span>
      </div>
      {children}
    </section>
  );
}

function LoadFailedRow({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <p className="flex h-7 items-center text-[13px] text-[#37352f]/60">
      {what} 불러오지 못했습니다&nbsp;·&nbsp;
      <button type="button" className="underline underline-offset-2 hover:text-[#37352f]" onClick={onRetry}>
        다시 시도
      </button>
    </p>
  );
}

/**
 * 거래 흐름: 첫 줄에 거래유형 · 금액 · 당사자(매도 → 매수) · 잔금일, 그 아래 단계 흐름 한 줄(지난 단계 흐린 파랑,
 * 지금 단계 굵은 파랑 + 점, 남은 단계 회색 — 가계약은 거래가 그 단계일 때만, 거래 화면과 같은 규칙),
 * 대금 일정이 있으면 그 줄을 모두(종류 · 날짜 · 금액 · 상태, 받은 것은 흐리게, 지난 것은 빨갛게).
 * 대금 일정에 잔금이 있으면 첫 줄의 잔금일은 뺀다(같은 것을 두 번 보이지 않는다).
 * 누르면 거래·보수 탭. 수수료는 넣지 않는다(거래·보수 탭에만). 취소된 거래는 작게 한 줄만.
 */
export function DealFlowBlock({
  step,
  onOpenDeals,
  variant = "card",
}: {
  step: ProjectStep;
  onOpenDeals: () => void;
  /** table: 표 아래(위의 선 없이, 표 칸과 같은 왼쪽 여백), 거래 단계 흐름은 뺀다 */
  variant?: "card" | "table";
}) {
  const deal = step.deal && !step.deal.isCancelled ? step.deal : null;
  const cancelled = step.deal?.isCancelled ? step.deal : (step.cancelledDeal ?? null);
  // 거래·보수 탭과 같은 이름표
  const dealQuery = useQuery({
    ...dealQueries.detail(deal?.id),
    enabled: Boolean(deal),
    ...FRESH_ON_RETURN,
  });
  if (!deal && !cancelled) return null;
  const payments = dealQuery.data ? orderPayments(dealQuery.data.payments ?? []) : null;
  const balanceInSchedule = payments ? balanceShownInSchedule(payments) : false;
  return (
    <BodyBlock
      data-project-card-deal
      label="거래"
      rule={variant === "card"}
      className={variant === "table" ? "mt-0 px-2.5 pb-2 pt-2" : undefined}
    >
      {deal && (
        // 안에 줄 · 목록이 들어가 button 대신 누를 수 있는 div로 둔다(Enter · Space도 받는다).
        <div
          role="button"
          tabIndex={0}
          onClick={onOpenDeals}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onOpenDeals();
            }
          }}
          title="거래·보수 탭에서 봅니다"
          className="-mx-1.5 block w-[calc(100%+12px)] cursor-pointer rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-[rgba(55,53,47,0.03)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/40"
        >
          <DealHeadLine deal={deal} showBalance={!balanceInSchedule} />
          {variant === "card" && <DealStageFlow stage={deal.stage} />}
          {dealQuery.isPending ? (
            <Skeleton className="mt-1 h-5 w-48" />
          ) : payments ? (
            <PaymentLines payments={payments} />
          ) : null}
        </div>
      )}
      {/*
        불러오지 못한 것과 다시 읽지 못한 것은 누를 수 있는 덩이 밖에 둔다("다시 시도"가 탭을 넘기지 않게).
        - 처음부터 못 읽었으면: 대금 일정이 없는 것처럼 보이면 안 된다. 못 읽었다고 말하고 다시 시도하게 한다.
        - 읽어 둔 것이 있는데 다시 읽기에 실패했으면: 보이는 일정이 예전 것일 수 있다고 알린다
          (이 화면은 돌아올 때마다 다시 읽는다 — 거래 화면에서 입금을 적고 돌아왔는데 조용히 예전 일정이 보이면 안 된다).
      */}
      {deal && !dealQuery.isPending && !dealQuery.data && (
        <LoadFailedRow what="대금 일정을" onRetry={() => void dealQuery.refetch()} />
      )}
      {deal && dealQuery.data && dealQuery.isError && (
        <RefreshFailedNote what="최신 대금 일정을" onRetry={() => void dealQuery.refetch()} className="mt-1" />
      )}
      {cancelled && <CancelledLine deal={cancelled} />}
    </BodyBlock>
  );
}

function DealHeadLine({ deal, showBalance }: { deal: ProjectStepDeal; showBalance: boolean }) {
  const isLease = deal.transactionType === "jeonse" || deal.transactionType === "monthly";
  const parties =
    deal.sellerName || deal.buyerName
      ? `${isLease ? "임대인" : "매도인"} ${deal.sellerName ?? "—"} → ${isLease ? "임차인" : "매수인"} ${deal.buyerName ?? "—"}`
      : null;
  return (
    <div className="flex h-7 min-w-0 items-center gap-2 text-[14px]">
      <TypeChip type={deal.transactionType} />
      <b className="shrink-0 font-semibold tabular-nums text-[#37352f]">
        {describeTerms({
          transactionType: deal.transactionType,
          price: deal.agreedPrice,
          deposit: deal.agreedDeposit,
          monthlyRent: deal.agreedMonthlyRent,
        })}
      </b>
      {parties && <span className="min-w-0 truncate text-[13px] text-[#37352f]/65">{parties}</span>}
      <span className="flex-1" />
      {showBalance && deal.balanceDate && (
        <span className="shrink-0 text-[13px] tabular-nums text-[#37352f]/60">
          잔금 {formatRelativeDay(deal.balanceDate)}
          {deal.balancePaidAt && <span className="ml-1 text-success">받음</span>}
        </span>
      )}
      <ChevronRight className="size-3.5 shrink-0 text-[#37352f]/35" />
    </div>
  );
}

/** 단계 흐름 한 줄: 글자와 얇은 구분만(상자 없음) */
function DealStageFlow({ stage }: { stage: string }) {
  const stages = getDealProgressStages(stage);
  const current = stages.indexOf(stage);
  return (
    <ol data-project-card-deal-flow aria-label="거래 단계" className="flex min-h-6 min-w-0 flex-wrap items-center gap-x-1.5 text-[13px]">
      {stages.map((item, index) => (
        <li key={item} className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {index > 0 && <span aria-hidden="true" className="text-[#37352f]/25">›</span>}
          <span
            aria-current={index === current ? "step" : undefined}
            className={cn(
              "inline-flex items-center gap-1",
              index === current
                ? "font-semibold text-info"
                : index < current
                  ? "text-info/55"
                  : "text-[#37352f]/40",
            )}
          >
            {index === current && <span aria-hidden="true" className="size-1.5 rounded-full bg-info" />}
            {getStatusMeta("dealStage", item).label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * 대금 일정의 줄 모두: 종류 · 날짜 · 금액 · 상태. 칸은 내용만큼(줄마다 같은 자리).
 * 받은 줄은 통째로 흐리게, 날짜가 지난 줄은 상태만 빨갛게. 대금 일정이 없으면 아무것도 보이지 않는다.
 */
function PaymentLines({ payments }: { payments: ReadonlyArray<NonNullable<Deal["payments"]>[number]> }) {
  if (payments.length === 0) return null;
  return (
    <ul
      data-project-card-payments
      aria-label="대금 일정"
      className="mt-0.5 grid w-max max-w-full grid-cols-[max-content_max-content_max-content_max-content] gap-x-4 text-[13px] leading-6 tabular-nums"
    >
      {payments.map((payment) => {
        const state = describePaymentState(payment);
        const received = state.tone === "done";
        return (
          <li
            key={payment.id}
            data-project-card-payment={state.tone}
            className={cn("contents", received ? "text-[#37352f]/40" : "text-[#37352f]/70")}
          >
            <span>{formatPaymentKind(payment.kind, payment.sequence)}</span>
            <span>{payment.scheduledDate ? formatRelativeDay(payment.scheduledDate) : "날짜 미정"}</span>
            <span className={cn("text-right", !received && "font-medium text-[#37352f]")}>
              {formatMoney(payment.scheduledAmount)}
            </span>
            <span
              className={cn(
                state.tone === "late" && "font-medium text-destructive",
                state.tone === "plain" && "text-[#37352f]/45",
              )}
            >
              {state.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CancelledLine({ deal }: { deal: ProjectStepDeal }) {
  const parts = [
    "거래 취소",
    deal.cancelledAt ? formatRelativeDay(deal.cancelledAt) : null,
    deal.cancelReason?.trim() || null,
  ].filter(Boolean);
  return (
    <Link
      to="/deals/$id"
      params={{ id: deal.id }}
      title="취소된 거래를 엽니다"
      className="flex h-6 min-w-0 items-center gap-1.5 text-[12.5px] text-[#37352f]/50 underline-offset-2 hover:underline"
    >
      <span className="min-w-0 truncate">{parts.join(" · ")}</span>
      <span className="shrink-0 tabular-nums text-[#37352f]/40">
        {getStatusMeta("transactionType", deal.transactionType).label}{" "}
        {describeTerms({
          transactionType: deal.transactionType,
          price: deal.agreedPrice,
          deposit: deal.agreedDeposit,
          monthlyRent: deal.agreedMonthlyRent,
        })}
      </span>
    </Link>
  );
}

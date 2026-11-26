import type { Deal, Match, MatchRowProperty } from "@estate-erp/api-client";
import { formatMoney, formatRelativeDay, formatRent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatPaymentKind } from "../deals/-deal-view-utils";
import { getTransactionTypeMeta } from "../properties/-detail/model";
import { Tag, type TagTone } from "../properties/-detail/ui";
import { describePaymentState } from "./-project-model";

/**
 * 프로젝트 상세의 여러 곳(단계 카드 · 매물·매칭 탭 · 거래·보수 탭)이 함께 쓰는 작은 조각.
 * 단계 카드의 본문은 매물관리 · 희망매물 표의 한 줄이다(-project-listing-table · -project-buyer-table).
 *
 * 여기서 고치지 않는다. 값의 주인은 각자의 화면(희망조건 · 매물 · 거래)이고, 이 화면은 읽어 와 한곳에서
 * 보여 줄 뿐이다. 그래서 프로젝트에 값을 복사해 두지 않고 볼 때마다 읽는다.
 */

/**
 * 카드의 값은 이 화면에서 고치는 것이 아니라 다른 화면(희망조건 · 매물 · 거래, 다른 탭일 수도 있다)에서
 * 바뀐다. 그래서 이 화면으로 돌아올 때마다 다시 읽는다. 앱의 기본값은 "1분 동안은 다시 읽지 않고,
 * 화면으로 돌아와도 다시 읽지 않음"이라 그대로 두면 다른 탭에서 바꾼 매칭 단계나 입금이 보이지 않는다.
 */
export const FRESH_ON_RETURN = { staleTime: 0, refetchOnWindowFocus: true } as const;

/** 거래유형 꼬리표. 매물 상세의 가격 칩과 같은 색이다. */
export function TypeChip({ type }: { type: string }) {
  const meta = getTransactionTypeMeta(type);
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-[3px] px-1.5 text-[13px]",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

const LIFECYCLE_TAG: Record<string, { label: string; tone: TagTone }> = {
  open: { label: "진행 중", tone: "green" },
  hold: { label: "보류", tone: "yellow" },
  closed: { label: "종료", tone: "gray" },
};

/** 의뢰의 생명주기 꼬리표 (진행 중 · 보류 · 종료) */
export function LifecycleTag({ status }: { status: string }) {
  const meta = LIFECYCLE_TAG[status] ?? { label: status, tone: "gray" as const };
  return (
    <Tag tone={meta.tone} dot>
      {meta.label}
    </Tag>
  );
}

/** 매칭 응답에는 집이 거래 조건 아래에 들어 있다(서버의 include 그대로). */
export function matchProperty(match: Match): MatchRowProperty | undefined {
  return match.listing?.property ?? match.property;
}

/** 금액 표기: 월세는 "보증금 / 월세", 나머지는 가격. */
export function describeTerms(terms: {
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}) {
  if (terms.transactionType === "monthly") return formatRent(terms.deposit, terms.monthlyRent);
  // 전세는 보증금 칸에 적힌 경우도 있다.
  return formatMoney(terms.price ?? terms.deposit);
}

/** 대금 일정 표: 종류 · 날짜 · 금액(오른쪽 맞춤) · 상태. 칸 너비는 내용만큼만 쓴다. 거래·보수 탭이 쓴다(카드는 더 가벼운 줄, -project-step-body). */
export function PaymentSchedule({ payments }: { payments: ReadonlyArray<NonNullable<Deal["payments"]>[number]> }) {
  return (
    <ul className="inline-grid grid-cols-[max-content_max-content_max-content_max-content] gap-x-4 gap-y-1 tabular-nums">
      {payments.map((payment) => {
        const state = describePaymentState(payment);
        return (
          <li key={payment.id} data-project-payment className="contents">
            <span className="text-[#37352f]">{formatPaymentKind(payment.kind, payment.sequence)}</span>
            <span className="text-[#37352f]/65">
              {payment.scheduledDate ? formatRelativeDay(payment.scheduledDate) : "날짜 미정"}
            </span>
            <span className="text-right font-medium text-[#37352f]">
              {formatMoney(payment.scheduledAmount)}
            </span>
            <span
              className={cn(
                "text-[13px]",
                state.tone === "done" && "text-[rgb(68,131,97)]",
                state.tone === "late" && "font-medium text-[rgb(212,76,71)]",
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

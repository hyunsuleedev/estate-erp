import { Link } from "@tanstack/react-router";
import { useQueries, useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type {
  BuyerRequirement,
  Match,
  ProjectStep,
  ProjectStepDeal,
  Property,
} from "@estate-erp/api-client";
import { formatUnitName } from "@estate-erp/shared";
import { api } from "@/lib/api";
import { formatDate, formatMoney, formatRent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/domain";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatAreaRange,
  formatBudget,
  regionLabels,
  siteLabels,
  siteTypeLabels,
} from "../buyer-requirements/-buyer-utils";
import { formatLedgerDate } from "../customers-table/-customer-inspector";
import { formatPaymentKind } from "../deals/-deal-view-utils";
import { getTransactionTypeMeta } from "../properties/-detail/model";
import { Tag, type TagTone } from "../properties/-detail/ui";
import { RefreshFailedNote } from "./-project-notes";
import {
  describePaymentState,
  describePlace,
  orderPayments,
  splitMatches,
} from "./-project-model";

/**
 * 진행 계획의 한 단계에 담긴 것을 펼쳐 보여 준다 (상세 페이지).
 *
 * - 구함 의뢰: 희망조건(거래유형 · 예산 · 면적 · 지역 · 입주)과 매칭된 매물 · 단계
 * - 내놓음 의뢰: 내놓은 조건(가격)과 매칭된 손님 · 단계
 * - 거래: 단계 · 합의 금액 · 대금 일정
 *
 * 여기서 고치지 않는다. 값의 주인은 각자의 화면(희망조건 · 매물 · 거래)이고, 이 화면은 읽어 와 한곳에서
 * 보여 줄 뿐이다. 그래서 프로젝트에 값을 복사해 두지 않고 볼 때마다 읽는다.
 */

/**
 * 펼친 내용은 이 화면에서 고치는 것이 아니라 다른 화면(희망조건 · 매물 · 거래, 다른 탭일 수도 있다)에서
 * 바뀐다. 그래서 이 화면으로 돌아올 때마다 다시 읽는다. 앱의 기본값은 "1분 동안은 다시 읽지 않고,
 * 화면으로 돌아와도 다시 읽지 않음"이라 그대로 두면 다른 탭에서 바꾼 매칭 단계나 입금이 보이지 않는다.
 */
const FRESH_ON_RETURN = { staleTime: 0, refetchOnWindowFocus: true } as const;

/** 한 의뢰에서 줄로 보여 주는 매칭 수. 넘으면 몇 건 더 있는지와 가는 길을 준다. */
const MATCHES_SHOWN = 5;

// 글자 · 선 · 꼬리표는 매물 상세의 것을 따른다: 글자 rgb(55,53,47), 이름표 13px 흐리게, 값 14px.
const linkClassName = "underline-offset-2 hover:underline";
const mutedLineClassName = "text-[13px] leading-[19px] text-[#37352f]/65";
const strongClassName = "font-medium text-[#37352f]";

/** 거래유형 꼬리표. 매물 상세의 가격 칩과 같은 색이다. */
function TypeChip({ type }: { type: string }) {
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
function matchProperty(match: Match): Property | undefined {
  return (match.listing as { property?: Property } | undefined)?.property ?? match.property;
}

/** 금액 표기: 월세는 "보증금 / 월세", 나머지는 가격. */
function describeTerms(terms: {
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}) {
  if (terms.transactionType === "monthly") return formatRent(terms.deposit, terms.monthlyRent);
  // 전세는 보증금 칸에 적힌 경우도 있다.
  return formatMoney(terms.price ?? terms.deposit);
}

export function ProjectStepDetail({ step }: { step: ProjectStep }) {
  if (step.kind === "manual") return null;
  return (
    <dl
      data-project-step-detail
      className="grid grid-cols-[74px_minmax(0,1fr)] gap-x-2 gap-y-2.5 text-[14px] leading-[21px] text-[#37352f]"
    >
      {step.buyerIntake && <BuyerIntakeDetail intake={step.buyerIntake} />}
      {step.listingIntake && <ListingIntakeDetail intake={step.listingIntake} />}
      {step.deal && <DealDetail deal={step.deal} />}
    </dl>
  );
}

function Term({ children }: { children: ReactNode }) {
  return <dt className="text-[13px] text-[#37352f]/65">{children}</dt>;
}

function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <span className={mutedLineClassName}>
      {what} 불러오지 못했습니다.{" "}
      <button type="button" className="underline underline-offset-2 hover:text-[#37352f]" onClick={onRetry}>
        다시 시도
      </button>
    </span>
  );
}

// ── 구함 의뢰 ───────────────────────────────────────────────────

function BuyerIntakeDetail({ intake }: { intake: NonNullable<ProjectStep["buyerIntake"]> }) {
  const requirements = intake.requirements;
  // 희망조건 화면과 같은 이름표라 그 화면에서 읽어 둔 것을 함께 쓴다.
  const detailQueries = useQueries({
    queries: requirements.map((requirement) => ({
      queryKey: ["buyer-requirements", "detail", requirement.id],
      queryFn: () => api.buyerRequirements.findOne(requirement.id),
      ...FRESH_ON_RETURN,
    })),
  });

  if (requirements.length === 0) {
    return (
      <>
        <Term>희망조건</Term>
        <dd className={mutedLineClassName}>아직 적은 희망조건이 없습니다.</dd>
      </>
    );
  }

  return (
    <>
      {requirements.map((requirement, index) => {
        const query = detailQueries[index];
        return (
          <RequirementBlock
            key={requirement.id}
            requirementId={requirement.id}
            label={requirements.length > 1 ? `희망조건 ${index + 1}` : "희망조건"}
            detail={query?.data}
            isPending={query?.isPending ?? true}
            isError={query?.isError ?? false}
            onRetry={() => void query?.refetch()}
          />
        );
      })}
    </>
  );
}

function RequirementBlock({
  requirementId,
  label,
  detail,
  isPending,
  isError,
  onRetry,
}: {
  requirementId: string;
  label: string;
  detail: BuyerRequirement | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const matchesQuery = useQuery({
    queryKey: ["matches", "by-requirement", requirementId],
    queryFn: () => api.matches.findAll({ buyerReqId: requirementId }),
    ...FRESH_ON_RETURN,
  });
  const { active, closedCount } = splitMatches(matchesQuery.data ?? []);

  return (
    <>
      <Term>{label}</Term>
      <dd data-project-requirement className="min-w-0">
        {detail ? (
          <>
            <RequirementSummary requirement={detail} />
            {isError && <RefreshFailedNote what="최신 희망조건을" onRetry={onRetry} className="mt-1" />}
          </>
        ) : isPending ? (
          <Skeleton className="h-9 w-full max-w-[420px]" />
        ) : isError ? (
          <LoadFailed what="희망조건을" onRetry={onRetry} />
        ) : null}
      </dd>

      <Term>매칭{matchesQuery.data ? ` ${active.length}` : ""}</Term>
      <dd data-project-matches className="min-w-0">
        {matchesQuery.isPending ? (
          <Skeleton className="h-5 w-full max-w-[320px]" />
        ) : !matchesQuery.data ? (
          <LoadFailed what="매칭을" onRetry={() => void matchesQuery.refetch()} />
        ) : (
          <MatchList
            refreshFailed={matchesQuery.isError}
            onRetry={() => void matchesQuery.refetch()}
            empty="아직 제안한 매물이 없습니다."
            closedCount={closedCount}
            moreCount={Math.max(0, active.length - MATCHES_SHOWN)}
            more={
              <Link
                to="/buyer-requirements/$id"
                params={{ id: requirementId }}
                className={linkClassName}
              >
                희망조건에서 모두 보기
              </Link>
            }
          >
            {active.slice(0, MATCHES_SHOWN).map((match) => {
              const property = matchProperty(match);
              const listing = match.listing;
              return (
                <MatchRow key={match.id} stage={match.stage}>
                  {property ? (
                    <Link
                      to="/properties/$id"
                      params={{ id: property.id }}
                      className={cn("min-w-0 truncate", strongClassName, linkClassName)}
                    >
                      {describePlace(property, formatUnitName)}
                    </Link>
                  ) : (
                    <span className={cn("min-w-0 truncate", strongClassName)}>매물</span>
                  )}
                  {listing && (
                    <span className="shrink-0 tabular-nums text-[#37352f]/65">
                      {describeTerms(listing)}
                    </span>
                  )}
                </MatchRow>
              );
            })}
          </MatchList>
        )}
      </dd>
    </>
  );
}

/** 희망조건 한 건: 거래유형 · 예산 · 면적 · 유형 / 지역 · 단지 · 입주. 비어 있는 조건은 적지 않는다. */
function RequirementSummary({ requirement }: { requirement: BuyerRequirement }) {
  const budget = formatBudget(requirement);
  const area =
    requirement.areaMin || requirement.areaMax
      ? formatAreaRange(requirement.areaMin, requirement.areaMax)
      : "";
  const types = siteTypeLabels(requirement);
  const where = [...siteLabels(requirement), ...regionLabels(requirement)];
  const main = [budget !== "—" ? budget : "", area, types.join(" · ")].filter(Boolean);
  const sub = [
    where.length > 0 ? where.join(", ") : "",
    requirement.moveInDate ? `${formatDate(requirement.moveInDate)} 입주 희망` : "",
  ].filter(Boolean);

  return (
    <div className="min-w-0">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {requirement.transactionType && <TypeChip type={requirement.transactionType} />}
        <Link
          to="/buyer-requirements/$id"
          params={{ id: requirement.id }}
          className={cn("min-w-0 tabular-nums", strongClassName, linkClassName)}
        >
          {main.length > 0 ? main.join(" · ") : "조건 미정"}
        </Link>
        {requirement.status !== "active" && (
          <Tag tone={requirement.status === "hold" ? "yellow" : "gray"}>
            {requirement.status === "hold" ? "보류" : "완료"}
          </Tag>
        )}
      </div>
      {sub.length > 0 && <p className={cn("mt-0.5", mutedLineClassName)}>{sub.join(" · ")}</p>}
      {requirement.memo?.trim() && (
        <p className={cn("mt-0.5 line-clamp-2 whitespace-pre-wrap", mutedLineClassName)}>
          {requirement.memo.trim()}
        </p>
      )}
    </div>
  );
}

// ── 내놓음 의뢰 ─────────────────────────────────────────────────

function ListingIntakeDetail({ intake }: { intake: NonNullable<ProjectStep["listingIntake"]> }) {
  // 그 집의 매칭을 한 번에 읽고, 이 의뢰의 거래 조건에 걸린 것만 남긴다(지난 의뢰의 매칭은 뺀다).
  const matchesQuery = useQuery({
    queryKey: ["matches", "by-property", intake.propertyId],
    queryFn: () => api.matches.findAll({ propertyId: intake.propertyId }),
    ...FRESH_ON_RETURN,
  });
  const listingIds = new Set(intake.listings.map((listing) => listing.id));
  const { active, closedCount } = splitMatches(
    (matchesQuery.data ?? []).filter((match) => listingIds.has(match.listingId)),
  );

  return (
    <>
      <Term>내놓은 조건</Term>
      <dd data-project-listings className="min-w-0">
        {intake.listings.length > 0 ? (
          <ul className="space-y-1">
            {intake.listings.map((listing) => (
              <li key={listing.id} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <TypeChip type={listing.transactionType} />
                <b
                  className={cn(
                    "text-[15px] font-bold tabular-nums tracking-[-0.01em] text-[#37352f]",
                    listing.isPaused && "font-medium text-[#37352f]/45",
                  )}
                >
                  {describeTerms(listing)}
                </b>
                {listing.isPaused && <Tag tone="yellow">잠시 내림</Tag>}
              </li>
            ))}
          </ul>
        ) : (
          <span className={mutedLineClassName}>아직 적은 거래 조건이 없습니다.</span>
        )}
        <p className={cn("mt-1 flex flex-wrap items-center gap-x-2", mutedLineClassName)}>
          <Link
            to="/properties/$id"
            params={{ id: intake.propertyId }}
            className={linkClassName}
          >
            {intake.label ?? "매물"} 열기
          </Link>
        </p>
      </dd>

      <Term>매칭{matchesQuery.data ? ` ${active.length}` : ""}</Term>
      <dd data-project-matches className="min-w-0">
        {matchesQuery.isPending ? (
          <Skeleton className="h-5 w-full max-w-[320px]" />
        ) : !matchesQuery.data ? (
          <LoadFailed what="매칭을" onRetry={() => void matchesQuery.refetch()} />
        ) : (
          <MatchList
            refreshFailed={matchesQuery.isError}
            onRetry={() => void matchesQuery.refetch()}
            empty="아직 이 집을 제안한 손님이 없습니다."
            closedCount={closedCount}
            moreCount={Math.max(0, active.length - MATCHES_SHOWN)}
            more={
              <Link
                to="/properties/$id"
                params={{ id: intake.propertyId }}
                className={linkClassName}
              >
                매물에서 모두 보기
              </Link>
            }
          >
            {active.slice(0, MATCHES_SHOWN).map((match) => {
              const requirement = match.buyerRequirement;
              const contacts = requirement?.buyerIntake?.contacts ?? [];
              const buyer =
                (contacts.find((item) => item.isPrimary) ?? contacts[0])?.contact?.name ??
                requirement?.contact?.name ??
                "손님";
              const listing = intake.listings.find((item) => item.id === match.listingId);
              return (
                <MatchRow key={match.id} stage={match.stage}>
                  <Link
                    to="/buyer-requirements/$id"
                    params={{ id: match.buyerReqId }}
                    className={cn("min-w-0 truncate", strongClassName, linkClassName)}
                  >
                    {buyer}
                  </Link>
                  {listing && intake.listings.length > 1 && <TypeChip type={listing.transactionType} />}
                </MatchRow>
              );
            })}
          </MatchList>
        )}
      </dd>
    </>
  );
}

// ── 매칭 줄 ─────────────────────────────────────────────────────

function MatchList({
  children,
  empty,
  closedCount,
  moreCount,
  more,
  refreshFailed,
  onRetry,
}: {
  children: ReactNode[];
  /** 앞서 읽은 것은 있는데 다시 읽다가 실패했다. 보이는 줄이 예전 것일 수 있다. */
  refreshFailed: boolean;
  onRetry: () => void;
  empty: string;
  /** 종료된 매칭 수. 줄로 보이지 않는다. */
  closedCount: number;
  /** 줄로 보이지 않는 살아 있는 매칭 수 */
  moreCount: number;
  more: ReactNode;
}) {
  const notes = [
    moreCount > 0 ? `${moreCount}건 더 있음` : "",
    closedCount > 0 ? `종료된 매칭 ${closedCount}건` : "",
  ].filter(Boolean);
  return (
    <>
      {children.length > 0 ? (
        <ul className="space-y-1">{children}</ul>
      ) : (
        <span className={mutedLineClassName}>{empty}</span>
      )}
      {notes.length > 0 && (
        <p className={cn("mt-1", mutedLineClassName)}>
          {notes.join(" · ")} · {more}
        </p>
      )}
      {refreshFailed && <RefreshFailedNote what="최신 매칭을" onRetry={onRetry} className="mt-1" />}
    </>
  );
}

function MatchRow({ stage, children }: { stage: string; children: ReactNode }) {
  return (
    <li data-project-match className="flex min-w-0 items-center gap-2">
      <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
      <StatusBadge kind="matchStage" status={stage} size="sm" />
    </li>
  );
}

// ── 거래 ────────────────────────────────────────────────────────

function DealDetail({ deal }: { deal: ProjectStepDeal }) {
  const dealQuery = useQuery({
    queryKey: ["deals", "project-step", deal.id],
    queryFn: () => api.deals.findOne(deal.id),
    ...FRESH_ON_RETURN,
  });
  const payments = orderPayments(dealQuery.data?.payments ?? []);

  return (
    <>
      <Term>거래</Term>
      <dd data-project-deal className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        {deal.isCancelled ? (
          <Tag>취소됨</Tag>
        ) : (
          <StatusBadge kind="dealStage" status={deal.stage} size="sm" />
        )}
        <TypeChip type={deal.transactionType} />
        <Link
          to="/deals/$id"
          params={{ id: deal.id }}
          className={cn(
            "text-[15px] font-bold tabular-nums tracking-[-0.01em] text-[#37352f]",
            linkClassName,
          )}
        >
          {describeTerms({
            transactionType: deal.transactionType,
            price: deal.agreedPrice,
            deposit: deal.agreedDeposit,
            monthlyRent: deal.agreedMonthlyRent,
          })}
        </Link>
        {(deal.buyerName || deal.sellerName) && (
          <span className="min-w-0 truncate text-[13px] text-[#37352f]/65">
            {[deal.sellerName, deal.buyerName].filter(Boolean).join(" → ")}
          </span>
        )}
      </dd>

      <Term>대금 일정</Term>
      <dd data-project-payments className="min-w-0">
        {dealQuery.isPending ? (
          <Skeleton className="h-5 w-full max-w-[320px]" />
        ) : !dealQuery.data ? (
          <LoadFailed what="대금 일정을" onRetry={() => void dealQuery.refetch()} />
        ) : payments.length > 0 ? (
          // 표처럼 칸을 맞춘다: 종류 · 날짜 · 금액(오른쪽 맞춤) · 상태. 칸 너비는 내용만큼만 쓴다.
          <ul className="inline-grid grid-cols-[max-content_max-content_max-content_max-content] gap-x-4 gap-y-1 tabular-nums">
            {payments.map((payment) => {
              const state = describePaymentState(payment);
              return (
                <li key={payment.id} data-project-payment className="contents">
                  <span className="text-[#37352f]">
                    {formatPaymentKind(payment.kind, payment.sequence)}
                  </span>
                  <span className="text-[#37352f]/65">
                    {payment.scheduledDate ? formatLedgerDate(payment.scheduledDate) : "날짜 미정"}
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
        ) : (
          <span className={mutedLineClassName}>
            등록한 대금 일정이 없습니다.
            {deal.balanceDate ? ` 계약서의 잔금일은 ${formatDate(deal.balanceDate)}입니다.` : ""}
          </span>
        )}
        {dealQuery.data && dealQuery.isError && (
          <RefreshFailedNote
            what="최신 대금 일정을"
            onRetry={() => void dealQuery.refetch()}
            className="mt-1"
          />
        )}
      </dd>
    </>
  );
}

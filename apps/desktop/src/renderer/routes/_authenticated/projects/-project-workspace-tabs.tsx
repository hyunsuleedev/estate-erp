import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import type { CommissionPayment, Match, ProjectStep, ProjectStepDeal } from "@estate-erp/api-client";
import { MatchStage, normalizeMatchStage } from "@estate-erp/shared";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  FileAudio,
  FileImage,
  FileText,
  Info,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { formatArea, formatDate, formatMoney, formatPyeong, formatRelativeDay } from "@/lib/format";
import { getStatusMeta, PIPELINE_STEPS } from "@/lib/status-config";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/domain";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBudget } from "../buyer-requirements/-buyer-utils";
import { MatchConvertDialog } from "../wanted-properties/-match-convert-dialog";
import {
  getActiveDealLink,
  getMatchClosedReasonText,
  getMatchStageActionCopy,
  getMatchStageBlockReason,
  getMatchStageLabel,
  matchBoardStages,
} from "../wanted-properties/-match-view-utils";
import { nb, Tag } from "../properties/-detail/ui";
import { RefreshFailedNote } from "./-project-notes";
import { BOX_CLASS } from "./-project-ui";
import {
  collectProjectDeals,
  describeClosedMatches,
  describePlace,
  orderPayments,
  splitMatches,
  type ProjectViewTab,
  LISTING_GRID,
  REQUIREMENT_GRID,
} from "./-project-model";
import {
  describeTerms,
  FRESH_ON_RETURN,
  matchProperty,
  PaymentSchedule,
  TypeChip,
} from "./-project-step-detail";
import { dealQueries } from "@/queries/deals";

/*
 * 프로젝트 상세 본문의 보기 탭: 개요 · 매물·매칭 · 거래·보수 · 자료실(데모).
 * 시안("1+2 통합안")과 같은 밑줄 탭 + 숫자 배지(사용자 요청 2026-11-23). 머리 아래 선 위에 앉는다.
 * 고른 탭은 파랑 글자와 밑줄, 숫자 배지도 옅은 파랑. 숫자는 있을 때만, 자료실은 "준비 중".
 */

export function ProjectViewTabs({
  value,
  onChange,
  counts,
}: {
  value: ProjectViewTab;
  onChange: (value: ProjectViewTab) => void;
  counts: { matches: number; deals: number };
}) {
  const options: Array<{ value: ProjectViewTab; label: string; count?: number; note?: string }> = [
    { value: "overview", label: "개요" },
    { value: "matches", label: "매물·매칭", count: counts.matches },
    { value: "deals", label: "거래·보수", count: counts.deals },
    { value: "files", label: "자료실", note: "준비 중" },
  ];
  return (
    <div
      role="tablist"
      aria-label="프로젝트 보기"
      data-project-view-tabs
      className="flex max-w-full items-end gap-1 overflow-x-auto"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            data-project-view-tab={option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              // 밑줄은 안쪽 아래 그림자로 긋는다(border 색 유틸리티는 app.css 때문에 먹지 않는다).
              "inline-flex h-10 items-center gap-1.5 whitespace-nowrap px-3 text-[14px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/30",
              selected
                ? "font-semibold text-info shadow-[inset_0_-2px_0_var(--color-info)]"
                : "text-[#37352f]/60 hover:text-[#37352f] hover:shadow-[inset_0_-2px_0_#e3e2df]",
            )}
          >
            {option.label}
            {option.count !== undefined && option.count > 0 && (
              <span
                className={cn(
                  "inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 text-[11.5px] font-medium tabular-nums",
                  selected ? "bg-info-soft text-info-strong" : "bg-secondary text-[#37352f]/60",
                )}
              >
                {option.count.toLocaleString()}
              </span>
            )}
            {option.note && (
              <span
                className={cn(
                  "inline-flex h-[18px] items-center rounded-full px-1.5 text-[11.5px] font-normal",
                  selected ? "bg-info-soft text-info-strong" : "bg-secondary text-[#37352f]/50",
                )}
              >
                {option.note}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── 공용 ────────────────────────────────────────────────────────

const linkClassName = "underline-offset-2 hover:underline";
/** 탭 안의 한 묶음(구역 상자): 흰 바탕 · 가는 테 · 둥근 모서리 */
const GROUP_BOX_CLASS = cn(BOX_CLASS, "px-4 pb-3.5 pt-3");
const mutedClassName = "text-[13px] leading-[19px] text-[#37352f]/65";

/** 탭 안의 한 묶음 제목(구역 제목보다 한 단계 작다): 이름 · 곁들임 … 오른쪽 작업 */
function GroupHead({
  children,
  sub,
  action,
}: {
  children: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <h3 className="flex min-w-0 items-center gap-1.5 text-[15px] font-semibold leading-[1.4] text-[#37352f]">
        {children}
      </h3>
      {sub && <span className="min-w-0 truncate text-[13px] text-[#37352f]/55">{sub}</span>}
      {action && <span className="ml-auto flex shrink-0 items-center gap-0.5">{action}</span>}
    </div>
  );
}

function EmptyTab({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] bg-white px-4 py-3.5 text-[13.5px] text-[#37352f]/65 outline-1 -outline-offset-1 outline-dashed outline-[#d6d5d1]">
      <span className="min-w-[240px] flex-1 break-keep">{children}</span>
      {action}
    </div>
  );
}

// ── 매물·매칭 ───────────────────────────────────────────────────

/**
 * 단계 바꾸기는 희망매물 화면과 같은 규칙을 쓴다(값 · 종료 사유 · 건너뛰기 · 막는 조건을 그쪽 것에서 가져온다):
 * - 순서는 막지 않는다(건너뛰기 허용, 서버도 같다).
 * - 고객 관심 이후로 넘길 때 매물 확인이 안 됐으면 이유를 알리고 멈춘다(getMatchStageBlockReason).
 * - 거래 전환은 늘 거래 전환 창을 거친다(같은 창을 그대로 쓴다).
 */
export function useMatchStageChange(onConvert: (match: Match) => void) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => api.matches.updateStage(id, { stage }),
    onSuccess: (_match, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["matches"] });
      // 진행 계획 단계의 매칭 수 · 상태도 바뀐다
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success(
        variables.stage === MatchStage.CLOSED
          ? "매칭을 종료했습니다"
          : `${getMatchStageLabel(variables.stage)} 단계로 변경했습니다`,
      );
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "단계를 바꾸지 못했습니다. 다시 시도해 주세요."));
    },
  });
  const change = (match: Match, stage: string) => {
    const blockReason = getMatchStageBlockReason(match, stage);
    if (blockReason) {
      toast.error("단계 이동 전 확인이 필요합니다", { description: blockReason });
      return;
    }
    if (stage === MatchStage.DEAL_CREATED) {
      onConvert(match);
      return;
    }
    mutation.mutate({ id: match.id, stage });
  };
  return { change, isPending: mutation.isPending };
}

export function ProjectMatchesTab({
  steps,
  onAddIntake,
}: {
  steps: readonly ProjectStep[];
  onAddIntake: () => void;
}) {
  const queryClient = useQueryClient();
  const [convertMatch, setConvertMatch] = useState<Match | null>(null);
  const stage = useMatchStageChange(setConvertMatch);
  const buyerSteps = steps.filter((step) => step.buyerIntake);
  const listingSteps = steps.filter((step) => step.listingIntake);

  if (buyerSteps.length === 0 && listingSteps.length === 0) {
    return (
      <EmptyTab
        action={
          <button type="button" className={nb.line} onClick={onAddIntake}>
            <Plus />
            의뢰 담기
          </button>
        }
      >
        담은 의뢰가 없습니다. 구매 의뢰를 담으면 제안한 매물이, 매물 의뢰를 담으면 그 집에 연결한 고객이 여기에
        나옵니다.
      </EmptyTab>
    );
  }

  return (
    <div data-project-matches-tab className="space-y-3.5">
      {buyerSteps.map((step) => {
        const intake = step.buyerIntake!;
        if (intake.requirements.length === 0) {
          return (
            <section key={step.id} className={GROUP_BOX_CLASS}>
              <GroupHead sub={step.title}>
                <Tag tone="blue" className="text-[12px]">구매 의뢰</Tag>
              </GroupHead>
              <p className={mutedClassName}>아직 적은 희망 조건이 없습니다.</p>
            </section>
          );
        }
        return intake.requirements.map((requirement) => (
          <RequirementMatches
            key={`${step.id}:${requirement.id}`}
            stepTitle={step.title}
            requirementId={requirement.id}
            intakeClosed={intake.lifecycleStatus === "closed"}
            isUpdating={stage.isPending}
            onStageChange={stage.change}
          />
        ));
      })}
      {listingSteps.map((step) => (
        <ListingMatches
          key={step.id}
          step={step}
          isUpdating={stage.isPending}
          onStageChange={stage.change}
        />
      ))}
      <p className="break-keep text-[12.5px] leading-[18px] text-[#37352f]/45">
        새 매물 · 고객을 연결하는 일은 희망 조건 화면(매물 연결)과 매물 화면(고객 연결)에서 합니다.
      </p>
      <MatchConvertDialog
        match={convertMatch}
        open={convertMatch !== null}
        onOpenChange={(open) => {
          if (open) return;
          setConvertMatch(null);
          void queryClient.invalidateQueries({ queryKey: ["projects"] });
        }}
      />
    </div>
  );
}


function TableHead({ grid, labels }: { grid: string; labels: string[] }) {
  return (
    <div className={cn(grid, "h-8 border-b border-[#e9e9e7] text-[12.5px] text-[#37352f]/55")}>
      {labels.map((label) => (
        <span key={label} className="truncate">
          {label}
        </span>
      ))}
    </div>
  );
}

function RequirementMatches({
  stepTitle,
  requirementId,
  intakeClosed,
  isUpdating,
  onStageChange,
}: {
  stepTitle: string;
  requirementId: string;
  intakeClosed: boolean;
  isUpdating: boolean;
  onStageChange: (match: Match, stage: string) => void;
}) {
  const detailQuery = useQuery({
    queryKey: ["buyer-requirements", "detail", requirementId],
    queryFn: () => api.buyerRequirements.findOne(requirementId),
    ...FRESH_ON_RETURN,
  });
  const matchesQuery = useQuery({
    queryKey: ["matches", "by-requirement", requirementId],
    queryFn: () => api.matches.findAll({ buyerReqId: requirementId }),
    ...FRESH_ON_RETURN,
  });
  const [showClosed, setShowClosed] = useState(false);
  const requirement = detailQuery.data;
  const budget = requirement ? formatBudget(requirement) : "";
  const all = matchesQuery.data ?? [];
  const { active, closedCount, closedReasons } = splitMatches(all);
  const closed = all.filter((match) => normalizeMatchStage(match.stage) === MatchStage.CLOSED);

  return (
    <section data-project-requirement-matches className={GROUP_BOX_CLASS}>
      <GroupHead
        sub={stepTitle}
        action={
          !intakeClosed && (
            <Link
              to="/buyer-requirements/$id"
              params={{ id: requirementId }}
              className={cn(nb.ghost, "h-6 px-1.5 text-[12.5px]")}
              title="이 희망 조건 화면에서 맞는 매물을 찾아 연결합니다"
            >
              매물 연결
              <ChevronRight className="!size-3.5" />
            </Link>
          )
        }
      >
        <Tag tone="blue" className="text-[12px]">구매 의뢰</Tag>
        {requirement?.transactionType && <TypeChip type={requirement.transactionType} />}
        <Link to="/buyer-requirements/$id" params={{ id: requirementId }} className={cn("tabular-nums text-info", linkClassName)}>
          {requirement ? (budget && budget !== "—" ? budget : "예산 미정") : "희망 조건"}
        </Link>
      </GroupHead>

      {matchesQuery.isPending ? (
        <Skeleton className="mt-1 h-16 w-full" />
      ) : !matchesQuery.data ? (
        <LoadFailedLine what="매칭을" onRetry={() => void matchesQuery.refetch()} />
      ) : (
        <>
          {active.length === 0 ? (
            <p className={cn("border-t border-[#e9e9e7] pt-2", mutedClassName)}>아직 제안한 매물이 없습니다.</p>
          ) : (
            <div role="table" aria-label="제안한 매물">
              <TableHead grid={REQUIREMENT_GRID} labels={["매물", "면적", "가격", "단계", "메모"]} />
              {active.map((match) => (
                <RequirementMatchRow
                  key={match.id}
                  match={match}
                  isUpdating={isUpdating}
                  onStageChange={onStageChange}
                />
              ))}
            </div>
          )}
          {closedCount > 0 && (
            <ClosedToggle
              open={showClosed}
              onToggle={() => setShowClosed((value) => !value)}
              note={describeClosedMatches(closedCount, closedReasons)}
            />
          )}
          {showClosed &&
            closed.map((match) => (
              <RequirementMatchRow
                key={match.id}
                match={match}
                isUpdating={isUpdating}
                onStageChange={onStageChange}
              />
            ))}
          {matchesQuery.isError && (
            <RefreshFailedNote what="최신 매칭을" onRetry={() => void matchesQuery.refetch()} className="mt-1" />
          )}
        </>
      )}
    </section>
  );
}

function RequirementMatchRow({
  match,
  isUpdating,
  onStageChange,
}: {
  match: Match;
  isUpdating: boolean;
  onStageChange: (match: Match, stage: string) => void;
}) {
  const property = matchProperty(match);
  const listing = match.listing;
  const area =
    property?.unit?.supplyAreaM2 ??
    property?.unit?.siteUnitType?.supplyAreaM2 ??
    property?.unit?.exclusiveAreaM2 ??
    null;
  const closed = normalizeMatchStage(match.stage) === MatchStage.CLOSED;
  return (
    <div
      role="row"
      data-project-match-row
      className={cn(REQUIREMENT_GRID, "min-h-10 border-b border-[#e9e9e7] py-1.5 text-[14px]", closed && "text-[#37352f]/55")}
    >
      <span role="cell" className="min-w-0">
        {property ? (
          <Link
            to="/properties/$id"
            params={{ id: property.id }}
            className={cn("block truncate font-medium text-[#37352f]", linkClassName, closed && "text-[#37352f]/55")}
            title={describePlace(property)}
          >
            {describePlace(property)}
          </Link>
        ) : (
          <span className="font-medium">매물</span>
        )}
      </span>
      <span role="cell" className="truncate tabular-nums text-[#37352f]/65" title={area ? formatArea(area) : undefined}>
        {area ? formatPyeong(area) : "—"}
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-1.5">
        {listing && (
          <span className="truncate tabular-nums">
            {describeTerms(listing)}
          </span>
        )}
      </span>
      <span role="cell" className="min-w-0">
        <MatchStagePicker match={match} disabled={isUpdating} onChange={onStageChange} />
      </span>
      <span role="cell" className="min-w-0 truncate text-[13px] text-[#37352f]/65" title={match.memo ?? undefined}>
        {match.memo?.trim() || <span className="text-[#37352f]/30">—</span>}
      </span>
    </div>
  );
}

function ListingMatches({
  step,
  isUpdating,
  onStageChange,
}: {
  step: ProjectStep;
  isUpdating: boolean;
  onStageChange: (match: Match, stage: string) => void;
}) {
  const intake = step.listingIntake!;
  const matchesQuery = useQuery({
    queryKey: ["matches", "by-property", intake.propertyId],
    queryFn: () => api.matches.findAll({ propertyId: intake.propertyId }),
    ...FRESH_ON_RETURN,
  });
  const [showClosed, setShowClosed] = useState(false);
  // 그 집의 매칭 가운데 이 의뢰의 거래 조건에 걸린 것만(지난 의뢰의 매칭은 뺀다 — 단계 펼침과 같다)
  const listingIds = new Set(intake.listings.map((listing) => listing.id));
  const mine = (matchesQuery.data ?? []).filter((match) => listingIds.has(match.listingId));
  const { active, closedCount, closedReasons } = splitMatches(mine);
  const closed = mine.filter((match) => normalizeMatchStage(match.stage) === MatchStage.CLOSED);

  return (
    <section data-project-listing-matches className={GROUP_BOX_CLASS}>
      <GroupHead
        sub="연결한 고객"
        action={
          intake.lifecycleStatus !== "closed" && (
            <Link
              to="/properties/$id"
              params={{ id: intake.propertyId }}
              className={cn(nb.ghost, "h-6 px-1.5 text-[12.5px]")}
              title="이 매물 화면에서 맞는 고객을 찾아 연결합니다"
            >
              고객 연결
              <ChevronRight className="!size-3.5" />
            </Link>
          )
        }
      >
        <Tag tone="yellow" className="text-[12px]">매물 의뢰</Tag>
        <Link to="/properties/$id" params={{ id: intake.propertyId }} className={cn("text-[#37352f]", linkClassName)}>
          {intake.label ?? step.title}
        </Link>
      </GroupHead>
      {matchesQuery.isPending ? (
        <Skeleton className="mt-1 h-16 w-full" />
      ) : !matchesQuery.data ? (
        <LoadFailedLine what="매칭을" onRetry={() => void matchesQuery.refetch()} />
      ) : (
        <>
          {active.length === 0 ? (
            <p className={cn("border-t border-[#e9e9e7] pt-2", mutedClassName)}>
              아직 이 집을 제안한 고객이 없습니다.
            </p>
          ) : (
            <div role="table" aria-label="연결한 고객">
              <TableHead grid={LISTING_GRID} labels={["고객", "희망 조건", "단계", "메모"]} />
              {active.map((match) => (
                <ListingMatchRow
                  key={match.id}
                  match={match}
                  showType={intake.listings.length > 1}
                  isUpdating={isUpdating}
                  onStageChange={onStageChange}
                />
              ))}
            </div>
          )}
          {closedCount > 0 && (
            <ClosedToggle
              open={showClosed}
              onToggle={() => setShowClosed((value) => !value)}
              note={describeClosedMatches(closedCount, closedReasons)}
            />
          )}
          {showClosed &&
            closed.map((match) => (
              <ListingMatchRow
                key={match.id}
                match={match}
                showType={intake.listings.length > 1}
                isUpdating={isUpdating}
                onStageChange={onStageChange}
              />
            ))}
          {matchesQuery.isError && (
            <RefreshFailedNote what="최신 매칭을" onRetry={() => void matchesQuery.refetch()} className="mt-1" />
          )}
        </>
      )}
    </section>
  );
}

function ListingMatchRow({
  match,
  showType,
  isUpdating,
  onStageChange,
}: {
  match: Match;
  showType: boolean;
  isUpdating: boolean;
  onStageChange: (match: Match, stage: string) => void;
}) {
  const requirement = match.buyerRequirement;
  const contacts = requirement?.buyerIntake?.contacts ?? [];
  const buyer =
    (contacts.find((item) => item.isPrimary) ?? contacts[0])?.contact?.name ??
    requirement?.contact?.name ??
    "고객";
  const budget = requirement ? formatBudget(requirement) : "";
  const closed = normalizeMatchStage(match.stage) === MatchStage.CLOSED;
  return (
    <div
      role="row"
      data-project-match-row
      className={cn(LISTING_GRID, "min-h-10 border-b border-[#e9e9e7] py-1.5 text-[14px]", closed && "text-[#37352f]/55")}
    >
      <span role="cell" className="min-w-0">
        <Link
          to="/buyer-requirements/$id"
          params={{ id: match.buyerReqId }}
          className={cn("block truncate font-medium text-[#37352f]", linkClassName, closed && "text-[#37352f]/55")}
        >
          {buyer}
        </Link>
      </span>
      <span role="cell" className="flex min-w-0 items-center gap-1.5">
        {showType && match.listing && <TypeChip type={match.listing.transactionType} />}
        <span className="truncate tabular-nums text-[#37352f]/80">{budget && budget !== "—" ? budget : "예산 미정"}</span>
      </span>
      <span role="cell" className="min-w-0">
        <MatchStagePicker match={match} disabled={isUpdating} onChange={onStageChange} />
      </span>
      <span role="cell" className="min-w-0 truncate text-[13px] text-[#37352f]/65" title={match.memo ?? undefined}>
        {match.memo?.trim() || <span className="text-[#37352f]/30">—</span>}
      </span>
    </div>
  );
}

function ClosedToggle({ open, onToggle, note }: { open: boolean; onToggle: () => void; note: string }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="-ml-0.5 mt-1 inline-flex h-6 items-center gap-1 rounded pl-0.5 pr-1.5 text-[12.5px] text-[#37352f]/65 hover:bg-[#37352f]/[0.06] hover:text-[#37352f]"
    >
      <ChevronRight className={cn("size-3.5 text-[#37352f]/45 transition-transform", open && "rotate-90")} />
      {note}
    </button>
  );
}

function LoadFailedLine({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <p className={cn("border-t border-[#e9e9e7] pt-2", mutedClassName)}>
      {what} 불러오지 못했습니다.{" "}
      <button type="button" className="underline underline-offset-2 hover:text-[#37352f]" onClick={onRetry}>
        다시 시도
      </button>
    </p>
  );
}

/**
 * 매칭 단계를 그 자리에서 바꾸는 고르기. 값과 낱말은 희망매물 화면의 것(단계 이름 · 종료 단추 이름 ·
 * 다시 시작)을 그대로 쓴다. 거래로 넘긴 매칭은 바꾸지 않는다(진행은 거래 화면이 맡는다 — 서버도 막는다).
 */
export function MatchStagePicker({
  match,
  disabled,
  onChange,
}: {
  match: Match;
  disabled: boolean;
  onChange: (match: Match, stage: string) => void;
}) {
  const stage = normalizeMatchStage(match.stage);
  const closed = stage === MatchStage.CLOSED;
  const activeDeal = getActiveDealLink(match);
  if (stage === MatchStage.DEAL_CREATED && activeDeal) {
    return (
      <Link
        to="/deals/$id"
        params={{ id: activeDeal.id }}
        title="거래로 넘긴 매칭입니다. 진행은 거래 화면에서 합니다"
        className="inline-flex items-center gap-1 rounded hover:opacity-80"
      >
        <StatusBadge kind="matchStage" status={stage} size="sm" />
        <ExternalLink className="size-3 text-[#37352f]/45" />
      </Link>
    );
  }
  const copy = getMatchStageActionCopy(stage);
  const resumeStage = match.closedFromStage ? normalizeMatchStage(match.closedFromStage) : MatchStage.SUGGESTED;
  const requirementCompleted = match.buyerRequirement?.status === "completed";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        aria-label={`매칭 단계 ${getMatchStageLabel(stage)}, 바꾸기`}
        className="-ml-1 inline-flex h-7 items-center gap-0.5 rounded px-1 hover:bg-[#37352f]/[0.06] disabled:opacity-50 data-[state=open]:bg-[#37352f]/[0.06]"
      >
        <StatusBadge kind="matchStage" status={stage} size="sm" />
        <ChevronDown className="size-3 text-[#37352f]/45" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {closed ? (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              종료된 매칭 · {getMatchClosedReasonText(match) ?? "직접 종료"}
            </DropdownMenuLabel>
            <DropdownMenuItem
              disabled={requirementCompleted}
              title={
                requirementCompleted
                  ? "완료한 손님입니다. 손님 상태를 활성으로 바꾼 뒤 다시 시작해 주세요"
                  : undefined
              }
              onSelect={() => onChange(match, resumeStage)}
            >
              {match.closedFromStage
                ? `${getMatchStageLabel(resumeStage)}에서 다시 시작`
                : "내부 후보에서 다시 시작"}
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">단계 바꾸기</DropdownMenuLabel>
            {matchBoardStages.map((option) => (
              <DropdownMenuItem
                key={option}
                onSelect={() => {
                  if (option !== stage) onChange(match, option);
                }}
              >
                <StatusBadge kind="matchStage" status={option} size="sm" />
                <span className="flex-1" />
                {option === stage && <Check className="size-3.5 text-muted-foreground" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(match, MatchStage.DEAL_CREATED)}>
              거래 전환…
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => onChange(match, MatchStage.CLOSED)}>
              {copy?.closeLabel ?? "이 단계에서 종료"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── 거래·보수 ───────────────────────────────────────────────────

const DEAL_STAGE_TRACK = PIPELINE_STEPS.dealStage ?? [];
/** 이미 끝났거나 접은 청구는 이 거래의 수수료로 보지 않는다(거래 화면과 같다) */
const INACTIVE_COMMISSION_STATUSES = new Set(["cancelled"]);

/**
 * 이 프로젝트의 의뢰 · 단계에 걸린 거래마다: 단계, 대금 일정, 중개보수.
 * 보수는 서버가 주는 것만 보여 준다 — 중개사에게는 담당 거래의 수수료만 내려오고(commissionHidden),
 * 화면에서 계산해 채우지 않는다. 고치는 일은 "거래 열기"로 거래 화면에서 한다.
 */
export function ProjectDealsTab({ steps }: { steps: readonly ProjectStep[] }) {
  const deals = collectProjectDeals(steps);
  if (deals.length === 0) {
    return (
      <EmptyTab>
        이 프로젝트의 의뢰에 걸린 거래가 없습니다. 매칭에서 거래 전환하거나 거래관리에서 거래를 만들면 여기에
        나옵니다.
      </EmptyTab>
    );
  }
  return (
    <div data-project-deals-tab className="space-y-3.5">
      {deals.map(({ deal, step }) =>
        deal.isCancelled ? (
          <CancelledDealBlock key={deal.id} deal={deal} stepTitle={step.title} />
        ) : (
          <DealBlock key={deal.id} deal={deal} stepTitle={step.title} />
        ),
      )}
    </div>
  );
}

function dealAmount(deal: ProjectStepDeal) {
  return describeTerms({
    transactionType: deal.transactionType,
    price: deal.agreedPrice,
    deposit: deal.agreedDeposit,
    monthlyRent: deal.agreedMonthlyRent,
  });
}

function DealBlock({ deal, stepTitle }: { deal: ProjectStepDeal; stepTitle: string }) {
  // 단계 펼침과 같은 이름표라 읽어 둔 것을 함께 쓴다.
  const dealQuery = useQuery({
    ...dealQueries.detail(deal.id),
    ...FRESH_ON_RETURN,
  });
  const payments = orderPayments(dealQuery.data?.payments ?? []);
  const isLease = deal.transactionType === "jeonse" || deal.transactionType === "monthly";
  const currentIndex = DEAL_STAGE_TRACK.indexOf(deal.stage);

  return (
    <section data-project-deal-block className={GROUP_BOX_CLASS}>
      <GroupHead
        sub={stepTitle}
        action={
          <Link to="/deals/$id" params={{ id: deal.id }} className={cn(nb.line, "h-7 text-[13px]")}>
            거래 열기
            <ChevronRight className="!size-3.5" />
          </Link>
        }
      >
        <span className="truncate">{deal.propertyLabel ?? "매물"}</span>
        <TypeChip type={deal.transactionType} />
        <span className="tabular-nums">{dealAmount(deal)}</span>
        <StatusBadge kind="dealStage" status={deal.stage} size="sm" />
      </GroupHead>
      {(deal.sellerName || deal.buyerName) && (
        <p className={cn("-mt-0.5", mutedClassName)}>
          {isLease ? "임대인" : "매도인"} {deal.sellerName ?? "—"} → {isLease ? "임차인" : "매수인"}{" "}
          {deal.buyerName ?? "—"}
        </p>
      )}

      {/* 거래 단계 띠: 칸 6개, 지금 단계만 채운 파랑, 지난 단계는 옅은 파랑 */}
      <ol
        data-project-deal-stage
        aria-label="거래 단계"
        className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6"
      >
        {DEAL_STAGE_TRACK.map((stage, index) => (
          <li
            key={stage}
            aria-current={index === currentIndex ? "step" : undefined}
            className={cn(
              "flex h-8 items-center justify-center truncate rounded-md px-1.5 text-[12.5px]",
              index === currentIndex
                ? "bg-info font-semibold text-white"
                : index < currentIndex
                  ? "bg-info-soft/60 text-info-strong"
                  : "bg-secondary text-[#37352f]/50",
            )}
          >
            {getStatusMeta("dealStage", stage).label}
          </li>
        ))}
      </ol>

      <div className="mt-3.5 grid gap-x-6 gap-y-3.5 md:grid-cols-2">
        <div data-project-deal-payments className="min-w-0">
          <p className="mb-1.5 text-[13px] font-semibold text-[#37352f]/75">대금 일정</p>
          {dealQuery.isPending ? (
            <Skeleton className="h-5 w-full max-w-[320px]" />
          ) : !dealQuery.data ? (
            <span className={mutedClassName}>
              대금 일정을 불러오지 못했습니다.{" "}
              <button
                type="button"
                className="underline underline-offset-2 hover:text-[#37352f]"
                onClick={() => void dealQuery.refetch()}
              >
                다시 시도
              </button>
            </span>
          ) : payments.length > 0 ? (
            <div className="text-[14px] leading-[21px]">
              <PaymentSchedule payments={payments} />
            </div>
          ) : (
            <span className={mutedClassName}>
              등록한 대금 일정이 없습니다.
              {deal.balanceDate ? ` 계약서의 잔금일은 ${formatDate(deal.balanceDate)}입니다.` : ""}
            </span>
          )}
        </div>

        <div data-project-deal-commission className="min-w-0">
          <p className="mb-1.5 text-[13px] font-semibold text-[#37352f]/75">중개보수</p>
          <div className="text-[14px] leading-[21px]">
            {dealQuery.isPending ? (
              <Skeleton className="h-5 w-full max-w-[320px]" />
            ) : !dealQuery.data ? (
              <span className={mutedClassName}>—</span>
            ) : dealQuery.data.commissionHidden ? (
              <span className={mutedClassName}>담당 거래가 아니라 수수료를 볼 수 없습니다.</span>
            ) : (
              <CommissionLines
                payments={(dealQuery.data.commissionPayments ?? []).filter(
                  (payment) => !INACTIVE_COMMISSION_STATUSES.has(payment.status),
                )}
                isLease={isLease}
              />
            )}
          </div>
        </div>
      </div>
      {dealQuery.data && dealQuery.isError && (
        <RefreshFailedNote what="최신 거래 내용을" onRetry={() => void dealQuery.refetch()} className="mt-1" />
      )}
    </section>
  );
}

const SIDE_ORDER = ["seller", "buyer"];
/** 아직 받을 돈이 남은 청구 */
const OPEN_COMMISSION_STATUSES = new Set(["draft", "pending", "partial", "overdue"]);
const CLIENT_SIDE_LABELS: Record<string, string> = { seller: "매도측", buyer: "매수측" };
const LEASE_SIDE_LABELS: Record<string, string> = { seller: "임대인측", buyer: "임차인측" };

/** 청구 한 줄씩: 받을 쪽 · 청구액(부가세 별도) · 받은 금액 · 수금 상태 · 받기로 한 날. 금액은 만원(거래 화면과 같다). */
function CommissionLines({ payments, isLease }: { payments: CommissionPayment[]; isLease: boolean }) {
  if (payments.length === 0) {
    return <span className={mutedClassName}>아직 청구가 없습니다. 거래 화면의 수수료에서 정합니다.</span>;
  }
  const sides = isLease ? LEASE_SIDE_LABELS : CLIENT_SIDE_LABELS;
  // 매도(임대인)측이 먼저 — 거래 화면의 수수료와 같은 순서
  const ordered = [...payments].sort(
    (left, right) => SIDE_ORDER.indexOf(left.clientSide) - SIDE_ORDER.indexOf(right.clientSide),
  );
  return (
    <ul className="inline-grid grid-cols-[max-content_max-content_max-content_max-content] items-center gap-x-4 gap-y-1 tabular-nums">
      {ordered.map((payment) => {
        // 받기로 한 날은 아직 받을 돈이 있을 때만 적는다(면제 · 다 받은 청구에는 적지 않는다).
        const due = OPEN_COMMISSION_STATUSES.has(payment.status)
          ? (payment.agreedRemainingDate ?? payment.dueDate)
          : null;
        return (
          <li key={payment.id} data-project-commission className="contents">
            <span className="text-[#37352f]">
              {sides[payment.clientSide] ?? payment.clientSide}
              {payment.collectedByOffice === "partner" && (
                <span className="text-[12.5px] text-[#37352f]/45"> · 상대 사무소가 받음</span>
              )}
            </span>
            <span className="text-right font-semibold text-[#37352f]">
              {formatMoney(payment.expectedAmount)}
              <span className="ml-1 text-[12px] font-normal text-[#37352f]/45">부가세 별도</span>
            </span>
            <StatusBadge kind="commissionStatus" status={payment.status} size="sm" />
            <span className="text-[13px] text-[#37352f]/55">
              {payment.status === "collected" || payment.status === "partial"
                ? payment.actualAmount != null
                  ? `${formatMoney(payment.actualAmount)} 받음`
                  : ""
                : due
                  ? `${formatRelativeDay(due)}까지`
                  : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function CancelledDealBlock({ deal, stepTitle }: { deal: ProjectStepDeal; stepTitle: string }) {
  return (
    <section data-project-deal-block="cancelled" className={cn(GROUP_BOX_CLASS, "bg-white/70 text-[#37352f]/55")}>
      <GroupHead
        sub={stepTitle}
        action={
          <Link to="/deals/$id" params={{ id: deal.id }} className={cn(nb.ghost, "h-6 px-1.5 text-[12.5px]")}>
            거래 열기
            <ChevronRight className="!size-3.5" />
          </Link>
        }
      >
        <span className="truncate font-medium text-[#37352f]/55">{deal.propertyLabel ?? "매물"}</span>
        <Tag className="text-[12px]">거래 취소</Tag>
        <span className="tabular-nums font-normal">{dealAmount(deal)}</span>
      </GroupHead>
      <p className={mutedClassName}>
        {[deal.cancelledAt ? `${formatRelativeDay(deal.cancelledAt)} 취소` : "취소됨", deal.cancelReason?.trim()]
          .filter(Boolean)
          .join(" · ")}
      </p>
    </section>
  );
}

// ── 자료실 (데모) ───────────────────────────────────────────────

const DEMO_FILES = [
  { icon: FileText, kind: "계약 관련", name: "예시) 매매계약서 초안.pdf" },
  { icon: FileText, kind: "등기 · 대장", name: "예시) 등기사항전부증명서.pdf" },
  { icon: FileImage, kind: "현장 사진", name: "예시) 거실 사진.jpg" },
  { icon: FileAudio, kind: "녹음", name: "예시) 통화 녹음.m4a" },
] as const;

/**
 * 자료실은 아직 연결하지 않았다(파일은 나중에 S3에 연결 — 사용자 결정). 화면에는 무엇이 들어올 자리인지
 * 보이도록 흐린 예시만 둔다. 누를 수 없고 저장되는 것도 없다. 실제 자료로 보이지 않게 이름마다 "예시)"를 붙인다.
 */
export function ProjectFilesDemo() {
  return (
    <section data-project-files-demo className={GROUP_BOX_CLASS}>
      <p className="flex items-start gap-2 rounded bg-[rgb(247,246,243)] px-3 py-2.5 text-[13.5px] leading-5 text-[#37352f]">
        <Info className="mt-0.5 size-4 shrink-0 text-[#37352f]/45" />
        <span className="break-keep">
          예시 화면입니다. 파일 올리기는 준비 중입니다. 계약서 · 등기부 · 현장 사진 · 통화 녹음처럼 이 프로젝트의
          자료를 여기에 모아 두게 됩니다.
        </span>
      </p>
      <div
        aria-hidden="true"
        className="pointer-events-none mt-3 grid select-none grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 opacity-50"
      >
        {DEMO_FILES.map((file) => (
          <div key={file.name} className="rounded-md p-3 shadow-[inset_0_0_0_1px_#e9e9e7]">
            <div className="grid h-16 place-items-center rounded bg-[rgb(247,246,243)]">
              <file.icon className="size-6 text-[#37352f]/35" />
            </div>
            <p className="mt-2 text-[12px] text-[#37352f]/55">{file.kind}</p>
            <p className="truncate text-[13px] text-[#37352f]">{file.name}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

import { Link } from "@tanstack/react-router";
import { Fragment, type ReactNode } from "react";
import {
  EllipsisVertical,
  GitBranch,
  Pencil,
  PhoneCall,
  SquareArrowOutUpRight,
} from "lucide-react";
import type { BuyerRequirement } from "@estate-erp/api-client";
import { cn } from "@/lib/utils";
import { formatDate, formatPhone } from "@/lib/format";
import { normalizeBuyerStatus, STATUS_CONFIG } from "@/lib/status-config";
import { StatusBadge } from "@/components/domain";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  EditableCell,
  TextCell,
  type ChipOption,
} from "@/components/data-table";
import {
  formatAreaRange,
  formatCompactMoneyRange,
  regionLabels,
  siteLabels,
  siteTypeSummary,
} from "./-buyer-utils";
import {
  buyerBudgetBoundaryValue,
  type BuyerRequirementGroup,
} from "./-buyer-ledger";
import {
  BUYER_INTENT_LINE_HEIGHT,
  BuyerCollapsibleLine,
  useBuyerGroupLinesOpen,
  useBuyerListDensity,
} from "./-buyer-list-panels";

export const BUYER_PARTICIPANT_ROLE_LABELS: Record<string, string> = {
  buyer: "매수자",
  co_buyer: "공동매수",
  representative: "대리",
  supporter: "지원",
  advisor: "자문",
  other: "참여",
};

/* ── 인라인 칩 선택 (상태/긴급도) ── */

export type BuyerInlineField = "status" | "urgency";

const buyerStatusChipClasses: Record<string, string> = {
  active: "bg-success-soft text-success",
  hold: "bg-warning-soft text-warning",
  completed: "bg-neutral-soft text-neutral-strong",
};
const buyerUrgencyChipClasses: Record<string, string> = {
  urgent: "bg-destructive-soft text-destructive",
  normal: "bg-neutral-soft text-muted-foreground",
  flexible: "bg-info-soft text-info",
};
const buyerStatusChipOptions: ChipOption[] = Object.entries(
  STATUS_CONFIG.buyerStatus,
).map(([value, meta]) => ({
  value,
  label: meta.label,
  className: buyerStatusChipClasses[value],
}));
const buyerUrgencyChipOptions: ChipOption[] = Object.entries(
  STATUS_CONFIG.buyerUrgency,
).map(([value, meta]) => ({
  value,
  label: meta.label,
  className: buyerUrgencyChipClasses[value],
}));

export function BuyerInlineSelectCell({
  requirement,
  field,
  isSaving,
  onSave,
}: {
  requirement: BuyerRequirement;
  field: BuyerInlineField;
  isSaving: boolean;
  onSave: (value: string) => void;
}) {
  const isStatus = field === "status";
  const value = isStatus
    ? (normalizeBuyerStatus(requirement.status) ?? requirement.status)
    : requirement.urgency;
  const kind = isStatus ? "buyerStatus" : "buyerUrgency";
  const options = isStatus ? buyerStatusChipOptions : buyerUrgencyChipOptions;

  return (
    <div
      className={cn(
        "-mx-2.5 flex h-full items-stretch overflow-visible",
        isSaving && "pointer-events-none opacity-60",
      )}
      aria-busy={isSaving || undefined}
      title={isStatus ? "상태 변경" : "긴급도 변경"}
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <EditableCell
        recordId={requirement.id}
        field={field}
        value={value}
        chipValueOf={(currentValue) => String(currentValue ?? "")}
        onSave={(_recordId, _field, nextValue) => onSave(String(nextValue))}
        editType="select-chip"
        chipOptions={options}
      >
        <span className="flex h-full w-full items-center px-2.5">
          <StatusBadge kind={kind} status={value} size="table" />
        </span>
      </EditableCell>
    </div>
  );
}

/* ── 병합 범위 셀 (예산/보증금 · 월세 · 평형) ── */

/** 예산 범위 — 매매는 매매가, 월세는 보증금 범위를 한 셀에 표시한다. */
export function BuyerBudgetRangeCell({
  requirement,
}: {
  requirement: BuyerRequirement;
}) {
  const text = formatCompactMoneyRange(
    buyerBudgetBoundaryValue(requirement, "min"),
    buyerBudgetBoundaryValue(requirement, "max"),
  );
  if (!text) return <TextCell value="-" muted />;
  return (
    <span
      className="block w-full truncate whitespace-nowrap text-[12.5px] font-semibold tabular-nums text-foreground"
      title={text}
    >
      {text}
    </span>
  );
}

/** 월세 범위 — 월세 요건에만 값이 있으므로 그 외 거래유형은 muted "—". */
export function BuyerMonthlyRentRangeCell({
  requirement,
}: {
  requirement: BuyerRequirement;
}) {
  const text =
    requirement.transactionType === "monthly"
      ? formatCompactMoneyRange(
          requirement.monthlyRentMin,
          requirement.monthlyRentMax,
        )
      : "";
  if (!text) return <TextCell value="-" muted />;
  return (
    <span
      className="block w-full truncate whitespace-nowrap text-[12.5px] font-semibold tabular-nums text-foreground"
      title={text}
    >
      {text}
    </span>
  );
}

/** 공급평형 범위 — "30평 ~ 34평" 한 셀 표기. */
export function BuyerAreaRangeCell({
  requirement,
}: {
  requirement: BuyerRequirement;
}) {
  const text = formatAreaRange(requirement.areaMin, requirement.areaMax);
  if (text === "—") return <TextCell value="-" muted />;
  return (
    <span
      className="block w-full truncate whitespace-nowrap text-[12px] font-medium tabular-nums text-slate-700"
      title={text}
    >
      {text}
    </span>
  );
}

/* ── 요건 라인 공통 래퍼 ── */

export function BuyerIntentLinesCell({
  group,
  mergedWidth,
  childRail = false,
  children,
}: {
  group: BuyerRequirementGroup;
  mergedWidth?: number;
  /** 2번째 요건 라인부터 들여쓰기 + 연결선을 그려 부모-자식 관계를 표시한다 */
  childRail?: boolean;
  children: (requirement: BuyerRequirement, index: number) => ReactNode;
}) {
  const [density] = useBuyerListDensity();
  const [linesOpen] = useBuyerGroupLinesOpen(group.id);
  const lineHeight = BUYER_INTENT_LINE_HEIGHT[density];
  // 간결 모드는 요건당 한 줄 — 선호 조건 컨텍스트 줄을 렌더링하지 않는다
  const showContext = density === "detailed";

  const renderBlock = (requirement: BuyerRequirement, index: number) => {
    const isChild = index > 0;
    return (
      <div className="relative min-w-0">
        {childRail && isChild && (
          <span
            aria-hidden="true"
            className="absolute bottom-0 left-[19px] top-0 w-px bg-[#e3e2df]"
          />
        )}
        <div
          data-buyer-ledger-intent-line={requirement.id}
          className={cn(
            "flex min-w-0 items-center px-2.5",
            childRail && isChild && "pl-8",
          )}
          style={{ height: lineHeight }}
        >
          {children(requirement, index)}
        </div>
        {showContext && mergedWidth !== undefined && (
          <div
            data-buyer-ledger-context-cell={requirement.id}
            className="pointer-events-none absolute left-0 z-[4] flex min-w-0 items-center border-r border-[#eeeeec] bg-[#faf9f6] shadow-[inset_0_1px_0_#eeeeec,inset_0_-1px_0_#eeeeec]"
            style={{
              top: lineHeight,
              width: mergedWidth,
              height: lineHeight,
            }}
          >
            <BuyerPreferenceContext requirement={requirement} />
          </div>
        )}
        {showContext && (
          <div
            aria-hidden="true"
            data-buyer-ledger-context-slot={requirement.id}
            className="bg-[#faf9f6] shadow-[inset_0_1px_0_#eeeeec,inset_0_-1px_0_#eeeeec]"
            style={{ height: lineHeight }}
          />
        )}
      </div>
    );
  };

  return (
    <div
      className="relative -mx-2.5 min-w-0"
      data-buyer-ledger-intent-lines={group.id}
    >
      {group.requirements.map((requirement, index) =>
        index === 0 ? (
          <Fragment key={requirement.id}>
            {renderBlock(requirement, index)}
          </Fragment>
        ) : (
          <BuyerCollapsibleLine key={requirement.id} open={linesOpen}>
            {renderBlock(requirement, index)}
          </BuyerCollapsibleLine>
        ),
      )}
    </div>
  );
}

function BuyerPreferenceContext({
  requirement,
}: {
  requirement: BuyerRequirement;
}) {
  const regions = [...new Set(regionLabels(requirement))];
  const sites = [...new Set(siteLabels(requirement))];
  const locationParts = [
    regions.length ? `지역 ${regions.join(" · ")}` : "",
    sites.length ? `단지 ${sites.join(" · ")}` : "",
  ].filter(Boolean);
  const locationText = locationParts.join("  ·  ") || "지역·단지 미지정";
  const typeText = siteTypeSummary(requirement);
  const moveInText = requirement.moveInDate
    ? `입주 ${formatDate(requirement.moveInDate)}`
    : "";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 px-3 text-[11.5px] text-slate-600">
      <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />
      <span className="shrink-0 font-semibold text-blue-700">선호</span>
      <span className="min-w-0 flex-1 truncate" title={locationText}>
        {locationText}
      </span>
      {typeText !== "—" && (
        <>
          <span className="h-3 w-px shrink-0 bg-[#dededb]" />
          <span className="max-w-40 shrink truncate" title={typeText}>
            유형 {typeText}
          </span>
        </>
      )}
      {moveInText && (
        <>
          <span className="h-3 w-px shrink-0 bg-[#dededb]" />
          <span className="shrink-0 tabular-nums">{moveInText}</span>
        </>
      )}
    </div>
  );
}

/* ── 고객 · 요건 요약 · 매칭 · 액션 ── */

export function BuyerGroupCustomerCell({
  group,
}: {
  group: BuyerRequirementGroup;
}) {
  const primary = group.primaryParticipant;
  if (!primary?.contact)
    return <span className="text-[13px] text-muted-foreground">—</span>;
  const contact = primary.contact;
  const otherParticipants = group.contacts.filter(
    (participant) => participant.contactId !== primary.contactId,
  );
  const otherParticipantText = otherParticipants
    .map((participant) => {
      const role =
        BUYER_PARTICIPANT_ROLE_LABELS[participant.role] ?? participant.role;
      return `${role} ${participant.contact?.name ?? "이름 없음"}`;
    })
    .join(" · ");

  return (
    <div
      className="flex min-w-0 items-start gap-2 py-1"
      data-buyer-intake-cell={group.buyerIntakeId}
      title={group.memo || undefined}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-[#f2f1ed] text-[11px] font-semibold text-slate-600">
        {contact.name.slice(0, 1)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link
            to="/contacts/$id"
            params={{ id: contact.id }}
            onClick={(event) => event.stopPropagation()}
            className="min-w-0 truncate text-[13px] font-semibold text-foreground hover:underline"
          >
            {contact.name}
          </Link>
          <StatusBadge
            kind="intakeLifecycle"
            status={group.lifecycleStatus}
            size="sm"
          />
        </div>
        {/* 전화번호는 고객 셀 보조 라인으로 병합 — 별도 컬럼을 두지 않는다. */}
        <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
          {contact.phone && (
            <>
              <span className="tabular-nums text-slate-600">
                {formatPhone(contact.phone)}
              </span>
              <span className="px-1 text-border">·</span>
            </>
          )}
          <span>
            {BUYER_PARTICIPANT_ROLE_LABELS[primary.role] ?? primary.role}
          </span>
          <span className="px-1 text-border">·</span>
          <span className="tabular-nums">요건 {group.requirements.length}</span>
        </div>
        {otherParticipants.length > 0 && (
          <div
            className="mt-0.5 truncate text-[10.5px] text-slate-500"
            data-buyer-intake-participants={group.buyerIntakeId}
            title={otherParticipantText}
          >
            함께 {otherParticipantText}
          </div>
        )}
      </div>
    </div>
  );
}

export function BuyerIntentSummary({
  requirement,
  index,
}: {
  requirement: BuyerRequirement;
  index: number;
}) {
  const priorityRank = requirement.priorityRank || index + 1;
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="size-1.5 shrink-0 rounded-full bg-blue-500" />
      <span
        className="shrink-0 text-[12px] font-semibold text-blue-700"
        data-buyer-priority-rank={priorityRank}
        title={`${priorityRank}순위 희망조건`}
      >
        구함 {priorityRank}
      </span>
      {requirement.transactionType ? (
        <StatusBadge
          kind="transactionType"
          status={requirement.transactionType}
          size="table"
        />
      ) : (
        <span className="text-[12px] text-muted-foreground">—</span>
      )}
    </div>
  );
}

export function BuyerMatchCell({
  requirement,
}: {
  requirement: BuyerRequirement;
}) {
  const count = requirement._count?.matches ?? 0;
  if (!count)
    return <span className="text-[12px] text-muted-foreground">—</span>;

  return (
    <span className="inline-flex h-5 items-center gap-1 rounded bg-blue-50 px-1.5 text-[11px] font-semibold tabular-nums text-blue-700">
      <GitBranch className="size-3" />
      매칭 {count}건
    </span>
  );
}

export function BuyerRequirementActionMenu({
  label,
  onOpen,
  onContact,
  onEdit,
}: {
  label: string;
  onOpen: () => void;
  onContact: () => void;
  onEdit: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${label} 작업 메뉴`}
          title="요건 작업 메뉴"
          className="mx-auto text-[#627d98] hover:bg-[#eef1f3] hover:text-slate-900 data-[state=open]:bg-[#eef1f3] data-[state=open]:text-slate-900"
          onClick={(event) => event.stopPropagation()}
        >
          <EllipsisVertical className="size-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-40"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem onClick={onOpen}>
          <SquareArrowOutUpRight className="size-3.5" />
          상세 열기
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onContact}>
          <PhoneCall className="size-3.5" />
          연락함 기록
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="size-3.5" />
          조건 수정
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BuyerHeaderLabel({
  icon,
  label,
}: {
  icon?: ReactNode;
  label: string;
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-[12px] font-normal text-muted-foreground">
      {icon && (
        <span className="shrink-0 [&>svg]:size-3.5 [&>svg]:text-muted-foreground/70">
          {icon}
        </span>
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

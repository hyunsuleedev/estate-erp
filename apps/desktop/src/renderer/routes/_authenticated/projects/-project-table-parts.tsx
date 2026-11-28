import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import type { ListingIntake, ListingIntakeListing } from "@estate-erp/api-client";
import { formatPrice, IntakeClosedReason, ListingAvailability } from "@estate-erp/shared";
import { cn } from "@/lib/utils";
import { getStatusMeta } from "@/lib/status-config";
import type { ListingSummary, PropertyListingGroup } from "../properties/-components/property-listings-table";
import { getConfirmCellModel, type ConfirmCellTone } from "../properties/-components/property-confirm-cell-state";
import { PropertyAdPanelContent } from "../properties/-components/property-ad-panel-content";
import type { AdTableControls } from "../properties/-components/property-ad-table-state";
import { getListingPrimaryPrice, getMoveInAvailability } from "../properties/-property-list-view-utils";
import { PROPERTY_LISTING_ITEM_HEIGHT } from "../properties/-property-table-metrics";

/*
 * 매물관리 표(properties/index.tsx)의 칸 부품을 프로젝트 단계 카드로 옮긴 것.
 *
 * 그 파일의 칸 부품(TransactionBadge · StatusIndicator · PriceDepositValue · MoveInAvailableSummary · ListingPanelToggle ·
 * IntakeConfirmationCell · PropertyAdPanel …)과 묶음 만들기(buildPropertyListingGroups · toListingSummary)는 export되어 있지 않아
 * 가져올 수 없다. 그래서 치수 · 색 · 글자를 원본에서 그대로 옮겼다(지어내지 않는다). 원본이 바뀌면 같이 바꾼다.
 * 매물관리 쪽이 이 부품들을 export하면 이 파일은 그것으로 바꾸고 지운다.
 *
 * 값을 고치는 칸(가격 · 매물상태 · 입주가능일 · 확인 기록)은 매물관리 화면의 일이다. 여기서는 보이기만 하고
 * 고치는 길은 ↗(매물 화면)과 아래 매칭 패널(매물관리의 것을 그대로)이다.
 */

// ── 표의 칸 · 머리 (property-listings-table.tsx의 th · td와 같은 글자 · 선) ─────────────

/** 머리 칸: 36px, 13px 흐린 글자, 아래 선 */
export const TABLE_HEADER_CELL =
  "flex h-9 min-w-0 items-center px-2.5 text-left text-[13px] font-normal leading-[21px] text-muted-foreground";
/** 값 칸: 14px · 굵기 450 · 줄 높이 21px */
export const TABLE_BODY_CELL =
  "relative flex min-w-0 items-center px-2.5 text-[14px] font-[450] leading-[21px] text-foreground";
/** 칸 사이 옅은 세로선(마지막 칸은 없다) */
export const TABLE_CELL_DIVIDER = "border-r border-r-[#eeeeec]";

/** 머리의 칸 이름: 16px 아이콘(#8e8b86) + 13px 이름 (properties/index.tsx TableHeaderLabel) */
export function TableHeaderLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-normal leading-[21px] text-inherit">
      <span aria-hidden="true" className="shrink-0 [&>svg]:size-4 [&>svg]:text-[#8e8b86]">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

// ── 거래유형 꼬리표 ───────────────────────────────────────────────

const transactionTypeMeta: Record<string, { label: string; className: string }> = {
  sale: { label: "매매", className: "bg-[#fdebec] text-[#8f4b46]" },
  jeonse: { label: "전세", className: "bg-[#e7f3f8] text-[#337ea9]" },
  monthly: { label: "월세", className: "bg-[#fbf3db] text-[#8f6b1f]" },
};

export function TransactionBadge({ transactionType, className }: { transactionType: string; className?: string }) {
  const meta = transactionTypeMeta[transactionType];
  return (
    <span
      className={cn(
        "inline-flex max-w-full rounded-[4px] px-1.5 py-0.5 text-[12px] font-medium leading-5",
        meta?.className ?? "bg-[#f1f1ef] text-[#787774]",
        className,
      )}
    >
      {meta?.label ?? transactionType}
    </span>
  );
}

export function TransactionMiniLabel({ transactionType, className }: { transactionType: string; className?: string }) {
  const meta = transactionTypeMeta[transactionType];
  return (
    <span
      className={cn(
        "inline-flex min-w-8 shrink-0 items-center justify-center rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium leading-5",
        meta?.className ?? "bg-[#f1f1ef] text-[#787774]",
        className,
      )}
    >
      {meta?.label ?? transactionType}
    </span>
  );
}

/** 거래 칸: 조건마다 꼬리표 하나(여럿이면 줄을 바꿔 쌓인다) */
export function TransactionStack({ listings }: { listings: ListingSummary[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 py-1">
      {listings.map((listing) => (
        <div key={listing.id} className="flex items-center gap-1">
          <TransactionBadge transactionType={listing.transactionType} className="h-5 py-0 text-[14px] font-[450] leading-5" />
        </div>
      ))}
    </div>
  );
}

// ── 매물상태 알약 ─────────────────────────────────────────────────

const listingAvailabilityMeta: Record<string, { label: string; dotClassName: string; pillClassName: string }> = {
  [ListingAvailability.AVAILABLE]: {
    label: "활성",
    dotClassName: "bg-[#6c9b7a]",
    pillClassName: "bg-[#eef3ed] text-[#44745a]",
  },
  [ListingAvailability.PAUSED]: {
    label: getStatusMeta("listingAvailability", ListingAvailability.PAUSED).label,
    dotClassName: "bg-[#dfab01]",
    pillClassName: "bg-[#fbf3db] text-[#9f6b00]",
  },
  [ListingAvailability.IN_CONTRACT]: {
    label: getStatusMeta("listingAvailability", ListingAvailability.IN_CONTRACT).label,
    dotClassName: "bg-[#529cca]",
    pillClassName: "bg-[#e7f3f8] text-[#337ea9]",
  },
  [ListingAvailability.CLOSED]: {
    label: getStatusMeta("listingAvailability", ListingAvailability.CLOSED).label,
    dotClassName: "bg-[#b4b4b1]",
    pillClassName: "bg-[#f1f1ef] text-[#787774]",
  },
};

/** 종료 알약의 올렸을 때 글 (properties/index.tsx getClosedStatusLabel) */
export function getClosedStatusLabel(closedReason?: string | null) {
  const labels: Record<string, string> = {
    [IntakeClosedReason.DEAL_COMPLETED]: "종료 · 우리 거래",
    [IntakeClosedReason.EXTERNAL_DEAL_COMPLETED]: "종료 · 타 거래",
    [IntakeClosedReason.WITHDRAWN]: "종료 · 의뢰 철회",
    [IntakeClosedReason.UNAVAILABLE]: "종료 · 거래 불가",
    [IntakeClosedReason.SUPERSEDED]: "종료 · 의뢰 대체",
    [IntakeClosedReason.OTHER]: "종료 · 기타",
  };
  return (closedReason && labels[closedReason]) || "종료";
}

/** 표의 매물상태 칸에 적는 종료 이름: 우리 거래로 끝났으면 "거래 완료", 나머지는 "종료" */
export function getClosedStatusCellLabel(closedReason?: string | null) {
  return closedReason === IntakeClosedReason.DEAL_COMPLETED ? "거래 완료" : "종료";
}

export function StatusIndicator({ value, label, title }: { value: string; label?: string; title?: string }) {
  const meta = listingAvailabilityMeta[value] ?? {
    label: value,
    dotClassName: "bg-[#b4b4b1]",
    pillClassName: "bg-[#f1f1ef] text-[#5f5e5b]",
  };
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-5 max-w-full items-center gap-[5px] rounded-full pl-[7px] pr-[9px] text-[14px] font-[450] leading-5",
        meta.pillClassName,
      )}
    >
      <span className={cn("size-2 shrink-0 rounded-full", meta.dotClassName)} />
      <span className="truncate">{label ?? meta.label}</span>
    </span>
  );
}

// ── 확인 칸(보이기만) ─────────────────────────────────────────────

const CONFIRM_TONE_CLASSES: Record<ConfirmCellTone, { dot: string; date: string; relative: string }> = {
  none: { dot: "bg-muted-foreground/40", date: "text-muted-foreground", relative: "text-muted-foreground/70" },
  fresh: { dot: "bg-success", date: "text-foreground", relative: "text-muted-foreground" },
  aging: { dot: "bg-warning", date: "text-warning", relative: "text-warning/80" },
  stale: { dot: "bg-destructive", date: "text-destructive", relative: "text-destructive/80" },
};

/** 확인된 날 + 마지막 시도 (매물관리의 확인 칸과 같은 모양. 확인 기록은 매물관리 화면에서 남긴다) */
export function ConfirmationCellView({ intake }: { intake: ListingIntake }) {
  const model = getConfirmCellModel(intake);
  const tone = CONFIRM_TONE_CLASSES[model.tone];
  return (
    <div className="relative flex h-9 min-w-0 items-center gap-1.5" title={model.title}>
      <span className={cn("size-[7px] shrink-0 rounded-full", tone.dot)} />
      <div className="flex min-w-0 flex-col leading-tight">
        <span className={cn("truncate text-[13px] font-[450] leading-4 tabular-nums", tone.date)}>{model.date}</span>
        <span
          className={cn(
            "min-h-[14px] truncate text-[11px] leading-[14px]",
            tone.relative,
          )}
        >
          {model.relative}
        </span>
      </div>
    </div>
  );
}

// ── 조건마다 쌓이는 칸(가격/보증금 · 월세 · 입주가능일) ─────────────────

/** 조건이 여럿이면 조건마다 36px 줄로 나눠 쌓는다(옅은 가로선) */
export function ListingStack({
  listings,
  children,
}: {
  listings: ListingSummary[];
  children: (listing: ListingSummary, hasMultiple: boolean) => ReactNode;
}) {
  const hasMultiple = listings.length > 1;
  return (
    <div
      className={cn("-mx-2.5 flex h-full min-w-0 flex-1 flex-col items-stretch", hasMultiple && "divide-y divide-[#d9d9d6]")}
      style={{ minHeight: Math.max(1, listings.length) * PROPERTY_LISTING_ITEM_HEIGHT }}
    >
      {listings.map((listing) => (
        <div
          key={listing.id}
          className={cn("flex min-w-0 items-center px-2.5", hasMultiple ? "flex-none" : "flex-1")}
          style={hasMultiple ? { height: PROPERTY_LISTING_ITEM_HEIGHT } : undefined}
        >
          {children(listing, hasMultiple)}
        </div>
      ))}
    </div>
  );
}

export function PriceDepositValue({ listing }: { listing: ListingSummary }) {
  const value = getListingPrimaryPrice(listing);
  // 거래가 끝난 조건은 거래가를 앞에, 내놓은 가격은 흐리게 곁에 둔다
  const completed = (listing.deals ?? []).find((deal) => deal.stage === "completed" || deal.stage === "closed");
  const dealValue =
    listing.transactionType === "monthly"
      ? completed?.agreedDeposit
      : (completed?.agreedPrice ?? completed?.agreedDeposit);
  if (completed && dealValue) {
    return (
      <span
        className="flex min-w-0 items-baseline gap-1.5 tabular-nums leading-[21px]"
        title={value ? `내놓은 가격 ${formatPrice(value)}` : undefined}
      >
        <span className="shrink-0 text-[14px] font-[450]">거래가 {formatPrice(dealValue)}</span>
        {value && value !== dealValue ? (
          <span className="min-w-0 truncate text-[12px] text-muted-foreground">{formatPrice(value)}</span>
        ) : null}
      </span>
    );
  }
  return <span className="tabular-nums text-[14px] font-[450] leading-[21px]">{value ? formatPrice(value) : "-"}</span>;
}

export function MonthlyRentValue({ listing }: { listing: ListingSummary }) {
  if (listing.transactionType !== "monthly") {
    return <span className="text-[14px] leading-[21px] text-muted-foreground">-</span>;
  }
  return (
    <span className="tabular-nums text-[14px] font-[450] leading-[21px]">
      {listing.monthlyRent ? formatPrice(listing.monthlyRent) : "-"}
    </span>
  );
}

export function MoveInAvailableSummary({ listing }: { listing: ListingSummary }) {
  const summary = getMoveInAvailability(listing);
  return (
    <div className="flex min-w-0 flex-col gap-0.5 py-1">
      <span
        className={cn(
          "inline-flex h-5 w-fit max-w-full whitespace-nowrap rounded-[4px] px-1.5 text-[14px] font-[450] leading-5",
          summary.className,
        )}
      >
        <span className="truncate">{summary.label}</span>
      </span>
      {summary.detail && <span className="truncate text-[11px] text-muted-foreground">{summary.detail}</span>}
    </div>
  );
}

// ── 매칭 · 광고 펼치기 단추 ──────────────────────────────────────

/** 노션식 칸 단추: 테두리 · 배경 없이 아이콘 + 숫자 + 화살표. 호버 · 열림에만 옅은 배경. */
export function ListingPanelToggle({
  count,
  icon,
  isOpen,
  panelId,
  label,
  onToggle,
}: {
  count: number;
  icon: ReactNode;
  isOpen: boolean;
  panelId: string;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={isOpen}
      aria-controls={panelId}
      aria-label={`${count}건의 ${label} ${isOpen ? "접기" : "펼치기"}`}
      title={isOpen ? `${label} 접기` : `${label} 펼치기`}
      onClick={onToggle}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded px-1 text-[14px] font-[450] leading-[21px] tabular-nums text-foreground transition-colors",
        !isOpen && "hover:bg-foreground/[0.06]",
      )}
    >
      <span className="text-muted-foreground/70 [&_svg]:size-3">{icon}</span>
      {count}
      <ChevronDown
        aria-hidden="true"
        className={cn("size-3 text-muted-foreground/70 transition-transform duration-150", isOpen && "rotate-180")}
      />
    </button>
  );
}

// ── 의뢰 → 표의 한 묶음 (properties/index.tsx buildPropertyListingGroups · toListingSummary) ──────

function toListingSummary(listing: ListingIntakeListing): ListingSummary {
  return {
    id: listing.id,
    intakeId: listing.intakeId,
    transactionType: listing.transactionType,
    price: listing.price,
    deposit: listing.deposit,
    monthlyRent: listing.monthlyRent,
    moveInAvailableType: listing.moveInAvailableType,
    moveInAvailableFrom: listing.moveInAvailableFrom,
    moveInAvailableTo: listing.moveInAvailableTo,
    isPaused: listing.isPaused,
    deals: listing.deals,
    maintenanceFee: listing.maintenanceFee,
    loanAmount: listing.loanAmount,
    memo: listing.memo,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
    activeAdvertisements: listing.activeAdvertisements,
    activeAdvertisementCount: listing.activeAdvertisementCount,
    advertisements: listing.advertisements,
    priceHistories: listing.priceHistories,
    _count: listing._count,
  };
}

const TRANSACTION_ORDER: Record<string, number> = { sale: 0, jeonse: 1, monthly: 2 };

function compareListingSummary(a: ListingSummary, b: ListingSummary) {
  const typeOrder = (TRANSACTION_ORDER[a.transactionType] ?? 99) - (TRANSACTION_ORDER[b.transactionType] ?? 99);
  if (typeOrder !== 0) return typeOrder;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

export function buildListingGroup(intake: ListingIntake): PropertyListingGroup {
  return {
    id: intake.id,
    intakeId: intake.id,
    propertyId: intake.propertyId,
    property: intake.property,
    representative: intake,
    matchedIntakes: [intake],
    listings: (intake.listings ?? []).map(toListingSummary).sort(compareListingSummary),
  };
}

type ListingProperty = PropertyListingGroup["property"];

export function getDongName(property?: ListingProperty) {
  const dong = property?.unit?.dong;
  if (!dong || dong.isPlaceholder) return "-";
  return dong.name.replace(/\s*동$/, "");
}

export function getSupplyAreaPyeong(property?: ListingProperty) {
  const squareMeters = property?.unit?.supplyAreaM2 ?? property?.unit?.siteUnitType?.supplyAreaM2;
  return squareMeters ? `${(Number(squareMeters) * 0.3025).toFixed(0)}평` : "";
}

export function getUnitTypeName(property?: ListingProperty) {
  return property?.unit?.siteUnitType?.name ?? "";
}

export function getPropertyActiveAdvertisementCount(group: PropertyListingGroup) {
  return group.listings.reduce(
    (total, listing) => total + (listing.activeAdvertisementCount ?? listing.activeAdvertisements?.length ?? 0),
    0,
  );
}

// ── 매칭 패널의 "광고" 탭 내용 (공용 PropertyAdPanelContent 사용) ─────────────────

export function ProjectAdPanel({ group, controls }: { group: PropertyListingGroup; controls: AdTableControls }) {
  return <PropertyAdPanelContent group={group} controls={controls} />;
}

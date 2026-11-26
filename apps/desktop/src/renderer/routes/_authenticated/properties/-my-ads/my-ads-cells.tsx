import {
  ADVERTISEMENT_LINK_DETAILS,
  ADVERTISEMENT_LINK_LABELS,
  advertisementLinkLevel,
  advertisementPlace,
  advertisementRawLocationLabel,
  advertisementTransactionType,
  changeRequestSummary,
  failedChangeRequests,
  pendingChangeRequests,
} from "./my-ads-link";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent, MouseEvent, ReactNode, SVGProps } from "react";
import { ArrowUpRight, RotateCcw, X } from "lucide-react";
import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import { cn } from "@/lib/utils";
import { formatDate, formatMoney } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PROPERTY_TABLE_PILL_TONES,
  PROPERTY_TABLE_STATUS_DOT_CLASS_NAME,
  PROPERTY_TABLE_STATUS_PILL_CLASS_NAME,
  PROPERTY_TABLE_TAG_CLASS_NAME,
  PROPERTY_TABLE_TRANSACTION_META,
} from "./my-ads-pill";
import {
  advertisementMonthlyRentLabel,
  advertisementPrimaryAmountLabel,
  advertisementSyncState,
  compactAdvertisementDate,
  cpChannelLabel,
  getCachedComparison,
  resolvedNaverUrl,
  verificationMethodPresentation,
} from "./my-ads-format";
import {
  myAdsAnalysisSignal,
} from "./my-ads-manual-ad-state";
import { advertisementExposureElapsedDays } from "./my-ads-filters";
import { advertisementLocationLabel } from "./my-ads-location";
import { sanitizeManwonInput } from "./my-ads-drafts";
import { useMyAdsTableState } from "./my-ads-table-context";
import {
  currentAmount,
  editBlockReason,
  fieldLabel,
  flagBlockReason,
  isDraftEmpty,
  isValueAsked,
  requestedCellDisplay,
} from "./my-ads-modes";

/** 매물관리 표 머리와 같은 13px/400 글자, 16px 아이콘(#8e8b86). 색은 머리 칸(정렬·hover)을 따른다. */
export function TableHeaderLabel({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span
      data-my-ads-header-label
      title={label}
      className="inline-flex min-w-0 items-center gap-1.5 text-[13px] font-normal leading-[21px] text-inherit"
    >
      <span
        aria-hidden="true"
        className="shrink-0 [&>svg]:size-4 [&>svg]:text-[#8e8b86]"
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

/**
 * 가격·보증금·월세 아이콘. lucide에 원화 기호가 없어 매물관리 필터 줄과 같은 모양을 그린다.
 * 필터 칩·표 머리글·비교 광고 표 머리글이 같은 것을 쓴다.
 */
export function WonCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M8 9l1.5 6L12 10l2.5 5L16 9" />
    </svg>
  );
}

/** 칸 글자는 표 본문(14px/450)을 그대로 쓰고, 넘치면 줄여 title로 전체를 보여 준다. */
export function CellText({
  className,
  title,
  children,
}: {
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn("block truncate whitespace-nowrap", className)}
    >
      {children}
    </span>
  );
}

export function EmptyCellValue() {
  return <span className="text-muted-foreground">—</span>;
}

/**
 * 연결 칸. 광고가 우리 매물과 이어졌는지, 아니면 어디서 끊겼는지를 말한다.
 * 이어진 광고는 매물로 가고, 끊긴 광고는 눌러서 연결 창을 연다.
 */
export function LinkStatusCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const { onOpenLink } = useMyAdsTableState();
  const level = advertisementLinkLevel(advertisement);
  const label = ADVERTISEMENT_LINK_LABELS[level];
  const place = advertisementPlace(advertisement);

  if (level === "listing") {
    const intakeClosed =
      advertisement.status === "active" &&
      advertisement.listing?.intake?.lifecycleStatus === "closed";
    const listingPaused =
      advertisement.status === "active" &&
      Boolean(advertisement.listing?.isPaused);
    const intakeHold =
      advertisement.status === "active" &&
      advertisement.listing?.intake?.lifecycleStatus === "hold";
    const hasActiveDeal =
      advertisement.status === "active" &&
      (advertisement.listing?.deals?.length ?? 0) > 0;
    const statusPillLabel = intakeClosed
      ? "의뢰 종료"
      : hasActiveDeal
        ? "거래 중"
        : intakeHold
          ? "의뢰 보류"
          : listingPaused
            ? "옵션 중단"
            : label;
    const statusPillTone = intakeClosed
      ? PROPERTY_TABLE_PILL_TONES.danger
      : hasActiveDeal || intakeHold || listingPaused
        ? PROPERTY_TABLE_PILL_TONES.warning
        : PROPERTY_TABLE_PILL_TONES.success;
    const pillTitle = intakeClosed
      ? "의뢰가 끝난 매물입니다. 광고를 내리세요. (눌러서 매물 열기)"
      : hasActiveDeal
        ? "거래가 진행 중인 매물입니다. 광고 유지 여부를 확인하세요. (눌러서 매물 열기)"
        : intakeHold
          ? "의뢰가 보류 상태인 매물입니다. (눌러서 매물 열기)"
          : listingPaused
            ? "거래 옵션이 중단된 매물입니다. (눌러서 매물 열기)"
            : "매물 열기";
    const pill = (
      <span className={cn(PROPERTY_TABLE_STATUS_PILL_CLASS_NAME, statusPillTone)}>
        <span className={PROPERTY_TABLE_STATUS_DOT_CLASS_NAME} />
        {statusPillLabel}
      </span>
    );
    return place ? (
      <Link
        to="/properties/$id"
        params={{ id: place.id }}
        title={pillTitle}
        onClick={(event) => event.stopPropagation()}
        className="inline-flex max-w-full rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/35"
      >
        {pill}
      </Link>
    ) : (
      pill
    );
  }

  const rawLocation = advertisementRawLocationLabel(advertisement);
  return (
    <button
      type="button"
      title={`${ADVERTISEMENT_LINK_DETAILS[level]}${rawLocation ? ` CP 표기: ${rawLocation}` : ""}`}
      aria-label={`${advertisementLocationLabel(advertisement)} ${label}, 매물 연결`}
      aria-haspopup="dialog"
      onClick={(event) => {
        event.stopPropagation();
        onOpenLink(advertisement);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        PROPERTY_TABLE_STATUS_PILL_CLASS_NAME,
        "min-w-0 transition-colors hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/35",
        level === "property"
          ? PROPERTY_TABLE_PILL_TONES.warning
          : PROPERTY_TABLE_PILL_TONES.danger,
      )}
    >
      <span className={PROPERTY_TABLE_STATUS_DOT_CLASS_NAME} />
      <span className="truncate">{label}</span>
    </button>
  );
}

/**
 * 요청 칸. 요청이 있다는 것만 표시한다 — 무엇을 요청했는지는 줄을 펼친 요청 탭에서 본다.
 * 작성 중인 초안이 있으면 "작성 중", 보낸 요청이 걸려 있으면 "요청 중"(둘 이상이면 수를 붙인다).
 */
export function ChangeRequestCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const { drafts, expandedIds, onToggleExpanded, onPanelTabChange } =
    useMyAdsTableState();
  const requests = pendingChangeRequests(advertisement);
  const failed = failedChangeRequests(advertisement);
  const isDrafting = !isDraftEmpty(drafts[advertisement.id]);
  if (!isDrafting && requests.length === 0 && failed.length === 0) {
    return <EmptyCellValue />;
  }
  const marker = isDrafting ? "draft" : requests.length > 0 ? "pending" : "failed";
  const label = isDrafting
    ? "작성 중"
    : requests.length > 0
      ? `요청 중${requests.length > 1 ? ` ${requests.length}` : ""}`
      : "요청 실패";
  const title =
    requests.length > 0
      ? requests.map((request) => changeRequestSummary(request)).join("\n")
      : isDrafting
        ? "아직 보내지 않은 요청이 있습니다. 눌러서 확인하세요."
        : failed[0]?.failureReason
          ? `요청 실패: ${failed[0].failureReason}`
          : "실패한 요청이 있습니다. 눌러서 확인하세요.";
  return (
    <button
      type="button"
      data-my-ads-request-marker={marker}
      title={title}
      aria-label={`${advertisementLocationLabel(advertisement)} ${label}, 요청 탭 열기`}
      onClick={(event) => {
        event.stopPropagation();
        onPanelTabChange("requests");
        if (!expandedIds.has(advertisement.id)) {
          onToggleExpanded(advertisement.id, event.currentTarget);
        }
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        PROPERTY_TABLE_STATUS_PILL_CLASS_NAME,
        "transition-opacity hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/35",
        marker === "draft"
          ? PROPERTY_TABLE_PILL_TONES.neutralStrong
          : marker === "failed"
            ? PROPERTY_TABLE_PILL_TONES.danger
            : PROPERTY_TABLE_PILL_TONES.info,
      )}
    >
      <span aria-hidden="true" className={PROPERTY_TABLE_STATUS_DOT_CLASS_NAME} />
      {label}
    </button>
  );
}

export function PropertyTableTransactionBadge({
  transactionType,
}: {
  transactionType: string;
}) {
  const meta = PROPERTY_TABLE_TRANSACTION_META[transactionType];
  return (
    <span
      className={cn(
        PROPERTY_TABLE_TAG_CLASS_NAME,
        meta?.className ?? PROPERTY_TABLE_PILL_TONES.neutral,
      )}
    >
      {meta?.label ?? transactionType}
    </span>
  );
}

export function CpAdvertisementCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const provider = cpChannelLabel(advertisement.channel);
  const syncState = advertisementSyncState(advertisement);
  const accountLabel =
    advertisement.cpAccount?.accountName || advertisement.cpAccount?.accountKey;
  const tooltip = [
    provider,
    accountLabel,
    advertisement.externalAdId,
    syncState === "manual_override" ? "직접 수정됨" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 whitespace-nowrap">
      <span
        title={tooltip}
        className={cn(
          PROPERTY_TABLE_TAG_CLASS_NAME,
          "min-w-0",
          PROPERTY_TABLE_PILL_TONES.neutralStrong,
        )}
      >
        <span className="truncate">{provider}</span>
      </span>
      {syncState === "manual_override" && (
        <span
          title="최근 동기화 이후 직접 수정됨"
          className="size-1.5 shrink-0 rounded-full bg-warning"
        />
      )}
    </span>
  );
}

export function NaverAdvertisementCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const url = resolvedNaverUrl(advertisement);
  if (!advertisement.naverArticleNo || !url) {
    return <EmptyCellValue />;
  }

  const isActive =
    advertisement.comparison?.ownAdvertisement?.isActive ?? true;
  const exposure = isActive ? "게재 중" : "미노출";

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={`네이버 광고 ${advertisement.naverArticleNo} (${exposure}) 새 창에서 열기`}
      aria-label={`${advertisementLocationLabel(advertisement)} 네이버 광고 ${exposure}, 새 창에서 열기`}
      onClick={(event) => event.stopPropagation()}
      // 상자·점 없이 글 링크로 둔다(Notion의 URL 칸처럼 옅은 밑줄 + 나가는 화살표).
      // 게재 여부는 노출 칸이 말하므로 여기서는 미노출일 때 글만 흐리게 한다.
      className={cn(
        "group/naver -mx-1 inline-flex h-6 max-w-full items-center gap-0.5 whitespace-nowrap rounded-[4px] px-1 text-[14px] font-[450] leading-5 transition-colors hover:bg-[rgba(55,53,47,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/35",
        isActive ? "text-foreground" : "text-muted-foreground",
      )}
    >
      <span className="underline decoration-[rgba(55,53,47,0.22)] underline-offset-[3px] group-hover/naver:decoration-[rgba(55,53,47,0.5)]">
        네이버
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="size-3.5 shrink-0 text-muted-foreground/70 group-hover/naver:text-foreground"
        strokeWidth={1.75}
      />
    </a>
  );
}

export function VerificationMethodCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const code =
    advertisement.comparison?.ownAdvertisement
      ?.verificationTypeCode;
  if (!code) return <EmptyCellValue />;

  const presentation = verificationMethodPresentation(code);
  return (
    <span
      title={`${presentation.label} · 네이버 검증 코드 ${code}`}
      className={cn(PROPERTY_TABLE_TAG_CLASS_NAME, presentation.className)}
    >
      <span className="truncate">{presentation.label}</span>
    </span>
  );
}

/** 한 줄: 시작일과 지난 날 수. 전체 기간은 title로 본다. */
export function AdvertisementExposurePeriodCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  if (!advertisement.startedAt && !advertisement.endedAt) {
    return <EmptyCellValue />;
  }

  const elapsedDays = advertisementExposureElapsedDays(advertisement);
  const range = `${
    advertisement.startedAt ? formatDate(advertisement.startedAt) : "시작일 미확인"
  } ~ ${advertisement.endedAt ? formatDate(advertisement.endedAt) : "진행 중"}`;
  return (
    <span
      title={`${range}${elapsedDays != null ? ` · ${elapsedDays}일` : ""} · CP 광고 원장 기준`}
      className="flex min-w-0 items-baseline gap-1 whitespace-nowrap tabular-nums"
    >
      {advertisement.startedAt ? (
        <time dateTime={advertisement.startedAt} className="truncate">
          {compactAdvertisementDate(advertisement.startedAt)}
        </time>
      ) : (
        <span className="truncate text-muted-foreground">
          ~ {compactAdvertisementDate(advertisement.endedAt)}
        </span>
      )}
      {elapsedDays != null && (
        <span className="shrink-0 text-[13px] text-muted-foreground">
          {elapsedDays}일
        </span>
      )}
    </span>
  );
}

const REQUEST_FLAG_LABELS = { readvertise: "재광고", takedown: "내리기" } as const;

/**
 * 재광고 · 내리기 칸. 체크박스는 늘 보이지만 "광고 요청"을 켰을 때만 누를 수 있다
 * (평소에 눌리면 바로 내려가는 줄 안다 — 사용자 결정 2026-11-26).
 * 체크는 요청 초안에 넣는 것이고 요청 탭의 "값 없이 요청"과 같은 값을 본다. 보내기 전에는 아무것도 바뀌지 않는다.
 * 이미 보낸 요청이 걸려 있으면 체크된 채로 잠긴다(거두는 것은 요청 탭에서 한다).
 */
export function RequestFlagCell({
  advertisement,
  flag,
}: {
  advertisement: ListingAdvertisementWithListing;
  flag: "readvertise" | "takedown";
}) {
  const { mode, drafts, onToggleDraftFlag } = useMyAdsTableState();
  const drafted = Boolean(drafts[advertisement.id]?.[flag]);
  const sent = pendingChangeRequests(advertisement).some(
    (request) => request.action === flag,
  );
  const blocked =
    mode === "request"
      ? flagBlockReason(advertisement, flag)
      : "위쪽의 \"광고 요청\"을 켜면 고를 수 있습니다.";
  const label = REQUEST_FLAG_LABELS[flag];
  return (
    <span
      title={sent ? `${label} 요청 중` : (blocked ?? undefined)}
      className="flex w-full items-center justify-center"
      onClick={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <Checkbox
        data-my-ads-request-flag={flag}
        aria-label={`${advertisementLocationLabel(advertisement)} ${label} 요청`}
        checked={drafted || sent}
        disabled={blocked !== null}
        onCheckedChange={() => onToggleDraftFlag(advertisement, flag)}
        className="shadow-none"
      />
    </span>
  );
}

/**
 * 층수노출은 읽기 정보다 — 스위치가 아니라 상태 알약으로 보인다.
 * 칸에 "불리"를 따로 적지 않는다(사용자 결정 2026-11-26). 경쟁 광고가 정확한 층을 공개했다는 사실은
 * 올렸을 때의 설명과 "경쟁 대비" 칸에 남는다.
 */
export function FloorExposureCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const own =
    advertisement.comparison?.ownAdvertisement ?? null;
  const comparison = getCachedComparison(advertisement);
  const exposureMode = own
    ? comparison.ownFloorExposureMode
    : advertisement.floorExposure === "exact" || advertisement.floorExposure === "band"
      ? advertisement.floorExposure
      : "unknown";
  const exposureLabel =
    exposureMode === "exact"
      ? "노출"
      : exposureMode === "band"
        ? "미노출"
        : "미확인";
  const exposureTone =
    exposureMode === "exact"
      ? PROPERTY_TABLE_PILL_TONES.info
      : exposureMode === "band"
        ? PROPERTY_TABLE_PILL_TONES.neutralStrong
        : PROPERTY_TABLE_PILL_TONES.neutral;
  const disadvantage =
    exposureMode === "band" && comparison.exactFloorCompetitorCount > 0;
  const exposureDescription =
    exposureMode === "exact"
      ? "정확한 층 노출"
      : exposureMode === "band"
        ? "저·중·고 구간만 노출"
        : "층 노출 방식 미확인";

  const { mode, drafts, onToggleFloorRequest } = useMyAdsTableState();
  const requested = requestedCellDisplay(advertisement, drafts[advertisement.id], "floorExposure");
  const asked = Boolean(requested) || isValueAsked(advertisement, drafts[advertisement.id], "floorExposure");
  const baseTooltip = `${exposureDescription}${
    disadvantage
      ? ` · 정확한 층을 공개한 경쟁 광고 ${comparison.exactFloorCompetitorCount}건`
      : ""
  }${requested ? ` · 요청: ${requested.text}` : ""}`;
  const content = requested ? (
    <span title={baseTooltip} className="flex min-w-0 flex-col justify-center leading-none">
      <span
        className={cn(
          "inline-flex items-center gap-1 truncate text-[11px] leading-[14px]",
          askedValueClassName,
        )}
      >
        {exposureLabel}
      </span>
      <span
        data-my-ads-requested-value="floorExposure"
        data-request-origin={requested.kind}
        className={cn(
          "truncate text-[11px] font-medium leading-[14px]",
          requested.kind === "draft" ? "text-info" : "text-primary",
        )}
      >
        → {requested.text}
      </span>
    </span>
  ) : (
    <span
      title={baseTooltip}
      // 칸이 좁으면 알약 글자를 말줄임한다(칸 밖으로 넘치지 않는다).
      className="inline-flex min-w-0 max-w-full items-center overflow-hidden whitespace-nowrap"
    >
      <span
        className={cn(
          PROPERTY_TABLE_STATUS_PILL_CLASS_NAME,
          "min-w-0",
          exposureTone,
        )}
      >
        <span aria-hidden="true" className={PROPERTY_TABLE_STATUS_DOT_CLASS_NAME} />
        <span className="truncate">{exposureLabel}</span>
      </span>
    </span>
  );
  // 변경 요청 모드에서만 누를 수 있다. 기록 수정으로는 고치지 않는다(읽어 온 값이다).
  if (mode !== "request") return asked && !requested ? <span className={askedValueClassName}>{content}</span> : content;
  const blocked = editBlockReason(
    advertisement,
    "floorExposure",
    "request",
    drafts[advertisement.id],
  );
  if (blocked) {
    return (
      <span title={blocked} className="cursor-not-allowed opacity-60">
        {content}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-my-ads-cell="floorExposure"
      aria-label={`${advertisementLocationLabel(advertisement)} 층 노출 변경 요청${asked ? " 빼기" : ""}`}
      aria-pressed={drafts[advertisement.id]?.floorExposure !== undefined}
      onClick={(event) => {
        event.stopPropagation();
        onToggleFloorRequest(advertisement);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(editableCellButtonClassName, requested && "h-[33px] py-0.5")}
    >
      {content}
    </button>
  );
}

export function ComparisonSignalCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const signal = myAdsAnalysisSignal(advertisement);
  return (
    <span
      title={signal.detail}
      className={cn(PROPERTY_TABLE_STATUS_PILL_CLASS_NAME, signal.className)}
    >
      <span aria-hidden="true" className={PROPERTY_TABLE_STATUS_DOT_CLASS_NAME} />
      <span className="truncate">{signal.label}</span>
    </span>
  );
}

/** 인라인 입력칸 접근성 이름에 쓰는 금액 이름. 전세는 보증금이 아니라 전세가다. */
export function inlinePrimaryAmountName(transactionType: string): string {
  if (transactionType === "jeonse") return "전세가";
  if (transactionType === "monthly") return "보증금";
  return "가격";
}

/** 바꿔 달라고 한 값: 줄만 긋는다. 무엇으로 바꾸는지는 펼친 요청 탭에서 본다 */
const askedValueClassName =
  "text-muted-foreground line-through decoration-muted-foreground/70";

/** 모드에 들어왔을 때 칸이 버튼이 된다. 칸 전체가 눌리고, 올리면 테두리로 고칠 수 있음을 알린다 */
const editableCellButtonClassName =
  "-mx-1.5 flex h-7 min-w-0 max-w-[calc(100%+12px)] cursor-text items-center rounded-[4px] px-1.5 text-left transition-shadow hover:shadow-[inset_0_0_0_1px_rgba(35,131,226,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/35";

/**
 * 금액 칸(가격/보증금 · 월세). 평소에는 읽기 전용이다.
 * 기록 수정 모드에서는 눌러 고치면 바로 저장되고, 변경 요청 모드에서는 값은 그대로 두고 초안에 적는다.
 * 요청(작성 중이든 보낸 것이든)이 걸린 값에는 줄만 긋는다.
 */
function MoneyCell({
  advertisement,
  field,
  label,
  displayLabel,
  mismatch = false,
}: {
  advertisement: ListingAdvertisementWithListing;
  field: "primary" | "monthlyRent";
  label: string;
  displayLabel?: string;
  mismatch?: boolean;
}) {
  const { mode, editingCell, drafts, onStartEdit } = useMyAdsTableState();
  const requested = requestedCellDisplay(advertisement, drafts[advertisement.id], field);
  const asked = Boolean(requested) || isValueAsked(advertisement, drafts[advertisement.id], field);
  const isEditing =
    editingCell?.id === advertisement.id && editingCell.field === field;

  if (isEditing) {
    return <MoneyCellEditor advertisement={advertisement} field={field} />;
  }
  const text = requested ? (
    <span
      title={`${label} · 요청: ${requested.text}`}
      className="flex min-w-0 flex-col justify-center tabular-nums"
    >
      <span
        className={cn(
          "min-w-0 truncate whitespace-nowrap text-[11px] leading-[14px]",
          askedValueClassName,
        )}
      >
        {displayLabel ?? label}
      </span>
      <span
        data-my-ads-requested-value={field}
        data-request-origin={requested.kind}
        className={cn(
          "min-w-0 truncate whitespace-nowrap text-[12px] font-medium leading-[15px]",
          requested.kind === "draft" ? "text-info" : "text-primary",
        )}
      >
        → {requested.text}
      </span>
    </span>
  ) : (
    <span
      title={asked ? `${label} · 변경 요청이 있습니다. 펼쳐서 요청 탭을 보세요.` : label}
      className={cn(
        "min-w-0 truncate whitespace-nowrap tabular-nums",
        asked && askedValueClassName,
        !asked && mismatch && "text-warning",
      )}
    >
      {displayLabel ?? label}
    </span>
  );
  if (!mode) return text;
  const blocked = editBlockReason(advertisement, field, mode, drafts[advertisement.id]);
  if (blocked) {
    return (
      <span title={blocked} className="block cursor-not-allowed truncate opacity-60">
        {text}
      </span>
    );
  }
  return (
    <button
      type="button"
      data-my-ads-cell={field}
      aria-label={`${advertisementLocationLabel(advertisement)} ${fieldLabel(advertisement, field)} ${
        mode === "edit" ? "고치기" : "변경 요청"
      }`}
      onClick={(event) => {
        event.stopPropagation();
        onStartEdit(advertisement, field);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(editableCellButtonClassName, requested && "h-[33px] py-0.5")}
    >
      {text}
    </button>
  );
}

function ledgerMismatchHint(
  advertisement: ListingAdvertisementWithListing,
  field: "primary" | "monthlyRent",
): string | null {
  const listing = advertisement.listing;
  if (!listing) return null;
  const adValue = currentAmount(advertisement, field);
  if (adValue == null) return null;
  const ledgerValue =
    field === "monthlyRent"
      ? listing.monthlyRent
      : listing.transactionType === "sale"
        ? listing.price
        : listing.transactionType === "jeonse"
          ? (listing.price ?? listing.deposit)
          : listing.deposit;
  if (ledgerValue == null || adValue === ledgerValue) return null;
  return `원장가(${formatMoney(ledgerValue)})와 다름`;
}

export function InlinePriceCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const mismatch = ledgerMismatchHint(advertisement, "primary");
  const label = advertisementPrimaryAmountLabel(advertisement);
  return (
    <MoneyCell
      advertisement={advertisement}
      field="primary"
      label={mismatch ? `${label} · ${mismatch}` : label}
      displayLabel={label}
      mismatch={Boolean(mismatch)}
    />
  );
}

export function InlineMonthlyRentCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  if (advertisementTransactionType(advertisement) !== "monthly") {
    return <EmptyCellValue />;
  }
  const mismatch = ledgerMismatchHint(advertisement, "monthlyRent");
  const label = advertisementMonthlyRentLabel(advertisement);
  return (
    <MoneyCell
      advertisement={advertisement}
      field="monthlyRent"
      label={mismatch ? `${label} · ${mismatch}` : label}
      displayLabel={label}
      mismatch={Boolean(mismatch)}
    />
  );
}

/**
 * 입력칸 안에서 커서만 옮기는 키. 기본 동작을 두면 브라우저가 표 스크롤 영역을 맨 위·맨 아래로
 * 굴려 입력칸이 화면(가상 스크롤) 밖으로 사라질 수 있어 커서는 직접 옮기고 기본 동작은 막는다.
 * 위·아래 화살표는 macOS 텍스트 칸처럼 맨 앞·맨 끝으로 간다.
 */
const CARET_TO_START_KEYS = new Set(["Home", "ArrowUp"]);
const CARET_TO_END_KEYS = new Set(["End", "ArrowDown"]);

function keepCaretKeysInInput(event: KeyboardEvent<HTMLInputElement>) {
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "PageUp" || event.key === "PageDown") {
    event.preventDefault();
    return;
  }
  const toStart = CARET_TO_START_KEYS.has(event.key);
  if (!toStart && !CARET_TO_END_KEYS.has(event.key)) return;
  event.preventDefault();
  const input = event.currentTarget;
  const caret = toStart ? 0 : input.value.length;
  if (!event.shiftKey) {
    input.setSelectionRange(caret, caret);
    return;
  }
  const anchor =
    input.selectionDirection === "backward"
      ? (input.selectionEnd ?? caret)
      : (input.selectionStart ?? caret);
  input.setSelectionRange(
    Math.min(anchor, caret),
    Math.max(anchor, caret),
    caret < anchor ? "backward" : "forward",
  );
}

// 입력칸 안의 키(좌우 화살표로 커서 이동, Esc, x 등)와 클릭은 입력칸이 처리한다.
// 표의 키보드 이동·선택 해제로 올라가지 않게 막는다.
const stopTableHandling = (
  event: KeyboardEvent<HTMLInputElement> | MouseEvent<HTMLInputElement>,
) => {
  event.stopPropagation();
  if (event.type === "keydown") {
    keepCaretKeysInInput(event as KeyboardEvent<HTMLInputElement>);
  }
};

/**
 * 금액 칸의 입력칸. Enter 확정 · Esc 취소 · 바깥을 누르면 확정.
 * 받을 수 없는 값이면 닫지 않고 이유를 보여 준다. 기록 수정의 저장이 실패해도 닫지 않는다(쓴 값을 잃지 않게).
 *
 * type="number"는 포커스된 칸 위에서 휠을 굴리면 값이 바뀌고(2000 → 1999) 위 · 아래 화살표로도 값이 바뀐다.
 * 그래서 숫자 자판만 띄우는 텍스트 칸으로 두고, 숫자(와 천 단위 쉼표)만 받는다.
 */
function MoneyCellEditor({
  advertisement,
  field,
}: {
  advertisement: ListingAdvertisementWithListing;
  field: "primary" | "monthlyRent";
}) {
  const { mode, drafts, onCommitEdit, onCancelEdit, editorCommitRef } =
    useMyAdsTableState();
  // 변경 요청은 이미 적어 둔 값에서, 기록 수정은 지금 값에서 시작한다
  const [text, setText] = useState(() => {
    const drafted = mode === "request" ? drafts[advertisement.id]?.[field] : undefined;
    const start = drafted ?? currentAmount(advertisement, field);
    return start == null ? "" : String(start);
  });
  const [problem, setProblem] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const savingRef = useRef(false);
  const committedRef = useRef(false);
  const textRef = useRef(text);
  textRef.current = text;

  const commit = useCallback(async (): Promise<boolean> => {
    if (savingRef.current || committedRef.current) return true;
    savingRef.current = true;
    setIsSaving(true);
    try {
      const reason = await onCommitEdit(advertisement, field, textRef.current);
      if (reason) {
        setProblem(reason);
        return false;
      }
      committedRef.current = true;
      return true;
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [advertisement, field, onCommitEdit]);

  // 모드를 바꾸거나 요청을 보내기 전에 화면이 이 칸을 먼저 확정하게 한다
  useEffect(() => {
    editorCommitRef.current = commit;
    return () => {
      if (editorCommitRef.current === commit) editorCommitRef.current = null;
    };
  }, [commit, editorCommitRef]);

  return (
    <Input
      autoFocus
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      value={text}
      readOnly={isSaving}
      aria-busy={isSaving}
      aria-invalid={problem ? true : undefined}
      title={problem ?? undefined}
      aria-label={`${advertisementLocationLabel(advertisement)} ${fieldLabel(advertisement, field)} (만원)`}
      onFocus={(event) => event.currentTarget.select()}
      onClick={stopTableHandling}
      onDoubleClick={stopTableHandling}
      onKeyDown={(event) => {
        stopTableHandling(event);
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") {
          event.preventDefault();
          void commit();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onCancelEdit();
        }
      }}
      onBlur={() => void commit()}
      onChange={(event) => {
        // 숫자가 아닌 글자가 섞이면 이전 값을 그대로 둔다(친 글자가 들어가지 않는다).
        const next = sanitizeManwonInput(event.target.value);
        if (next === null) return;
        setText(next);
        setProblem(null);
      }}
      className={cn(
        "h-7 w-full min-w-0 px-1.5 text-right text-[13px] tabular-nums",
        problem && "border-destructive ring-1 ring-destructive/40",
      )}
    />
  );
}

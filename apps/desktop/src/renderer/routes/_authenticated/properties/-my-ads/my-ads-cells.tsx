import type { KeyboardEvent, MouseEvent, ReactNode, SVGProps } from "react";
import { ExternalLink, RotateCcw } from "lucide-react";
import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import { analyzeOfficeAdvertisementComparison } from "@estate-erp/api-client";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { Input } from "@/components/ui/input";
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
  compactAdvertisementDate,
  cpChannelLabel,
  verificationMethodPresentation,
} from "./my-ads-format";
import {
  isManualAdvertisement,
  myAdsAnalysisSignal,
} from "./my-ads-manual-ad-state";
import { advertisementExposureElapsedDays } from "./my-ads-filters";
import { advertisementLocationLabel } from "./my-ads-location";
import {
  inlineEditBase,
  inlineMoneyEditLabel,
  isInlineEditDirty,
  sanitizeManwonInput,
} from "./my-ads-drafts";
import { useMyAdsTableState } from "./my-ads-table-context";
import type { InlinePriceEdit } from "./my-ads-types";

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
  const tag = (
    <span
      title={
        advertisement.externalAdId
          ? `${provider} · ${advertisement.externalAdId}`
          : provider
      }
      className={cn(
        PROPERTY_TABLE_TAG_CLASS_NAME,
        "min-w-0",
        PROPERTY_TABLE_PILL_TONES.neutralStrong,
      )}
    >
      <span className="truncate">{provider}</span>
    </span>
  );
  if (!isManualAdvertisement(advertisement)) return tag;

  // 수동 등록 광고: CP 읽기로 확인된 광고가 아니라 사용자가 적어 넣은 광고다.
  // 칸이 좁으면 "수동"은 남기고 채널 이름 쪽을 말줄임한다(칸 밖으로 넘치지 않는다).
  return (
    <span className="flex min-w-0 max-w-full items-center gap-1 overflow-hidden">
      {tag}
      <span
        title="직접 입력한 광고입니다. 수정은 업무 요청 없이 바로 저장됩니다."
        className={cn(
          PROPERTY_TABLE_TAG_CLASS_NAME,
          "shrink-0",
          PROPERTY_TABLE_PILL_TONES.neutral,
        )}
      >
        수동
      </span>
    </span>
  );
}

export function NaverAdvertisementCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  if (!advertisement.naverArticleNo || !advertisement.naverUrl) {
    return <EmptyCellValue />;
  }

  const isActive =
    advertisement.officeAdvertisementGroup?.mainAdvertisement?.isActive ?? true;
  const exposure = isActive ? "게재 중" : "미노출";

  return (
    <a
      href={advertisement.naverUrl}
      target="_blank"
      rel="noopener noreferrer"
      title={`네이버 광고 ${advertisement.naverArticleNo} (${exposure}) 새 창에서 열기`}
      aria-label={`${advertisementLocationLabel(advertisement)} 네이버 광고 ${exposure}, 새 창에서 열기`}
      onClick={(event) => event.stopPropagation()}
      className="inline-flex h-5 max-w-full items-center gap-1 whitespace-nowrap rounded-[4px] border border-border px-1.5 text-[13px] font-normal leading-none text-foreground transition-colors hover:border-info/40 hover:bg-info-soft hover:text-info focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/35"
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          isActive ? "bg-success" : "bg-muted-foreground/50",
        )}
      />
      네이버
      <ExternalLink aria-hidden="true" className="size-3 shrink-0" />
    </a>
  );
}

export function VerificationMethodCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const code =
    advertisement.officeAdvertisementGroup?.mainAdvertisement
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

/** 층수노출은 읽기 정보다 — 스위치가 아니라 상태 알약으로 보인다. */
export function FloorExposureCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const main =
    advertisement.officeAdvertisementGroup?.mainAdvertisement ?? null;
  const comparison = analyzeOfficeAdvertisementComparison(advertisement);
  const exposureMode = main ? comparison.ownFloorExposureMode : "unknown";
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

  return (
    <span
      title={`${exposureDescription}${
        disadvantage
          ? ` · 정확한 층을 공개한 경쟁 광고 ${comparison.exactFloorCompetitorCount}건`
          : ""
      }`}
      // 칸이 좁으면 "불리"는 남기고 알약 글자를 말줄임한다(칸 밖으로 넘치지 않는다).
      className="inline-flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden whitespace-nowrap"
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
      {disadvantage && (
        <span className="shrink-0 text-[12px] font-medium text-destructive">
          불리
        </span>
      )}
    </span>
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

const changedValueClassName =
  "rounded-[4px] bg-warning-soft/70 px-1.5 ring-1 ring-inset ring-warning/25";

/**
 * 선택·수정값은 열 정의가 아니라 표 상태 컨텍스트에서 읽는다(my-ads-table-context.ts).
 * 수동 등록 광고는 CP 작업 업무로 보낼 수 없어 입력칸을 열지 않고 "상세 편집"에서 바로 고친다.
 */
function useInlineEditCell(advertisement: ListingAdvertisementWithListing) {
  const { selectedIds, inlineEdits, onInlineEditChange, onInlineEditReset } =
    useMyAdsTableState();
  return {
    selected:
      selectedIds.has(advertisement.id) && !isManualAdvertisement(advertisement),
    edit: inlineEdits[advertisement.id],
    onChange: (patch: Partial<InlinePriceEdit>) =>
      onInlineEditChange(advertisement, patch),
    onReset: () => onInlineEditReset(advertisement.id),
  };
}

/**
 * 가격/보증금 셀. 행을 선택하면 입력칸이 열리고, 원래 값과 달라지면 노란
 * 배경으로 표시한다 (이실장과 같은 조작감이되 셀마다 확인창을 띄우지는 않는다).
 */
export function InlinePriceCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const { selected, edit, onChange, onReset } = useInlineEditCell(advertisement);
  const base = inlineEditBase(advertisement);
  const current = edit ?? base;
  const transactionType = advertisement.listing?.transactionType ?? "sale";
  const primaryKey =
    transactionType === "monthly" || transactionType === "jeonse"
      ? "advertisedDeposit"
      : "advertisedPrice";
  const draftChanged = edit ? isInlineEditDirty(advertisement, edit) : false;
  const primaryChanged = current[primaryKey] !== base[primaryKey];

  if (!selected) {
    const label = edit
      ? inlineMoneyEditLabel(current[primaryKey])
      : advertisementPrimaryAmountLabel(advertisement);
    return (
      <span className="flex min-w-0 items-center gap-1">
        <span
          title={label}
          className={cn(
            "min-w-0 truncate whitespace-nowrap tabular-nums",
            primaryChanged && changedValueClassName,
          )}
        >
          {label}
        </span>
        {draftChanged && (
          <InlineDraftResetButton
            advertisement={advertisement}
            onReset={onReset}
          />
        )}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <InlineMoneyInput
        value={current[primaryKey]}
        changed={primaryChanged}
        ariaLabel={`${advertisementLocationLabel(advertisement)} ${inlinePrimaryAmountName(
          transactionType,
        )}`}
        onChange={(value) => onChange({ [primaryKey]: value })}
      />
      {draftChanged && (
        <InlineDraftResetButton
          advertisement={advertisement}
          onReset={onReset}
        />
      )}
    </div>
  );
}

export function InlineMonthlyRentCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const { selected, edit, onChange } = useInlineEditCell(advertisement);
  if (advertisement.listing?.transactionType !== "monthly") {
    return <EmptyCellValue />;
  }

  const base = inlineEditBase(advertisement);
  const current = edit ?? base;
  const changed = current.advertisedMonthlyRent !== base.advertisedMonthlyRent;

  if (!selected) {
    const label = edit
      ? inlineMoneyEditLabel(current.advertisedMonthlyRent)
      : advertisementMonthlyRentLabel(advertisement);
    return (
      <span
        title={label}
        className={cn(
          "block max-w-full truncate whitespace-nowrap tabular-nums",
          changed && cn("inline-block", changedValueClassName),
        )}
      >
        {label}
      </span>
    );
  }

  return (
    <InlineMoneyInput
      value={current.advertisedMonthlyRent}
      changed={changed}
      ariaLabel={`${advertisementLocationLabel(advertisement)} 월세`}
      onChange={(value) => onChange({ advertisedMonthlyRent: value })}
    />
  );
}

function InlineDraftResetButton({
  advertisement,
  onReset,
}: {
  advertisement: ListingAdvertisementWithListing;
  onReset: () => void;
}) {
  return (
    <button
      type="button"
      title="이 행의 변경 초안 취소"
      aria-label={`${advertisementLocationLabel(advertisement)} 변경 초안 취소`}
      onClick={(event) => {
        event.stopPropagation();
        onReset();
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className="inline-flex h-5 shrink-0 items-center gap-0.5 rounded-[4px] border border-warning/30 bg-[#fbf3db] px-1.5 text-[11px] font-medium leading-none text-[#8f6b1f] hover:bg-warning-soft/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/30"
    >
      <RotateCcw aria-hidden="true" className="size-2.5" />
      변경 초안
    </button>
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
 * 만원 단위 금액 입력칸. type="number"는 포커스된 칸 위에서 휠을 굴리면 값이 바뀌고
 * (2000 → 1999) 위·아래 화살표로도 값이 바뀌어 모르는 사이 변경 초안이 생긴다.
 * 그래서 숫자 자판만 띄우는 텍스트 칸으로 두고, 숫자(와 천 단위 쉼표)만 받는다.
 */
function InlineMoneyInput({
  value,
  changed,
  ariaLabel,
  onChange,
}: {
  value: string;
  changed: boolean;
  ariaLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      spellCheck={false}
      value={value}
      aria-label={ariaLabel}
      onClick={stopTableHandling}
      onDoubleClick={stopTableHandling}
      onKeyDown={stopTableHandling}
      onChange={(event) => {
        // 숫자가 아닌 글자가 섞이면 이전 값을 그대로 둔다(친 글자가 들어가지 않는다).
        const next = sanitizeManwonInput(event.target.value);
        if (next !== null && next !== value) onChange(next);
      }}
      className={cn(
        "h-7 w-full min-w-0 px-1.5 text-right text-[13px] tabular-nums",
        changed && "border-warning bg-warning-soft font-semibold",
      )}
    />
  );
}

import {
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Building2,
  CalendarCheck,
  Check,
  ChevronDown,
  ExternalLink,
  Hash,
  Layers,
  Megaphone,
  Pencil,
  RotateCcw,
  Scale,
  ServerCog,
  X,
} from "lucide-react";
import type {
  ListingAdvertisementWithListing,
  OfficeAdvertisement,
} from "@estate-erp/api-client";
import {
  analyzeOfficeAdvertisementComparison,
  analyzeOfficeAdvertisementRow,
} from "@estate-erp/api-client";
import { inferOfficeAdvertisementFloorExposureMode } from "@estate-erp/shared";
import { cn } from "@/lib/utils";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatRent,
} from "@/lib/format";
import { useAuth } from "@/providers/auth-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  PropertyPanelColumnHeader,
  panelTableMenuClass,
} from "../-components/property-panel-table-controls";
import { PROPERTY_TABLE_PILL_TONES } from "./my-ads-pill";
import {
  advertisementPriceLabel,
  competitorRowPresentation,
  cpChannelLabel,
  floorExposureDescription,
  formatYmd,
  getCanonicalLocation,
} from "./my-ads-format";
import { myAdsAnalysisSignal } from "./my-ads-manual-ad-state";
import { myAdsAnalysisPanelSummary } from "./my-ads-analysis-summary";
import { WonCircleIcon } from "./my-ads-cells";
import {
  clampCompetitorColumnWidth,
  competitorSortLabels,
  competitorTableColumns,
  getCompetitorTableLayout,
  MAX_COMPETITOR_COLUMN_WIDTH,
  sortCompetitorRows,
  type CompetitorColumnId,
  type CompetitorColumnWidths,
  type CompetitorTableRow,
  type CompetitorTableSort,
} from "./my-ads-competitor-table-state";
import { useCompetitorTablePreferences } from "./use-competitor-table-preferences";

// 매물관리 펼침 광고 표(properties/index.tsx PropertyAdPanel)와 같은 태그·상태 모양.
const TAG_CLASS_NAME =
  "inline-flex h-5 max-w-full shrink-0 items-center whitespace-nowrap rounded-[3px] px-1.5 text-[13px] font-normal leading-none";
const STATUS_CLASS_NAME =
  "inline-flex h-5 max-w-full items-center gap-1.5 whitespace-nowrap rounded-full pl-[7px] pr-[9px] text-[13px] font-normal leading-none";
const FLOOR_MODE_TEXT = { exact: "정확", band: "구간", unknown: null } as const;
// 펼친 패널 안에서 누른 키가 바깥 표의 셀 이동·선택 해제로 번지지 않게 한다.
const OUTER_TABLE_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
  "Escape",
  "x",
  "X",
]);

type CompetitorView = CompetitorTableRow & {
  isMine: boolean;
  realtorLabel: string;
  priceLabel: string;
  floorDescription: string;
  /** 내 광고는 구간 공개인데 이 경쟁 광고는 정확한 층을 공개함 */
  floorWarning: boolean;
  comparison: { label: string; className: string };
};

function buildAnalysis(advertisement: ListingAdvertisementWithListing) {
  const group = advertisement.officeAdvertisementGroup;
  const comparison = analyzeOfficeAdvertisementComparison(advertisement);
  const transactionType = advertisement.listing?.transactionType;
  const rows = (group?.advertisements ?? [])
    .filter((comparedAdvertisement) => comparedAdvertisement.isActive)
    .map((comparedAdvertisement): CompetitorView => {
      const rowAnalysis = analyzeOfficeAdvertisementRow(
        advertisement,
        comparedAdvertisement,
      );
      return {
        ...competitorFields(comparedAdvertisement, transactionType),
        priceRelation: rowAnalysis.priceRelation,
        isAhead: rowAnalysis.isAhead,
        isMine: comparedAdvertisement.isMine,
        realtorLabel:
          comparedAdvertisement.realtorName ??
          comparedAdvertisement.articleName ??
          "중개사 미상",
        priceLabel: competitorPriceLabel(comparedAdvertisement, transactionType),
        floorDescription: floorExposureDescription(comparedAdvertisement),
        floorWarning:
          !comparedAdvertisement.isMine &&
          comparison.ownFloorExposureMode === "band" &&
          rowAnalysis.hasExactFloorExposure,
        comparison: competitorRowPresentation(rowAnalysis),
      };
    });
  return {
    group,
    main: group?.mainAdvertisement ?? null,
    comparison,
    // getAnalysisSignal은 내부에서 비교 분석을 한 번 더 한다(my-ads-format 소유라 그대로 둔다).
    // 수동 등록 광고는 CP 읽기 문구 대신 수동 광고 문구를 쓴다.
    signal: myAdsAnalysisSignal(advertisement),
    location: getCanonicalLocation(advertisement),
    rows,
    summary: myAdsAnalysisPanelSummary(advertisement),
  };
}

function competitorFields(
  advertisement: OfficeAdvertisement,
  transactionType: string | undefined,
): Omit<CompetitorTableRow, "priceRelation" | "isAhead"> {
  const mode = advertisement.floorExposureMode;
  return {
    id: advertisement.id,
    ranking: advertisement.ranking,
    realtorName: advertisement.realtorName ?? advertisement.articleName,
    primaryAmount:
      transactionType === "monthly"
        ? advertisement.deposit
        : transactionType === "jeonse"
          ? (advertisement.deposit ?? advertisement.price)
          : advertisement.price,
    monthlyRent:
      transactionType === "monthly" ? advertisement.monthlyRent : null,
    floorInfo: advertisement.floorInfo,
    // 분석 함수와 같은 규칙: 서버 분류가 없으면 층 표기에서 추정한다.
    floorExposureMode:
      mode === "exact" || mode === "band"
        ? mode
        : inferOfficeAdvertisementFloorExposureMode(advertisement.floorInfo),
    articleConfirmYmd: advertisement.articleConfirmYmd,
    seango: advertisement.seango,
    epju: advertisement.epju,
  };
}

function competitorPriceLabel(
  advertisement: OfficeAdvertisement,
  transactionType: string | undefined,
) {
  if (transactionType === "monthly") {
    return formatRent(advertisement.deposit, advertisement.monthlyRent);
  }
  if (transactionType === "jeonse") {
    // 비교 분석이 전세가를 보증금 → 가격 순으로 읽으므로 표시도 같게 한다.
    return formatMoney(advertisement.deposit ?? advertisement.price);
  }
  return formatMoney(advertisement.price);
}

export function AdvertisementAnalysisPanel({
  advertisement,
  onEditAdvertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
  onEditAdvertisement: () => void;
}) {
  const { group, main, comparison, signal, location, rows, summary } = useMemo(
    () => buildAnalysis(advertisement),
    [advertisement],
  );
  const { user } = useAuth();
  const { preferences, updatePreferences } = useCompetitorTablePreferences(
    user?.office?.id ?? "local",
    user?.id ?? "guest",
  );
  const [previewWidths, setPreviewWidths] =
    useState<CompetitorColumnWidths | null>(null);
  const layout = getCompetitorTableLayout(previewWidths ?? preferences.widths);
  const sortedRows = useMemo(
    () => sortCompetitorRows(rows, preferences.sort),
    [rows, preferences.sort],
  );
  const setSort = (sort: CompetitorTableSort) =>
    updatePreferences((current) => ({ ...current, sort }));
  const locationLabel = [location.site, location.dong, location.ho]
    .filter(Boolean)
    .join(" ");

  const metrics = [
    {
      label: "노출 순위",
      value:
        comparison.ownRanking != null
          ? `${comparison.ownRanking}/${comparison.totalCount ?? "?"}위`
          : "분석 대기",
      detail: summary.rankingDetail,
    },
    {
      label: "네이버 층 노출",
      value: comparison.ownFloorInfo ?? "확인 불가",
      detail:
        comparison.ownFloorExposureMode === "exact"
          ? "정확한 층 공개"
          : comparison.ownFloorExposureMode === "band"
            ? comparison.exactFloorCompetitorCount > 0
              ? `구간만 공개 · 정확히 공개한 경쟁 광고 ${comparison.exactFloorCompetitorCount}건`
              : "저·중·고 구간만 공개"
            : "층 노출 방식 미확인",
    },
    {
      label: "내 광고가",
      value: advertisementPriceLabel(advertisement),
      detail: summary.priceDetail,
    },
    {
      label: "네이버 확인",
      value:
        formatYmd(main?.articleConfirmYmd) ??
        formatDate(advertisement.lastCheckedAt),
      detail: advertisement.lastCheckedAt
        ? `분석 ${formatDateTime(advertisement.lastCheckedAt)}`
        : "분석 이력 없음",
    },
  ];
  const facts = [
    { label: "가격 경쟁", value: summary.priceCompetition },
    { label: "CP사", value: cpChannelLabel(advertisement.channel) },
    { label: "CP 광고번호", value: advertisement.externalAdId ?? "—" },
    { label: "네이버 번호", value: advertisement.naverArticleNo ?? "—" },
  ];

  return (
    <div
      data-my-ads-analysis-panel
      role="region"
      aria-label={`${locationLabel} 네이버 비교 분석`}
      className="bg-background py-3 pl-6 pr-4"
      onKeyDown={(event: KeyboardEvent) => {
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          OUTER_TABLE_KEYS.has(event.key)
        ) {
          event.stopPropagation();
        }
      }}
    >
      {/* 바깥 표가 가로로 넓어도 보이는 쪽에 머문다. 폭은 표의 보이는 폭(100cqw, 표 스크롤 영역이
          크기 질의 컨테이너)에서 좌우 여백(24+16px)을 뺀 값이고, 넓은 창에서는 1120px에서 멈춘다.
          비교 표가 그보다 넓으면 아래 overflow-x-auto 안에서 가로로 스크롤한다. */}
      <div className="sticky left-6 w-[calc(100cqw-40px)] min-w-0 max-w-[1120px]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <BarChart3
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <h3 className="shrink-0 text-[14px] font-medium leading-5 text-foreground">
              네이버 비교 분석
            </h3>
            <span
              className="truncate text-[13px] leading-5 text-muted-foreground"
              title={locationLabel}
            >
              {locationLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              size="sm"
              className="h-7 gap-1 px-2.5 text-[13px] font-normal"
              onClick={onEditAdvertisement}
            >
              <Pencil className="size-3.5" />
              {/* 수동 광고는 CP에 실체가 없어 업무 요청 없이 원장을 바로 고친다 */}
              {advertisement.source === "manual" ? "광고 수정" : "가격 수정안 작성"}
            </Button>
            {advertisement.url && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2.5 text-[13px] font-normal"
                asChild
              >
                <a
                  href={advertisement.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ServerCog className="size-3.5" />
                  CP 관리
                </a>
              </Button>
            )}
            {advertisement.naverUrl && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 px-2.5 text-[13px] font-normal"
                asChild
              >
                <a
                  href={advertisement.naverUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="size-3.5" />
                  네이버 원문
                </a>
              </Button>
            )}
          </div>
        </div>
        <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">
          현재 시점의 순위·가격·층 노출을 함께 비교합니다. 과거 순위 변화는
          저장하지 않습니다.
        </p>

        <section aria-label="판단" className="mt-3">
          <div className="flex items-start gap-2">
            <span
              data-analysis-signal={signal.kind}
              className={cn(STATUS_CLASS_NAME, "mt-px shrink-0", signal.className)}
            >
              <StatusDot />
              {signal.label}
            </span>
            <p className="min-w-0 text-[14px] font-[450] leading-[22px] text-foreground">
              {signal.detail}
            </p>
          </div>
          <dl className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px] leading-5">
            {facts.map((fact) => (
              <div key={fact.label} className="flex min-w-0 items-baseline gap-1.5">
                <dt className="shrink-0 text-muted-foreground">{fact.label}</dt>
                <dd
                  className="min-w-0 truncate tabular-nums text-foreground"
                  title={fact.value}
                >
                  {fact.value}
                </dd>
              </div>
            ))}
          </dl>
          {group?.memo && (
            <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
              메모: {group.memo}
            </p>
          )}
        </section>

        <dl className="mt-4 grid grid-cols-4 gap-x-6">
          {metrics.map((metric) => (
            <AnalysisMetric key={metric.label} {...metric} />
          ))}
        </dl>

        <div className="mt-4 flex h-7 items-center gap-1.5 text-[13px]">
          <span className="font-medium text-foreground">비교 광고</span>
          {/* 경쟁 광고 수만 센다(표의 "내 광고" 줄은 빼고). */}
          <span className="tabular-nums text-muted-foreground">
            {summary.competitorCount}
          </span>
          <span className="flex-1" />
          <CompetitorSortControl
            sort={preferences.sort}
            onSort={setSort}
            onResetWidths={() =>
              updatePreferences((current) => ({ ...current, widths: {} }))
            }
          />
        </div>
        <div className="mt-1 overflow-x-auto">
          <div
            role="table"
            aria-label="네이버 비교 광고 표"
            style={
              {
                "--my-ads-competitor-columns": layout.gridTemplateColumns,
                minWidth: layout.minWidth,
                width: layout.width,
              } as CSSProperties
            }
          >
            {/* data-property-ad-header / data-ad-column: 공유 머리글이 드래그 시작 폭을 재는 표식 */}
            <div
              data-property-ad-header
              data-my-ads-competitor-header
              role="row"
              className="grid h-9 grid-cols-[var(--my-ads-competitor-columns)] border-b border-border text-[13px] font-normal leading-[1.6154] text-muted-foreground [&>[role=columnheader]:last-child>[role=separator]]:right-0"
            >
              {competitorTableColumns.map((column) => (
                <PropertyPanelColumnHeader
                  key={column.id}
                  column={column}
                  columns={competitorTableColumns}
                  table="ad"
                  clampWidth={clampCompetitorColumnWidth}
                  maxWidth={MAX_COMPETITOR_COLUMN_WIDTH}
                  sortOptions={[{ column: column.id, label: column.label }]}
                  icon={columnIcons[column.id]}
                  sort={preferences.sort}
                  onSort={setSort}
                  onPreviewResize={setPreviewWidths}
                  onCommitResize={(widths) =>
                    updatePreferences((current) => ({ ...current, widths }))
                  }
                  onResetWidth={(id) =>
                    updatePreferences((current) => {
                      const widths = { ...current.widths };
                      delete widths[id];
                      return { ...current, widths };
                    })
                  }
                />
              ))}
            </div>
            <div role="rowgroup">
              {sortedRows.length > 0 ? (
                sortedRows.map((row) => <CompetitorRow key={row.id} row={row} />)
              ) : (
                <div role="row">
                  <div
                    role="cell"
                    aria-colspan={competitorTableColumns.length}
                    className="flex h-[37px] items-center border-b border-border px-2.5 text-[13px] text-muted-foreground"
                  >
                    네이버 비교 데이터가 아직 없습니다.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const columnIcons: Record<CompetitorColumnId, ReactNode> = {
  rank: <Hash />,
  realtor: <Building2 />,
  price: <WonCircleIcon />,
  floor: <Layers />,
  confirmedAt: <CalendarCheck />,
  options: <Megaphone />,
  comparison: <Scale />,
};

function AnalysisMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] leading-5 text-muted-foreground">{label}</dt>
      <dd
        className="mt-0.5 truncate text-[14px] font-medium leading-[22px] tabular-nums text-foreground"
        title={value}
      >
        {value}
      </dd>
      <dd
        className="truncate text-[13px] leading-5 text-muted-foreground"
        title={detail}
      >
        {detail}
      </dd>
    </div>
  );
}

function CompetitorRow({ row }: { row: CompetitorView }) {
  const floorModeText = FLOOR_MODE_TEXT[row.floorExposureMode];
  const options = [row.seango && "선광고", row.epju && "e편주"].filter(
    (option): option is string => Boolean(option),
  );

  return (
    <div
      role="row"
      data-my-ads-competitor-row={row.id}
      data-mine={row.isMine || undefined}
      className="grid h-[37px] grid-cols-[var(--my-ads-competitor-columns)] border-b border-border text-[14px] font-[450] leading-[1.5] text-foreground hover:bg-muted data-[mine=true]:bg-info-soft/40 [&>div]:min-w-0 [&>div]:content-center [&>div]:overflow-hidden [&>div]:px-2.5 [&>div:not(:last-child)]:border-r [&>div:not(:last-child)]:border-border"
    >
      <div role="cell" className="tabular-nums">
        {row.ranking != null ? `${row.ranking}위` : <EmptyValue />}
      </div>
      <div role="cell" title={row.realtorLabel}>
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate">{row.realtorLabel}</span>
          {row.isMine && (
            <span className="shrink-0 text-[13px] text-info-strong">내 광고</span>
          )}
        </span>
      </div>
      <div role="cell" title={row.priceLabel} className="tabular-nums">
        <span className="block truncate">{row.priceLabel}</span>
      </div>
      <div role="cell" title={row.floorDescription}>
        {row.floorInfo ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span
              className={cn(
                TAG_CLASS_NAME,
                "min-w-0 shrink tabular-nums",
                row.floorWarning
                  ? PROPERTY_TABLE_PILL_TONES.warning
                  : row.floorExposureMode === "exact"
                    ? PROPERTY_TABLE_PILL_TONES.info
                    : PROPERTY_TABLE_PILL_TONES.neutral,
              )}
            >
              <span className="truncate">{row.floorInfo}</span>
            </span>
            {floorModeText && (
              <span className="shrink-0 text-[13px] text-muted-foreground">
                {floorModeText}
              </span>
            )}
          </span>
        ) : (
          <EmptyValue />
        )}
      </div>
      <div role="cell" className="tabular-nums">
        {formatYmd(row.articleConfirmYmd) ?? <EmptyValue />}
      </div>
      <div role="cell" title={options.join(" · ") || undefined}>
        {options.length > 0 ? (
          <span className="flex min-w-0 items-center gap-1">
            {row.seango && (
              <span className={cn(TAG_CLASS_NAME, PROPERTY_TABLE_PILL_TONES.violet)}>
                선광고
              </span>
            )}
            {row.epju && (
              <span className={cn(TAG_CLASS_NAME, PROPERTY_TABLE_PILL_TONES.info)}>
                e편주
              </span>
            )}
          </span>
        ) : (
          <EmptyValue />
        )}
      </div>
      <div role="cell" title={row.comparison.label}>
        <span className={cn(STATUS_CLASS_NAME, row.comparison.className)}>
          <StatusDot />
          <span className="truncate">{row.comparison.label}</span>
        </span>
      </div>
    </div>
  );
}

function StatusDot() {
  return (
    <span
      aria-hidden="true"
      className="size-1.5 shrink-0 rounded-full bg-current opacity-70"
    />
  );
}

function EmptyValue() {
  return <span className="text-muted-foreground">—</span>;
}

const sortPresets: ReadonlyArray<{
  label: string;
  sort: NonNullable<CompetitorTableSort>;
}> = [
  { label: "순위순", sort: { column: "rank", direction: "asc" } },
  { label: "낮은 가격순", sort: { column: "price", direction: "asc" } },
  { label: "최근 확인순", sort: { column: "confirmedAt", direction: "desc" } },
];

// 매물관리 광고 표 위의 정렬 버튼(AdTableSortControl)과 같은 모양. 그 컴포넌트는 광고 열에 묶여 있다.
function CompetitorSortControl({
  sort,
  onSort,
  onResetWidths,
}: {
  sort: CompetitorTableSort;
  onSort: (sort: CompetitorTableSort) => void;
  onResetWidths: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="비교 광고 정렬 설정"
          className={cn(
            "inline-flex h-[26px] items-center gap-1 rounded-full px-2 text-xs outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring",
            sort ? "bg-info-soft/50 text-info-strong" : "text-muted-foreground",
          )}
        >
          {sort ? (
            sort.direction === "asc" ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            )
          ) : (
            <ArrowUpDown className="size-3" />
          )}
          {sort ? competitorSortLabels[sort.column] : "정렬"}
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={panelTableMenuClass}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          비교 광고 정렬
        </DropdownMenuLabel>
        {sort && (
          <DropdownMenuLabel className="text-xs">
            {competitorSortLabels[sort.column]} ·{" "}
            {sort.direction === "asc" ? "오름차순" : "내림차순"}
          </DropdownMenuLabel>
        )}
        {sortPresets.map((preset) => (
          <DropdownMenuItem
            key={preset.label}
            onSelect={() => onSort(preset.sort)}
          >
            {preset.sort.direction === "asc" ? <ArrowUp /> : <ArrowDown />}
            {preset.label}
            {sort?.column === preset.sort.column &&
              sort.direction === preset.sort.direction && (
                <Check className="ml-auto size-3.5" />
              )}
          </DropdownMenuItem>
        ))}
        {sort && (
          <DropdownMenuItem onSelect={() => onSort(null)}>
            <X />
            정렬 해제
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onResetWidths}>
          <RotateCcw />
          모든 열 기본 너비
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

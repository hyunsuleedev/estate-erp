import {
  CHANGE_REQUEST_STATUS_LABELS,
  advertisementTransactionType,
  changeRequestSummary,
  failedChangeRequests,
  pendingChangeRequests,
} from "./my-ads-link";
import { draftLines, flagBlockReason } from "./my-ads-modes";
import { useMyAdsTableState } from "./my-ads-table-context";
import {
  useId,
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
  Send,
  ServerCog,
  X,
} from "lucide-react";
import type {
  ListingAdvertisementWithListing,
  OfficeAdvertisement,
} from "@estate-erp/api-client";
import {
  analyzeOfficeAdvertisementRow,
} from "@estate-erp/api-client";
import { inferOfficeAdvertisementFloorExposureMode } from "@estate-erp/shared";
import { cn } from "@/lib/utils";
import {
  formatMoney,
  formatRelativeDay,
  formatRelativeDayTime,
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
  getCachedComparison,
  getCanonicalLocation,
  resolvedNaverUrl,
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
import { advertisementLocationLabel } from "./my-ads-location";

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
  const group = advertisement.comparison;
  const comparison = getCachedComparison(advertisement);
  const transactionType = advertisementTransactionType(advertisement) ?? undefined;
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
    own: group?.ownAdvertisement ?? null,
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
  const { own, comparison, signal, rows, summary } = useMemo(
    () => buildAnalysis(advertisement),
    [advertisement],
  );
  const panelId = useId();
  const { user } = useAuth();
  const { preferences, updatePreferences } = useCompetitorTablePreferences(
    user?.office?.id ?? "local",
    user?.id ?? "guest",
  );
  const [previewWidths, setPreviewWidths] =
    useState<CompetitorColumnWidths | null>(null);
  // 매물관리의 매칭 펼침처럼 한 번에 한 탭만 본다: 판단(비교 분석) / 근거가 되는 광고 목록(비교 광고)
  // 탭은 화면이 들고 있다: 변경 요청 모드에서 칸을 고치면 그 줄이 펼쳐지며 요청 탭이 열린다
  const {
    panelTab: activeTab,
    onPanelTabChange: setActiveTab,
    drafts,
  } = useMyAdsTableState();
  const requestCount =
    draftLines(advertisement, drafts[advertisement.id]).length +
    pendingChangeRequests(advertisement).length;
  const layout = getCompetitorTableLayout(previewWidths ?? preferences.widths);
  const sortedRows = useMemo(
    () => sortCompetitorRows(rows, preferences.sort),
    [rows, preferences.sort],
  );
  const setSort = (sort: CompetitorTableSort) =>
    updatePreferences((current) => ({ ...current, sort }));
  const locationLabel = advertisementLocationLabel(advertisement);

  const floorExposureDetail =
    comparison.ownFloorExposureMode === "exact"
      ? "정확한 층 공개"
      : comparison.ownFloorExposureMode === "band"
        ? comparison.exactFloorCompetitorCount > 0
          ? `구간만 공개 · 정확히 공개한 경쟁 광고 ${comparison.exactFloorCompetitorCount}건`
          : "저·중·고 구간만 공개"
        : "층 노출 방식 미확인";

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
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <div role="tablist" aria-label="네이버 비교" className="flex shrink-0 items-center gap-1">
              <AnalysisPanelTabButton
                id={`${panelId}-tab-analysis`}
                controls={`${panelId}-analysis`}
                icon={<BarChart3 />}
                label="비교 분석"
                active={activeTab === "analysis"}
                onSelect={() => setActiveTab("analysis")}
              />
              <AnalysisPanelTabButton
                id={`${panelId}-tab-ads`}
                controls={`${panelId}-ads`}
                icon={<Megaphone />}
                label="비교 광고"
                // 경쟁 광고 수만 센다(표의 "내 광고" 줄은 빼고)
                count={summary.competitorCount}
                active={activeTab === "ads"}
                onSelect={() => setActiveTab("ads")}
              />
              <AnalysisPanelTabButton
                id={`${panelId}-tab-requests`}
                controls={`${panelId}-requests`}
                icon={<Send />}
                label="요청"
                // 작성 중인 것과 걸려 있는 것을 함께 센다. 없으면 수를 붙이지 않는다
                count={requestCount > 0 ? requestCount : undefined}
                active={activeTab === "requests"}
                onSelect={() => setActiveTab("requests")}
              />
            </div>
            <span
              className="ml-1.5 truncate text-[13px] leading-5 text-muted-foreground"
              title={locationLabel}
            >
              {locationLabel}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2.5 text-[13px] font-normal"
              onClick={onEditAdvertisement}
            >
              <Pencil className="size-3.5" />
              광고 수정
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
            {(() => {
              const naverUrl = resolvedNaverUrl(advertisement);
              if (!naverUrl) return null;
              return (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 px-2.5 text-[13px] font-normal"
                  asChild
                >
                  <a
                    href={naverUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="size-3.5" />
                    네이버 원문
                  </a>
                </Button>
              );
            })()}
          </div>
        </div>
        {activeTab === "analysis" && (
        <div
          role="tabpanel"
          id={`${panelId}-analysis`}
          aria-labelledby={`${panelId}-tab-analysis`}
          data-my-ads-analysis-tab="analysis"
        >
        {/* 매물관리 매칭 펼침의 카드와 같은 틀: 왼쪽은 판단과 그 근거, 오른쪽은 견준 내 광고 */}
        <div className="mt-3 grid max-w-[940px] items-start gap-4 lg:grid-cols-2">
          <AnalysisCard
            label="비교 결과"
            head={
              <>
                <span className="font-semibold">비교 결과</span>
                <span
                  data-analysis-signal={signal.kind}
                  className={cn(STATUS_CLASS_NAME, "shrink-0", signal.className)}
                >
                  <StatusDot />
                  {signal.label}
                </span>
                {advertisement.lastCheckedAt && (
                  <span className="truncate text-xs tabular-nums text-muted-foreground">
                    {formatRelativeDayTime(advertisement.lastCheckedAt)} 읽음
                  </span>
                )}
              </>
            }
          >
            <AnalysisRow icon={<Scale />} label="판단" multiline>
              {signal.detail}
            </AnalysisRow>
            <AnalysisRow icon={<Hash />} label="노출 순위" sub={summary.rankingDetail}>
              {comparison.ownRanking != null
                ? `${comparison.ownRanking}/${comparison.totalCount ?? "?"}위`
                : null}
            </AnalysisRow>
            <AnalysisRow icon={<WonCircleIcon />} label="가격 경쟁">
              {summary.priceCompetition}
            </AnalysisRow>
            <AnalysisRow icon={<Layers />} label="층 노출" sub={floorExposureDetail}>
              {comparison.ownFloorInfo}
            </AnalysisRow>
            <AnalysisRow icon={<CalendarCheck />} label="확인일">
              {formatYmd(own?.articleConfirmYmd)}
            </AnalysisRow>
          </AnalysisCard>

          <AnalysisCard
            label="내 광고"
            head={
              <>
                <span className="font-semibold">내 광고</span>
                <span className={cn(TAG_CLASS_NAME, "shrink-0 bg-[#f1f1ef] text-[#5f5e5b]")}>
                  {cpChannelLabel(advertisement.channel)}
                </span>
              </>
            }
          >
            <AnalysisRow icon={<WonCircleIcon />} label="광고가">
              <span className="font-medium">{advertisementPriceLabel(advertisement)}</span>
            </AnalysisRow>
            <AnalysisRow icon={<Hash />} label="CP 광고번호">
              {advertisement.externalAdId}
            </AnalysisRow>
            <AnalysisRow icon={<ExternalLink />} label="네이버 번호">
              {advertisement.naverArticleNo}
            </AnalysisRow>
            <AnalysisRow icon={<Pencil />} label="메모" multiline>
              {advertisement.memo?.trim() || null}
            </AnalysisRow>
          </AnalysisCard>
        </div>

        </div>
        )}

        {activeTab === "ads" && (
        <div
          role="tabpanel"
          id={`${panelId}-ads`}
          aria-labelledby={`${panelId}-tab-ads`}
          data-my-ads-analysis-tab="ads"
        >
        <div className="mt-2 flex h-7 items-center gap-1.5 text-[13px]">
          <span className="text-muted-foreground">
            네이버에서 같은 집으로 보이는 광고입니다.
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
        )}

        {activeTab === "requests" && (
          <div
            role="tabpanel"
            id={`${panelId}-requests`}
            aria-labelledby={`${panelId}-tab-requests`}
            data-my-ads-analysis-tab="requests"
          >
            <RequestsTab advertisement={advertisement} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 요청 탭. 왼쪽은 아직 보내지 않은 것(변경 요청 모드에서 표의 칸을 고치면 쌓인다),
 * 오른쪽은 보내서 처리를 기다리는 것이다. 표의 요청 칸은 "있다"만 알리고 내용은 여기서 본다.
 */
function RequestsTab({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const {
    mode,
    drafts,
    onDropDraft,
    onToggleDraftFlag,
    onCancelRequest,
    cancellingRequestIds,
  } = useMyAdsTableState();
  const draft = drafts[advertisement.id];
  const lines = draftLines(advertisement, draft);
  const pending = pendingChangeRequests(advertisement);
  const failed = failedChangeRequests(advertisement);
  const visibleRequests = [...pending, ...failed];
  const canDraft = mode === "request";

  return (
    <div className="mt-3 grid max-w-[940px] items-start gap-4 lg:grid-cols-2">
      <AnalysisCard
        label="보낼 요청"
        head={
          <>
            <span className="font-semibold">보낼 요청</span>
            {lines.length > 0 && (
              <span className="text-xs text-muted-foreground">아직 보내지 않음</span>
            )}
          </>
        }
        footer={
          canDraft ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 text-[12.5px] text-muted-foreground">
                값 없이 요청
              </span>
              {(["readvertise", "takedown"] as const).map((flag) => {
                const blocked = flagBlockReason(advertisement, flag);
                return (
                  <Button
                    key={flag}
                    variant="outline"
                    size="sm"
                    className="h-[26px] gap-1 px-2.5 text-[12.5px] font-normal"
                    aria-pressed={Boolean(draft?.[flag])}
                    disabled={blocked !== null}
                    title={blocked ?? undefined}
                    onClick={() => onToggleDraftFlag(advertisement, flag)}
                  >
                    {draft?.[flag] && <Check className="size-3" />}
                    {flag === "readvertise" ? "재광고" : "내리기"}
                  </Button>
                );
              })}
            </div>
          ) : undefined
        }
      >
        {lines.length > 0 ? (
          lines.map((line) => (
            <AnalysisRow
              key={line.key}
              icon={<Send />}
              label={line.label}
              action={
                <button
                  type="button"
                  aria-label={`${line.label} 요청 빼기`}
                  onClick={() => onDropDraft(advertisement.id, line.key)}
                  className={rowActionClassName}
                >
                  빼기
                </button>
              }
            >
              <span className="text-info">{line.text}</span>
            </AnalysisRow>
          ))
        ) : (
          <p className="px-2 pb-1.5 pt-1 text-[13.5px] leading-5 text-muted-foreground">
            {mode === "request"
              ? "위 줄의 가격 · 월세 · 층 노출 칸을 눌러 바꿀 값을 적으세요."
              : "위쪽의 \"광고 요청\"을 누르면 여기에서 요청을 만들 수 있습니다."}
          </p>
        )}
      </AnalysisCard>

      <AnalysisCard
        label="걸려 있는 요청"
        head={
          <>
            <span className="font-semibold">걸려 있는 요청</span>
            {visibleRequests.length > 0 && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {visibleRequests.length}건
              </span>
            )}
          </>
        }
      >
        {visibleRequests.length > 0 ? (
          visibleRequests.map((request) => (
            <AnalysisRow
              key={request.id}
              icon={<Send />}
              label={REQUEST_ACTION_LABELS[request.action] ?? request.action}
              sub={[
                CHANGE_REQUEST_STATUS_LABELS[request.status] ?? request.status,
                request.failureReason ? `사유: ${request.failureReason}` : null,
                request.fulfilled === true ? "반영된 것이 확인됨" : null,
                request.assignedTo?.name
                  ? request.assignedTo.name
                  : request.assignedToId
                    ? "직원에게 맡김"
                    : "에이전트",
                formatRelativeDay(request.createdAt),
              ]
                .filter(Boolean)
                .join(" · ")}
              action={
                request.status !== "failed" ? (
                  <button
                    type="button"
                    aria-label={`${changeRequestSummary(request)} 요청 거두기`}
                    disabled={cancellingRequestIds.has(request.id)}
                    onClick={() => onCancelRequest(request)}
                    className={rowActionClassName}
                  >
                    거두기
                  </button>
                ) : undefined
              }
            >
              <span className={request.status === "failed" ? "text-destructive" : undefined}>
                {changeRequestSummary(request)}
              </span>
            </AnalysisRow>
          ))
        ) : (
          <p className="px-2 pb-1.5 pt-1 text-[13.5px] leading-5 text-muted-foreground">
            처리를 기다리는 요청이 없습니다.
          </p>
        )}
      </AnalysisCard>
    </div>
  );
}

const REQUEST_ACTION_LABELS: Record<string, string> = {
  publish: "신규 게재",
  update: "조건 변경",
  readvertise: "재광고",
  takedown: "광고 내리기",
};

const rowActionClassName =
  "mr-1 h-6 shrink-0 rounded-[5px] px-2 text-[12.5px] text-muted-foreground transition-colors hover:bg-foreground/[0.05] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-40";

type AnalysisPanelTab = "analysis" | "ads" | "requests";

/** 매물관리 매칭 펼침의 탭과 같은 모양(알약, 28px) */
function AnalysisPanelTabButton({
  id,
  controls,
  icon,
  label,
  count,
  active,
  onSelect,
}: {
  id: string;
  controls: string;
  icon: ReactNode;
  label: string;
  count?: number;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={active ? controls : undefined}
      onClick={onSelect}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active
          ? "bg-foreground/[0.07] font-medium text-foreground"
          : "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "shrink-0 [&>svg]:size-3.5",
          active ? "[&>svg]:text-foreground/70" : "[&>svg]:text-[#a3a09a]",
        )}
      >
        {icon}
      </span>
      {label}
      {count !== undefined && (
        <span
          className={cn(
            "tabular-nums",
            active ? "text-muted-foreground" : "text-muted-foreground/60",
          )}
        >
          {count}
        </span>
      )}
    </button>
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

/** 매물관리 매칭 펼침의 카드와 같은 틀(흰 판 · 옅은 테두리 · 속성 줄) */
function AnalysisCard({
  label,
  head,
  children,
  footer,
}: {
  /** 화면 낭독기용 이름 */
  label: string;
  head: ReactNode;
  children: ReactNode;
  /** 선으로 나눈 아래 칸 */
  footer?: ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className="min-w-0 overflow-hidden rounded-[10px] bg-white shadow-[0_0_0_1px_rgba(42,28,0,0.09),0_2px_4px_rgba(25,25,25,0.04),0_10px_20px_-12px_rgba(25,25,25,0.12)]"
    >
      <div className="flex min-h-[42px] items-center gap-2 px-3.5 pb-1 pt-2.5 text-sm">
        {head}
      </div>
      <dl className="px-1.5 pb-2">{children}</dl>
      {footer && (
        <div className="border-t border-border bg-muted/50 px-2.5 py-2">{footer}</div>
      )}
    </section>
  );
}

/** 속성 줄: 아이콘 + 이름 | 값(+ 흐린 덧붙임). 값이 없으면 "비어 있음" */
function AnalysisRow({
  icon,
  label,
  sub,
  multiline,
  action,
  children,
}: {
  icon: ReactNode;
  label: string;
  /** 줄 오른쪽 끝의 버튼 (빼기 · 거두기) */
  action?: ReactNode;
  /** 값 뒤에 흐리게 덧붙이는 설명 */
  sub?: string | null;
  multiline?: boolean;
  children: ReactNode;
}) {
  const isEmpty = children == null || children === "";
  return (
    <div
      className={cn(
        "grid items-center rounded-md hover:bg-foreground/[0.03]",
        action
          ? "grid-cols-[112px_minmax(0,1fr)_auto]"
          : "grid-cols-[112px_minmax(0,1fr)] items-start",
      )}
    >
      <dt className="flex min-h-8 items-center gap-2 px-2 text-sm text-muted-foreground [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-sidebar-icon">
        {icon}
        {label}
      </dt>
      <dd
        className={cn(
          "min-h-8 px-2 py-[5.5px] text-sm tabular-nums text-foreground",
          multiline
            ? "whitespace-pre-wrap break-words"
            : "flex flex-wrap items-center gap-x-2 gap-y-0.5",
        )}
      >
        {isEmpty ? (
          <span className="text-muted-foreground/70">비어 있음</span>
        ) : (
          children
        )}
        {sub && !isEmpty && (
          <span className="text-[13px] text-muted-foreground">{sub}</span>
        )}
      </dd>
      {action}
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

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { ProjectStep } from "@estate-erp/api-client";
import { ListingAvailability } from "@estate-erp/shared";
import {
  Calendar,
  Clock,
  GitBranch,
  Info,
  List,
  Megaphone,
  PencilLine,
  Ruler,
  Tag,
  Type,
  UserSearch,
} from "lucide-react";
import { api } from "@/lib/api";
import { getListingRowAvailability } from "@/lib/listing-status";
import { getStatusMeta } from "@/lib/status-config";
import { cn } from "@/lib/utils";
import { WonCircleIcon } from "@/components/domain";
import { Skeleton } from "@/components/ui/skeleton";
import { PropertyMatchPanel, getPropertyMatchCount } from "../properties/-components/property-match-panel";
import { formatPropertySpaceLabel } from "../properties/-registration-space";
import { PROPERTY_LISTING_ITEM_HEIGHT } from "../properties/-property-table-metrics";
import {
  compactMatchPanelCss,
  isAddressOnlyStepTitle,
  listingStepColumns,
  matchPanelFitFor,
  pickStepTableColumns,
  siteNameFromPlaceLabel,
  type ListingStepColumnId,
  listingRowSignature,
} from "./-project-model";
import { RefreshFailedNote } from "./-project-notes";
import { matchTableColumns } from "../properties/-components/property-match-table-state";
import { usePanelState, useElementWidth } from "./-project-panel-state";
import { DealFlowBlock } from "./-project-step-body";
import { FRESH_ON_RETURN } from "./-project-step-detail";
import {
  buildListingGroup,
  ConfirmationCellView,
  getClosedStatusCellLabel,
  getClosedStatusLabel,
  getDongName,
  getPropertyActiveAdvertisementCount,
  getSupplyAreaPyeong,
  getUnitTypeName,
  ListingPanelToggle,
  ListingStack,
  MonthlyRentValue,
  MoveInAvailableSummary,
  PriceDepositValue,
  ProjectAdPanel,
  StatusIndicator,
  TABLE_BODY_CELL,
  TABLE_CELL_DIVIDER,
  TABLE_HEADER_CELL,
  TableHeaderLabel,
  TransactionMiniLabel,
  TransactionStack,
} from "./-project-table-parts";
import { dealQueries } from "@/queries/deals";

/*
 * 매물 의뢰 단계 = 매물관리 표의 한 줄 + 매칭을 펼치면 그 줄 아래 매물관리와 같은 매칭 패널(사용자 요청 2026-11-24:
 * "매물관리 페이지를 보면 매칭 펼쳤을 때 리스트로 잘 나오잖아. 그렇게 자연스럽게"). 칸 · 머리 · 알약 · 패널은 매물관리의 것이다.
 * 카드 폭에 다 들어가지 않는 칸은 덜 중요한 것부터 뺀다(가로 스크롤을 만들지 않는다).
 */

const COLUMN_HEADERS: Record<ListingStepColumnId, { label: string; icon: ReactNode }> = {
  info: { label: "거래", icon: <Tag /> },
  site: { label: "단지", icon: <Type /> },
  dong: { label: "동", icon: <List /> },
  unit: { label: "호", icon: <List /> },
  supplyArea: { label: "공급", icon: <Ruler /> },
  unitType: { label: "타입", icon: <Tag /> },
  matching: { label: "매칭", icon: <UserSearch /> },
  advertisement: { label: "광고", icon: <Megaphone /> },
  confirmationAt: { label: "확인", icon: <Clock /> },
  listingAvailability: { label: "매물상태", icon: <Info /> },
  price: { label: "가격/보증금", icon: <WonCircleIcon /> },
  monthlyRent: { label: "월세", icon: <WonCircleIcon /> },
  moveInAvailable: { label: "입주가능일", icon: <Calendar /> },
  memo: { label: "의뢰 메모", icon: <PencilLine /> },
};

// 카드 폭이 모자랄 때 매칭 패널의 칸을 감추는 CSS(-project-model의 compactMatchPanelCss). 패널의 칸 정의에서 만든다.
const COMPACT_MATCH_PANEL_CSS = compactMatchPanelCss(matchTableColumns);

/** 매물관리 표에 실리는 모양의 의뢰(조건마다 진행 중인 매칭 수 · 게재 중인 광고 포함). 단건 조회에는 이것이 없다. */
function useListingRow(step: ProjectStep) {
  const intake = step.listingIntake;
  return useQuery({
    queryKey: ["listing-intakes", "project-row", intake?.id],
    queryFn: async () => {
      const page = await api.listingIntakes.findAll({ propertyId: intake!.propertyId, includeClosed: true, limit: 50 });
      const row = page.items.find((item) => item.id === intake!.id);
      if (!row) throw new Error("의뢰를 찾지 못했습니다");
      return buildListingGroup(row);
    },
    enabled: Boolean(intake),
    ...FRESH_ON_RETURN,
  });
}

/**
 * 매칭 패널에서 일어난 일을 프로젝트에도 반영한다.
 *
 * 매물관리의 매칭 패널(PropertyMatchPanel)은 자기 일(단계 바꾸기, 고객 연결, 거래 전환)을 한 뒤
 * 매칭과 매물 의뢰만 다시 읽는다. 프로젝트의 진행 계획은 다시 읽지 않아서, 패널에서 거래로 넘겨도
 * 이 화면의 단계 상태 · 거래 흐름 · 거래·보수 탭 · 탭의 숫자가 그대로 남는다(패널은 다른 화면의 부품이라 고칠 수 없다).
 * 그래서 이 줄이 다시 읽혀 **달라졌을 때** 진행 계획과 거래를 다시 읽게 한다. 처음 읽은 것과 달라지지 않은
 * 다시 읽기(돌아올 때마다 하는 것)에는 아무것도 하지 않는다.
 */
function useRefreshPlanWhenListingChanges(group: ReturnType<typeof buildListingGroup> | null) {
  const queryClient = useQueryClient();
  const signature = group ? listingRowSignature(group) : null;
  const previous = useRef<string | null>(null);
  useEffect(() => {
    if (signature === null) return;
    if (previous.current !== null && previous.current !== signature) {
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      // 매물 줄이 달라졌을 때 거래만 다시 읽는다. 매물 쪽까지 다시 받게 하면(invalidateDealData) 이 줄이 다시 달라져 되풀이된다.
      void queryClient.invalidateQueries({ queryKey: dealQueries.all });
    }
    previous.current = signature;
  }, [queryClient, signature]);
}

/**
 * 단계 이름이 주소를 되풀이할 뿐이면 첫 줄을 표 안으로 합친다(이름 줄을 따로 두지 않는다).
 * 의뢰의 이름표(label)는 서버가 단계 기본 이름을 만들 때와 같은 주소 표기("고덕그라시움 101동 3501호")다.
 */
export function isListingTitleMerged(step: ProjectStep) {
  const label = step.listingIntake?.label?.trim();
  if (!label) return false;
  return isAddressOnlyStepTitle(step.title, { siteName: siteNameFromPlaceLabel(label), placeLabel: label });
}

export function ListingStepTable({
  step,
  controls,
  onOpenDeals,
}: {
  step: ProjectStep;
  /** 머리 줄 오른쪽 끝에 얹을 단계의 단추(이름을 따로 보이지 않을 때: 목표일 · 메모 · ↗ · ⋯) */
  controls?: ReactNode;
  onOpenDeals: () => void;
}) {
  const rowQuery = useListingRow(step);
  const group = rowQuery.data ?? null;
  useRefreshPlanWhenListingChanges(group);
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const matchCount = group ? getPropertyMatchCount(group) : 0;
  // 진행 중인 매칭이 있으면 처음부터 펼쳐 둔다. 접고 펼친 것은 이 화면에 머무는 동안 남는다.
  const [savedPanel, setPanel] = usePanelState<"match" | "ad" | null>(`listing-panel:${step.id}`);
  const panel = savedPanel === undefined ? (matchCount > 0 ? "match" : null) : savedPanel;
  const toggle = (tab: "match" | "ad") => setPanel(panel === tab ? null : tab);

  const listings = group?.listings ?? [];
  const hasMonthly = listings.some((listing) => listing.transactionType === "monthly");
  const fit = pickStepTableColumns(listingStepColumns(hasMonthly), Math.max(0, width));
  const template = [...fit.visible.map((id) => `${fit.widths[id]}px`), "minmax(0,1fr)"].join(" ");
  const gridStyle = { gridTemplateColumns: template } as CSSProperties;
  const rowHeight = Math.max(1, listings.length) * PROPERTY_LISTING_ITEM_HEIGHT;
  const intake = group?.representative;
  const availability = intake
    ? getListingRowAvailability(
        intake,
        listings.map((listing) => ({ ...listing, intake: { lifecycleStatus: intake.lifecycleStatus } })),
      )
    : null;
  const dealStage = step.deal && !step.deal.isCancelled ? step.deal.stage : null;

  const cell = (id: ListingStepColumnId): ReactNode => {
    if (!group || !intake) return null;
    switch (id) {
      case "info":
        return <TransactionStack listings={listings} />;
      case "site":
        return (
          <span className="block truncate text-[14px] font-medium leading-[21px] text-foreground">
            {group.property?.site?.name ?? "매물 정보 없음"}
          </span>
        );
      case "dong":
        return (
          <span className="truncate text-[14px] font-medium leading-[21px] text-foreground">
            {getDongName(group.property)}
          </span>
        );
      case "unit": {
        const label = formatPropertySpaceLabel(group.property?.unit, group.property?.site?.type);
        return (
          <span title={label || undefined} className="block min-w-0 truncate text-[14px] font-medium leading-[21px] text-foreground">
            {label}
          </span>
        );
      }
      case "supplyArea":
        return <span className="truncate text-[14px] leading-[21px] text-foreground tabular-nums">{getSupplyAreaPyeong(group.property)}</span>;
      case "unitType":
        return <span className="truncate text-[14px] leading-[21px] text-foreground">{getUnitTypeName(group.property)}</span>;
      case "matching":
        return (
          <div className="-mx-2.5 flex h-full flex-1 items-center justify-center">
            <ListingPanelToggle
              count={matchCount}
              icon={<GitBranch className="size-3" />}
              isOpen={panel === "match"}
              panelId={`property-expand-panel-${group.id}`}
              label="연결 구매고객"
              onToggle={() => toggle("match")}
            />
          </div>
        );
      case "advertisement":
        return (
          <div className="-mx-2.5 flex h-full flex-1 items-center justify-center">
            <ListingPanelToggle
              count={getPropertyActiveAdvertisementCount(group)}
              icon={<Megaphone className="size-3" />}
              isOpen={panel === "ad"}
              panelId={`property-expand-panel-${group.id}`}
              label="광고 현황"
              onToggle={() => toggle("ad")}
            />
          </div>
        );
      case "confirmationAt":
        return <ConfirmationCellView intake={intake} />;
      case "listingAvailability":
        return (
          <span data-project-listing-status className="flex min-w-0 items-center gap-1.5">
            <StatusIndicator
              value={availability ?? ListingAvailability.AVAILABLE}
              label={availability === ListingAvailability.CLOSED ? getClosedStatusCellLabel(intake.closedReason) : undefined}
              title={availability === ListingAvailability.CLOSED ? getClosedStatusLabel(intake.closedReason) : undefined}
            />
            {/* 거래가 있으면 패널을 접어도 지금 거래 단계가 보이게(매물관리 표의 "거래 중" 옆에) */}
            {dealStage && (
              <span data-project-listing-deal-stage className="min-w-0 truncate text-[12.5px] text-muted-foreground">
                {getStatusMeta("dealStage", dealStage).label}
              </span>
            )}
          </span>
        );
      case "price":
        return (
          <ListingStack listings={listings}>
            {(listing, hasMultiple) => (
              <span className="flex h-full w-full items-center gap-1.5">
                {hasMultiple && (
                  <TransactionMiniLabel
                    transactionType={listing.transactionType}
                    className="h-5 py-0 text-[14px] font-[450] leading-5"
                  />
                )}
                <PriceDepositValue listing={listing} />
              </span>
            )}
          </ListingStack>
        );
      case "monthlyRent":
        return <ListingStack listings={listings}>{(listing) => <MonthlyRentValue listing={listing} />}</ListingStack>;
      case "moveInAvailable":
        return <ListingStack listings={listings}>{(listing) => <MoveInAvailableSummary listing={listing} />}</ListingStack>;
      case "memo":
        return (
          <span className="block min-w-0 py-[7.5px] text-[14px] font-[450] leading-[21px] text-foreground">
            <span className="line-clamp-2">{intake.memo?.trim() || <span className="text-muted-foreground">-</span>}</span>
          </span>
        );
    }
  };

  return (
    <div ref={ref} data-project-listing-table className={cn("min-w-0", fit.overflow && "overflow-x-auto")}>
      <div role="table" aria-label="매물 의뢰" style={fit.overflow ? { minWidth: "max-content" } : undefined}>
        <div role="row" data-project-table-header className="relative grid border-b border-border bg-white" style={gridStyle}>
          {fit.visible.map((id, index) => (
            <div
              key={id}
              role="columnheader"
              className={cn(TABLE_HEADER_CELL, index < fit.visible.length - 1 && TABLE_CELL_DIVIDER)}
            >
              <TableHeaderLabel icon={COLUMN_HEADERS[id].icon} label={COLUMN_HEADERS[id].label} />
            </div>
          ))}
          <div aria-hidden="true" />
          {controls}
        </div>
        {rowQuery.isPending ? (
          <div className="flex h-[37px] items-center border-b border-border px-2.5">
            <Skeleton className="h-5 w-full max-w-[420px]" />
          </div>
        ) : !group ? (
          <p className="flex h-[37px] items-center border-b border-border px-2.5 text-[13px] text-muted-foreground">
            매물을 불러오지 못했습니다&nbsp;·&nbsp;
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => void rowQuery.refetch()}>
              다시 시도
            </button>
          </p>
        ) : (
          <div
            role="row"
            data-project-listing-row
            className="group grid border-b border-border hover:bg-muted/70"
            style={{ ...gridStyle, minHeight: rowHeight + 1 }}
          >
            {fit.visible.map((id, index) => (
              <div
                key={id}
                role="cell"
                data-column-id={id}
                className={cn(TABLE_BODY_CELL, index < fit.visible.length - 1 && TABLE_CELL_DIVIDER)}
              >
                {cell(id)}
              </div>
            ))}
            <div aria-hidden="true" />
          </div>
        )}
      </div>
      {group && rowQuery.isError && (
        // 읽어 둔 줄이 있는데 다시 읽기에 실패했다. 보이는 상태·가격·매칭 수가 예전 것일 수 있다.
        <div className="px-2.5 py-1">
          <RefreshFailedNote what="최신 매물 정보를" onRetry={() => void rowQuery.refetch()} />
        </div>
      )}
      {group && panel && (
        <div data-project-match-panel={matchPanelFitFor(width)}>
          <style>{COMPACT_MATCH_PANEL_CSS}</style>
          <PropertyMatchPanel
            group={group}
            activeTab={panel}
            onTabChange={(_groupId, tab) => setPanel(tab)}
            adPanel={(adControls) => <ProjectAdPanel group={group} controls={adControls} />}
          />
        </div>
      )}
      <DealFlowBlock step={step} onOpenDeals={onOpenDeals} variant="table" />
    </div>
  );
}

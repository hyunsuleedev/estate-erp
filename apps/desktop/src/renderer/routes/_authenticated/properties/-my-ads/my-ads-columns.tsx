import { advertisementPlace, advertisementTransactionType } from "./my-ads-link";
import { Link } from "@tanstack/react-router";
import type { ColumnDef } from "@tanstack/react-table";
import {
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  Eye,
  Hash,
  Home,
  Layers3,
  Link2,
  Megaphone,
  Ruler,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import type { ListingAdvertisementWithListing } from "@estate-erp/api-client";
import { cn } from "@/lib/utils";
import { formatRelativeDay } from "@/lib/format";
import { PROPERTY_TABLE_TAG_CLASS_NAME, rankTone } from "./my-ads-pill";
import { getCachedComparison, getCanonicalLocation } from "./my-ads-format";
import { advertisementCheckedAtTime } from "./my-ads-sort";
import {
  advertisementLocationLabel,
  MY_ADS_INSPECTOR_ID,
  myAdsAnalysisPanelId,
} from "./my-ads-location";
import {
  MAX_MY_ADS_COLUMN_WIDTH,
  MY_ADS_FILL_COLUMN,
  myAdsDefaultColumnWidth,
  myAdsMinColumnWidth,
  type MyAdsResizableColumnId,
} from "./my-ads-table-state";
import {
  AdvertisementExposurePeriodCell,
  CellText,
  ChangeRequestCell,
  ComparisonSignalCell,
  CpAdvertisementCell,
  EmptyCellValue,
  FloorExposureCell,
  InlineMonthlyRentCell,
  InlinePriceCell,
  LinkStatusCell,
  NaverAdvertisementCell,
  PropertyTableTransactionBadge,
  TableHeaderLabel,
  VerificationMethodCell,
  WonCircleIcon,
} from "./my-ads-cells";
import { myAdsRankingPendingLabel } from "./my-ads-manual-ad-state";
import { useMyAdsTableState } from "./my-ads-table-context";
import { RowOpenButton } from "@/components/domain";

/** 열 기본 너비·최소·최대는 저장값 검사(my-ads-table-state.ts)와 한곳에서 정한다. */
function columnWidth(id: MyAdsResizableColumnId) {
  return {
    size: myAdsDefaultColumnWidth(id),
    minSize: myAdsMinColumnWidth(id),
    maxSize: MAX_MY_ADS_COLUMN_WIDTH,
  };
}

function LocationText({
  value,
  className,
}: {
  value: string | null;
  className?: string;
}) {
  return value ? (
    <CellText title={value} className={className}>
      {value}
    </CellText>
  ) : (
    <EmptyCellValue />
  );
}

/** CP가 적은 글에서 온 값의 색. 우리 데이터로 확인된 값과 눈으로 갈린다 */
const fromAdTextClassName = "text-muted-foreground";

/** 동 · 층 · 호. 관리 공간과 이어지지 않은 광고는 CP가 적은 글을 흐리게 보여 준다 */
function AdvertisementLocationText({
  advertisement,
  part,
  className,
}: {
  advertisement: ListingAdvertisementWithListing;
  part: "dong" | "floor" | "ho";
  className?: string;
}) {
  const location = getCanonicalLocation(advertisement);
  const value = location[part];
  if (!value) return <EmptyCellValue />;
  return (
    <CellText
      title={location.isUnitFromAd ? `CP 표기: ${value}` : value}
      className={cn(className, location.isUnitFromAd && fromAdTextClassName)}
    >
      {value}
    </CellText>
  );
}

/**
 * 단지 칸. 매물관리 표와 같다: 이름은 그 매물로 가는 링크이고, 줄에 올리면 뜨는 "열기"가 옆 상세 패널을 연다.
 * 열림 상태는 표 상태 컨텍스트에서 읽는다(열 정의가 열림에 따라 바뀌지 않게).
 */
function SiteCell({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const { peekId, onTogglePeek } = useMyAdsTableState();
  const location = getCanonicalLocation(advertisement);
  const siteName = location.site;
  const place = advertisementPlace(advertisement);
  return (
    <>
      {place ? (
        <Link
          to="/properties/$id"
          params={{ id: place.id }}
          title={siteName}
          onClick={(event) => event.stopPropagation()}
          className="block truncate font-medium text-foreground hover:text-info hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/35"
        >
          {siteName}
        </Link>
      ) : (
        // 우리 데이터에서 찾지 못한 건물은 CP가 적은 이름을 흐리게 보여 준다
        <CellText
          title={location.isSiteFromAd ? `CP 표기: ${siteName}` : siteName}
          className={cn("font-medium", location.isSiteFromAd && fromAdTextClassName)}
        >
          {siteName}
        </CellText>
      )}
      <RowOpenButton
        label={advertisementLocationLabel(advertisement)}
        current={peekId === advertisement.id}
        controls={MY_ADS_INSPECTOR_ID}
        onToggle={() => onTogglePeek(advertisement)}
      />
    </>
  );
}

/** 랭킹 칸의 펼침 버튼. 펼침 상태는 표 상태 컨텍스트에서 읽는다(열 정의가 펼침에 따라 바뀌지 않게). */
function AnalysisToggleButton({
  advertisement,
}: {
  advertisement: ListingAdvertisementWithListing;
}) {
  const { expandedIds, onToggleExpanded } = useMyAdsTableState();
  const ranking =
    advertisement.comparison?.ownAdvertisement?.ranking;
  const comparison = getCachedComparison(advertisement);
  const expanded = expandedIds.has(advertisement.id);
  const rankingLabel =
    ranking != null
      ? `${ranking}/${comparison.totalCount ?? "?"}위`
      : myAdsRankingPendingLabel(advertisement);
  return (
    <button
      type="button"
      data-my-ads-expand-toggle={advertisement.id}
      aria-label={`${advertisementLocationLabel(advertisement)} 네이버 비교 상세, ${rankingLabel}`}
      aria-expanded={expanded}
      aria-controls={
        expanded ? myAdsAnalysisPanelId(advertisement.id) : undefined
      }
      onClick={(event) => {
        event.stopPropagation();
        onToggleExpanded(advertisement.id, event.currentTarget);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      className={cn(
        PROPERTY_TABLE_TAG_CLASS_NAME,
        "min-w-0 gap-1 tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/35",
        rankTone(ranking),
      )}
    >
      <span className="truncate">{rankingLabel}</span>
      {expanded ? (
        <ChevronUp aria-hidden="true" className="size-3 shrink-0" />
      ) : (
        <ChevronDown aria-hidden="true" className="size-3 shrink-0" />
      )}
    </button>
  );
}

/**
 * 표 열 정의. 열 구성(광고 정보 묶음 접힘)만 받는다 — 선택·펼침·인라인 수정값은
 * MyAdsTableStateContext로 칸에 건넨다. 여기에 바뀌는 상태를 넣으면 값이 바뀔 때마다
 * 모든 칸이 새로 마운트되어 입력 중인 가격 칸의 포커스가 빠진다.
 */
export function buildColumns({
  areAdvertisementSourceColumnsCollapsed,
  hasMultipleCpAccounts = false,
}: {
  areAdvertisementSourceColumnsCollapsed: boolean;
  hasMultipleCpAccounts?: boolean;
}): ColumnDef<ListingAdvertisementWithListing, unknown>[] {
  return [
    {
      id: "site",
      ...columnWidth("site"),
      header: () => (
        <TableHeaderLabel
          icon={<Building2 className="size-4" />}
          label="단지"
        />
      ),
      cell: ({ row }) => <SiteCell advertisement={row.original} />,
    },
    {
      id: "dong",
      ...columnWidth("dong"),
      header: () => (
        <TableHeaderLabel icon={<Hash className="size-4" />} label="동" />
      ),
      cell: ({ row }) => (
        <AdvertisementLocationText
          advertisement={row.original}
          part="dong"
          className="font-medium"
        />
      ),
    },
    {
      id: "floor",
      ...columnWidth("floor"),
      header: () => (
        <TableHeaderLabel icon={<Layers3 className="size-4" />} label="층" />
      ),
      cell: ({ row }) => (
        <AdvertisementLocationText
          advertisement={row.original}
          part="floor"
          className="tabular-nums"
        />
      ),
    },
    {
      id: "ho",
      ...columnWidth("ho"),
      header: () => (
        <TableHeaderLabel icon={<DoorOpen className="size-4" />} label="호" />
      ),
      cell: ({ row }) => (
        <AdvertisementLocationText
          advertisement={row.original}
          part="ho"
          className="font-medium"
        />
      ),
    },
    {
      id: "type",
      ...columnWidth("type"),
      header: () => (
        <TableHeaderLabel icon={<Ruler className="size-4" />} label="타입" />
      ),
      cell: ({ row }) => (
        <LocationText value={getCanonicalLocation(row.original).type} />
      ),
    },
    {
      id: "link",
      ...columnWidth("link"),
      header: () => (
        <TableHeaderLabel icon={<Home className="size-4" />} label="연결" />
      ),
      cell: ({ row }) => <LinkStatusCell advertisement={row.original} />,
    },
    {
      id: "transaction",
      ...columnWidth("transaction"),
      header: () => (
        <TableHeaderLabel icon={<Tag className="size-4" />} label="거래" />
      ),
      cell: ({ row }) =>
        advertisementTransactionType(row.original) ? (
          <PropertyTableTransactionBadge
            transactionType={advertisementTransactionType(row.original) ?? ""}
          />
        ) : (
          <EmptyCellValue />
        ),
    },
    {
      id: "price",
      ...columnWidth("price"),
      header: () => (
        <TableHeaderLabel
          icon={<WonCircleIcon className="size-4" />}
          label="가격/보증금"
        />
      ),
      cell: ({ row }) => <InlinePriceCell advertisement={row.original} />,
    },
    {
      id: "monthlyRent",
      ...columnWidth("monthlyRent"),
      header: () => (
        <TableHeaderLabel
          icon={<WonCircleIcon className="size-4" />}
          label="월세"
        />
      ),
      cell: ({ row }) => <InlineMonthlyRentCell advertisement={row.original} />,
    },
    ...(!areAdvertisementSourceColumnsCollapsed
      ? ([
          {
            id: "channel",
            ...columnWidth("channel"),
            header: () => (
              <TableHeaderLabel
                icon={<Megaphone className="size-4" />}
                label="CP사"
              />
            ),
            cell: ({ row }) => (
              <CpAdvertisementCell advertisement={row.original} />
            ),
          },
          ...(hasMultipleCpAccounts
            ? ([
                {
                  id: "cpAccount",
                  ...columnWidth("cpAccount"),
                  header: () => (
                    <TableHeaderLabel
                      icon={<Megaphone className="size-4" />}
                      label="CP 계정"
                    />
                  ),
                  cell: ({ row }) => {
                    const account = row.original.cpAccount;
                    if (!account) return <EmptyCellValue />;
                    const label = account.accountName || account.accountKey;
                    return (
                      <CellText title={`${account.accountKey}${account.accountName ? ` (${account.accountName})` : ""}`}>
                        {label}
                      </CellText>
                    );
                  },
                },
              ] satisfies ColumnDef<ListingAdvertisementWithListing, unknown>[])
            : []),
          {
            id: "naver",
            ...columnWidth("naver"),
            enableSorting: false,
            header: () => (
              // CP사 머리글이 필터 칩과 같은 확성기 아이콘을 쓰므로 링크는 링크 아이콘으로 구분한다.
              <TableHeaderLabel
                icon={<Link2 className="size-4" />}
                label="링크"
              />
            ),
            cell: ({ row }) => (
              <NaverAdvertisementCell advertisement={row.original} />
            ),
          },
          {
            id: "verification",
            ...columnWidth("verification"),
            header: () => (
              <TableHeaderLabel
                icon={<ShieldCheck className="size-4" />}
                label="검증방식"
              />
            ),
            cell: ({ row }) => (
              <VerificationMethodCell advertisement={row.original} />
            ),
          },
          {
            id: "exposurePeriod",
            ...columnWidth("exposurePeriod"),
            header: () => (
              <TableHeaderLabel
                icon={<CalendarDays className="size-4" />}
                label="노출기간"
              />
            ),
            cell: ({ row }) => (
              <AdvertisementExposurePeriodCell advertisement={row.original} />
            ),
          },
        ] satisfies ColumnDef<ListingAdvertisementWithListing, unknown>[])
      : []),
    {
      id: "request",
      ...columnWidth("request"),
      header: () => (
        <TableHeaderLabel
          icon={<ClipboardList className="size-4" />}
          label="요청"
        />
      ),
      cell: ({ row }) => <ChangeRequestCell advertisement={row.original} />,
    },
    {
      id: "ranking",
      ...columnWidth("ranking"),
      header: () => (
        <TableHeaderLabel
          icon={<BarChart3 className="size-4" />}
          label="랭킹·중복"
        />
      ),
      cell: ({ row }) => <AnalysisToggleButton advertisement={row.original} />,
    },
    {
      id: "floorExposure",
      ...columnWidth("floorExposure"),
      header: () => (
        <TableHeaderLabel icon={<Eye className="size-4" />} label="층수노출" />
      ),
      cell: ({ row }) => <FloorExposureCell advertisement={row.original} />,
    },
    {
      id: "checkedAt",
      ...columnWidth("checkedAt"),
      header: () => (
        <TableHeaderLabel
          icon={<ClipboardCheck className="size-4" />}
          label="확인일"
        />
      ),
      // 네이버 확인일(YYYYMMDD)과 ERP 비교 시각(ISO)을 같은 기준으로 바꿔 같은 모양(26.11.15)으로 보인다.
      cell: ({ row }) => {
        const checkedAt = advertisementCheckedAtTime(row.original);
        return checkedAt == null ? (
          <EmptyCellValue />
        ) : (
          <CellText className="tabular-nums">
            {formatRelativeDay(checkedAt)}
          </CellText>
        );
      },
    },
    {
      id: "analysis",
      size: MY_ADS_FILL_COLUMN.width,
      minSize: MY_ADS_FILL_COLUMN.minWidth,
      enableResizing: false,
      meta: { fill: true },
      header: () => (
        <TableHeaderLabel
          icon={<Sparkles className="size-4" />}
          label="경쟁 대비"
        />
      ),
      // 판단("가격을 내려라")이 아니라 관측된 사실만 보여준다 — 가격 결정은
      // 소유자 사정에 달려 있어 사람이 한다.
      cell: ({ row }) => <ComparisonSignalCell advertisement={row.original} />,
    },
  ];
}

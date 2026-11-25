import { useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import {
  CalendarDays,
  Eye,
  ListFilter,
  Loader2,
  Megaphone,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Tag,
} from "lucide-react";
import { type MultiSelectOption } from "@/components/ui/multi-select";
import { cn } from "@/lib/utils";
import {
  ChecklistFilterPanel,
  summarizeSelection,
  toolbarGhostButtonClassName,
  ToolbarFilterChip,
  ToolbarPillTabs,
  ToolbarSearchBar,
  ToolbarSelectPanel,
} from "../-components/property-toolbar";
import {
  formatPriceRangeLabel,
  MONTHLY_RENT_RANGE_MAX,
  MONTHLY_RENT_RANGE_MIN,
  MONTHLY_RENT_RANGE_PRESETS,
  NumericRangeFilterPanel,
  PRICE_RANGE_MAX,
  PRICE_RANGE_MIN,
  PRICE_RANGE_PRESETS,
} from "../-components/numeric-range-filter";
import {
  amountFilterToEokRange,
  formatMonthlyRentFilterLabel,
  monthlyRentFilterToRange,
  myAdsAmountRangeSummary,
  shouldShowMonthlyRentFilter,
} from "./my-ads-filters";
// 가격·월세 칩 아이콘. 표 머리글과 같은 원화 모양이다(lucide에는 원화 기호가 없다).
import { WonCircleIcon } from "./my-ads-cells";
import {
  channelFilterOptions,
  comparisonFilterOptions,
  exposurePeriodFilterOptions,
  floorExposureFilterOptions,
  statusFilterOptions,
  transactionFilterOptions,
  verificationFilterOptions,
  viewTabs,
  type MyAdsFilterOption,
  type MyAdsFilterState,
  type MyAdsView,
} from "./my-ads-types";

export type MyAdsToolbarProps = {
  view: MyAdsView;
  /** 탭 옆 개수. null이면(목록을 받은 적 없음: 첫 로딩·오류) 개수를 그리지 않는다. */
  counts: Record<MyAdsView, number> | null;
  onViewChange: (next: MyAdsView) => void;
  search: string;
  onSearchChange: (value: string) => void;
  siteFilterOptions: MultiSelectOption[];
  channelOptions?: MyAdsFilterOption[];
  cpAccountOptions?: MyAdsFilterOption[];
  isSiteFilterOpen: boolean;
  onSiteFilterOpenChange: (open: boolean) => void;
  filters: MyAdsFilterState;
  updateMyAdsFilter: <K extends keyof MyAdsFilterState>(
    field: K,
    value: MyAdsFilterState[K],
  ) => void;
  updateMyAdsRangeFilter: (
    kind: "primary" | "monthlyRent",
    minValue: string,
    maxValue: string,
  ) => void;
  isFetching: boolean;
  hasActiveFilters: boolean;
  onFiltersReset: () => void;
  /** 1행 오른쪽 끝(매물관리의 등록 버튼 자리)에 페이지가 꽂는 버튼. 없으면 아무것도 그리지 않는다. */
  trailingActions?: ReactNode;
};

/** 필터 칩을 여는 버튼. 값이 없을 때의 이름이라 ✕로 지운 뒤에 찾는다. */
const chipTriggerSelector = (label: string) =>
  `button[aria-label="${label} 필터"]`;

const rangeFilterContentClassName =
  "w-[430px] max-w-[calc(100vw-24px)] overflow-hidden p-0";

export function MyAdsToolbar({
  view,
  counts,
  onViewChange,
  search,
  onSearchChange,
  siteFilterOptions,
  channelOptions = channelFilterOptions,
  cpAccountOptions = [],
  isSiteFilterOpen,
  onSiteFilterOpenChange,
  filters,
  updateMyAdsFilter,
  updateMyAdsRangeFilter,
  isFetching,
  hasActiveFilters,
  onFiltersReset,
  trailingActions,
}: MyAdsToolbarProps) {
  // 필터 줄(둘째 줄) 접기. 매물관리와 같이 기본은 펼침이고 저장하지 않는다.
  const [isFilterRowOpen, setIsFilterRowOpen] = useState(true);
  const findRowRef = useRef<HTMLDivElement>(null);
  const filterRailRef = useRef<HTMLElement>(null);

  /**
   * ✕·초기화 버튼은 누르면 사라져 포커스가 본문으로 빠진다. 바뀐 툴바를 바로 그린 뒤
   * 대신할 버튼(같은 칩, 그 칩도 사라졌으면 다음 후보)으로 포커스를 옮긴다.
   */
  const clearAndRefocus = (clear: () => void, targets: string[]) => {
    flushSync(clear);
    for (const selector of targets) {
      const target =
        filterRailRef.current?.querySelector<HTMLElement>(selector) ??
        findRowRef.current?.querySelector<HTMLElement>(selector);
      if (target) {
        target.focus();
        return;
      }
    }
  };
  const clearChip = (label: string, clear: () => void, fallbackLabel?: string) =>
    clearAndRefocus(clear, [
      chipTriggerSelector(label),
      ...(fallbackLabel ? [chipTriggerSelector(fallbackLabel)] : []),
    ]);
  const resetFilters = () =>
    clearAndRefocus(onFiltersReset, [
      // 필터 줄의 초기화는 그 줄의 첫 칩으로, 접힌 줄 대신 1행에 있던 초기화는 필터 줄 버튼으로
      ...(isFilterRowOpen ? [chipTriggerSelector("거래")] : []),
      "button[data-my-ads-filter-row-toggle]",
    ]);
  const primaryAmountSummary =
    filters.primaryAmountMin || filters.primaryAmountMax
      ? myAdsAmountRangeSummary(
          filters.primaryAmountMin,
          filters.primaryAmountMax,
        )
      : null;
  const monthlyRentSummary =
    filters.monthlyRentMin || filters.monthlyRentMax
      ? myAdsAmountRangeSummary(filters.monthlyRentMin, filters.monthlyRentMax)
      : null;

  // 불러오는 중 · 초기화. 매물관리처럼 필터 줄 오른쪽 끝에 두고,
  // 필터 줄이 접혀 있을 때는 찾기 줄 오른쪽으로 옮겨 계속 보이게 한다.
  // 높이를 칩(28px)에 맞춰 두어 회전 표시만 있을 때도 첫 칩 줄과 가운데가 맞는다.
  const filterRowActions = (
    <div className="flex min-h-7 shrink-0 items-center gap-0.5">
      {isFetching && (
        <Loader2
          aria-label="불러오는 중"
          className="mx-1 size-3.5 animate-spin text-muted-foreground"
        />
      )}
      {hasActiveFilters && (
        <button
          type="button"
          aria-label="내 광고 필터 초기화"
          title="필터 초기화"
          className={cn(toolbarGhostButtonClassName, "rounded-full")}
          onClick={resetFilters}
        >
          <RotateCcw className="size-3.5" />
          {/* 1행으로 옮겨 왔을 때 줄이 좁으면 아이콘만 남긴다(필터 줄은 find 컨테이너 밖이라 늘 글자를 보인다) */}
          <span className="@max-[56rem]/find:hidden">초기화</span>
        </button>
      )}
    </div>
  );

  return (
    <>
      {/* 매물관리와 같은 2줄 툴바: 1행 찾기, 2행 좁히기. 건수는 표 아래 상태줄이 맡는다. */}
      <section
        data-my-ads-results-toolbar
        className="shrink-0 border-b border-border bg-white px-3 py-2.5"
      >
        <div
          ref={findRowRef}
          // flex-wrap: 1100px 창에서는 보기 탭·찾기 막대만으로 줄이 차서 모드·등록 버튼이 화면 밖으로 잘렸다.
          // 넘치면 버튼 묶음이 다음 줄 오른쪽으로 내려간다(넓은 창에서는 한 줄 그대로).
          className="@container/find flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2"
        >
          <ToolbarPillTabs
            shape="muted"
            ariaLabel="내 광고 보기"
            value={view}
            options={viewTabs.map((tab) => ({
              ...tab,
              count: counts?.[tab.value],
            }))}
            onChange={onViewChange}
          />

          {/*
            찾기 막대(단지 · 동·호 · 검색)는 이 줄의 칸으로 그대로 놓는다(contents).
            줄 폭이 모자라면 펼친 검색칸이 기본 최소 폭(140px)보다 더 줄어 오른쪽 등록 버튼이
            밀려나지 않게 한다. 1행이 좁아지면 초기화·등록 버튼도 아이콘만 남아 검색칸 몫을 남긴다.
          */}
          <div className="contents [&>label]:min-w-0">
            <ToolbarSearchBar
              shape="soft"
              label={
                summarizeSelection(siteFilterOptions, filters.siteIds) ??
                "단지 전체"
              }
              isPlaceholder={filters.siteIds.length === 0}
              active={
                filters.siteIds.length > 0 ||
                filters.dongSearch.trim() !== "" ||
                filters.unitSearch.trim() !== ""
              }
              dong={filters.dongSearch}
              unit={filters.unitSearch}
              onDongChange={(value) => updateMyAdsFilter("dongSearch", value)}
              onUnitChange={(value) => updateMyAdsFilter("unitSearch", value)}
              onClear={() =>
                clearAndRefocus(
                  () => {
                    updateMyAdsFilter("siteIds", []);
                    updateMyAdsFilter("dongSearch", "");
                    updateMyAdsFilter("unitSearch", "");
                  },
                  ['button[aria-label^="내 광고 단지 필터"]'],
                )
              }
              open={isSiteFilterOpen}
              onOpenChange={onSiteFilterOpenChange}
              search={search}
              onSearchChange={onSearchChange}
              searchPlaceholder="CP·네이버 광고번호, 메모 검색"
              locationAriaLabel="내 광고 단지 필터"
              searchAriaLabel="내 광고 검색"
            >
              <ChecklistFilterPanel
                options={siteFilterOptions}
                selected={filters.siteIds}
                onChange={(values) => updateMyAdsFilter("siteIds", values)}
                searchPlaceholder="단지명 또는 주소 검색"
                emptyText="일치하는 단지가 없습니다."
                listClassName="max-h-[280px]"
              />
            </ToolbarSearchBar>
          </div>

          <button
            type="button"
            data-my-ads-filter-row-toggle
            aria-label={isFilterRowOpen ? "필터 줄 접기" : "필터 줄 펼치기"}
            aria-pressed={isFilterRowOpen}
            title="필터"
            onClick={() => setIsFilterRowOpen((open) => !open)}
            className={cn(
              // 검색 아이콘과 한 쌍으로 보이게 줄 간격(8px)을 없앤다
              "-ml-2 inline-flex size-[30px] shrink-0 items-center justify-center rounded-full transition-colors hover:bg-[rgba(60,52,40,0.06)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
              // 접힌 채로 조건이 걸려 있으면 파랗게 알린다
              !isFilterRowOpen && hasActiveFilters
                ? "text-[#2383e2]"
                : "text-[#6f6c66] hover:text-foreground",
            )}
          >
            <ListFilter className="size-3.5" />
          </button>

          {/* 매물관리의 보기 전환·등록 버튼 묶음과 같은 자리. 등록 같은 버튼은 페이지가 trailingActions로 넣는다. */}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {!isFilterRowOpen && filterRowActions}
            {trailingActions}
          </div>
        </div>
      </section>

      {/* 필터 줄과 표는 구분선 없이 이어진다. 필터 아이콘으로 줄을 접을 수 있다. */}
      {isFilterRowOpen && (
        <section
          ref={filterRailRef}
          data-my-ads-filter-rail
          aria-label="내 광고 상세 필터"
          // items-start: 칩이 두 줄로 넘어가도 초기화는 첫 줄 오른쪽에 남는다.
          // pb-0: 매물관리 목록처럼 아래 여백을 두지 않는다. 매물관리 표가 위에 비우는 8px 대신
          // 이 표(DataTable)는 열 묶음 접기 버튼 띠(11px)를 머리 위에 두므로 그 띠가 간격이 된다.
          className="flex shrink-0 items-start gap-2 bg-white px-3 pb-0 pt-2"
        >
          {/* 필터가 모두 이 줄에 있으므로, 창이 좁으면 옆으로 숨기지 않고 다음 줄로 내린다 */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
            <MyAdsSelectFilterChip
              label="상태"
              icon={<ListFilter />}
              options={statusFilterOptions}
              value={filters.status}
              onChange={(value) => updateMyAdsFilter("status", value)}
              onClear={clearChip}
              defaultValue="active"
            />
            <MyAdsSelectFilterChip
              label="거래"
              icon={<Tag />}
              options={transactionFilterOptions}
              value={filters.transactionType}
              onChange={(value) => updateMyAdsFilter("transactionType", value)}
              onClear={clearChip}
            />
            <MyAdsSelectFilterChip
              label="CP사"
              icon={<Megaphone />}
              options={channelOptions}
              value={filters.channel}
              onChange={(value) => updateMyAdsFilter("channel", value)}
              onClear={clearChip}
            />
            {cpAccountOptions.length > 1 && (
              <MyAdsSelectFilterChip
                label="CP 계정"
                icon={<Megaphone />}
                options={cpAccountOptions}
                value={filters.cpAccountId}
                onChange={(value) => updateMyAdsFilter("cpAccountId", value)}
                onClear={clearChip}
              />
            )}

            <ToolbarFilterChip
              label="가격/보증금"
              shape="soft"
              icon={<WonCircleIcon />}
              summary={primaryAmountSummary}
              onClear={() =>
                clearChip("가격/보증금", () =>
                  updateMyAdsRangeFilter("primary", "", ""),
                )
              }
              contentClassName={rangeFilterContentClassName}
            >
              {(close) => (
                <NumericRangeFilterPanel
                  ariaLabel="가격/보증금 필터"
                  title="가격/보증금"
                  description="CP 광고가 기준"
                  initialRange={amountFilterToEokRange(
                    filters.primaryAmountMin,
                    filters.primaryAmountMax,
                  )}
                  min={PRICE_RANGE_MIN}
                  max={PRICE_RANGE_MAX}
                  step={0.5}
                  presets={PRICE_RANGE_PRESETS}
                  tickLabels={["전체", "10억", "20억", "최대"]}
                  formatLabel={formatPriceRangeLabel}
                  thumbLabels={["최소 금액", "최대 금액"]}
                  exactInput={{
                    unit: "만원",
                    scale: 10000,
                    initialMin: filters.primaryAmountMin,
                    initialMax: filters.primaryAmountMax,
                    formatLabel: myAdsAmountRangeSummary,
                    onApply: (minValue, maxValue) => {
                      updateMyAdsRangeFilter("primary", minValue, maxValue);
                      close();
                    },
                  }}
                  onClear={() => {
                    updateMyAdsRangeFilter("primary", "", "");
                    close();
                  }}
                  onCancel={close}
                />
              )}
            </ToolbarFilterChip>

            {/* 월세: 거래 전체·월세에서는 가격/보증금 바로 옆에 늘 보인다.
                매매·전세에서는 값이 남아 있을 때만 같은 자리에 보여 지울 수 있게 한다. */}
            {shouldShowMonthlyRentFilter(filters) && (
              <ToolbarFilterChip
                label="월세"
                shape="soft"
                icon={<WonCircleIcon />}
                summary={monthlyRentSummary}
                // 매매·전세에서는 지우면 칩이 사라지므로 옆 가격/보증금 칩으로 돌아간다
                onClear={() =>
                  clearChip(
                    "월세",
                    () => updateMyAdsRangeFilter("monthlyRent", "", ""),
                    "가격/보증금",
                  )
                }
                contentClassName={rangeFilterContentClassName}
              >
                {(close) => (
                  <NumericRangeFilterPanel
                    ariaLabel="월세 필터"
                    title="월세"
                    description="CP 광고가 기준 · 만원 단위"
                    initialRange={monthlyRentFilterToRange(
                      filters.monthlyRentMin,
                      filters.monthlyRentMax,
                    )}
                    min={MONTHLY_RENT_RANGE_MIN}
                    max={MONTHLY_RENT_RANGE_MAX}
                    step={10}
                    presets={MONTHLY_RENT_RANGE_PRESETS}
                    tickLabels={["전체", "200만", "400만", "최대"]}
                    formatLabel={formatMonthlyRentFilterLabel}
                    thumbLabels={["최소 월세", "최대 월세"]}
                    exactInput={{
                      unit: "만원",
                      scale: 1,
                      initialMin: filters.monthlyRentMin,
                      initialMax: filters.monthlyRentMax,
                      formatLabel: myAdsAmountRangeSummary,
                      onApply: (minValue, maxValue) => {
                        updateMyAdsRangeFilter("monthlyRent", minValue, maxValue);
                        close();
                      },
                    }}
                    onClear={() => {
                      updateMyAdsRangeFilter("monthlyRent", "", "");
                      close();
                    }}
                    onCancel={close}
                  />
                )}
              </ToolbarFilterChip>
            )}

            <MyAdsSelectFilterChip
              label="경쟁 대비"
              icon={<Sparkles />}
              options={comparisonFilterOptions}
              value={filters.comparison}
              onChange={(value) => updateMyAdsFilter("comparison", value)}
              onClear={clearChip}
            />
            <MyAdsSelectFilterChip
              label="검증방식"
              icon={<ShieldCheck />}
              options={verificationFilterOptions}
              value={filters.verification}
              onChange={(value) => updateMyAdsFilter("verification", value)}
              onClear={clearChip}
            />
            <MyAdsSelectFilterChip
              label="층수노출"
              icon={<Eye />}
              options={floorExposureFilterOptions}
              value={filters.floorExposure}
              onChange={(value) => updateMyAdsFilter("floorExposure", value)}
              onClear={clearChip}
            />
            <MyAdsSelectFilterChip
              label="노출기간"
              icon={<CalendarDays />}
              options={exposurePeriodFilterOptions}
              value={filters.exposurePeriod}
              onChange={(value) => updateMyAdsFilter("exposurePeriod", value)}
              onClear={clearChip}
            />
          </div>

          {/* 불러오는 중 · 초기화 — 칩이 넘쳐도 가려지지 않게 오른쪽에 고정 */}
          {filterRowActions}
        </section>
      )}
    </>
  );
}

/**
 * 하나만 고르는 필터 칩. 매물관리 필터 줄처럼 soft 모양 + 아이콘으로 늘 보이고,
 * 펼치면 선택 목록(ToolbarSelectPanel)이 나온다. "all"은 선택 해제와 같다.
 */
function MyAdsSelectFilterChip<T extends string>({
  label,
  icon,
  options,
  value,
  onChange,
  onClear,
  defaultValue = "all" as T,
}: {
  label: string;
  icon: ReactNode;
  options: MyAdsFilterOption[];
  value: T;
  onChange: (value: T) => void;
  /** ✕를 누를 때. 값을 지우는 함수를 받아 지운 뒤 이 칩으로 포커스를 돌려놓는다. */
  onClear: (label: string, clear: () => void) => void;
  defaultValue?: T;
}) {
  return (
    <ToolbarFilterChip
      label={label}
      shape="soft"
      icon={icon}
      summary={
        value === defaultValue
          ? null
          : (options.find((option) => option.value === value)?.label ?? value)
      }
      onClear={() => onClear(label, () => onChange(defaultValue))}
      contentClassName="w-[200px] p-0"
    >
      {(close) => (
        <ToolbarSelectPanel
          options={options}
          value={value}
          onChange={(next) => onChange(next as T)}
          onClose={close}
        />
      )}
    </ToolbarFilterChip>
  );
}

import { useMemo, type Dispatch, type SetStateAction } from 'react';
import { CalendarDays, CircleDot, RotateCcw, Siren, UserRound } from 'lucide-react';
import type { BuyerRequirement } from '@estate-erp/api-client';
import {
  AddFilterMenu,
  ChecklistFilterPanel,
  summarizeSelection,
  toolbarGhostButtonClassName,
  ToolbarFilterChip,
  type AddFilterItem,
} from '../properties/-components/property-toolbar';
import {
  AREA_RANGE_MAX,
  AREA_RANGE_MIN,
  AREA_RANGE_PRESETS,
  DateRangeFilter,
  formatNumericRangeLabel,
  formatPriceRangeLabel,
  MONTHLY_RENT_RANGE_MAX,
  MONTHLY_RENT_RANGE_MIN,
  MONTHLY_RENT_RANGE_PRESETS,
  NumericRangeFilterPanel,
  PopoverTitle,
  PRICE_RANGE_MAX,
  PRICE_RANGE_MIN,
  PRICE_RANGE_PRESETS,
} from '../properties/-components/numeric-range-filter';
import {
  getAssigneeFilterOptions,
  getLocationFilterOptions,
  toOpenRange,
  toSliderRange,
  type RequirementFilters,
} from './-wanted-filters';
import { getMatchStageLabel, matchStageOrder, siteTypeLabel } from './-match-view-utils';
import { getStatusMeta } from '@/lib/status-config';

const STAGE_OPTIONS = matchStageOrder.map((stage) => ({
  value: stage as string,
  label: getMatchStageLabel(stage),
}));
const SITE_TYPE_OPTIONS = Object.entries(siteTypeLabel).map(([value, label]) => ({
  value,
  label,
}));
const STATUS_OPTIONS = ['active', 'hold', 'completed'].map((value) => ({
  value,
  label: getStatusMeta('buyerStatus', value).label,
}));
const URGENCY_OPTIONS = ['urgent', 'normal', 'flexible'].map((value) => ({
  value,
  label: getStatusMeta('buyerUrgency', value).label,
}));

const RANGE_CHIP_CONTENT_CLASS =
  'w-[430px] max-w-[calc(100vw-24px)] overflow-hidden p-0';
const BUDGET_LABELS: Record<string, string> = {
  '': '예산',
  sale: '매매가',
  jeonse: '전세가',
  monthly: '보증금',
};

function formatAreaLabel(min: number, max: number) {
  return formatNumericRangeLabel(
    min,
    max,
    AREA_RANGE_MIN,
    AREA_RANGE_MAX,
    '평',
    '전체 면적',
  );
}

function formatMonthlyRentLabel(min: number, max: number) {
  return formatNumericRangeLabel(
    min,
    max,
    MONTHLY_RENT_RANGE_MIN,
    MONTHLY_RENT_RANGE_MAX,
    '만원',
    '전체 월세',
  );
}

/**
 * 매물관리 2행과 같은 구성: 자주 쓰는 필터는 칩, 나머지는 "+ 필터".
 * 예산·평형은 고객이 원하는 범위와 겹치면 표시한다.
 */
export function WantedFilterBar({
  filters,
  onFiltersChange,
  requirements,
  stageOptionsPrefix,
  stageFilters,
  onStageFiltersChange,
  transactionType,
  hasActiveFilters,
  onReset,
}: {
  filters: RequirementFilters;
  onFiltersChange: Dispatch<SetStateAction<RequirementFilters>>;
  requirements: BuyerRequirement[];
  /** 고객별 보기에서만 쓰는 '매칭 없음' 같은 앞쪽 선택지 */
  stageOptionsPrefix: { value: string; label: string }[];
  stageFilters: string[];
  onStageFiltersChange: (values: string[]) => void;
  transactionType: string;
  hasActiveFilters: boolean;
  onReset: () => void;
}) {
  // 날짜 패널은 시작일과 종료일을 연달아 저장한다. 렌더 시점의 값에 덮어쓰면 앞의 값이 사라진다.
  const update = (patch: Partial<RequirementFilters>) =>
    onFiltersChange((current) => ({ ...current, ...patch }));

  const stageOptions = [...stageOptionsPrefix, ...STAGE_OPTIONS];
  const locationOptions = useMemo(
    () => getLocationFilterOptions(requirements),
    [requirements],
  );
  const assigneeOptions = useMemo(
    () => getAssigneeFilterOptions(requirements),
    [requirements],
  );
  // 완료된 조건은 단계별 보기에서만 넘어온다
  const statusOptions = useMemo(
    () =>
      STATUS_OPTIONS.filter(
        (option) =>
          option.value !== 'completed' ||
          requirements.some((item) => item.status === 'completed'),
      ),
    [requirements],
  );
  const budgetLabel = BUDGET_LABELS[transactionType] ?? '예산';

  const moveInSummary =
    filters.moveInFrom && filters.moveInTo
      ? `${filters.moveInFrom}~${filters.moveInTo}`
      : filters.moveInFrom
        ? `${filters.moveInFrom} 이후`
        : filters.moveInTo
          ? `${filters.moveInTo} 이전`
          : null;

  // 자주 쓰지 않는 필터. 값이 있으면 칩으로, 없으면 "+ 필터" 메뉴 안에만 있다.
  const moreFilterItems: (AddFilterItem & { onClear: () => void })[] = [
    {
      key: 'status',
      label: '상태',
      icon: <CircleDot />,
      summary: summarizeSelection(statusOptions, filters.statuses),
      onClear: () => update({ statuses: [] }),
      contentClassName: 'w-[180px] p-0',
      render: () => (
        <ChecklistFilterPanel
          options={statusOptions}
          selected={filters.statuses}
          onChange={(statuses) => update({ statuses })}
          searchable={false}
        />
      ),
    },
    {
      key: 'assignee',
      label: '담당자',
      icon: <UserRound />,
      summary: summarizeSelection(assigneeOptions, filters.assignees),
      onClear: () => update({ assignees: [] }),
      contentClassName: 'w-[220px] p-0',
      render: () => (
        <ChecklistFilterPanel
          options={assigneeOptions}
          selected={filters.assignees}
          onChange={(assignees) => update({ assignees })}
          searchable={false}
          emptyText="담당자가 없습니다."
        />
      ),
    },
    {
      key: 'urgency',
      label: '긴급도',
      icon: <Siren />,
      summary: summarizeSelection(URGENCY_OPTIONS, filters.urgencies),
      onClear: () => update({ urgencies: [] }),
      contentClassName: 'w-[180px] p-0',
      render: () => (
        <ChecklistFilterPanel
          options={URGENCY_OPTIONS}
          selected={filters.urgencies}
          onChange={(urgencies) => update({ urgencies })}
          searchable={false}
        />
      ),
    },
    {
      key: 'moveIn',
      label: '입주 희망일',
      icon: <CalendarDays />,
      summary: moveInSummary,
      onClear: () => update({ moveInFrom: '', moveInTo: '' }),
      contentClassName: 'w-[320px] p-3',
      render: () => (
        <div className="space-y-3">
          <PopoverTitle
            title="입주 희망일"
            description="입주 희망일이 기간 안에 있는 조건만 표시합니다."
          />
          <DateRangeFilter
            label="입주 희망일"
            fromValue={filters.moveInFrom}
            toValue={filters.moveInTo}
            onFromChange={(moveInFrom) => update({ moveInFrom })}
            onToChange={(moveInTo) => update({ moveInTo })}
          />
        </div>
      ),
    },
  ];

  return (
    <section
      data-wanted-filter-bar
      aria-label="희망 조건 필터"
      className="flex shrink-0 items-center gap-2 border-b border-border bg-white px-3 py-2"
    >
      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ToolbarFilterChip
          label="단계"
          summary={summarizeSelection(stageOptions, stageFilters)}
          onClear={() => onStageFiltersChange([])}
          contentClassName="w-[180px] p-0"
        >
          <ChecklistFilterPanel
            options={stageOptions}
            selected={stageFilters}
            onChange={onStageFiltersChange}
            searchable={false}
          />
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label="지역·단지"
          summary={summarizeSelection(locationOptions, filters.locations)}
          onClear={() => update({ locations: [] })}
          contentClassName="w-[300px] p-0"
        >
          <ChecklistFilterPanel
            options={locationOptions}
            selected={filters.locations}
            onChange={(locations) => update({ locations })}
            searchPlaceholder="지역 또는 단지 검색"
            emptyText="일치하는 지역·단지가 없습니다."
            listClassName="max-h-[280px]"
          />
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label="매물 유형"
          summary={summarizeSelection(SITE_TYPE_OPTIONS, filters.siteTypes)}
          onClear={() => update({ siteTypes: [] })}
          contentClassName="w-[200px] p-0"
        >
          <ChecklistFilterPanel
            options={SITE_TYPE_OPTIONS}
            selected={filters.siteTypes}
            onChange={(siteTypes) => update({ siteTypes })}
            searchable={false}
          />
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label={budgetLabel}
          summary={
            filters.budget
              ? formatPriceRangeLabel(
                  ...toSliderRange(
                    filters.budget,
                    PRICE_RANGE_MIN,
                    PRICE_RANGE_MAX,
                  ),
                )
              : null
          }
          onClear={() => update({ budget: null })}
          contentClassName={RANGE_CHIP_CONTENT_CLASS}
        >
          {(close) => (
            <NumericRangeFilterPanel
              ariaLabel={`${budgetLabel} 필터`}
              title={budgetLabel}
              description="고객이 원하는 금액 범위와 겹치면 표시합니다."
              initialRange={toSliderRange(
                filters.budget,
                PRICE_RANGE_MIN,
                PRICE_RANGE_MAX,
              )}
              min={PRICE_RANGE_MIN}
              max={PRICE_RANGE_MAX}
              step={0.5}
              presets={PRICE_RANGE_PRESETS}
              tickLabels={['전체', '10억', '20억', '최대']}
              formatLabel={formatPriceRangeLabel}
              thumbLabels={['최소 금액', '최대 금액']}
              onApply={(range) => {
                update({
                  budget: toOpenRange(range, PRICE_RANGE_MIN, PRICE_RANGE_MAX),
                });
                close();
              }}
              onClear={() => {
                update({ budget: null });
                close();
              }}
              onCancel={close}
            />
          )}
        </ToolbarFilterChip>

        {transactionType === 'monthly' && (
          <ToolbarFilterChip
            label="월세"
            summary={
              filters.monthlyRent
                ? formatMonthlyRentLabel(
                    ...toSliderRange(
                      filters.monthlyRent,
                      MONTHLY_RENT_RANGE_MIN,
                      MONTHLY_RENT_RANGE_MAX,
                    ),
                  )
                : null
            }
            onClear={() => update({ monthlyRent: null })}
            contentClassName={RANGE_CHIP_CONTENT_CLASS}
          >
            {(close) => (
              <NumericRangeFilterPanel
                ariaLabel="월세 필터"
                title="월세"
                description="고객이 원하는 월세 범위와 겹치면 표시합니다."
                initialRange={toSliderRange(
                  filters.monthlyRent,
                  MONTHLY_RENT_RANGE_MIN,
                  MONTHLY_RENT_RANGE_MAX,
                )}
                min={MONTHLY_RENT_RANGE_MIN}
                max={MONTHLY_RENT_RANGE_MAX}
                step={10}
                presets={MONTHLY_RENT_RANGE_PRESETS}
                tickLabels={['전체', '200만', '400만', '최대']}
                formatLabel={formatMonthlyRentLabel}
                thumbLabels={['최소 월세', '최대 월세']}
                onApply={(range) => {
                  update({
                    monthlyRent: toOpenRange(
                      range,
                      MONTHLY_RENT_RANGE_MIN,
                      MONTHLY_RENT_RANGE_MAX,
                    ),
                  });
                  close();
                }}
                onClear={() => {
                  update({ monthlyRent: null });
                  close();
                }}
                onCancel={close}
              />
            )}
          </ToolbarFilterChip>
        )}

        <ToolbarFilterChip
          label="희망 평형"
          summary={
            filters.area
              ? formatAreaLabel(
                  ...toSliderRange(filters.area, AREA_RANGE_MIN, AREA_RANGE_MAX),
                )
              : null
          }
          onClear={() => update({ area: null })}
          contentClassName={RANGE_CHIP_CONTENT_CLASS}
        >
          {(close) => (
            <NumericRangeFilterPanel
              ariaLabel="희망 평형 필터"
              title="희망 평형"
              description="공급면적 기준 · 고객이 원하는 평형 범위와 겹치면 표시합니다."
              initialRange={toSliderRange(
                filters.area,
                AREA_RANGE_MIN,
                AREA_RANGE_MAX,
              )}
              min={AREA_RANGE_MIN}
              max={AREA_RANGE_MAX}
              step={1}
              presets={AREA_RANGE_PRESETS}
              tickLabels={['전체', '20평', '40평', '60평', '최대']}
              formatLabel={formatAreaLabel}
              thumbLabels={['최소 면적', '최대 면적']}
              onApply={(range) => {
                update({
                  area: toOpenRange(range, AREA_RANGE_MIN, AREA_RANGE_MAX),
                });
                close();
              }}
              onClear={() => {
                update({ area: null });
                close();
              }}
              onCancel={close}
            />
          )}
        </ToolbarFilterChip>

        {moreFilterItems
          .filter((item) => item.summary !== null)
          .map((item) => (
            <ToolbarFilterChip
              key={item.key}
              label={item.label}
              summary={item.summary}
              onClear={item.onClear}
              contentClassName={item.contentClassName}
            >
              {(close) => item.render(close)}
            </ToolbarFilterChip>
          ))}

        <AddFilterMenu
          items={moreFilterItems}
          hint="단계 · 지역·단지 · 매물 유형 · 예산 · 희망 평형은 이 줄에 늘 보입니다."
        />
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          className={toolbarGhostButtonClassName}
          onClick={onReset}
        >
          <RotateCcw className="size-3.5" />
          초기화
        </button>
      )}
    </section>
  );
}

import { useMemo, type Dispatch, type SetStateAction } from 'react';
import {
  CalendarDays,
  CircleDashed,
  CircleDot,
  MapPin,
  RotateCcw,
  Ruler,
  Siren,
  Tag,
  UserRound,
} from 'lucide-react';
import type { BuyerRequirementFilterOptions } from '@estate-erp/api-client';
import {
  ChecklistFilterPanel,
  summarizeSelection,
  toolbarGhostButtonClassName,
  ToolbarFilterChip,
  ToolbarToggleChip,
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
import { cn } from '@/lib/utils';
import { getStatusMeta } from '@/lib/status-config';
import { WonCircleIcon } from '@/components/domain';

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
 * 희망매물 목록의 필터 줄. 문서관리 · 매물관리와 같은 Notion형 알약이다 (ToolbarFilterChip의 "soft" 모양):
 * 테두리 없이 "아이콘 이름 ⌄"만 놓고, 값이 걸린 필터만 파란 알약으로 띄운다.
 * 필터는 "+ 필터" 메뉴에 숨기지 않고 모두 이 줄에 늘 보인다. 폭이 모자라면 다음 줄로 넘긴다.
 * 아이콘은 표 머리의 같은 열 아이콘과 맞춘다. 예산·평형은 고객이 원하는 범위와 겹치면 표시한다.
 */
export function WantedFilterBar({
  filters,
  onFiltersChange,
  filterOptions,
  stageOptionsPrefix,
  stageFilters,
  onStageFiltersChange,
  transactionType,
  hasActiveFilters,
  onReset,
  mineOnly,
  onMineOnlyChange,
}: {
  /** "내 손님": 담당이 나인 조건만 본다. 넘기지 않으면(로그인 정보가 없으면) 단추를 두지 않는다 */
  mineOnly?: boolean;
  onMineOnlyChange?: (mineOnly: boolean) => void;
  filters: RequirementFilters;
  onFiltersChange: Dispatch<SetStateAction<RequirementFilters>>;
  /** 지금 조건들에 실제로 있는 지역 · 단지 · 담당자 (서버가 모아 준다) */
  filterOptions: BuyerRequirementFilterOptions | undefined;
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
    () => getLocationFilterOptions(filterOptions),
    [filterOptions],
  );
  const assigneeOptions = useMemo(
    () => getAssigneeFilterOptions(filterOptions),
    [filterOptions],
  );
  // '완료'는 늘 고를 수 있다. 고르면 화면이 완료한 조건을 받아 와 함께 보여 준다
  // (평소 목록은 활성 · 보류만 받는다). 다른 곳에서 구한 손님을 다시 찾을 때 쓴다.
  const statusOptions = STATUS_OPTIONS;
  const budgetLabel = BUDGET_LABELS[transactionType] ?? '예산';

  const moveInSummary =
    filters.moveInFrom && filters.moveInTo
      ? `${filters.moveInFrom}~${filters.moveInTo}`
      : filters.moveInFrom
        ? `${filters.moveInFrom} 이후`
        : filters.moveInTo
          ? `${filters.moveInTo} 이전`
          : null;

  return (
    <section
      data-wanted-filter-bar
      aria-label="희망 조건 필터"
      // 매물관리 필터 줄과 같은 여백(좌우 12px · 위 8px). 위쪽 선은 도구 줄이, 표와의 사이 선은 이 줄이 긋는다
      className="flex shrink-0 items-start gap-2 border-b border-border bg-white px-3 py-2"
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
        {onMineOnlyChange && (
          // 하루 종일 자기 손님부터 보는 일이 많아 맨 앞에 둔다 (담당자 필터에서 나를 고르는 것과 같다)
          <ToolbarToggleChip
            label="내 손님"
            active={mineOnly === true}
            onToggle={() => onMineOnlyChange(!mineOnly)}
          />
        )}
        <ToolbarFilterChip
          label="단계"
          shape="soft"
          icon={<CircleDot />}
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
          shape="soft"
          icon={<MapPin />}
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
          shape="soft"
          icon={<Tag />}
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
          shape="soft"
          icon={<WonCircleIcon />}
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
            shape="soft"
            icon={<WonCircleIcon />}
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
          shape="soft"
          icon={<Ruler />}
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

        <ToolbarFilterChip
          label="상태"
          shape="soft"
          icon={<CircleDashed />}
          summary={summarizeSelection(statusOptions, filters.statuses)}
          onClear={() => update({ statuses: [] })}
          contentClassName="w-[180px] p-0"
        >
          <ChecklistFilterPanel
            options={statusOptions}
            selected={filters.statuses}
            onChange={(statuses) => update({ statuses })}
            searchable={false}
          />
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label="담당자"
          shape="soft"
          icon={<UserRound />}
          summary={summarizeSelection(assigneeOptions, filters.assignees)}
          onClear={() => update({ assignees: [] })}
          contentClassName="w-[220px] p-0"
        >
          <ChecklistFilterPanel
            options={assigneeOptions}
            selected={filters.assignees}
            onChange={(assignees) => update({ assignees })}
            searchable={false}
            emptyText="담당자가 없습니다."
          />
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label="긴급도"
          shape="soft"
          icon={<Siren />}
          summary={summarizeSelection(URGENCY_OPTIONS, filters.urgencies)}
          onClear={() => update({ urgencies: [] })}
          contentClassName="w-[180px] p-0"
        >
          <ChecklistFilterPanel
            options={URGENCY_OPTIONS}
            selected={filters.urgencies}
            onChange={(urgencies) => update({ urgencies })}
            searchable={false}
          />
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label="입주 희망일"
          shape="soft"
          icon={<CalendarDays />}
          summary={moveInSummary}
          onClear={() => update({ moveInFrom: '', moveInTo: '' })}
          contentClassName="w-[320px] p-3"
        >
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
        </ToolbarFilterChip>
      </div>

      {hasActiveFilters && (
        <button
          type="button"
          className={cn(toolbarGhostButtonClassName, 'shrink-0 rounded-full')}
          onClick={onReset}
        >
          <RotateCcw className="size-3.5" />
          초기화
        </button>
      )}
    </section>
  );
}

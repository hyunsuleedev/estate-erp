import { useState, type ReactNode } from "react";
import { Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

/*
 * 필터 칩 안에 들어가는 범위·날짜 입력 패널과 기준값.
 * 매물관리와 희망매물이 함께 쓴다.
 */

export const PRICE_RANGE_MIN = 0;
export const PRICE_RANGE_MAX = 30;
export interface NumericRangePreset {
  label: string;
  min: number;
  max: number;
  isAll?: boolean;
}

export const PRICE_RANGE_PRESETS: NumericRangePreset[] = [
  { label: "~5억", min: 0, max: 5 },
  { label: "5억대", min: 5, max: 10 },
  { label: "10억대", min: 10, max: 15 },
  { label: "15억대", min: 15, max: 20 },
  { label: "20억대", min: 20, max: 25 },
  { label: "25억대", min: 25, max: 30 },
  { label: "30억~", min: 30, max: 30 },
  { label: "전체", min: 0, max: 30, isAll: true },
];

export const MONTHLY_RENT_RANGE_MIN = 0;
export const MONTHLY_RENT_RANGE_MAX = 600;
export const MONTHLY_RENT_RANGE_PRESETS: NumericRangePreset[] = [
  { label: "~100만", min: 0, max: 100 },
  { label: "100만대", min: 100, max: 200 },
  { label: "200만대", min: 200, max: 300 },
  { label: "300만대", min: 300, max: 400 },
  { label: "400만대", min: 400, max: 500 },
  { label: "500만대", min: 500, max: 600 },
  { label: "600만~", min: 600, max: 600 },
  { label: "전체", min: 0, max: 600, isAll: true },
];

export const AREA_RANGE_MIN = 0;
export const AREA_RANGE_MAX = 80;
export const AREA_RANGE_PRESETS: NumericRangePreset[] = [
  { label: "~10평", min: 0, max: 10 },
  { label: "10평대", min: 10, max: 20 },
  { label: "20평대", min: 20, max: 30 },
  { label: "30평대", min: 30, max: 40 },
  { label: "40평대", min: 40, max: 50 },
  { label: "50평대", min: 50, max: 60 },
  { label: "60평대", min: 60, max: 70 },
  { label: "70평~", min: 70, max: 80 },
];

export function PopoverTitle({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
      <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

export function FilterField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-[11px] font-medium text-slate-500">{label}</span>
      {children}
    </div>
  );
}

/**
 * 눈금으로 고를 수 없는 값을 직접 입력한다. 값은 저장 단위 문자열 그대로 오가므로
 * 슬라이더 범위 밖(예: 35억)이나 눈금 사이(예: 3,000만)도 정확히 유지된다.
 */
export interface RangeExactInput {
  /** 입력칸 단위. 예: 만원 */
  unit: string;
  /** 입력값 = 슬라이더 값 × scale. 억 단위 슬라이더에 만원을 넣으면 10000 */
  scale: number;
  initialMin: string;
  initialMax: string;
  formatLabel: (min: string, max: string) => string;
  onApply: (min: string, max: string) => void;
}

export function NumericRangeFilterPanel({
  ariaLabel,
  title,
  description,
  initialRange,
  min,
  max,
  step,
  presets,
  tickLabels,
  formatLabel,
  thumbLabels,
  onApply,
  onClear,
  onCancel,
  exactInput,
}: {
  ariaLabel: string;
  title: string;
  description: string;
  initialRange: [number, number];
  min: number;
  max: number;
  step: number;
  presets: NumericRangePreset[];
  tickLabels: string[];
  formatLabel: (min: number, max: number) => string;
  thumbLabels: [string, string];
  /** exactInput을 쓰면 적용 값은 exactInput.onApply로 간다 */
  onApply?: (range: [number, number]) => void;
  onClear: () => void;
  onCancel: () => void;
  exactInput?: RangeExactInput;
}) {
  const segments = presets.filter((preset) => !preset.isAll);
  const clampToRange = (value: number) => Math.min(max, Math.max(min, value));
  const [draftRange, setDraftRange] = useState<[number, number]>([
    clampToRange(initialRange[0]),
    clampToRange(initialRange[1]),
  ]);
  const [exactMin, setExactMin] = useState(exactInput?.initialMin ?? "");
  const [exactMax, setExactMax] = useState(exactInput?.initialMax ?? "");
  const parsedExactMin = parseExactValue(exactMin);
  const parsedExactMax = parseExactValue(exactMax);
  const hasInvalidExactRange =
    parsedExactMin != null &&
    parsedExactMax != null &&
    parsedExactMin > parsedExactMax;

  // 슬라이더 값을 입력칸 값으로 바꾼다. 양 끝은 제한 없음이라 비워 둔다.
  const toExactMin = (value: number) =>
    !exactInput || value <= min
      ? ""
      : String(Math.round(value * exactInput.scale));
  const toExactMax = (value: number) =>
    !exactInput || value >= max
      ? ""
      : String(Math.round(value * exactInput.scale));

  // 빠른 선택은 양쪽을 함께 정한다
  const syncExactInput = ([nextMin, nextMax]: [number, number]) => {
    setExactMin(toExactMin(nextMin));
    setExactMax(toExactMax(nextMax));
  };

  // 입력칸 값을 슬라이더 위치에 반영한다. 범위 밖 값은 끝에 붙지만 입력값은 그대로 둔다.
  const handleExactChange = (nextMin: string, nextMax: string) => {
    if (!exactInput) return;
    setExactMin(nextMin);
    setExactMax(nextMax);
    const lower = parseExactValue(nextMin);
    const upper = parseExactValue(nextMax);
    const nextLower = lower == null ? min : clampToRange(lower / exactInput.scale);
    const nextUpper = upper == null ? max : clampToRange(upper / exactInput.scale);
    // 최소가 최대보다 큰 입력 중에도 슬라이더 손잡이 순서는 유지한다
    const nextRange: [number, number] = [
      Math.min(nextLower, nextUpper),
      Math.max(nextLower, nextUpper),
    ];
    setDraftRange(nextRange);
    setRangeAnchor(null);
    setSelectedPresetSpan(getNumericPresetSpan(nextRange, segments));
  };
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const [selectedPresetSpan, setSelectedPresetSpan] = useState<
    [number, number] | null
  >(() => getNumericPresetSpan(initialRange, segments));
  const isFullRange = draftRange[0] === min && draftRange[1] === max;

  const handleSliderChange = (value: number[]) => {
    const nextRange: [number, number] = [value[0] ?? min, value[1] ?? max];
    // 움직인 쪽만 입력칸에 옮긴다. 반대쪽에 직접 넣은 값(슬라이더 범위 밖이거나
    // 눈금 사이인 값)은 슬라이더로 나타낼 수 없으므로 덮어쓰면 그 제한이 사라진다.
    if (nextRange[0] !== draftRange[0]) setExactMin(toExactMin(nextRange[0]));
    if (nextRange[1] !== draftRange[1]) setExactMax(toExactMax(nextRange[1]));
    setDraftRange(nextRange);
    setRangeAnchor(null);
    setSelectedPresetSpan(getNumericPresetSpan(nextRange, segments));
  };

  const handlePresetClick = (preset: NumericRangePreset) => {
    if (preset.isAll) {
      setDraftRange([min, max]);
      syncExactInput([min, max]);
      setRangeAnchor(null);
      setSelectedPresetSpan(null);
      return;
    }

    const presetIndex = segments.indexOf(preset);
    if (presetIndex < 0) return;

    if (rangeAnchor === null) {
      setDraftRange([preset.min, preset.max]);
      syncExactInput([preset.min, preset.max]);
      setRangeAnchor(presetIndex);
      setSelectedPresetSpan([presetIndex, presetIndex]);
      return;
    }

    const spanStart = Math.min(rangeAnchor, presetIndex);
    const spanEnd = Math.max(rangeAnchor, presetIndex);
    const startPreset = segments[spanStart];
    const endPreset = segments[spanEnd];
    if (!startPreset || !endPreset) return;

    setDraftRange([startPreset.min, endPreset.max]);
    syncExactInput([startPreset.min, endPreset.max]);
    setRangeAnchor(null);
    setSelectedPresetSpan([spanStart, spanEnd]);
  };

  return (
    <div aria-label={ariaLabel}>
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div>
          <h3 className="text-[13px] font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
            {description}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`${title} 필터 닫기`}
          onClick={onCancel}
          className="-mr-1 text-muted-foreground"
        >
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="px-[18px] pb-[14px] pt-[18px]">
        <div className="mb-[18px] text-center text-[21px] font-bold tracking-[-0.025em] text-foreground">
          {exactInput
            ? exactInput.formatLabel(exactMin, exactMax)
            : formatLabel(draftRange[0], draftRange[1])}
        </div>

        <div className="mb-2 px-2">
          <Slider
            min={min}
            max={max}
            step={step}
            minStepsBetweenThumbs={0}
            value={draftRange}
            onValueChange={handleSliderChange}
            aria-label={`${title} 범위`}
            thumbLabels={thumbLabels}
            className="[&_[data-slot=slider-range]]:bg-foreground [&_[data-slot=slider-thumb]]:size-6 [&_[data-slot=slider-thumb]]:border-[1.5px] [&_[data-slot=slider-thumb]]:border-foreground [&_[data-slot=slider-thumb]]:bg-background [&_[data-slot=slider-thumb]]:shadow-md [&_[data-slot=slider-thumb]]:hover:ring-0 [&_[data-slot=slider-track]]:h-1"
          />
          <div className="mt-3 flex justify-between text-[10px] tabular-nums text-muted-foreground/70">
            {tickLabels.map((label) => (
              <span key={label}>{label}</span>
            ))}
          </div>
        </div>

        <div
          className="mt-3 grid grid-cols-4 border-l border-t"
          role="group"
          aria-label={`${title} 빠른 선택`}
        >
          {presets.map((preset) => {
            const segmentIndex = preset.isAll ? -1 : segments.indexOf(preset);
            const isAllPreset = Boolean(preset.isAll);
            const isInSelectedSpan =
              !isAllPreset &&
              selectedPresetSpan !== null &&
              segmentIndex >= selectedPresetSpan[0] &&
              segmentIndex <= selectedPresetSpan[1];
            const isSpanEdge =
              isInSelectedSpan &&
              selectedPresetSpan !== null &&
              (segmentIndex === selectedPresetSpan[0] ||
                segmentIndex === selectedPresetSpan[1]);
            const isAllSelected =
              isAllPreset && selectedPresetSpan === null && isFullRange;
            const isSelected = isInSelectedSpan || isAllSelected;
            return (
              <Button
                key={preset.label}
                type="button"
                variant={isSpanEdge || isAllSelected ? "default" : "ghost"}
                size="sm"
                aria-pressed={isSelected}
                data-range-state={
                  isSelected
                    ? isSpanEdge || isAllSelected
                      ? "edge"
                      : "inside"
                    : "off"
                }
                onClick={() => handlePresetClick(preset)}
                className={cn(
                  "h-8 rounded-none border-b border-r px-1 text-[11px] shadow-none",
                  isInSelectedSpan &&
                    !isSpanEdge &&
                    "bg-muted text-foreground hover:bg-muted hover:text-foreground",
                  !isSelected &&
                    "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {preset.label}
              </Button>
            );
          })}
        </div>

        {exactInput && (
          <div className="mt-3">
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] items-center gap-1.5">
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                aria-label={`최소 ${title} (${exactInput.unit})`}
                value={exactMin}
                onChange={(event) =>
                  handleExactChange(event.target.value, exactMax)
                }
                placeholder="최소"
                className="h-8 bg-white px-2 text-xs tabular-nums"
              />
              <span className="text-xs text-muted-foreground">~</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                aria-label={`최대 ${title} (${exactInput.unit})`}
                value={exactMax}
                onChange={(event) =>
                  handleExactChange(exactMin, event.target.value)
                }
                placeholder="최대"
                className="h-8 bg-white px-2 text-xs tabular-nums"
              />
              <span className="text-[11px] text-muted-foreground">
                {exactInput.unit}
              </span>
            </div>
            {hasInvalidExactRange && (
              <p role="alert" className="mt-1.5 text-xs text-destructive">
                최대값은 최소값보다 크거나 같아야 합니다.
              </p>
            )}
          </div>
        )}

        <div className="mt-[13px] flex items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClear}
            className="-ml-2 px-2 text-[11px] font-normal text-muted-foreground"
          >
            <Trash2 className="size-3.5" />
            조건 삭제
          </Button>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCancel}
              className="text-[11px]"
            >
              취소
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={hasInvalidExactRange}
              onClick={() =>
                exactInput
                  ? exactInput.onApply(exactMin.trim(), exactMax.trim())
                  : onApply?.(draftRange)
              }
              className="text-[11px]"
            >
              적용
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function parseExactValue(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function toISODate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function addMonths(base: Date, months: number) {
  const next = new Date(base);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function DateRangeFilter({
  label = "입주가능일",
  fromValue,
  toValue,
  onFromChange,
  onToChange,
}: {
  label?: string;
  fromValue: string;
  toValue: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
}) {
  // 입주 가능 시작일이 "지금부터 N개월 내"인 매물로 좁히는 빠른 옵션.
  const applyWithin = (months: number) => {
    const today = new Date();
    onFromChange(toISODate(today));
    onToChange(toISODate(addMonths(today, months)));
  };
  const withinOptions = [
    { label: "1개월 내", months: 1 },
    { label: "3개월 내", months: 3 },
    { label: "6개월 내", months: 6 },
  ];

  return (
    <FilterField label={label}>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {withinOptions.map((option) => (
          <button
            key={option.label}
            type="button"
            onClick={() => applyWithin(option.months)}
            className="h-7 rounded-full border border-border bg-white px-2.5 text-[12px] text-foreground transition-colors hover:bg-muted"
          >
            {option.label}
          </button>
        ))}
        {(fromValue || toValue) && (
          <button
            type="button"
            onClick={() => {
              onFromChange("");
              onToChange("");
            }}
            className="h-7 rounded-full px-2.5 text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            지우기
          </button>
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
        <Input
          type="date"
          value={fromValue}
          onChange={(event) => onFromChange(event.target.value)}
          className="h-8 bg-white px-2 text-[13px]"
        />
        <span className="text-xs text-slate-400">~</span>
        <Input
          type="date"
          value={toValue}
          onChange={(event) => onToChange(event.target.value)}
          className="h-8 bg-white px-2 text-[13px]"
        />
      </div>
    </FilterField>
  );
}

function getNumericPresetSpan(
  range: [number, number],
  segments: NumericRangePreset[],
): [number, number] | null {
  if (segments.length === 0) return null;
  if (
    range[0] === segments[0]?.min &&
    range[1] === segments[segments.length - 1]?.max
  ) {
    return null;
  }

  for (let startIndex = 0; startIndex < segments.length; startIndex += 1) {
    if (segments[startIndex]?.min !== range[0]) continue;

    for (let endIndex = startIndex; endIndex < segments.length; endIndex += 1) {
      if (segments[endIndex]?.max === range[1]) return [startIndex, endIndex];
    }
  }

  return null;
}

export function formatPriceRangeLabel(min: number, max: number) {
  if (min <= PRICE_RANGE_MIN && max >= PRICE_RANGE_MAX) return "전체 가격";
  if (min <= PRICE_RANGE_MIN) return `${formatRangeNumber(max)}억 이하`;
  if (max >= PRICE_RANGE_MAX) return `${formatRangeNumber(min)}억 이상`;
  if (min === max) return `${formatRangeNumber(min)}억`;
  return `${formatRangeNumber(min)}억–${formatRangeNumber(max)}억`;
}

export function formatNumericRangeLabel(
  min: number,
  max: number,
  rangeMin: number,
  rangeMax: number,
  unit: string,
  fullRangeLabel: string,
) {
  if (min <= rangeMin && max >= rangeMax) return fullRangeLabel;
  if (min <= rangeMin) return `${formatRangeNumber(max)}${unit} 이하`;
  if (max >= rangeMax) return `${formatRangeNumber(min)}${unit} 이상`;
  if (min === max) return `${formatRangeNumber(min)}${unit}`;
  return `${formatRangeNumber(min)}${unit}–${formatRangeNumber(max)}${unit}`;
}

export function formatRangeNumber(value: number) {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)));
}

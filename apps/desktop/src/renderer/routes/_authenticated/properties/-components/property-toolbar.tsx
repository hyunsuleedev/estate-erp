import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, ChevronDown, MapPin, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { MultiSelectOption } from "@/components/ui/multi-select";

/*
 * 매물관리 상단 툴바 (시안 N1: 3×4 반반 + Notion 색).
 * docs/mockups/property-toolbar/notion.html 참고.
 *
 * - 1행 "찾기": 거래유형 알약 탭 · 한 줄 검색바(지역·단지 │ 동 │ 호 │ 검색) · 보기 전환 · 등록
 * - 2행 "좁히기": 빠른 필터 칩 · "+ 필터" · (오른쪽 고정) 초기화 · 컬럼
 * - 색은 Notion 글자색(#37352f)과 따뜻한 회색만 쓴다. 강조색 없음.
 */

/** 1행 공통 바탕: 거래유형 탭 · 검색바 · 보기 전환이 같은 따뜻한 베이지를 쓴다 */
const toolbarSurfaceClassName = "bg-[#f1f0ec]";
/** 2행 오른쪽 고스트 버튼 (초기화 · 컬럼) */
export const toolbarGhostButtonClassName =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20";

// ── 알약 탭 ──────────────────────────────────────────────────────

export function ToolbarPillTabs<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn("flex h-[30px] shrink-0 items-center gap-px rounded-full p-0.5", toolbarSurfaceClassName)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
              selected
                ? "bg-foreground font-medium text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  "text-[11.5px] font-normal tabular-nums",
                  selected ? "text-white/60" : "text-[#a5a39f]",
                )}
              >
                {option.count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** 목록/지도 같은 보기 전환. 선택된 쪽은 흰 알약. */
export function ToolbarPillToggle<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; icon: ReactNode }>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("flex h-[30px] shrink-0 items-center gap-px rounded-full p-0.5", toolbarSurfaceClassName)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 [&_svg]:size-3.5",
              selected
                ? "bg-white font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.icon}
            {/* 툴바(@container) 폭이 1024px보다 좁으면 아이콘만 */}
            <span className="@max-5xl:hidden">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ── 한 줄 검색바 (지역·단지 │ 동 │ 호 │ 검색) ─────────────────────

const searchBarDividerClassName =
  "h-4 w-px shrink-0 bg-[rgba(55,53,47,0.14)]";
const searchBarSegmentClassName =
  "flex h-full items-center transition-colors hover:bg-[rgba(55,53,47,0.05)] focus-within:bg-white focus-within:shadow-[inset_0_0_0_1px_rgba(55,53,47,0.3)]";

/** 위치 칸이 필요 없는 화면의 검색 막대. 한 줄 검색바의 검색 칸과 같은 모양이다. */
export function ToolbarPillSearch({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <div
      className={cn(
        "flex h-[30px] min-w-0 flex-1 items-center rounded-full",
        toolbarSurfaceClassName,
      )}
    >
      <label
        className={cn(
          "min-w-0 flex-1 cursor-text gap-2 rounded-full pl-3.5 pr-1.5",
          searchBarSegmentClassName,
        )}
      >
        <Search className="size-3.5 shrink-0 text-muted-foreground" />
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (value) onChange("");
              else event.currentTarget.blur();
            }
          }}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
        />
        {value && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => onChange("")}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[#a5a39f] hover:bg-[rgba(55,53,47,0.1)] hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </label>
    </div>
  );
}

/**
 * 1행 "찾기" 수단을 둥근 막대 하나에 모은다.
 * 위치(지역·단지 팝오버) · 동 · 호 · 키워드 검색이 얇은 세로선으로만 나뉜다.
 */
export function ToolbarSearchBar({
  label,
  isPlaceholder,
  active,
  dong,
  unit,
  onDongChange,
  onUnitChange,
  onClear,
  open,
  onOpenChange,
  children,
  search,
  onSearchChange,
  searchPlaceholder,
}: {
  /** 위치 칸에 보일 이름: 선택 단지 → 지역 → "지역·단지 전체" */
  label: string;
  isPlaceholder: boolean;
  /** 지역·단지·동·호 중 하나라도 설정됨 */
  active: boolean;
  dong: string;
  unit: string;
  onDongChange: (value: string) => void;
  onUnitChange: (value: string) => void;
  /** 위치(지역·단지·동·호) 전체 해제 */
  onClear: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 위치 팝오버 내용: 지역 선택 + 단지 목록 */
  children: ReactNode;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // "/" 키로 검색 포커스 (입력 중일 때는 무시)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey)
        return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      )
        return;
      event.preventDefault();
      searchInputRef.current?.focus();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "flex h-[30px] min-w-[432px] max-w-[720px] flex-1 items-center rounded-full",
            toolbarSurfaceClassName,
          )}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`지역·단지 필터: ${label}`}
              className="flex h-full min-w-[102px] shrink basis-[184px] items-center gap-1.5 rounded-l-full pl-3.5 pr-3 text-[13px] transition-colors hover:bg-[rgba(55,53,47,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/20 data-[state=open]:bg-[rgba(55,53,47,0.05)]"
            >
              <MapPin className="size-3.5 shrink-0 text-muted-foreground" />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-left",
                  isPlaceholder
                    ? "text-muted-foreground"
                    : "font-semibold text-foreground",
                )}
              >
                {label}
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <span className={searchBarDividerClassName} aria-hidden="true" />
          <UnitSegment
            value={dong}
            onChange={onDongChange}
            suffix="동"
            className="w-[76px]"
          />
          <span className={searchBarDividerClassName} aria-hidden="true" />
          <UnitSegment
            value={unit}
            onChange={onUnitChange}
            suffix="호"
            className="w-[88px]"
            trailing={
              active ? (
                <button
                  type="button"
                  aria-label="위치 필터 해제"
                  onClick={(event) => {
                    event.preventDefault();
                    onClear();
                  }}
                  className="ml-auto inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[#a5a39f] transition-colors hover:bg-[rgba(55,53,47,0.1)] hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              ) : null
            }
          />
          <span className={searchBarDividerClassName} aria-hidden="true" />
          <label
            className={cn(
              "min-w-[160px] flex-1 cursor-text gap-2 rounded-r-full pl-3 pr-1.5",
              searchBarSegmentClassName,
            )}
          >
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  if (search) onSearchChange("");
                  else event.currentTarget.blur();
                }
              }}
              placeholder={searchPlaceholder}
              aria-label="매물 검색"
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            {search && (
              <button
                type="button"
                aria-label="검색어 지우기"
                onClick={() => onSearchChange("")}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[#a5a39f] hover:bg-[rgba(55,53,47,0.1)] hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </label>
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" className="w-[380px] p-0">
        {children}
      </PopoverContent>
    </Popover>
  );
}

/**
 * 동·호 칸. 비어 있으면 "동"이 자리 표시로, 값이 있으면 "101동"처럼
 * 값 바로 뒤에 단위가 붙어 왼쪽부터 읽힌다.
 */
function UnitSegment({
  value,
  onChange,
  suffix,
  className,
  trailing,
}: {
  value: string;
  onChange: (value: string) => void;
  suffix: string;
  className?: string;
  trailing?: ReactNode;
}) {
  return (
    <label
      className={cn(
        "shrink-0 cursor-text gap-0.5 px-3 text-[13px]",
        searchBarSegmentClassName,
        className,
      )}
    >
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
        placeholder={suffix}
        aria-label={`${suffix} 검색`}
        className="min-w-[1ch] max-w-[7ch] bg-transparent p-0 font-semibold tabular-nums text-foreground outline-none [field-sizing:content] placeholder:font-normal placeholder:text-muted-foreground"
      />
      {value && <span className="shrink-0 text-muted-foreground">{suffix}</span>}
      {trailing}
    </label>
  );
}

// ── 필터 칩 ─────────────────────────────────────────────────────

type ChipChildren = ReactNode | ((close: () => void) => ReactNode);

/**
 * Notion식 필터 알약.
 * - 설정 전: "라벨 ⌄" (테두리만, 값 표시 없음)
 * - 설정 후: "라벨 값 ×" (따뜻한 회색 채움)
 */
export function ToolbarFilterChip({
  label,
  summary,
  onClear,
  open: controlledOpen,
  onOpenChange,
  contentClassName,
  children,
}: {
  label: string;
  /** 설정된 값 요약. null이면 설정 전 */
  summary: string | null;
  onClear?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  contentClassName?: string;
  children: ChipChildren;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const active = summary !== null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "inline-flex h-7 max-w-[260px] shrink-0 items-center rounded-full border text-[12.5px] transition-colors",
            active
              ? "border-transparent bg-[#ebeae6] text-foreground"
              : "border-[#e3e2de] bg-white text-muted-foreground hover:border-[#d6d5d0] hover:bg-[rgba(55,53,47,0.04)] hover:text-foreground",
            open && !active && "border-[#d6d5d0] text-foreground",
          )}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={active ? `${label} 필터: ${summary}` : `${label} 필터`}
              className={cn(
                "inline-flex h-full min-w-0 items-center gap-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
                active ? "pl-3 pr-1" : "pl-3 pr-2.5",
              )}
            >
              <span
                className={cn(
                  "shrink-0",
                  active && "text-muted-foreground",
                )}
              >
                {label}
              </span>
              {active ? (
                <span className="min-w-0 truncate font-semibold">
                  {summary}
                </span>
              ) : (
                <ChevronDown className="size-3 shrink-0 text-[#a5a39f]" />
              )}
            </button>
          </PopoverTrigger>
          {active && onClear && (
            <button
              type="button"
              aria-label={`${label} 필터 해제`}
              onClick={onClear}
              className="mr-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.1)] hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className={cn("w-80 p-3", contentClassName)}
      >
        {typeof children === "function"
          ? children(() => setOpen(false))
          : children}
      </PopoverContent>
    </Popover>
  );
}

/** 여러 개를 고르는 필터의 요약: "거래중" / "거래중 외 2" */
export function summarizeSelection(
  options: ReadonlyArray<MultiSelectOption>,
  selected: ReadonlyArray<string>,
): string | null {
  if (selected.length === 0) return null;
  const first = options.find((option) => option.value === selected[0]);
  const firstLabel = first?.label ?? `${selected.length}개`;
  return selected.length > 1
    ? `${firstLabel} 외 ${selected.length - 1}`
    : firstLabel;
}

/** 체크 목록 패널 (칩·위치 팝오버 안에서 사용) */
export function ChecklistFilterPanel({
  options,
  selected,
  onChange,
  searchPlaceholder,
  emptyText = "결과 없음",
  isLoading = false,
  searchable = true,
  listClassName,
}: {
  options: ReadonlyArray<MultiSelectOption>;
  selected: ReadonlyArray<string>;
  onChange: (values: string[]) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  isLoading?: boolean;
  searchable?: boolean;
  listClassName?: string;
}) {
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  };

  return (
    <Command className="bg-transparent">
      {searchable && <CommandInput placeholder={searchPlaceholder} />}
      <CommandList className={listClassName}>
        <CommandEmpty>{isLoading ? "불러오는 중..." : emptyText}</CommandEmpty>
        <CommandGroup>
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <CommandItem
                key={option.value}
                value={`${option.label} ${option.description ?? ""}`}
                onSelect={() => toggle(option.value)}
                disabled={option.disabled}
                className="items-start gap-2.5 py-1.5"
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                    isSelected
                      ? "border-foreground bg-foreground text-white"
                      : "border-[#d6d5d0] bg-white",
                  )}
                >
                  {isSelected && <Check className="size-3" strokeWidth={2.5} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center justify-between gap-2">
                    <span className="truncate text-[13px]">{option.label}</span>
                    {option.meta && (
                      <span className="shrink-0 text-[11.5px] text-muted-foreground">
                        {option.meta}
                      </span>
                    )}
                  </span>
                  {option.description && (
                    <span className="block truncate text-[11.5px] text-muted-foreground">
                      {option.description}
                    </span>
                  )}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
      {selected.length > 0 && (
        <div className="border-t border-border p-1">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full rounded-sm py-1.5 text-center text-xs text-muted-foreground hover:bg-[rgba(55,53,47,0.06)] hover:text-foreground"
          >
            선택 해제
          </button>
        </div>
      )}
    </Command>
  );
}

// ── + 필터 ──────────────────────────────────────────────────────

export interface AddFilterItem {
  key: string;
  label: string;
  icon: ReactNode;
  /** 이미 설정된 값 요약 */
  summary: string | null;
  contentClassName?: string;
  render: (close: () => void) => ReactNode;
}

/**
 * 자주 쓰지 않는 필터를 담는 메뉴. 항목을 고르면 같은 팝오버 안에서
 * 그 필터의 입력 패널로 바뀐다 (Notion "+ 필터 추가"와 같은 흐름).
 */
export function AddFilterMenu({
  items,
  hint,
}: {
  items: ReadonlyArray<AddFilterItem>;
  hint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const activeItem = items.find((item) => item.key === activeKey) ?? null;
  // 패널 안에서 닫는 경우(예: 광고 선택)도 있으므로, 닫을 때가 아니라
  // 열 때마다 항목 목록으로 되돌린다. 닫히는 동안에는 내용이 바뀌지 않는다.
  const handleOpenChange = (next: boolean) => {
    if (next) setActiveKey(null);
    setOpen(next);
  };
  const close = () => handleOpenChange(false);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12.5px] text-[#a5a39f] transition-colors hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 data-[state=open]:bg-[rgba(55,53,47,0.08)] data-[state=open]:text-foreground"
        >
          <Plus className="size-3.5" />
          필터
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          activeItem ? (activeItem.contentClassName ?? "w-80 p-3") : "w-60 p-1",
        )}
      >
        {activeItem ? (
          activeItem.render(close)
        ) : (
          <div>
            {items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveKey(item.key)}
                className="flex h-8 w-full items-center gap-2.5 rounded-sm px-2 text-left text-[13px] text-foreground hover:bg-[rgba(55,53,47,0.06)] [&_svg]:size-3.5 [&_svg]:text-muted-foreground"
              >
                {item.icon}
                <span className="flex-1">{item.label}</span>
                {item.summary && (
                  <span className="max-w-[100px] truncate text-xs font-semibold text-foreground">
                    {item.summary}
                  </span>
                )}
              </button>
            ))}
            {hint && (
              <p className="mt-1 border-t border-border px-2 pb-1 pt-2 text-[11.5px] leading-4 text-muted-foreground">
                {hint}
              </p>
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

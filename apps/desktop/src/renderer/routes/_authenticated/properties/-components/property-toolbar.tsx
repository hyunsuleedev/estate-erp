import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Hash,
  MapPin,
  Plus,
  Search,
  X,
} from "lucide-react";
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
/**
 * 1행 모양. "pill"은 기존 둥근 알약, "soft"는 화면 개편 시안(docs/mockups/ui-refresh)의
 * 모서리 8px 트랙 + 흰 선택 조각이다. 지금은 매물관리만 "soft"를 쓴다.
 */
export type ToolbarShape = "pill" | "soft";
const softTrackClassName =
  "rounded-[8px] bg-[#f6f5f3] shadow-[inset_0_0_0_1px_#f0efec]";
const softSelectedClassName =
  "bg-white font-medium text-foreground shadow-[0_1px_2px_rgba(40,35,25,0.1)]";
/** 2행 오른쪽 고스트 버튼 (초기화 · 컬럼) */
export const toolbarGhostButtonClassName =
  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20";

// ── 알약 탭 ──────────────────────────────────────────────────────

export function ToolbarPillTabs<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  shape = "pill",
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; count?: number }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  /**
   * "muted": 기본 알약 탭(광고노트의 매매/전세/월세)과 같은 구조에서 트랙만 낮춘 것.
   * 트랙은 베이지 대신 옅은 회색(rgba(55,53,47,0.08)), 고른 탭은 그대로 검정으로 채운다.
   */
  shape?: ToolbarShape | "muted";
}) {
  const soft = shape === "soft";
  const muted = shape === "muted";
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "flex h-[30px] shrink-0 items-center p-0.5",
        soft
          ? cn("gap-0.5", softTrackClassName)
          : cn(
              "gap-px rounded-full",
              muted ? "bg-[rgba(55,53,47,0.08)]" : toolbarSurfaceClassName,
            ),
      )}
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
              "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap px-3 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
              soft ? "rounded-[6px]" : "rounded-full",
              selected
                ? soft
                  ? softSelectedClassName
                  : "bg-foreground font-medium text-white"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  "text-[11.5px] font-normal tabular-nums",
                  selected && !soft ? "text-white/60" : "text-[#a5a39f]",
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
  shape = "pill",
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string; icon: ReactNode }>;
  onChange: (value: T) => void;
  ariaLabel: string;
  /**
   * "muted": 거래 탭과 같은 둥근 회색 트랙(rgba(55,53,47,0.08)). 거래 탭은 검정으로 채우지만
   * 보기 전환은 덜 중요한 조작이라 고른 쪽을 흰 알약(옅은 그림자)으로 띄운다.
   */
  shape?: ToolbarShape | "muted";
}) {
  const soft = shape === "soft";
  const muted = shape === "muted";
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        "flex h-[30px] shrink-0 items-center p-0.5",
        soft
          ? cn("gap-0.5", softTrackClassName)
          : cn(
              "gap-px rounded-full",
              muted ? "bg-[rgba(55,53,47,0.08)]" : toolbarSurfaceClassName,
            ),
      )}
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
              "inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 [&_svg]:size-3.5",
              muted ? "px-3 text-[13px]" : "px-2.5 text-xs",
              soft ? "rounded-[6px]" : "rounded-full",
              selected
                ? soft
                  ? softSelectedClassName
                  : muted
                    ? "bg-white font-medium text-foreground shadow-[0_1px_2px_rgba(40,35,25,0.12)]"
                    : "bg-white font-medium text-foreground"
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
  locationAriaLabel = "지역·단지 필터",
  searchAriaLabel = "매물 검색",
  shape = "pill",
  popoverClassName,
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
  locationAriaLabel?: string;
  searchAriaLabel?: string;
  /** "soft": 위치 칸(단지 │ 동 │ 호)과 검색칸을 흰 입력칸 둘로 나눈다 */
  shape?: ToolbarShape;
  /** 위치 팝오버 너비 등. 기본은 380px */
  popoverClassName?: string;
}) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  // soft 모양의 검색칸은 입력 중이거나 검색어가 있을 때만 펼쳐진다
  const [searchFocused, setSearchFocused] = useState(false);
  const searchExpanded = searchFocused || search.length > 0;

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

  if (shape === "soft") {
    return (
      <Popover open={open} onOpenChange={onOpenChange}>
        {/* 지역·단지: 다른 필터 칩과 같은 모양. 고르기 전에는 테두리 없이 "아이콘 이름 ⌄", 고르면 파란 알약 */}
        <PopoverAnchor asChild>
          <div
            className={cn(
              "inline-flex h-[30px] max-w-[240px] shrink-0 items-center text-[13px] transition-colors",
              isPlaceholder
                ? "rounded-full text-[#6f6c66] hover:bg-[rgba(60,52,40,0.06)] hover:text-foreground"
                : "rounded-full bg-[rgba(35,131,226,0.1)] text-[#2383e2] hover:bg-[rgba(35,131,226,0.15)]",
              open && isPlaceholder && "bg-[rgba(60,52,40,0.06)] text-foreground",
            )}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`${locationAriaLabel}: ${label}`}
                className={cn(
                  "inline-flex h-full min-w-0 items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/40",
                  "rounded-full",
                  isPlaceholder ? "px-2.5" : "pl-2.5 pr-1",
                )}
              >
                <MapPin
                  aria-hidden="true"
                  className={cn(
                    "size-3.5 shrink-0",
                    isPlaceholder && "text-[#a3a09a]",
                  )}
                />
                {isPlaceholder ? (
                  <>
                    <span className="shrink-0">지역·단지</span>
                    <ChevronDown className="size-3 shrink-0 text-[#a5a39f]" />
                  </>
                ) : (
                  <span className="min-w-0 truncate font-semibold">{label}</span>
                )}
              </button>
            </PopoverTrigger>
            {!isPlaceholder && (
              <button
                type="button"
                aria-label="위치 필터 해제"
                onClick={onClear}
                className="mr-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-[#2383e2] transition-colors hover:bg-[rgba(35,131,226,0.18)]"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </PopoverAnchor>
        {/*
          동·호는 고르는 것이 아니라 치는 것이라 입력칸으로 남긴다.
          두 칸을 버블 하나에 담아 한 덩어리의 "주소 뒷부분"으로 읽히게 한다:
          비어 있으면 옅은 회색 버블, 하나라도 값이 있으면 설정된 필터처럼 파란 버블 + × (둘 다 지움).
        */}
        <div
          role="group"
          aria-label="동·호"
          className={cn(
            "flex h-[30px] shrink-0 items-center rounded-full pl-2.5 text-[13px] transition-colors focus-within:shadow-[inset_0_0_0_1.5px_#2383e2]",
            dong || unit
              ? "bg-[rgba(35,131,226,0.1)] pr-0.5 text-[#2383e2]"
              : "bg-[rgba(60,52,40,0.045)] text-foreground hover:bg-[rgba(60,52,40,0.08)] focus-within:hover:bg-[rgba(60,52,40,0.045)]",
          )}
        >
          {/* 다른 필터 칩처럼 맨 앞에 아이콘: 번호를 치는 칸이라 # */}
          <Hash
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0",
              !(dong || unit) && "text-[#a3a09a]",
            )}
          />
          <SoftUnitSegment
            value={dong}
            onChange={onDongChange}
            suffix="동"
            className="w-[84px] pl-2"
          />
          <span
            aria-hidden="true"
            className="h-3.5 w-px shrink-0 bg-current opacity-20"
          />
          <SoftUnitSegment
            value={unit}
            onChange={onUnitChange}
            suffix="호"
            className="w-[84px] pl-2"
          />
          {(dong || unit) && (
            <button
              type="button"
              aria-label="동·호 지우기"
              onClick={() => {
                onDongChange("");
                onUnitChange("");
              }}
              className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-[#2383e2] transition-colors hover:bg-[rgba(35,131,226,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/40"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
        {/*
          검색: 평소에는 돋보기 아이콘만 있고, 누르거나 "/"를 치면 그 자리에서 입력칸으로 펼쳐진다.
          입력칸은 늘 문서에 있어(접혀 있을 땐 너비 0) "/" 단축키와 Tab 이동이 그대로 된다.
          무엇을 찾는지(주소·연락처·메모)는 펼쳐졌을 때만 자리 표시로 알린다.
        */}
        <label
          title={searchExpanded ? undefined : "검색 ( / )"}
          className={cn(
            "flex h-[30px] items-center overflow-hidden rounded-full transition-[width,background-color] duration-150 motion-reduce:transition-none",
            // 펼쳐졌을 때는 줄 폭이 모자라면 먼저 줄어든다(최소 140px). 오른쪽 버튼이 밀려 잘리지 않게 한다.
            searchExpanded
              ? "w-[260px] min-w-[140px] shrink cursor-text gap-1.5 bg-[rgba(60,52,40,0.045)] pl-2.5 pr-1"
              : "w-[30px] shrink-0 cursor-pointer justify-center text-[#6f6c66] hover:bg-[rgba(60,52,40,0.06)] hover:text-foreground",
          )}
        >
          <Search
            aria-hidden="true"
            className={cn(
              "size-3.5 shrink-0",
              searchExpanded && "text-[#a3a09a]",
            )}
          />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (search) onSearchChange("");
                else event.currentTarget.blur();
              }
            }}
            placeholder={searchExpanded ? searchPlaceholder : undefined}
            aria-label={searchAriaLabel}
            className={cn(
              "bg-transparent p-0 text-[13px] text-foreground outline-none placeholder:text-[#a3a09a]",
              searchExpanded ? "min-w-0 flex-1" : "w-0 opacity-0",
            )}
          />
          {search && (
            <button
              type="button"
              aria-label="검색어 지우기"
              onClick={(event) => {
                event.preventDefault();
                onSearchChange("");
                searchInputRef.current?.focus();
              }}
              className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[#a3a09a] hover:bg-[rgba(60,52,40,0.08)] hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </label>
        <PopoverContent
          align="start"
          className={cn("w-[380px] p-0", popoverClassName)}
        >
          {children}
        </PopoverContent>
      </Popover>
    );
  }

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
              aria-label={`${locationAriaLabel}: ${label}`}
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
              aria-label={searchAriaLabel}
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
      <PopoverContent
        align="start"
        className={cn("w-[380px] p-0", popoverClassName)}
      >
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

/**
 * 위치 팝오버의 지역 한 단계(시도 · 시군구 · 법정동).
 * 고르기 상자를 여는 대신 목록을 펼쳐 두어 한 번 눌러 고른다.
 * 윗단계를 아직 고르지 않았으면 hint만 보인다.
 */
export function ToolbarRegionColumn({
  ariaLabel,
  value,
  onChange,
  options,
  hint,
  hasChildren = false,
}: {
  ariaLabel: string;
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** 목록 대신 보일 안내 (윗단계 미선택) */
  hint?: string;
  /** 고른 항목 오른쪽에 다음 단계가 있음을 알리는 화살표 */
  hasChildren?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="min-w-0 overflow-y-auto border-r border-[#f0efec] p-1.5"
    >
      <p className="sticky -top-1.5 z-10 bg-white px-2 pb-1 pt-1.5 text-[11px] font-medium text-[#a3a09a]">
        {ariaLabel}
      </p>
      {hint ? (
        <p className="whitespace-pre-line px-2 py-7 text-center text-[12.5px] leading-relaxed text-[#a3a09a]">
          {hint}
        </p>
      ) : (
        options.map((option) => {
          const selected = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              // 다시 열었을 때 고른 항목이 목록 밖에 숨어 있지 않게 한다
              ref={
                selected && option.value
                  ? (node) => node?.scrollIntoView({ block: "nearest" })
                  : undefined
              }
              onClick={() => {
                if (!selected) onChange(option.value);
              }}
              className={cn(
                "flex h-[30px] w-full items-center gap-1.5 rounded-[6px] px-2 text-left text-[13px] transition-colors focus-visible:outline-none focus-visible:shadow-[inset_0_0_0_2px_#2383e2]",
                selected
                  ? "bg-[rgba(35,131,226,0.1)] font-semibold text-[#2383e2]"
                  : "text-foreground hover:bg-[rgba(60,52,40,0.045)]",
              )}
            >
              <span className="min-w-0 flex-1 truncate">{option.label}</span>
              {selected && hasChildren && option.value && (
                <ChevronRight className="size-3 shrink-0" />
              )}
            </button>
          );
        })
      )}
    </div>
  );
}

/**
 * 동·호 버블 안의 한 칸. 바탕과 모서리는 버블이 맡고, 여기는 숫자 입력과 단위만 둔다.
 * 두 칸의 너비는 같고 고정이다. 값이 없는 칸의 단위는 옅게 보인다.
 */
export function SoftUnitSegment({
  value,
  onChange,
  suffix,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  suffix: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "flex h-full shrink-0 cursor-text items-center gap-1 pr-2",
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
        inputMode="numeric"
        autoComplete="off"
        aria-label={`${suffix} 검색`}
        className="w-0 min-w-0 flex-1 bg-transparent p-0 text-right font-semibold tabular-nums text-inherit outline-none"
      />
      <span className={cn("shrink-0", !value && "opacity-50")}>{suffix}</span>
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
  icon,
  shape = "pill",
}: {
  label: string;
  /** 설정된 값 요약. null이면 설정 전 */
  summary: string | null;
  /** 이름 앞 아이콘 (표 머리의 같은 열 아이콘과 맞춘다) */
  icon?: ReactNode;
  /**
   * "soft": Notion 필터 줄처럼 테두리 없이 "아이콘 이름 ⌄"만 놓고,
   * 값이 걸린 필터만 파란 알약으로 띄운다.
   */
  shape?: ToolbarShape;
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
  const soft = shape === "soft";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "inline-flex h-7 max-w-[260px] shrink-0 items-center transition-colors",
            soft
              ? cn(
                  "text-[13px]",
                  active
                    ? "rounded-full bg-[rgba(35,131,226,0.1)] text-[#2383e2] hover:bg-[rgba(35,131,226,0.15)]"
                    : "rounded-full text-[#6f6c66] hover:bg-[rgba(60,52,40,0.06)] hover:text-foreground",
                  open && !active && "bg-[rgba(60,52,40,0.06)] text-foreground",
                )
              : cn(
                  "rounded-full border text-[12.5px]",
                  active
                    ? "border-transparent bg-[#ebeae6] text-foreground"
                    : "border-[#e3e2de] bg-white text-muted-foreground hover:border-[#d6d5d0] hover:bg-[rgba(55,53,47,0.04)] hover:text-foreground",
                  open && !active && "border-[#d6d5d0] text-foreground",
                ),
          )}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={active ? `${label} 필터: ${summary}` : `${label} 필터`}
              className={cn(
                "inline-flex h-full min-w-0 items-center gap-1.5 focus-visible:outline-none focus-visible:ring-2",
                soft
                  ? cn(
                      "focus-visible:ring-[#2383e2]/40",
                      "rounded-full",
                      active ? "pl-2.5 pr-1" : "px-2.5",
                    )
                  : cn(
                      "rounded-full focus-visible:ring-foreground/20",
                      active ? "pl-3 pr-1" : "pl-3 pr-2.5",
                    ),
              )}
            >
              {icon && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 [&>svg]:size-3.5",
                    !active && "text-[#a3a09a]",
                  )}
                >
                  {icon}
                </span>
              )}
              <span
                className={cn(
                  "shrink-0",
                  active && !soft && "text-muted-foreground",
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
              className={cn(
                "mr-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full transition-colors",
                soft
                  ? "text-[#2383e2] hover:bg-[rgba(35,131,226,0.18)]"
                  : "text-muted-foreground hover:bg-[rgba(55,53,47,0.1)] hover:text-foreground",
              )}
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

/** 켜고 끄기만 하는 필터. 켜지면 값이 있는 칩과 같은 채움으로 보인다. */
export function ToolbarToggleChip({
  label,
  active,
  onToggle,
}: {
  label: string;
  active: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        "inline-flex h-7 shrink-0 items-center rounded-full border px-3 text-[12.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20",
        active
          ? "border-transparent bg-[#ebeae6] font-semibold text-foreground"
          : "border-[#e3e2de] bg-white text-muted-foreground hover:border-[#d6d5d0] hover:bg-[rgba(55,53,47,0.04)] hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/** 하나만 고르는 필터의 선택 목록. 고르면 닫히고, 다시 누르면 해제된다. */
export function ToolbarSelectPanel({
  options,
  value,
  allValue = "all",
  onChange,
  onClose,
}: {
  /** allValue 항목은 '선택 해제'와 같으므로 목록에 보이지 않는다 */
  options: ReadonlyArray<MultiSelectOption>;
  value: string;
  allValue?: string;
  onChange: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <ChecklistFilterPanel
      options={options.filter((option) => option.value !== allValue)}
      selected={value === allValue ? [] : [value]}
      onChange={(values) => {
        onChange(values.find((item) => item !== value) ?? allValue);
        onClose();
      }}
      searchable={false}
      autoFocusList
    />
  );
}

export function ToolbarSelectChip({
  label,
  options,
  value,
  allValue = "all",
  onChange,
  contentClassName = "w-[200px] p-0",
}: {
  label: string;
  options: ReadonlyArray<MultiSelectOption>;
  value: string;
  allValue?: string;
  onChange: (value: string) => void;
  contentClassName?: string;
}) {
  return (
    <ToolbarFilterChip
      label={label}
      summary={
        value === allValue
          ? null
          : (options.find((option) => option.value === value)?.label ?? value)
      }
      onClear={() => onChange(allValue)}
      contentClassName={contentClassName}
    >
      {(close) => (
        <ToolbarSelectPanel
          options={options}
          value={value}
          allValue={allValue}
          onChange={onChange}
          onClose={close}
        />
      )}
    </ToolbarFilterChip>
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
  autoFocusList = false,
}: {
  options: ReadonlyArray<MultiSelectOption>;
  selected: ReadonlyArray<string>;
  onChange: (values: string[]) => void;
  searchPlaceholder?: string;
  emptyText?: string;
  isLoading?: boolean;
  searchable?: boolean;
  listClassName?: string;
  /**
   * 검색 칸 없는 팝오버 목록을 키보드로 고르게 한다. 열리면 목록에 포커스를 두고
   * 고른 항목(없으면 첫 항목)을 강조한다. ↑↓·Home·End·Enter는 cmdk가, Space는 여기서 처리한다.
   */
  autoFocusList?: boolean;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const toggle = (value: string) => {
    onChange(
      selected.includes(value)
        ? selected.filter((item) => item !== value)
        : [...selected, value],
    );
  };
  const commandValue = (option: MultiSelectOption) =>
    `${option.label} ${option.description ?? ""}`.trim();
  const initiallySelected = autoFocusList
    ? options.find(
        (option) => !option.disabled && selected.includes(option.value),
      )
    : undefined;

  useEffect(() => {
    const list = listRef.current;
    if (!autoFocusList || !list) return;
    list.focus({ preventScroll: true });
    // cmdk는 처음부터 강조된 항목을 방향키를 누르기 전까지 aria-activedescendant에 넣지 않는다
    const frame = requestAnimationFrame(() => {
      const active = list.querySelector<HTMLElement>(
        '[cmdk-item][aria-selected="true"]',
      );
      if (active?.id && !list.hasAttribute("aria-activedescendant")) {
        list.setAttribute("aria-activedescendant", active.id);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocusList]);

  return (
    <Command
      className="bg-transparent"
      defaultValue={initiallySelected && commandValue(initiallySelected)}
      onKeyDown={
        autoFocusList
          ? (event) => {
              if (event.key !== " " || event.target !== listRef.current) return;
              event.preventDefault();
              listRef.current
                ?.querySelector<HTMLElement>('[cmdk-item][aria-selected="true"]')
                ?.click();
            }
          : undefined
      }
    >
      {searchable && <CommandInput placeholder={searchPlaceholder} />}
      <CommandList
        ref={listRef}
        className={cn(listClassName, autoFocusList && "outline-none")}
      >
        <CommandEmpty>{isLoading ? "불러오는 중..." : emptyText}</CommandEmpty>
        <CommandGroup>
          {options.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <CommandItem
                key={option.value}
                value={commandValue(option)}
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
            // Enter가 cmdk로 올라가면 이 버튼 대신 강조된 항목이 골라진다
            onKeyDown={
              autoFocusList
                ? (event) => {
                    if (event.key === "Enter") event.stopPropagation();
                  }
                : undefined
            }
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
  shape = "pill",
}: {
  items: ReadonlyArray<AddFilterItem>;
  hint?: string;
  shape?: ToolbarShape;
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
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1 text-[#a5a39f] transition-colors hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20 data-[state=open]:bg-[rgba(55,53,47,0.08)] data-[state=open]:text-foreground",
            shape === "soft"
              ? "rounded-full px-2.5 text-[13px]"
              : "rounded-full px-2.5 text-[12.5px]",
          )}
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

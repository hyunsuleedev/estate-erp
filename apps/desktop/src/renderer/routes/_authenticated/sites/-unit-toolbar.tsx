/**
 * 관리단지 호수 툴바 조각 — 매물관리 툴바(properties/-components/property-toolbar.tsx)와
 * 같은 모양을 쓴다.
 *
 * - 1행 "찾기": 단지 버튼 · 동 범위 칩 · 검색 아이콘(누르면 펼쳐짐) · 보기 전환
 * - 2행 "좁히기": 관리호수/전체 알약 탭 · 필터 칩(타입 · 소유자 · 등록 매물) · "+ 필터"(세입자 · 상담) · 초기화
 */
import { useRef, useState, type ReactNode, type RefObject } from 'react';
import { Building2, Check, ChevronDown, Hash, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  ChecklistFilterPanel,
  SoftUnitSegment,
  ToolbarFilterChip,
} from '../properties/-components/property-toolbar';
import {
  summarizeDongScope,
  type MultiSelectOption,
  type RecordPresenceFilter,
} from './-site-helpers';


// ── 1행: 한 줄 검색바 (동 │ 검색) ───────────────────────────────

export function UnitSearchBar({
  dongOptions,
  selectedDongIds,
  onDongChange,
  totalUnitCount,
  unitNo,
  onUnitNoChange,
  query,
  onQueryChange,
  searchRef,
  disabled,
  searchHint,
}: {
  dongOptions: ReadonlyArray<MultiSelectOption>;
  selectedDongIds: string[];
  onDongChange: (dongIds: string[]) => void;
  totalUnitCount: number;
  /** 호수만 찾는 칸의 값 (숫자) */
  unitNo: string;
  onUnitNoChange: (value: string) => void;
  query: string;
  onQueryChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
  /** 검색 중 입력칸 안에 보일 짧은 안내 (예: 전체 호실에서 검색) */
  searchHint?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const dongPanelRef = useRef<HTMLDivElement>(null);
  const dongSummary = summarizeDongScope(dongOptions, selectedDongIds);
  const hasDongs = dongOptions.length > 0;

  const [searchFocused, setSearchFocused] = useState(false);
  // 검색은 평소 돋보기 아이콘만 있고, 누르거나 "/"를 치면 펼쳐진다 (매물관리와 같은 동작)
  const searchExpanded = searchFocused || query.length > 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {/* 동 범위: 매물관리의 지역·단지와 같은 자리의 필터 칩. 동은 늘 고르는 필터라 골라도
          파란 알약으로 강조하지 않는다 — 배경 없이 글자만 진하게 하고 × 로 해제한다 */}
      {hasDongs && (
        <PopoverAnchor asChild>
          <div
            className={cn(
              'inline-flex h-[30px] max-w-[220px] shrink-0 items-center rounded-full text-[13px] transition-colors',
              dongSummary
                ? 'text-foreground hover:bg-[rgba(60,52,40,0.06)]'
                : 'text-[#6f6c66] hover:bg-[rgba(60,52,40,0.06)] hover:text-foreground',
              open && 'bg-[rgba(60,52,40,0.06)] text-foreground',
            )}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={`동 범위: ${dongSummary ?? '전체 동'}`}
                className={cn(
                  'inline-flex h-full min-w-0 items-center gap-1.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/40',
                  dongSummary ? 'pl-2.5 pr-1' : 'px-2.5',
                )}
              >
                <Building2
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-[#a3a09a]"
                />
                {dongSummary ? (
                  <span className="min-w-0 truncate font-medium">{dongSummary}</span>
                ) : (
                  <>
                    <span className="shrink-0">동</span>
                    <ChevronDown className="size-3 shrink-0 text-[#a5a39f]" />
                  </>
                )}
              </button>
            </PopoverTrigger>
            {dongSummary && (
              <button
                type="button"
                aria-label="동 범위 해제"
                onClick={() => onDongChange([])}
                className="mr-0.5 inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-[#a3a09a] transition-colors hover:bg-[rgba(60,52,40,0.1)] hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        </PopoverAnchor>
      )}
      {/* 호수 찾기: 매물관리의 동·호 버블에서 호 칸만 가져왔다. 동은 왼쪽 동 범위 칩이 맡는다.
          비어 있으면 옅은 회색 버블, 값이 있으면 설정된 필터처럼 파란 버블 + × */}
      <div
        role="group"
        aria-label="호수"
        className={cn(
          'flex h-[30px] shrink-0 items-center rounded-full pl-2.5 text-[13px] transition-colors focus-within:shadow-[inset_0_0_0_1.5px_#2383e2]',
          unitNo
            ? 'bg-[rgba(35,131,226,0.1)] pr-0.5 text-[#2383e2]'
            : 'bg-[rgba(60,52,40,0.045)] text-foreground hover:bg-[rgba(60,52,40,0.08)] focus-within:hover:bg-[rgba(60,52,40,0.045)]',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <Hash
          aria-hidden="true"
          className={cn('size-3.5 shrink-0', !unitNo && 'text-[#a3a09a]')}
        />
        <SoftUnitSegment
          value={unitNo}
          onChange={onUnitNoChange}
          suffix="호"
          className="w-[84px] pl-2"
        />
        {unitNo && (
          <button
            type="button"
            aria-label="호수 지우기"
            onClick={() => onUnitNoChange('')}
            className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-full text-[#2383e2] transition-colors hover:bg-[rgba(35,131,226,0.18)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/40"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      <label
        title={searchExpanded ? undefined : '이름 · 전화 · 상담 검색 ( / )'}
        className={cn(
          'flex h-[30px] items-center overflow-hidden rounded-full transition-[width,background-color] duration-150 motion-reduce:transition-none',
          // 펼쳐졌을 때는 줄 폭이 모자라면 먼저 줄어든다(최소 140px). 오른쪽 보기 전환이 밀려 잘리지 않게 한다.
          searchExpanded
            ? 'w-[300px] min-w-[140px] shrink cursor-text gap-1.5 bg-[rgba(60,52,40,0.045)] pl-2.5 pr-1'
            : 'w-[30px] shrink-0 cursor-pointer justify-center text-[#6f6c66] hover:bg-[rgba(60,52,40,0.06)] hover:text-foreground',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <Search
          aria-hidden="true"
          className={cn('size-3.5 shrink-0', searchExpanded && 'text-[#a3a09a]')}
        />
        <input
          ref={searchRef}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              if (query) onQueryChange('');
              else event.currentTarget.blur();
            }
          }}
          placeholder={searchExpanded ? '이름 · 전화 · 상담' : undefined}
          aria-label="이름, 전화번호, 상담 내용 검색"
          disabled={disabled}
          className={cn(
            'bg-transparent p-0 text-[13px] text-foreground outline-none placeholder:text-[#a3a09a]',
            searchExpanded ? 'min-w-0 flex-1' : 'w-0 opacity-0',
          )}
        />
        {searchExpanded && searchHint && (
          <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground @max-3xl:hidden">
            {searchHint}
          </span>
        )}
        {query && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={(event) => {
              event.preventDefault();
              onQueryChange('');
              searchRef.current?.focus();
            }}
            className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[#a3a09a] hover:bg-[rgba(60,52,40,0.08)] hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        )}
      </label>
      {hasDongs && (
        <PopoverContent
          ref={dongPanelRef}
          align="start"
          className="w-[300px] p-0"
          // 열면 바로 동 찾기 입력에 초점 — 입력·↑↓·Enter만으로 고를 수 있다
          // (기본값이면 맨 위 '전체 동 보기' 버튼에 초점이 가서 목록을 키보드로 다룰 수 없다)
          onOpenAutoFocus={(event) => {
            const input = dongPanelRef.current?.querySelector<HTMLInputElement>('[cmdk-input]');
            if (!input) return;
            event.preventDefault();
            input.focus();
          }}
        >
          <div className="flex h-9 items-center justify-between border-b border-border px-3">
            <p className="text-[11px] font-semibold text-muted-foreground">동</p>
            {selectedDongIds.length > 0 && (
              <button
                type="button"
                onClick={() => onDongChange([])}
                className="inline-flex h-5 items-center rounded px-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-[rgba(55,53,47,0.08)] hover:text-foreground"
              >
                전체 동 보기
              </button>
            )}
          </div>
          <ChecklistFilterPanel
            options={dongOptions.map((option) => ({
              value: option.value,
              label: option.label,
              meta: option.helper,
            }))}
            selected={selectedDongIds}
            onChange={onDongChange}
            // 목록 항목은 입력칸에서 ↑↓·Enter로 고르므로 항목 수와 상관없이 입력칸을 둔다
            searchable
            searchPlaceholder="동 찾기 · ↑↓ 이동 · Enter 선택"
            emptyText="일치하는 동이 없습니다."
            listClassName="max-h-[280px]"
          />
          <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
            <span className="text-xs text-muted-foreground">
              동을 고르지 않으면 전체 {totalUnitCount.toLocaleString()}호를 봅니다.
            </span>
            <Button size="sm" className="h-7 shrink-0 px-3 text-xs" onClick={() => setOpen(false)}>
              완료
            </Button>
          </div>
        </PopoverContent>
      )}
    </Popover>
  );
}

// ── 2행: 호수별 기록 필터 칩 ──────────────────────────────────────

type RecordFilterOption = { value: RecordPresenceFilter; label: string };

/** 등록/미등록 같은 한 가지 고르기 — 칩과 "+ 필터" 메뉴가 같은 목록을 쓴다 */
export function RecordFilterOptions({
  label,
  value,
  onChange,
  options,
  onDone,
}: {
  label: string;
  value: RecordPresenceFilter;
  onChange: (value: RecordPresenceFilter) => void;
  options: ReadonlyArray<RecordFilterOption>;
  onDone: () => void;
}) {
  return (
    <div role="radiogroup" aria-label={`${label} 필터`}>
      {options.map((option) => {
        const isSelected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={isSelected}
            onClick={() => {
              onChange(option.value);
              onDone();
            }}
            className="flex h-8 w-full items-center justify-between rounded-sm px-2 text-left text-[13px] hover:bg-[rgba(55,53,47,0.06)]"
          >
            {option.label}
            {isSelected && <Check className="size-3.5" />}
          </button>
        );
      })}
    </div>
  );
}

export function summarizeRecordFilter(
  value: RecordPresenceFilter,
  options: ReadonlyArray<RecordFilterOption>,
): string | null {
  return value === 'all' ? null : (options.find((option) => option.value === value)?.label ?? null);
}

export function RecordFilterChip({
  label,
  value,
  onChange,
  options,
  icon,
}: {
  label: string;
  value: RecordPresenceFilter;
  onChange: (value: RecordPresenceFilter) => void;
  options: ReadonlyArray<RecordFilterOption>;
  icon?: ReactNode;
}) {
  return (
    <ToolbarFilterChip
      shape="soft"
      icon={icon}
      label={label}
      summary={summarizeRecordFilter(value, options)}
      onClear={() => onChange('all')}
      contentClassName="w-[180px] p-1"
    >
      {(close) => (
        <RecordFilterOptions
          label={label}
          value={value}
          onChange={onChange}
          options={options}
          onDone={close}
        />
      )}
    </ToolbarFilterChip>
  );
}

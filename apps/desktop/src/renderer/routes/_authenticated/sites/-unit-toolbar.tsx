/**
 * 관리단지 호수 툴바 조각 — 매물관리 툴바(properties/-components/property-toolbar.tsx)와
 * 같은 모양을 쓴다.
 *
 * - 1행 "찾기": 단지 버튼 · 한 줄 검색바(동 │ 호수·이름·전화·상담) · 보기 전환 · 동·호수 추가
 * - 2행 "좁히기": 관리호수/전체 알약 탭 · 필터 칩(타입 · 소유자 · 등록 매물) · "+ 필터"(세입자 · 상담) · 초기화
 */
import { useRef, useState, type RefObject } from 'react';
import { Building2, Check, ChevronDown, Search, X } from 'lucide-react';
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
  ToolbarFilterChip,
} from '../properties/-components/property-toolbar';
import {
  summarizeDongScope,
  type MultiSelectOption,
  type RecordPresenceFilter,
} from './-site-helpers';

/** 매물관리 1행과 같은 따뜻한 베이지 바탕 */
const toolbarSurfaceClassName = 'bg-[#f1f0ec]';
const searchBarDividerClassName = 'h-4 w-px shrink-0 bg-[rgba(55,53,47,0.14)]';

// ── 1행: 한 줄 검색바 (동 │ 검색) ───────────────────────────────

export function UnitSearchBar({
  dongOptions,
  selectedDongIds,
  onDongChange,
  totalUnitCount,
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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            'flex h-[30px] min-w-[240px] max-w-[560px] flex-1 items-center rounded-full',
            toolbarSurfaceClassName,
          )}
        >
          {hasDongs && (
            <>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`동 범위: ${dongSummary ?? '전체 동'}`}
                  className="flex h-full min-w-[92px] shrink basis-[150px] items-center gap-1.5 rounded-l-full pl-3.5 pr-3 text-[13px] transition-colors hover:bg-[rgba(55,53,47,0.05)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-foreground/20 data-[state=open]:bg-[rgba(55,53,47,0.05)]"
                >
                  <Building2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-left',
                      dongSummary ? 'font-semibold text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {dongSummary ?? '전체 동'}
                  </span>
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <span className={searchBarDividerClassName} aria-hidden="true" />
            </>
          )}
          <label
            className={cn(
              'flex h-full min-w-[110px] flex-1 cursor-text items-center gap-2 pl-3 pr-1.5 transition-colors hover:bg-[rgba(55,53,47,0.05)] focus-within:bg-white focus-within:shadow-[inset_0_0_0_1px_rgba(55,53,47,0.3)]',
              hasDongs ? 'rounded-r-full' : 'rounded-full pl-3.5',
            )}
          >
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') {
                  if (query) onQueryChange('');
                  else event.currentTarget.blur();
                }
              }}
              placeholder="호수 · 이름 · 전화 · 상담 (/)"
              aria-label="호수, 이름, 전화번호, 상담 내용 검색"
              disabled={disabled}
              className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            {searchHint && (
              <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground @max-3xl:hidden">
                {searchHint}
              </span>
            )}
            {query && (
              <button
                type="button"
                aria-label="검색어 지우기"
                onClick={() => onQueryChange('')}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[#a5a39f] hover:bg-[rgba(55,53,47,0.1)] hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </label>
        </div>
      </PopoverAnchor>
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
}: {
  label: string;
  value: RecordPresenceFilter;
  onChange: (value: RecordPresenceFilter) => void;
  options: ReadonlyArray<RecordFilterOption>;
}) {
  return (
    <ToolbarFilterChip
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

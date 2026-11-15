/**
 * 문서관리 목록의 위쪽: 보기 탭과 도구 줄 · 필터 줄.
 * 화면 이름은 앱 탭이 이미 알려 주므로 제목 · 설명 · 지표는 두지 않는다 (사용자 결정 2026-11-15).
 *
 * Notion 데이터베이스의 순서를 따른다 (Notion 데스크톱 7.42에서 잰 값):
 * - 보기 탭: 높이 32px, 모서리 20px, 좌우 12px, 14px/500. 고른 탭만 옅은 회색 바탕.
 * - 오른쪽 도구: 28px 아이콘 버튼(모서리 6px) — 필터 · 검색 · 표시 설정, 그 뒤에 만들기 버튼.
 * - 필터 줄: 값이 걸린 필터만 파란 알약 (매물관리와 같은 ToolbarFilterChip).
 * 색은 앱 토큰(app.css)만 쓴다.
 */
import { useEffect, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  CalendarDays,
  ChevronDown,
  CircleDashed,
  Files,
  FileText,
  LayoutGrid,
  List,
  ListFilter,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Tag,
  X,
} from 'lucide-react';
import type { ContractDateField, ContractPriceField } from '@estate-erp/api-client';
import { BASE_CONTRACT_TRANSACTION_TYPES, CONTRACT_STATUS_OPTIONS } from './-contract-shared';
import {
  CONTRACT_DATE_FIELD_OPTIONS,
  CONTRACT_PRICE_FIELD_OPTIONS,
  CONTRACT_SEARCH_FIELD_OPTIONS,
  DOC_FILTER_OPTIONS,
  DOC_STATE_PRESETS,
  summarizeDateFilter,
  summarizePriceFilter,
  type ContractListFilterState,
  type DocStatePreset,
} from './-list-model';
import {
  ToolbarFilterChip,
  ToolbarPillToggle,
  ToolbarSelectPanel,
  toolbarGhostButtonClassName,
} from '../properties/-components/property-toolbar';
import { cn } from '@/lib/utils';
import { WonCircleIcon } from '@/components/domain';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';

/** Notion 도구 줄 아이콘 버튼: 28px, 모서리 6px, 흐린 글자색 */
const toolButtonClassName =
  'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[rgba(33,27,23,0.05)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-[rgba(33,27,23,0.05)] data-[state=open]:text-foreground [&>svg]:size-4';

// ── 보기 탭 + 도구 줄 ──────────────────────────────────────────────

export type ContractsLayout = 'list' | 'docs';

export function ContractsViewBar({
  statePreset,
  onStatePresetChange,
  isFilterRowOpen,
  onToggleFilterRow,
  activeFilterCount,
  search,
  searchField,
  onSearchChange,
  onSearchFieldChange,
  searchFocusSignal,
  layout,
  onLayoutChange,
  showPhones,
  onShowPhonesChange,
  actions,
}: {
  statePreset: DocStatePreset;
  onStatePresetChange: (value: DocStatePreset) => void;
  isFilterRowOpen: boolean;
  onToggleFilterRow: () => void;
  /** 걸려 있는 조건 수 (검색어 제외) */
  activeFilterCount: number;
  search: string;
  /** '' = 전체 */
  searchField: string;
  onSearchChange: (value: string) => void;
  onSearchFieldChange: (value: string) => void;
  /** 값이 바뀌면 검색 칸을 열고 커서를 둔다 ('/' 단축키) */
  searchFocusSignal: number;
  layout: ContractsLayout;
  onLayoutChange: (value: ContractsLayout) => void;
  showPhones: boolean;
  onShowPhonesChange: (value: boolean) => void;
  /** 오른쪽 끝 만들기 버튼 */
  actions: ReactNode;
}) {
  return (
    <div data-contracts-viewbar className="@container flex h-12 shrink-0 items-center gap-2 px-4 pt-1">
      <div role="tablist" aria-label="보기" className="-ml-1 flex shrink-0 items-center gap-0.5">
        {(Object.keys(DOC_STATE_PRESETS) as DocStatePreset[]).map((key) => {
          const selected = statePreset === key;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onStatePresetChange(key)}
              className={cn(
                'inline-flex h-8 items-center rounded-[20px] px-3 text-[14px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                selected
                  ? 'bg-[rgba(33,27,23,0.05)] text-foreground'
                  : 'text-muted-foreground hover:bg-[rgba(33,27,23,0.05)] hover:text-foreground',
              )}
            >
              {DOC_STATE_PRESETS[key].label}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex min-w-0 items-center gap-0.5">
        <button
          type="button"
          aria-label={isFilterRowOpen ? '필터 줄 접기' : '필터 줄 펼치기'}
          aria-pressed={isFilterRowOpen}
          title="필터"
          onClick={onToggleFilterRow}
          className={cn(
            toolButtonClassName,
            // 접힌 채로 조건이 걸려 있으면 파랗게 알린다
            !isFilterRowOpen && activeFilterCount > 0 && 'w-auto gap-1 px-1.5 text-info hover:text-info',
          )}
        >
          <ListFilter />
          {!isFilterRowOpen && activeFilterCount > 0 && (
            <span className="text-[13px] font-medium tabular-nums">{activeFilterCount}</span>
          )}
        </button>

        <SearchTool
          value={search}
          field={searchField}
          onChange={onSearchChange}
          onFieldChange={onSearchFieldChange}
          focusSignal={searchFocusSignal}
        />

        <DropdownMenu>
          <DropdownMenuTrigger className={toolButtonClassName} aria-label="표시 설정" title="표시 설정">
            <SlidersHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">표시 설정</DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={showPhones}
              onCheckedChange={(checked) => onShowPhonesChange(checked === true)}
              onSelect={(event) => event.preventDefault()}
            >
              고객 연락처 표시
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <span className="mx-1.5 h-4 w-px shrink-0 bg-border" />

        <ToolbarPillToggle
          shape="muted"
          ariaLabel="문서 보기 방식"
          value={layout}
          onChange={onLayoutChange}
          options={[
            { value: 'list', label: '목록', icon: <List /> },
            { value: 'docs', label: '자료 중심', icon: <LayoutGrid /> },
          ]}
        />
        <div className="ml-2 shrink-0">{actions}</div>
      </div>
    </div>
  );
}

/** Notion식 검색: 돋보기를 누르면 옆으로 펼쳐지고, 비운 채 벗어나면 다시 접힌다. */
function SearchTool({
  value,
  field,
  onChange,
  onFieldChange,
  focusSignal,
}: {
  value: string;
  field: string;
  onChange: (value: string) => void;
  onFieldChange: (value: string) => void;
  focusSignal: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const focusRequestRef = useRef(false);
  // 검색 범위 메뉴는 화면 다른 곳(포털)에 그려진다. 포커스가 그 메뉴로 가도 검색칸을 벗어난 게 아니다.
  const scopeMenuOpenRef = useRef(false);
  const open = expanded || value !== '';
  const fieldLabel = CONTRACT_SEARCH_FIELD_OPTIONS.find((option) => option.value === field)?.label ?? '전체';

  useEffect(() => {
    if (focusSignal === 0) return;
    focusRequestRef.current = true;
    setExpanded(true);
  }, [focusSignal]);
  useEffect(() => {
    if (!open || !focusRequestRef.current) return;
    focusRequestRef.current = false;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [open, focusSignal]);

  if (!open) {
    return (
      <button
        type="button"
        className={toolButtonClassName}
        aria-label="검색"
        title="검색 (/)"
        onClick={() => {
          focusRequestRef.current = true;
          setExpanded(true);
        }}
      >
        <Search />
      </button>
    );
  }

  return (
    <div
      data-contracts-search
      className="flex h-7 min-w-0 items-center gap-1 rounded-md pl-1.5 pr-1 focus-within:bg-[rgba(33,27,23,0.04)]"
      onBlur={(event) => {
        // 검색 칸 · 검색 범위 메뉴 밖으로 나가고 글이 비어 있으면 접는다.
        if (event.currentTarget.contains(event.relatedTarget)) return;
        if (scopeMenuOpenRef.current) return;
        if (event.relatedTarget instanceof Element && event.relatedTarget.closest('[role="menu"]')) return;
        if (!value) setExpanded(false);
      }}
    >
      <Search className="size-4 shrink-0 text-muted-foreground" />
      <DropdownMenu
        onOpenChange={(menuOpen) => {
          scopeMenuOpenRef.current = menuOpen;
        }}
      >
        <DropdownMenuTrigger
          aria-label={`검색 범위: ${fieldLabel}`}
          className="inline-flex h-6 shrink-0 items-center gap-0.5 rounded-[4px] px-1 text-[13px] text-muted-foreground hover:bg-[rgba(33,27,23,0.06)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {fieldLabel}
          <ChevronDown className="size-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44" onCloseAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}>
          <DropdownMenuLabel className="text-[11px] font-normal text-muted-foreground">검색 범위</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={field || 'all'} onValueChange={(next) => onFieldChange(next === 'all' ? '' : next)}>
            <DropdownMenuRadioItem value="all">전체</DropdownMenuRadioItem>
            {CONTRACT_SEARCH_FIELD_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                {option.label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          event.preventDefault();
          if (value) onChange('');
          else {
            setExpanded(false);
            event.currentTarget.blur();
          }
        }}
        placeholder="고객명, 연락처, 소재지"
        aria-label="문서 검색"
        className="h-7 w-[168px] min-w-0 bg-transparent text-[14px] text-foreground outline-none placeholder:text-muted-foreground"
      />
      {value && (
        <button
          type="button"
          aria-label="검색어 지우기"
          onClick={() => {
            onChange('');
            inputRef.current?.focus();
          }}
          className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-[rgba(33,27,23,0.08)] hover:text-foreground"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

// ── 필터 줄 ────────────────────────────────────────────────────────

function SelectChip({
  label,
  icon,
  value,
  options,
  onChange,
}: {
  label: string;
  icon: ReactNode;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <ToolbarFilterChip
      label={label}
      shape="soft"
      icon={icon}
      summary={value ? (options.find((option) => option.value === value)?.label ?? value) : null}
      onClear={() => onChange('')}
      contentClassName="w-[200px] p-0"
    >
      {(close) => (
        <ToolbarSelectPanel options={options} value={value} allValue="" onChange={onChange} onClose={close} />
      )}
    </ToolbarFilterChip>
  );
}

/** 켜고 끄는 필터. 켜지면 값이 걸린 필터와 같은 파란 알약 */
function ToggleChip({ label, active, onToggle }: { label: string; active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        'inline-flex h-7 shrink-0 items-center rounded-full px-2.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2383e2]/40',
        active
          ? 'bg-[rgba(35,131,226,0.1)] font-semibold text-[#2383e2] hover:bg-[rgba(35,131,226,0.15)]'
          : 'text-[#6f6c66] hover:bg-[rgba(60,52,40,0.06)] hover:text-foreground',
      )}
    >
      {label}
    </button>
  );
}

function FieldPicker<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap gap-1">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'inline-flex h-7 items-center rounded-md px-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
              selected
                ? 'bg-[rgba(33,27,23,0.08)] font-medium text-foreground'
                : 'text-muted-foreground hover:bg-[rgba(33,27,23,0.05)] hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function ContractsFilterRow({
  filters,
  docFilter,
  kindOptions,
  canReset,
  onChange,
  onStatusChange,
  onDocFilterChange,
  onReset,
}: {
  filters: ContractListFilterState;
  docFilter: string;
  kindOptions: Array<{ value: string; label: string }>;
  /** 처음 상태가 아니면 초기화가 보인다 */
  canReset: boolean;
  onChange: Dispatch<SetStateAction<ContractListFilterState>>;
  /** 상태 필터는 보기 탭(진행중 · 완료)과 겹치므로 따로 알린다 */
  onStatusChange: (value: string) => void;
  onDocFilterChange: (value: string) => void;
  onReset: () => void;
}) {
  const patch = (partial: Partial<ContractListFilterState>) => onChange((prev) => ({ ...prev, ...partial }));

  return (
    <div data-contracts-filter-row className="flex shrink-0 items-start gap-2 px-4 pb-1.5">
      <div className="-ml-0.5 flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1">
        <SelectChip label="서식" icon={<FileText />} value={filters.kind} options={kindOptions} onChange={(kind) => patch({ kind })} />
        <SelectChip
          label="거래유형"
          icon={<Tag />}
          value={filters.transactionType}
          options={BASE_CONTRACT_TRANSACTION_TYPES}
          onChange={(transactionType) => patch({ transactionType })}
        />
        <SelectChip label="상태" icon={<CircleDashed />} value={filters.status} options={CONTRACT_STATUS_OPTIONS} onChange={onStatusChange} />
        <SelectChip label="문서 준비" icon={<Files />} value={docFilter} options={DOC_FILTER_OPTIONS} onChange={onDocFilterChange} />

        <ToolbarFilterChip
          label="날짜"
          shape="soft"
          icon={<CalendarDays />}
          summary={summarizeDateFilter(filters)}
          onClear={() => patch({ dateFrom: '', dateTo: '' })}
          contentClassName="w-[320px]"
        >
          <div className="space-y-3">
            <FieldPicker
              ariaLabel="날짜 기준"
              value={filters.dateField}
              options={CONTRACT_DATE_FIELD_OPTIONS}
              onChange={(dateField: ContractDateField) => patch({ dateField })}
            />
            <div className="flex items-center gap-1.5">
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(event) => patch({ dateFrom: event.target.value })}
                className="h-8 min-w-0 flex-1"
                aria-label="날짜 시작"
              />
              <span className="text-[13px] text-muted-foreground">~</span>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(event) => patch({ dateTo: event.target.value })}
                className="h-8 min-w-0 flex-1"
                aria-label="날짜 종료"
              />
            </div>
          </div>
        </ToolbarFilterChip>

        <ToolbarFilterChip
          label="금액"
          shape="soft"
          icon={<WonCircleIcon />}
          summary={summarizePriceFilter(filters)}
          onClear={() => patch({ priceMin: '', priceMax: '' })}
          contentClassName="w-[320px]"
        >
          <div className="space-y-3">
            <FieldPicker
              ariaLabel="금액 기준"
              value={filters.priceField}
              options={CONTRACT_PRICE_FIELD_OPTIONS}
              onChange={(priceField: ContractPriceField) => patch({ priceField })}
            />
            <div className="flex items-center gap-1.5">
              <Input
                inputMode="numeric"
                value={filters.priceMin}
                onChange={(event) => patch({ priceMin: event.target.value })}
                placeholder="최소"
                className="h-8 min-w-0 flex-1 tabular-nums"
                aria-label="금액 최소 (만원)"
              />
              <span className="text-[13px] text-muted-foreground">~</span>
              <Input
                inputMode="numeric"
                value={filters.priceMax}
                onChange={(event) => patch({ priceMax: event.target.value })}
                placeholder="최대"
                className="h-8 min-w-0 flex-1 tabular-nums"
                aria-label="금액 최대 (만원)"
              />
              <span className="shrink-0 text-[13px] text-muted-foreground">만원</span>
            </div>
          </div>
        </ToolbarFilterChip>

        <ToggleChip
          label="공동중개"
          active={filters.isJointBrokerage}
          onToggle={() => patch({ isJointBrokerage: !filters.isJointBrokerage })}
        />
        <ToggleChip
          label="보존기간 경과"
          active={filters.retentionOverdue}
          onToggle={() => patch({ retentionOverdue: !filters.retentionOverdue })}
        />
      </div>

      {canReset && (
        <button type="button" className={cn(toolbarGhostButtonClassName, 'shrink-0 rounded-full')} onClick={onReset}>
          <RotateCcw className="size-3.5" />
          초기화
        </button>
      )}
    </div>
  );
}

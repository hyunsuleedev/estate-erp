import { Fragment, useState, useEffect } from 'react';
import {
  X,
  Plus,
  Search,
  SlidersHorizontal,
  ArrowUpDown,
  Check,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { FilterDefinition, ActiveFilter, SortDefinition } from './types';

// ── Filter operator labels ──────────────────────────────────────

const operatorLabels: Record<string, string> = {
  is: '=',
  is_not: '≠',
  contains: '포함',
  gte: '≥',
  lte: '≤',
  is_empty: '비어있음',
  is_not_empty: '비어있지 않음',
};

// ── ViewBar Props ───────────────────────────────────────────────

interface ViewBarProps {
  /** Use the denser, bordered filter hierarchy from workbench list pages. */
  variant?: 'default' | 'workbench';
  // Search
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  /** Hide search when the page already owns a primary search field. */
  showSearch?: boolean;
  /** Keep the search field visible for search-heavy workbench pages. */
  searchAlwaysVisible?: boolean;
  // Filters
  filterDefinitions?: FilterDefinition[];
  activeFilters?: ActiveFilter[];
  onFilterAdd?: (filter: ActiveFilter) => void;
  onFilterRemove?: (filterId: string) => void;
  onFiltersReset?: () => void;
  // Fields to pin as always-visible chip triggers. When set, matching
  // definitions are rendered inline between search and sort; the "+ 필터" menu
  // only lists the remaining fields.
  inlineFilters?: string[];
  /** Optional visual groups for inline filters. Workbench groups get dividers. */
  inlineFilterGroups?: string[][];
  // Sorts
  sortDefinitions?: { field: string; label: string }[];
  activeSorts?: SortDefinition[];
  onSortAdd?: (sort: SortDefinition) => void;
  onSortRemove?: (field: string) => void;
  /** Hide the secondary chip row while keeping inline filter state visible. */
  showActiveChips?: boolean;
  // Actions (right side)
  actions?: React.ReactNode;
}

export function ViewBar({
  variant = 'default',
  search,
  onSearchChange,
  searchPlaceholder = '검색...',
  showSearch = true,
  searchAlwaysVisible = false,
  filterDefinitions = [],
  activeFilters = [],
  onFilterAdd,
  onFilterRemove,
  onFiltersReset,
  inlineFilters,
  inlineFilterGroups,
  sortDefinitions = [],
  activeSorts = [],
  onSortAdd,
  onSortRemove,
  showActiveChips = true,
  actions,
}: ViewBarProps) {
  const [searchExpanded, setSearchExpanded] = useState(searchAlwaysVisible || !!search);
  const isSearchVisible = searchAlwaysVisible || searchExpanded;
  const isWorkbench = variant === 'workbench';

  const hasActiveItems = activeFilters.length > 0 || activeSorts.length > 0;

  const resolvedInlineGroups = (
    inlineFilterGroups ?? (inlineFilters ? [inlineFilters] : [])
  )
    .map(
      (group) =>
        group
          .map((field) => filterDefinitions.find((d) => d.field === field))
          .filter(Boolean) as FilterDefinition[],
    )
    .filter((group) => group.length > 0);
  const inlineDefs = resolvedInlineGroups.flat();
  const inlineFieldSet = new Set(inlineDefs.map((d) => d.field));
  const menuDefs = filterDefinitions.filter((d) => !inlineFieldSet.has(d.field));

  return (
    <div className="flex flex-col gap-0">
      {/* Main bar */}
      <div
        data-view-bar-variant={variant}
        className={cn(
          'flex items-center px-3 py-2',
          isWorkbench ? 'gap-2' : 'gap-1.5',
        )}
      >
        {showSearch && (
          <>
            {/* Search */}
            <div className="flex items-center gap-1">
              {isSearchVisible ? (
                <div className="flex items-center gap-1 rounded-md border border-border/70 bg-background px-2 shadow-[0_1px_1px_rgba(0,0,0,0.02)] focus-within:border-ring/50 focus-within:ring-2 focus-within:ring-ring/10">
                  <Search className="size-3.5 text-muted-foreground" />
                  <Input
                    type="text"
                    value={search ?? ''}
                    onChange={(e) => onSearchChange?.(e.target.value)}
                    placeholder={searchPlaceholder}
                    className={cn(
                      'h-7 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0',
                      searchAlwaysVisible ? 'w-52 lg:w-72' : 'w-36',
                    )}
                    autoFocus={!searchAlwaysVisible}
                    onBlur={() => {
                      if (!searchAlwaysVisible && !search) setSearchExpanded(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') {
                        onSearchChange?.('');
                        if (!searchAlwaysVisible) setSearchExpanded(false);
                      }
                    }}
                  />
                  {search && (
                    <button
                      type="button"
                      onClick={() => {
                        onSearchChange?.('');
                        if (!searchAlwaysVisible) setSearchExpanded(false);
                      }}
                      aria-label="검색어 지우기"
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1 px-2 text-xs text-muted-foreground"
                  onClick={() => setSearchExpanded(true)}
                >
                  <Search className="size-3.5" />
                  검색
                </Button>
              )}
            </div>

            <div className="h-4 w-px bg-border/50" />
          </>
        )}

        {/* Inline filter chips (always visible) */}
        {resolvedInlineGroups.map((group, groupIndex) => (
          <Fragment key={group.map((def) => def.field).join('-')}>
            {isWorkbench && groupIndex > 0 && (
              <div className="h-5 w-px shrink-0 bg-border" aria-hidden="true" />
            )}
            <div className="flex shrink-0 items-center gap-1.5">
              {group.map((def) => {
                const existing = activeFilters.find((f) => f.field === def.field);
                return (
                  <InlineFilterChip
                    key={def.field}
                    def={def}
                    existing={existing}
                    workbench={isWorkbench}
                    onApply={(filter) => onFilterAdd?.(filter)}
                    onClear={() => existing && onFilterRemove?.(existing.id)}
                  />
                );
              })}
            </div>
          </Fragment>
        ))}

        {/* "+ 필터" dropdown — shows only non-inline definitions */}
        {menuDefs.length > 0 && (
          <FilterDropdown
            definitions={menuDefs}
            activeFilters={activeFilters}
            onFilterAdd={onFilterAdd}
            workbench={isWorkbench}
          />
        )}

        {/* Sort dropdown */}
        {sortDefinitions.length > 0 && (
          <SortDropdown
            definitions={sortDefinitions}
            activeSorts={activeSorts}
            onSortAdd={onSortAdd}
            workbench={isWorkbench}
          />
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        {actions}
      </div>

      {/* Active filters/sorts chips (Twenty-inspired chip bar) */}
      {showActiveChips && hasActiveItems && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/30 px-3 py-1.5">
          {/* Filter chips */}
          {activeFilters.map((filter) => {
            const def = filterDefinitions.find((d) => d.field === filter.field);
            let displayText: string;
            if (filter.operator === 'in' && filter.values) {
              // Prefer pre-stored display labels (async options) if present
              const labels = filter.displayValues?.length === filter.values.length
                ? filter.displayValues
                : filter.values.map(
                    (v) => def?.options?.find((o) => o.value === v)?.label ?? v,
                  );
              displayText = labels.join(', ');
            } else if (filter.operator === 'between') {
              const min = filter.valueMin ?? '';
              const max = filter.valueMax ?? '';
              if (min && max) displayText = `${min} ~ ${max}`;
              else if (min) displayText = `${min} 이상`;
              else displayText = `${max} 이하`;
            } else {
              displayText = filter.displayValue ?? filter.value;
            }
            return (
              <Badge
                key={filter.id}
                variant="secondary"
                className="gap-1 rounded-md py-0.5 pr-1 text-xs font-normal"
              >
                <span className="text-muted-foreground">{def?.label ?? filter.field}</span>
                <span className="text-muted-foreground/60">
                  {filter.operator === 'in'
                    ? '⊃'
                    : filter.operator === 'between'
                    ? '∈'
                    : operatorLabels[filter.operator]}
                </span>
                <span className="font-medium">{displayText}</span>
                <button
                  onClick={() => onFilterRemove?.(filter.id)}
                  className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}

          {/* Sort chips */}
          {activeSorts.map((sort) => {
            const def = sortDefinitions.find((d) => d.field === sort.field);
            return (
              <Badge
                key={sort.field}
                variant="outline"
                className="gap-1 rounded-md py-0.5 pr-1 text-xs font-normal"
              >
                <ArrowUpDown className="size-3 text-muted-foreground" />
                <span>{def?.label ?? sort.field}</span>
                <span className="text-muted-foreground">
                  {sort.direction === 'asc' ? '↑' : '↓'}
                </span>
                <button
                  onClick={() => onSortRemove?.(sort.field)}
                  className="ml-0.5 rounded-sm hover:bg-muted-foreground/20"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}

          {/* Reset all */}
          {hasActiveItems && (
            <button
              onClick={onFiltersReset}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              초기화
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Filter Dropdown ─────────────────────────────────────────────

function FilterDropdown({
  definitions,
  activeFilters,
  onFilterAdd,
  workbench = false,
}: {
  definitions: FilterDefinition[];
  activeFilters: ActiveFilter[];
  onFilterAdd?: (filter: ActiveFilter) => void;
  workbench?: boolean;
}) {
  const [openField, setOpenField] = useState<string | null>(null);
  const activeCount = workbench
    ? activeFilters.filter((filter) =>
        definitions.some((definition) => definition.field === filter.field),
      ).length
    : activeFilters.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'text-xs text-muted-foreground',
            workbench
              ? 'h-8 gap-1.5 rounded-md border border-border bg-white px-2.5 shadow-none hover:border-foreground/30 hover:bg-white hover:text-foreground'
              : 'h-7 gap-1 px-2',
          )}
        >
          <SlidersHorizontal className="size-3.5" />
          필터
          {activeCount > 0 && (
            <span
              className={cn(
                'flex size-4 items-center justify-center rounded-full text-[10px]',
                workbench
                  ? 'bg-foreground/[0.08] font-semibold text-foreground'
                  : 'bg-primary text-primary-foreground',
              )}
            >
              {activeCount}
            </span>
          )}
          {workbench && <ChevronDown className="size-3.5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          필터 추가
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {definitions.map((def) => {
          // Legacy: select-type renders each option as its own menu item.
          if (def.type === 'select' && def.options) {
            return def.options.map((opt) => {
              const isActive = activeFilters.some(
                (f) => f.field === def.field && f.value === opt.value,
              );
              return (
                <DropdownMenuItem
                  key={`${def.field}-${opt.value}`}
                  onClick={() => {
                    if (!isActive) {
                      onFilterAdd?.({
                        id: `${def.field}-${opt.value}-${Date.now()}`,
                        field: def.field,
                        operator: 'is',
                        value: opt.value,
                        displayValue: opt.label,
                      });
                    }
                  }}
                  className="gap-2 text-xs"
                >
                  {opt.color && (
                    <span className={cn('size-2 rounded-full', opt.color)} />
                  )}
                  <span className="text-muted-foreground">{def.label}:</span>
                  {opt.label}
                  {isActive && <Check className="ml-auto size-3 text-primary" />}
                </DropdownMenuItem>
              );
            });
          }
          // New rich types open a side popover.
          if (
            def.type === 'multiSelect' ||
            def.type === 'asyncMultiSelect' ||
            def.type === 'numberRange' ||
            def.type === 'dateRange'
          ) {
            return (
              <RichFilterMenuItem
                key={def.field}
                def={def}
                activeFilters={activeFilters}
                onFilterAdd={onFilterAdd}
                open={openField === def.field}
                onOpenChange={(open) => setOpenField(open ? def.field : null)}
              />
            );
          }
          return (
            <DropdownMenuItem
              key={def.field}
              className="gap-2 text-xs"
              onClick={() => {
                onFilterAdd?.({
                  id: `${def.field}-${Date.now()}`,
                  field: def.field,
                  operator: def.operators[0] ?? 'is',
                  value: '',
                  displayValue: '',
                });
              }}
            >
              <Plus className="size-3 text-muted-foreground" />
              {def.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Rich filter menu item with side popover (multiSelect/range) ──

function RichFilterMenuItem({
  def,
  activeFilters,
  onFilterAdd,
  open,
  onOpenChange,
}: {
  def: FilterDefinition;
  activeFilters: ActiveFilter[];
  onFilterAdd?: (filter: ActiveFilter) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const existing = activeFilters.find((f) => f.field === def.field);
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-xs outline-none hover:bg-accent focus:bg-accent data-[state=open]:bg-accent"
          onClick={(e) => {
            e.preventDefault();
            onOpenChange(!open);
          }}
        >
          <Plus className="size-3 text-muted-foreground" />
          {def.label}
          {existing && <Check className="ml-auto size-3 text-primary" />}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-64 p-3">
        {def.type === 'multiSelect' && (
          <MultiSelectFilterBody
            def={def}
            existing={existing}
            onApply={(values) => {
              if (!values.length) {
                onOpenChange(false);
                return;
              }
              onFilterAdd?.({
                id: existing?.id ?? `${def.field}-${Date.now()}`,
                field: def.field,
                operator: 'in',
                value: values.join(','),
                values,
              });
              onOpenChange(false);
            }}
          />
        )}
        {def.type === 'numberRange' && (
          <NumberRangeFilterBody
            def={def}
            existing={existing}
            onApply={(min, max) => {
              if (!min && !max) {
                onOpenChange(false);
                return;
              }
              onFilterAdd?.({
                id: existing?.id ?? `${def.field}-${Date.now()}`,
                field: def.field,
                operator: 'between',
                value: `${min ?? ''}~${max ?? ''}`,
                valueMin: min,
                valueMax: max,
              });
              onOpenChange(false);
            }}
          />
        )}
        {def.type === 'dateRange' && (
          <DateRangeFilterBody
            def={def}
            existing={existing}
            onApply={(min, max) => {
              if (!min && !max) {
                onOpenChange(false);
                return;
              }
              onFilterAdd?.({
                id: existing?.id ?? `${def.field}-${Date.now()}`,
                field: def.field,
                operator: 'between',
                value: `${min ?? ''}~${max ?? ''}`,
                valueMin: min,
                valueMax: max,
              });
              onOpenChange(false);
            }}
          />
        )}
        {def.type === 'asyncMultiSelect' && def.fetchOptions && (
          <AsyncMultiSelectFilterBody
            def={def}
            existing={existing}
            onApply={(values, displayValues) => {
              if (!values.length) {
                onOpenChange(false);
                return;
              }
              onFilterAdd?.({
                id: existing?.id ?? `${def.field}-${Date.now()}`,
                field: def.field,
                operator: 'in',
                value: values.join(','),
                values,
                displayValues,
              });
              onOpenChange(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function MultiSelectFilterBody({
  def,
  existing,
  onApply,
}: {
  def: FilterDefinition;
  existing?: ActiveFilter;
  onApply: (values: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>(existing?.values ?? []);
  const toggle = (v: string) =>
    setSelected((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-medium text-muted-foreground">{def.label}</div>
      <div className="flex flex-wrap gap-1">
        {def.options?.map((opt) => {
          const checked = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggle(opt.value)}
              className={cn(
                'rounded-md border px-2 py-0.5 text-[11px] transition-colors',
                checked
                  ? 'border-primary/40 bg-primary/10 text-primary'
                  : 'border-border/60 text-muted-foreground hover:bg-accent/60',
              )}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-end gap-1">
        <Button variant="ghost" size="xs" className="h-6 text-xs" onClick={() => setSelected([])}>
          초기화
        </Button>
        <Button size="xs" className="h-6 text-xs" onClick={() => onApply(selected)}>
          적용
        </Button>
      </div>
    </div>
  );
}

function NumberRangeFilterBody({
  def,
  existing,
  onApply,
}: {
  def: FilterDefinition;
  existing?: ActiveFilter;
  onApply: (min: string, max: string) => void;
}) {
  const [min, setMin] = useState(existing?.valueMin ?? '');
  const [max, setMax] = useState(existing?.valueMax ?? '');
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-medium text-muted-foreground">{def.label}</div>
      <div className="flex items-center gap-1.5">
        <Input
          type="number"
          inputMode="numeric"
          placeholder="최소"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          className="h-7 flex-1 text-xs tabular-nums"
        />
        <span className="text-xs text-muted-foreground">~</span>
        <Input
          type="number"
          inputMode="numeric"
          placeholder="최대"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          className="h-7 flex-1 text-xs tabular-nums"
        />
        {def.unit && <span className="text-[11px] text-muted-foreground">{def.unit}</span>}
      </div>
      <div className="mt-1 flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="xs"
          className="h-6 text-xs"
          onClick={() => {
            setMin('');
            setMax('');
          }}
        >
          초기화
        </Button>
        <Button size="xs" className="h-6 text-xs" onClick={() => onApply(min, max)}>
          적용
        </Button>
      </div>
    </div>
  );
}

function DateRangeFilterBody({
  def,
  existing,
  onApply,
}: {
  def: FilterDefinition;
  existing?: ActiveFilter;
  onApply: (min: string, max: string) => void;
}) {
  const [min, setMin] = useState(existing?.valueMin ?? '');
  const [max, setMax] = useState(existing?.valueMax ?? '');
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-medium text-muted-foreground">{def.label}</div>
      <div className="flex items-center gap-1.5">
        <Input
          type="date"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          className="h-7 flex-1 text-xs"
        />
        <span className="text-xs text-muted-foreground">~</span>
        <Input
          type="date"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          className="h-7 flex-1 text-xs"
        />
      </div>
      <div className="mt-1 flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="xs"
          className="h-6 text-xs"
          onClick={() => {
            setMin('');
            setMax('');
          }}
        >
          초기화
        </Button>
        <Button size="xs" className="h-6 text-xs" onClick={() => onApply(min, max)}>
          적용
        </Button>
      </div>
    </div>
  );
}

// ── Sort Dropdown ───────────────────────────────────────────────

function SortDropdown({
  definitions,
  activeSorts,
  onSortAdd,
  workbench = false,
}: {
  definitions: { field: string; label: string }[];
  activeSorts: SortDefinition[];
  onSortAdd?: (sort: SortDefinition) => void;
  workbench?: boolean;
}) {
  const primarySort = activeSorts[0];
  const primaryDefinition = primarySort
    ? definitions.find((definition) => definition.field === primarySort.field)
    : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'text-xs text-muted-foreground',
            workbench
              ? cn(
                  'h-8 gap-1.5 rounded-md border border-border bg-white px-2.5 shadow-none hover:border-foreground/30 hover:bg-white hover:text-foreground',
                  primarySort && 'border-foreground/25 bg-foreground/[0.06]',
                )
              : 'h-7 gap-1 px-2',
          )}
        >
          <ArrowUpDown className="size-3.5" />
          정렬
          {workbench && primarySort ? (
            <span className="font-semibold text-foreground">
              {primaryDefinition?.label ?? primarySort.field}{' '}
              {primarySort.direction === 'asc' ? '↑' : '↓'}
            </span>
          ) : activeSorts.length > 0 ? (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {activeSorts.length}
            </span>
          ) : null}
          {workbench && <ChevronDown className="size-3.5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          정렬 기준
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {definitions.map((def) => {
          const activeSort = activeSorts.find((s) => s.field === def.field);
          return (
            <DropdownMenuItem
              key={def.field}
              className="gap-2 text-xs"
              onClick={() => {
                // Toggle: none → asc → desc → remove
                const nextDir = !activeSort
                  ? 'desc'
                  : activeSort.direction === 'desc'
                    ? 'asc'
                    : 'desc';
                onSortAdd?.({ field: def.field, label: def.label, direction: nextDir });
              }}
            >
              {def.label}
              {activeSort && (
                <span className="ml-auto text-muted-foreground">
                  {activeSort.direction === 'asc' ? '↑ 오름차순' : '↓ 내림차순'}
                </span>
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Inline Filter Chip (always-visible trigger + popover body) ──

function InlineFilterChip({
  def,
  existing,
  onApply,
  onClear,
  workbench = false,
}: {
  def: FilterDefinition;
  existing?: ActiveFilter;
  onApply: (filter: ActiveFilter) => void;
  onClear: () => void;
  workbench?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const summary = (() => {
    if (!existing) return '전체';
    if (existing.operator === 'in' && existing.values?.length) {
      const labels =
        existing.displayValues?.length === existing.values.length
          ? existing.displayValues
          : existing.values.map((v) => def.options?.find((o) => o.value === v)?.label ?? v);
      return labels.length === 1 ? labels[0] : `${labels[0]} 외 ${labels.length - 1}`;
    }
    if (existing.operator === 'between') {
      const min = existing.valueMin ?? '';
      const max = existing.valueMax ?? '';
      if (min && max) return `${min} ~ ${max}`;
      if (min) return `${min} 이상`;
      if (max) return `${max} 이하`;
      return '전체';
    }
    if (existing.operator === 'is') {
      return existing.displayValue ?? existing.value;
    }
    return '설정됨';
  })();

  const active = !!existing;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={workbench ? 'ghost' : active ? 'secondary' : 'ghost'}
          size="sm"
          className={cn(
            workbench
              ? 'h-8 max-w-[240px] gap-1.5 rounded-md border border-border bg-white px-2.5 text-xs shadow-none hover:border-foreground/30 hover:bg-white'
              : 'h-7 gap-1 px-2 text-xs',
            workbench && active &&
              'border-foreground/25 bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.09]',
          )}
        >
          <span className="text-muted-foreground">{def.label}</span>
          <span
            className={cn(
              'max-w-28 truncate',
              active ? 'font-semibold text-foreground' : 'font-medium text-foreground',
            )}
          >
            {summary}
          </span>
          {active && (
            <span
              role="button"
              tabIndex={workbench ? -1 : 0}
              aria-label={`${def.label} 필터 해제`}
              onPointerDown={(e) => {
                if (!workbench) return;
                e.preventDefault();
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClear();
              }}
              className="ml-0.5 rounded-sm text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </span>
          )}
          {workbench && !active && (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        {def.type === 'multiSelect' && (
          <MultiSelectFilterBody
            def={def}
            existing={existing}
            onApply={(values) => {
              if (!values.length) {
                onClear();
                setOpen(false);
                return;
              }
              onApply({
                id: existing?.id ?? `${def.field}-${Date.now()}`,
                field: def.field,
                operator: 'in',
                value: values.join(','),
                values,
              });
              setOpen(false);
            }}
          />
        )}
        {def.type === 'numberRange' && (
          <NumberRangeFilterBody
            def={def}
            existing={existing}
            onApply={(min, max) => {
              if (!min && !max) {
                onClear();
                setOpen(false);
                return;
              }
              onApply({
                id: existing?.id ?? `${def.field}-${Date.now()}`,
                field: def.field,
                operator: 'between',
                value: `${min ?? ''}~${max ?? ''}`,
                valueMin: min,
                valueMax: max,
              });
              setOpen(false);
            }}
          />
        )}
        {def.type === 'dateRange' && (
          <DateRangeFilterBody
            def={def}
            existing={existing}
            onApply={(min, max) => {
              if (!min && !max) {
                onClear();
                setOpen(false);
                return;
              }
              onApply({
                id: existing?.id ?? `${def.field}-${Date.now()}`,
                field: def.field,
                operator: 'between',
                value: `${min ?? ''}~${max ?? ''}`,
                valueMin: min,
                valueMax: max,
              });
              setOpen(false);
            }}
          />
        )}
        {def.type === 'select' && def.options && (
          <SingleSelectFilterBody
            def={def}
            existing={existing}
            onApply={(value, label) => {
              if (!value) {
                onClear();
                setOpen(false);
                return;
              }
              onApply({
                id: existing?.id ?? `${def.field}-${Date.now()}`,
                field: def.field,
                operator: 'is',
                value,
                displayValue: label,
              });
              setOpen(false);
            }}
          />
        )}
        {def.type === 'asyncMultiSelect' && def.fetchOptions && (
          <AsyncMultiSelectFilterBody
            def={def}
            existing={existing}
            onApply={(values, displayValues) => {
              if (!values.length) {
                onClear();
                setOpen(false);
                return;
              }
              onApply({
                id: existing?.id ?? `${def.field}-${Date.now()}`,
                field: def.field,
                operator: 'in',
                value: values.join(','),
                values,
                displayValues,
              });
              setOpen(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function AsyncMultiSelectFilterBody({
  def,
  existing,
  onApply,
}: {
  def: FilterDefinition;
  existing?: ActiveFilter;
  onApply: (values: string[], displayValues: string[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [options, setOptions] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedValues, setSelectedValues] = useState<string[]>(existing?.values ?? []);
  const [selectedLabels, setSelectedLabels] = useState<string[]>(
    existing?.displayValues && existing?.displayValues.length === (existing.values?.length ?? 0)
      ? existing.displayValues
      : existing?.values ?? [],
  );

  // Debounced fetch as user types
  useEffect(() => {
    if (!def.fetchOptions) return;
    if (!query.trim()) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await def.fetchOptions!(query);
        if (!cancelled) setOptions(res);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, def]);

  const toggle = (value: string, label: string) => {
    setSelectedValues((prev) => {
      if (prev.includes(value)) {
        const idx = prev.indexOf(value);
        setSelectedLabels((l) => l.filter((_, i) => i !== idx));
        return prev.filter((v) => v !== value);
      }
      setSelectedLabels((l) => [...l, label]);
      return [...prev, value];
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-medium text-muted-foreground">{def.label}</div>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground" />
        <Input
          autoFocus
          placeholder={`${def.label} 검색`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-7 pl-6 text-xs"
        />
      </div>
      {selectedValues.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {selectedValues.map((v, i) => (
            <button
              key={v}
              type="button"
              onClick={() => toggle(v, selectedLabels[i] ?? v)}
              className="flex items-center gap-1 rounded-md border border-primary/40 bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
            >
              {selectedLabels[i] ?? v}
              <X className="size-3" />
            </button>
          ))}
        </div>
      )}
      <div className="max-h-48 overflow-y-auto">
        {loading ? (
          <div className="px-2 py-2 text-[11px] text-muted-foreground">검색 중...</div>
        ) : options.length === 0 ? (
          <div className="px-2 py-2 text-[11px] text-muted-foreground">
            {query.trim() ? '검색 결과 없음' : '검색어를 입력하세요'}
          </div>
        ) : (
          options.map((opt) => {
            const checked = selectedValues.includes(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggle(opt.value, opt.label)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent/60"
              >
                <span
                  className={cn(
                    'flex size-3.5 items-center justify-center rounded-sm border text-[10px]',
                    checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
                  )}
                >
                  {checked && '✓'}
                </span>
                <span className="truncate">{opt.label}</span>
              </button>
            );
          })
        )}
      </div>
      <div className="mt-1 flex items-center justify-end gap-1">
        <Button
          variant="ghost"
          size="xs"
          className="h-6 text-xs"
          onClick={() => {
            setSelectedValues([]);
            setSelectedLabels([]);
          }}
        >
          초기화
        </Button>
        <Button
          size="xs"
          className="h-6 text-xs"
          onClick={() => onApply(selectedValues, selectedLabels)}
        >
          적용
        </Button>
      </div>
    </div>
  );
}

function SingleSelectFilterBody({
  def,
  existing,
  onApply,
}: {
  def: FilterDefinition;
  existing?: ActiveFilter;
  onApply: (value: string, label: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="mb-1 text-[11px] font-medium text-muted-foreground">{def.label}</div>
      <button
        type="button"
        onClick={() => onApply('', '')}
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1 text-xs transition-colors',
          !existing ? 'bg-accent font-medium' : 'hover:bg-accent/60',
        )}
      >
        <span
          className={cn(
            'flex size-3.5 items-center justify-center rounded-sm border',
            !existing ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
          )}
        >
          {!existing && '✓'}
        </span>
        전체
      </button>
      {def.options?.map((opt) => {
        const checked = existing?.value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onApply(opt.value, opt.label)}
            className="flex items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-accent/60"
          >
            <span
              className={cn(
                'flex size-3.5 items-center justify-center rounded-sm border text-[10px]',
                checked ? 'border-primary bg-primary text-primary-foreground' : 'border-border',
              )}
            >
              {checked && '✓'}
            </span>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

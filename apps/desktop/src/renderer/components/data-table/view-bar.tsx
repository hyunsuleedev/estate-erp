import { useState } from 'react';
import { X, Plus, Search, SlidersHorizontal, ArrowUpDown, Check } from 'lucide-react';
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
  // Search
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  // Filters
  filterDefinitions?: FilterDefinition[];
  activeFilters?: ActiveFilter[];
  onFilterAdd?: (filter: ActiveFilter) => void;
  onFilterRemove?: (filterId: string) => void;
  onFiltersReset?: () => void;
  // Sorts
  sortDefinitions?: { field: string; label: string }[];
  activeSorts?: SortDefinition[];
  onSortAdd?: (sort: SortDefinition) => void;
  onSortRemove?: (field: string) => void;
  // Actions (right side)
  actions?: React.ReactNode;
}

export function ViewBar({
  search,
  onSearchChange,
  searchPlaceholder = '검색...',
  filterDefinitions = [],
  activeFilters = [],
  onFilterAdd,
  onFilterRemove,
  onFiltersReset,
  sortDefinitions = [],
  activeSorts = [],
  onSortAdd,
  onSortRemove,
  actions,
}: ViewBarProps) {
  const [searchExpanded, setSearchExpanded] = useState(!!search);

  const hasActiveItems = activeFilters.length > 0 || activeSorts.length > 0;

  return (
    <div className="flex flex-col gap-0">
      {/* Main bar */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        {/* Search */}
        <div className="flex items-center gap-1">
          {searchExpanded ? (
            <div className="flex items-center gap-1 rounded-md bg-muted/80 px-2">
              <Search className="size-3.5 text-muted-foreground" />
              <Input
                type="text"
                value={search ?? ''}
                onChange={(e) => onSearchChange?.(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-7 w-36 border-0 bg-transparent px-1 text-sm shadow-none focus-visible:ring-0"
                autoFocus
                onBlur={() => {
                  if (!search) setSearchExpanded(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    onSearchChange?.('');
                    setSearchExpanded(false);
                  }
                }}
              />
              {search && (
                <button
                  onClick={() => {
                    onSearchChange?.('');
                    setSearchExpanded(false);
                  }}
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

        {/* Filter dropdown */}
        {filterDefinitions.length > 0 && (
          <FilterDropdown
            definitions={filterDefinitions}
            activeFilters={activeFilters}
            onFilterAdd={onFilterAdd}
          />
        )}

        {/* Sort dropdown */}
        {sortDefinitions.length > 0 && (
          <SortDropdown
            definitions={sortDefinitions}
            activeSorts={activeSorts}
            onSortAdd={onSortAdd}
          />
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions */}
        {actions}
      </div>

      {/* Active filters/sorts chips (Twenty-inspired chip bar) */}
      {hasActiveItems && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/30 px-3 py-1.5">
          {/* Filter chips */}
          {activeFilters.map((filter) => {
            const def = filterDefinitions.find((d) => d.field === filter.field);
            return (
              <Badge
                key={filter.id}
                variant="secondary"
                className="gap-1 rounded-md py-0.5 pr-1 text-xs font-normal"
              >
                <span className="text-muted-foreground">{def?.label ?? filter.field}</span>
                <span className="text-muted-foreground/60">{operatorLabels[filter.operator]}</span>
                <span className="font-medium">{filter.displayValue ?? filter.value}</span>
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
}: {
  definitions: FilterDefinition[];
  activeFilters: ActiveFilter[];
  onFilterAdd?: (filter: ActiveFilter) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
        >
          <SlidersHorizontal className="size-3.5" />
          필터
          {activeFilters.length > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {activeFilters.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          필터 추가
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {definitions.map((def) => {
          // For select-type filters, show options directly
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

// ── Sort Dropdown ───────────────────────────────────────────────

function SortDropdown({
  definitions,
  activeSorts,
  onSortAdd,
}: {
  definitions: { field: string; label: string }[];
  activeSorts: SortDefinition[];
  onSortAdd?: (sort: SortDefinition) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 px-2 text-xs text-muted-foreground"
        >
          <ArrowUpDown className="size-3.5" />
          정렬
          {activeSorts.length > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
              {activeSorts.length}
            </span>
          )}
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

import type { ColumnDef, SortingState, ColumnFiltersState } from '@tanstack/react-table';

// ── Filter types (Twenty-inspired) ──────────────────────────────

export type FilterOperator =
  | 'is'
  | 'is_not'
  | 'contains'
  | 'gte'
  | 'lte'
  | 'is_empty'
  | 'is_not_empty';

export interface FilterDefinition {
  id: string;
  field: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'boolean';
  operators: FilterOperator[];
  options?: { label: string; value: string; color?: string }[];
}

export interface ActiveFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  displayValue?: string;
}

// ── Sort types ──────────────────────────────────────────────────

export interface SortDefinition {
  field: string;
  label: string;
  direction: 'asc' | 'desc';
}

// ── Saved View (Twenty-inspired) ────────────────────────────────

export interface SavedView {
  id: string;
  name: string;
  filters: ActiveFilter[];
  sorts: SortDefinition[];
  columnVisibility?: Record<string, boolean>;
  columnOrder?: string[];
  isDefault?: boolean;
}

// ── Cell edit types (Twenty-inspired portal + draft pattern) ────

export interface CellPosition {
  row: number;
  column: number;
}

export interface CellEditState {
  position: CellPosition | null;
  field: string;
  recordId: string;
  draftValue: unknown;
  originalValue: unknown;
}

// ── DataTable props ─────────────────────────────────────────────

export interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  // Server-side
  totalCount?: number;
  pageCount?: number;
  page?: number;
  onPageChange?: (page: number) => void;
  pageSize?: number;
  onPageSizeChange?: (size: number) => void;
  // Sorting (server-side)
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  // Selection
  enableRowSelection?: boolean;
  onRowSelectionChange?: (selectedIds: string[]) => void;
  // Row click
  onRowClick?: (row: TData) => void;
  // Loading
  isLoading?: boolean;
  // Keyboard nav
  enableKeyboardNav?: boolean;
  // Empty state
  emptyMessage?: string;
}

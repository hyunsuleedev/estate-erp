import type { MouseEvent, ReactNode } from 'react';
import type {
  ColumnDef,
  RowData,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    cellClassName?: string;
    grow?: boolean;
    onCellDoubleClick?: (
      row: TData,
      event: MouseEvent<HTMLTableCellElement>,
    ) => void;
    /**
     * true면 이 컬럼이 남는 가로 공간을 흡수한다 (고정폭 대신 auto).
     * size는 좁은 화면에서 유지할 최소폭으로 사용한다.
     */
    fill?: boolean;
  }
}

// ── Filter types (Twenty-inspired) ──────────────────────────────

export type FilterOperator =
  | 'is'
  | 'is_not'
  | 'in'
  | 'between'
  | 'contains'
  | 'gte'
  | 'lte'
  | 'is_empty'
  | 'is_not_empty';

export interface FilterDefinition {
  id: string;
  field: string;
  label: string;
  type:
    | 'text'
    | 'number'
    | 'select'
    | 'multiSelect'
    | 'asyncMultiSelect'
    | 'numberRange'
    | 'dateRange'
    | 'date'
    | 'boolean';
  operators: FilterOperator[];
  options?: { label: string; value: string; color?: string }[];
  // For asyncMultiSelect: fetch options from server as user types.
  fetchOptions?: (
    query: string,
  ) => Promise<{ label: string; value: string; meta?: unknown }[]>;
  // For numberRange: optional unit label (e.g. "만원", "평"). Shown next to
  // each input as a visual hint.
  unit?: string;
  // For numberRange: used as the field suffix for API serialization when
  // range splits into two server params (e.g. 'price' -> priceMin/priceMax).
  // Defaults to `field` itself.
  rangeFieldBase?: string;
}

export interface ActiveFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  // Legacy single-value filter (select/boolean/text/number/date)
  value: string;
  displayValue?: string;
  // Multi-select values (operator === 'in')
  values?: string[];
  // For asyncMultiSelect: human-readable labels to avoid re-fetching to render chips.
  // Index-matched with `values`.
  displayValues?: string[];
  // Range filters (operator === 'between')
  valueMin?: string;
  valueMax?: string;
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
  renderSelectionAccessory?: (row: TData) => ReactNode;
  // Row click
  onRowClick?: (row: TData) => void;
  // Loading
  isLoading?: boolean;
  isLoadingMore?: boolean;
  onEndReached?: () => void;
  endReachedThreshold?: number;
  // Keyboard nav
  enableKeyboardNav?: boolean;
  // Empty state
  emptyMessage?: string;
  // Layout mode: 'paginated' renders fixed-height rows with pagination footer,
  // 'full-height' fills the parent and lets the tbody scroll (no pagination).
  layout?: 'paginated' | 'full-height';
  // Visual density/style. 'notion' renders a flat database grid with lighter
  // typography and visible cell dividers.
  variant?: 'default' | 'notion';
  // Row height in px. Defaults to 32. Set to 'auto' for content-driven height.
  rowHeight?: number | 'auto';
  // Column pinning (left only for now).
  pinnedColumns?: string[];
  // Spreadsheet-style guides rendered above the table header. Each toggle
  // stays beside its `anchorColumnId` while the listed columns expand/collapse.
  columnGroupControls?: readonly {
    collapsed: boolean;
    onToggle: () => void;
    anchorColumnId: string;
    columnIds: readonly string[];
    label: string;
  }[];
  // Bulk-action toolbar rendered above the table when rows are selected.
  // Receives the selected row objects (not just ids).
  renderBulkActions?: (selectedRows: TData[]) => React.ReactNode;
  // Status bar rendered below the table. Gets the currently focused row, if any,
  // and the total / visible counts so the parent can show summary info.
  renderStatusBar?: (args: {
    focusedRow: TData | null;
    totalCount: number;
  }) => React.ReactNode;
  // Inline row expansion (controlled). When a row id is in `expandedRowIds`,
  // `renderExpandedRow` is rendered as a full-width sub-row directly below it.
  expandedRowIds?: ReadonlySet<string>;
  renderExpandedRow?: (row: TData) => React.ReactNode;
}

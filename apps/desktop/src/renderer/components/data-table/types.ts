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
    /** Property table: each listing owns a separate selectable cell in this column. */
    listingCell?: boolean;
    onCellClick?: (
      row: TData,
      event: MouseEvent<HTMLTableCellElement>,
    ) => void;
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
  selectedRowIds?: readonly string[];
  onRowSelectionChange?: (selectedIds: string[]) => void;
  renderSelectionAccessory?: (row: TData) => ReactNode;
  // Row click
  onRowClick?: (row: TData) => void;
  /**
   * true면 단일 클릭은 셀 포커스만, 더블 클릭(및 Enter)으로 onRowClick 호출.
   * 매물관리 PropertyListingsTable 과 동일한 조작 리듬.
   */
  activateOnDoubleClick?: boolean;
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
  // 'refresh': 매물관리 표와 같은 머리(흰 바탕 · 12px 글자 · 11px 접기 띠 · 둥근 +/− 버튼).
  // 쓰는 화면만 켜고, 나머지 화면의 표 머리는 그대로 둔다.
  headerTone?: 'default' | 'refresh';
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
    /** 접혀 있을 때 버튼 옆에 묶음 이름을 보여준다. */
    showLabel?: boolean;
  }[];
  // Bulk-action toolbar rendered above the table when rows are selected.
  // Receives the selected row objects (not just ids).
  renderBulkActions?: (selectedRows: TData[]) => React.ReactNode;
  /**
   * 선택 막대 자리. 'bottom'이면 매물관리 표처럼 스크롤 영역 아래·상태 줄 위에 두어
   * 행을 체크해도 표가 밀려 내려가지 않는다. 기본 'top'(표 위, 지금 모양 그대로).
   */
  selectionToolbarPlacement?: 'top' | 'bottom';
  /** 'bottom' 선택 막대의 선택 수 문구에 붙는 이름. "광고" → "3개 광고 선택". */
  selectionItemLabel?: string;
  /**
   * true면 스크롤 영역을 크기 질의 컨테이너(container-type: inline-size)로 만든다.
   * 펼친 행 안에서 100cqw로 표의 보이는 폭을 쓸 수 있다. 기본 false.
   */
  scrollerContainerQuery?: boolean;
  // Keeps the selection toolbar mounted at zero selections so the table does
  // not jump vertically as selection changes.
  alwaysShowSelectionToolbar?: boolean;
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
  /**
   * 펼친 행이 있어도 가상 스크롤을 유지한다. 값은 펼친 내용의 첫 추정 높이(px)이고
   * 실제 높이는 그려진 뒤 잰다. 없으면 펼친 행이 하나라도 있을 때 모든 행을 그린다.
   */
  estimateExpandedRowHeight?: number;
  /**
   * true면 매물관리 메인 표와 같은 머리글·본문을 쓴다(머리 36px 13px/400,
   * 본문 14px/450, 데이터 칸 옅은 세로선, 줄 hover bg-muted/70, 선택 bg-primary/5).
   * 묶음 접기 띠는 headerTone="refresh"와 같은 11px 띠다. 기본 false.
   */
  propertyListTone?: boolean;
  /**
   * 열 너비(px, 열 id별). 넘기면 이 값으로 그리고, 드래그가 끝났을 때와 열 경계를
   * 더블클릭해 기본 너비로 되돌렸을 때 onColumnSizingChange로 새 값을 알린다.
   * 끄는 중 Esc를 누르면 끌기 전 너비로 돌아간다.
   * 없으면 지금처럼 표 안에서만 너비를 기억한다.
   */
  columnSizing?: Record<string, number>;
  onColumnSizingChange?: (sizing: Record<string, number>) => void;
  /** 값이 바뀌면 스크롤을 맨 위로 올리고 키보드로 고른 칸을 지운다(필터·검색이 바뀔 때). */
  scrollResetKey?: string | number;
  /** 행 선택 체크박스의 접근성 이름. 없으면 "N번째 행 선택". */
  getRowSelectionLabel?: (row: TData) => string;
}

import {
  Fragment,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type CellContext,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type ColumnResizeMode,
  type ColumnPinningState,
  type ColumnSizingState,
  type Table,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUp, ArrowDown, Minus, Plus } from 'lucide-react';
import type { DataTableProps } from './types';
import { DataTablePagination } from './data-table-pagination';

const DEFAULT_ROW_HEIGHT = 32;
// Only virtualize when rows are worth virtualizing. Below this threshold the
// overhead of padding rows + absolute positioning outweighs the savings.
const VIRTUALIZE_THRESHOLD = 50;

/** headerTone="refresh"의 접기 띠 높이(px). 매물관리 표와 같다. */
const REFRESH_GUIDE_HEIGHT = 11;
// 매물관리 모양: 매물관리 표처럼 접기 버튼(16px)의 위 절반만 표 위에 비운다
const PROPERTY_LIST_GUIDE_HEIGHT = 8;

/** 열 id별 실제 너비가 같은지 본다. 값이 없는 열은 열 정의의 기본 너비로 친다. */
function isSameColumnSizing(
  left: ColumnSizingState,
  right: ColumnSizingState,
  defaultWidth: (columnId: string) => number | undefined,
) {
  const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const id of ids) {
    const leftWidth = left[id] ?? defaultWidth(id);
    const rightWidth = right[id] ?? defaultWidth(id);
    if (leftWidth === undefined || rightWidth === undefined) {
      if (leftWidth !== rightWidth) return false;
      continue;
    }
    if (Math.round(leftWidth) !== Math.round(rightWidth)) return false;
  }
  return true;
}

const gutterCheckboxClass = 'relative size-4 cursor-pointer rounded-[3px] data-[state=unchecked]:!border-[rgba(27,21,0,0.26)] bg-transparent shadow-none data-[state=unchecked]:hover:!border-[rgba(27,21,0,0.36)] data-[state=unchecked]:hover:bg-[rgba(66,35,3,0.06)] after:absolute after:-inset-[10px] data-[state=checked]:border-[#2383e2] data-[state=checked]:bg-[#2383e2] data-[state=checked]:text-white data-[state=indeterminate]:border-[#2383e2] data-[state=indeterminate]:bg-[#2383e2] data-[state=indeterminate]:text-white';

// 드래그 중 표가 갱신되어도 Chromium이 잡고 있는 손잡이 DOM을 유지한다.
function SelectionCell<TData extends { id: string }>({ row, table }: CellContext<TData, unknown>) {
  const { hoverSelectionGutter, renderSelectionAccessory, getRowSelectionLabel } =
    table.options.meta as Pick<DataTableProps<TData>, 'hoverSelectionGutter' | 'renderSelectionAccessory' | 'getRowSelectionLabel'>;
  return (
    <div className={cn("flex items-center", hoverSelectionGutter ? "justify-between pr-[10px]" : "flex-col justify-center gap-1 py-1")}>
      {hoverSelectionGutter && renderSelectionAccessory?.(row.original)}
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        onClick={(e) => e.stopPropagation()}
        aria-label={
          getRowSelectionLabel
            ? getRowSelectionLabel(row.original)
            : `${row.index + 1}번째 행 선택`
        }
        className={cn("size-3.5", hoverSelectionGutter && gutterCheckboxClass, hoverSelectionGutter && "opacity-0 group-hover:opacity-100 hover:opacity-100 focus-visible:opacity-100 data-[state=checked]:opacity-100 [@media(hover:none)]:opacity-100")}
      />
      {!hoverSelectionGutter && renderSelectionAccessory?.(row.original)}
    </div>
  );
}

export function DataTable<TData extends { id: string }>({
  columns,
  data,
  totalCount = 0,
  pageCount = 1,
  page = 1,
  onPageChange,
  pageSize = 20,
  onPageSizeChange,
  sorting,
  onSortingChange,
  enableRowSelection = false,
  hoverSelectionGutter = false,
  dropIndicator,
  selectedRowIds,
  onRowSelectionChange,
  renderSelectionAccessory,
  onRowClick,
  activateOnDoubleClick = false,
  isLoading = false,
  isLoadingMore = false,
  onEndReached,
  endReachedThreshold = 320,
  enableKeyboardNav = true,
  emptyMessage = '데이터가 없습니다.',
  layout = 'paginated',
  variant = 'default',
  headerTone = 'default',
  rowHeight = DEFAULT_ROW_HEIGHT,
  pinnedColumns,
  columnGroupControls = [],
  renderBulkActions,
  selectionToolbarPlacement = 'top',
  selectionItemLabel,
  scrollerContainerQuery = false,
  alwaysShowSelectionToolbar = false,
  renderStatusBar,
  expandedRowIds,
  getRowTone,
  renderExpandedRow,
  estimateExpandedRowHeight,
  propertyListTone = false,
  columnSizing,
  onColumnSizingChange,
  scrollResetKey,
  getRowSelectionLabel,
}: DataTableProps<TData>) {
  const [internalRowSelection, setInternalRowSelection] =
    useState<RowSelectionState>({});
  const [focusedCell, setFocusedCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  // 제어형 열 너비에서 끌기를 Esc로 취소할 때 쓴다(끌기 전 너비, 취소 뒤 마우스를 놓을 때까지).
  const tableInstanceRef = useRef<Table<TData> | null>(null);
  const sizingBeforeResizeRef = useRef<ColumnSizingState | null>(null);
  const resizeCancelledRef = useRef(false);

  const resolvedPinning = useMemo<ColumnPinningState>(() => {
    const left: string[] = [];
    if (enableRowSelection) left.push('_select');
    if (pinnedColumns) left.push(...pinnedColumns);
    return { left, right: [] };
  }, [enableRowSelection, pinnedColumns]);

  const rowCellHeight = rowHeight === 'auto' ? undefined : rowHeight;
  const rowSelection = useMemo<RowSelectionState>(
    () =>
      selectedRowIds === undefined
        ? internalRowSelection
        : Object.fromEntries(selectedRowIds.map((id) => [id, true])),
    [internalRowSelection, selectedRowIds],
  );

  // ── Build column defs with optional selection column ──────────
  const allColumns: ColumnDef<TData, unknown>[] = [];

  if (enableRowSelection) {
    allColumns.push({
      id: '_select',
      size: hoverSelectionGutter ? 66 : 36,
      minSize: hoverSelectionGutter ? 66 : 36,
      maxSize: hoverSelectionGutter ? 66 : 36,
      enableResizing: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="현재 목록 전체 행 선택"
          className={cn("size-3.5", hoverSelectionGutter && gutterCheckboxClass, hoverSelectionGutter && "ml-auto mr-[10px] opacity-0 hover:opacity-100 focus-visible:opacity-100 data-[state=checked]:opacity-100 data-[state=indeterminate]:opacity-100 [@media(hover:none)]:opacity-100")}
        />
      ),
      cell: SelectionCell,
    });
  }

  allColumns.push(...columns);

  // ── TanStack Table instance ───────────────────────────────────
  const table = useReactTable({
    meta: { hoverSelectionGutter, renderSelectionAccessory, getRowSelectionLabel },
    data,
    columns: allColumns,
    pageCount,
    state: {
      sorting: sorting ?? [],
      rowSelection,
      columnPinning: resolvedPinning,
    },
    onSortingChange: (updater) => {
      const next =
        typeof updater === 'function' ? updater(sorting ?? []) : updater;
      onSortingChange?.(next);
    },
    onRowSelectionChange: (updater) => {
      const next =
        typeof updater === 'function' ? updater(rowSelection) : updater;
      if (selectedRowIds === undefined) setInternalRowSelection(next);
      // getRowId 가 행 키를 row.id 로 만든다 — 키를 배열 인덱스로 다루면 안 된다.
      const selectedIds = Object.keys(next).filter((k) => next[k]);
      onRowSelectionChange?.(selectedIds);
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
    enableRowSelection,
    enableColumnPinning: true,
    columnResizeMode,
    getRowId: (row) => row.id,
    // 제어형 열 너비: 처음 그릴 때부터 저장된 너비를 쓴다. 드래그 중에는 표가 너비를
    // 들고 있고(TanStack 기본 처리), 드래그가 끝나면 onColumnSizingChange로 알린다.
    ...(columnSizing !== undefined
      ? { initialState: { columnSizing } }
      : {}),
    // 제어형 열 너비만: 끄는 중 Esc로 취소하면 마우스를 놓을 때까지 표가 보내는 너비 변경을
    // 버린다(TanStack은 놓을 때 마지막 끌기 너비를 한 번 더 적용한다).
    ...(columnSizing !== undefined
      ? {
          onColumnSizingChange: (
            updater:
              | ColumnSizingState
              | ((old: ColumnSizingState) => ColumnSizingState),
          ) => {
            if (resizeCancelledRef.current) return;
            tableInstanceRef.current?.setState((old) => ({
              ...old,
              columnSizing:
                typeof updater === 'function'
                  ? updater(old.columnSizing)
                  : updater,
            }));
          },
        }
      : {}),
  });
  useEffect(() => {
    tableInstanceRef.current = table;
  }, [table]);
  const tableTotalSize = table.getTotalSize();
  const leafColumns = table.getAllLeafColumns();
  const isColumnSizingControlled = columnSizing !== undefined;
  const isResizingColumn = table.getState().columnSizingInfo.isResizingColumn;
  const getDefaultColumnWidth = useCallback(
    (columnId: string) =>
      table.getAllLeafColumns().find((column) => column.id === columnId)
        ?.columnDef.size,
    [table],
  );
  // 부모가 준 너비가 바뀌면(기본 너비 복원, 다른 창에서 바꾼 저장값) 표에 반영한다.
  useEffect(() => {
    if (columnSizing === undefined) return;
    if (table.getState().columnSizingInfo.isResizingColumn) return;
    if (
      isSameColumnSizing(
        table.getState().columnSizing,
        columnSizing,
        getDefaultColumnWidth,
      )
    ) {
      return;
    }
    table.setColumnSizing(columnSizing);
  }, [columnSizing, getDefaultColumnWidth, table]);
  // 드래그가 끝난 순간에만 알린다. 움직이지 않은 클릭은 알리지 않는다.
  const wasResizingColumnRef = useRef(false);
  useEffect(() => {
    if (columnSizing === undefined) return;
    if (isResizingColumn) {
      wasResizingColumnRef.current = true;
      return;
    }
    if (!wasResizingColumnRef.current) return;
    wasResizingColumnRef.current = false;
    const next = table.getState().columnSizing;
    if (!isSameColumnSizing(next, columnSizing, getDefaultColumnWidth)) {
      onColumnSizingChange?.(next);
    }
  }, [
    columnSizing,
    getDefaultColumnWidth,
    isResizingColumn,
    onColumnSizingChange,
    table,
  ]);
  // 제어형 열 너비: 열 경계를 끄는 중 Esc를 누르면 끌기 전 너비로 돌아간다(펼침 패널 표와 같다).
  useEffect(() => {
    if (!isColumnSizingControlled || !isResizingColumn) return;
    const cancelResize = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const before = sizingBeforeResizeRef.current;
      if (!before) return;
      // 표의 Esc(선택 해제)나 화면의 Esc 처리로 번지지 않게 한다.
      event.preventDefault();
      event.stopPropagation();
      resizeCancelledRef.current = true;
      table.setState((old) => ({
        ...old,
        columnSizing: before,
        columnSizingInfo: {
          ...old.columnSizingInfo,
          isResizingColumn: false,
          startOffset: null,
          startSize: null,
          deltaOffset: null,
          deltaPercentage: null,
          columnSizingStart: [],
        },
      }));
      // 마우스를 놓을 때 TanStack이 마지막 끌기 너비를 다시 적용하므로 그때까지 막는다.
      const release = () => {
        window.removeEventListener('mouseup', release, true);
        window.removeEventListener('touchend', release, true);
        window.setTimeout(() => {
          resizeCancelledRef.current = false;
        }, 0);
      };
      window.addEventListener('mouseup', release, true);
      window.addEventListener('touchend', release, true);
    };
    window.addEventListener('keydown', cancelResize, true);
    return () => window.removeEventListener('keydown', cancelResize, true);
  }, [isColumnSizingControlled, isResizingColumn, table]);
  const resetColumnWidth = (columnId: string) => {
    const rest = { ...table.getState().columnSizing };
    delete rest[columnId];
    table.setColumnSizing(rest);
    onColumnSizingChange?.(rest);
  };
  // 열 경계를 끌고 놓은 마우스가 머리글 위에서 끝나도 정렬이 바뀌지 않게 한다.
  const suppressSortClickRef = useRef(false);
  const suppressNextSortClick = () => {
    suppressSortClickRef.current = true;
    window.addEventListener(
      'mouseup',
      () =>
        window.setTimeout(() => {
          suppressSortClickRef.current = false;
        }, 0),
      { once: true, capture: true },
    );
  };
  const hasFillColumn = leafColumns.some(
    (column) => column.columnDef.meta?.fill,
  );
  const columnGroupLayouts = columnGroupControls
    .map((control) => {
      const anchorIndex = leafColumns.findIndex(
        (column) => column.id === control.anchorColumnId,
      );
      const anchorEnd =
        anchorIndex >= 0
          ? leafColumns
              .slice(0, anchorIndex + 1)
              .reduce((total, column) => total + column.getSize(), 0)
          : 0;
      const expandedWidth = leafColumns
        .filter((column) => control.columnIds.includes(column.id))
        .reduce((total, column) => total + column.getSize(), 0);

      return {
        control,
        anchorIndex,
        anchorEnd,
        expandedWidth,
        toggleOffset: Math.max(0, anchorEnd - 10),
      };
    })
    .filter((layout) => layout.anchorIndex >= 0);
  const hasColumnGroupGuide = columnGroupLayouts.length > 0;

  // ── Keyboard navigation (Twenty-inspired cell nav) ────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!enableKeyboardNav) return;
      const rows = table.getRowModel().rows;
      if (rows.length === 0) return;
      const colCount = allColumns.length;
      const startCol = enableRowSelection ? 1 : 0; // skip checkbox col

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          setFocusedCell((prev) => ({
            row: prev === null ? 0 : Math.min(rows.length - 1, prev.row + 1),
            col: prev?.col ?? startCol,
          }));
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          setFocusedCell((prev) => ({
            row: prev === null ? 0 : Math.max(0, prev.row - 1),
            col: prev?.col ?? startCol,
          }));
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          setFocusedCell((prev) => ({
            row: prev?.row ?? 0,
            col:
              prev === null ? startCol : Math.min(colCount - 1, prev.col + 1),
          }));
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          setFocusedCell((prev) => ({
            row: prev?.row ?? 0,
            col: prev === null ? startCol : Math.max(startCol, prev.col - 1),
          }));
          break;
        }
        case 'Enter': {
          if (focusedCell !== null && onRowClick) {
            e.preventDefault();
            const row = rows[focusedCell.row];
            if (row) onRowClick(row.original);
          }
          break;
        }
        case 'x':
        case 'X': {
          if (focusedCell !== null && enableRowSelection) {
            e.preventDefault();
            const row = rows[focusedCell.row];
            if (row) row.toggleSelected();
          }
          break;
        }
        case 'Escape': {
          e.preventDefault();
          setFocusedCell(null);
          table.resetRowSelection();
          break;
        }
      }
    },
    [
      enableKeyboardNav,
      focusedCell,
      onRowClick,
      enableRowSelection,
      table,
      allColumns.length,
    ],
  );

  const isFullHeight = layout === 'full-height';
  const isNotion = variant === 'notion';
  const isRefreshHeader = headerTone === 'refresh';
  const isPropertyListTone = propertyListTone;
  // 접기 띠·정렬 화살표·aria-sort는 refresh 머리와 같은 모양을 쓴다.
  const usesRefreshGuide = isRefreshHeader || isPropertyListTone;
  const refreshGuideHeight = isPropertyListTone
    ? PROPERTY_LIST_GUIDE_HEIGHT
    : REFRESH_GUIDE_HEIGHT;

  // Virtualize only for full-height mode with a meaningful row count.
  // Paginated views are small (pageSize ~20) and auto-height rows can't be
  // measured up front, so we skip virtualization there.
  const rows = table.getRowModel().rows;
  const virtualizesExpandedRows =
    typeof estimateExpandedRowHeight === 'number' && !!renderExpandedRow;
  const canVirtualize =
    isFullHeight &&
    rows.length >= VIRTUALIZE_THRESHOLD &&
    typeof rowCellHeight === 'number' &&
    (virtualizesExpandedRows ||
      !expandedRowIds ||
      expandedRowIds.size === 0);
  // 펼친 행도 가상 스크롤할 때는 본 행과 펼친 행을 한 줄씩 세운 목록을 쓴다.
  const virtualItems = useMemo(() => {
    if (!virtualizesExpandedRows) return null;
    const items: { rowIndex: number; expanded: boolean }[] = [];
    rows.forEach((row, rowIndex) => {
      items.push({ rowIndex, expanded: false });
      if (expandedRowIds?.has(row.original.id)) {
        items.push({ rowIndex, expanded: true });
      }
    });
    return items;
  }, [expandedRowIds, rows, virtualizesExpandedRows]);

  const rowVirtualizer = useVirtualizer({
    count: canVirtualize ? (virtualItems?.length ?? rows.length) : 0,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (index) =>
      virtualItems?.[index]?.expanded
        ? (estimateExpandedRowHeight ?? DEFAULT_ROW_HEIGHT)
        : (rowCellHeight ?? DEFAULT_ROW_HEIGHT),
    getItemKey: virtualItems
      ? (index) => {
          const item = virtualItems[index];
          const row = item ? rows[item.rowIndex] : undefined;
          return row ? `${row.id}${item?.expanded ? ':expanded' : ''}` : index;
        }
      : undefined,
    overscan: 10,
  });

  const virtualRows = canVirtualize ? rowVirtualizer.getVirtualItems() : [];
  const totalVirtualSize = canVirtualize ? rowVirtualizer.getTotalSize() : 0;
  const paddingTop =
    canVirtualize && virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    canVirtualize && virtualRows.length > 0
      ? totalVirtualSize - virtualRows[virtualRows.length - 1].end
      : 0;

  // ── Scroll focused row into view ──────────────────────────────
  useEffect(() => {
    if (focusedCell === null) return;
    if (canVirtualize) {
      const virtualIndex = virtualItems
        ? virtualItems.findIndex(
            (item) => item.rowIndex === focusedCell.row && !item.expanded,
          )
        : focusedCell.row;
      if (virtualIndex >= 0) {
        rowVirtualizer.scrollToIndex(virtualIndex, { align: 'auto' });
      }
      return;
    }
    if (!tableRef.current) return;
    const trs = tableRef.current.querySelectorAll(
      'tbody tr:not([data-table-expanded-row]):not([aria-hidden])',
    );
    trs[focusedCell.row]?.scrollIntoView({ block: 'nearest' });
  }, [focusedCell, canVirtualize, rowVirtualizer]);

  // 표를 다시 만들지 않고도 범위가 바뀌면 맨 위에서 다시 보게 한다(열 너비·선택은 유지).
  const lastScrollResetKeyRef = useRef(scrollResetKey);
  useEffect(() => {
    if (Object.is(lastScrollResetKeyRef.current, scrollResetKey)) return;
    lastScrollResetKeyRef.current = scrollResetKey;
    scrollerRef.current?.scrollTo({ top: 0 });
    setFocusedCell(null);
  }, [scrollResetKey]);

  const getPinStyle = (
    column: ReturnType<typeof table.getAllLeafColumns>[number],
  ) => {
    if (column.getIsPinned() !== 'left') return {};
    return {
      position: 'sticky' as const,
      left: column.getStart('left'),
      zIndex: 1,
    };
  };

  const selectedRows = useMemo(
    () =>
      Object.keys(rowSelection)
        .filter((k) => rowSelection[k])
        .map((id) => data.find((d) => d.id === id))
        .filter((v): v is TData => !!v),
    [rowSelection, data],
  );
  const focusedRow =
    focusedCell !== null && rows[focusedCell.row]?.original
      ? rows[focusedCell.row].original
      : null;

  // 매물관리 모양: 열 묶음 띠(접기 버튼·선)는 표와 함께 가로로 움직이므로, 고정 열 위로
  // 지나갈 때는 고정 열 경계에서 잘라 고정 열 머리를 덮지 않게 한다. 가로 스크롤 값은
  // 다시 그리지 않고 CSS 변수로만 넘긴다.
  const clipsGuideUnderPinnedColumns =
    isPropertyListTone && hasColumnGroupGuide;
  const pinnedLeftWidth = clipsGuideUnderPinnedColumns
    ? table.getLeftTotalSize()
    : 0;

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (clipsGuideUnderPinnedColumns) {
        event.currentTarget.style.setProperty(
          '--data-table-scroll-left',
          `${event.currentTarget.scrollLeft}px`,
        );
      }
      if (!onEndReached || isLoading || isLoadingMore) return;

      const target = event.currentTarget;
      const distanceToBottom =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      if (distanceToBottom <= endReachedThreshold) {
        onEndReached();
      }
    },
    [
      clipsGuideUnderPinnedColumns,
      endReachedThreshold,
      isLoading,
      isLoadingMore,
      onEndReached,
    ],
  );
  const clearSelection = () => {
    if (selectedRowIds === undefined) setInternalRowSelection({});
    onRowSelectionChange?.([]);
  };
  const showsSelectionToolbar =
    !!renderBulkActions &&
    (alwaysShowSelectionToolbar || selectedRows.length > 0);

  return (
    <div className={cn('flex flex-col', isFullHeight && 'h-full min-h-0')}>
      {/* Bulk actions toolbar — optionally reserved to prevent layout shift. */}
      {renderBulkActions &&
        selectionToolbarPlacement === 'top' &&
        (alwaysShowSelectionToolbar || selectedRows.length > 0) && (
          <div
            data-data-table-selection-toolbar
            className="flex h-9 shrink-0 items-center gap-2 border-b border-border/60 bg-accent/40 px-3 text-xs"
          >
            <span className="shrink-0 font-medium">
              {selectedRows.length}개 선택됨
            </span>
            <div className="mx-1 h-3 w-px bg-border/60" />
            {renderBulkActions(selectedRows)}
            <button
              type="button"
              className="ml-auto shrink-0 text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-40"
              disabled={selectedRows.length === 0}
              onClick={clearSelection}
            >
              선택 해제
            </button>
          </div>
        )}

      {/* Table */}
      <div
        ref={scrollerRef}
        className={cn(
          'relative w-full overflow-auto outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0',
          isFullHeight && 'flex-1 min-h-0',
          isNotion && 'bg-white',
          scrollerContainerQuery && '[container-type:inline-size]',
        )}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
      >
        {hasColumnGroupGuide && (
          <div
            data-data-table-column-guide
            className={cn(
              'sticky top-0 z-40',
              usesRefreshGuide
                ? 'bg-white'
                : 'h-9 border-b border-[#e7e5df] bg-[#f8f7f4]',
            )}
            style={{
              width: '100%',
              minWidth: tableTotalSize,
              ...(usesRefreshGuide ? { height: refreshGuideHeight } : {}),
            }}
          >
            <div
              className={cn('relative h-full', !usesRefreshGuide && 'pt-2')}
              style={{
                width: tableTotalSize,
                minWidth: tableTotalSize,
                // 접기 버튼은 띠 아래 머리글로 8px 걸친다. 위·아래·오른쪽은 넉넉히 두고
                // 왼쪽만 (고정 열 폭 + 가로 스크롤)에서 자른다.
                ...(clipsGuideUnderPinnedColumns
                  ? {
                      clipPath: `inset(-16px -16px -16px calc(${pinnedLeftWidth}px + var(--data-table-scroll-left, 0px)))`,
                    }
                  : {}),
              }}
            >
              {columnGroupLayouts.map(
                ({ control, anchorEnd, expandedWidth, toggleOffset }) => (
                  <div
                    key={`${control.anchorColumnId}-${control.label}`}
                    className="pointer-events-none absolute inset-0"
                  >
                    {!control.collapsed && expandedWidth > 0 && usesRefreshGuide && (
                      // 매물관리 표처럼 띠 아래쪽에 굵은 선 하나만 긋고 끝 표시는 두지 않는다
                      <span
                        aria-hidden="true"
                        data-data-table-column-group-line={control.label}
                        className={cn(
                          'absolute z-40 h-[2px] bg-[#a3a09a]',
                          isPropertyListTone ? 'top-[6px]' : 'top-[9px]',
                        )}
                        style={{
                          left: anchorEnd + 10,
                          width: Math.max(0, expandedWidth - 10),
                        }}
                      />
                    )}
                    {!control.collapsed && expandedWidth > 0 && !usesRefreshGuide && (
                      <>
                        <span
                          aria-hidden="true"
                          data-data-table-column-group-line={control.label}
                          className="absolute top-[18px] z-40 h-px bg-slate-400"
                          style={{
                            left: anchorEnd + 10,
                            width: Math.max(0, expandedWidth - 10),
                          }}
                        />
                        <span
                          aria-hidden="true"
                          data-data-table-column-group-cap={control.label}
                          className="absolute top-[18px] z-40 h-2 w-px bg-slate-400"
                          style={{ left: anchorEnd + expandedWidth }}
                        />
                      </>
                    )}
                    <button
                      type="button"
                      aria-label={
                        control.collapsed
                          ? `${control.label} 컬럼 펼치기`
                          : `${control.label} 컬럼 접기`
                      }
                      aria-expanded={!control.collapsed}
                      title={
                        control.collapsed
                          ? `${control.label} 컬럼 펼치기`
                          : `${control.label} 컬럼 접기`
                      }
                      data-data-table-column-group-toggle={control.label}
                      className={cn(
                        'pointer-events-auto absolute z-50 inline-flex items-center justify-center bg-white p-0 outline-none',
                        usesRefreshGuide
                          ? cn(isPropertyListTone ? 'size-4' : 'mt-[2px] size-[17px]', 'rounded-[4px] border border-[#a3a09a] text-[#6f6c66] shadow-[0_1px_2px_rgba(16,24,40,0.08)] transition-[border-color,color,box-shadow] hover:border-[#2383e2] hover:text-[#1d6dbf] hover:shadow-[0_0_0_3px_rgba(35,131,226,0.16)] focus-visible:ring-2 focus-visible:ring-[#2383e2]/35')
                          : 'mt-2 size-5 rounded-[3px] border border-border text-muted-foreground shadow-xs transition-colors hover:border-muted-foreground/40 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35 active:translate-y-px',
                      )}
                      style={{ left: toggleOffset }}
                      onClick={control.onToggle}
                    >
                      {control.collapsed ? (
                        usesRefreshGuide ? (
                          <Plus className="size-[11px]" strokeWidth={2.4} />
                        ) : (
                          <Plus className="size-3" />
                        )
                      ) : usesRefreshGuide ? (
                        <Minus className="size-[11px]" strokeWidth={2.4} />
                      ) : (
                        <Minus className="size-3" />
                      )}
                    </button>
                    {control.showLabel && control.collapsed && (
                      <button
                        type="button"
                        tabIndex={-1}
                        aria-hidden="true"
                        data-data-table-column-group-label={control.label}
                        className={cn(
                          'pointer-events-auto absolute z-50 flex items-center whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                          usesRefreshGuide
                            ? cn('mt-0 text-[11px]', isPropertyListTone ? 'h-2' : 'h-[11px]')
                            : 'mt-2 h-5 text-[12px]',
                        )}
                        style={{ left: toggleOffset + (usesRefreshGuide ? 22 : 26) }}
                        onClick={control.onToggle}
                      >
                        {control.label} 열 보기
                      </button>
                    )}
                  </div>
                ),
              )}
            </div>
          </div>
        )}
        <table
          ref={tableRef}
          className={cn(
            'w-full table-fixed caption-bottom text-sm',
            isNotion && 'border-separate border-spacing-0',
          )}
          style={{
            width: hasFillColumn
              ? `max(100%, ${tableTotalSize}px)`
              : tableTotalSize,
            minWidth: tableTotalSize,
          }}
        >
          {/* Header */}
          <thead
            className={cn(
              'sticky z-20 bg-background',
              usesRefreshGuide
                ? 'bg-white'
                : cn(
                    hasColumnGroupGuide ? 'top-9' : 'top-0',
                    isNotion && 'bg-[#f7f7f5]',
                  ),
            )}
            style={
              usesRefreshGuide
                ? { top: hasColumnGroupGuide ? refreshGuideHeight : 0 }
                : undefined
            }
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, colIndex) => {
                  // Under manualSorting, TanStack's getCanSort() requires an accessor
                  // and returns false for id-only columns. We treat any column whose
                  // def doesn't opt out (enableSorting !== false) as sortable when a
                  // sort callback is wired up by the parent.
                  const canSort =
                    header.column.columnDef.enableSorting !== false &&
                    !!onSortingChange &&
                    header.id !== '_select';
                  const activeSort = (sorting ?? [])[0];
                  const sorted: false | 'asc' | 'desc' =
                    activeSort?.id === header.column.id
                      ? activeSort.desc
                        ? 'desc'
                        : 'asc'
                      : false;
                  const isLast = colIndex === headerGroup.headers.length - 1;
                  const isPinned = header.column.getIsPinned() === 'left';
                  const isLastPinned =
                    isPinned && header.column.getIsLastColumn('left');
                  const isColumnGroupDetail = Boolean(
                    columnGroupControls.some((control) =>
                      control.columnIds.includes(header.column.id),
                    ),
                  );
                  const handleSortToggle = () => {
                    if (!canSort) return;
                    if (suppressSortClickRef.current) return;
                    const current = sorting ?? [];
                    const active = current[0];
                    let next: SortingState;
                    if (!active || active.id !== header.column.id) {
                      next = [{ id: header.column.id, desc: false }];
                    } else if (!active.desc) {
                      next = [{ id: header.column.id, desc: true }];
                    } else {
                      next = [];
                    }
                    onSortingChange?.(next);
                  };
                  return (
                    <th
                      key={header.id}
                      aria-sort={
                        usesRefreshGuide
                          ? sorted === 'asc'
                            ? 'ascending'
                            : sorted === 'desc'
                              ? 'descending'
                              : canSort
                                ? 'none'
                                : undefined
                          : undefined
                      }
                      // 매물관리 모양에서는 정렬 가능한 머리글을 Tab으로 고르고 Enter·Space로 정렬한다.
                      tabIndex={isPropertyListTone && canSort ? 0 : undefined}
                      onKeyDown={
                        isPropertyListTone && canSort
                          ? (event) => {
                              if (event.key !== 'Enter' && event.key !== ' ') return;
                              event.preventDefault();
                              event.stopPropagation();
                              handleSortToggle();
                            }
                          : undefined
                      }
                      className={cn(
                        'relative text-left align-middle font-medium text-muted-foreground',
                        isPropertyListTone
                          ? cn(
                              // 매물관리 메인 표(property-listings-table) 머리와 같은 규격
                              'h-9 border-b border-border bg-white px-2.5 text-[13px] font-normal leading-[21px] normal-case tracking-normal text-muted-foreground transition-colors',
                              (hasColumnGroupGuide || hoverSelectionGutter) && 'border-t border-t-border',
                              !isLast && 'border-r border-r-[#eeeeec]',
                              hoverSelectionGutter && header.id === '_select' && 'border-0 px-0',
                              canSort &&
                                'cursor-pointer select-none outline-none hover:bg-[#f6f5f3] hover:text-[#2c2c2b] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2383e2]/50',
                              sorted && 'text-[#2c2c2b]',
                              // 고정 열의 끝도 다른 칸과 같은 옅은 세로선을 쓴다(따로 진한 경계선을 두지 않는다)
                            )
                          : isRefreshHeader
                          ? cn(
                              // 매물관리 표 머리와 같은 모양
                              'h-[34px] border-b border-[#e6e4e0] bg-white px-2.5 text-[12px] normal-case tracking-normal text-[#6f6c66] transition-colors',
                              hasColumnGroupGuide && 'border-t border-t-[#e6e4e0]',
                              !isLast && 'border-r border-r-[#f0efec]',
                              canSort &&
                                'cursor-pointer select-none hover:bg-[#f6f5f3] hover:text-[#2c2c2b]',
                              sorted && 'text-[#2c2c2b]',
                              isColumnGroupDetail && 'bg-[#f6f5f3]',
                            )
                          : cn(
                              isNotion
                                ? 'h-9 border-b border-[#d8d6d0] bg-[#f7f7f5] px-2.5 text-[13px] normal-case tracking-normal'
                                : 'h-8 border-b border-border/60 px-3 text-[11px] uppercase tracking-wider',
                              !isLast &&
                                (isNotion
                                  ? 'border-r border-r-[#eeeeec]'
                                  : 'border-r border-r-border/40'),
                              canSort &&
                                'cursor-pointer select-none hover:text-foreground',
                              isColumnGroupDetail &&
                                isNotion &&
                                'bg-[#f2f6f4] text-[#52645e]',
                              isPinned &&
                                (isNotion ? 'bg-[#f5f4f1]' : 'bg-background'),
                            ),
                        isLastPinned &&
                          !isPropertyListTone &&
                          'shadow-[1px_0_0_0_#d9d9d6]',
                      )}
                      style={{
                        width: header.column.columnDef.meta?.fill
                          ? undefined
                          : header.getSize(),
                        ...(isPinned
                          ? {
                              position: 'sticky',
                              left: header.column.getStart('left'),
                              zIndex: 30,
                            }
                          : {}),
                      }}
                      onClick={canSort ? handleSortToggle : undefined}
                    >
                      <div
                        className={cn(
                          'flex items-center gap-1',
                          isNotion && 'min-w-0',
                          isNotion &&
                            !isRefreshHeader &&
                            !isPropertyListTone &&
                            'text-slate-500',
                          isPropertyListTone && 'min-w-0',
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                        {sorted === 'asc' && (
                          <ArrowUp
                            aria-hidden={usesRefreshGuide || undefined}
                            className={cn('size-3', usesRefreshGuide && 'shrink-0 text-[#2383e2]')}
                          />
                        )}
                        {sorted === 'desc' && (
                          <ArrowDown
                            aria-hidden={usesRefreshGuide || undefined}
                            className={cn('size-3', usesRefreshGuide && 'shrink-0 text-[#2383e2]')}
                          />
                        )}
                      </div>
                      {/* Column resize handle */}
                      {header.column.getCanResize() &&
                        !header.column.columnDef.meta?.fill && (
                          <div
                            onMouseDown={
                              isColumnSizingControlled
                                ? (event) => {
                                    suppressNextSortClick();
                                    sizingBeforeResizeRef.current = {
                                      ...table.getState().columnSizing,
                                    };
                                    header.getResizeHandler()(event);
                                  }
                                : header.getResizeHandler()
                            }
                            onTouchStart={header.getResizeHandler()}
                            onClick={
                              isColumnSizingControlled
                                ? (event) => event.stopPropagation()
                                : undefined
                            }
                            onDoubleClick={
                              isColumnSizingControlled
                                ? (event) => {
                                    event.stopPropagation();
                                    resetColumnWidth(header.column.id);
                                  }
                                : undefined
                            }
                            title={
                              isColumnSizingControlled
                                ? '드래그로 너비 조절 · 더블클릭으로 기본 너비'
                                : undefined
                            }
                            className={cn(
                              'absolute top-0 right-0 h-full w-1 cursor-col-resize select-none touch-none',
                              header.column.getIsResizing()
                                ? 'bg-primary'
                                : 'bg-transparent hover:bg-border',
                            )}
                          />
                        )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          {/* Body */}
          <tbody>
            {(() => {
              if (isLoading) {
                return Array.from({ length: 8 }).map((_, i) => (
                  <tr key={`skel-${i}`}>
                    {allColumns.map((_, j) => (
                      <td
                        key={j}
                        className={cn(
                          isNotion
                            ? 'border-b border-[#eeeeec] px-2.5'
                            : 'border-b border-border/30 px-3',
                          j < allColumns.length - 1 &&
                            (isNotion
                              ? 'border-r border-r-[#eeeeec]'
                              : 'border-r border-r-border/30'),
                          isPropertyListTone && 'border-b-border',
                          hoverSelectionGutter && j === 0 && 'border-0',
                        )}
                        style={{ height: rowCellHeight }}
                      >
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ));
              }
              if (rows.length === 0) {
                return (
                  <tr>
                    <td
                      colSpan={allColumns.length}
                      className="p-0 text-sm text-muted-foreground"
                    >
                      <VisibleWidthEmptyMessage scrollerRef={scrollerRef}>
                        {emptyMessage}
                      </VisibleWidthEmptyMessage>
                    </td>
                  </tr>
                );
              }
              const renderMainRow = (
                row: (typeof rows)[number],
                rowIndex: number,
              ) => {
                const rowTone = getRowTone?.(row.original);
                return (
                  <tr
                    key={row.id}
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    data-row-tone={rowTone}
                    className={cn("group", dropIndicator?.row === rowIndex && (dropIndicator.after
                      ? "[&>td]:shadow-[inset_0_-2px_var(--color-blue-400)]"
                      : "[&>td]:shadow-[inset_0_2px_var(--color-blue-400)]"))}
                  >
                    {row.getVisibleCells().map((cell, colIndex) => {
                      const isLastCol =
                        colIndex === row.getVisibleCells().length - 1;
                      const isFocused =
                        focusedCell?.row === rowIndex &&
                        focusedCell?.col === colIndex;
                      const isRowFocused = focusedCell?.row === rowIndex;
                      const isPinned = cell.column.getIsPinned() === 'left';
                      const isLastPinned =
                        isPinned && cell.column.getIsLastColumn('left');
                      const isGroupDetailCell = columnGroupControls.some(
                        (control) => control.columnIds.includes(cell.column.id),
                      );
                      if (isPropertyListTone) {
                        // 매물관리 메인 표(property-listings-table)와 같은 본문 칸
                        return (
                          <td
                            key={cell.id}
                            data-table-col={colIndex}
                            data-table-row={rowIndex}
                            className={cn(
                              'relative select-none border-b border-border px-2.5 align-middle text-[14px] font-[450] leading-[21px] text-foreground',
                              !isLastCol && 'border-r border-r-[#eeeeec]',
                              hoverSelectionGutter && cell.column.id === '_select' && 'border-0 px-0',
                              // 알릴 것이 있는 줄은 옅은 노랑. 고정 열이 겹쳐도 비치지 않게 불투명한 색을 쓴다.
                              rowTone === 'warning'
                                ? 'bg-[#fff8e1] group-hover:bg-[#fdf0cc]'
                                : 'group-hover:bg-muted/70',
                              'group-data-[state=selected]:bg-primary/5',
                              isFocused &&
                                'bg-blue-50/40 outline outline-2 -outline-offset-2 outline-[#2383e2]',
                              isRowFocused && !isFocused && 'bg-muted',
                              onRowClick &&
                                (activateOnDoubleClick ? 'cursor-default' : 'cursor-pointer'),
                              isPinned &&
                                (rowTone === 'warning'
                                  ? 'bg-[#fff8e1] group-hover:bg-[#fdf0cc] group-data-[state=selected]:bg-secondary'
                                  : 'bg-white group-hover:bg-muted group-data-[state=selected]:bg-secondary'),
                              cell.column.columnDef.meta?.cellClassName,
                            )}
                            style={{
                              width: cell.column.columnDef.meta?.fill
                                ? undefined
                                : cell.column.getSize(),
                              height: rowCellHeight,
                              ...getPinStyle(cell.column),
                            }}
                            onClick={() => {
                              setFocusedCell({ row: rowIndex, col: colIndex });
                              if (!activateOnDoubleClick) {
                                onRowClick?.(row.original);
                              }
                            }}
                            onDoubleClick={(event) => {
                              setFocusedCell({ row: rowIndex, col: colIndex });
                              const columnMeta = cell.column.columnDef.meta;
                              if (columnMeta?.onCellDoubleClick) {
                                columnMeta.onCellDoubleClick(row.original, event);
                                return;
                              }
                              if (activateOnDoubleClick) {
                                onRowClick?.(row.original);
                              }
                            }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      }
                      if (isRefreshHeader) {
                        // 매물관리 표와 같은 본문: 옅은 선, 줄에 올리면 #fafaf8, 접히는 묶음 열은 옅은 바탕,
                        // 키보드로 고른 줄은 옅은 파랑
                        return (
                          <td
                            key={cell.id}
                            data-table-col={colIndex}
                            data-table-row={rowIndex}
                            className={cn(
                              'relative select-none border-b border-[#f0efec] px-2.5 align-middle text-[13px] text-[#2c2c2b]',
                              !isLastCol && 'border-r border-r-[#f0efec]',
                              isGroupDetailCell
                                ? 'bg-[#faf9f8] group-hover:bg-[#f6f5f3]'
                                : 'bg-white group-hover:bg-[#fafaf8]',
                              'group-data-[state=selected]:bg-[#f3f8fd]',
                              isRowFocused && !isFocused && 'bg-[#f3f8fd] group-hover:bg-[#eef4fc]',
                              isFocused &&
                                'bg-[#eef4fc] outline outline-1 -outline-offset-1 outline-[#2383e2]/40',
                              onRowClick &&
                                (activateOnDoubleClick ? 'cursor-default' : 'cursor-pointer'),
                              isLastPinned && 'shadow-[1px_0_0_0_#e6e4e0]',
                              cell.column.columnDef.meta?.cellClassName,
                            )}
                            style={{
                              width: cell.column.columnDef.meta?.fill
                                ? undefined
                                : cell.column.getSize(),
                              height: rowCellHeight,
                              ...getPinStyle(cell.column),
                            }}
                            onClick={() => {
                              setFocusedCell({ row: rowIndex, col: colIndex });
                              if (!activateOnDoubleClick) {
                                onRowClick?.(row.original);
                              }
                            }}
                            onDoubleClick={(event) => {
                              setFocusedCell({ row: rowIndex, col: colIndex });
                              const columnMeta = cell.column.columnDef.meta;
                              if (columnMeta?.onCellDoubleClick) {
                                columnMeta.onCellDoubleClick(row.original, event);
                                return;
                              }
                              if (activateOnDoubleClick) {
                                onRowClick?.(row.original);
                              }
                            }}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      }
                      return (
                        <td
                          key={cell.id}
                          data-table-col={colIndex}
                          data-table-row={rowIndex}
                          className={cn(
                            'relative align-middle select-none',
                            isNotion
                              ? 'border-b border-[#eeeeec] px-2.5 text-[13px]'
                              : 'border-b border-border/30 px-3',
                            !isLastCol &&
                              (isNotion
                                ? 'border-r border-r-[#eeeeec]'
                                : 'border-r border-r-border/30'),
                            isNotion
                              ? 'group-hover:bg-slate-50/70'
                              : 'group-hover:bg-muted/40',
                            'group-data-[state=selected]:bg-primary/5',
                            isFocused &&
                              (isNotion
                                ? 'bg-blue-50/60 outline outline-1 -outline-offset-1 outline-blue-500/30'
                                : 'bg-accent/60 outline outline-1 -outline-offset-1 outline-primary/30'),
                            isRowFocused &&
                              !isFocused &&
                              (isNotion ? 'bg-slate-50' : 'bg-accent/30'),
                            onRowClick &&
                              (activateOnDoubleClick
                                ? 'cursor-default'
                                : 'cursor-pointer'),
                            isPinned &&
                              (isNotion
                                ? 'bg-white group-hover:bg-[#fbfcfd] group-data-[state=selected]:bg-primary/5'
                                : 'bg-background group-hover:bg-muted/40 group-data-[state=selected]:bg-primary/5'),
                            isLastPinned && 'shadow-[1px_0_0_0_#d9d9d6]',
                            cell.column.columnDef.meta?.cellClassName,
                          )}
                          style={{
                            width: cell.column.columnDef.meta?.fill
                              ? undefined
                              : cell.column.getSize(),
                            height: rowCellHeight,
                            ...getPinStyle(cell.column),
                          }}
                          onClick={() => {
                            setFocusedCell({ row: rowIndex, col: colIndex });
                            if (!activateOnDoubleClick) {
                              onRowClick?.(row.original);
                            }
                          }}
                          onDoubleClick={(event) => {
                            setFocusedCell({ row: rowIndex, col: colIndex });
                            const columnMeta = cell.column.columnDef.meta;
                            if (columnMeta?.onCellDoubleClick) {
                              columnMeta.onCellDoubleClick(
                                row.original,
                                event,
                              );
                              return;
                            }
                            if (activateOnDoubleClick) {
                              onRowClick?.(row.original);
                            }
                          }}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              };
              // 가상 스크롤 중이면 virtualIndex로 실제 높이를 잰다(펼친 내용은 나중에 자랄 수 있다).
              const renderExpandedRowElement = (
                row: (typeof rows)[number],
                virtualIndex?: number,
              ) =>
                renderExpandedRow && (
                  <tr
                    key={`${row.id}:expanded`}
                    data-table-expanded-row
                    data-index={virtualIndex}
                    ref={
                      virtualIndex === undefined
                        ? undefined
                        : rowVirtualizer.measureElement
                    }
                  >
                    <td
                      colSpan={allColumns.length}
                      className={cn(
                        'p-0 align-top',
                        isNotion
                          ? 'border-b border-[#eeeeec] bg-slate-50/40'
                          : 'border-b border-border/30 bg-muted/20',
                        isPropertyListTone && 'border-b-border',
                      )}
                    >
                      {renderExpandedRow(row.original)}
                    </td>
                  </tr>
                );
              const renderRow = (
                row: (typeof rows)[number],
                rowIndex: number,
              ) => (
                <Fragment key={row.id}>
                  {renderMainRow(row, rowIndex)}
                  {expandedRowIds?.has(row.original.id) &&
                    renderExpandedRowElement(row)}
                </Fragment>
              );
              // 펼친 행을 가상 스크롤할 때만: 여백 줄의 높이가 바뀌면 새 줄로 바꿔 그린다.
              // Chromium 표 배치는 펼친 행(전체 칸 colSpan)이 있으면 같은 여백 줄의 높이를
              // 줄여도 몇 프레임 동안 옛 높이를 유지해, 스크롤 중 전체 높이가 줄 몇 개만큼
              // 늘었다 돌아온다(스크롤바가 튄다). 새 줄은 처음부터 맞는 높이로 배치된다.
              const spacerKey = (edge: 'top' | 'bottom', height: number) =>
                virtualizesExpandedRows ? `spacer-${edge}-${height}` : undefined;
              if (canVirtualize) {
                return (
                  <>
                    {paddingTop > 0 && (
                      <tr aria-hidden="true" key={spacerKey('top', paddingTop)}>
                        <td
                          colSpan={allColumns.length}
                          style={{ height: paddingTop, padding: 0, border: 0 }}
                        />
                      </tr>
                    )}
                    {virtualRows.map((virtualRow) => {
                      if (!virtualItems) {
                        return renderRow(rows[virtualRow.index], virtualRow.index);
                      }
                      const item = virtualItems[virtualRow.index];
                      const row = item ? rows[item.rowIndex] : undefined;
                      if (!item || !row) return null;
                      return item.expanded
                        ? renderExpandedRowElement(row, virtualRow.index)
                        : renderMainRow(row, item.rowIndex);
                    })}
                    {paddingBottom > 0 && (
                      <tr
                        aria-hidden="true"
                        key={spacerKey('bottom', paddingBottom)}
                      >
                        <td
                          colSpan={allColumns.length}
                          style={{
                            height: paddingBottom,
                            padding: 0,
                            border: 0,
                          }}
                        />
                      </tr>
                    )}
                    {isLoadingMore && (
                      <tr>
                        <td
                          colSpan={allColumns.length}
                          className="h-10 px-3 text-center text-xs text-muted-foreground"
                        >
                          더 불러오는 중...
                        </td>
                      </tr>
                    )}
                  </>
                );
              }
              return (
                <>
                  {rows.map(renderRow)}
                  {isLoadingMore && (
                    <tr>
                      <td
                        colSpan={allColumns.length}
                        className="h-10 px-3 text-center text-xs text-muted-foreground"
                      >
                        더 불러오는 중...
                      </td>
                    </tr>
                  )}
                </>
              );
            })()}
          </tbody>
        </table>
      </div>

      {/* 매물관리 표와 같은 아래쪽 선택 막대 — 스크롤 영역이 아래에서 줄어들 뿐 행은 제자리다. */}
      {showsSelectionToolbar && selectionToolbarPlacement === 'bottom' && (
        <div
          data-data-table-selection-toolbar="bottom"
          className="flex min-h-9 flex-wrap items-center gap-2 border-t border-border/60 bg-white px-3 py-1.5 text-xs"
        >
          <span className="font-medium text-slate-900">
            {selectedRows.length}개{selectionItemLabel ? ` ${selectionItemLabel}` : ''} 선택
          </span>
          {renderBulkActions?.(selectedRows)}
          <button
            type="button"
            className="ml-auto text-[11px] text-muted-foreground underline-offset-2 hover:underline disabled:cursor-default disabled:opacity-40 disabled:hover:no-underline"
            disabled={selectedRows.length === 0}
            onClick={clearSelection}
          >
            선택 해제
          </button>
        </div>
      )}

      {/* Pagination */}
      {!isFullHeight && pageCount > 1 && (
        <DataTablePagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}

      {/* Status bar — shows focused row summary */}
      {renderStatusBar && (
        <div className="flex min-h-7 items-center gap-2 border-t border-border/60 bg-[#faf9f6] px-3 text-[11px] text-muted-foreground">
          {renderStatusBar({
            focusedRow,
            totalCount: totalCount || rows.length,
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 빈 표의 안내 문구. 열이 많아 표가 가로로 넘치면 표 전체 폭의 가운데에 놓인 글이 화면 밖으로
 * 나가므로, 보이는 폭(스크롤 영역의 너비)만큼만 차지하고 왼쪽에 붙어 있게(sticky) 둔다.
 * 긴 안내는 그 폭 안에서 줄을 바꾼다.
 */
function VisibleWidthEmptyMessage({
  scrollerRef,
  children,
}: {
  scrollerRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const [width, setWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => setWidth(scroller.clientWidth);
    update();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(update);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, [scrollerRef]);
  return (
    <div
      data-data-table-empty
      className="sticky left-0 flex min-h-32 items-center justify-center px-6 py-6 text-center leading-6 break-keep"
      style={{ width: width ?? '100%' }}
    >
      <div className="max-w-xl">{children}</div>
    </div>
  );
}

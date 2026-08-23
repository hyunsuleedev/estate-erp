import {
  Fragment,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type ColumnResizeMode,
  type ColumnPinningState,
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
  rowHeight = DEFAULT_ROW_HEIGHT,
  pinnedColumns,
  columnGroupControls = [],
  renderBulkActions,
  alwaysShowSelectionToolbar = false,
  renderStatusBar,
  expandedRowIds,
  renderExpandedRow,
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
      size: 36,
      minSize: 36,
      maxSize: 36,
      enableResizing: false,
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
          aria-label="현재 목록 전체 행 선택"
          className="size-3.5"
        />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col items-center justify-center gap-1 py-1">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            onClick={(e) => e.stopPropagation()}
            aria-label={`${row.index + 1}번째 행 선택`}
            className="size-3.5"
          />
          {renderSelectionAccessory?.(row.original)}
        </div>
      ),
    });
  }

  allColumns.push(...columns);

  // ── TanStack Table instance ───────────────────────────────────
  const table = useReactTable({
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
  });
  const tableTotalSize = table.getTotalSize();
  const leafColumns = table.getAllLeafColumns();
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

  // Virtualize only for full-height mode with a meaningful row count.
  // Paginated views are small (pageSize ~20) and auto-height rows can't be
  // measured up front, so we skip virtualization there.
  const rows = table.getRowModel().rows;
  const canVirtualize =
    isFullHeight &&
    rows.length >= VIRTUALIZE_THRESHOLD &&
    typeof rowCellHeight === 'number' &&
    (!expandedRowIds || expandedRowIds.size === 0);

  const rowVirtualizer = useVirtualizer({
    count: canVirtualize ? rows.length : 0,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => rowCellHeight ?? DEFAULT_ROW_HEIGHT,
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
      rowVirtualizer.scrollToIndex(focusedCell.row, { align: 'auto' });
      return;
    }
    if (!tableRef.current) return;
    const trs = tableRef.current.querySelectorAll(
      'tbody tr:not([data-table-expanded-row]):not([aria-hidden])',
    );
    trs[focusedCell.row]?.scrollIntoView({ block: 'nearest' });
  }, [focusedCell, canVirtualize, rowVirtualizer]);

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

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!onEndReached || isLoading || isLoadingMore) return;

      const target = event.currentTarget;
      const distanceToBottom =
        target.scrollHeight - target.scrollTop - target.clientHeight;
      if (distanceToBottom <= endReachedThreshold) {
        onEndReached();
      }
    },
    [endReachedThreshold, isLoading, isLoadingMore, onEndReached],
  );

  return (
    <div className={cn('flex flex-col', isFullHeight && 'h-full min-h-0')}>
      {/* Bulk actions toolbar — optionally reserved to prevent layout shift. */}
      {renderBulkActions &&
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
              onClick={() => {
                if (selectedRowIds === undefined) setInternalRowSelection({});
                onRowSelectionChange?.([]);
              }}
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
        )}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
      >
        {hasColumnGroupGuide && (
          <div
            data-data-table-column-guide
            className="sticky top-0 z-40 h-9 border-b border-[#e7e5df] bg-[#f8f7f4]"
            style={{ width: '100%', minWidth: tableTotalSize }}
          >
            <div
              className="relative h-full pt-2"
              style={{ width: tableTotalSize, minWidth: tableTotalSize }}
            >
              {columnGroupLayouts.map(
                ({ control, anchorEnd, expandedWidth, toggleOffset }) => (
                  <div
                    key={`${control.anchorColumnId}-${control.label}`}
                    className="pointer-events-none absolute inset-0"
                  >
                    {!control.collapsed && expandedWidth > 0 && (
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
                      className="pointer-events-auto absolute z-50 mt-2 inline-flex size-5 items-center justify-center rounded-[3px] border border-border bg-white p-0 text-muted-foreground shadow-xs outline-none transition-colors hover:border-muted-foreground/40 hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/35 active:translate-y-px"
                      style={{ left: toggleOffset }}
                      onClick={control.onToggle}
                    >
                      {control.collapsed ? (
                        <Plus className="size-3" />
                      ) : (
                        <Minus className="size-3" />
                      )}
                    </button>
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
              hasColumnGroupGuide ? 'top-9' : 'top-0',
              isNotion && 'bg-[#f7f7f5]',
            )}
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
                      className={cn(
                        'relative text-left align-middle font-medium text-muted-foreground',
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
                        isLastPinned && 'shadow-[1px_0_0_0_#d9d9d6]',
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
                          isNotion && 'min-w-0 text-slate-500',
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                        {sorted === 'asc' && <ArrowUp className="size-3" />}
                        {sorted === 'desc' && <ArrowDown className="size-3" />}
                      </div>
                      {/* Column resize handle */}
                      {header.column.getCanResize() &&
                        !header.column.columnDef.meta?.fill && (
                          <div
                            onMouseDown={header.getResizeHandler()}
                            onTouchStart={header.getResizeHandler()}
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
                      className="h-32 text-center text-sm text-muted-foreground"
                    >
                      {emptyMessage}
                    </td>
                  </tr>
                );
              }
              const renderRow = (
                row: (typeof rows)[number],
                rowIndex: number,
              ) => (
                <Fragment key={row.id}>
                  <tr
                    data-state={row.getIsSelected() ? 'selected' : undefined}
                    className="group"
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
                                ? 'bg-white group-hover:bg-slate-50/70 group-data-[state=selected]:bg-primary/5'
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
                  {renderExpandedRow &&
                    expandedRowIds?.has(row.original.id) && (
                      <tr data-table-expanded-row>
                        <td
                          colSpan={allColumns.length}
                          className={cn(
                            'p-0 align-top',
                            isNotion
                              ? 'border-b border-[#eeeeec] bg-slate-50/40'
                              : 'border-b border-border/30 bg-muted/20',
                          )}
                        >
                          {renderExpandedRow(row.original)}
                        </td>
                      </tr>
                    )}
                </Fragment>
              );
              if (canVirtualize) {
                return (
                  <>
                    {paddingTop > 0 && (
                      <tr aria-hidden="true">
                        <td
                          colSpan={allColumns.length}
                          style={{ height: paddingTop, padding: 0, border: 0 }}
                        />
                      </tr>
                    )}
                    {virtualRows.map((virtualRow) =>
                      renderRow(rows[virtualRow.index], virtualRow.index),
                    )}
                    {paddingBottom > 0 && (
                      <tr aria-hidden="true">
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

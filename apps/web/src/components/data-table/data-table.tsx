import { Fragment, useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
import { ArrowUp, ArrowDown } from 'lucide-react';
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
  onRowSelectionChange,
  renderSelectionAccessory,
  onRowClick,
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
  renderBulkActions,
  renderStatusBar,
  expandedRowIds,
  renderExpandedRow,
}: DataTableProps<TData>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number } | null>(null);
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
          className="size-3.5"
        />
      ),
      cell: ({ row }) => (
        <div className="flex flex-col items-center justify-center gap-1 py-1">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(v) => row.toggleSelected(!!v)}
            onClick={(e) => e.stopPropagation()}
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
      const next = typeof updater === 'function' ? updater(sorting ?? []) : updater;
      onSortingChange?.(next);
    },
    onRowSelectionChange: (updater) => {
      const next = typeof updater === 'function' ? updater(rowSelection) : updater;
      setRowSelection(next);
      const selectedIds = Object.keys(next).filter((k) => next[k]).map((idx) => data[Number(idx)]?.id).filter(Boolean);
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
            col: prev === null ? startCol : Math.min(colCount - 1, prev.col + 1),
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
    [enableKeyboardNav, focusedCell, onRowClick, enableRowSelection, table, allColumns.length],
  );

  const isFullHeight = layout === 'full-height';
  const isNotion = variant === 'notion';

  // Virtualize only for full-height mode with a meaningful row count.
  // Paginated views are small (pageSize ~20) and auto-height rows can't be
  // measured up front, so we skip virtualization there.
  const rows = table.getRowModel().rows;
  const canVirtualize =
    isFullHeight && rows.length >= VIRTUALIZE_THRESHOLD && typeof rowCellHeight === 'number';

  // 측정 캐시를 행 인덱스가 아닌 행 id에 묶는다 — 정렬/필터로 순서가 바뀌어도
  // 펼침 행의 실측 높이가 다른 행에 재사용되지 않는다.
  // rows(getRowModel 캐시)가 바뀔 때만 참조가 갱신되도록 useCallback으로 안정화 —
  // 인라인 함수면 스크롤 렌더마다 virtualizer가 키 매핑을 O(n) 재계산한다.
  const getRowKey = useCallback((index: number) => rows[index]?.id ?? index, [rows]);

  // 확장 행(renderExpandedRow)은 높이가 가변이므로 measureElement(ResizeObserver)로
  // 행 단위(tbody) 실측 — 수천 행이 로드돼 있어도 펼친 상태에서 가상화가 유지된다.
  const rowVirtualizer = useVirtualizer({
    count: canVirtualize ? rows.length : 0,
    getScrollElement: () => scrollerRef.current,
    estimateSize: () => rowCellHeight ?? DEFAULT_ROW_HEIGHT,
    overscan: 10,
    getItemKey: getRowKey,
  });

  const virtualRows = canVirtualize ? rowVirtualizer.getVirtualItems() : [];
  const totalVirtualSize = canVirtualize ? rowVirtualizer.getTotalSize() : 0;
  const paddingTop = canVirtualize && virtualRows.length > 0 ? virtualRows[0].start : 0;
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
    // 확장 서브행/로딩 행은 데이터 행 인덱스에서 제외
    const trs = tableRef.current.querySelectorAll(
      'tbody tr:not([data-table-expanded-row]):not([aria-hidden])',
    );
    trs[focusedCell.row]?.scrollIntoView({ block: 'nearest' });
  }, [focusedCell, canVirtualize, rowVirtualizer]);

  const getPinStyle = (column: ReturnType<typeof table.getAllLeafColumns>[number]) => {
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
    focusedCell !== null && rows[focusedCell.row]?.original ? rows[focusedCell.row].original : null;

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!onEndReached || isLoading || isLoadingMore) return;

      const target = event.currentTarget;
      const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
      if (distanceToBottom <= endReachedThreshold) {
        onEndReached();
      }
    },
    [endReachedThreshold, isLoading, isLoadingMore, onEndReached],
  );

  return (
    <div className={cn('flex flex-col', isFullHeight && 'h-full min-h-0')}>
      {/* Bulk actions toolbar — visible when at least one row is selected */}
      {renderBulkActions && selectedRows.length > 0 && (
        <div className="flex items-center gap-2 border-b border-border/60 bg-accent/40 px-3 py-1.5 text-xs">
          <span className="font-medium">{selectedRows.length}개 선택됨</span>
          <div className="mx-1 h-3 w-px bg-border/60" />
          {renderBulkActions(selectedRows)}
          <button
            type="button"
            className="ml-auto text-muted-foreground hover:text-foreground"
            onClick={() => {
              setRowSelection({});
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
          'relative w-full overflow-auto',
          isFullHeight && 'flex-1 min-h-0',
          isNotion && 'bg-white',
        )}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
      >
        <table
          ref={tableRef}
          className={cn('w-full table-fixed caption-bottom text-sm', isNotion && 'border-separate border-spacing-0')}
          style={{ width: tableTotalSize, minWidth: tableTotalSize }}
        >
          {/* Header */}
          <thead className={cn('sticky top-0 z-20 bg-background', isNotion && 'bg-white')}>
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
                  const isLastPinned = isPinned && header.column.getIsLastColumn('left');
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
                          ? 'h-9 border-b border-[#eeeeec] px-2.5 text-[13px] normal-case tracking-normal'
                          : 'h-8 border-b border-border/60 px-3 text-[11px] uppercase tracking-wider',
                        !isLast && (isNotion ? 'border-r border-r-[#eeeeec]' : 'border-r border-r-border/40'),
                        canSort && 'cursor-pointer select-none hover:text-foreground',
                        isPinned && (isNotion ? 'bg-white' : 'bg-background'),
                        isLastPinned && 'shadow-[1px_0_0_0_#d9d9d6]',
                      )}
                      style={{
                        width: header.getSize(),
                        ...(isPinned
                          ? { position: 'sticky', left: header.column.getStart('left'), zIndex: 30 }
                          : {}),
                      }}
                      onClick={canSort ? handleSortToggle : undefined}
                    >
                      <div className={cn('flex items-center gap-1', isNotion && 'min-w-0 text-slate-500')}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' && <ArrowUp className="size-3" />}
                        {sorted === 'desc' && <ArrowDown className="size-3" />}
                      </div>
                      {/* Column resize handle */}
                      {header.column.getCanResize() && (
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

          {/* Body — 가상화 시 행 단위 <tbody>로 감싸 measureElement 실측 대상이 되게 한다 */}
          {(() => {
              if (isLoading) {
                return (
                  <tbody>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <tr key={`skel-${i}`}>
                        {allColumns.map((_, j) => (
                          <td
                            key={j}
                            className={cn(
                              isNotion ? 'border-b border-[#eeeeec] px-2.5' : 'border-b border-border/30 px-3',
                              j < allColumns.length - 1 && (isNotion ? 'border-r border-r-[#eeeeec]' : 'border-r border-r-border/30'),
                            )}
                            style={{ height: rowCellHeight }}
                          >
                            <Skeleton className="h-4 w-full" />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                );
              }
              if (rows.length === 0) {
                return (
                  <tbody>
                    <tr>
                      <td
                        colSpan={allColumns.length}
                        className="h-32 text-center text-sm text-muted-foreground"
                      >
                        {emptyMessage}
                      </td>
                    </tr>
                  </tbody>
                );
              }
              const renderRow = (row: (typeof rows)[number], rowIndex: number) => (
                <Fragment key={row.id}>
                <tr
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className="group"
                >
                  {row.getVisibleCells().map((cell, colIndex) => {
                    const isLastCol = colIndex === row.getVisibleCells().length - 1;
                    const isFocused =
                      focusedCell?.row === rowIndex && focusedCell?.col === colIndex;
                    const isRowFocused = focusedCell?.row === rowIndex;
                    const isPinned = cell.column.getIsPinned() === 'left';
                    const isLastPinned = isPinned && cell.column.getIsLastColumn('left');
                    return (
                      <td
                        key={cell.id}
                        data-table-col={colIndex}
                        data-table-row={rowIndex}
                        className={cn(
                          'relative align-middle select-none',
                          isNotion ? 'border-b border-[#eeeeec] px-2.5 text-[13px]' : 'border-b border-border/30 px-3',
                          !isLastCol && (isNotion ? 'border-r border-r-[#eeeeec]' : 'border-r border-r-border/30'),
                          isNotion ? 'group-hover:bg-slate-50/70' : 'group-hover:bg-muted/40',
                          'group-data-[state=selected]:bg-primary/5',
                          isFocused && (isNotion ? 'bg-blue-50/60 outline outline-1 -outline-offset-1 outline-blue-500/30' : 'bg-accent/60 outline outline-1 -outline-offset-1 outline-primary/30'),
                          isRowFocused && !isFocused && (isNotion ? 'bg-slate-50' : 'bg-accent/30'),
                          onRowClick && 'cursor-pointer',
                          isPinned && (isNotion ? 'bg-white group-hover:bg-slate-50/70 group-data-[state=selected]:bg-primary/5' : 'bg-background group-hover:bg-muted/40 group-data-[state=selected]:bg-primary/5'),
                          isLastPinned && 'shadow-[1px_0_0_0_#d9d9d6]',
                        )}
                        style={{
                          width: cell.column.getSize(),
                          height: rowCellHeight,
                          ...getPinStyle(cell.column),
                        }}
                        onClick={() => {
                          setFocusedCell({ row: rowIndex, col: colIndex });
                          onRowClick?.(row.original);
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
                {renderExpandedRow && expandedRowIds?.has(row.original.id) && (
                  <tr data-table-expanded-row>
                    <td
                      colSpan={allColumns.length}
                      className={cn(
                        'p-0 align-top',
                        isNotion ? 'border-b border-[#eeeeec] bg-slate-50/40' : 'border-b border-border/30 bg-muted/20',
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
                      <tbody aria-hidden="true">
                        <tr>
                          <td colSpan={allColumns.length} style={{ height: paddingTop, padding: 0, border: 0 }} />
                        </tr>
                      </tbody>
                    )}
                    {virtualRows.map((virtualRow) => (
                      // 행+확장행을 tbody 하나로 묶어 measureElement가 확장 높이까지 실측
                      <tbody
                        key={rows[virtualRow.index].id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                      >
                        {renderRow(rows[virtualRow.index], virtualRow.index)}
                      </tbody>
                    ))}
                    {paddingBottom > 0 && (
                      <tbody aria-hidden="true">
                        <tr>
                          <td colSpan={allColumns.length} style={{ height: paddingBottom, padding: 0, border: 0 }} />
                        </tr>
                      </tbody>
                    )}
                    {isLoadingMore && (
                      <tbody>
                        <tr>
                          <td colSpan={allColumns.length} className="h-10 px-3 text-center text-xs text-muted-foreground">
                            더 불러오는 중...
                          </td>
                        </tr>
                      </tbody>
                    )}
                  </>
                );
              }
              return (
                <tbody>
                  {rows.map(renderRow)}
                  {isLoadingMore && (
                    <tr>
                      <td colSpan={allColumns.length} className="h-10 px-3 text-center text-xs text-muted-foreground">
                        더 불러오는 중...
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })()}
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
        <div className="flex min-h-7 items-center gap-2 border-t border-border/60 bg-muted/30 px-3 text-[11px] text-muted-foreground">
          {renderStatusBar({ focusedRow, totalCount: rows.length })}
        </div>
      )}
    </div>
  );
}

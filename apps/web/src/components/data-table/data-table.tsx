import { useState, useCallback, useEffect, useRef } from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type RowSelectionState,
  type ColumnResizeMode,
} from '@tanstack/react-table';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUp, ArrowDown } from 'lucide-react';
import type { DataTableProps } from './types';
import { DataTablePagination } from './data-table-pagination';

// ── Constants (Twenty-inspired) ─────────────────────────────────
const ROW_HEIGHT = 32; // px — matches Twenty's RECORD_TABLE_ROW_HEIGHT

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
  onRowClick,
  isLoading = false,
  enableKeyboardNav = true,
  emptyMessage = '데이터가 없습니다.',
}: DataTableProps<TData>) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number } | null>(null);
  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');
  const tableRef = useRef<HTMLTableElement>(null);

  // ── Build column defs with optional selection column ──────────
  const allColumns: ColumnDef<TData, unknown>[] = [];

  if (enableRowSelection) {
    allColumns.push({
      id: '_select',
      size: 32,
      minSize: 32,
      maxSize: 32,
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
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
          onClick={(e) => e.stopPropagation()}
          className="size-3.5"
        />
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
    columnResizeMode,
    getRowId: (row) => row.id,
  });

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

  // ── Scroll focused row into view ──────────────────────────────
  useEffect(() => {
    if (focusedCell === null || !tableRef.current) return;
    const rows = tableRef.current.querySelectorAll('tbody tr');
    rows[focusedCell.row]?.scrollIntoView({ block: 'nearest' });
  }, [focusedCell]);

  return (
    <div className="flex flex-col">
      {/* Table */}
      <div
        className="relative w-full overflow-auto"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <table
          ref={tableRef}
          className="w-full caption-bottom text-sm"
          style={{ minWidth: table.getTotalSize() }}
        >
          {/* Header */}
          <thead className="sticky top-0 z-10 bg-background">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, colIndex) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const isLast = colIndex === headerGroup.headers.length - 1;
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'relative h-8 px-3 text-left align-middle text-[11px] font-medium uppercase tracking-wider text-muted-foreground',
                        'border-b border-border/60',
                        !isLast && 'border-r border-r-border/40',
                        canSort && 'cursor-pointer select-none hover:text-foreground',
                      )}
                      style={{ width: header.getSize() }}
                      onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                    >
                      <div className="flex items-center gap-1">
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

          {/* Body */}
          <tbody>
            {isLoading ? (
              // Skeleton rows
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={`skel-${i}`}>
                  {allColumns.map((_, j) => (
                    <td
                      key={j}
                      className={cn(
                        'px-3 border-b border-border/30',
                        j < allColumns.length - 1 && 'border-r border-r-border/30',
                      )}
                      style={{ height: ROW_HEIGHT }}
                    >
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={allColumns.length}
                  className="h-32 text-center text-sm text-muted-foreground"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row, rowIndex) => (
                <tr
                  key={row.id}
                  data-state={row.getIsSelected() ? 'selected' : undefined}
                  className="group"
                >
                  {row.getVisibleCells().map((cell, colIndex) => {
                    const isLastCol = colIndex === row.getVisibleCells().length - 1;
                    const isFocused =
                      focusedCell?.row === rowIndex && focusedCell?.col === colIndex;
                    const isRowFocused = focusedCell?.row === rowIndex;
                    return (
                      <td
                        key={cell.id}
                        data-table-col={colIndex}
                        data-table-row={rowIndex}
                        className={cn(
                          'relative px-3 align-middle select-none',
                          'border-b border-border/30',
                          !isLastCol && 'border-r border-r-border/30',
                          // Row hover
                          'group-hover:bg-muted/40',
                          // Selected row
                          'group-data-[state=selected]:bg-primary/5',
                          // Focused cell highlight (Twenty pattern)
                          isFocused && 'bg-accent/60 outline outline-1 -outline-offset-1 outline-primary/30',
                          // Active row subtle highlight
                          isRowFocused && !isFocused && 'bg-accent/30',
                          // Clickable
                          onRowClick && 'cursor-pointer',
                        )}
                        style={{
                          width: cell.column.getSize(),
                          height: ROW_HEIGHT,
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <DataTablePagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          totalCount={totalCount}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
    </div>
  );
}

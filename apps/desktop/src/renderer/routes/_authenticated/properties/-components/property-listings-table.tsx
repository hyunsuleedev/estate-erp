import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnPinningState,
  type ColumnResizeMode,
  type RowSelectionState,
  type SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ListingIntake, ListingIntakeListing } from '@estate-erp/api-client';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const VIRTUALIZE_THRESHOLD = 50;
const PROPERTY_LISTING_ITEM_HEIGHT = 40;
const END_REACHED_THRESHOLD = 320;

type ListingProperty = NonNullable<ListingIntake['property']>;

export type PropertyListingGroup = {
  id: string;
  intakeId: string;
  propertyId: string;
  property?: ListingProperty;
  representative: ListingIntake;
  listings: ListingSummary[];
  matchedIntakes: ListingIntake[];
};

type PropertyListingColumnMeta = {
  cellClassName?: string;
  onCellDoubleClick?: (group: PropertyListingGroup, event: ReactMouseEvent<HTMLTableCellElement>) => void;
};

export type ListingSummary = Pick<
  ListingIntakeListing,
  | 'intakeId'
  | 'id'
  | 'transactionType'
  | 'price'
  | 'deposit'
  | 'monthlyRent'
  | 'moveInAvailableType'
  | 'moveInAvailableFrom'
  | 'moveInAvailableTo'
  | 'checkStatus'
  | 'isHidden'
  | 'memo'
  | 'createdAt'
  | 'updatedAt'
  | 'advertisements'
  | 'priceHistories'
> & {
  // api-client ListingIntakeListing 타입에 아직 없지만 서버가 반환하는 비용 필드
  // (웹 -property-intake-actions의 ListingCostExtras 대응) — 선택 컬럼(관리비/융자금)에서 사용.
  maintenanceFee?: number | null;
  loanAmount?: number | null;
};

interface PropertyListingsTableProps {
  columns: ColumnDef<PropertyListingGroup, unknown>[];
  data: PropertyListingGroup[];
  totalCount: number;
  pageSize: number;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  onRowClick?: (row: PropertyListingGroup) => void;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  onEndReached?: () => void;
  emptyMessage?: string;
  renderStatusBar?: (args: {
    focusedRow: PropertyListingGroup | null;
    totalCount: number;
  }) => ReactNode;
  /** 선택된 행이 있을 때 표시할 일괄 작업 UI (웹 DataTable의 renderBulkActions 대응) */
  renderBulkActions?: (selectedRows: PropertyListingGroup[]) => ReactNode;
}

export function PropertyListingsTable({
  columns,
  data,
  totalCount,
  pageSize,
  sorting,
  onSortingChange,
  onRowClick,
  isLoading = false,
  isLoadingMore = false,
  onEndReached,
  emptyMessage = '등록된 매물이 없습니다.',
  renderStatusBar,
  renderBulkActions,
}: PropertyListingsTableProps) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [focusedCell, setFocusedCell] = useState<{ row: number; col: number } | null>(null);
  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const resolvedPinning = useMemo<ColumnPinningState>(
    () => ({ left: ['_select', 'info', 'site', 'dong', 'unit'], right: [] }),
    [],
  );

  const allColumns = useMemo<ColumnDef<PropertyListingGroup, unknown>[]>(
    () => [
      {
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
          </div>
        ),
      },
      ...columns,
    ],
    [columns],
  );

  const table = useReactTable({
    data,
    columns: allColumns,
    pageCount: 1,
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
    },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    manualPagination: true,
    manualFiltering: true,
    enableRowSelection: true,
    enableColumnPinning: true,
    columnResizeMode,
    getRowId: (row) => row.id,
  });

  const rows = table.getRowModel().rows;
  const canVirtualize = rows.length > VIRTUALIZE_THRESHOLD;
  const rowVirtualizer = useVirtualizer({
    count: canVirtualize ? rows.length : 0,
    getScrollElement: () => scrollerRef.current,
    estimateSize: (index) => estimatePropertyGroupRowHeight(rows[index]?.original),
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 10,
  });

  const virtualRows = canVirtualize ? rowVirtualizer.getVirtualItems() : [];
  const totalVirtualSize = canVirtualize ? rowVirtualizer.getTotalSize() : 0;
  const paddingTop = canVirtualize && virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    canVirtualize && virtualRows.length > 0
      ? totalVirtualSize - virtualRows[virtualRows.length - 1].end
      : 0;

  useEffect(() => {
    if (focusedCell === null) return;
    if (canVirtualize) {
      rowVirtualizer.scrollToIndex(focusedCell.row, { align: 'auto' });
      return;
    }
    if (!tableRef.current) return;
    const trs = tableRef.current.querySelectorAll('tbody tr');
    trs[focusedCell.row]?.scrollIntoView({ block: 'nearest' });
  }, [focusedCell, canVirtualize, rowVirtualizer]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const colCount = allColumns.length;
      const startCol = 1;

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
          if (focusedCell !== null) {
            e.preventDefault();
            rows[focusedCell.row]?.toggleSelected();
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
    [allColumns.length, focusedCell, onRowClick, rows, table],
  );

  const handleScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!onEndReached || isLoading || isLoadingMore) return;

      const target = event.currentTarget;
      const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
      if (distanceToBottom <= END_REACHED_THRESHOLD) {
        onEndReached();
      }
    },
    [isLoading, isLoadingMore, onEndReached],
  );

  const focusedRow =
    focusedCell !== null && rows[focusedCell.row]?.original ? rows[focusedCell.row].original : null;
  const tableTotalSize = table.getTotalSize();

  const selectedRows = useMemo(
    () => rows.filter((row) => row.getIsSelected()).map((row) => row.original),
    // rowSelection을 의존성에 포함해 선택 변경 시 재계산되도록 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, rowSelection],
  );

  const getPinStyle = (column: ReturnType<typeof table.getAllLeafColumns>[number]) => {
    if (column.getIsPinned() !== 'left') return {};
    return {
      position: 'sticky' as const,
      left: column.getStart('left'),
      zIndex: 1,
    };
  };

  const renderRow = (row: (typeof rows)[number], rowIndex: number) => (
    <tr
      key={row.id}
      ref={canVirtualize ? rowVirtualizer.measureElement : undefined}
      data-index={rowIndex}
      data-state={row.getIsSelected() ? 'selected' : undefined}
      className="group"
    >
      {row.getVisibleCells().map((cell, colIndex) => {
        const isLastCol = colIndex === row.getVisibleCells().length - 1;
        const isFocused = focusedCell?.row === rowIndex && focusedCell?.col === colIndex;
        const isRowFocused = focusedCell?.row === rowIndex;
        const isPinned = cell.column.getIsPinned() === 'left';
        const isLastPinned = isPinned && cell.column.getIsLastColumn('left');

        const columnMeta = cell.column.columnDef.meta as PropertyListingColumnMeta | undefined;

        return (
          <td
            key={cell.id}
            data-table-col={colIndex}
            data-table-row={rowIndex}
            className={cn(
              'relative select-none align-middle border-b border-[#eeeeec] px-2.5 text-[13px]',
              !isLastCol && 'border-r border-r-[#eeeeec]',
              'group-hover:bg-slate-50/70',
              'group-data-[state=selected]:bg-primary/5',
              isFocused && 'bg-blue-50/60 outline outline-1 -outline-offset-1 outline-blue-500/30',
              isRowFocused && !isFocused && 'bg-slate-50',
              onRowClick && 'cursor-default',
              isPinned && 'bg-white group-hover:bg-slate-50/70 group-data-[state=selected]:bg-primary/5',
              isLastPinned && 'shadow-[1px_0_0_0_#d9d9d6]',
              columnMeta?.cellClassName,
            )}
            style={{
              width: cell.column.getSize(),
              ...getPinStyle(cell.column),
            }}
            onClick={() => {
              setFocusedCell({ row: rowIndex, col: colIndex });
            }}
            onDoubleClick={(event) => {
              setFocusedCell({ row: rowIndex, col: colIndex });
              if (columnMeta?.onCellDoubleClick) {
                columnMeta.onCellDoubleClick(row.original, event);
                return;
              }
              onRowClick?.(row.original);
            }}
          >
            {flexRender(cell.column.columnDef.cell, cell.getContext())}
          </td>
        );
      })}
    </tr>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollerRef}
        className="relative min-h-0 w-full flex-1 overflow-scroll bg-white outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
      >
        <table
          ref={tableRef}
          className="w-full table-fixed border-separate border-spacing-0 caption-bottom text-sm"
          style={{ width: tableTotalSize, minWidth: tableTotalSize }}
        >
          <thead className="sticky top-0 z-20 bg-white">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, colIndex) => {
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
                        'relative h-9 border-b border-[#eeeeec] px-2.5 text-left align-middle text-[13px] font-medium normal-case tracking-normal text-muted-foreground',
                        !isLast && 'border-r border-r-[#eeeeec]',
                        canSort && 'cursor-pointer select-none hover:text-foreground',
                        isPinned && 'bg-white',
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
                      <div className="flex min-w-0 items-center gap-1 text-slate-500">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                        {sorted === 'asc' && <ArrowUp className="size-3" />}
                        {sorted === 'desc' && <ArrowDown className="size-3" />}
                      </div>
                      {header.column.getCanResize() && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={cn(
                            'absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none',
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
          <tbody>
            {isLoading && <LoadingRows columns={allColumns.length} />}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={allColumns.length} className="h-32 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {!isLoading && rows.length > 0 && canVirtualize && virtualRows.length > 0 && (
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={allColumns.length} style={{ height: paddingTop, padding: 0, border: 0 }} />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => renderRow(rows[virtualRow.index], virtualRow.index))}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={allColumns.length} style={{ height: paddingBottom, padding: 0, border: 0 }} />
                  </tr>
                )}
              </>
            )}
            {!isLoading && rows.length > 0 && (!canVirtualize || virtualRows.length === 0) && rows.map(renderRow)}
            {!isLoading && isLoadingMore && (
              <tr>
                <td colSpan={allColumns.length} className="h-10 px-3 text-center text-xs text-muted-foreground">
                  더 불러오는 중...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {renderBulkActions && selectedRows.length > 0 && (
        <div className="flex min-h-9 flex-wrap items-center gap-2 border-t border-border/60 bg-white px-3 py-1.5 text-xs">
          <span className="font-medium text-slate-900">{selectedRows.length}개 호실 선택</span>
          {renderBulkActions(selectedRows)}
          <button
            type="button"
            className="ml-auto text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => table.resetRowSelection()}
          >
            선택 해제
          </button>
        </div>
      )}
      {renderStatusBar && (
        <div className="flex min-h-7 items-center gap-2 border-t border-border/60 bg-muted/30 px-3 text-[11px] text-muted-foreground">
          {renderStatusBar({ focusedRow, totalCount: totalCount || pageSize })}
        </div>
      )}
    </div>
  );
}

function estimatePropertyGroupRowHeight(group?: PropertyListingGroup) {
  return Math.max(1, group?.listings.length ?? 1) * PROPERTY_LISTING_ITEM_HEIGHT;
}

function LoadingRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 8 }).map((_, i) => (
        <tr key={`skel-${i}`}>
          {Array.from({ length: columns }).map((_, j) => (
            <td
              key={j}
              className={cn(
                'h-10 border-b border-[#eeeeec] px-2.5 align-middle',
                j < columns - 1 && 'border-r border-r-[#eeeeec]',
              )}
            >
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

import {
  Fragment,
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
import { ArrowDown, ArrowUp, Minus, Plus } from 'lucide-react';
import type { ListingIntake, ListingIntakeListing } from '@estate-erp/api-client';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const VIRTUALIZE_THRESHOLD = 50;
const PROPERTY_LISTING_ITEM_HEIGHT = 40;
const END_REACHED_THRESHOLD = 320;
const PINNED_BODY_CELL_Z_INDEX = 10;

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
  grow?: boolean;
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
  | 'maintenanceFee'
  | 'loanAmount'
  | 'moveInAvailableType'
  | 'moveInAvailableFrom'
  | 'moveInAvailableTo'
  | 'isPaused'
  | 'deals'
  | 'memo'
  | 'createdAt'
  | 'updatedAt'
  | 'advertisements'
  | 'priceHistories'
  | '_count'
>;

interface PropertyListingsTableProps {
  columns: ColumnDef<PropertyListingGroup, unknown>[];
  data: PropertyListingGroup[];
  totalCount: number;
  pageSize: number;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  onRowClick?: (row: PropertyListingGroup) => void;
  onRequestClose?: () => void;
  isLoading?: boolean;
  isLoadingMore?: boolean;
  onEndReached?: () => void;
  emptyMessage?: string;
  renderStatusBar?: (args: { focusedRow: PropertyListingGroup | null; totalCount: number;
  }) => ReactNode;
  /** 선택된 행이 있을 때 표시할 일괄 작업 UI (웹 DataTable의 renderBulkActions 대응) */
  renderBulkActions?: (selectedRows: PropertyListingGroup[]) => ReactNode;
  expandedRowIds?: ReadonlySet<string>;
  renderExpandedRow?: (row: PropertyListingGroup) => ReactNode;
  getExpandedRowHeight?: (row: PropertyListingGroup) => number;
  columnGroupControl?: {
    collapsed: boolean;
    onToggle: () => void;
  };
}

export function PropertyListingsTable({
  columns,
  data,
  totalCount,
  pageSize,
  sorting,
  onSortingChange,
  onRowClick,
  onRequestClose,
  isLoading = false,
  isLoadingMore = false,
  onEndReached,
  emptyMessage = '등록된 매물이 없습니다.',
  renderStatusBar,
  renderBulkActions,
  expandedRowIds,
  renderExpandedRow,
  getExpandedRowHeight,
  columnGroupControl,
}: PropertyListingsTableProps) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [focusedCell, setFocusedCell] = useState<{
    row: number;
    col: number;
  } | null>(null);
  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  const resolvedPinning = useMemo<ColumnPinningState>(
    () => ({ left: ['_select', 'info', 'site', 'dong', 'unit', 'actions'], right: [] }),
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
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
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
    estimateSize: (index) => {
      const group = rows[index]?.original;
      const baseHeight = estimatePropertyGroupRowHeight(group);
      return expandedRowIds?.has(group?.id ?? '')
        ? baseHeight + (group ? (getExpandedRowHeight?.(group) ?? 160) : 160)
        : baseHeight;
    },
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 10,
  });

  const virtualRows = canVirtualize ? rowVirtualizer.getVirtualItems() : [];
  const totalVirtualSize = canVirtualize ? rowVirtualizer.getTotalSize() : 0;
  const paddingTop = canVirtualize && virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    canVirtualize && virtualRows.length > 0 ? totalVirtualSize - virtualRows[virtualRows.length - 1].end : 0;

  useEffect(() => {
    if (focusedCell === null) return;
    if (canVirtualize) {
      rowVirtualizer.scrollToIndex(focusedCell.row, { align: 'auto' });
      return;
    }
    if (!tableRef.current) return;
    const trs = tableRef.current.querySelectorAll('tbody tr[data-property-row="true"]');
    trs[focusedCell.row]?.scrollIntoView({ block: 'nearest' });
  }, [focusedCell, canVirtualize, rowVirtualizer]);

  useEffect(() => {
    if (!canVirtualize) return;
    rowVirtualizer.measure();
  }, [canVirtualize, expandedRowIds, getExpandedRowHeight, rowVirtualizer]);

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
          if (onRequestClose) {
            onRequestClose();
            break;
          }
          setFocusedCell(null);
          table.resetRowSelection();
          break;
        }
      }
    },
    [allColumns.length, focusedCell, onRequestClose, onRowClick, rows, table],
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

  const focusedRow = focusedCell !== null && rows[focusedCell.row]?.original ? rows[focusedCell.row].original : null;
  const tableTotalSize = table.getTotalSize();

  const growColumnId = table
    .getAllLeafColumns()
    .find((column) => (column.columnDef.meta as PropertyListingColumnMeta | undefined)?.grow)?.id;

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
      zIndex: PINNED_BODY_CELL_Z_INDEX,
    };
  };

  const renderRow = (row: (typeof rows)[number], rowIndex: number) => {
    const isExpanded = Boolean(renderExpandedRow) && Boolean(expandedRowIds?.has(row.original.id));

    return (
      <Fragment key={row.id}>
        <tr
          ref={canVirtualize && !isExpanded ? rowVirtualizer.measureElement : undefined}
          data-index={rowIndex}
          data-property-row="true"
          data-state={row.getIsSelected() ? 'selected' : undefined}
          className="group"
        >
          {row.getVisibleCells().map((cell, colIndex) => {
            const isLastCol = colIndex === row.getVisibleCells().length - 1;
            const isFocused = focusedCell?.row === rowIndex && focusedCell?.col === colIndex;
            const isRowFocused = focusedCell?.row === rowIndex;
            const isPinned = cell.column.getIsPinned() === 'left';
            const isLastPinned = isPinned && cell.column.getIsLastColumn('left');

            const columnMeta = cell.column.columnDef.meta as
              | PropertyListingColumnMeta | undefined;
            const shouldGrow = cell.column.id === growColumnId;

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
                  width: shouldGrow ? undefined : cell.column.getSize(),
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
        {isExpanded && (
          <tr data-expanded-row={row.original.id}>
            <td colSpan={allColumns.length} className="border-0 p-0 align-top">
              {renderExpandedRow?.(row.original)}
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={scrollerRef}
        data-property-table-scroller
        className="relative min-h-0 w-full flex-1 overflow-scroll bg-white outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
      >
        {columnGroupControl && (
          <div
            data-property-column-guide
            className="sticky top-0 z-40 h-9 border-b border-[#e7e5df] bg-[#f8f7f4]"
            style={{ width: "100%", minWidth: tableTotalSize }}
          >
            <div
              className="relative h-full pt-2"
              style={{ width: tableTotalSize, minWidth: tableTotalSize }}
            >
              {!columnGroupControl.collapsed && (
                <>
                  <span
                    aria-hidden="true"
                    data-column-group-line="property-details"
                    className="pointer-events-none absolute left-[482px] top-[18px] z-40 h-px w-[404px] bg-slate-400"
                  />
                  <span
                    aria-hidden="true"
                    data-column-group-cap="property-details"
                    className="pointer-events-none absolute left-[885px] top-[18px] z-40 h-2 w-px bg-slate-400"
                  />
                </>
              )}
              <button
                type="button"
                aria-label={
                  columnGroupControl.collapsed
                    ? "타입–확인 컬럼 펼치기"
                    : "타입–확인 컬럼 접기"
                }
                aria-expanded={!columnGroupControl.collapsed}
                title={
                  columnGroupControl.collapsed
                    ? "타입–확인 컬럼 펼치기"
                    : "타입–확인 컬럼 접기"
                }
                data-column-group-toggle="property-details"
                className="sticky left-[462px] z-50 ml-[462px] inline-flex size-5 items-center justify-center rounded-[3px] border border-[#9ba7a3] bg-white p-0 text-[#536b64] shadow-[0_1px_1px_rgba(42,51,47,0.05)] outline-none transition-colors hover:border-[#738b83] hover:bg-[#f4f8f6] hover:text-[#315d50] focus-visible:ring-2 focus-visible:ring-[#4c8c7c]/35"
                onClick={columnGroupControl.onToggle}
              >
                {columnGroupControl.collapsed ? (
                  <Plus className="size-3" />
                ) : (
                  <Minus className="size-3" />
                )}
              </button>
            </div>
          </div>
        )}
        <table
          ref={tableRef}
          className="w-full table-fixed border-separate border-spacing-0 caption-bottom text-sm"
          style={{ width: '100%', minWidth: tableTotalSize }}
        >
          <thead className={cn(
              "sticky z-20 bg-[#f7f7f5]",
              columnGroupControl ? "top-9" : "top-0",
            )}
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, colIndex) => {
                  const canSort =
                    header.column.columnDef.enableSorting !== false && !!onSortingChange && header.id !== '_select';
                  const activeSort = (sorting ?? [])[0];
                  const sorted: false | 'asc' | 'desc' =
                    activeSort?.id === header.column.id ? activeSort.desc ? 'desc' : 'asc'
                      : false;
                  const isLast = colIndex === headerGroup.headers.length - 1;
                  const isPinned = header.column.getIsPinned() === 'left';
                  const isLastPinned = isPinned && header.column.getIsLastColumn('left');
                  const shouldGrow = header.column.id === growColumnId;
                  const isDetailColumn = [
                    "unitType",
                    "exclusiveArea",
                    "matching",
                    "advertisement",
                    "confirmationAt",
                  ].includes(header.column.id);
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
                      aria-sort={
                        sorted === 'asc'
                          ? 'ascending'
                          : sorted === 'desc'
                            ? 'descending'
                            : canSort
                              ? 'none'
                              : undefined
                      }
                      className={cn(
                        "relative h-9 border-b border-[#d8d6d0] bg-[#f7f7f5] px-2.5 text-left align-middle text-[13px] font-medium normal-case tracking-normal text-muted-foreground",
                        !isLast && 'border-r border-r-[#eeeeec]',
                        canSort && 'select-none hover:text-foreground',
                        isDetailColumn && "bg-[#f2f6f4] text-[#52645e]",
                        isPinned && "bg-[#f5f4f1]",
                        isLastPinned && 'shadow-[1px_0_0_0_#d9d9d6]',
                      )}
                      style={{
                        width: shouldGrow ? undefined : header.getSize(),
                        ...(isPinned
                          ? {
                              position: 'sticky',
                              left: header.column.getStart('left'),
                              zIndex: 30,
                            }
                          : {}),
                      }}
                    >
                      <div className="flex h-full min-w-0 items-center gap-1 text-slate-500">
                        {canSort ? (
                          <button
                            type="button"
                            onClick={handleSortToggle}
                            className="-mx-1 flex h-full min-w-0 flex-1 items-center gap-1 rounded-sm px-1 text-left outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-[#4c8c7c]/35"
                          >
                            {header.isPlaceholder
                              ? null
                              : flexRender(
                                  header.column.columnDef.header,
                                  header.getContext(),
                                )}
                            {sorted === 'asc' && (
                              <ArrowUp aria-hidden="true" className="size-3 shrink-0" />
                            )}
                            {sorted === 'desc' && (
                              <ArrowDown aria-hidden="true" className="size-3 shrink-0" />
                            )}
                          </button>
                        ) : header.isPlaceholder ? null : (
                          flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )
                        )}
                      </div>
                      {header.column.getCanResize() && (
                        <div
                          onMouseDown={header.getResizeHandler()}
                          onTouchStart={header.getResizeHandler()}
                          className={cn(
                            'absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none',
                            header.column.getIsResizing() ? 'bg-primary' : 'bg-transparent hover:bg-border',
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
          <span className="font-medium text-slate-900">
            {selectedRows.length}개 호실 선택
          </span>
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
        <div className="flex min-h-7 items-center gap-2 border-t border-border/60 bg-[#faf9f6] px-3 text-[11px] text-muted-foreground">
          {renderStatusBar({ focusedRow, totalCount: totalCount || pageSize })}
        </div>
      )}
    </div>
  );
}

function estimatePropertyGroupRowHeight(group?: PropertyListingGroup) {
  return (
    Math.max(1, group?.listings.length ?? 1) * PROPERTY_LISTING_ITEM_HEIGHT
  );
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

import {
  Fragment,
  memo,
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
  type Cell,
  type ColumnDef,
  type ColumnPinningState,
  type ColumnResizeMode,
  type Row,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Minus, Plus } from 'lucide-react';
import type { ListingIntake, ListingIntakeListing } from '@estate-erp/api-client';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { CellTableNavigationProvider } from '@/components/data-table/cell-navigation';
import { movePropertyCell, resolvePropertyCell, type PropertyCellAddress, type PropertyCellDirection } from '../-property-cell-navigation';
import { PropertyListingCellProvider } from './property-listing-cell';
import { PropertyColumnMenu, propertyDetailColumnIds, propertyTableColumns } from './property-table-controls';
import { PROPERTY_LISTING_ITEM_HEIGHT } from '../-property-table-metrics';

const VIRTUALIZE_THRESHOLD = 50;
const END_REACHED_THRESHOLD = 320;
const PINNED_BODY_CELL_Z_INDEX = 10;
// 고정 열 경계선: 옅은 칸 테두리(#eeeeec) 바로 옆에 조금 진한 선(#e3e2df)을 붙여
// 광고노트 등 공용 표와 같은 두 줄 선으로 보이게 한다.
// 선(또는 접기 버튼)에 마우스를 올리면 선 전체에 5px 폭의 옅은 띠가 나타난다 —
// 머리글의 열 폭 조절 손잡이와 같은 방식이다. 띠는 ::after 로 그리고 누를 수 없다.
// 머리글과 행이 같은 클래스를 써서 위에서 아래까지 한 선으로 이어진다.
// 칸 테두리 1px만큼 띠 위치를 옮겨(-right-[4px]) 띠가 진한 선을 가운데로 덮게 한다.
const PINNED_EDGE_LINE_CLASS =
  "shadow-[1px_0_0_0_#e3e2df] after:pointer-events-none after:absolute after:inset-y-0 after:-right-[4px] after:z-[1] after:w-[5px] after:transition-colors after:content-[''] group-has-[[data-column-edge-hit]:hover]/ptable:after:bg-foreground/10 group-has-[[data-column-group-toggle]:hover]/ptable:after:bg-foreground/10";
// Overlay the 17px +/- control on the header boundary without a spacer row.
// 접기 버튼(16px)의 절반. 버튼 가운데가 고정 열 경계에 오도록 이만큼 왼쪽에서 시작한다.
const PROPERTY_DETAIL_GUIDE_TOGGLE_SIZE = 8;

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
  listingCell?: boolean;
  onCellClick?: (group: PropertyListingGroup, event: ReactMouseEvent<HTMLTableCellElement>) => void;
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
  | 'activeAdvertisements'
  | 'activeAdvertisementCount'
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
  columnVisibility?: VisibilityState;
  onColumnVisibilityChange?: (id: string, visible: boolean) => void;
  columnFilterActions?: Partial<Record<string, () => void>>;
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
  columnVisibility = {},
  onColumnVisibilityChange,
  columnFilterActions,
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
  const [selectedCell, setSelectedCell] = useState<PropertyCellAddress | null>(null);
  const [columnResizeMode] = useState<ColumnResizeMode>('onChange');
  const tableRef = useRef<HTMLTableElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || tableRef.current?.contains(target)) return;
      // Editors own dismissal, validation and pending saves. Their successful
      // outside close clears selection through cellNavigation.clear instead.
      if (tableRef.current?.querySelector('[data-property-row-id][data-column-id] [data-editing="true"]')) return;
      // Use the table boundary: the flex scroller also contains the blank area
      // below the final row. Row checkbox selection is deliberately independent.
      setSelectedCell(null);
    };
    document.addEventListener('click', handleOutsideClick, true);
    return () => document.removeEventListener('click', handleOutsideClick, true);
  }, []);

  const [resolvedPinning, setColumnPinning] = useState<ColumnPinningState>(
    () => ({ left: ['_select', 'info', 'site', 'dong', 'unit', 'supplyArea'], right: [] }),
  );
  const [wrappedColumns, setWrappedColumns] = useState<Record<string, boolean>>({});

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
      columnVisibility,
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
  const visibleColumns = table.getVisibleLeafColumns();
  const navigationRows = useMemo(() => rows.map((row) => row.original), [rows]);
  const navigationColumns = useMemo(() => visibleColumns.map((column) => ({
    id: column.id,
    listingCell: Boolean((column.columnDef.meta as PropertyListingColumnMeta | undefined)?.listingCell),
  })), [visibleColumns]);
  const movableColumns = useMemo(() => navigationColumns.filter((column) => column.id !== '_select'), [navigationColumns]);
  const navigationModelRef = useRef({ rows: navigationRows, columns: navigationColumns, movableColumns });
  navigationModelRef.current = { rows: navigationRows, columns: navigationColumns, movableColumns };
  const focusedCell = useMemo(() => {
    if (!selectedCell) return null;
    const cell = resolvePropertyCell(selectedCell, navigationRows, navigationColumns);
    if (!cell) return null;
    return {
      row: navigationRows.findIndex((row) => row.id === cell.rowId),
      col: navigationColumns.findIndex((column) => column.id === cell.columnId),
      listingId: cell.listingId,
    };
  }, [selectedCell, navigationRows, navigationColumns]);
  const moveSelection = useCallback((direction: PropertyCellDirection) => {
    setSelectedCell((previous) => {
      if (!navigationRows.length || !movableColumns.length) return null;
      const current = previous?.columnId !== '_select' && previous
        ? previous
        : { rowId: previous?.rowId ?? navigationRows[0].id, columnId: movableColumns[0].id };
      return movePropertyCell(current, navigationRows, movableColumns, previous ? direction : 'current');
    });
    // An idle editor must not keep DOM focus after the logical selection moves.
    scrollerRef.current?.focus({ preventScroll: true });
  }, [navigationRows, movableColumns]);
  const cellNavigation = useMemo(() => {
    const address = (trigger: HTMLElement, previous: PropertyCellAddress | null, recordId?: string): PropertyCellAddress | null => {
      const model = navigationModelRef.current;
      const cell = trigger.closest<HTMLElement>('[data-property-row-id][data-column-id]');
      const rowId = cell?.dataset.propertyRowId;
      const columnId = cell?.dataset.columnId;
      if (!rowId || !columnId) return null;
      const listingColumn = model.columns.find((column) => column.id === columnId)?.listingCell;
      const listingId = listingColumn
        ? trigger.closest<HTMLElement>('[data-listing-cell-id]')?.dataset.listingCellId ?? recordId
        : previous?.rowId === rowId ? previous.listingId : undefined;
      return resolvePropertyCell({ rowId, columnId, listingId }, model.rows, model.columns);
    };
    return {
      select: (trigger: HTMLElement, focusTable = false) => {
        setSelectedCell((previous) => address(trigger, previous));
        if (focusTable) scrollerRef.current?.focus({ preventScroll: true });
      },
      clear: (trigger: HTMLElement, recordId?: string) => {
        setSelectedCell((previous) => {
          const cell = address(trigger, previous, recordId);
          // An older async save must not clear a newer row, column or listing.
          return cell && previous?.rowId === cell.rowId &&
            previous.columnId === cell.columnId && previous.listingId === cell.listingId
            ? null
            : previous;
        });
      },
      finish: (trigger: HTMLElement, direction: 'current' | 'next' | 'previous' | 'down', recordId?: string) => {
        setSelectedCell((previous) => {
          const cell = address(trigger, previous, recordId);
          // A pending save can finish after a refresh, sort or virtual unmount.
          const model = navigationModelRef.current;
          return cell ? movePropertyCell(cell, model.rows, model.movableColumns, direction) : null;
        });
        scrollerRef.current?.focus({ preventScroll: true });
      },
    };
  }, []);
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
    }
    const frame = requestAnimationFrame(() => {
      const cell = tableRef.current?.querySelector<HTMLElement>(`td[data-table-row="${focusedCell.row}"][data-table-col="${focusedCell.col}"]`);
      const surface = focusedCell.listingId
        ? cell?.querySelector<HTMLElement>(`[data-listing-cell-id="${CSS.escape(focusedCell.listingId)}"]`) ?? cell
        : cell;
      surface?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    return () => cancelAnimationFrame(frame);
  }, [focusedCell, canVirtualize, rowVirtualizer]);

  useEffect(() => {
    if (!canVirtualize) return;
    rowVirtualizer.measure();
  }, [canVirtualize, expandedRowIds, getExpandedRowHeight, rowVirtualizer, wrappedColumns, columnVisibility]);

  // Hidden columns and disclosure changes must not leave focus on a different cell.
  useEffect(() => {
    if (selectedCell && !focusedCell) setSelectedCell(null);
  }, [selectedCell, focusedCell]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Menus, open buttons and editors own their keyboard interactions, including portals.
      if (e.defaultPrevented || e.nativeEvent.isComposing) return;
      const onIdleEditor = e.target instanceof Element && e.target.closest('[data-editable-cell-trigger]:not([data-editing])');
      if (e.target !== e.currentTarget && !onIdleEditor) return;
      if (rows.length === 0) return;
      switch (e.key) {
        case 'ArrowDown':
        case 'ArrowUp':
        case 'ArrowRight':
        case 'ArrowLeft': {
          e.preventDefault();
          moveSelection(e.key === 'ArrowDown' ? 'down' : e.key === 'ArrowUp' ? 'up' : e.key === 'ArrowRight' ? 'next' : 'previous');
          break;
        }
        case 'Tab': {
          if (!focusedCell) return;
          e.preventDefault();
          moveSelection(e.shiftKey ? 'previous' : 'next');
          break;
        }
        case 'Enter':
        case 'F2': {
          if (focusedCell !== null) {
            e.preventDefault();
            const cell = tableRef.current?.querySelector<HTMLElement>(`td[data-table-row="${focusedCell.row}"][data-table-col="${focusedCell.col}"]`);
            const listingColumn = navigationColumns[focusedCell.col]?.listingCell;
            const surface = listingColumn && focusedCell.listingId
              ? cell?.querySelector<HTMLElement>(`[data-listing-cell-id="${CSS.escape(focusedCell.listingId)}"]`)
              : cell;
            const trigger = surface?.querySelector<HTMLButtonElement>('[data-editable-cell-trigger]:not(:disabled)');
            if (trigger && !e.metaKey && !e.ctrlKey) {
              trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'F2', bubbles: true }));
              return;
            }
            const row = rows[focusedCell.row];
            if (row && e.key === 'Enter' && (!listingColumn || e.metaKey || e.ctrlKey)) onRowClick?.(row.original);
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
          setSelectedCell(null);
          table.resetRowSelection();
          break;
        }
      }
    },
    [focusedCell, onRequestClose, onRowClick, rows, table, moveSelection, navigationColumns],
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
  const leafColumns = table.getVisibleLeafColumns();
  const visibleColumnCount = leafColumns.length;
  // Pin a contiguous prefix so the +/- group remains in its original order.
  const propertyDetailGroupStart = leafColumns
    .filter((column) => ['_select', 'info', 'site', 'dong', 'unit', 'supplyArea'].includes(column.id))
    .reduce((width, column) => width + column.getSize(), 0);
  const propertyDetailToggleLeft = Math.max(
    0,
    propertyDetailGroupStart - PROPERTY_DETAIL_GUIDE_TOGGLE_SIZE,
  );

  const growColumnId = leafColumns.find(
    (column) =>
      (column.columnDef.meta as PropertyListingColumnMeta | undefined)?.grow,
  )?.id;

  const selectedRows = useMemo(
    () => rows.filter((row) => row.getIsSelected()).map((row) => row.original),
    // rowSelection을 의존성에 포함해 선택 변경 시 재계산되도록 한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, rowSelection],
  );

  // 줄은 PropertyTableRow가 기억해 둔다(아래). 그 줄에 넘기는 값이 그대로면 다시 그리지 않으므로,
  // 줄의 모양을 바꾸는 것은 모두 여기서 값으로 넘겨야 한다.
  // 칸의 넓이·고정 위치는 칸 객체에서 읽는데 그 객체는 넓이가 바뀌어도 같은 객체다. 그래서
  // 넓이·고정·순서를 한 줄 글로 만들어 넘긴다.
  const columnLayoutKey = leafColumns
    .map((column) => `${column.id}:${column.getSize()}:${column.getIsPinned() === 'left' ? column.getStart('left') : ''}`)
    .join('|');
  // 부모가 그릴 때마다 새로 만드는 함수는 ref로 받아, 줄에는 바뀌지 않는 함수만 넘긴다.
  const rowHandlersRef = useRef({ onRowClick, toggleColumnGroup: columnGroupControl?.onToggle });
  rowHandlersRef.current = { onRowClick, toggleColumnGroup: columnGroupControl?.onToggle };
  const openRow = useCallback((group: PropertyListingGroup) => rowHandlersRef.current.onRowClick?.(group), []);
  const toggleColumnGroup = useCallback(() => rowHandlersRef.current.toggleColumnGroup?.(), []);

  const renderRow = (row: (typeof rows)[number], rowIndex: number) => {
    const isExpanded = Boolean(renderExpandedRow) && Boolean(expandedRowIds?.has(row.original.id));
    const isRowFocused = focusedCell?.row === rowIndex;

    return (
      <PropertyTableRow
        key={row.id}
        row={row}
        rowIndex={rowIndex}
        cells={row.getVisibleCells()}
        columnLayoutKey={columnLayoutKey}
        isSelected={row.getIsSelected()}
        focusedCol={isRowFocused ? focusedCell.col : null}
        focusedListingId={isRowFocused ? focusedCell.listingId : undefined}
        wrappedColumns={wrappedColumns}
        growColumnId={growColumnId}
        measureElement={canVirtualize && !isExpanded ? rowVirtualizer.measureElement : undefined}
        expandedContent={isExpanded ? renderExpandedRow?.(row.original) : undefined}
        isExpanded={isExpanded}
        visibleColumnCount={visibleColumnCount}
        hasRowClick={Boolean(onRowClick)}
        columnGroupCollapsed={columnGroupControl?.collapsed}
        cellNavigation={cellNavigation}
        openRow={openRow}
        toggleColumnGroup={toggleColumnGroup}
      />
    );
  };

  return (
    <CellTableNavigationProvider value={cellNavigation}>
    <div
      // 접기 버튼이 표 위쪽 선에 반쯤 걸치도록 표 위에 버튼 높이의 절반(8px)을 비워 둔다.
      // 경계선이나 접기 버튼에 마우스를 올리면 선 전체에 옅은 띠가 뜨고 상자 테두리가 진해진다
      // (버튼이 스크롤 영역 밖에 있어서 묶음 기준을 이 바깥 상자에 둔다).
      className={cn(
        "relative flex h-full min-h-0 flex-col group/ptable [&:has([data-column-edge-hit]:hover)_[data-column-group-toggle]]:border-[#a3a09a]",
        columnGroupControl && "pt-2",
      )}
    >
      {columnGroupControl && (
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
          // 표 위쪽 선과 고정 열 경계선이 만나는 자리에 놓인 작은 +/− 상자.
          // 위 절반은 표 밖, 아래 절반은 머리글에 걸친다. 테두리가 경계선과 같은 색이라
          // 선이 상자 아래로 이어져 한 부품처럼 보인다.
          // 고정 열은 가로로 스크롤해도 제자리라서, 스크롤 영역 밖에 고정 위치로 둔다.
          // 매물 화면 공통의 '누르면 살짝 줄어드는' 효과는 끈다 (active:scale-100!).
          className="absolute top-0 z-50 inline-flex size-4 active:scale-100! shrink-0 items-center justify-center rounded-[4px] border border-[#cfcecb] bg-white p-0 text-[#8f8c86] outline-none transition-colors hover:border-[#a3a09a] hover:text-foreground focus-visible:ring-2 focus-visible:ring-foreground/20"
          // 경계선(1px)은 고정 열 바깥쪽에 그려지므로 0.5px 더해 선 가운데에 맞춘다.
          style={{ left: propertyDetailToggleLeft + 0.5 }}
          onClick={columnGroupControl.onToggle}
        >
          {columnGroupControl.collapsed ? (
            <Plus className="size-2.5" strokeWidth={2.25} />
          ) : (
            <Minus className="size-2.5" strokeWidth={2.25} />
          )}
        </button>
      )}
      <div
        ref={scrollerRef}
        data-property-table-scroller
        // overflow-auto: 넘칠 때만 스크롤바 자리를 둔다(scroll이면 Windows에서 빈 세로 띠가 늘 선다)
        className="relative min-h-0 w-full flex-1 overflow-auto bg-white outline-none [container-type:inline-size] focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onScroll={handleScroll}
      >
        <table
          ref={tableRef}
          className="w-full table-fixed border-separate border-spacing-0 caption-bottom text-sm"
          style={{ width: '100%', minWidth: tableTotalSize }}
        >
          <thead
            className="sticky top-0 z-20 bg-white"
          >
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header, headerIndex) => {
                  const isLastHeader =
                    headerIndex === headerGroup.headers.length - 1;
                  const canSort =
                    header.column.columnDef.enableSorting !== false && !!onSortingChange && header.id !== '_select';
                  const activeSort = (sorting ?? [])[0];
                  const sorted: false | 'asc' | 'desc' =
                    activeSort?.id === header.column.id ? activeSort.desc ? 'desc' : 'asc'
                      : false;
                  const isPinned = header.column.getIsPinned() === 'left';
                  const isLastPinned =
                    isPinned && header.column.getIsLastColumn('left');
                  const shouldGrow = header.column.id === growColumnId;


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
                      data-pinned-edge={isLastPinned || undefined}
                      className={cn(
                        "relative h-9 border-b border-t border-border bg-white px-2.5 text-left align-middle text-[13px] font-normal leading-[21px] normal-case tracking-normal text-muted-foreground transition-colors",
                        // 호버 색은 칸을 가득 채운 열 메뉴 버튼이 칠한다. 칸에 또 걸면 두 겹으로 보인다.
                        canSort && 'select-none',
                        sorted && "text-[#2c2c2b]",
                        // 칸 구분선: 아래 행과 같은 옅은 세로선. 고정 열의 끝은 경계선이 대신한다.
                        !isLastHeader && 'border-r border-r-[#eeeeec]',
                        isLastPinned && PINNED_EDGE_LINE_CLASS,
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
                      <div className="flex h-full min-w-0 items-center gap-1">
                        {header.id === '_select' ? (
                          flexRender(header.column.columnDef.header, header.getContext())
                        ) : (
                          <PropertyColumnMenu
                            id={header.column.id}
                            sorted={sorted}
                            onSort={canSort ? (direction) => onSortingChange?.(direction ? [{ id: header.column.id, desc: direction === 'desc' }] : []) : undefined}
                            onFilter={columnFilterActions?.[header.column.id]}
                            pinned={isPinned}
                            onPin={() => {
                              const ids = ['_select', ...propertyTableColumns.map((column) => column.field)];
                              setColumnPinning({ left: ids.slice(0, ids.indexOf(header.column.id) + 1), right: [] });
                            }}
                            onUnpin={() => setColumnPinning({ left: ['_select'], right: [] })}
                            onHide={header.column.id !== 'site' && onColumnVisibilityChange
                              ? () => { onColumnVisibilityChange(header.column.id, false); scrollerRef.current?.focus({ preventScroll: true }); }
                              : undefined}
                            wrapped={wrappedColumns[header.column.id] ?? false}
                            onWrap={['site', 'memo'].includes(header.column.id)
                              ? () => setWrappedColumns((previous) => ({ ...previous, [header.column.id]: !previous[header.column.id] }))
                              : undefined}
                          >
                            {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          </PropertyColumnMenu>
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
            {isLoading && <LoadingRows columns={visibleColumnCount} />}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={visibleColumnCount} className="h-32 p-0 text-center text-sm text-muted-foreground">
                  {/* 표가 화면보다 넓어도 문구가 보이는 폭 가운데에 오게 (펼친 줄과 같은 sticky 방식) */}
                  <div className="sticky left-0 flex min-h-32 w-[100cqw] items-center justify-center break-keep px-6 text-center">
                    {emptyMessage}
                  </div>
                </td>
              </tr>
            )}
            {!isLoading && rows.length > 0 && canVirtualize && virtualRows.length > 0 && (
              <>
                {paddingTop > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={visibleColumnCount} style={{ height: paddingTop, padding: 0, border: 0 }} />
                  </tr>
                )}
                {virtualRows.map((virtualRow) => renderRow(rows[virtualRow.index], virtualRow.index))}
                {paddingBottom > 0 && (
                  <tr aria-hidden="true">
                    <td colSpan={visibleColumnCount} style={{ height: paddingBottom, padding: 0, border: 0 }} />
                  </tr>
                )}
              </>
            )}
            {!isLoading && rows.length > 0 && (!canVirtualize || virtualRows.length === 0) && rows.map(renderRow)}
            {!isLoading && isLoadingMore && (
              <tr>
                <td colSpan={visibleColumnCount} className="h-10 px-3 text-center text-xs text-muted-foreground">
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
    </CellTableNavigationProvider>
  );
}

interface PropertyTableRowProps {
  row: Row<PropertyListingGroup>;
  rowIndex: number;
  /** row.getVisibleCells(). 칸 정의·숨김·고정이 바뀌면 새 배열이 온다. */
  cells: Cell<PropertyListingGroup, unknown>[];
  /** 칸의 넓이·고정 위치·순서를 적은 글. 이 값이 바뀌어야 넓이를 다시 읽는다. */
  columnLayoutKey: string;
  isSelected: boolean;
  /** 이 줄에 선택된 칸이 있으면 그 칸의 자리, 없으면 null. */
  focusedCol: number | null;
  focusedListingId: string | undefined;
  wrappedColumns: Record<string, boolean>;
  growColumnId: string | undefined;
  measureElement: ((node: Element | null) => void) | undefined;
  isExpanded: boolean;
  expandedContent: ReactNode;
  visibleColumnCount: number;
  hasRowClick: boolean;
  /** 타입–확인 칸 묶음이 접혔는지. 접기 손잡이가 없는 표는 undefined. */
  columnGroupCollapsed: boolean | undefined;
  cellNavigation: { select: (trigger: HTMLElement, focusTable?: boolean) => void };
  openRow: (group: PropertyListingGroup) => void;
  toggleColumnGroup: () => void;
}

/**
 * 매물 한 줄. 넘겨받은 값이 그대로면 다시 그리지 않는다(memo).
 *
 * 표는 스크롤할 때, 줄 높이가 바뀔 때(창 넓이를 바꿔 메모가 한 줄↔두 줄이 될 때),
 * 다른 줄의 칸을 고를 때마다 다시 그려진다. 그때마다 보이는 줄 전부와 그 안의 칸을
 * 다시 그리면 창 넓이를 바꾸는 동안 화면이 끊긴다.
 *
 * 펼친 줄은 기억하지 않는다. 펼친 내용은 부모가 그릴 때마다 새로 만들어 주는 것이라
 * 같은지 가릴 수 없다.
 */
const PropertyTableRow = memo(function PropertyTableRow({
  row,
  rowIndex,
  cells,
  isSelected,
  focusedCol,
  focusedListingId,
  wrappedColumns,
  growColumnId,
  measureElement,
  isExpanded,
  expandedContent,
  visibleColumnCount,
  hasRowClick,
  columnGroupCollapsed,
  cellNavigation,
  openRow,
  toggleColumnGroup,
}: PropertyTableRowProps) {
  const isRowFocused = focusedCol !== null;
  const rowHeight = estimatePropertyGroupRowHeight(row.original);

  return (
    <Fragment>
      <tr
        ref={measureElement}
        data-index={rowIndex}
        data-property-row="true"
        style={{ height: rowHeight }}
        data-state={isSelected ? 'selected' : undefined}
        className="group"
      >
        {cells.map((cell, colIndex) => {
          const isLastCol = colIndex === cells.length - 1;
          const isFocused = focusedCol === colIndex;
          const isPinned = cell.column.getIsPinned() === 'left';
          const isLastPinned = isPinned && cell.column.getIsLastColumn('left');

          const columnMeta = cell.column.columnDef.meta as
            | PropertyListingColumnMeta | undefined;
          const shouldGrow = cell.column.id === growColumnId;
          const hasListingCells = columnMeta?.listingCell && row.original.listings.length > 0;
          const hasSplitListingCells = hasListingCells && row.original.listings.length > 1;
          // A single listing uses the full td, whose height may come from another column.
          const isWholeCellFocused = isFocused && !hasSplitListingCells;

          return (
            <td
              key={cell.id}
              data-table-col={colIndex}
              data-table-row={rowIndex}
              data-column-id={cell.column.id}
              data-property-row-id={row.id}
              data-pinned-edge={isLastPinned || undefined}
              data-cell-selected={isWholeCellFocused || undefined}
              className={cn(
                'relative select-none align-middle border-b border-border px-2.5 text-[14px] font-[450] leading-[21px] text-foreground',
                !isLastCol && 'border-r border-r-[#eeeeec]',
                isLastPinned && PINNED_EDGE_LINE_CLASS,
                'group-hover:bg-muted/70',
                'group-data-[state=selected]:bg-primary/5',
                isWholeCellFocused && 'bg-blue-50/40 outline outline-2 -outline-offset-2 outline-[#2383e2]',
                isRowFocused && !isFocused && 'bg-muted',
                hasRowClick && 'cursor-default',
                isPinned && 'bg-white group-hover:bg-muted group-data-[state=selected]:bg-secondary',
                columnMeta?.cellClassName,
                wrappedColumns[cell.column.id] && 'py-1.5 [&_.truncate]:whitespace-normal [&_.truncate]:overflow-visible [&_.line-clamp-2]:line-clamp-none [&_span]:break-words',
              )}
              style={{
                // A definite td height lets h-full edit triggers fill the
                // cell; table layout still grows for wrapped text.
                height: rowHeight,
                width: shouldGrow ? undefined : cell.column.getSize(),
                ...(isPinned
                  ? {
                      position: 'sticky' as const,
                      left: cell.column.getStart('left'),
                      zIndex: PINNED_BODY_CELL_Z_INDEX,
                    }
                  : {}),
              }}
              onClick={(event) => {
                const surfaces = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-listing-cell-id]'));
                const nearest = surfaces.reduce<HTMLElement | null>((best, surface) => {
                  const distance = (element: HTMLElement) => {
                    const rect = element.getBoundingClientRect();
                    return Math.abs(event.clientY - (rect.top + rect.height / 2));
                  };
                  return !best || distance(surface) < distance(best) ? surface : best;
                }, null);
                cellNavigation.select(nearest ?? event.currentTarget, true);
                columnMeta?.onCellClick?.(row.original, event);
              }}
              onDoubleClick={(event) => {
                if (hasListingCells) return;
                cellNavigation.select(event.currentTarget, true);
                if (columnMeta?.onCellClick) return;
                if (hasRowClick) openRow(row.original);
              }}
            >
              <PropertyListingCellProvider value={{
                rowId: row.id,
                columnId: cell.column.id,
                rowIndex,
                columnIndex: colIndex,
                selectedListingId: isFocused && hasSplitListingCells ? focusedListingId : undefined,
              }}>
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </PropertyListingCellProvider>
              {isLastPinned && columnGroupCollapsed !== undefined && (
                // 경계선 전체가 접기/펼치기 손잡이다. 선을 가운데 둔 9px 띠를 누르면
                // 머리글의 버튼과 같은 동작을 한다. 키보드·스크린리더는 머리글 버튼을 쓴다.
                <span
                  data-column-edge-hit
                  aria-hidden="true"
                  title={
                    columnGroupCollapsed
                      ? '타입–확인 컬럼 펼치기'
                      : '타입–확인 컬럼 접기'
                  }
                  className="absolute -right-[5px] top-0 z-[2] h-full w-[9px] cursor-pointer"
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleColumnGroup();
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                />
              )}
            </td>
          );
        })}
      </tr>
      {isExpanded && (
        <tr data-expanded-row={row.original.id}>
          <td colSpan={visibleColumnCount} className="border-0 p-0 align-top">
            {/* Keep expanded content within the visible scroller width as columns scroll. */}
            <div className="sticky left-0 w-[100cqw]">
              {expandedContent}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}, arePropertyTableRowPropsEqual);

function arePropertyTableRowPropsEqual(previous: PropertyTableRowProps, next: PropertyTableRowProps) {
  // 펼친 줄은 늘 다시 그린다. 펼치지 않은 줄의 expandedContent는 늘 undefined라 아래 견주기에 걸리지 않는다.
  if (previous.isExpanded || next.isExpanded) return false;
  for (const key of Object.keys(next) as (keyof PropertyTableRowProps)[]) {
    if (!Object.is(previous[key], next[key])) return false;
  }
  return true;
}

function estimatePropertyGroupRowHeight(group?: PropertyListingGroup) {
  return (
    Math.max(1, group?.listings.length ?? 1) * PROPERTY_LISTING_ITEM_HEIGHT + 1
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
                'h-[37px] border-b border-border px-2.5 align-middle',
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

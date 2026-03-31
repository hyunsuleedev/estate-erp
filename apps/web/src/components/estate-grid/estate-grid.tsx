import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export type EstateGridSortDirection = 'asc' | 'desc';

export interface EstateGridSortState {
  columnId: string;
  direction: EstateGridSortDirection;
}

export interface EstateGridColumn<Row> {
  id: string;
  header: ReactNode;
  width: number;
  pinned?: 'left';
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  renderCell: (row: Row, rowIndex: number) => ReactNode;
}

interface EstateGridProps<Row extends { id: string }> {
  columns: EstateGridColumn<Row>[];
  rows: Row[];
  emptyMessage?: string;
  selectedRowId?: string | null;
  sort?: EstateGridSortState | null;
  onSortChange?: (sort: EstateGridSortState | null) => void;
  onRowOpen?: (row: Row) => void;
}

type ActiveCell = { row: number; col: number } | null;

function EstateGridInner<Row extends { id: string }>({
  columns,
  rows,
  emptyMessage = '데이터가 없습니다.',
  selectedRowId,
  sort,
  onSortChange,
  onRowOpen,
}: EstateGridProps<Row>) {
  const [activeCell, setActiveCell] = useState<ActiveCell>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const totalWidth = useMemo(
    () => columns.reduce((sum, column) => sum + column.width, 0),
    [columns],
  );

  const leftOffsets = useMemo(() => {
    let offset = 0;
    const next: Record<string, number> = {};

    for (const column of columns) {
      if (column.pinned === 'left') {
        next[column.id] = offset;
        offset += column.width;
      }
    }

    return next;
  }, [columns]);

  useEffect(() => {
    if (!activeCell || !containerRef.current) return;
    const selector = `[data-row-index="${activeCell.row}"][data-col-index="${activeCell.col}"]`;
    const cell = containerRef.current.querySelector<HTMLElement>(selector);
    cell?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeCell]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (rows.length === 0) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveCell((prev) => ({
          row: prev ? Math.min(rows.length - 1, prev.row + 1) : 0,
          col: prev?.col ?? 0,
        }));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveCell((prev) => ({
          row: prev ? Math.max(0, prev.row - 1) : 0,
          col: prev?.col ?? 0,
        }));
        break;
      case 'ArrowRight':
        event.preventDefault();
        setActiveCell((prev) => ({
          row: prev?.row ?? 0,
          col: prev ? Math.min(columns.length - 1, prev.col + 1) : 0,
        }));
        break;
      case 'ArrowLeft':
        event.preventDefault();
        setActiveCell((prev) => ({
          row: prev?.row ?? 0,
          col: prev ? Math.max(0, prev.col - 1) : 0,
        }));
        break;
      case 'Enter':
        if (activeCell) {
          event.preventDefault();
          const row = rows[activeCell.row];
          if (row) onRowOpen?.(row);
        }
        break;
      case 'Home':
        event.preventDefault();
        setActiveCell((prev) => ({ row: prev?.row ?? 0, col: 0 }));
        break;
      case 'End':
        event.preventDefault();
        setActiveCell((prev) => ({
          row: prev?.row ?? 0,
          col: Math.max(0, columns.length - 1),
        }));
        break;
      case 'Escape':
        event.preventDefault();
        setActiveCell(null);
        break;
    }
  };

  const handleSortToggle = (column: EstateGridColumn<Row>) => {
    if (!column.sortable) return;

    if (!sort || sort.columnId !== column.id) {
      onSortChange?.({ columnId: column.id, direction: 'asc' });
      return;
    }

    if (sort.direction === 'asc') {
      onSortChange?.({ columnId: column.id, direction: 'desc' });
      return;
    }

    onSortChange?.(null);
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="relative h-full overflow-auto outline-none"
    >
      <div className="min-w-max" style={{ minWidth: totalWidth }}>
        <div className="sticky top-0 z-20 flex border-b border-border/50 bg-background/95 backdrop-blur">
          {columns.map((column) => {
            const isPinned = column.pinned === 'left';
            const isSorted = sort?.columnId === column.id;
            return (
              <div
                key={column.id}
                className={cn(
                  'shrink-0 border-r border-border/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground',
                  isPinned && 'sticky z-30 bg-background/95 backdrop-blur',
                  column.align === 'center' && 'text-center',
                  column.align === 'right' && 'text-right',
                  column.sortable && 'cursor-pointer select-none hover:text-foreground',
                )}
                style={{
                  width: column.width,
                  left: isPinned ? leftOffsets[column.id] : undefined,
                }}
                onClick={() => handleSortToggle(column)}
              >
                <div
                  className={cn(
                    'flex items-center gap-1',
                    column.align === 'center' && 'justify-center',
                    column.align === 'right' && 'justify-end',
                  )}
                >
                  {column.header}
                  {isSorted && sort?.direction === 'asc' && <ArrowUp className="size-3" />}
                  {isSorted && sort?.direction === 'desc' && <ArrowDown className="size-3" />}
                </div>
              </div>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          rows.map((row, rowIndex) => {
            const isSelectedRow = selectedRowId === row.id;
            const isActiveRow = activeCell?.row === rowIndex;

            return (
              <div
                key={row.id}
                className={cn(
                  'group flex border-b border-border/30 hover:bg-accent/40',
                  isSelectedRow && 'bg-accent/60',
                  isActiveRow && 'bg-accent/50',
                )}
                onDoubleClick={() => onRowOpen?.(row)}
              >
                {columns.map((column, colIndex) => {
                  const isPinned = column.pinned === 'left';
                  const isActive = activeCell?.row === rowIndex && activeCell?.col === colIndex;

                  return (
                    <div
                      key={column.id}
                      data-row-index={rowIndex}
                      data-col-index={colIndex}
                      className={cn(
                        'shrink-0 border-r border-border/30 px-3 py-2 text-[13px] min-h-11 flex items-center',
                        isPinned && 'sticky z-10 bg-background group-hover:bg-accent/40',
                        isSelectedRow && isPinned && 'bg-accent/60',
                        isActive && 'ring-1 ring-inset ring-primary',
                        column.align === 'center' && 'justify-center text-center',
                        column.align === 'right' && 'justify-end text-right',
                      )}
                      style={{
                        width: column.width,
                        left: isPinned ? leftOffsets[column.id] : undefined,
                      }}
                      onClick={() => setActiveCell({ row: rowIndex, col: colIndex })}
                    >
                      {column.renderCell(row, rowIndex)}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export const EstateGrid = memo(EstateGridInner) as <Row extends { id: string }>(
  props: EstateGridProps<Row>,
) => ReactNode;

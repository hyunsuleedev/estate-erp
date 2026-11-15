import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Check, RotateCcw, X } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type PanelTableColumn<C extends string> = { id: C; label: string; width: number; minWidth: number };
export type PanelColumnWidths<C extends string> = Partial<Record<C, number>>;
export type PanelTableSort<S extends string> = { column: S; direction: "asc" | "desc" } | null;
export const panelTableMenuClass =
  "w-56 rounded-[10px] [&_[role=menuitem]]:min-h-7 [&_[role=menuitem]]:py-1 [&_[role=menuitem]]:text-[13px]";

// Shared by linked buyers and advertisements: menu, pointer capture, cancellation,
// measured-width resizing, keyboard increments and reset all follow one contract.
export function PropertyPanelColumnHeader<C extends string, S extends string>({
  column,
  columns,
  table,
  clampWidth,
  maxWidth,
  sortOptions,
  icon,
  sort,
  onSort,
  onPreviewResize,
  onCommitResize,
  onResetWidth,
}: {
  column: PanelTableColumn<C>;
  columns: readonly PanelTableColumn<C>[];
  table: "match" | "ad";
  clampWidth: (id: C, width: number) => number;
  maxWidth: number;
  sortOptions: readonly { column: S; label: string }[];
  icon: ReactNode;
  sort: PanelTableSort<S>;
  onSort: (sort: PanelTableSort<S>) => void;
  onPreviewResize: (widths: PanelColumnWidths<C> | null) => void;
  onCommitResize: (widths: PanelColumnWidths<C>) => void;
  onResetWidth: (column: C) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    widths: PanelColumnWidths<C>;
    pointerId: number;
  } | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const [resizing, setResizing] = useState(false);
  const [actualWidth, setActualWidth] = useState<number>(column.width);
  const sorted = sortOptions.some((option) => option.column === sort?.column);
  const measuredWidths = (element: HTMLElement): PanelColumnWidths<C> => {
    const header = element.closest(`[data-property-${table}-header]`);
    const widths: PanelColumnWidths<C> = {};
    for (const item of columns) {
      const cell = header?.querySelector<HTMLElement>(`[data-${table}-column="${item.id}"]`);
      widths[item.id] = clampWidth(item.id, cell?.getBoundingClientRect().width ?? item.width);
    }
    return widths;
  };

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setActualWidth(Math.round(element.getBoundingClientRect().width)),
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      cleanup.current?.();
    };
  }, []);

  const finish = () => {
    drag.current = null;
    cleanup.current?.();
    cleanup.current = null;
    setResizing(false);
    onPreviewResize(null);
  };
  const resized = (clientX: number) => {
    const start = drag.current!;
    return {
      ...start.widths,
      [column.id]: clampWidth(
        column.id,
        start.widths[column.id]! + clientX - start.x,
      ),
    };
  };

  return (
    <div
      ref={root}
      role="columnheader"
      aria-sort={
        sorted
          ? sort?.direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
      data-match-column={table === "match" ? column.id : undefined}
      data-ad-column={table === "ad" ? column.id : undefined}
      className="relative h-full min-w-0"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`${column.label} 열 메뉴`}
            className="flex h-full w-full min-w-0 items-center gap-1.5 rounded-sm px-2.5 text-left outline-none hover:bg-foreground/[0.05] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2383e2]/50 data-[state=open]:bg-foreground/[0.05]"
          >
            <span
              aria-hidden="true"
              className="shrink-0 [&>svg]:size-4 [&>svg]:text-[#8e8b86]"
            >
              {icon}
            </span>
            <span className="truncate">{column.label}</span>
            {sorted &&
              (sort?.direction === "asc" ? (
                <ArrowUp className="size-3 shrink-0 text-[#2383e2]" />
              ) : (
                <ArrowDown className="size-3 shrink-0 text-[#2383e2]" />
              ))}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={0}
          className={panelTableMenuClass}
          onKeyDown={(event) => event.stopPropagation()}
        >
          {sortOptions.map((option, index) => (
            <Fragment key={option.column}>
              {index > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="text-xs text-muted-foreground">{option.label}</DropdownMenuLabel>
              {(["asc", "desc"] as const).map((direction) => (
                <DropdownMenuItem
                  key={direction}
                  aria-label={`${option.label} ${direction === "asc" ? "오름차순" : "내림차순"} 정렬`}
                  onSelect={() => onSort({ column: option.column, direction })}
                >
                  {direction === "asc" ? <ArrowUp /> : <ArrowDown />}
                  {direction === "asc" ? "오름차순 정렬" : "내림차순 정렬"}
                  {sort?.column === option.column && sort.direction === direction && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </Fragment>
          ))}
          {sorted && (
            <DropdownMenuItem onSelect={() => onSort(null)}>
              <X />
              정렬 해제
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onResetWidth(column.id)}>
            <RotateCcw />이 열 기본 너비
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <div
        role="separator"
        tabIndex={0}
        aria-label={`${column.label} 열 너비 조절`}
        aria-orientation="vertical"
        aria-valuemin={column.minWidth}
        aria-valuemax={maxWidth}
        aria-valuenow={actualWidth}
        aria-valuetext={`${actualWidth}px`}
        title="드래그로 너비 조절 · 방향키로 미세 조절 · 더블클릭으로 기본 너비"
        data-match-resize={table === "match" ? column.id : undefined}
        data-ad-resize={table === "ad" ? column.id : undefined}
        data-resizing={resizing || undefined}
        className={cn(
          "absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize touch-none select-none outline-none after:absolute after:inset-y-0 after:left-[3px] after:w-0.5 hover:after:bg-[#2383e2]/70 focus-visible:after:bg-[#2383e2] focus-visible:ring-1 focus-visible:ring-[#2383e2]",
          resizing && "after:bg-[#2383e2]",
        )}
        onClick={(event) => event.stopPropagation()}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onResetWidth(column.id);
        }}
        onPointerDown={(event) => {
          if (event.button !== 0 || drag.current) return;
          event.preventDefault();
          event.stopPropagation();
          const element = event.currentTarget;
          element.focus({ preventScroll: true });
          element.setPointerCapture(event.pointerId);
          drag.current = {
            x: event.clientX,
            widths: measuredWidths(element),
            pointerId: event.pointerId,
          };
          setResizing(true);
          const onEscape = (key: KeyboardEvent) => {
            if (key.key !== "Escape") return;
            key.preventDefault();
            key.stopPropagation();
            finish();
          };
          const onBlur = () => finish();
          window.addEventListener("keydown", onEscape, true);
          window.addEventListener("blur", onBlur);
          cleanup.current = () => {
            window.removeEventListener("keydown", onEscape, true);
            window.removeEventListener("blur", onBlur);
          };
        }}
        onPointerMove={(event) => {
          if (!drag.current || event.pointerId !== drag.current.pointerId)
            return;
          event.stopPropagation();
          onPreviewResize(resized(event.clientX));
        }}
        onPointerUp={(event) => {
          if (!drag.current || event.pointerId !== drag.current.pointerId)
            return;
          event.stopPropagation();
          if (Math.abs(event.clientX - drag.current.x) >= 2)
            onCommitResize(resized(event.clientX));
          finish();
        }}
        onPointerCancel={finish}
        onLostPointerCapture={() => {
          if (drag.current) finish();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (
            !["ArrowLeft", "ArrowRight", "Home"].includes(event.key) ||
            drag.current
          )
            return;
          event.preventDefault();
          if (event.key === "Home") {
            onResetWidth(column.id);
            return;
          }
          const widths = measuredWidths(event.currentTarget);
          const step =
            (event.shiftKey ? 24 : 8) * (event.key === "ArrowLeft" ? -1 : 1);
          onCommitResize({
            ...widths,
            [column.id]: clampWidth(
              column.id,
              widths[column.id]! + step,
            ),
          });
        }}
      />
    </div>
  );
}


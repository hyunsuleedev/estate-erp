import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  RotateCcw,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  clampMatchColumnWidth,
  matchSortLabels,
  matchTableColumns,
  MAX_MATCH_COLUMN_WIDTH,
  type MatchColumnId,
  type MatchColumnWidths,
  type MatchTableSort,
} from "./property-match-table-state";

const menuClass =
  "w-56 rounded-[10px] [&_[role=menuitem]]:min-h-7 [&_[role=menuitem]]:py-1 [&_[role=menuitem]]:text-[13px]";

function SortItems({
  column,
  sort,
  onSort,
}: {
  column: NonNullable<MatchTableSort>["column"];
  sort: MatchTableSort;
  onSort: (sort: MatchTableSort) => void;
}) {
  return (
    <>
      {(["asc", "desc"] as const).map((direction) => (
        <DropdownMenuItem
          key={direction}
          aria-label={`${matchSortLabels[column]} ${direction === "asc" ? "오름차순" : "내림차순"} 정렬`}
          onSelect={() => onSort({ column, direction })}
        >
          {direction === "asc" ? <ArrowUp /> : <ArrowDown />}
          {direction === "asc" ? "오름차순 정렬" : "내림차순 정렬"}
          {sort?.column === column && sort.direction === direction && (
            <Check className="ml-auto size-3.5" />
          )}
        </DropdownMenuItem>
      ))}
    </>
  );
}

function measuredWidths(element: HTMLElement): MatchColumnWidths {
  const header = element.closest("[data-property-match-header]");
  const widths: MatchColumnWidths = {};
  for (const column of matchTableColumns) {
    const cell = header?.querySelector<HTMLElement>(
      `[data-match-column="${column.id}"]`,
    );
    widths[column.id] = clampMatchColumnWidth(
      column.id,
      cell?.getBoundingClientRect().width ?? column.width,
    );
  }
  return widths;
}

export function MatchTableColumnHeader({
  column,
  icon,
  sort,
  onSort,
  onPreviewResize,
  onCommitResize,
  onResetWidth,
}: {
  column: (typeof matchTableColumns)[number];
  icon: ReactNode;
  sort: MatchTableSort;
  onSort: (sort: MatchTableSort) => void;
  onPreviewResize: (widths: MatchColumnWidths | null) => void;
  onCommitResize: (widths: MatchColumnWidths) => void;
  onResetWidth: (column: MatchColumnId) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    x: number;
    widths: MatchColumnWidths;
    pointerId: number;
  } | null>(null);
  const cleanup = useRef<(() => void) | null>(null);
  const [resizing, setResizing] = useState(false);
  const [actualWidth, setActualWidth] = useState<number>(column.width);
  const sorted =
    sort?.column === column.id ||
    (column.id === "budget" && sort?.column === "monthlyRent");

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
      [column.id]: clampMatchColumnWidth(
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
      data-match-column={column.id}
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
          className={menuClass}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {column.id === "budget"
              ? "가격·보증금 상한 기준"
              : column.id === "area"
                ? "희망 면적 상한 기준"
                : column.label}
          </DropdownMenuLabel>
          <SortItems column={column.id} sort={sort} onSort={onSort} />
          {column.id === "budget" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                월세 상한 기준
              </DropdownMenuLabel>
              <SortItems column="monthlyRent" sort={sort} onSort={onSort} />
            </>
          )}
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
        aria-valuemax={MAX_MATCH_COLUMN_WIDTH}
        aria-valuenow={actualWidth}
        aria-valuetext={`${actualWidth}px`}
        title="드래그로 너비 조절 · 방향키로 미세 조절 · 더블클릭으로 기본 너비"
        data-match-resize={column.id}
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
            [column.id]: clampMatchColumnWidth(
              column.id,
              widths[column.id]! + step,
            ),
          });
        }}
      />
    </div>
  );
}

export function MatchTableSortControl({
  sort,
  onSort,
  onResetWidths,
}: {
  sort: MatchTableSort;
  onSort: (sort: MatchTableSort) => void;
  onResetWidths: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="구매고객 정렬 설정"
          className={cn(
            "inline-flex h-[26px] items-center gap-1 rounded-full px-2 text-xs outline-none hover:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring",
            sort ? "bg-info-soft/50 text-info-strong" : "text-muted-foreground",
          )}
        >
          {sort ? (
            sort.direction === "asc" ? (
              <ArrowUp className="size-3" />
            ) : (
              <ArrowDown className="size-3" />
            )
          ) : (
            <ArrowUpDown className="size-3" />
          )}
          {sort ? matchSortLabels[sort.column] : "정렬"}
          <ChevronDown className="size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className={menuClass}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          거래 진행·종료 그룹 안에서 정렬
        </DropdownMenuLabel>
        {sort && (
          <DropdownMenuLabel className="text-xs">
            {matchSortLabels[sort.column]} ·{" "}
            {sort.direction === "asc" ? "오름차순" : "내림차순"}
          </DropdownMenuLabel>
        )}
        <DropdownMenuItem
          onSelect={() => onSort({ column: "need", direction: "desc" })}
        >
          <ArrowDown />
          오래 머문 순
          {sort?.column === "need" && <Check className="ml-auto size-3.5" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onSort({ column: "stage", direction: "desc" })}
        >
          <ArrowDown />
          진행 단계순
          {sort?.column === "stage" && sort.direction === "desc" && (
            <Check className="ml-auto size-3.5" />
          )}
        </DropdownMenuItem>
        {sort && (
          <DropdownMenuItem onSelect={() => onSort(null)}>
            <X />
            정렬 해제
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onResetWidths}>
          <RotateCcw />
          모든 열 기본 너비
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

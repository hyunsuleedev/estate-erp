import type { ReactNode } from "react";
import { PropertyPanelColumnHeader } from "./property-panel-table-controls";
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

export function MatchTableColumnHeader({ column, ...props }: {
  column: (typeof matchTableColumns)[number];
  icon: ReactNode;
  sort: MatchTableSort;
  onSort: (sort: MatchTableSort) => void;
  onPreviewResize: (widths: MatchColumnWidths | null) => void;
  onCommitResize: (widths: MatchColumnWidths) => void;
  onResetWidth: (column: MatchColumnId) => void;
}) {
  return <PropertyPanelColumnHeader
    {...props}
    column={column}
    columns={matchTableColumns}
    table="match"
    clampWidth={clampMatchColumnWidth}
    maxWidth={MAX_MATCH_COLUMN_WIDTH}
    sortOptions={column.id === "budget" ? [
      { column: "budget", label: matchSortLabels.budget },
      { column: "monthlyRent", label: matchSortLabels.monthlyRent },
    ] : [{ column: column.id, label: matchSortLabels[column.id] }]}
  />;
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
          aria-label="고객 정렬 설정"
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

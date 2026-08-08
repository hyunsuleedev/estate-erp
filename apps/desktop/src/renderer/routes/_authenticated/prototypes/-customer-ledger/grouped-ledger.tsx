import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { DataTable } from "../../../../components/data-table";
import { cn } from "../../../../lib/utils";
import {
  CustomerNameCell,
  DisclosureButton,
  LedgerHeader,
  LedgerStatusBar,
  LedgerToolbar,
  ModeCell,
  ReadinessCell,
  type LedgerModeFilter,
} from "./ledger-parts";
import { DependencyDiagram } from "./dependency-diagram";
import {
  CUSTOMER_LEDGER_ROWS,
  formatLedgerPrice,
  getLedgerIntentLines,
  includesLedgerQuery,
  sortLedgerIntentGroups,
  type CustomerLedgerRow,
  type LedgerIntentLine,
} from "./prototype-data";

export function GroupedLedger() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<LedgerModeFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "lastContactAt", desc: true },
  ]);
  const [expandedRowIds, setExpandedRowIds] = useState<ReadonlySet<string>>(
    () => new Set(["customer-han"]),
  );

  const toggleRow = useCallback((id: string) => {
    setExpandedRowIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const visibleRows = useMemo(
    () =>
      sortLedgerIntentGroups(
        CUSTOMER_LEDGER_ROWS.filter(
          (row) =>
            (mode === "all" || row.mode === mode) &&
            includesLedgerQuery(row, query),
        ),
        sorting,
      ),
    [mode, query, sorting],
  );

  const visibleIntentCount = useMemo(
    () =>
      visibleRows.reduce(
        (total, row) => total + getLedgerIntentLines(row).length,
        0,
      ),
    [visibleRows],
  );

  const columns = useMemo<ColumnDef<CustomerLedgerRow, unknown>[]>(
    () => [
      {
        id: "customer",
        header: "고객",
        size: 104,
        enableSorting: true,
        cell: ({ row }) => <CustomerNameCell row={row.original} />,
      },
      {
        id: "phone",
        header: "전화번호",
        size: 116,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-[11px] tabular-nums text-slate-600">
            {row.original.phone}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">상세</span>,
        size: 40,
        minSize: 40,
        maxSize: 40,
        enableResizing: false,
        enableSorting: false,
        meta: { cellClassName: "px-1" },
        cell: ({ row }) => (
          <DisclosureButton
            row={row.original}
            open={expandedRowIds.has(row.original.id)}
            onToggle={toggleRow}
          />
        ),
      },
      {
        id: "mode",
        header: "고객유형",
        size: 76,
        enableSorting: true,
        cell: ({ row }) => <ModeCell mode={row.original.mode} />,
      },
      {
        id: "intentCount",
        header: "요건",
        size: 82,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <IntentLinesCell row={row.original}>
            {(line) => <IntentKindCell line={line} />}
          </IntentLinesCell>
        ),
      },
      {
        id: "transactionType",
        header: "거래",
        size: 62,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <IntentLinesCell row={row.original}>
            {(line) => <TransactionTypeCell value={line.transactionType} />}
          </IntentLinesCell>
        ),
      },
      {
        id: "intentRole",
        header: "역할",
        size: 58,
        enableSorting: false,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <IntentLinesCell row={row.original}>
            {(line) => (
              <span
                className={cn(
                  "text-[10px] font-medium",
                  line.kind === "demand" ? "text-slate-600" : "text-success",
                )}
              >
                {line.roleLabel}
              </span>
            )}
          </IntentLinesCell>
        ),
      },
      {
        id: "budgetMin",
        header: "최소예산",
        size: 82,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <IntentLinesCell row={row.original}>
            {(line) => <NumberText value={formatLedgerPrice(line.budgetMin)} />}
          </IntentLinesCell>
        ),
      },
      {
        id: "budgetMax",
        header: "최대예산",
        size: 82,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <IntentLinesCell row={row.original}>
            {(line) => <NumberText value={formatLedgerPrice(line.budgetMax)} />}
          </IntentLinesCell>
        ),
      },
      {
        id: "supplyPrice",
        header: "내놓은가격",
        size: 96,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <IntentLinesCell row={row.original}>
            {(line) => (
              <NumberText value={formatLedgerPrice(line.askingPrice)} />
            )}
          </IntentLinesCell>
        ),
      },
      {
        id: "preferredRegion",
        header: "지역·물건",
        size: 178,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <IntentLinesCell row={row.original}>
            {(line) => (
              <span
                className="block truncate text-[10px] text-slate-700"
                title={line.locationLabel}
              >
                {line.locationLabel}
              </span>
            )}
          </IntentLinesCell>
        ),
      },
      {
        id: "area",
        header: "공급평형",
        size: 82,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <IntentLinesCell row={row.original}>
            {(line) => <NumberText value={line.areaLabel} />}
          </IntentLinesCell>
        ),
      },
      {
        id: "matchCount",
        header: "매칭·상태",
        size: 94,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <IntentLinesCell row={row.original}>
            {(line) => <IntentStateCell line={line} />}
          </IntentLinesCell>
        ),
      },
      {
        id: "readiness",
        header: "준비상태",
        size: 94,
        enableSorting: true,
        cell: ({ row }) => <ReadinessCell row={row.original} />,
      },
      {
        id: "nextAction",
        header: "다음 액션",
        size: 180,
        enableSorting: true,
        meta: { fill: true },
        cell: ({ row }) => (
          <span className="block truncate text-[11px] font-medium text-slate-800">
            {row.original.nextAction}
          </span>
        ),
      },
      {
        id: "nextActionAt",
        header: "액션일",
        size: 78,
        enableSorting: true,
        cell: ({ row }) => (
          <span
            className={cn(
              "text-[11px] tabular-nums",
              row.original.nextActionDue === "오늘"
                ? "font-semibold text-destructive"
                : "text-slate-600",
            )}
          >
            {row.original.nextActionDue}
          </span>
        ),
      },
      {
        id: "lastContactAt",
        header: "최근 연락",
        size: 84,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-[11px] tabular-nums text-slate-600">
            {row.original.lastContact}
          </span>
        ),
      },
      {
        id: "assignee",
        header: "담당",
        size: 70,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="block truncate text-[11px] text-slate-600">
            {row.original.assignee}
          </span>
        ),
      },
    ],
    [expandedRowIds, toggleRow],
  );

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <LedgerHeader
        title="고객 원장"
        badge="복수 요건"
        description="고객 공통 정보는 한 번만 표시하고, 매매·전세·내놓은 물건은 각각 독립된 하위 행으로 정규화합니다."
      />
      <LedgerToolbar
        query={query}
        onQueryChange={setQuery}
        mode={mode}
        onModeChange={setMode}
        sorting={sorting}
        onSortingClear={() => setSorting([])}
        trailing={
          <span className="ml-1 text-[10px] text-muted-foreground">
            고객 {visibleRows.length}명 · 요건 {visibleIntentCount}개
          </span>
        }
      />

      <section className="flex min-h-0 flex-1 flex-col bg-white pb-16">
        <DataTable
          columns={columns}
          data={visibleRows}
          totalCount={visibleRows.length}
          sorting={sorting}
          onSortingChange={setSorting}
          layout="full-height"
          variant="notion"
          rowHeight={40}
          pinnedColumns={["customer", "phone", "actions"]}
          activateOnDoubleClick
          onRowClick={(row) => toggleRow(row.id)}
          expandedRowIds={expandedRowIds}
          renderExpandedRow={(row) => <DependencyDiagram row={row} />}
          renderStatusBar={() => (
            <LedgerStatusBar
              visible={visibleRows.length}
              sorting={sorting}
              message={`요건 ${visibleIntentCount}개 · 가격 정렬은 고객별 하위 요건 값 기준`}
            />
          )}
          emptyMessage="조건에 맞는 고객이 없습니다."
        />
      </section>
    </main>
  );
}

function IntentLinesCell({
  row,
  children,
}: {
  row: CustomerLedgerRow;
  children: (line: LedgerIntentLine) => ReactNode;
}) {
  const lines = getLedgerIntentLines(row);
  return (
    <div
      className="divide-y divide-[#eeeeec]"
      data-customer-intent-lines={row.id}
    >
      {lines.map((line) => (
        <div
          key={line.id}
          className="flex h-8 min-w-0 items-center px-2.5"
          data-ledger-intent-cell-line={line.id}
        >
          {children(line)}
        </div>
      ))}
    </div>
  );
}

function IntentKindCell({ line }: { line: LedgerIntentLine }) {
  const label = line.kind === "demand" ? "구함" : "내놓음";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-semibold",
        line.kind === "demand" ? "text-info-strong" : "text-success",
      )}
      aria-label={`${label} ${line.ordinal}`}
    >
      <span
        className={cn(
          "size-1.5 rounded-full",
          line.kind === "demand" ? "bg-info" : "bg-success",
        )}
      />
      {label} {line.ordinal}
    </span>
  );
}

function TransactionTypeCell({
  value,
}: {
  value: LedgerIntentLine["transactionType"];
}) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[9px] font-semibold",
        value === "매매"
          ? "bg-[#fdebec] text-[#8f4b46]"
          : value === "전세"
            ? "bg-[#e7f3f8] text-[#337ea9]"
            : "bg-[#fbf3db] text-[#8f6b1f]",
      )}
    >
      {value}
    </span>
  );
}

function IntentStateCell({ line }: { line: LedgerIntentLine }) {
  if (line.kind === "demand") {
    return (
      <span className="inline-flex min-w-7 justify-center rounded bg-info-soft px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-info-strong">
        {line.matchCount}건
      </span>
    );
  }

  return (
    <span className="block truncate text-[9px] font-medium text-success">
      {line.stateLabel}
    </span>
  );
}

function NumberText({ value }: { value: string }) {
  return (
    <span className="text-[10px] font-medium tabular-nums text-slate-700">
      {value}
    </span>
  );
}

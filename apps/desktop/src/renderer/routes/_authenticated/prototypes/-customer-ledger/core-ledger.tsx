import { useCallback, useMemo, useState } from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { cn } from "../../../../lib/utils";
import { DataTable } from "../../../../components/data-table";
import {
  CustomerNameCell,
  DemandTypeSummary,
  DisclosureButton,
  ExpandedLedgerRecord,
  LedgerHeader,
  LedgerStatusBar,
  LedgerToolbar,
  ModeCell,
  ReadinessCell,
  formatActionDate,
  formatArea,
  type LedgerModeFilter,
} from "./ledger-parts";
import {
  CUSTOMER_LEDGER_ROWS,
  formatLedgerPrice,
  includesLedgerQuery,
  sortLedgerRows,
  type CustomerLedgerRow,
} from "./prototype-data";

export function CoreLedger() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<LedgerModeFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "lastContactAt", desc: true },
  ]);
  const [expandedRowIds, setExpandedRowIds] = useState<ReadonlySet<string>>(
    () => new Set(["customer-kang"]),
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
      sortLedgerRows(
        CUSTOMER_LEDGER_ROWS.filter(
          (row) =>
            (mode === "all" || row.mode === mode) &&
            includesLedgerQuery(row, query),
        ),
        sorting,
      ),
    [mode, query, sorting],
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
            label="상세"
          />
        ),
      },
      {
        id: "mode",
        header: "유형",
        size: 72,
        enableSorting: true,
        cell: ({ row }) => <ModeCell mode={row.original.mode} />,
      },
      {
        id: "demandTypes",
        header: "구하는 방식",
        size: 112,
        enableSorting: true,
        cell: ({ row }) => <DemandTypeSummary row={row.original} />,
      },
      {
        id: "budgetMin",
        header: "주안 최소",
        size: 84,
        enableSorting: true,
        cell: ({ row }) => (
          <NumberCell value={formatLedgerPrice(row.original.budgetMin)} />
        ),
      },
      {
        id: "budgetMax",
        header: "주안 최대",
        size: 84,
        enableSorting: true,
        cell: ({ row }) => (
          <NumberCell value={formatLedgerPrice(row.original.budgetMax)} />
        ),
      },
      {
        id: "preferredRegion",
        header: "희망지역",
        size: 126,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="block truncate text-[11px] text-slate-700">
            {row.original.preferredRegion}
          </span>
        ),
      },
      {
        id: "area",
        header: "공급평형",
        size: 78,
        enableSorting: true,
        cell: ({ row }) => <NumberCell value={formatArea(row.original)} />,
      },
      {
        id: "supplyCount",
        header: "내놓은 물건",
        size: 90,
        enableSorting: true,
        cell: ({ row }) => (
          <DisclosureButton
            row={row.original}
            open={expandedRowIds.has(row.original.id)}
            onToggle={toggleRow}
            label="내놓은 물건"
            count={row.original.supplyCount}
          />
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
        size: 76,
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
            {formatActionDate(row.original)}
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
        badge="핵심 컬럼"
        description="거래 대안은 모두 표시하고, 가격·지역·평형은 주안 조건을 기준으로 정렬합니다."
      />
      <LedgerToolbar
        query={query}
        onQueryChange={setQuery}
        mode={mode}
        onModeChange={setMode}
        sorting={sorting}
        onSortingClear={() => setSorting([])}
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
          renderExpandedRow={(row) => <ExpandedLedgerRecord row={row} />}
          renderStatusBar={() => (
            <LedgerStatusBar
              visible={visibleRows.length}
              sorting={sorting}
              message="더블클릭 또는 상세 버튼으로 모든 요건 보기"
            />
          )}
          emptyMessage="조건에 맞는 고객이 없습니다."
        />
      </section>
    </main>
  );
}

function NumberCell({ value }: { value: string }) {
  return (
    <span className="text-[11px] font-medium tabular-nums text-slate-700">
      {value}
    </span>
  );
}

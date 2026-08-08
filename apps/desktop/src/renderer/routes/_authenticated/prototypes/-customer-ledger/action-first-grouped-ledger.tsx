import { Link } from "@tanstack/react-router";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { ArrowRight, BookUser } from "lucide-react";
import { DataTable } from "../../../../components/data-table";
import { cn } from "../../../../lib/utils";
import { READINESS_META } from "../-customer-management/prototype-data";
import { DependencyDiagram } from "./dependency-diagram";
import {
  DisclosureButton,
  LedgerStatusBar,
  LedgerToolbar,
  type LedgerModeFilter,
} from "./ledger-parts";
import {
  CUSTOMER_LEDGER_ROWS,
  formatLedgerMonthlyRent,
  formatLedgerPrice,
  getLedgerIntentLines,
  includesLedgerQuery,
  sortLedgerIntentGroups,
  type CustomerLedgerRow,
  type LedgerIntentLine,
} from "./prototype-data";

const MERGED_INTENT_COLUMN_IDS = [
  "intentCount",
  "budgetMin",
  "budgetMax",
  "supplyPrice",
  "monthlyRentMin",
  "monthlyRentMax",
  "areaMin",
  "areaMax",
] as const;

const MONTHLY_RENT_RANGE_COLUMN_IDS = [
  "monthlyRentMin",
  "monthlyRentMax",
] as const;

const AREA_RANGE_COLUMN_IDS = ["areaMin", "areaMax"] as const;

const INTENT_VIRTUAL_ROW_HEIGHT = 36;

export function BrokerDecisionLedger() {
  const pageRef = useRef<HTMLElement | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<LedgerModeFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "readiness", desc: false },
  ]);
  const [expandedRowIds, setExpandedRowIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const toggleRow = useCallback(
    (id: string) => {
      const opening = !expandedRowIds.has(id);
      if (opening) {
        const scroller =
          pageRef.current?.querySelector<HTMLDivElement>('div[tabindex="0"]');
        if (scroller) scroller.scrollLeft = 0;
      }

      setExpandedRowIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [expandedRowIds],
  );

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
        size: 100,
        enableSorting: true,
        meta: {
          cellClassName:
            "isolate bg-white group-hover:bg-slate-50 group-data-[state=selected]:bg-blue-50",
        },
        cell: ({ row }) => <PriorityCustomerCell row={row.original} />,
      },
      {
        id: "phone",
        header: "전화번호",
        size: 112,
        enableSorting: true,
        meta: {
          cellClassName:
            "isolate bg-white group-hover:bg-slate-50 group-data-[state=selected]:bg-blue-50",
        },
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-[12.5px] tabular-nums text-slate-600">
            {row.original.phone}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <span className="sr-only">상세</span>,
        size: 36,
        minSize: 36,
        maxSize: 36,
        enableResizing: false,
        enableSorting: false,
        meta: {
          cellClassName:
            "isolate bg-white px-1 group-hover:bg-slate-50 group-data-[state=selected]:bg-blue-50",
        },
        cell: ({ row }) => (
          <DisclosureButton
            row={row.original}
            open={expandedRowIds.has(row.original.id)}
            onToggle={toggleRow}
          />
        ),
      },
      {
        id: "intentCount",
        header: "거래 요건",
        size: 146,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row, table }) => (
          <IntentLinesCell
            row={row.original}
            mergedIntentColumnsWidth={MERGED_INTENT_COLUMN_IDS.reduce(
              (width, columnId) =>
                width + (table.getColumn(columnId)?.getSize() ?? 0),
              0,
            )}
          >
            {(line) => <IntentSummaryCell line={line} />}
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
            {(line) => (
              <AmountCell
                value={line.kind === "demand" ? line.budgetMin : null}
              />
            )}
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
            {(line) => (
              <AmountCell
                value={line.kind === "demand" ? line.budgetMax : null}
              />
            )}
          </IntentLinesCell>
        ),
      },
      {
        id: "supplyPrice",
        header: "매매가·보증금",
        size: 110,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <IntentLinesCell row={row.original}>
            {(line) => (
              <AmountCell
                value={line.kind === "supply" ? line.askingPrice : null}
              />
            )}
          </IntentLinesCell>
        ),
      },
      {
        id: "monthlyRentMin",
        header: "최소월세",
        size: 72,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row, table }) => (
          <IntentLinesCell row={row.original}>
            {(line, index) =>
              line.kind === "supply" ? (
                <MergedSupplyMonthlyRentCell
                  rowIndex={index}
                  value={line.monthlyRentMin}
                  width={MONTHLY_RENT_RANGE_COLUMN_IDS.reduce(
                    (total, columnId) =>
                      total + (table.getColumn(columnId)?.getSize() ?? 0),
                    0,
                  )}
                />
              ) : (
                <MonthlyRentCell value={line.monthlyRentMin} />
              )
            }
          </IntentLinesCell>
        ),
      },
      {
        id: "monthlyRentMax",
        header: "최대월세",
        size: 72,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <IntentLinesCell row={row.original}>
            {(line) =>
              line.kind === "demand" ? (
                <MonthlyRentCell value={line.monthlyRentMax} />
              ) : null
            }
          </IntentLinesCell>
        ),
      },
      {
        id: "areaMin",
        header: "최소평형",
        size: 72,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row, table }) => (
          <IntentLinesCell row={row.original}>
            {(line, index) =>
              line.kind === "supply" ? (
                <MergedSupplyAreaCell
                  rowIndex={index}
                  value={line.areaMinPyeong}
                  width={AREA_RANGE_COLUMN_IDS.reduce(
                    (total, columnId) =>
                      total + (table.getColumn(columnId)?.getSize() ?? 0),
                    0,
                  )}
                />
              ) : (
                <PyeongCell value={line.areaMinPyeong} />
              )
            }
          </IntentLinesCell>
        ),
      },
      {
        id: "areaMax",
        header: "최대평형",
        size: 72,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <IntentLinesCell row={row.original}>
            {(line) =>
              line.kind === "demand" ? (
                <PyeongCell value={line.areaMaxPyeong} />
              ) : null
            }
          </IntentLinesCell>
        ),
      },
      {
        id: "matchCount",
        header: "매칭·상태",
        size: 118,
        enableSorting: true,
        meta: { cellClassName: "px-0" },
        cell: ({ row }) => (
          <IntentLinesCell row={row.original}>
            {(line) => <ProgressCell line={line} />}
          </IntentLinesCell>
        ),
      },
      {
        id: "readiness",
        header: "준비상태",
        size: 94,
        enableSorting: true,
        cell: ({ row }) => <PriorityReadinessCell row={row.original} />,
      },
      {
        id: "assignee",
        header: "담당",
        size: 70,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="block truncate text-[13px] text-slate-600">
            {row.original.assignee}
          </span>
        ),
      },
      {
        id: "nextActionAt",
        header: "액션일",
        size: 80,
        enableSorting: true,
        cell: ({ row }) => (
          <span
            className={cn(
              "text-[13px] font-medium tabular-nums",
              row.original.nextActionDue === "오늘"
                ? "text-destructive"
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
        size: 96,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-[13px] tabular-nums text-slate-600">
            {row.original.lastContact}
          </span>
        ),
      },
    ],
    [expandedRowIds, toggleRow],
  );

  return (
    <main
      ref={pageRef}
      className="broker-decision-ledger flex h-full min-h-0 flex-col overflow-hidden bg-white"
    >
      <BrokerDecisionHeader />
      <LedgerToolbar
        query={query}
        onQueryChange={setQuery}
        mode={mode}
        onModeChange={setMode}
        sorting={sorting}
        onSortingClear={() => setSorting([])}
        trailing={
          <span className="ml-1 text-[11.5px] text-muted-foreground">
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
              message="비교값은 위 · 선호지역과 매물은 요건 아래"
            />
          )}
          emptyMessage="조건에 맞는 고객이 없습니다."
        />
      </section>
    </main>
  );
}

function BrokerDecisionHeader() {
  const demandCount = CUSTOMER_LEDGER_ROWS.reduce(
    (total, row) => total + row.demandCount,
    0,
  );
  const supplyCount = CUSTOMER_LEDGER_ROWS.reduce(
    (total, row) => total + row.supplyCount,
    0,
  );
  const reviewCount = CUSTOMER_LEDGER_ROWS.filter(
    (row) => row.readiness === "review",
  ).length;

  return (
    <header className="flex h-[68px] shrink-0 items-center gap-5 border-b bg-white px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-[-0.02em]">
            고객 원장
          </h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            중개 판단
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          예산·보증금·월세·면적은 비교하고, 선호지역과 매물은 각 요건 아래에서
          봅니다.
        </p>
      </div>

      <div className="ml-auto flex items-center divide-x rounded-md border bg-white">
        <HeaderMetric label="고객" value={CUSTOMER_LEDGER_ROWS.length} />
        <HeaderMetric label="구함 요건" value={demandCount} tone="info" />
        <HeaderMetric label="내놓은 물건" value={supplyCount} tone="success" />
        <HeaderMetric label="확인 필요" value={reviewCount} tone="warning" />
      </div>

      <Link
        to="/contacts"
        className="group inline-flex h-8 shrink-0 items-center gap-2 rounded-md border bg-white px-2.5 text-xs text-muted-foreground outline-none transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
      >
        <BookUser className="size-3.5" aria-hidden="true" />
        전체 연락처
        <ArrowRight
          className="size-3 transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
    </header>
  );
}

function HeaderMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "info" | "success" | "warning";
}) {
  return (
    <span className="flex h-9 min-w-[82px] items-center gap-2 px-3">
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
      <strong
        className={cn(
          "ml-auto text-sm font-semibold tabular-nums",
          tone === "info" && "text-info-strong",
          tone === "success" && "text-success",
          tone === "warning" && "text-warning-strong",
        )}
      >
        {value}
      </strong>
    </span>
  );
}

function PriorityCustomerCell({ row }: { row: CustomerLedgerRow }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#f1f1ef] text-[11px] font-semibold text-[#55534e]">
        {row.name.slice(0, 1)}
      </span>
      <strong className="truncate text-[13px] font-semibold text-slate-900">
        {row.name}
      </strong>
    </div>
  );
}

function PriorityReadinessCell({ row }: { row: CustomerLedgerRow }) {
  const meta = READINESS_META[row.readiness];
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
      <span className={cn("size-2 rounded-full", meta.dotClassName)} />
      {meta.label}
    </span>
  );
}

function IntentLinesCell({
  row,
  children,
  mergedIntentColumnsWidth,
}: {
  row: CustomerLedgerRow;
  children: (line: LedgerIntentLine, index: number) => ReactNode;
  mergedIntentColumnsWidth?: number;
}) {
  const lines = getLedgerIntentLines(row);

  return (
    <div className="relative" data-broker-decision-intent-lines={row.id}>
      <div>
        {lines.map((line, index) => {
          return (
            <div key={line.id}>
              <div
                className="flex min-w-0 items-center px-2"
                data-broker-decision-intent-line={line.id}
                style={{ height: INTENT_VIRTUAL_ROW_HEIGHT }}
              >
                {children(line, index)}
              </div>

              {mergedIntentColumnsWidth && (
                <div
                  className="broker-decision-intent-context-cell"
                  data-broker-decision-intent-context-cell={line.id}
                  style={{
                    top:
                      index * (INTENT_VIRTUAL_ROW_HEIGHT * 2) +
                      INTENT_VIRTUAL_ROW_HEIGHT,
                    height: INTENT_VIRTUAL_ROW_HEIGHT,
                    width: mergedIntentColumnsWidth,
                  }}
                >
                  <IntentContextCell line={line} />
                </div>
              )}

              <div
                aria-hidden="true"
                className="bg-[#faf9f6] shadow-[inset_0_1px_#eeeeec,inset_0_-1px_#eeeeec]"
                data-broker-decision-intent-context-cell-slot={line.id}
                style={{ height: INTENT_VIRTUAL_ROW_HEIGHT }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IntentContextCell({ line }: { line: LedgerIntentLine }) {
  const isDemand = line.kind === "demand";

  return (
    <div className="flex h-full min-w-0 items-center gap-2 px-2">
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 text-[11.5px] font-semibold",
          isDemand ? "text-info-strong" : "text-success",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "size-1.5 rounded-full",
            isDemand ? "bg-info" : "bg-success",
          )}
        />
        {isDemand ? "선호" : "매물"}
      </span>

      <span
        className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-slate-700"
        title={line.locationLabel}
      >
        {line.locationLabel}
      </span>

      <span aria-hidden="true" className="h-3 w-px shrink-0 bg-[#deddd9]" />
      <span
        className="max-w-[170px] shrink-0 truncate text-[11.5px] text-muted-foreground"
        title={line.timingLabel}
      >
        {line.timingLabel}
      </span>
    </div>
  );
}

function IntentSummaryCell({ line }: { line: LedgerIntentLine }) {
  const isDemand = line.kind === "demand";
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold",
          isDemand ? "text-info-strong" : "text-success",
        )}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            isDemand ? "bg-info" : "bg-success",
          )}
        />
        {isDemand ? "구함" : "내놓음"} {line.ordinal}
      </span>
      <span
        className={cn(
          "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium",
          line.transactionType === "매매"
            ? "bg-destructive-soft text-[#8f4b46]"
            : line.transactionType === "전세"
              ? "bg-info-soft text-info-strong"
              : "bg-warning-soft text-warning-strong",
        )}
      >
        {line.transactionType}
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {line.roleLabel}
      </span>
    </div>
  );
}

function ProgressCell({ line }: { line: LedgerIntentLine }) {
  const needsReview = line.stateLabel === "확인 필요";
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded px-2 py-0.5 text-xs font-medium",
        line.kind === "demand"
          ? "bg-info-soft text-info-strong"
          : needsReview
            ? "bg-warning-soft text-warning-strong"
            : "bg-success-soft text-success",
      )}
    >
      <span className="truncate">
        {line.kind === "demand" ? `매칭 ${line.matchCount}건` : line.stateLabel}
      </span>
    </span>
  );
}

function AmountCell({ value }: { value: number | null }) {
  return (
    <span className="ml-auto whitespace-nowrap text-right text-[12.5px] font-medium tabular-nums text-slate-700">
      {formatLedgerPrice(value)}
    </span>
  );
}

function MonthlyRentCell({ value }: { value: number | null }) {
  return (
    <span className="ml-auto whitespace-nowrap text-right text-[12.5px] font-medium tabular-nums text-slate-700">
      {formatLedgerMonthlyRent(value)}
    </span>
  );
}

function PyeongCell({ value }: { value: number | null }) {
  return (
    <span className="ml-auto whitespace-nowrap text-right text-[12.5px] font-medium tabular-nums text-slate-700">
      {value === null ? "—" : `${value}평`}
    </span>
  );
}

function MergedSupplyAreaCell({
  rowIndex,
  value,
  width,
}: {
  rowIndex: number;
  value: number | null;
  width: number;
}) {
  return (
    <span
      className="absolute left-0 z-[2] flex items-center justify-end bg-white px-2 text-[12.5px] font-medium tabular-nums text-slate-700 group-hover:bg-slate-50 group-data-[state=selected]:bg-blue-50"
      data-broker-decision-supply-area-cell=""
      style={{
        top: rowIndex * (INTENT_VIRTUAL_ROW_HEIGHT * 2),
        height: INTENT_VIRTUAL_ROW_HEIGHT,
        width,
      }}
    >
      {value === null ? "—" : `${value}평`}
    </span>
  );
}

function MergedSupplyMonthlyRentCell({
  rowIndex,
  value,
  width,
}: {
  rowIndex: number;
  value: number | null;
  width: number;
}) {
  return (
    <span
      className="absolute left-0 z-[2] flex items-center justify-end bg-white px-2 text-[12.5px] font-medium tabular-nums text-slate-700 group-hover:bg-slate-50 group-data-[state=selected]:bg-blue-50"
      data-broker-decision-supply-monthly-rent-cell=""
      style={{
        top: rowIndex * (INTENT_VIRTUAL_ROW_HEIGHT * 2),
        height: INTENT_VIRTUAL_ROW_HEIGHT,
        width,
      }}
    >
      {formatLedgerMonthlyRent(value)}
    </span>
  );
}

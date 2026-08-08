import { useMemo, useState } from "react";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import { ArrowRight, Check, CircleAlert, Phone, Target, X } from "lucide-react";
import { DataTable } from "../../../../components/data-table";
import { cn } from "../../../../lib/utils";
import {
  CustomerNameCell,
  DemandTypeSummary,
  LedgerHeader,
  LedgerStatusBar,
  LedgerToolbar,
  ModeCell,
  ReadinessCell,
  type LedgerModeFilter,
} from "./ledger-parts";
import {
  CUSTOMER_LEDGER_ROWS,
  includesLedgerQuery,
  sortLedgerRows,
  type CustomerLedgerRow,
} from "./prototype-data";

type ActionFilter = "all" | "today" | "review";

const ACTION_FILTERS: Array<{ value: ActionFilter; label: string }> = [
  { value: "all", label: "전체 업무" },
  { value: "today", label: "오늘" },
  { value: "review", label: "확인 필요" },
];

export function ActionLedger() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<LedgerModeFilter>("all");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("all");
  const [sorting, setSorting] = useState<SortingState>([
    { id: "nextActionAt", desc: false },
  ]);
  const [selectedId, setSelectedId] = useState<string | null>("customer-kang");
  const [completedIds, setCompletedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const visibleRows = useMemo(
    () =>
      sortLedgerRows(
        CUSTOMER_LEDGER_ROWS.filter((row) => {
          const actionMatches =
            actionFilter === "all" ||
            (actionFilter === "today" && row.nextActionDue === "오늘") ||
            (actionFilter === "review" && row.readiness === "review");
          return (
            actionMatches &&
            (mode === "all" || row.mode === mode) &&
            includesLedgerQuery(row, query)
          );
        }),
        sorting,
      ),
    [actionFilter, mode, query, sorting],
  );

  const selected =
    visibleRows.find((row) => row.id === selectedId) ??
    (selectedId ? visibleRows[0] : null) ??
    null;

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
        id: "mode",
        header: "유형",
        size: 72,
        enableSorting: true,
        cell: ({ row }) => <ModeCell mode={row.original.mode} />,
      },
      {
        id: "nextAction",
        header: "다음 액션",
        size: 210,
        enableSorting: true,
        meta: { fill: true },
        cell: ({ row }) => (
          <span
            className={cn(
              "block truncate text-[11px] font-medium",
              completedIds.has(row.original.id)
                ? "text-muted-foreground line-through"
                : "text-slate-800",
            )}
          >
            {row.original.nextAction}
          </span>
        ),
      },
      {
        id: "nextActionAt",
        header: "액션일",
        size: 82,
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
        id: "readiness",
        header: "준비상태",
        size: 94,
        enableSorting: true,
        cell: ({ row }) => <ReadinessCell row={row.original} />,
      },
      {
        id: "unresolvedStepCount",
        header: "미완료",
        size: 66,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="inline-flex min-w-6 justify-center rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
            {row.original.unresolvedStepCount}
          </span>
        ),
      },
      {
        id: "demandTypes",
        header: "구하는 방식",
        size: 108,
        enableSorting: true,
        cell: ({ row }) => <DemandTypeSummary row={row.original} />,
      },
      {
        id: "supplyCount",
        header: "내놓음",
        size: 64,
        enableSorting: true,
        cell: ({ row }) => (
          <span className="text-[11px] font-semibold tabular-nums text-success">
            {row.original.supplyCount}
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
    [completedIds],
  );

  function toggleCompleted(id: string) {
    setCompletedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <LedgerHeader
        title="고객 원장"
        badge="후속업무 우선"
        description="거래 조건보다 오늘 할 일을 먼저 정렬하고, 선택한 고객의 연결 맥락은 우측에서 확인합니다."
      />
      <LedgerToolbar
        query={query}
        onQueryChange={setQuery}
        mode={mode}
        onModeChange={setMode}
        sorting={sorting}
        onSortingClear={() => setSorting([])}
        trailing={
          <div
            className="ml-1 flex items-center rounded-md border border-border/70 bg-white p-0.5"
            aria-label="후속업무 필터"
          >
            {ACTION_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setActionFilter(item.value)}
                className={cn(
                  "h-7 rounded px-2.5 text-[10px] font-medium transition-colors",
                  actionFilter === item.value
                    ? "bg-[#f1f0ed] text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 pb-16">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
          <DataTable
            columns={columns}
            data={visibleRows}
            totalCount={visibleRows.length}
            sorting={sorting}
            onSortingChange={setSorting}
            layout="full-height"
            variant="notion"
            rowHeight={40}
            pinnedColumns={["customer", "phone"]}
            onRowClick={(row) => setSelectedId(row.id)}
            renderStatusBar={() => (
              <LedgerStatusBar
                visible={visibleRows.length}
                sorting={sorting}
                message="행을 눌러 고객 연결 맥락 확인"
              />
            )}
            emptyMessage="조건에 맞는 후속업무가 없습니다."
          />
        </section>

        {selected && (
          <ActionInspector
            row={selected}
            completed={completedIds.has(selected.id)}
            onToggleCompleted={() => toggleCompleted(selected.id)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </main>
  );
}

function ActionInspector({
  row,
  completed,
  onToggleCompleted,
  onClose,
}: {
  row: CustomerLedgerRow;
  completed: boolean;
  onToggleCompleted: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="flex w-[360px] shrink-0 flex-col border-l bg-[#fbfbfa] shadow-[-8px_0_20px_rgba(0,0,0,0.035)]">
      <header className="flex items-start gap-3 border-b bg-white px-4 py-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#f1f1ef] text-xs font-bold">
          {row.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{row.name}</h2>
          <p className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
            <Phone className="size-3" aria-hidden="true" /> {row.phone} · 담당{" "}
            {row.assignee}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="고객 상세 닫기"
          className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-4 py-3 pb-20">
        <section className="border-b py-3 first:pt-0">
          <p className="text-[9px] font-medium text-muted-foreground">
            현재 상황
          </p>
          <p className="mt-1.5 text-[11px] font-semibold">
            {row.source.currentSituation}
          </p>
        </section>

        <section className="border-b py-3">
          <InspectorTitle
            title="구하는 조건"
            count={row.demandCount}
            tone="info"
          />
          {row.source.demands.length > 0 ? (
            <div className="mt-2 divide-y">
              {row.source.demands.map((demand) => (
                <div key={demand.id} className="py-2 text-[10px]">
                  <p className="flex items-center gap-2 font-semibold">
                    <Target
                      className="size-3 text-info-strong"
                      aria-hidden="true"
                    />
                    {demand.transactionType} {demand.priceLabel}
                    <span className="ml-auto text-[9px] font-normal text-muted-foreground">
                      {demand.role}
                    </span>
                  </p>
                  <p className="mt-1 truncate text-muted-foreground">
                    {demand.regions} · {demand.areaLabel}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-muted-foreground">
              구하는 조건 없음
            </p>
          )}
        </section>

        <section className="border-b py-3">
          <InspectorTitle
            title="내놓은 물건"
            count={row.supplyCount}
            tone="success"
          />
          {row.source.supplies.length > 0 ? (
            <div className="mt-2 divide-y">
              {row.source.supplies.map((supply) => (
                <div key={supply.id} className="py-2 text-[10px]">
                  <p className="truncate font-semibold">
                    {supply.propertyLabel}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-muted-foreground">
                    <span>
                      {supply.transactionType} {supply.priceLabel}
                    </span>
                    <span className="ml-auto">{supply.state}</span>
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-muted-foreground">
              내놓은 물건 없음
            </p>
          )}
        </section>

        <section className="py-3">
          <InspectorTitle title="선행 조건" count={row.source.steps.length} />
          <div className="mt-2 divide-y">
            {row.source.steps.map((step) => (
              <div key={step.id} className="py-2 text-[10px]">
                <p className="flex items-center gap-2">
                  <span className="font-semibold">{step.label}</span>
                  <span className="ml-auto text-muted-foreground">
                    {step.requiredBefore}
                  </span>
                </p>
                <p className="mt-1 text-muted-foreground">{step.detail}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <footer className="shrink-0 border-t bg-white p-3">
        <p className="flex items-center text-[9px] text-muted-foreground">
          다음 액션
          <span
            className={cn(
              "ml-auto font-semibold",
              row.nextActionDue === "오늘"
                ? "text-destructive"
                : "text-foreground",
            )}
          >
            {row.nextActionDue}
          </span>
        </p>
        <p
          className={cn(
            "mt-1.5 text-[11px] font-semibold",
            completed && "text-muted-foreground line-through",
          )}
        >
          {row.nextAction}
        </p>
        <button
          type="button"
          onClick={onToggleCompleted}
          className={cn(
            "mt-3 flex h-9 w-full items-center justify-center gap-1.5 rounded-md text-[11px] font-semibold transition-colors",
            completed
              ? "bg-success-soft text-success hover:bg-success-soft/70"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {completed ? (
            <>
              <Check className="size-3.5" aria-hidden="true" /> 완료됨 · 다시
              열기
            </>
          ) : (
            <>
              완료 처리 <ArrowRight className="size-3.5" aria-hidden="true" />
            </>
          )}
        </button>
      </footer>
    </aside>
  );
}

function InspectorTitle({
  title,
  count,
  tone,
}: {
  title: string;
  count: number;
  tone?: "info" | "success";
}) {
  return (
    <h3 className="flex items-center gap-1.5 text-[10px] font-semibold">
      {tone ? (
        <span
          className={cn(
            "size-2 rounded-full",
            tone === "info" ? "bg-info" : "bg-success",
          )}
        />
      ) : (
        <CircleAlert
          className="size-3 text-muted-foreground"
          aria-hidden="true"
        />
      )}
      {title}
      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold tabular-nums text-muted-foreground">
        {count}
      </span>
    </h3>
  );
}

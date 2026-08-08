import { Link } from "@tanstack/react-router";
import type { SortingState } from "@tanstack/react-table";
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  BookUser,
  ChevronDown,
  Search,
  X,
} from "lucide-react";
import { cn } from "../../../../lib/utils";
import { Button } from "../../../../components/ui/button";
import {
  READINESS_META,
  STEP_META,
  type CustomerMode,
} from "../-customer-management/prototype-data";
import {
  CUSTOMER_LEDGER_ROWS,
  LEDGER_SORT_LABELS,
  formatLedgerArea,
  type CustomerLedgerRow,
} from "./prototype-data";

export type LedgerModeFilter = "all" | CustomerMode;

const MODE_META: Record<
  CustomerMode,
  { label: string; className: string; dotClassName: string }
> = {
  demand: {
    label: "구함",
    className: "bg-info-soft text-info-strong",
    dotClassName: "bg-info",
  },
  both: {
    label: "양쪽",
    className: "bg-violet-soft text-violet",
    dotClassName: "bg-violet",
  },
  supply: {
    label: "내놓음",
    className: "bg-success-soft text-success",
    dotClassName: "bg-success",
  },
};

const MODE_FILTERS: Array<{ value: LedgerModeFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "demand", label: "구함" },
  { value: "both", label: "양쪽" },
  { value: "supply", label: "내놓음" },
];

export function LedgerHeader({
  title,
  badge,
  description,
}: {
  title: string;
  badge: string;
  description: string;
}) {
  const demandCount = CUSTOMER_LEDGER_ROWS.reduce(
    (total, row) => total + row.demandCount,
    0,
  );
  const supplyCount = CUSTOMER_LEDGER_ROWS.reduce(
    (total, row) => total + row.supplyCount,
    0,
  );

  return (
    <header className="flex h-[68px] shrink-0 items-center gap-5 border-b bg-white px-5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-[-0.02em]">{title}</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {badge}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="ml-auto flex items-center divide-x rounded-md border bg-white">
        <HeaderMetric label="고객" value={CUSTOMER_LEDGER_ROWS.length} />
        <HeaderMetric label="구하는 조건" value={demandCount} tone="info" />
        <HeaderMetric label="내놓은 물건" value={supplyCount} tone="success" />
      </div>

      <Link
        to="/contacts"
        className="group inline-flex h-8 shrink-0 items-center gap-2 rounded-md border bg-white px-2.5 text-[11px] text-muted-foreground outline-none transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
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
  tone?: "info" | "success";
}) {
  return (
    <span className="flex h-9 min-w-[92px] items-center gap-2 px-3">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <strong
        className={cn(
          "ml-auto text-sm font-semibold tabular-nums",
          tone === "info" && "text-info-strong",
          tone === "success" && "text-success",
        )}
      >
        {value}
      </strong>
    </span>
  );
}

export function LedgerToolbar({
  query,
  onQueryChange,
  mode,
  onModeChange,
  sorting,
  onSortingClear,
  trailing,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  mode: LedgerModeFilter;
  onModeChange: (value: LedgerModeFilter) => void;
  sorting: SortingState;
  onSortingClear: () => void;
  trailing?: React.ReactNode;
}) {
  const activeSort = sorting[0];

  return (
    <section className="flex h-[48px] shrink-0 items-center gap-2 border-b bg-[#faf9f6] px-3">
      <label className="relative block w-[260px] shrink-0">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="고객, 전화번호, 지역, 물건 검색"
          className="h-8 w-full rounded-md border border-transparent bg-[#f1f0ed] pl-8 pr-8 text-[12px] outline-none placeholder:text-muted-foreground hover:border-border focus:border-input focus:bg-white focus:ring-2 focus:ring-ring/20"
        />
        {query && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => onQueryChange("")}
            className="absolute right-2 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        )}
      </label>

      <div
        className="flex items-center rounded-md border border-border/70 bg-white p-0.5"
        aria-label="고객 유형 필터"
      >
        {MODE_FILTERS.map((item) => {
          const count =
            item.value === "all"
              ? CUSTOMER_LEDGER_ROWS.length
              : CUSTOMER_LEDGER_ROWS.filter((row) => row.mode === item.value)
                  .length;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => onModeChange(item.value)}
              className={cn(
                "flex h-7 items-center gap-1.5 rounded px-2.5 text-[11px] font-medium transition-colors",
                mode === item.value
                  ? "bg-[#f1f0ed] text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
              <span className="text-[9px] tabular-nums opacity-65">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {trailing}

      <div className="ml-auto flex items-center gap-2">
        {activeSort ? (
          <button
            type="button"
            onClick={onSortingClear}
            className="flex h-7 items-center gap-1.5 rounded-md border bg-white px-2 text-[10px] text-foreground hover:bg-muted/50"
            title="정렬 해제"
          >
            <span className="text-muted-foreground">정렬</span>
            {LEDGER_SORT_LABELS[activeSort.id] ?? activeSort.id}
            {activeSort.desc ? (
              <ArrowDown className="size-3" aria-hidden="true" />
            ) : (
              <ArrowUp className="size-3" aria-hidden="true" />
            )}
            <X className="size-3 text-muted-foreground" aria-hidden="true" />
          </button>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            헤더를 눌러 정렬
          </span>
        )}
      </div>
    </section>
  );
}

export function CustomerNameCell({ row }: { row: CustomerLedgerRow }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#f1f1ef] text-[10px] font-semibold text-[#55534e]">
        {row.name.slice(0, 1)}
      </span>
      <strong className="truncate text-[12px] font-semibold text-slate-900">
        {row.name}
      </strong>
    </div>
  );
}

export function ModeCell({ mode }: { mode: CustomerMode }) {
  const meta = MODE_META[mode];
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10px] font-semibold",
        meta.className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dotClassName)} />
      {meta.label}
    </span>
  );
}

export function DemandTypeSummary({ row }: { row: CustomerLedgerRow }) {
  if (row.source.demands.length === 0) {
    return <span className="text-[11px] text-muted-foreground">—</span>;
  }

  const transactionTypes = [
    ...new Set(row.source.demands.map((demand) => demand.transactionType)),
  ];

  return (
    <span
      className="inline-flex min-w-0 items-center gap-1"
      aria-label={`${row.name} 구하는 조건 ${row.source.demands
        .map(
          (demand) =>
            `${demand.transactionType} ${demand.priceLabel} ${demand.role}`,
        )
        .join(", ")}`}
    >
      {transactionTypes.map((transactionType) => (
        <span
          key={transactionType}
          className={cn(
            "rounded px-1.5 py-0.5 text-[9px] font-semibold",
            transactionType === "매매"
              ? "bg-[#fdebec] text-[#8f4b46]"
              : transactionType === "전세"
                ? "bg-[#e7f3f8] text-[#337ea9]"
                : "bg-[#fbf3db] text-[#8f6b1f]",
          )}
        >
          {transactionType}
        </span>
      ))}
      {row.demandCount > 1 && (
        <span className="text-[9px] font-semibold tabular-nums text-muted-foreground">
          {row.demandCount}
        </span>
      )}
    </span>
  );
}

export function ReadinessCell({ row }: { row: CustomerLedgerRow }) {
  const meta = READINESS_META[row.readiness];
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium">
      <span className={cn("size-2 rounded-full", meta.dotClassName)} />
      {meta.label}
    </span>
  );
}

export function DisclosureButton({
  row,
  open,
  onToggle,
  label = "상세",
  count,
}: {
  row: CustomerLedgerRow;
  open: boolean;
  onToggle: (id: string) => void;
  label?: string;
  count?: number;
}) {
  return (
    <Button
      type="button"
      variant={open ? "secondary" : "outline"}
      size="xs"
      aria-expanded={open}
      aria-label={`${row.name} ${label} ${open ? "접기" : "펼치기"}`}
      onClick={(event) => {
        event.stopPropagation();
        onToggle(row.id);
      }}
      className="min-w-8 gap-1 px-1.5 text-[10px] font-medium tabular-nums shadow-none"
    >
      {count ?? label}
      <ChevronDown
        className={cn("size-3 transition-transform", open && "rotate-180")}
        aria-hidden="true"
      />
    </Button>
  );
}

export function ExpandedLedgerRecord({ row }: { row: CustomerLedgerRow }) {
  return (
    <div className="grid min-w-[980px] grid-cols-[1fr_1.15fr_1fr] divide-x divide-[#e5e5e2] bg-[#fbfbfa] px-3 py-3">
      <LedgerDetailSection
        title="구하는 조건"
        count={row.source.demands.length}
      >
        {row.source.demands.length > 0 ? (
          <div className="divide-y divide-[#ececea]">
            {row.source.demands.map((demand) => (
              <div
                key={demand.id}
                className="grid grid-cols-[44px_1fr] gap-x-2 py-2 text-[10px]"
              >
                <span className="font-semibold text-info-strong">
                  {demand.transactionType}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    <span className="tabular-nums">{demand.priceLabel}</span>
                    <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                      {demand.role}
                    </span>
                  </p>
                  <p className="mt-1 truncate text-muted-foreground">
                    {demand.regions} · {demand.areaLabel} · {demand.timingLabel}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyDetail text="구하는 조건 없음" />
        )}
      </LedgerDetailSection>

      <LedgerDetailSection
        title="내놓은 물건"
        count={row.source.supplies.length}
      >
        {row.source.supplies.length > 0 ? (
          <div className="divide-y divide-[#ececea]">
            {row.source.supplies.map((supply) => (
              <div key={supply.id} className="py-2 text-[10px]">
                <p className="flex items-center gap-2">
                  <span className="font-semibold text-success">
                    {supply.transactionType}
                  </span>
                  <strong className="min-w-0 flex-1 truncate">
                    {supply.propertyLabel}
                  </strong>
                  <span className="tabular-nums">{supply.priceLabel}</span>
                </p>
                <p className="mt-1 flex items-center gap-2 text-muted-foreground">
                  <span>{supply.state}</span>
                  <span aria-hidden="true">·</span>
                  <span>{supply.timingLabel}</span>
                </p>
              </div>
            ))}
          </div>
        ) : (
          <EmptyDetail text="내놓은 물건 없음" />
        )}
      </LedgerDetailSection>

      <LedgerDetailSection title="선행 조건" count={row.source.steps.length}>
        <div className="divide-y divide-[#ececea]">
          {row.source.steps.map((step) => (
            <div key={step.id} className="py-2 text-[10px]">
              <p className="flex items-center gap-2">
                <span
                  className={cn(
                    "size-2 rounded-full",
                    STEP_META[step.state].dotClassName,
                  )}
                />
                <strong>{step.label}</strong>
                <span className="ml-auto text-[9px] text-muted-foreground">
                  {step.requiredBefore}
                </span>
              </p>
              <p className="mt-1 truncate pl-4 text-muted-foreground">
                {step.detail}
                {step.dueLabel ? ` · ${step.dueLabel}` : ""}
              </p>
            </div>
          ))}
        </div>
      </LedgerDetailSection>
    </div>
  );
}

function LedgerDetailSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 px-4 first:pl-1 last:pr-1">
      <h3 className="flex items-center gap-1.5 text-[10px] font-semibold text-muted-foreground">
        {title}
        <span className="rounded bg-[#f1f1ef] px-1.5 py-0.5 text-[9px] tabular-nums">
          {count}
        </span>
      </h3>
      <div className="mt-1">{children}</div>
    </section>
  );
}

function EmptyDetail({ text }: { text: string }) {
  return (
    <p className="py-5 text-center text-[10px] text-muted-foreground/65">
      {text}
    </p>
  );
}

export function LedgerStatusBar({
  visible,
  sorting,
  message,
}: {
  visible: number;
  sorting: SortingState;
  message: string;
}) {
  const activeSort = sorting[0];
  return (
    <div className="flex w-full items-center gap-2">
      <span>고객 {visible}명 표시</span>
      {activeSort && (
        <>
          <span aria-hidden="true">·</span>
          <span>
            {LEDGER_SORT_LABELS[activeSort.id] ?? activeSort.id}
            {activeSort.desc ? " 내림차순" : " 오름차순"}
          </span>
        </>
      )}
      <span className="ml-auto">{message}</span>
    </div>
  );
}

export function formatActionDate(row: CustomerLedgerRow): string {
  return row.nextActionDue;
}

export function formatArea(row: CustomerLedgerRow): string {
  return formatLedgerArea(row);
}

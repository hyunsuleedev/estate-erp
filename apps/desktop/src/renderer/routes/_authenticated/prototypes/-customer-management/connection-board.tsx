import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  GitCompareArrows,
  Home,
  Search,
  Target,
  X,
} from "lucide-react";
import { cn } from "../../../../lib/utils";
import {
  CUSTOMER_MANAGEMENT_DEMO,
  READINESS_META,
  getCustomerMode,
  includesCustomerQuery,
  type CustomerManagementDemo,
  type CustomerMode,
  type CustomerReadiness,
} from "./prototype-data";
import {
  ContactBoundaryLink,
  DemandCard,
  MODE_META,
  ReadinessBadge,
  SituationCard,
  StepCard,
  SupplyCard,
} from "./prototype-parts";

type BoardFilter = "all" | CustomerReadiness;

const LANES: Array<{
  mode: CustomerMode;
  description: string;
  icon: ReactNode;
}> = [
  {
    mode: "demand",
    description: "구매·임차 의뢰만 진행 중",
    icon: <Target className="size-4" aria-hidden="true" />,
  },
  {
    mode: "both",
    description: "매도·퇴거와 다음 집을 함께 연결",
    icon: <GitCompareArrows className="size-4" aria-hidden="true" />,
  },
  {
    mode: "supply",
    description: "판매·임대 의뢰만 진행 중",
    icon: <Home className="size-4" aria-hidden="true" />,
  },
];

export function ConnectionBoard() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<BoardFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>("customer-kang");
  const [completedActions, setCompletedActions] = useState<Set<string>>(
    () => new Set(),
  );

  const visibleCustomers = useMemo(
    () =>
      CUSTOMER_MANAGEMENT_DEMO.filter(
        (customer) =>
          (filter === "all" || customer.readiness === filter) &&
          includesCustomerQuery(customer, query),
      ),
    [filter, query],
  );

  const selected =
    visibleCustomers.find((customer) => customer.id === selectedId) ?? null;

  function setReadinessFilter(next: BoardFilter) {
    setFilter(next);
    const firstMatch = CUSTOMER_MANAGEMENT_DEMO.find(
      (customer) =>
        (next === "all" || customer.readiness === next) &&
        includesCustomerQuery(customer, query),
    );
    setSelectedId(firstMatch?.id ?? null);
  }

  function toggleAction(customerId: string) {
    setCompletedActions((current) => {
      const next = new Set(current);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/45">
      <header className="shrink-0 border-b bg-background px-6 pt-3.5 pb-3">
        <div className="flex items-start gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-[-0.02em]">
                고객 연결 보드
              </h1>
              <span className="rounded-full bg-violet-soft px-2 py-0.5 text-[10px] font-semibold text-violet">
                관계 중심
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              고객을 구하는 쪽·양쪽·내놓는 쪽으로 나눠 연결 복잡도를 먼저
              봅니다.
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <label className="relative block w-[260px]">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="고객·물건·지역 검색"
                className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
              />
            </label>
            <ContactBoundaryLink compact />
          </div>
        </div>

        <div
          className="mt-3 flex items-center gap-1"
          aria-label="거래 준비 상태 필터"
        >
          <BoardFilterButton
            label="전체"
            count={CUSTOMER_MANAGEMENT_DEMO.length}
            active={filter === "all"}
            onClick={() => setReadinessFilter("all")}
          />
          {(["ready", "progress", "review"] as const).map((readiness) => (
            <BoardFilterButton
              key={readiness}
              label={READINESS_META[readiness].label}
              count={
                CUSTOMER_MANAGEMENT_DEMO.filter(
                  (customer) => customer.readiness === readiness,
                ).length
              }
              active={filter === readiness}
              dotClassName={READINESS_META[readiness].dotClassName}
              onClick={() => setReadinessFilter(readiness)}
            />
          ))}
          <p className="ml-auto text-[10px] text-muted-foreground">
            입주자·법무사·세무사 등은 고객 수에 포함하지 않습니다.
          </p>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <section className="min-w-0 flex-1 overflow-auto px-4 pt-4 pb-20">
          <div className="grid min-h-full grid-cols-3 items-start gap-3">
            {LANES.map((lane) => {
              const modeMeta = MODE_META[lane.mode];
              const customers = visibleCustomers.filter(
                (customer) => getCustomerMode(customer) === lane.mode,
              );
              return (
                <section
                  key={lane.mode}
                  className="min-w-0 rounded-lg border bg-background/80"
                >
                  <header className="flex items-start gap-2.5 border-b px-3.5 py-3">
                    <span
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-lg",
                        modeMeta.className,
                      )}
                    >
                      {lane.icon}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <h2 className="text-xs font-semibold">
                          {modeMeta.label}
                        </h2>
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground tabular-nums">
                          {customers.length}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                        {lane.description}
                      </p>
                    </div>
                  </header>

                  <div className="space-y-2 p-2.5">
                    {customers.map((customer) => (
                      <CustomerBoardCard
                        key={customer.id}
                        customer={customer}
                        selected={selected?.id === customer.id}
                        actionDone={completedActions.has(customer.id)}
                        onSelect={() => setSelectedId(customer.id)}
                      />
                    ))}

                    {customers.length === 0 && (
                      <div className="flex h-32 flex-col items-center justify-center rounded-md border border-dashed text-center">
                        <Search
                          className="size-5 text-muted-foreground/45"
                          aria-hidden="true"
                        />
                        <p className="mt-2 text-[10px] text-muted-foreground">
                          이 유형에 검색 결과가 없습니다.
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        </section>

        {selected && (
          <ConnectionInspector
            customer={selected}
            actionDone={completedActions.has(selected.id)}
            onToggleAction={() => toggleAction(selected.id)}
            onClose={() => setSelectedId(null)}
          />
        )}
      </div>
    </main>
  );
}

function BoardFilterButton({
  label,
  count,
  active,
  dotClassName,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dotClassName?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "bg-muted/70 text-muted-foreground hover:text-foreground",
      )}
    >
      {dotClassName && (
        <span className={cn("size-1.5 rounded-full", dotClassName)} />
      )}
      {label}
      <span className="text-[9px] tabular-nums opacity-65">{count}</span>
    </button>
  );
}

function CustomerBoardCard({
  customer,
  selected,
  actionDone,
  onSelect,
}: {
  customer: CustomerManagementDemo;
  selected: boolean;
  actionDone: boolean;
  onSelect: () => void;
}) {
  const mode = getCustomerMode(customer);
  const unresolved = customer.steps.filter(
    (step) => step.state !== "done",
  ).length;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group w-full rounded-lg border bg-background p-3 text-left outline-none transition-[border-color,box-shadow,background-color] hover:border-foreground/20 hover:bg-muted/25 focus-visible:ring-2 focus-visible:ring-ring/30",
        selected &&
          "border-ring/50 bg-info-soft/10 shadow-sm ring-1 ring-ring/10",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
            selected ? "bg-foreground text-background" : "bg-neutral-soft",
          )}
        >
          {customer.name.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <strong className="text-[12px]">{customer.name}</strong>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-[9px] font-semibold",
                MODE_META[mode].className,
              )}
            >
              {MODE_META[mode].compactLabel}
            </span>
            <span className="ml-auto text-[9px] text-muted-foreground">
              {customer.lastContact}
            </span>
          </span>
          <span className="mt-1 block truncate text-[10px] text-muted-foreground">
            {customer.currentSituation}
          </span>
        </span>
        <ChevronRight
          className={cn(
            "mt-1 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100",
            selected && "opacity-100",
          )}
          aria-hidden="true"
        />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <MiniIntent
          label="구하는 조건"
          count={customer.demands.length}
          value={
            customer.demands[0]
              ? `${customer.demands[0].transactionType} ${customer.demands[0].priceLabel}`
              : "없음"
          }
          tone="demand"
        />
        <MiniIntent
          label="내놓은 물건"
          count={customer.supplies.length}
          value={
            customer.supplies[0]
              ? `${customer.supplies[0].transactionType} ${customer.supplies[0].priceLabel}`
              : "없음"
          }
          tone="supply"
        />
      </div>

      <div className="mt-3 flex items-center gap-2 border-t pt-2.5">
        <ReadinessBadge customer={customer} />
        {unresolved > 0 && (
          <span className="text-[9px] text-muted-foreground">
            미완료 {unresolved}개
          </span>
        )}
        <span
          className={cn(
            "ml-auto max-w-[46%] truncate text-[9px]",
            actionDone
              ? "text-success line-through"
              : "font-medium text-foreground",
          )}
        >
          {actionDone ? "다음 액션 완료" : customer.nextAction}
        </span>
      </div>
    </button>
  );
}

function MiniIntent({
  label,
  count,
  value,
  tone,
}: {
  label: string;
  count: number;
  value: string;
  tone: "demand" | "supply";
}) {
  return (
    <span
      className={cn(
        "min-w-0 rounded-md border px-2 py-2",
        count > 0
          ? tone === "demand"
            ? "border-info/15 bg-info-soft/20"
            : "border-success/15 bg-success-soft/20"
          : "border-dashed bg-muted/25 opacity-60",
      )}
    >
      <span className="flex items-center gap-1 text-[8px] font-medium text-muted-foreground">
        {label}
        <span className="ml-auto tabular-nums">{count}</span>
      </span>
      <strong className="mt-1 block truncate text-[9px]">{value}</strong>
    </span>
  );
}

function ConnectionInspector({
  customer,
  actionDone,
  onToggleAction,
  onClose,
}: {
  customer: CustomerManagementDemo;
  actionDone: boolean;
  onToggleAction: () => void;
  onClose: () => void;
}) {
  return (
    <aside className="flex w-[390px] shrink-0 flex-col border-l bg-background shadow-[-8px_0_24px_rgba(0,0,0,0.04)]">
      <div className="flex shrink-0 items-start gap-3 border-b px-4 py-3.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-neutral-soft text-xs font-bold">
          {customer.name.slice(0, 1)}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">{customer.name}</h2>
            <ReadinessBadge customer={customer} />
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            {customer.phone} · 담당 {customer.assignee}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="상세 닫기"
          className="ml-auto flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4 pb-24">
        <SituationCard customer={customer} />

        <section>
          <SectionTitle
            title="구하는 조건"
            count={customer.demands.length}
            tone="demand"
          />
          {customer.demands.length > 0 ? (
            <div className="mt-2 space-y-2">
              {customer.demands.map((demand) => (
                <DemandCard key={demand.id} demand={demand} dense />
              ))}
            </div>
          ) : (
            <EmptySection text="구하는 조건 없이 판매·임대만 진행 중입니다." />
          )}
        </section>

        <section>
          <SectionTitle
            title="내놓은 물건"
            count={customer.supplies.length}
            tone="supply"
          />
          {customer.supplies.length > 0 ? (
            <div className="mt-2 space-y-2">
              {customer.supplies.map((supply) => (
                <SupplyCard key={supply.id} supply={supply} dense />
              ))}
            </div>
          ) : (
            <EmptySection text="내놓은 물건 없이 구매·임차만 진행 중입니다." />
          )}
        </section>

        <section>
          <SectionTitle
            title="거래 전 선행 조건"
            count={customer.steps.length}
          />
          <div className="mt-2 space-y-2">
            {customer.steps.map((step) => (
              <StepCard key={step.id} step={step} />
            ))}
          </div>
        </section>

        <section className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold">
            <CircleAlert
              className="size-3.5 text-muted-foreground"
              aria-hidden="true"
            />
            최근 메모
          </div>
          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
            {customer.latestNote}
          </p>
        </section>
      </div>

      <div className="shrink-0 border-t bg-background p-3">
        <p className="mb-2 flex items-center text-[10px] text-muted-foreground">
          다음 액션
          <span
            className={cn(
              "ml-auto font-semibold",
              customer.nextActionDue === "오늘"
                ? "text-destructive"
                : "text-foreground",
            )}
          >
            {customer.nextActionDue}
          </span>
        </p>
        <button
          type="button"
          onClick={onToggleAction}
          className={cn(
            "flex h-9 w-full items-center justify-center gap-2 rounded-md text-xs font-semibold transition-colors",
            actionDone
              ? "bg-success-soft text-success hover:bg-success-soft/70"
              : "bg-foreground text-background hover:bg-foreground/90",
          )}
        >
          {actionDone ? (
            <>
              <Check className="size-3.5" aria-hidden="true" /> 완료됨 · 다시
              열기
            </>
          ) : (
            <>
              {customer.nextAction}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function SectionTitle({
  title,
  count,
  tone,
}: {
  title: string;
  count: number;
  tone?: "demand" | "supply";
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "size-2 rounded-full",
          tone === "demand" && "bg-info",
          tone === "supply" && "bg-success",
          !tone && "bg-muted-foreground",
        )}
      />
      <h3 className="text-[11px] font-semibold">{title}</h3>
      <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground tabular-nums">
        {count}
      </span>
    </div>
  );
}

function EmptySection({ text }: { text: string }) {
  return (
    <div className="mt-2 rounded-lg border border-dashed bg-muted/20 px-3 py-5 text-center text-[10px] text-muted-foreground">
      {text}
    </div>
  );
}

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Building2,
  Check,
  ChevronRight,
  CircleAlert,
  Clock3,
  GitCompareArrows,
  Home,
  Phone,
  Search,
  Target,
  UserRound,
} from "lucide-react";
import { cn } from "../../../../lib/utils";
import {
  CUSTOMER_MANAGEMENT_DEMO,
  READINESS_META,
  getCustomerMode,
  includesCustomerQuery,
  type CustomerManagementDemo,
  type CustomerMode,
} from "./prototype-data";
import {
  ContactBoundaryLink,
  DemandCard,
  MODE_META,
  ModeBadge,
  ReadinessBadge,
  StepBadge,
  SupplyCard,
} from "./prototype-parts";

type WorkbenchFilter = "all" | CustomerMode;

const FILTERS: Array<{ value: WorkbenchFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "both", label: "양쪽" },
  { value: "demand", label: "구함" },
  { value: "supply", label: "내놓음" },
];

export function CustomerWorkbench() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<WorkbenchFilter>("all");
  const [selectedId, setSelectedId] = useState("customer-kang");
  const [focusedStepId, setFocusedStepId] = useState("step-kang-sale");
  const [activeDemandId, setActiveDemandId] = useState("demand-kang-sale");
  const [activeSupplyId, setActiveSupplyId] = useState("supply-kang-home");
  const [completedActions, setCompletedActions] = useState<Set<string>>(
    () => new Set(),
  );

  const visibleCustomers = useMemo(
    () =>
      CUSTOMER_MANAGEMENT_DEMO.filter(
        (customer) =>
          (filter === "all" || getCustomerMode(customer) === filter) &&
          includesCustomerQuery(customer, query),
      ),
    [filter, query],
  );

  const selected =
    visibleCustomers.find((customer) => customer.id === selectedId) ??
    visibleCustomers[0] ??
    null;

  const activeDemand =
    selected?.demands.find((demand) => demand.id === activeDemandId) ??
    selected?.demands[0] ??
    null;
  const activeSupply =
    selected?.supplies.find((supply) => supply.id === activeSupplyId) ??
    selected?.supplies[0] ??
    null;
  const focusedStep =
    selected?.steps.find((step) => step.id === focusedStepId) ??
    selected?.steps[0] ??
    null;

  function selectCustomer(customer: CustomerManagementDemo) {
    setSelectedId(customer.id);
    setActiveDemandId(customer.demands[0]?.id ?? "");
    setActiveSupplyId(customer.supplies[0]?.id ?? "");
    setFocusedStepId(customer.steps[0]?.id ?? "");
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
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/30">
      <header className="flex h-[68px] shrink-0 items-center border-b bg-background px-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-[-0.02em]">
              고객 워크벤치
            </h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              집중 관리
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            한 고객의 수요·공급·선행 조건을 같은 작업면에서 처리합니다.
          </p>
        </div>

        <div className="ml-auto flex items-center gap-4 text-[10px] text-muted-foreground">
          {(["ready", "progress", "review"] as const).map((readiness) => (
            <span key={readiness} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "size-2 rounded-full",
                  READINESS_META[readiness].dotClassName,
                )}
              />
              {READINESS_META[readiness].label}
              <strong className="text-foreground tabular-nums">
                {
                  CUSTOMER_MANAGEMENT_DEMO.filter(
                    (customer) => customer.readiness === readiness,
                  ).length
                }
              </strong>
            </span>
          ))}
          <ContactBoundaryLink compact />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r bg-background">
          <div className="shrink-0 space-y-2 border-b p-3">
            <label className="relative block">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="고객, 물건, 지역 검색"
                className="h-9 w-full rounded-md border bg-muted/25 pl-9 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:bg-background focus:ring-2 focus:ring-ring/20"
              />
            </label>

            <div
              className="grid grid-cols-4 rounded-md bg-muted p-0.5"
              aria-label="고객 유형 필터"
            >
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    "h-7 rounded text-[10px] font-medium transition-colors",
                    filter === item.value
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto pb-20">
            {visibleCustomers.map((customer) => {
              const isSelected = selected?.id === customer.id;
              const unresolved = customer.steps.filter(
                (step) => step.state !== "done",
              ).length;
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => selectCustomer(customer)}
                  className={cn(
                    "group flex w-full items-start gap-2.5 border-b px-3.5 py-3 text-left outline-none transition-colors hover:bg-muted/45 focus-visible:bg-info-soft/30",
                    isSelected && "bg-muted/70",
                  )}
                >
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                      isSelected
                        ? "bg-foreground text-background"
                        : "bg-neutral-soft",
                    )}
                  >
                    {customer.name.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <strong className="text-[12px]">{customer.name}</strong>
                      <ModeBadge customer={customer} />
                      <span
                        className={cn(
                          "ml-auto size-2 rounded-full",
                          READINESS_META[customer.readiness].dotClassName,
                        )}
                        title={READINESS_META[customer.readiness].label}
                      />
                    </span>
                    <span className="mt-1 block truncate text-[10px] text-muted-foreground">
                      {customer.currentSituation}
                    </span>
                    <span className="mt-2 flex items-center gap-2 text-[9px] text-muted-foreground">
                      <span>구함 {customer.demands.length}</span>
                      <span>내놓음 {customer.supplies.length}</span>
                      {unresolved > 0 && <span>미완료 {unresolved}</span>}
                      <span className="ml-auto">{customer.lastContact}</span>
                    </span>
                  </span>
                  <ChevronRight
                    className={cn(
                      "mt-2 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100",
                      isSelected && "opacity-100",
                    )}
                    aria-hidden="true"
                  />
                </button>
              );
            })}

            {visibleCustomers.length === 0 && (
              <div className="px-5 py-16 text-center">
                <UserRound
                  className="mx-auto size-7 text-muted-foreground/45"
                  aria-hidden="true"
                />
                <p className="mt-3 text-xs text-muted-foreground">
                  검색 결과가 없습니다.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                  }}
                  className="mt-2 text-xs font-medium text-info-strong hover:underline"
                >
                  검색과 필터 초기화
                </button>
              </div>
            )}
          </div>
        </aside>

        {selected ? (
          <section className="min-h-0 overflow-auto pb-20">
            <div className="sticky top-0 z-10 border-b bg-background/95 px-5 py-3 backdrop-blur-sm">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-neutral-soft text-sm font-bold">
                  {selected.name.slice(0, 1)}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold">{selected.name}</h2>
                    <span
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[9px] font-semibold",
                        MODE_META[getCustomerMode(selected)].className,
                      )}
                    >
                      {MODE_META[getCustomerMode(selected)].label}
                    </span>
                    <ReadinessBadge customer={selected} />
                  </div>
                  <div className="mt-1 flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Phone className="size-3" aria-hidden="true" />{" "}
                      {selected.phone}
                    </span>
                    <span>담당 {selected.assignee}</span>
                    <span>최근 연락 {selected.lastContact}</span>
                  </div>
                </div>
                <p className="ml-auto max-w-[380px] rounded-md bg-muted/55 px-3 py-2 text-[10px] leading-4 text-muted-foreground">
                  {selected.latestNote}
                </p>
              </div>
            </div>

            <div className="space-y-4 p-4">
              <section className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                <IntentWorkspace
                  type="demand"
                  count={selected.demands.length}
                  title="구하는 조건"
                  description="고객이 새로 확보하려는 집"
                >
                  {selected.demands.length > 1 && (
                    <div className="mb-2 flex items-center gap-1 rounded-md bg-muted p-0.5">
                      {selected.demands.map((demand, index) => (
                        <button
                          key={demand.id}
                          type="button"
                          onClick={() => setActiveDemandId(demand.id)}
                          className={cn(
                            "h-6 flex-1 rounded px-2 text-[9px] font-medium",
                            activeDemand?.id === demand.id
                              ? "bg-background text-foreground shadow-xs"
                              : "text-muted-foreground",
                          )}
                        >
                          {demand.role} {index + 1}
                        </button>
                      ))}
                    </div>
                  )}
                  {activeDemand ? (
                    <DemandCard demand={activeDemand} />
                  ) : (
                    <EmptyWorkspace
                      icon={<Target className="size-5" aria-hidden="true" />}
                      text="현재 구하는 조건이 없습니다."
                    />
                  )}
                </IntentWorkspace>

                <IntentWorkspace
                  type="supply"
                  count={selected.supplies.length}
                  title="내놓은 물건"
                  description="고객이 판매하거나 임대하려는 물건"
                >
                  {selected.supplies.length > 1 && (
                    <div className="mb-2 flex items-center gap-1 rounded-md bg-muted p-0.5">
                      {selected.supplies.map((supply, index) => (
                        <button
                          key={supply.id}
                          type="button"
                          onClick={() => setActiveSupplyId(supply.id)}
                          className={cn(
                            "h-6 flex-1 rounded px-2 text-[9px] font-medium",
                            activeSupply?.id === supply.id
                              ? "bg-background text-foreground shadow-xs"
                              : "text-muted-foreground",
                          )}
                        >
                          물건 {index + 1}
                        </button>
                      ))}
                    </div>
                  )}
                  {activeSupply ? (
                    <SupplyCard supply={activeSupply} />
                  ) : (
                    <EmptyWorkspace
                      icon={<Building2 className="size-5" aria-hidden="true" />}
                      text="현재 내놓은 물건이 없습니다."
                    />
                  )}
                </IntentWorkspace>
              </section>

              <section className="rounded-lg border bg-background">
                <header className="flex items-center gap-2 border-b px-4 py-3">
                  <GitCompareArrows
                    className="size-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h3 className="text-xs font-semibold">거래 연결 계획</h3>
                  <p className="text-[10px] text-muted-foreground">
                    현재 상황에서 목표 거래까지 필요한 순서
                  </p>
                </header>

                <div className="grid grid-cols-[minmax(160px,0.85fr)_24px_minmax(260px,1.35fr)_24px_minmax(170px,0.9fr)] items-stretch gap-2 p-4">
                  <FlowEndpoint
                    icon={<Home className="size-4" aria-hidden="true" />}
                    eyebrow="현재 상황"
                    title={selected.currentSituation}
                    detail={
                      activeSupply
                        ? `내놓음 · ${activeSupply.propertyLabel}`
                        : "보유 매물 연결 없음"
                    }
                  />
                  <ArrowRight
                    className="m-auto size-4 text-muted-foreground/55"
                    aria-hidden="true"
                  />

                  <div className="space-y-2">
                    {selected.steps.map((step, index) => {
                      const isFocused = focusedStep?.id === step.id;
                      return (
                        <button
                          key={step.id}
                          type="button"
                          onClick={() => setFocusedStepId(step.id)}
                          className={cn(
                            "w-full rounded-lg border bg-background px-3 py-2.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/30",
                            isFocused && "border-ring/45 bg-info-soft/15",
                          )}
                        >
                          <span className="flex items-center gap-2">
                            <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[9px] font-semibold tabular-nums">
                              {index + 1}
                            </span>
                            <strong className="text-[10px]">
                              {step.label}
                            </strong>
                            <StepBadge step={step} />
                            <span className="ml-auto text-[9px] text-muted-foreground">
                              {step.requiredBefore}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <ArrowRight
                    className="m-auto size-4 text-muted-foreground/55"
                    aria-hidden="true"
                  />
                  <FlowEndpoint
                    icon={<Target className="size-4" aria-hidden="true" />}
                    eyebrow="목표 거래"
                    title={
                      activeDemand
                        ? `${activeDemand.transactionType} ${activeDemand.priceLabel}`
                        : "판매·임대 성사"
                    }
                    detail={
                      activeDemand
                        ? `${activeDemand.regions} · ${activeDemand.timingLabel}`
                        : (activeSupply?.timingLabel ?? "일정 협의")
                    }
                    accent
                  />
                </div>

                {focusedStep && (
                  <div className="mx-4 mb-4 grid grid-cols-[1fr_auto] items-center gap-3 rounded-md bg-muted/55 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold">
                        {focusedStep.label}
                      </p>
                      <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                        {focusedStep.detail}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 text-[9px] font-medium">
                      {focusedStep.amountLabel && (
                        <span>{focusedStep.amountLabel}</span>
                      )}
                      {focusedStep.dueLabel && (
                        <span className="flex items-center gap-1">
                          <Clock3
                            className="size-3 text-muted-foreground"
                            aria-hidden="true"
                          />
                          {focusedStep.dueLabel}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </section>

              <section className="grid grid-cols-[minmax(0,1fr)_340px] gap-4">
                <div className="rounded-lg border bg-background p-4">
                  <div className="flex items-center gap-2">
                    <CircleAlert
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <h3 className="text-xs font-semibold">
                      담당자가 지금 알아야 할 것
                    </h3>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-3">
                    <InfoPair
                      label="현재 상황"
                      value={selected.currentSituation}
                    />
                    <InfoPair
                      label="남은 선행 조건"
                      value={`${selected.steps.filter((step) => step.state !== "done").length}개`}
                    />
                    <InfoPair
                      label="연결 가능한 매칭"
                      value={`${selected.demands.reduce((total, demand) => total + demand.matches, 0)}건`}
                    />
                  </dl>
                </div>

                <div className="rounded-lg border bg-foreground p-4 text-background">
                  <p className="flex items-center text-[10px] text-background/65">
                    다음 액션
                    <span className="ml-auto font-semibold text-background">
                      {selected.nextActionDue}
                    </span>
                  </p>
                  <p
                    className={cn(
                      "mt-2 text-xs font-semibold",
                      completedActions.has(selected.id) &&
                        "text-background/50 line-through",
                    )}
                  >
                    {selected.nextAction}
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleAction(selected.id)}
                    className={cn(
                      "mt-3 flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-[10px] font-semibold transition-colors",
                      completedActions.has(selected.id)
                        ? "bg-success text-white hover:bg-success/90"
                        : "bg-background text-foreground hover:bg-background/90",
                    )}
                  >
                    {completedActions.has(selected.id) ? (
                      <>
                        <Check className="size-3.5" aria-hidden="true" /> 완료됨
                        · 다시 열기
                      </>
                    ) : (
                      <>
                        완료 처리{" "}
                        <ArrowRight className="size-3.5" aria-hidden="true" />
                      </>
                    )}
                  </button>
                </div>
              </section>
            </div>
          </section>
        ) : (
          <div className="flex items-center justify-center text-center">
            <div>
              <UserRound
                className="mx-auto size-8 text-muted-foreground/45"
                aria-hidden="true"
              />
              <p className="mt-3 text-sm font-medium">
                선택할 고객이 없습니다.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

function IntentWorkspace({
  type,
  count,
  title,
  description,
  children,
}: {
  type: "demand" | "supply";
  count: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-background p-4">
      <header className="mb-3 flex items-start gap-2">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg",
            type === "demand"
              ? "bg-info-soft text-info-strong"
              : "bg-success-soft text-success",
          )}
        >
          {type === "demand" ? (
            <Target className="size-4" aria-hidden="true" />
          ) : (
            <Building2 className="size-4" aria-hidden="true" />
          )}
        </span>
        <div>
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs font-semibold">{title}</h3>
            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground tabular-nums">
              {count}
            </span>
          </div>
          <p className="mt-0.5 text-[9px] text-muted-foreground">
            {description}
          </p>
        </div>
      </header>
      {children}
    </section>
  );
}

function EmptyWorkspace({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) {
  return (
    <div className="flex min-h-[108px] flex-col items-center justify-center rounded-lg border border-dashed bg-muted/20 text-muted-foreground">
      {icon}
      <p className="mt-2 text-[10px]">{text}</p>
    </div>
  );
}

function FlowEndpoint({
  icon,
  eyebrow,
  title,
  detail,
  accent = false,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <article
      className={cn(
        "flex min-h-[92px] flex-col justify-center rounded-lg border p-3",
        accent ? "border-info/20 bg-info-soft/25" : "bg-muted/25",
      )}
    >
      <div className="flex items-center gap-1.5 text-[9px] font-medium text-muted-foreground">
        {icon} {eyebrow}
      </div>
      <p className="mt-2 text-[10px] font-semibold leading-4">{title}</p>
      <p className="mt-1 text-[9px] leading-4 text-muted-foreground">
        {detail}
      </p>
    </article>
  );
}

function InfoPair({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/35 px-3 py-2.5">
      <dt className="text-[9px] font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-[10px] font-semibold">{value}</dd>
    </div>
  );
}

import { Fragment, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  CircleAlert,
  GitCompareArrows,
  Search,
} from "lucide-react";
import { cn } from "../../../../lib/utils";
import {
  CUSTOMER_MANAGEMENT_DEMO,
  STEP_META,
  getCustomerMode,
  includesCustomerQuery,
  type CustomerMode,
} from "./prototype-data";
import {
  ContactBoundaryLink,
  DemandCard,
  MODE_META,
  ModeBadge,
  ReadinessBadge,
  SituationCard,
  StepCard,
  SupplyCard,
} from "./prototype-parts";

type LedgerFilter = "all" | CustomerMode | "review";

const FILTERS: Array<{ value: LedgerFilter; label: string }> = [
  { value: "all", label: "전체 고객" },
  { value: "demand", label: "구함" },
  { value: "both", label: "양쪽" },
  { value: "supply", label: "내놓음" },
  { value: "review", label: "확인 필요" },
];

export function CustomerLedger() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<LedgerFilter>("all");
  const [expandedId, setExpandedId] = useState<string | null>("customer-kang");

  const visibleCustomers = useMemo(
    () =>
      CUSTOMER_MANAGEMENT_DEMO.filter((customer) => {
        const filterMatches =
          filter === "all" ||
          (filter === "review"
            ? customer.readiness === "review"
            : getCustomerMode(customer) === filter);
        return filterMatches && includesCustomerQuery(customer, query);
      }),
    [filter, query],
  );

  const summary = useMemo(
    () => ({
      customers: CUSTOMER_MANAGEMENT_DEMO.length,
      demands: CUSTOMER_MANAGEMENT_DEMO.reduce(
        (total, customer) => total + customer.demands.length,
        0,
      ),
      supplies: CUSTOMER_MANAGEMENT_DEMO.reduce(
        (total, customer) => total + customer.supplies.length,
        0,
      ),
      both: CUSTOMER_MANAGEMENT_DEMO.filter(
        (customer) => getCustomerMode(customer) === "both",
      ).length,
    }),
    [],
  );

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header className="flex shrink-0 items-center gap-5 border-b px-6 py-3.5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-[-0.02em]">
              고객관리
            </h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              고객 원장
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            고객 한 명을 기준으로 구하는 조건과 내놓은 물건을 함께 봅니다.
          </p>
        </div>

        <div className="ml-auto flex items-center divide-x rounded-md border bg-card">
          <SummaryMetric label="진행 고객" value={summary.customers} />
          <SummaryMetric
            label="구하는 조건"
            value={summary.demands}
            tone="info"
          />
          <SummaryMetric
            label="내놓은 물건"
            value={summary.supplies}
            tone="success"
          />
          <SummaryMetric label="양쪽 고객" value={summary.both} tone="violet" />
        </div>

        <ContactBoundaryLink />
      </header>

      <section className="flex shrink-0 items-center gap-3 border-b bg-muted/35 px-6 py-2.5">
        <label className="relative block w-[280px]">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="고객, 물건, 지역, 조건 검색"
            className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
          />
        </label>

        <div
          className="flex items-center rounded-md bg-muted p-0.5"
          aria-label="고객 유형 필터"
        >
          {FILTERS.map((item) => {
            const count = getFilterCount(item.value);
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded px-2.5 text-[11px] font-medium transition-colors",
                  filter === item.value
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
                <span className="text-[9px] tabular-nums opacity-70">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <p className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <GitCompareArrows className="size-3.5" aria-hidden="true" />
          행을 펼치면 거래 연결 구조를 확인할 수 있습니다.
        </p>
      </section>

      <div className="min-h-0 flex-1 overflow-auto pb-20">
        <table className="w-full min-w-[1180px] table-fixed border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-muted/95 text-[11px] text-muted-foreground backdrop-blur-sm">
            <tr className="border-b">
              <th className="w-[188px] px-6 py-2.5 font-medium">고객</th>
              <th className="w-[235px] px-3 py-2.5 font-medium">구하는 조건</th>
              <th className="w-[250px] px-3 py-2.5 font-medium">내놓은 물건</th>
              <th className="w-[205px] px-3 py-2.5 font-medium">거래 준비</th>
              <th className="px-3 py-2.5 font-medium">다음 액션</th>
              <th className="w-[112px] px-3 py-2.5 font-medium">최근 연락</th>
              <th className="w-[42px] px-3 py-2.5" aria-label="펼치기" />
            </tr>
          </thead>
          <tbody>
            {visibleCustomers.map((customer) => {
              const isExpanded = customer.id === expandedId;
              const primaryDemand = customer.demands[0];
              const primarySupply = customer.supplies[0];
              const unresolvedSteps = customer.steps.filter(
                (step) => step.state !== "done",
              );
              const leadStep = unresolvedSteps[0] ?? customer.steps[0];

              return (
                <Fragment key={customer.id}>
                  <tr
                    tabIndex={0}
                    aria-expanded={isExpanded}
                    onClick={() =>
                      setExpandedId(isExpanded ? null : customer.id)
                    }
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setExpandedId(isExpanded ? null : customer.id);
                      }
                    }}
                    className={cn(
                      "cursor-pointer border-b text-xs outline-none transition-colors hover:bg-muted/45 focus-visible:bg-info-soft/30",
                      isExpanded && "bg-muted/55",
                    )}
                  >
                    <td className="px-6 py-3 align-top">
                      <div className="flex items-start gap-2.5">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-soft text-[11px] font-bold">
                          {customer.name.slice(0, 1)}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <strong className="text-[12px]">
                              {customer.name}
                            </strong>
                            <ModeBadge customer={customer} />
                          </div>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {customer.phone}
                          </p>
                          <p className="mt-1 text-[9px] text-muted-foreground">
                            담당 {customer.assignee}
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-3 py-3 align-top">
                      {primaryDemand ? (
                        <IntentSummary
                          tone="demand"
                          title={`${primaryDemand.transactionType} ${primaryDemand.priceLabel}`}
                          detail={`${primaryDemand.regions} · ${primaryDemand.areaLabel}`}
                          extra={
                            customer.demands.length > 1
                              ? `대안 +${customer.demands.length - 1}`
                              : `매칭 ${primaryDemand.matches}`
                          }
                        />
                      ) : (
                        <EmptyIntent label="구하는 조건 없음" />
                      )}
                    </td>

                    <td className="px-3 py-3 align-top">
                      {primarySupply ? (
                        <IntentSummary
                          tone="supply"
                          title={primarySupply.propertyLabel}
                          detail={`${primarySupply.transactionType} ${primarySupply.priceLabel}`}
                          extra={
                            customer.supplies.length > 1
                              ? `물건 +${customer.supplies.length - 1}`
                              : primarySupply.state
                          }
                        />
                      ) : (
                        <EmptyIntent label="내놓은 물건 없음" />
                      )}
                    </td>

                    <td className="px-3 py-3 align-top">
                      <div className="flex items-start gap-2">
                        <ReadinessBadge customer={customer} />
                        {leadStep && (
                          <div className="min-w-0 pt-0.5">
                            <p className="truncate text-[10px] font-medium">
                              {leadStep.label}
                            </p>
                            <p className="mt-1 truncate text-[9px] text-muted-foreground">
                              {unresolvedSteps.length > 1
                                ? `미완료 ${unresolvedSteps.length}개`
                                : STEP_META[leadStep.state].label}
                            </p>
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-3 align-top">
                      <p className="font-medium">{customer.nextAction}</p>
                      <p
                        className={cn(
                          "mt-1 text-[10px]",
                          customer.nextActionDue === "오늘"
                            ? "font-semibold text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {customer.nextActionDue}
                      </p>
                    </td>

                    <td className="px-3 py-3 align-top">
                      <p className="text-[10px] font-medium">
                        {customer.lastContact}
                      </p>
                      <p className="mt-1 truncate text-[9px] text-muted-foreground">
                        {customer.latestNote}
                      </p>
                    </td>

                    <td className="px-3 py-3 align-top text-muted-foreground">
                      {isExpanded ? (
                        <ChevronUp className="size-4" aria-hidden="true" />
                      ) : (
                        <ChevronDown className="size-4" aria-hidden="true" />
                      )}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr className="border-b bg-muted/20">
                      <td colSpan={7} className="px-6 py-4">
                        <div className="grid grid-cols-[minmax(200px,0.9fr)_28px_minmax(250px,1fr)_28px_minmax(250px,1.1fr)] items-center gap-2">
                          <section className="min-w-0">
                            <p className="mb-2 text-[10px] font-semibold text-muted-foreground">
                              출발점 · 내놓는 쪽
                            </p>
                            <div className="space-y-2">
                              <SituationCard customer={customer} />
                              {customer.supplies.map((supply) => (
                                <SupplyCard
                                  key={supply.id}
                                  supply={supply}
                                  dense
                                />
                              ))}
                            </div>
                          </section>

                          <ArrowRight
                            className="mx-auto size-4 text-muted-foreground/60"
                            aria-hidden="true"
                          />

                          <section className="min-w-0">
                            <p className="mb-2 text-[10px] font-semibold text-muted-foreground">
                              자금 · 선행 조건
                            </p>
                            <div className="space-y-2">
                              {customer.steps.map((step) => (
                                <StepCard key={step.id} step={step} />
                              ))}
                            </div>
                          </section>

                          <ArrowRight
                            className="mx-auto size-4 text-muted-foreground/60"
                            aria-hidden="true"
                          />

                          <section className="min-w-0">
                            <p className="mb-2 text-[10px] font-semibold text-muted-foreground">
                              목표 · 구하는 쪽
                            </p>
                            {customer.demands.length > 0 ? (
                              <div className="space-y-2">
                                {customer.demands.map((demand) => (
                                  <DemandCard
                                    key={demand.id}
                                    demand={demand}
                                    dense
                                  />
                                ))}
                              </div>
                            ) : (
                              <div className="flex min-h-24 items-center justify-center rounded-lg border border-dashed bg-background text-[10px] text-muted-foreground">
                                판매·임대 의뢰만 진행 중
                              </div>
                            )}
                          </section>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>

        {visibleCustomers.length === 0 && (
          <div className="flex h-64 flex-col items-center justify-center text-center">
            <CircleAlert
              className="size-7 text-muted-foreground/45"
              aria-hidden="true"
            />
            <p className="mt-3 text-sm font-medium">
              조건에 맞는 고객이 없습니다.
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
    </main>
  );
}

function SummaryMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "info" | "success" | "violet";
}) {
  return (
    <div className="flex h-10 min-w-[90px] items-center gap-2 px-3">
      <span className="text-[10px] text-muted-foreground">{label}</span>
      <strong
        className={cn(
          "ml-auto text-sm font-semibold tabular-nums",
          tone === "info" && "text-info-strong",
          tone === "success" && "text-success",
          tone === "violet" && "text-violet",
        )}
      >
        {value}
      </strong>
    </div>
  );
}

function IntentSummary({
  tone,
  title,
  detail,
  extra,
}: {
  tone: "demand" | "supply";
  title: string;
  detail: string;
  extra: string;
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "size-2 rounded-full",
            tone === "demand" ? "bg-info" : "bg-success",
          )}
        />
        <strong className="truncate text-[11px]">{title}</strong>
        <span
          className={cn(
            "ml-auto shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold",
            tone === "demand"
              ? MODE_META.demand.className
              : MODE_META.supply.className,
          )}
        >
          {extra}
        </span>
      </div>
      <p className="mt-1.5 truncate pl-3.5 text-[10px] text-muted-foreground">
        {detail}
      </p>
    </div>
  );
}

function EmptyIntent({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-muted-foreground/65">
      <span className="size-2 rounded-full border border-dashed border-muted-foreground/50" />
      {label}
    </span>
  );
}

function getFilterCount(filter: LedgerFilter): number {
  if (filter === "all") return CUSTOMER_MANAGEMENT_DEMO.length;
  if (filter === "review") {
    return CUSTOMER_MANAGEMENT_DEMO.filter(
      (customer) => customer.readiness === "review",
    ).length;
  }
  return CUSTOMER_MANAGEMENT_DEMO.filter(
    (customer) => getCustomerMode(customer) === filter,
  ).length;
}

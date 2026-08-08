import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookUser,
  Building2,
  CircleDollarSign,
  Clock3,
  Home,
  MapPin,
  Target,
} from "lucide-react";
import { cn } from "../../../../lib/utils";
import {
  READINESS_META,
  STEP_META,
  getCustomerMode,
  type CustomerManagementDemo,
  type CustomerMode,
  type DemandIntentDemo,
  type PlanStepDemo,
  type SupplyIntentDemo,
} from "./prototype-data";

export const MODE_META: Record<
  CustomerMode,
  { label: string; compactLabel: string; className: string }
> = {
  demand: {
    label: "구하는 고객",
    compactLabel: "구함",
    className: "bg-info-soft text-info-strong",
  },
  both: {
    label: "구함 + 내놓음",
    compactLabel: "양쪽",
    className: "bg-violet-soft text-violet",
  },
  supply: {
    label: "내놓는 고객",
    compactLabel: "내놓음",
    className: "bg-success-soft text-success",
  },
};

export function ContactBoundaryLink({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <Link
      to="/contacts"
      className="group inline-flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-[11px] text-muted-foreground outline-none transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
    >
      <BookUser className="size-3.5 shrink-0" aria-hidden="true" />
      <span>
        {compact ? "전체 연락처" : "입주자·관계자는 전체 연락처에서 관리"}
      </span>
      <ArrowRight
        className="size-3 shrink-0 transition-transform group-hover:translate-x-0.5"
        aria-hidden="true"
      />
    </Link>
  );
}

export function ReadinessBadge({
  customer,
}: {
  customer: CustomerManagementDemo;
}) {
  const meta = READINESS_META[customer.readiness];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold",
        meta.className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", meta.dotClassName)} />
      {meta.label}
    </span>
  );
}

export function ModeBadge({ customer }: { customer: CustomerManagementDemo }) {
  const meta = MODE_META[getCustomerMode(customer)];
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[9px] font-semibold",
        meta.className,
      )}
    >
      {meta.compactLabel}
    </span>
  );
}

export function StepBadge({ step }: { step: PlanStepDemo }) {
  const meta = STEP_META[step.state];
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-[9px] font-semibold",
        meta.className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function DemandCard({
  demand,
  dense = false,
}: {
  demand: DemandIntentDemo;
  dense?: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-lg border border-info/15 bg-info-soft/25",
        dense ? "p-2.5" : "p-3",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Target
          className="size-3.5 shrink-0 text-info-strong"
          aria-hidden="true"
        />
        <span className="rounded bg-info-soft px-1.5 py-0.5 text-[9px] font-semibold text-info-strong">
          {demand.transactionType}
        </span>
        <strong className="truncate text-[11px] tabular-nums">
          {demand.priceLabel}
        </strong>
        <span className="ml-auto rounded bg-background/80 px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
          {demand.role}
        </span>
      </div>
      <p className="mt-2 flex items-center gap-1 truncate text-[10px] text-muted-foreground">
        <MapPin className="size-3 shrink-0" aria-hidden="true" />
        {demand.regions}
      </p>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
        <span>{demand.areaLabel}</span>
        <span aria-hidden="true">·</span>
        <span className="truncate">{demand.timingLabel}</span>
        <span className="ml-auto shrink-0 font-semibold text-info-strong tabular-nums">
          매칭 {demand.matches}
        </span>
      </div>
    </article>
  );
}

export function SupplyCard({
  supply,
  dense = false,
}: {
  supply: SupplyIntentDemo;
  dense?: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-lg border border-success/15 bg-success-soft/25",
        dense ? "p-2.5" : "p-3",
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <Building2
          className="size-3.5 shrink-0 text-success"
          aria-hidden="true"
        />
        <span className="rounded bg-success-soft px-1.5 py-0.5 text-[9px] font-semibold text-success">
          {supply.transactionType}
        </span>
        <strong className="min-w-0 flex-1 truncate text-[11px]">
          {supply.propertyLabel}
        </strong>
      </div>
      <div className="mt-2 flex items-center gap-2 text-[10px]">
        <span className="font-semibold tabular-nums">{supply.priceLabel}</span>
        <span className="rounded bg-background/80 px-1.5 py-0.5 font-medium text-muted-foreground">
          {supply.state}
        </span>
        <span className="ml-auto truncate text-muted-foreground">
          {supply.timingLabel}
        </span>
      </div>
    </article>
  );
}

export function StepCard({
  step,
  active = false,
}: {
  step: PlanStepDemo;
  active?: boolean;
}) {
  return (
    <article
      className={cn(
        "rounded-lg border bg-background p-3",
        active && "border-ring/45 bg-info-soft/15 ring-1 ring-ring/10",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "size-2 rounded-full",
            STEP_META[step.state].dotClassName,
          )}
        />
        <strong className="text-[11px]">{step.label}</strong>
        <StepBadge step={step} />
        <span className="ml-auto text-[9px] text-muted-foreground">
          {step.requiredBefore}
        </span>
      </div>
      <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
        {step.detail}
      </p>
      {(step.amountLabel || step.dueLabel) && (
        <div className="mt-2 flex items-center gap-3 text-[9px] font-medium">
          {step.amountLabel && (
            <span className="flex items-center gap-1">
              <CircleDollarSign
                className="size-3 text-muted-foreground"
                aria-hidden="true"
              />
              {step.amountLabel}
            </span>
          )}
          {step.dueLabel && (
            <span className="flex items-center gap-1">
              <Clock3
                className="size-3 text-muted-foreground"
                aria-hidden="true"
              />
              {step.dueLabel}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

export function SituationCard({
  customer,
}: {
  customer: CustomerManagementDemo;
}) {
  return (
    <article className="rounded-lg border bg-muted/35 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
        <Home className="size-3.5" aria-hidden="true" /> 현재 상황
      </div>
      <p className="mt-2 text-[11px] font-semibold">
        {customer.currentSituation}
      </p>
    </article>
  );
}

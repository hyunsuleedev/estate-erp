import type { SortingState } from "@tanstack/react-table";
import {
  CUSTOMER_MANAGEMENT_DEMO,
  getCustomerMode,
  type CustomerManagementDemo,
  type CustomerMode,
  type CustomerReadiness,
  type DemandIntentDemo,
  type PlanStepDemo,
  type SupplyIntentDemo,
} from "../-customer-management/prototype-data";

interface LedgerNumericMeta {
  budgetMin: number | null;
  budgetMax: number | null;
  areaMinPyeong: number | null;
  areaMaxPyeong: number | null;
  supplyPrice: number | null;
  nextActionAt: number;
  lastContactAt: number;
}

interface DemandNumericMeta {
  budgetMin: number;
  budgetMax: number;
  monthlyRentMin?: number;
  monthlyRentMax?: number;
  areaMinPyeong: number;
  areaMaxPyeong: number | null;
}

export interface LedgerIntentLine {
  id: string;
  kind: "demand" | "supply";
  ordinal: number;
  transactionType: "매매" | "전세" | "월세";
  roleLabel: string;
  budgetMin: number | null;
  budgetMax: number | null;
  askingPrice: number | null;
  monthlyRentMin: number | null;
  monthlyRentMax: number | null;
  locationLabel: string;
  areaMinPyeong: number | null;
  areaMaxPyeong: number | null;
  areaLabel: string;
  matchCount: number | null;
  stateLabel: string;
  timingLabel: string;
}

export interface LedgerDependencyLink {
  id: string;
  step: PlanStepDemo;
  sourceIntentIds: string[];
  sourceLabel: string;
  targetIntentIds: string[];
}

export interface LedgerDependencyGraphSource {
  id: string;
  label: string;
  intent: LedgerIntentLine | null;
}

export interface LedgerDependencyGraphStep {
  id: string;
  link: LedgerDependencyLink;
}

export interface LedgerDependencyGraphTarget {
  id: string;
  label: string;
  intent: LedgerIntentLine | null;
}

export interface LedgerDependencyGraphEdge {
  id: string;
  fromId: string;
  toId: string;
  phase: "source-to-step" | "step-to-target";
  targetKind: LedgerIntentLine["kind"] | null;
}

export interface LedgerDependencyGraph {
  sources: LedgerDependencyGraphSource[];
  steps: LedgerDependencyGraphStep[];
  targets: LedgerDependencyGraphTarget[];
  edges: LedgerDependencyGraphEdge[];
}

export interface CustomerLedgerRow {
  id: string;
  source: CustomerManagementDemo;
  name: string;
  phone: string;
  mode: CustomerMode;
  primaryDemand: DemandIntentDemo | null;
  primarySupply: SupplyIntentDemo | null;
  demandCount: number;
  supplyCount: number;
  budgetMin: number | null;
  budgetMax: number | null;
  areaMinPyeong: number | null;
  areaMaxPyeong: number | null;
  preferredRegion: string;
  supplyPrice: number | null;
  supplyState: string;
  readiness: CustomerReadiness;
  readinessRank: number;
  matchCount: number;
  unresolvedStepCount: number;
  nextAction: string;
  nextActionDue: string;
  nextActionAt: number;
  lastContact: string;
  lastContactAt: number;
  assignee: string;
}

const NUMERIC_META: Record<string, LedgerNumericMeta> = {
  "customer-han": {
    budgetMin: 240000,
    budgetMax: 270000,
    areaMinPyeong: 32,
    areaMaxPyeong: null,
    supplyPrice: null,
    nextActionAt: Date.parse("2026-08-05T09:00:00+01:00"),
    lastContactAt: Date.parse("2026-08-05T10:24:00+01:00"),
  },
  "customer-kang": {
    budgetMin: 230000,
    budgetMax: 260000,
    areaMinPyeong: 34,
    areaMaxPyeong: 34,
    supplyPrice: 185000,
    nextActionAt: Date.parse("2026-08-06T10:00:00+01:00"),
    lastContactAt: Date.parse("2026-08-04T16:40:00+01:00"),
  },
  "customer-choi": {
    budgetMin: 300000,
    budgetMax: 340000,
    areaMinPyeong: 34,
    areaMaxPyeong: 45,
    supplyPrice: null,
    nextActionAt: Date.parse("2026-08-05T13:00:00+01:00"),
    lastContactAt: Date.parse("2026-08-01T14:10:00+01:00"),
  },
  "customer-bae": {
    budgetMin: 180000,
    budgetMax: 220000,
    areaMinPyeong: 25,
    areaMaxPyeong: 34,
    supplyPrice: null,
    nextActionAt: Date.parse("2026-08-05T11:00:00+01:00"),
    lastContactAt: Date.parse("2026-08-05T09:12:00+01:00"),
  },
  "customer-kim": {
    budgetMin: null,
    budgetMax: null,
    areaMinPyeong: null,
    areaMaxPyeong: null,
    supplyPrice: 198000,
    nextActionAt: Date.parse("2026-08-07T10:00:00+01:00"),
    lastContactAt: Date.parse("2026-08-04T11:05:00+01:00"),
  },
  "customer-lee": {
    budgetMin: 160000,
    budgetMax: 190000,
    areaMinPyeong: 34,
    areaMaxPyeong: null,
    supplyPrice: 148000,
    nextActionAt: Date.parse("2026-08-05T10:00:00+01:00"),
    lastContactAt: Date.parse("2026-08-05T08:50:00+01:00"),
  },
};

const DEMAND_NUMERIC_META: Record<string, DemandNumericMeta> = {
  "demand-han-sale": {
    budgetMin: 240000,
    budgetMax: 270000,
    areaMinPyeong: 32,
    areaMaxPyeong: null,
  },
  "demand-han-jeonse": {
    budgetMin: 90000,
    budgetMax: 130000,
    areaMinPyeong: 32,
    areaMaxPyeong: null,
  },
  "demand-han-monthly": {
    budgetMin: 50000,
    budgetMax: 70000,
    monthlyRentMin: 250,
    monthlyRentMax: 350,
    areaMinPyeong: 32,
    areaMaxPyeong: null,
  },
  "demand-kang-sale": {
    budgetMin: 230000,
    budgetMax: 260000,
    areaMinPyeong: 34,
    areaMaxPyeong: 34,
  },
  "demand-choi-sale": {
    budgetMin: 300000,
    budgetMax: 340000,
    areaMinPyeong: 34,
    areaMaxPyeong: 45,
  },
  "demand-bae-sale": {
    budgetMin: 180000,
    budgetMax: 220000,
    areaMinPyeong: 25,
    areaMaxPyeong: 34,
  },
  "demand-lee-sale": {
    budgetMin: 160000,
    budgetMax: 190000,
    areaMinPyeong: 34,
    areaMaxPyeong: null,
  },
};

const SUPPLY_PRICE_META: Record<string, number> = {
  "supply-kang-home": 185000,
  "supply-kim-sale": 198000,
  "supply-kim-jeonse": 120000,
  "supply-kim-monthly": 10000,
  "supply-lee-home": 148000,
};

const SUPPLY_MONTHLY_RENT_META: Record<string, number> = {
  "supply-kim-monthly": 350,
};

const SUPPLY_AREA_META: Record<string, number> = {
  "supply-kang-home": 34,
  "supply-kim-sale": 34,
  "supply-kim-jeonse": 25,
  "supply-kim-monthly": 25,
  "supply-lee-home": 34,
};

interface DependencyMeta {
  sourceIntentIds?: string[];
  sourceLabel?: string;
  targetIntentIds: string[];
}

const DEPENDENCY_META: Record<string, DependencyMeta> = {
  "step-han-deposit": {
    sourceLabel: "현 거주 전세보증금 9억",
    targetIntentIds: [
      "demand-han-sale",
      "demand-han-jeonse",
      "demand-han-monthly",
    ],
  },
  "step-han-loan": {
    sourceLabel: "가용자금·대출 계획",
    targetIntentIds: ["demand-han-sale"],
  },
  "step-kang-sale": {
    sourceIntentIds: ["supply-kang-home"],
    targetIntentIds: ["demand-kang-sale"],
  },
  "step-kang-balance": {
    sourceIntentIds: ["supply-kang-home"],
    targetIntentIds: ["demand-kang-sale"],
  },
  "step-choi-loan": {
    sourceLabel: "첫 주택 매수 자금",
    targetIntentIds: ["demand-choi-sale"],
  },
  "step-choi-family": {
    sourceLabel: "가족 지원금 6억",
    targetIntentIds: ["demand-choi-sale"],
  },
  "step-bae-cash": {
    sourceLabel: "현금성 자산",
    targetIntentIds: ["demand-bae-sale"],
  },
  "step-kim-confirm": {
    sourceLabel: "세입자 퇴거 일정",
    targetIntentIds: ["supply-kim-jeonse"],
  },
  "step-lee-contract": {
    sourceIntentIds: ["supply-lee-home"],
    targetIntentIds: ["demand-lee-sale"],
  },
};

const READINESS_RANK: Record<CustomerReadiness, number> = {
  review: 0,
  progress: 1,
  ready: 2,
};

export const CUSTOMER_LEDGER_ROWS: CustomerLedgerRow[] =
  CUSTOMER_MANAGEMENT_DEMO.map((customer) => {
    const numeric = NUMERIC_META[customer.id];
    const primaryDemand =
      customer.demands.find((demand) => demand.role === "주안") ??
      customer.demands[0] ??
      null;
    const primarySupply = customer.supplies[0] ?? null;

    return {
      id: customer.id,
      source: customer,
      name: customer.name,
      phone: customer.phone,
      mode: getCustomerMode(customer),
      primaryDemand,
      primarySupply,
      demandCount: customer.demands.length,
      supplyCount: customer.supplies.length,
      budgetMin: numeric.budgetMin,
      budgetMax: numeric.budgetMax,
      areaMinPyeong: numeric.areaMinPyeong,
      areaMaxPyeong: numeric.areaMaxPyeong,
      preferredRegion: primaryDemand?.regions ?? "—",
      supplyPrice: numeric.supplyPrice,
      supplyState: primarySupply?.state ?? "—",
      readiness: customer.readiness,
      readinessRank: READINESS_RANK[customer.readiness],
      matchCount: customer.demands.reduce(
        (total, demand) => total + demand.matches,
        0,
      ),
      unresolvedStepCount: customer.steps.filter(
        (step) => step.state !== "done",
      ).length,
      nextAction: customer.nextAction,
      nextActionDue: customer.nextActionDue,
      nextActionAt: numeric.nextActionAt,
      lastContact: customer.lastContact,
      lastContactAt: numeric.lastContactAt,
      assignee: customer.assignee,
    };
  });

export const LEDGER_SORT_LABELS: Record<string, string> = {
  customer: "고객",
  phone: "전화번호",
  mode: "고객유형",
  transactionType: "거래",
  demandTypes: "구하는 방식",
  intentCount: "전체 요건",
  demandCount: "구하는 조건",
  budgetMin: "최소예산",
  budgetMax: "최대예산",
  preferredRegion: "희망지역",
  area: "공급평형",
  areaMin: "최소평형",
  areaMax: "최대평형",
  supplyCount: "내놓은 물건",
  supplyPrice: "매매가·보증금",
  monthlyRentMin: "최소월세",
  monthlyRentMax: "최대월세",
  supplyState: "매물상태",
  readiness: "준비상태",
  matchCount: "매칭",
  unresolvedStepCount: "미완료",
  nextAction: "다음 액션",
  nextActionAt: "액션일",
  lastContactAt: "최근 연락",
  assignee: "담당",
};

export function getLedgerIntentLines(
  row: CustomerLedgerRow,
): LedgerIntentLine[] {
  const demandLines = row.source.demands.map((demand, index) => {
    const numeric = DEMAND_NUMERIC_META[demand.id];
    return {
      id: demand.id,
      kind: "demand" as const,
      ordinal: index + 1,
      transactionType: demand.transactionType,
      roleLabel: demand.role,
      budgetMin: numeric?.budgetMin ?? null,
      budgetMax: numeric?.budgetMax ?? null,
      askingPrice: null,
      monthlyRentMin: numeric?.monthlyRentMin ?? null,
      monthlyRentMax: numeric?.monthlyRentMax ?? null,
      locationLabel: demand.regions,
      areaMinPyeong: numeric?.areaMinPyeong ?? null,
      areaMaxPyeong: numeric?.areaMaxPyeong ?? null,
      areaLabel: demand.areaLabel.replace(/^공급\s*/, ""),
      matchCount: demand.matches,
      stateLabel: `${demand.matches}건`,
      timingLabel: demand.timingLabel,
    } satisfies LedgerIntentLine;
  });

  const supplyLines = row.source.supplies.map((supply, index) => {
    const areaPyeong = SUPPLY_AREA_META[supply.id] ?? null;
    return {
      id: supply.id,
      kind: "supply" as const,
      ordinal: index + 1,
      transactionType: supply.transactionType,
      roleLabel: "보유",
      budgetMin: null,
      budgetMax: null,
      askingPrice: SUPPLY_PRICE_META[supply.id] ?? null,
      monthlyRentMin: SUPPLY_MONTHLY_RENT_META[supply.id] ?? null,
      monthlyRentMax: SUPPLY_MONTHLY_RENT_META[supply.id] ?? null,
      locationLabel: supply.propertyLabel,
      areaMinPyeong: areaPyeong,
      areaMaxPyeong: areaPyeong,
      areaLabel: areaPyeong === null ? "—" : `${areaPyeong}평`,
      matchCount: null,
      stateLabel: supply.state,
      timingLabel: supply.timingLabel,
    } satisfies LedgerIntentLine;
  });

  return [...demandLines, ...supplyLines];
}

export function getLedgerDependencyLinks(
  row: CustomerLedgerRow,
): LedgerDependencyLink[] {
  const intentIds = new Set(getLedgerIntentLines(row).map((line) => line.id));
  const fallbackTargets =
    row.source.demands.length > 0
      ? row.source.demands.map((demand) => demand.id)
      : row.source.supplies.map((supply) => supply.id);

  return row.source.steps.map((step) => {
    const meta = DEPENDENCY_META[step.id];
    const sourceIntentIds = (meta?.sourceIntentIds ?? []).filter((id) =>
      intentIds.has(id),
    );
    const targetIntentIds = (meta?.targetIntentIds ?? fallbackTargets).filter(
      (id) => intentIds.has(id),
    );

    return {
      id: `${row.id}-${step.id}`,
      step,
      sourceIntentIds,
      sourceLabel:
        meta?.sourceLabel ??
        (sourceIntentIds.length === 0 ? row.source.currentSituation : ""),
      targetIntentIds,
    };
  });
}

export function buildLedgerDependencyGraph(
  row: CustomerLedgerRow,
): LedgerDependencyGraph {
  const intentById = new Map(
    getLedgerIntentLines(row).map((intent) => [intent.id, intent]),
  );
  const links = getLedgerDependencyLinks(row);
  const sources = new Map<string, LedgerDependencyGraphSource>();
  const targets = new Map<string, LedgerDependencyGraphTarget>();
  const edges: LedgerDependencyGraphEdge[] = [];

  const steps = links.map((link) => {
    const stepId = `step:${link.step.id}`;
    const sourceIds =
      link.sourceIntentIds.length > 0
        ? link.sourceIntentIds.map((intentId) => {
            const sourceId = `source:intent:${intentId}`;
            const intent = intentById.get(intentId) ?? null;
            if (!sources.has(sourceId)) {
              sources.set(sourceId, {
                id: sourceId,
                label: intent?.locationLabel ?? "출발 요건 미지정",
                intent,
              });
            }
            return sourceId;
          })
        : (() => {
            const label = link.sourceLabel || "출발 요건 미지정";
            const sourceId = `source:context:${label}`;
            if (!sources.has(sourceId)) {
              sources.set(sourceId, { id: sourceId, label, intent: null });
            }
            return [sourceId];
          })();

    for (const sourceId of sourceIds) {
      edges.push({
        id: `${sourceId}->${stepId}`,
        fromId: sourceId,
        toId: stepId,
        phase: "source-to-step",
        targetKind: null,
      });
    }

    const targetIds =
      link.targetIntentIds.length > 0
        ? link.targetIntentIds.map((intentId) => {
            const targetId = `target:intent:${intentId}`;
            const intent = intentById.get(intentId) ?? null;
            if (!targets.has(targetId)) {
              targets.set(targetId, {
                id: targetId,
                label: intent?.locationLabel ?? "거래 목표 미지정",
                intent,
              });
            }
            return targetId;
          })
        : (() => {
            const targetId = `target:unassigned:${link.step.id}`;
            if (!targets.has(targetId)) {
              targets.set(targetId, {
                id: targetId,
                label: "거래 목표 미지정",
                intent: null,
              });
            }
            return [targetId];
          })();

    for (const targetId of targetIds) {
      edges.push({
        id: `${stepId}->${targetId}`,
        fromId: stepId,
        toId: targetId,
        phase: "step-to-target",
        targetKind: targets.get(targetId)?.intent?.kind ?? null,
      });
    }

    return { id: stepId, link };
  });

  return {
    sources: [...sources.values()],
    steps,
    targets: [...targets.values()],
    edges,
  };
}

export function sortLedgerIntentGroups(
  rows: CustomerLedgerRow[],
  sorting: SortingState,
): CustomerLedgerRow[] {
  const active = sorting[0];
  if (!active || !INTENT_SORT_FIELDS.has(active.id)) {
    return sortLedgerRows(rows, sorting);
  }

  const direction = active.desc ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const aValue = intentGroupSortValue(a, active.id);
    const bValue = intentGroupSortValue(b, active.id);

    if (aValue === null && bValue === null) {
      return a.name.localeCompare(b.name, "ko-KR");
    }
    if (aValue === null) return 1;
    if (bValue === null) return -1;

    const comparison = compareValues(aValue, bValue);
    if (comparison !== 0) return comparison * direction;
    return a.name.localeCompare(b.name, "ko-KR");
  });
}

const INTENT_SORT_FIELDS = new Set([
  "intentCount",
  "transactionType",
  "budgetMin",
  "budgetMax",
  "supplyPrice",
  "monthlyRentMin",
  "monthlyRentMax",
  "preferredRegion",
  "area",
  "areaMin",
  "areaMax",
  "matchCount",
]);

function intentGroupSortValue(
  row: CustomerLedgerRow,
  field: string,
): string | number | null {
  const lines = getLedgerIntentLines(row);
  const numericValues = (select: (line: LedgerIntentLine) => number | null) =>
    lines.map(select).filter((value): value is number => value !== null);

  switch (field) {
    case "intentCount":
      return lines.length;
    case "transactionType":
      return [...new Set(lines.map((line) => line.transactionType))].join(
        " · ",
      );
    case "budgetMin": {
      const values = numericValues((line) => line.budgetMin);
      return values.length > 0 ? Math.min(...values) : null;
    }
    case "budgetMax": {
      const values = numericValues((line) => line.budgetMax);
      return values.length > 0 ? Math.max(...values) : null;
    }
    case "supplyPrice": {
      const values = numericValues((line) => line.askingPrice);
      return values.length > 0 ? Math.min(...values) : null;
    }
    case "monthlyRentMin": {
      const values = numericValues((line) => line.monthlyRentMin);
      return values.length > 0 ? Math.min(...values) : null;
    }
    case "monthlyRentMax": {
      const values = numericValues((line) => line.monthlyRentMax);
      return values.length > 0 ? Math.max(...values) : null;
    }
    case "preferredRegion":
      return lines[0]?.locationLabel ?? null;
    case "area": {
      const values = numericValues((line) => line.areaMinPyeong);
      return values.length > 0 ? Math.min(...values) : null;
    }
    case "areaMin": {
      const values = numericValues((line) => line.areaMinPyeong);
      return values.length > 0 ? Math.min(...values) : null;
    }
    case "areaMax": {
      const values = numericValues((line) => line.areaMaxPyeong);
      return values.length > 0 ? Math.max(...values) : null;
    }
    case "matchCount": {
      const values = numericValues((line) => line.matchCount);
      return values.length > 0
        ? values.reduce((total, value) => total + value, 0)
        : null;
    }
    default:
      return null;
  }
}

export function formatLedgerPrice(value: number | null): string {
  if (value === null) return "—";
  const eok = Math.floor(value / 10000);
  const remainder = value % 10000;
  if (remainder === 0) return `${eok}억`;
  return `${eok}억 ${remainder.toLocaleString("ko-KR")}만`;
}

export function formatLedgerMonthlyRent(value: number | null): string {
  return value === null ? "—" : `${value.toLocaleString("ko-KR")}만`;
}

export function formatLedgerArea(row: CustomerLedgerRow): string {
  if (row.areaMinPyeong === null) return "—";
  if (row.areaMaxPyeong === null) return `${row.areaMinPyeong}평+`;
  if (row.areaMinPyeong === row.areaMaxPyeong) return `${row.areaMinPyeong}평`;
  return `${row.areaMinPyeong}~${row.areaMaxPyeong}평`;
}

export function includesLedgerQuery(
  row: CustomerLedgerRow,
  query: string,
): boolean {
  const normalized = query.trim().toLocaleLowerCase("ko-KR");
  if (!normalized) return true;

  return [
    row.name,
    row.phone,
    row.assignee,
    row.preferredRegion,
    row.nextAction,
    row.source.currentSituation,
    ...row.source.demands.flatMap((demand) => [
      demand.transactionType,
      demand.priceLabel,
      demand.regions,
      demand.areaLabel,
    ]),
    ...row.source.supplies.flatMap((supply) => [
      supply.propertyLabel,
      supply.transactionType,
      supply.priceLabel,
    ]),
    ...row.source.steps.flatMap((step) => [
      step.label,
      step.detail,
      step.requiredBefore,
    ]),
  ]
    .join(" ")
    .toLocaleLowerCase("ko-KR")
    .includes(normalized);
}

export function sortLedgerRows(
  rows: CustomerLedgerRow[],
  sorting: SortingState,
): CustomerLedgerRow[] {
  const active = sorting[0];
  if (!active) return rows.slice();

  const direction = active.desc ? -1 : 1;
  return rows.slice().sort((a, b) => {
    const aValue = sortValue(a, active.id);
    const bValue = sortValue(b, active.id);

    // Empty cells stay at the bottom in both directions, as in the property
    // ledger. Applying the direction after this check would pull them to the
    // top for descending sorts.
    if (aValue === null && bValue === null) {
      return a.name.localeCompare(b.name, "ko-KR");
    }
    if (aValue === null) return 1;
    if (bValue === null) return -1;

    const comparison = compareValues(aValue, bValue);
    if (comparison !== 0) return comparison * direction;
    return a.name.localeCompare(b.name, "ko-KR");
  });
}

function sortValue(
  row: CustomerLedgerRow,
  field: string,
): string | number | null {
  switch (field) {
    case "customer":
      return row.name;
    case "phone":
      return row.phone;
    case "mode":
      return row.mode;
    case "transactionType":
      return row.primaryDemand?.transactionType ?? null;
    case "demandTypes":
      return row.source.demands
        .map((demand) => demand.transactionType)
        .join(" · ");
    case "intentCount":
      return row.demandCount + row.supplyCount;
    case "demandCount":
      return row.demandCount;
    case "budgetMin":
      return row.budgetMin;
    case "budgetMax":
      return row.budgetMax;
    case "preferredRegion":
      return row.preferredRegion;
    case "area":
      return row.areaMinPyeong;
    case "supplyCount":
      return row.supplyCount;
    case "supplyPrice":
      return row.supplyPrice;
    case "supplyState":
      return row.supplyState;
    case "readiness":
      return row.readinessRank;
    case "matchCount":
      return row.matchCount;
    case "unresolvedStepCount":
      return row.unresolvedStepCount;
    case "nextAction":
      return row.nextAction;
    case "nextActionAt":
      return row.nextActionAt;
    case "lastContactAt":
      return row.lastContactAt;
    case "assignee":
      return row.assignee;
    default:
      return row.name;
  }
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ko-KR", { numeric: true });
}

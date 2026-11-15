import type { Match } from "@estate-erp/api-client";
import { MatchStage, normalizeMatchStage } from "@estate-erp/shared";

export const matchTableColumns = [
  { id: "customer", label: "고객", width: 140, minWidth: 110 },
  { id: "phone", label: "연락처", width: 140, minWidth: 110 },
  { id: "trade", label: "거래", width: 74, minWidth: 74 },
  { id: "budget", label: "예산", width: 180, minWidth: 130 },
  { id: "area", label: "면적", width: 120, minWidth: 90 },
  { id: "stage", label: "단계", width: 164, minWidth: 130 },
  { id: "memo", label: "메모", width: 180, minWidth: 120 },
  { id: "assignee", label: "담당", width: 84, minWidth: 80 },
] as const;

export type MatchColumnId = (typeof matchTableColumns)[number]["id"];
export type MatchSortId = MatchColumnId | "need" | "monthlyRent";
export type MatchTableSort = {
  column: MatchSortId;
  direction: "asc" | "desc";
} | null;
export type MatchColumnWidths = Partial<Record<MatchColumnId, number>>;
export type MatchTablePreferences = {
  widths: MatchColumnWidths;
  sort: MatchTableSort;
};
export const MAX_MATCH_COLUMN_WIDTH = 1200;
export const defaultMatchTablePreferences: MatchTablePreferences = {
  widths: {},
  sort: { column: "need", direction: "desc" },
};
export const matchSortLabels: Record<MatchSortId, string> = {
  customer: "고객",
  phone: "연락처",
  trade: "거래",
  budget: "예산 상한",
  area: "면적 상한",
  stage: "단계",
  memo: "메모",
  assignee: "담당",
  need: "머문 일수",
  monthlyRent: "월세 상한",
};

export function clampMatchColumnWidth(id: MatchColumnId, width: number) {
  const column = matchTableColumns.find((column) => column.id === id)!;
  return Number.isFinite(width)
    ? Math.round(
        Math.max(column.minWidth, Math.min(MAX_MATCH_COLUMN_WIDTH, width)),
      )
    : column.width;
}

/** Preferences contain layout only; malformed/obsolete local data cannot break the table. */
export function parseMatchTablePreferences(
  raw: string | null,
): MatchTablePreferences {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value))
      return defaultMatchTablePreferences;
    const widths: MatchColumnWidths = {};
    for (const column of matchTableColumns) {
      const width = value.widths?.[column.id];
      if (typeof width === "number" && Number.isFinite(width)) {
        widths[column.id] = clampMatchColumnWidth(column.id, width);
      }
    }
    const sort =
      value.sort === null
        ? null
        : value.sort &&
            Object.hasOwn(matchSortLabels, value.sort.column) &&
            ["asc", "desc"].includes(value.sort.direction)
          ? ({
              column: value.sort.column,
              direction: value.sort.direction,
            } as Exclude<MatchTableSort, null>)
          : defaultMatchTablePreferences.sort;
    return { widths, sort };
  } catch {
    return defaultMatchTablePreferences;
  }
}

export function getMatchTableLayout(widths: MatchColumnWidths) {
  const totalWidth =
    24 +
    matchTableColumns.reduce(
      (sum, column) => sum + (widths[column.id] ?? column.width),
      0,
    );
  return {
    gridTemplateColumns: [
      "24px",
      ...matchTableColumns.map((column) =>
        column.id === "memo" && widths.memo === undefined
          ? `minmax(${column.width}px, 1fr)`
          : `${widths[column.id] ?? column.width}px`,
      ),
    ].join(" "),
    // Before the first resize memo fills spare space. A drag freezes measured widths
    // so even the flexible memo column follows the pointer exactly.
    width: widths.memo === undefined ? undefined : totalWidth + 36,
    minWidth: totalWidth + 36,
  };
}

const collator = new Intl.Collator("ko", {
  numeric: true,
  sensitivity: "base",
});
const tradeLabels: Record<string, string> = {
  sale: "매매",
  jeonse: "전세",
  monthly: "월세",
};
const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const textOrNull = (value: string | null | undefined) => value?.trim() || null;

export function sortMatchGroups(
  matches: readonly Match[],
  sort: MatchTableSort,
  stageIndex: (stage: string) => number,
  stageDays: (match: Match) => number | null,
) {
  const valueOf = (match: Match): string | number | null => {
    const buyer = match.buyerRequirement;
    switch (sort?.column) {
      case "customer":
        return textOrNull(buyer?.contact?.name);
      case "phone":
        return textOrNull(buyer?.contact?.phone?.replace(/\D/g, ""));
      case "trade":
        return buyer?.transactionType
          ? (tradeLabels[buyer.transactionType] ?? buyer.transactionType)
          : null;
      case "budget":
        return numberOrNull(
          buyer?.transactionType === "monthly"
            ? buyer.depositMax
            : (buyer?.priceMax ?? buyer?.depositMax),
        );
      case "monthlyRent":
        return buyer?.transactionType === "monthly"
          ? numberOrNull(buyer.monthlyRentMax)
          : null;
      case "area":
        return numberOrNull(buyer?.areaMax);
      case "stage": {
        const index = stageIndex(match.stage);
        return index < 0 ? null : index;
      }
      case "memo":
        return textOrNull(match.memo);
      case "assignee":
        return textOrNull(buyer?.assignedTo?.name);
      case "need":
        return stageDays(match);
      default:
        return null;
    }
  };
  const compare = (a: Match, b: Match) => {
    if (!sort) return 0;
    const left = valueOf(a),
      right = valueOf(b);
    // Unknown upper bounds/dates stay last in BOTH directions.
    if (left === null || right === null)
      return left === right ? 0 : left === null ? 1 : -1;
    const order =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : collator.compare(String(left), String(right));
    if (order) return order * (sort.direction === "asc" ? 1 : -1);
    return sort.column === "need"
      ? stageIndex(b.stage) - stageIndex(a.stage)
      : 0;
  };
  const groups: { won: Match[]; rest: Match[]; closed: Match[] } = {
    won: [],
    rest: [],
    closed: [],
  };
  for (const match of matches) {
    const stage = normalizeMatchStage(match.stage);
    groups[
      stage === MatchStage.DEAL_CREATED
        ? "won"
        : stage === MatchStage.CLOSED
          ? "closed"
          : "rest"
    ].push(match);
  }
  for (const group of Object.values(groups)) group.sort(compare);
  return groups;
}

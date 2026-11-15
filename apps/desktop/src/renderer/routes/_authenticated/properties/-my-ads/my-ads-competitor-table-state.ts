// 내광고관리 펼침 패널의 네이버 비교 광고 표. 매물관리 펼침 광고 표(property-ad-table-state)와
// 같은 규칙: 원래 값으로 정렬, 빈 값은 양방향에서 끝, 정렬 해제 시 응답 순서, 한 열만 남는 폭을 차지.

export const competitorTableColumns = [
  { id: "rank", label: "순위", width: 76, minWidth: 68 },
  { id: "realtor", label: "중개사", width: 200, minWidth: 140 },
  { id: "price", label: "가격", width: 180, minWidth: 120 },
  { id: "floor", label: "층 노출", width: 124, minWidth: 100 },
  { id: "confirmedAt", label: "확인일", width: 104, minWidth: 90 },
  { id: "options", label: "광고 옵션", width: 128, minWidth: 100 },
  { id: "comparison", label: "내 광고 대비", width: 148, minWidth: 120 },
] as const;
export type CompetitorColumnId = (typeof competitorTableColumns)[number]["id"];
export type CompetitorColumnWidths = Partial<Record<CompetitorColumnId, number>>;
export type CompetitorTableSort = {
  column: CompetitorColumnId;
  direction: "asc" | "desc";
} | null;
export type CompetitorTablePreferences = {
  widths: CompetitorColumnWidths;
  sort: CompetitorTableSort;
};

/** 저장된 너비가 없을 때 남는 폭을 차지하는 열. 긴 중개사명을 덜 자르기 위해서다. */
export const COMPETITOR_FLEX_COLUMN: CompetitorColumnId = "realtor";
export const MAX_COMPETITOR_COLUMN_WIDTH = 1200;
export const defaultCompetitorTablePreferences: CompetitorTablePreferences = {
  widths: {},
  sort: null,
};
export const competitorSortLabels = Object.fromEntries(
  competitorTableColumns.map((column) => [column.id, column.label]),
) as Record<CompetitorColumnId, string>;

export function competitorTableStorageKey(officeId: string, userId: string) {
  return `estate:my-ads-competitor-table:v1:${officeId}:${userId}`;
}

const columnById = Object.fromEntries(
  competitorTableColumns.map((column) => [column.id, column]),
) as Record<CompetitorColumnId, (typeof competitorTableColumns)[number]>;

export function clampCompetitorColumnWidth(id: CompetitorColumnId, width: number) {
  const column = columnById[id];
  return Number.isFinite(width)
    ? Math.round(
        Math.max(column.minWidth, Math.min(MAX_COMPETITOR_COLUMN_WIDTH, width)),
      )
    : column.width;
}

export function parseCompetitorTablePreferences(
  raw: string | null,
): CompetitorTablePreferences {
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return defaultCompetitorTablePreferences;
    }
    const widths: CompetitorColumnWidths = {};
    for (const column of competitorTableColumns) {
      const width = value.widths?.[column.id];
      if (typeof width === "number" && Number.isFinite(width)) {
        widths[column.id] = clampCompetitorColumnWidth(column.id, width);
      }
    }
    const sort: CompetitorTableSort =
      value.sort &&
      typeof value.sort.column === "string" &&
      Object.hasOwn(competitorSortLabels, value.sort.column) &&
      ["asc", "desc"].includes(value.sort.direction)
        ? { column: value.sort.column, direction: value.sort.direction }
        : null;
    return { widths, sort };
  } catch {
    return defaultCompetitorTablePreferences;
  }
}

/** 선택 체크박스가 없으므로 매물관리 광고 표와 달리 왼쪽 36px 여백을 더하지 않는다. */
export function getCompetitorTableLayout(widths: CompetitorColumnWidths) {
  const flexible = widths[COMPETITOR_FLEX_COLUMN] === undefined;
  const totalWidth = competitorTableColumns.reduce(
    (sum, column) => sum + (widths[column.id] ?? column.width),
    0,
  );
  return {
    gridTemplateColumns: competitorTableColumns
      .map((column) =>
        column.id === COMPETITOR_FLEX_COLUMN && flexible
          ? `minmax(${column.width}px, 1fr)`
          : `${widths[column.id] ?? column.width}px`,
      )
      .join(" "),
    width: flexible ? undefined : totalWidth,
    minWidth: totalWidth,
  };
}

export type CompetitorPriceRelation =
  | "mine"
  | "lower"
  | "same"
  | "higher"
  | "incomparable"
  | "unknown";

/** 화면에 보이는 값의 원래 형태. 분석 함수 결과를 패널이 한 번 계산해 넘긴다. */
export type CompetitorTableRow = {
  id: string;
  ranking: number | null;
  realtorName: string | null;
  /** 매매가, 전세 보증금, 월세 보증금 (만원) */
  primaryAmount: number | null;
  /** 월세일 때만 값이 있다 (만원) */
  monthlyRent: number | null;
  floorInfo: string | null;
  floorExposureMode: "exact" | "band" | "unknown";
  /** 네이버 확인일 YYYYMMDD */
  articleConfirmYmd: string | null;
  seango: boolean;
  epju: boolean;
  priceRelation: CompetitorPriceRelation;
  isAhead: boolean;
};

type SortPart = number | string | null;

const collator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });
const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const textOrNull = (value: string | null | undefined) => value?.trim() || null;

const floorModeOrder = { exact: 0, band: 1, unknown: 2 } as const;
const floorBandOrder: Record<string, number> = { 저: 1, 중: 2, 고: 3 };
// 내 광고보다 싼 → 내 광고 → 같은 → 비싼 → 조건이 달라 비교할 수 없는 순. 비교 불가는 빈 값.
const relationOrder: Partial<Record<CompetitorPriceRelation, number>> = {
  lower: 0,
  mine: 1,
  same: 2,
  higher: 3,
  incomparable: 4,
};

/** "12/25" → 12, "B1/25" → -1, "중/25" → 2 (저 1 · 중 2 · 고 3) */
function floorLevel(floorInfo: string): number | string {
  const token = (floorInfo.split("/")[0] ?? "").trim().replace(/층$/u, "");
  if (/^-?\d+$/u.test(token)) return Number(token);
  const basement = /^(?:B|지하\s*)(\d+)$/iu.exec(token);
  if (basement) return -Number(basement[1]);
  return floorBandOrder[token] ?? token;
}

function sortParts(row: CompetitorTableRow, column: CompetitorColumnId): SortPart[] {
  switch (column) {
    case "rank":
      return [numberOrNull(row.ranking)];
    case "realtor":
      return [textOrNull(row.realtorName)];
    case "price":
      // 월세는 보증금이 같을 때 월세로 이어서 비교한다.
      return [numberOrNull(row.primaryAmount), numberOrNull(row.monthlyRent)];
    case "floor": {
      const floorInfo = textOrNull(row.floorInfo);
      return floorInfo
        ? [floorModeOrder[row.floorExposureMode], floorLevel(floorInfo)]
        : [null];
    }
    case "confirmedAt":
      return [
        row.articleConfirmYmd && /^\d{8}$/.test(row.articleConfirmYmd)
          ? Number(row.articleConfirmYmd)
          : null,
      ];
    case "options": {
      // 표시가 "—"인 옵션 없음은 빈 값으로 둔다.
      const weight = (row.seango ? 2 : 0) + (row.epju ? 1 : 0);
      return [weight > 0 ? weight : null];
    }
    case "comparison":
      return [relationOrder[row.priceRelation] ?? null, row.isAhead ? 0 : 1];
  }
}

function comparePart(left: number | string, right: number | string) {
  if (typeof left === "number" && typeof right === "number") return left - right;
  if (typeof left !== typeof right) return typeof left === "number" ? -1 : 1;
  return collator.compare(String(left), String(right));
}

/** 정렬 해제(null)는 응답 순서를 그대로 돌려준다. 같은 값은 원래 순서를 유지한다. */
export function sortCompetitorRows<T extends CompetitorTableRow>(
  rows: readonly T[],
  sort: CompetitorTableSort,
): T[] {
  if (!sort) return [...rows];
  const direction = sort.direction === "asc" ? 1 : -1;
  const keyed = rows.map((row) => ({ row, parts: sortParts(row, sort.column) }));
  keyed.sort((a, b) => {
    for (let index = 0; index < a.parts.length; index += 1) {
      const left = a.parts[index] ?? null;
      const right = b.parts[index] ?? null;
      // 빈 값은 방향과 무관하게 뒤로 보낸다. 0은 값이다.
      if (left === null || right === null) {
        if (left === right) continue;
        return left === null ? 1 : -1;
      }
      const order = comparePart(left, right);
      if (order !== 0) return order * direction;
    }
    return 0;
  });
  return keyed.map(({ row }) => row);
}

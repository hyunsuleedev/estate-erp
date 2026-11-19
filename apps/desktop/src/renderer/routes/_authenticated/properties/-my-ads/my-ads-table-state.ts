import type { SortingState } from "@tanstack/react-table";

/**
 * 내광고관리 표의 열 너비·정렬 저장값. 매물관리 광고 표(property-ad-table-state.ts)와
 * 같은 방식이다: 깨진 저장값은 기본값으로, 너비는 열마다 최소·최대 사이로 맞춘다.
 *
 * "경쟁 대비"(analysis)는 남는 폭을 채우는 열이라 너비를 저장하지 않는다.
 *
 * 기본 너비는 기본 상태에서 머리글(아이콘 16 + 간격 6 + 13px 글자, 좌우 여백 20)과 흔한 값
 * ("1503호", "114C", "부동산뱅크 수동")이 잘리지 않는 값이다.
 */
export const myAdsResizableColumns = [
  { id: "site", width: 156, minWidth: 96 },
  { id: "dong", width: 64, minWidth: 48 },
  { id: "floor", width: 58, minWidth: 48 },
  { id: "ho", width: 76, minWidth: 48 },
  { id: "type", width: 76, minWidth: 48 },
  { id: "link", width: 124, minWidth: 84 },
  { id: "transaction", width: 72, minWidth: 60 },
  { id: "price", width: 155, minWidth: 110 },
  { id: "monthlyRent", width: 86, minWidth: 64 },
  { id: "channel", width: 140, minWidth: 72 },
  { id: "naver", width: 96, minWidth: 84 },
  { id: "verification", width: 104, minWidth: 72 },
  { id: "exposurePeriod", width: 128, minWidth: 96 },
  { id: "request", width: 96, minWidth: 72 },
  { id: "ranking", width: 104, minWidth: 88 },
  { id: "floorExposure", width: 112, minWidth: 88 },
  { id: "checkedAt", width: 92, minWidth: 76 },
] as const;

export type MyAdsResizableColumnId = (typeof myAdsResizableColumns)[number]["id"];
export type MyAdsColumnWidths = Partial<Record<MyAdsResizableColumnId, number>>;

export const MY_ADS_FILL_COLUMN = { id: "analysis", width: 152, minWidth: 152 } as const;
export const MAX_MY_ADS_COLUMN_WIDTH = 640;

/**
 * 기본 너비를 바꾼 판 번호. 저장값에 함께 적는다.
 *
 * 저장값에는 사용자가 기본값과 다르게 끈 열만 남는다(normalizeMyAdsColumnWidths). 그래서 판 번호가
 * 없는(=옛 판에서 저장된) 값 중 그 판의 기본 너비와 같은 값은 사용자가 고른 너비가 아니라 옛 기본값이
 * 남은 것으로 보고 버린다 — 손대지 않은 열은 새 기본 너비를 따른다. 새 판에서 저장된 값은 그대로 믿는다.
 */
export const MY_ADS_WIDTH_DEFAULTS_VERSION = 2;
const previousDefaultWidths: Record<number, MyAdsColumnWidths> = {
  1: { ho: 64, type: 64, transaction: 64, channel: 96 },
};

/** "링크"(naver)는 정렬하지 않는다. */
export const myAdsSortableColumnIds = [
  ...myAdsResizableColumns
    .map((column) => column.id)
    .filter((id) => id !== "naver"),
  MY_ADS_FILL_COLUMN.id,
] as const;
export type MyAdsSortableColumnId = (typeof myAdsSortableColumnIds)[number];

export type MyAdsTableSort = {
  column: MyAdsSortableColumnId;
  direction: "asc" | "desc";
} | null;

export type MyAdsTablePreferences = {
  widths: MyAdsColumnWidths;
  sort: MyAdsTableSort;
};

export const defaultMyAdsTablePreferences: MyAdsTablePreferences = {
  widths: {},
  sort: null,
};

const resizableColumnById = Object.fromEntries(
  myAdsResizableColumns.map((column) => [column.id, column]),
) as Record<MyAdsResizableColumnId, (typeof myAdsResizableColumns)[number]>;
const sortableColumnIds = new Set<string>(myAdsSortableColumnIds);

export function myAdsTablePreferencesKey(officeId: string, userId: string) {
  return `estate:my-ads-table:v1:${officeId}:${userId}`;
}

export function myAdsDefaultColumnWidth(id: MyAdsResizableColumnId): number {
  return resizableColumnById[id].width;
}

export function myAdsMinColumnWidth(id: MyAdsResizableColumnId): number {
  return resizableColumnById[id].minWidth;
}

export function clampMyAdsColumnWidth(id: MyAdsResizableColumnId, width: number) {
  const column = resizableColumnById[id];
  return Number.isFinite(width)
    ? Math.round(Math.max(column.minWidth, Math.min(MAX_MY_ADS_COLUMN_WIDTH, width)))
    : column.width;
}

/** 표가 알려 준 너비에서 아는 열만 남기고 범위를 맞춘다. 기본 너비와 같은 값은 지운다. */
export function normalizeMyAdsColumnWidths(
  sizing: Record<string, unknown> | null | undefined,
): MyAdsColumnWidths {
  const widths: MyAdsColumnWidths = {};
  if (!sizing || typeof sizing !== "object" || Array.isArray(sizing)) return widths;
  for (const column of myAdsResizableColumns) {
    const width = sizing[column.id];
    if (typeof width !== "number" || !Number.isFinite(width)) continue;
    const clamped = clampMyAdsColumnWidth(column.id, width);
    if (clamped !== column.width) widths[column.id] = clamped;
  }
  return widths;
}

export function parseMyAdsTablePreferences(raw: string | null): MyAdsTablePreferences {
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return defaultMyAdsTablePreferences;
    }
    const record = value as {
      widths?: unknown;
      sort?: unknown;
      widthDefaultsVersion?: unknown;
    };
    const widthDefaultsVersion =
      typeof record.widthDefaultsVersion === "number"
        ? record.widthDefaultsVersion
        : 1;
    const widths = normalizeMyAdsColumnWidths(
      dropPreviousDefaultWidths(
        record.widths as Record<string, unknown> | undefined,
        widthDefaultsVersion,
      ),
    );
    return { widths, sort: parseMyAdsTableSort(record.sort) };
  } catch {
    return defaultMyAdsTablePreferences;
  }
}

/** 저장할 문자열. 기본 너비 판 번호를 함께 적는다(parseMyAdsTablePreferences가 읽는다). */
export function serializeMyAdsTablePreferences(
  preferences: MyAdsTablePreferences,
): string {
  return JSON.stringify({
    ...preferences,
    widthDefaultsVersion: MY_ADS_WIDTH_DEFAULTS_VERSION,
  });
}

function dropPreviousDefaultWidths(
  widths: Record<string, unknown> | null | undefined,
  savedVersion: number,
): Record<string, unknown> | null | undefined {
  if (!widths || typeof widths !== "object" || Array.isArray(widths)) return widths;
  if (savedVersion >= MY_ADS_WIDTH_DEFAULTS_VERSION) return widths;
  const kept: Record<string, unknown> = { ...widths };
  for (let version = savedVersion; version < MY_ADS_WIDTH_DEFAULTS_VERSION; version += 1) {
    const defaults: Record<string, number | undefined> = previousDefaultWidths[version] ?? {};
    for (const [id, width] of Object.entries(defaults)) {
      if (kept[id] === width) delete kept[id];
    }
  }
  return kept;
}

function parseMyAdsTableSort(value: unknown): MyAdsTableSort {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const { column, direction } = value as { column?: unknown; direction?: unknown };
  if (typeof column !== "string" || !sortableColumnIds.has(column)) return null;
  if (direction !== "asc" && direction !== "desc") return null;
  return { column: column as MyAdsSortableColumnId, direction };
}

/** DataTable의 정렬 상태 ↔ 저장값. 한 열 정렬만 쓴다. */
export function myAdsSortToSorting(sort: MyAdsTableSort): SortingState {
  return sort ? [{ id: sort.column, desc: sort.direction === "desc" }] : [];
}

export function sortingToMyAdsSort(sorting: SortingState): MyAdsTableSort {
  const first = sorting[0];
  if (!first || !sortableColumnIds.has(first.id)) return null;
  return {
    column: first.id as MyAdsSortableColumnId,
    direction: first.desc ? "desc" : "asc",
  };
}

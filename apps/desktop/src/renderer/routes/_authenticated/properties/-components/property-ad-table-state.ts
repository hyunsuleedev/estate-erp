import type { ListingAdvertisement } from '@estate-erp/api-client';
import { getAdChannelLabel } from '../../../../lib/advertisement-channels';
export { getAdChannelLabel } from '../../../../lib/advertisement-channels';

export const adTableColumns = [
  { id: 'trade', label: '거래', width: 74, minWidth: 74 },
  { id: 'channel', label: '광고 채널', width: 156, minWidth: 110 },
  { id: 'status', label: '상태', width: 104, minWidth: 90 },
  { id: 'price', label: '가격/보증금', width: 180, minWidth: 130 },
  { id: 'monthlyRent', label: '월세', width: 104, minWidth: 90 },
  { id: 'startedAt', label: '등록일', width: 112, minWidth: 90 },
  { id: 'memo', label: '메모', width: 180, minWidth: 120 },
  { id: 'url', label: '원문', width: 108, minWidth: 100 },
] as const;
export type AdColumnId = (typeof adTableColumns)[number]['id'];
export type AdColumnWidths = Partial<Record<AdColumnId, number>>;
export type AdTableSort = { column: AdColumnId; direction: 'asc' | 'desc' } | null;
export type AdTablePreferences = { widths: AdColumnWidths; sort: AdTableSort };
export interface AdTableControls {
  preferences: AdTablePreferences;
  selection: {
    selectedIds: ReadonlySet<string>;
    onChange: (id: string, selected: boolean) => void;
    onSelectAll: (selected: boolean) => void;
  };
  onSort: (sort: AdTableSort) => void;
  onPreviewResize: (widths: AdColumnWidths | null) => void;
  onCommitResize: (widths: AdColumnWidths) => void;
  onResetWidth: (column: AdColumnId) => void;
}
export type PropertyAdRow = {
  listing: { transactionType: string };
  advertisement: ListingAdvertisement;
};
export const MAX_AD_COLUMN_WIDTH = 1200;
export const defaultAdTablePreferences: AdTablePreferences = { widths: {}, sort: null };
export const adSortLabels = Object.fromEntries(adTableColumns.map(c => [c.id, c.label])) as Record<AdColumnId, string>;

export function clampAdColumnWidth(id: AdColumnId, width: number) {
  const column = adTableColumns.find(c => c.id === id)!;
  return Number.isFinite(width)
    ? Math.round(Math.max(column.minWidth, Math.min(MAX_AD_COLUMN_WIDTH, width)))
    : column.width;
}
export function parseAdTablePreferences(raw: string | null): AdTablePreferences {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return defaultAdTablePreferences;
    const widths: AdColumnWidths = {};
    for (const column of adTableColumns) {
      const width = value.widths?.[column.id];
      if (typeof width === 'number' && Number.isFinite(width)) widths[column.id] = clampAdColumnWidth(column.id, width);
    }
    const sort: AdTableSort = value.sort && Object.hasOwn(adSortLabels, value.sort.column)
      && ['asc', 'desc'].includes(value.sort.direction)
      ? { column: value.sort.column, direction: value.sort.direction } : null;
    return { widths, sort };
  } catch { return defaultAdTablePreferences; }
}
export function getAdTableLayout(widths: AdColumnWidths) {
  const totalWidth = adTableColumns.reduce((sum, c) => sum + (widths[c.id] ?? c.width), 0);
  return {
    gridTemplateColumns: adTableColumns.map(c => c.id === 'memo' && widths.memo === undefined
      ? `minmax(${c.width}px, 1fr)` : `${widths[c.id] ?? c.width}px`).join(' '),
    width: widths.memo === undefined ? undefined : totalWidth + 36,
    minWidth: totalWidth + 36,
  };
}

const collator = new Intl.Collator('ko', { numeric: true, sensitivity: 'base' });
const numberOrNull = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const textOrNull = (value: string | null | undefined) => value?.trim() || null;

/** Sort displayed ad values, never the parent listing's potentially different price. */
export function sortPropertyAdRows<T extends PropertyAdRow>(rows: readonly T[], sort: AdTableSort): T[] {
  if (!sort) return [...rows];
  const valueOf = ({ listing, advertisement: ad }: PropertyAdRow): string | number | null => {
    switch (sort.column) {
      case 'trade': return ({ sale: '매매', jeonse: '전세', monthly: '월세' } as Record<string, string>)[listing.transactionType] ?? listing.transactionType;
      case 'channel': return textOrNull(getAdChannelLabel(ad.channel));
      case 'status': return ad.status === 'active' ? 0 : ad.status === 'ended' ? 1 : null;
      case 'price': return numberOrNull(ad.advertisedPrice ?? ad.advertisedDeposit);
      case 'monthlyRent': return numberOrNull(ad.advertisedMonthlyRent);
      case 'startedAt': return ad.startedAt ? numberOrNull(Date.parse(ad.startedAt)) : null;
      case 'memo': return textOrNull(ad.memo);
      case 'url': return textOrNull(ad.url);
    }
  };
  return [...rows].sort((a, b) => {
    const left = valueOf(a), right = valueOf(b);
    // Missing values stay last in both directions; zero remains a real amount.
    if (left === null || right === null) return left === right ? 0 : left === null ? 1 : -1;
    const order = typeof left === 'number' && typeof right === 'number'
      ? left - right : collator.compare(String(left), String(right));
    return order * (sort.direction === 'asc' ? 1 : -1);
  });
}

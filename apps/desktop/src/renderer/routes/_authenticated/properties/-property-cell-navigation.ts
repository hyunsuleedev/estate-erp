import type { TableCellAddress } from '@/components/data-table/cell-edit-state';

/** A listing is a logical sub-row; virtualization still operates on the group. */
export type PropertyCellAddress = TableCellAddress & { listingId?: string };
export type PropertyCellRow = { id: string; listings: readonly { id: string }[] };
export type PropertyCellColumn = { id: string; listingCell: boolean };
export type PropertyCellDirection = 'current' | 'next' | 'previous' | 'down' | 'up';

export function resolvePropertyCell(
  cell: PropertyCellAddress,
  rows: readonly PropertyCellRow[],
  columns: readonly PropertyCellColumn[],
): PropertyCellAddress | null {
  const row = rows.find((row) => row.id === cell.rowId);
  const column = columns.find((column) => column.id === cell.columnId);
  if (!row || !column) return null;
  // Removed/filtered listings must not silently select a different transaction.
  if (cell.listingId && !row.listings.some((listing) => listing.id === cell.listingId)) return null;
  const listingId = cell.listingId ?? (column.listingCell ? row.listings[0]?.id : undefined);
  return { rowId: cell.rowId, columnId: cell.columnId, ...(listingId ? { listingId } : {}) };
}

export function movePropertyCell(
  cell: PropertyCellAddress,
  rows: readonly PropertyCellRow[],
  columns: readonly PropertyCellColumn[],
  direction: PropertyCellDirection,
): PropertyCellAddress | null {
  const current = resolvePropertyCell(cell, rows, columns);
  if (!current || direction === 'current') return current;
  const rowIndex = rows.findIndex((row) => row.id === current.rowId);
  const columnIndex = columns.findIndex((column) => column.id === current.columnId);
  if (direction === 'next' || direction === 'previous') {
    const nextColumn = Math.max(0, Math.min(columns.length - 1, columnIndex + (direction === 'next' ? 1 : -1)));
    // Carry the listing through merged/common cells so a round trip preserves it.
    return resolvePropertyCell({ ...current, columnId: columns[nextColumn].id }, rows, columns);
  }

  const step = direction === 'down' ? 1 : -1;
  const row = rows[rowIndex];
  const listingIndex = row.listings.findIndex((listing) => listing.id === current.listingId);
  if (columns[columnIndex].listingCell && listingIndex >= 0) {
    const nextListing = row.listings[listingIndex + step];
    if (nextListing) return { ...current, listingId: nextListing.id };
  }
  const nextRow = rows[rowIndex + step];
  if (!nextRow) return current;
  const listingId = columns[columnIndex].listingCell
    ? nextRow.listings[step === 1 ? 0 : nextRow.listings.length - 1]?.id
    : undefined;
  return { rowId: nextRow.id, columnId: current.columnId, ...(listingId ? { listingId } : {}) };
}

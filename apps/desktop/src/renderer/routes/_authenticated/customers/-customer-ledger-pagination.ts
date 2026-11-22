import type {
  CustomerLedgerRow,
  CustomerLedgerResponse,
} from "@estate-erp/api-client";

export function getNextLedgerCursor(lastPage: CustomerLedgerResponse) {
  return lastPage.pagination.nextCursor ?? undefined;
}

export function mergeLedgerPages(
  pages: CustomerLedgerResponse[] | undefined,
): CustomerLedgerRow[] {
  if (!pages) return [];

  const merged: CustomerLedgerRow[] = [];
  const seenCaseIds = new Set<string>();
  for (const page of pages) {
    for (const project of page.items) {
      if (seenCaseIds.has(project.id)) continue;
      seenCaseIds.add(project.id);
      merged.push(project);
    }
  }
  return merged;
}

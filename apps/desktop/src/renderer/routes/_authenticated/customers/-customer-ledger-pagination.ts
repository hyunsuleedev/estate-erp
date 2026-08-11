import type {
  BrokerageCase,
  BrokerageCaseLedgerResponse,
} from "@estate-erp/api-client";

export function getNextLedgerCursor(lastPage: BrokerageCaseLedgerResponse) {
  return lastPage.pagination.nextCursor ?? undefined;
}

export function mergeLedgerPages(
  pages: BrokerageCaseLedgerResponse[] | undefined,
): BrokerageCase[] {
  if (!pages) return [];

  const merged: BrokerageCase[] = [];
  const seenCaseIds = new Set<string>();
  for (const page of pages) {
    for (const brokerageCase of page.items) {
      if (seenCaseIds.has(brokerageCase.id)) continue;
      seenCaseIds.add(brokerageCase.id);
      merged.push(brokerageCase);
    }
  }
  return merged;
}

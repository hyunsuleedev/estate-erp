import type {
  CustomerLedgerRow,
  CustomerLedgerDemandIntent,
  CustomerLedgerListingIntent,
} from "@estate-erp/api-client";

export interface CustomerDemandGroup {
  intakeId: string;
  lines: CustomerLedgerDemandIntent[];
}

export interface CustomerListingGroup {
  intakeId: string;
  lines: CustomerLedgerListingIntent[];
}

export interface CustomerCaseSummary {
  demandCount: number;
  listingCount: number;
  demandMatchCount: number;
  listingMatchCount: number;
}

export type CustomerSelectionState = boolean | "indeterminate";

export function getDemandSelectionKey(requirementId: string): string {
  return `demand:${requirementId}`;
}

export function getListingSelectionKey(listingId: string): string {
  return `listing:${listingId}`;
}

export function getCustomerCaseSelectionKeys(
  project: CustomerLedgerRow,
): string[] {
  return [
    ...project.demandIntents.map((intent) =>
      getDemandSelectionKey(intent.requirementId),
    ),
    ...project.listingIntents.map((intent) =>
      getListingSelectionKey(intent.listingId),
    ),
  ];
}

export function getCustomerSelectionState(
  selectedKeys: ReadonlySet<string>,
  keys: readonly string[],
): CustomerSelectionState {
  if (keys.length === 0) return false;

  const selectedCount = keys.reduce(
    (count, key) => count + Number(selectedKeys.has(key)),
    0,
  );

  if (selectedCount === 0) return false;
  if (selectedCount === keys.length) return true;
  return "indeterminate";
}

export function updateCustomerSelection(
  selectedKeys: ReadonlySet<string>,
  keys: readonly string[],
  selected: boolean,
): Set<string> {
  const next = new Set(selectedKeys);

  for (const key of keys) {
    if (selected) next.add(key);
    else next.delete(key);
  }

  return next;
}

export function toggleCustomerCaseCollapsed(
  collapsedCaseIds: ReadonlySet<string>,
  caseId: string,
): Set<string> {
  const next = new Set(collapsedCaseIds);

  if (next.has(caseId)) {
    next.delete(caseId);
  } else {
    next.add(caseId);
  }

  return next;
}

export function toggleCustomerIntakeCollapsed(
  collapsedIntakeIds: ReadonlySet<string>,
  intakeId: string,
): Set<string> {
  const next = new Set(collapsedIntakeIds);

  if (next.has(intakeId)) {
    next.delete(intakeId);
  } else {
    next.add(intakeId);
  }

  return next;
}

export function groupCustomerListingIntents(
  lines: CustomerLedgerListingIntent[],
): CustomerListingGroup[] {
  const groups = new Map<string, CustomerListingGroup>();

  for (const line of lines) {
    const existing = groups.get(line.listingIntakeId);
    if (existing) {
      existing.lines.push(line);
    } else {
      groups.set(line.listingIntakeId, {
        intakeId: line.listingIntakeId,
        lines: [line],
      });
    }
  }

  return Array.from(groups.values());
}

export function groupCustomerDemandIntents(
  lines: CustomerLedgerDemandIntent[],
): CustomerDemandGroup[] {
  const groups = new Map<string, CustomerDemandGroup>();

  for (const line of lines) {
    const existing = groups.get(line.buyerIntakeId);
    if (existing) {
      existing.lines.push(line);
    } else {
      groups.set(line.buyerIntakeId, {
        intakeId: line.buyerIntakeId,
        lines: [line],
      });
    }
  }

  return Array.from(groups.values());
}

export function getCustomerListingOptionMemo(
  line: CustomerLedgerListingIntent,
): string | null {
  if (!line.memo || line.memo === line.intakeMemo) return null;
  return line.memo;
}

export function summarizeCustomerCase(
  project: CustomerLedgerRow,
): CustomerCaseSummary {
  const demandGroups = groupCustomerDemandIntents(project.demandIntents);
  const listingGroups = groupCustomerListingIntents(
    project.listingIntents,
  );

  return {
    demandCount: demandGroups.length,
    listingCount: listingGroups.length,
    demandMatchCount: project.demandIntents.reduce(
      (total, intent) => total + intent.matchCount,
      0,
    ),
    listingMatchCount: project.listingIntents.reduce(
      (total, intent) => total + intent.matchCount,
      0,
    ),
  };
}

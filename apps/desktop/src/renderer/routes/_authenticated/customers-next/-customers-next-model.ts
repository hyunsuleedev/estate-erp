import type {
  BrokerageCase,
  BrokerageCaseDemandIntent,
  BrokerageCaseListingIntent,
} from "@estate-erp/api-client";

export interface CustomerDemandGroup {
  intakeId: string;
  lines: BrokerageCaseDemandIntent[];
}

export interface CustomerListingGroup {
  intakeId: string;
  lines: BrokerageCaseListingIntent[];
}

export interface CustomerCaseSummary {
  demandCount: number;
  listingCount: number;
  demandMatchCount: number;
  listingMatchCount: number;
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

export function groupCustomerListingIntents(
  lines: BrokerageCaseListingIntent[],
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
  lines: BrokerageCaseDemandIntent[],
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
  line: BrokerageCaseListingIntent,
): string | null {
  if (!line.memo || line.memo === line.intakeMemo) return null;
  return line.memo;
}

export function summarizeCustomerCase(
  brokerageCase: BrokerageCase,
): CustomerCaseSummary {
  const demandGroups = groupCustomerDemandIntents(brokerageCase.demandIntents);
  const listingGroups = groupCustomerListingIntents(
    brokerageCase.listingIntents,
  );

  return {
    demandCount: demandGroups.length,
    listingCount: listingGroups.length,
    demandMatchCount: brokerageCase.demandIntents.reduce(
      (total, intent) => total + intent.matchCount,
      0,
    ),
    listingMatchCount: brokerageCase.listingIntents.reduce(
      (total, intent) => total + intent.matchCount,
      0,
    ),
  };
}

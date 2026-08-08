import type { SortingState } from "@tanstack/react-table";
import type { BuyerIntake, BuyerRequirement } from "@estate-erp/api-client";

export type BuyerLedgerBoundary = "min" | "max";

export interface BuyerLedgerParticipant {
  id: string;
  contactId: string;
  role: string;
  isPrimary: boolean;
  createdAt?: string;
  contact?: {
    id: string;
    name: string;
    phone: string | null;
    email?: string | null;
  };
}

export interface BuyerRequirementGroup {
  id: string;
  buyerIntakeId: string;
  lifecycleStatus: BuyerIntake["lifecycleStatus"];
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
  memo: string | null;
  contacts: BuyerLedgerParticipant[];
  primaryParticipant: BuyerLedgerParticipant | null;
  requirements: BuyerRequirement[];
}

const URGENCY_ORDER: Record<string, number> = {
  urgent: 0,
  normal: 1,
  flexible: 2,
};

const STATUS_ORDER: Record<string, number> = {
  active: 0,
  matched: 0,
  hold: 1,
  inactive: 1,
  completed: 2,
};

export function buyerIntakesToGroups(
  intakes: BuyerIntake[],
): BuyerRequirementGroup[] {
  return intakes.map((intake) =>
    createGroup({
      buyerIntakeId: intake.id,
      lifecycleStatus: intake.lifecycleStatus,
      receivedAt: intake.receivedAt,
      createdAt: intake.createdAt,
      updatedAt: intake.updatedAt,
      memo: intake.memo,
      contacts: intake.contacts,
      requirements: intake.requirements ?? [],
    }),
  );
}

/**
 * 구버전 requirement 목록 응답도 BuyerIntake 기준으로 묶는다.
 * 신규 원장은 buyerIntakesToGroups를 사용하지만, 캐시·부분 응답이 섞여도
 * contactId로 되돌아가지 않도록 Intake 소유권을 단일 기준으로 유지한다.
 */
export function groupBuyerRequirements(
  requirements: BuyerRequirement[],
): BuyerRequirementGroup[] {
  const groups = new Map<string, BuyerRequirementGroup>();

  for (const requirement of requirements) {
    const key = requirement.buyerIntakeId || requirement.id;
    const existing = groups.get(key);
    if (existing) {
      existing.requirements.push(requirement);
      continue;
    }

    const intake = requirement.buyerIntake;
    const contacts = intake?.contacts?.length
      ? intake.contacts
      : requirement.contact
        ? [
            {
              id: `legacy-${requirement.contactId}`,
              contactId: requirement.contactId,
              role: "buyer",
              isPrimary: true,
              contact: requirement.contact,
            },
          ]
        : [];
    const createdAt = requirement.createdAt;

    groups.set(
      key,
      createGroup({
        buyerIntakeId: key,
        lifecycleStatus: intake?.lifecycleStatus ?? "open",
        receivedAt: createdAt,
        createdAt,
        updatedAt: requirement.updatedAt,
        memo: null,
        contacts,
        requirements: [requirement],
      }),
    );
  }

  return [...groups.values()].map((group) =>
    createGroup({ ...group, requirements: group.requirements }),
  );
}

export function buyerBudgetBoundaryValue(
  requirement: BuyerRequirement,
  boundary: BuyerLedgerBoundary,
): number | null {
  if (requirement.transactionType === "monthly") {
    return boundary === "min" ? requirement.depositMin : requirement.depositMax;
  }
  return boundary === "min" ? requirement.priceMin : requirement.priceMax;
}

export function sortBuyerRequirementGroups(
  groups: BuyerRequirementGroup[],
  sorting: SortingState,
): BuyerRequirementGroup[] {
  const active = sorting[0];
  if (!active) return groups.slice();

  const direction = active.desc ? -1 : 1;
  return groups.slice().sort((a, b) => {
    const aValue = groupSortValue(a, active.id);
    const bValue = groupSortValue(b, active.id);

    if (aValue === null && bValue === null) return compareGroupNames(a, b);
    if (aValue === null) return 1;
    if (bValue === null) return -1;

    const comparison = compareValues(aValue, bValue);
    if (comparison !== 0) return comparison * direction;
    return compareGroupNames(a, b);
  });
}

function createGroup(input: {
  buyerIntakeId: string;
  lifecycleStatus: BuyerIntake["lifecycleStatus"];
  receivedAt: string;
  createdAt: string;
  updatedAt: string;
  memo: string | null;
  contacts: BuyerLedgerParticipant[];
  requirements: BuyerRequirement[];
}): BuyerRequirementGroup {
  const contacts = input.contacts.slice().sort(compareParticipants);
  return {
    id: `buyer-intake-${input.buyerIntakeId}`,
    buyerIntakeId: input.buyerIntakeId,
    lifecycleStatus: input.lifecycleStatus,
    receivedAt: input.receivedAt,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    memo: input.memo,
    contacts,
    primaryParticipant:
      contacts.find((participant) => participant.isPrimary) ??
      contacts[0] ??
      null,
    requirements: input.requirements.slice().sort(compareRequirements),
  };
}

function compareParticipants(
  a: BuyerLedgerParticipant,
  b: BuyerLedgerParticipant,
): number {
  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
  return String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
}

function compareRequirements(a: BuyerRequirement, b: BuyerRequirement): number {
  const rankComparison =
    (Number.isFinite(a.priorityRank)
      ? a.priorityRank
      : Number.MAX_SAFE_INTEGER) -
    (Number.isFinite(b.priorityRank)
      ? b.priorityRank
      : Number.MAX_SAFE_INTEGER);
  if (rankComparison !== 0) return rankComparison;
  return Date.parse(a.createdAt) - Date.parse(b.createdAt);
}

function primaryRequirement(
  group: BuyerRequirementGroup,
): BuyerRequirement | null {
  return group.requirements[0] ?? null;
}

function groupSortValue(
  group: BuyerRequirementGroup,
  field: string,
): string | number | null {
  const requirement = primaryRequirement(group);
  const contact = group.primaryParticipant?.contact;

  switch (field) {
    case "customer":
      return contact?.name ?? null;
    case "phone":
      return contact?.phone ?? null;
    case "intentCount":
      return group.requirements.length;
    case "budgetMin":
      return requirement ? buyerBudgetBoundaryValue(requirement, "min") : null;
    case "budgetMax":
      return requirement ? buyerBudgetBoundaryValue(requirement, "max") : null;
    case "monthlyRentMin":
      return requirement?.monthlyRentMin ?? null;
    case "monthlyRentMax":
      return requirement?.monthlyRentMax ?? null;
    case "areaMin":
      return requirement?.areaMin ?? null;
    case "areaMax":
      return requirement?.areaMax ?? null;
    case "matches": {
      const values = group.requirements
        .map((item) => item._count?.matches)
        .filter(
          (value): value is number => value !== null && value !== undefined,
        );
      return values.length
        ? values.reduce((total, value) => total + value, 0)
        : null;
    }
    case "status":
      return requirement ? (STATUS_ORDER[requirement.status] ?? 99) : null;
    case "urgency":
      return requirement ? (URGENCY_ORDER[requirement.urgency] ?? 99) : null;
    case "lastContactDate":
      return requirement?.lastContactDate
        ? Date.parse(requirement.lastContactDate)
        : null;
    case "nextContactDate":
      return requirement?.nextContactDate
        ? Date.parse(requirement.nextContactDate)
        : null;
    case "assignedTo":
      return requirement?.assignedTo?.name ?? null;
    case "createdAt":
      return Date.parse(group.receivedAt || group.createdAt);
    default:
      return null;
  }
}

function compareGroupNames(
  a: BuyerRequirementGroup,
  b: BuyerRequirementGroup,
): number {
  return (a.primaryParticipant?.contact?.name ?? "").localeCompare(
    b.primaryParticipant?.contact?.name ?? "",
    "ko-KR",
  );
}

function compareValues(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ko-KR", { numeric: true });
}

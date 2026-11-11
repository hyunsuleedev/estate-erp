import type { ContactCategoryKey, ContactRoleKey } from '@estate-erp/shared';
import { Prisma } from '@prisma/client';

const OPEN_INTAKE_STATUSES = ['open', 'hold'];
const OPEN_REQUIREMENT_STATUSES = ['active', 'hold'];
const RENT_TRANSACTION_TYPES = ['jeonse', 'monthly'];
const OWNER_ROLES = ['owner', 'co_owner'];
const REPRESENTATIVE_ROLES = ['representative', 'lawyer', 'tax_agent'];
const CURRENT_TENANT_STATUSES = ['residing', 'moving_out'];
const FINISHED_DEAL_STAGES = ['completed', 'closed'];
const RECENT_CONSULT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

const ACTIVE_DEAL_WHERE = {
  isCancelled: false,
  stage: { notIn: FINISHED_DEAL_STAGES },
} satisfies Prisma.DealWhereInput;

function withOpenRequirement(
  requirement: Prisma.BuyerRequirementWhereInput,
): Prisma.ContactWhereInput {
  return {
    buyerIntakeContacts: {
      some: {
        buyerIntake: {
          lifecycleStatus: { in: OPEN_INTAKE_STATUSES },
          requirements: {
            some: { status: { in: OPEN_REQUIREMENT_STATUSES }, ...requirement },
          },
        },
      },
    },
  };
}

/** 한국 시간 기준 오늘의 마지막 순간. 다음 연락일이 오늘이거나 지난 사람을 고를 때 쓴다. */
function endOfKstDay(now: Date): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1) -
      KST_OFFSET_MS -
      1,
  );
}

/** 목록 조회와 건수 집계가 같은 조건을 쓰도록 분류 조건을 한곳에서 정한다. */
export function contactCategoryWhere(
  key: ContactCategoryKey,
  now: Date = new Date(),
): Prisma.ContactWhereInput {
  const recentSince = new Date(now.getTime() - RECENT_CONSULT_DAYS * DAY_MS);

  switch (key) {
    case 'buyer_sale':
      return withOpenRequirement({ transactionType: 'sale' });
    case 'buyer_rent':
      return withOpenRequirement({
        transactionType: { in: RENT_TRANSACTION_TYPES },
      });
    case 'owner':
      return {
        propertyContacts: {
          some: { role: { in: OWNER_ROLES }, status: 'active' },
        },
      };
    case 'tenant':
      return {
        tenants: { some: { status: { in: CURRENT_TENANT_STATUSES } } },
      };
    case 'representative':
      return {
        propertyContacts: {
          some: { role: { in: REPRESENTATIVE_ROLES }, status: 'active' },
        },
      };
    case 'in_deal':
      return {
        OR: [
          { dealsAsBuyer: { some: ACTIVE_DEAL_WHERE } },
          { dealsAsSeller: { some: ACTIVE_DEAL_WHERE } },
        ],
      };
    case 'follow_up':
      return withOpenRequirement({
        nextContactDate: { lte: endOfKstDay(now) },
      });
    case 'recent_consult':
      return { consultations: { some: { createdAt: { gte: recentSince } } } };
    case 'stale_consult':
      return {
        AND: [
          { consultations: { some: {} } },
          { consultations: { none: { createdAt: { gte: recentSince } } } },
        ],
      };
    case 'no_consult':
      return { consultations: { none: {} } };
    case 'uncategorized':
      return {
        tags: { isEmpty: true },
        buyerIntakeContacts: { none: {} },
        propertyContacts: { none: {} },
        tenants: { none: {} },
        dealsAsBuyer: { none: {} },
        dealsAsSeller: { none: {} },
      };
    case 'no_phone':
      return { phones: { none: {} } };
  }
}

/** 목록 행에 역할을 표시하는 데 필요한 관계만 읽는다. */
export const CONTACT_ROLE_INCLUDE = {
  propertyContacts: {
    where: { status: 'active' },
    select: { role: true },
  },
  tenants: {
    where: { status: { in: CURRENT_TENANT_STATUSES } },
    select: { id: true },
    take: 1,
  },
  dealsAsBuyer: {
    where: ACTIVE_DEAL_WHERE,
    select: { id: true },
    take: 1,
  },
  dealsAsSeller: {
    where: ACTIVE_DEAL_WHERE,
    select: { id: true },
    take: 1,
  },
} satisfies Prisma.ContactInclude;

export const CONTACT_ROLE_INTAKE_SELECT = {
  lifecycleStatus: true,
  requirements: {
    where: { status: { in: OPEN_REQUIREMENT_STATUSES } },
    select: { transactionType: true },
  },
} satisfies Prisma.BuyerIntakeSelect;

interface ContactRoleSource {
  propertyContacts?: Array<{ role: string }>;
  tenants?: Array<unknown>;
  dealsAsBuyer?: Array<unknown>;
  dealsAsSeller?: Array<unknown>;
  buyerIntakeContacts?: Array<{
    buyerIntake: {
      lifecycleStatus?: string;
      requirements?: Array<{ transactionType: string | null }>;
    };
  }>;
}

/** contactCategoryWhere의 역할 조건과 같은 기준으로 한 사람의 역할을 계산한다. */
export function deriveContactRoles(contact: ContactRoleSource): ContactRoleKey[] {
  const openRequirements = (contact.buyerIntakeContacts ?? [])
    .filter(({ buyerIntake }) =>
      OPEN_INTAKE_STATUSES.includes(buyerIntake.lifecycleStatus ?? ''),
    )
    .flatMap(({ buyerIntake }) => buyerIntake.requirements ?? []);
  const propertyRoles = (contact.propertyContacts ?? []).map(({ role }) => role);

  const roles: ContactRoleKey[] = [];
  if (openRequirements.some((r) => r.transactionType === 'sale')) {
    roles.push('buyer_sale');
  }
  if (
    openRequirements.some((r) =>
      RENT_TRANSACTION_TYPES.includes(r.transactionType ?? ''),
    )
  ) {
    roles.push('buyer_rent');
  }
  if (propertyRoles.some((role) => OWNER_ROLES.includes(role))) {
    roles.push('owner');
  }
  if ((contact.tenants ?? []).length > 0) roles.push('tenant');
  if (propertyRoles.some((role) => REPRESENTATIVE_ROLES.includes(role))) {
    roles.push('representative');
  }
  if (
    (contact.dealsAsBuyer ?? []).length > 0 ||
    (contact.dealsAsSeller ?? []).length > 0
  ) {
    roles.push('in_deal');
  }
  return roles;
}

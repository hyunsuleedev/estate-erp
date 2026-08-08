import {
  contactPhonesIncludeOrdered,
  withPrimaryPhone,
} from "../contacts/contact-phone.utils";

export const buyerIntakeContactsInclude = {
  include: {
    contact: { include: { phones: contactPhonesIncludeOrdered } },
  },
  orderBy: [
    { isPrimary: "desc" as const },
    { createdAt: "asc" as const },
  ],
};

type ParticipantLike = {
  contactId: string;
  isPrimary: boolean;
  contact: {
    id: string;
    phones?: Array<{
      phone: string;
      isPrimary?: boolean | null;
      createdAt?: Date | string | null;
    }> | null;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

type RequirementWithIntakeContacts = {
  buyerIntake: {
    contacts: ParticipantLike[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

/**
 * 기존 클라이언트의 `requirement.contact/contactId` 계약을 유지한다.
 * DB의 소유권은 BuyerIntake에 있으며, 이 값은 대표 연락 대상에서 파생된다.
 */
export function withBuyerRequirementContact<
  T extends RequirementWithIntakeContacts,
>(requirement: T) {
  const contacts = requirement.buyerIntake.contacts.map((participant) => ({
    ...participant,
    contact: withPrimaryPhone(participant.contact),
  }));
  const primary =
    contacts.find((participant) => participant.isPrimary) ??
    contacts[0] ??
    null;

  return {
    ...requirement,
    buyerIntake: {
      ...requirement.buyerIntake,
      contacts,
    },
    // Deprecated response aliases. New code should use buyerIntake.contacts.
    contactId: primary?.contactId ?? null,
    contact: primary?.contact ?? null,
  };
}

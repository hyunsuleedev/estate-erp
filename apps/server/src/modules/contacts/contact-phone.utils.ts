type ContactPhoneLike = {
  phone: string;
  isPrimary?: boolean | null;
  isActive?: boolean | null;
  createdAt?: Date | string | null;
};

export const contactPhoneSelect = {
  id: true,
  phone: true,
  normalizedPhone: true,
  label: true,
  isPrimary: true,
  isActive: true,
  memo: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const contactPhonesOrderBy = [
  { isPrimary: 'desc' as const },
  { isActive: 'desc' as const },
  { createdAt: 'asc' as const },
];

export const contactPhonesSelectOrdered = {
  orderBy: contactPhonesOrderBy,
  select: contactPhoneSelect,
} as const;

export const contactPhonesIncludeOrdered = {
  orderBy: contactPhonesOrderBy,
} as const;

export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+82')) cleaned = '0' + cleaned.substring(3);
  if (cleaned.startsWith('82') && cleaned.length > 10) cleaned = '0' + cleaned.substring(2);
  return cleaned;
}

export function getPrimaryPhone(contact?: { phones?: ContactPhoneLike[] | null } | null): string | null {
  const phones = contact?.phones ?? [];
  const primary =
    phones.find((phone) => phone.isPrimary && phone.isActive !== false)
    ?? phones.find((phone) => phone.isPrimary)
    ?? phones.find((phone) => phone.isActive !== false)
    ?? phones[0];
  return primary?.phone ?? null;
}

export function withPrimaryPhone<T extends { phones?: ContactPhoneLike[] | null }>(
  contact: T,
): T & { phone: string | null } {
  return { ...contact, phone: getPrimaryPhone(contact) };
}

export function withPrimaryContactPhone<T extends { contact?: ({ phones?: ContactPhoneLike[] | null } & Record<string, unknown>) | null }>(
  item: T,
): T {
  if (!item.contact) return item;
  return { ...item, contact: withPrimaryPhone(item.contact) };
}

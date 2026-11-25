type ContactPhoneLike = {
  phone: string;
  isPrimary?: boolean | null;
  createdAt?: Date | string | null;
};

export const contactPhoneSelect = {
  id: true,
  phone: true,
  label: true,
  isPrimary: true,
  memo: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const contactPhonesOrderBy = [
  { isPrimary: 'desc' as const },
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
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('82') && digits.length > 10) {
    digits = `0${digits.substring(2)}`;
  }
  return digits;
}

/**
 * 검색어가 전화번호를 찾는 말일 때만 숫자를 돌려준다.
 * 숫자 · 공백 · 하이픈 · 괄호 · 점 · +만 있고 숫자가 3자리 이상이면 번호 검색이다("5678", "010-12", "02 555").
 * 글자가 섞이면("그라시움 101동", "김철수 010") 번호로는 찾지 않는다 — 101이 든 번호의 손님이 딸려 나오지 않게.
 */
export function phoneSearchDigits(search: string): string | null {
  const trimmed = search.trim();
  if (!/^[\d\s\-().+]+$/.test(trimmed)) return null;
  const digits = normalizePhone(trimmed);
  return digits.length >= 3 ? digits : null;
}

export function getPrimaryPhone(contact?: { phones?: ContactPhoneLike[] | null } | null): string | null {
  const phones = contact?.phones ?? [];
  const primary = phones.find((phone) => phone.isPrimary) ?? phones[0];
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

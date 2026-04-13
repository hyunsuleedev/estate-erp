export interface ContactGroupDefinition {
  id: string;
  label: string;
  tag: string;
  description: string;
}

export const CONTACT_GROUPS: ContactGroupDefinition[] = [
  {
    id: 'buyer-investor',
    label: '매수/투자',
    tag: '매수/투자',
    description: '매수 고객, 투자 성향 고객',
  },
  {
    id: 'tenant',
    label: '임차',
    tag: '임차',
    description: '전세/월세 임차 고객',
  },
  {
    id: 'property-inquiry',
    label: '매물상담',
    tag: '매물상담',
    description: '매물 문의 및 상담 중심 연락처',
  },
  {
    id: 'owner',
    label: '소유자',
    tag: '소유자',
    description: '소유주, 공동 소유주, 대리인',
  },
  {
    id: 'partner',
    label: '거래처',
    tag: '거래처',
    description: '법무사, 세무사, 협력 업체',
  },
  {
    id: 'broker-office',
    label: '중개사무소',
    tag: '중개사무소',
    description: '타 중개사 및 중개 법인',
  },
];

export const CONTACT_GROUP_TAGS = CONTACT_GROUPS.map((group) => group.tag);

export function normalizePhone(value?: string | null) {
  return value?.replace(/\D/g, '') ?? '';
}

export function formatPhoneNumber(value?: string | null) {
  const digits = normalizePhone(value);

  if (!digits) return '-';

  if (digits.startsWith('02')) {
    if (digits.length === 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    if (digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }

  return value ?? digits;
}

export function parseContactTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

export function stringifyContactTags(tags?: string[] | null) {
  return tags?.join(', ') ?? '';
}

export function splitContactTags(tags: string[]) {
  const groupTags = CONTACT_GROUPS
    .map((group) => group.tag)
    .filter((tag) => tags.includes(tag));

  const customTags = tags.filter((tag) => !CONTACT_GROUP_TAGS.includes(tag));

  return { groupTags, customTags };
}

export function mergeContactTags(groupTags: string[], customTagsInput: string) {
  return Array.from(
    new Set([
      ...groupTags,
      ...parseContactTags(customTagsInput),
    ]),
  );
}

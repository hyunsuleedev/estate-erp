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
];

export const CONTACT_GROUP_TAGS = CONTACT_GROUPS.map((group) => group.tag);
export const CONTACT_DEPRECATED_TAGS = ['중개사무소'];

export function isContactTagVisible(tag: string) {
  return !CONTACT_DEPRECATED_TAGS.includes(tag);
}

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
        .filter((tag) => Boolean(tag) && isContactTagVisible(tag)),
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

  const customTags = tags.filter(
    (tag) => !CONTACT_GROUP_TAGS.includes(tag) && isContactTagVisible(tag),
  );

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

/**
 * 수정 폼에서 그룹 선택이나 태그 입력칸을 건드렸는지 판단한다. 그룹 선택의 순서는 따지지 않는다.
 * 안 건드렸으면 태그를 보내지 않아야, 폼을 연 사이 다른 직원이 넣은 그룹이 지워지지 않는다.
 */
export function hasContactTagsChanged(
  currentTags: string[],
  groupTags: string[],
  customTagsInput: string,
) {
  // 정리한 태그끼리 비교하지 않고, 폼이 처음 채운 값과 지금 값을 그대로 비교한다.
  // 정리해서 비교하면 '거래처 ' 태그가 있는 사람에게 '거래처' 그룹을 골라도 같은 값이 되어 저장되지 않고,
  // 원본 태그와 비교하면 공백·쉼표가 든 옛 태그는 건드리지 않아도 바뀐 것으로 보여 전체를 다시 쓰게 된다.
  const { groupTags: initialGroups, customTags } = splitContactTags(currentTags);
  const groupsChanged =
    initialGroups.length !== groupTags.length ||
    groupTags.some((tag) => !initialGroups.includes(tag));
  return groupsChanged || customTagsInput !== stringifyContactTags(customTags);
}

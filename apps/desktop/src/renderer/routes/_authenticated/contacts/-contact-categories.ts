import type { ContactsFilter } from '@estate-erp/api-client';
import {
  CONTACT_CATEGORY_LABELS,
  type ContactCategoryKey,
} from '@estate-erp/shared';
import { isContactTagVisible } from '@/lib/contacts';

export interface ContactCategory {
  id: string;
  label: string;
  filter: Pick<ContactsFilter, 'category' | 'tags'>;
}

export const ALL_CONTACTS_CATEGORY: ContactCategory = {
  id: 'all',
  label: '전체 연락처',
  filter: {},
};

function automaticCategory(key: ContactCategoryKey): ContactCategory {
  return {
    id: key,
    label: CONTACT_CATEGORY_LABELS[key],
    filter: { category: key },
  };
}

/** 데이터에서 자동으로 나뉘는 분류. 직접 만드는 그룹은 사이드바 아래에 따로 둔다. */
export const CONTACT_CATEGORY_SECTIONS: ReadonlyArray<{
  label: string;
  categories: ContactCategory[];
}> = [
  {
    label: '고객 구분',
    categories: (
      ['buyer_sale', 'buyer_rent', 'owner', 'tenant', 'representative'] as const
    ).map(automaticCategory),
  },
  {
    label: '진행 상황',
    categories: (
      [
        'in_deal',
        'follow_up',
        'recent_consult',
        'stale_consult',
        'no_consult',
      ] as const
    ).map(automaticCategory),
  },
  {
    label: '정리',
    categories: (['uncategorized', 'no_phone'] as const).map(automaticCategory),
  },
];

const GROUP_ID_PREFIX = 'group:';

export function contactGroupCategory(name: string): ContactCategory {
  return { id: `${GROUP_ID_PREFIX}${name}`, label: name, filter: { tags: name } };
}

/** 그룹 분류면 그룹 이름을, 아니면 null을 돌려준다. */
export function contactGroupNameOf(categoryId: string): string | null {
  return categoryId.startsWith(GROUP_ID_PREFIX)
    ? categoryId.slice(GROUP_ID_PREFIX.length)
    : null;
}

export function resolveContactCategory(id: string): ContactCategory {
  const groupName = contactGroupNameOf(id);
  if (groupName) return contactGroupCategory(groupName);
  for (const section of CONTACT_CATEGORY_SECTIONS) {
    const category = section.categories.find((item) => item.id === id);
    if (category) return category;
  }
  return ALL_CONTACTS_CATEGORY;
}

/** 그룹 이름 규칙은 서버와 같다. 서버까지 가지 않고 입력 중에 바로 알려 준다. */
export function validateContactGroupName(rawName: string): string | null {
  const name = rawName.trim();
  if (!name) return '그룹 이름을 입력하세요.';
  if (name.length > 30) return '그룹 이름은 30자까지 쓸 수 있습니다.';
  if (name.includes(',')) return '그룹 이름에는 쉼표를 쓸 수 없습니다.';
  // 화면에서 숨기는 옛 태그 이름으로 만들면 만들어 놓고도 보이지 않는다.
  if (!isContactTagVisible(name)) return '이 이름은 그룹 이름으로 쓸 수 없습니다.';
  return null;
}

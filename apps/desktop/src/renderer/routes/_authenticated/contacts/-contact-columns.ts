/**
 * 연락처 표에서 켜고 끌 수 있는 열. 이름과 작업 열은 늘 보인다.
 *
 * 구분(계산된 특징 · 그룹)은 처음에는 숨긴다. 같은 내용을 필터로 고를 수 있고,
 * 표에서는 사람이 붙인 태그가 더 자주 쓰이기 때문이다 (사용자 결정 2026-11-18).
 */
export const CONTACT_OPTIONAL_COLUMNS = [
  { id: 'tags', label: '태그', defaultVisible: true },
  { id: 'labels', label: '구분', defaultVisible: false },
  { id: 'phone', label: '전화', defaultVisible: true },
  { id: 'latestConsultation', label: '최근 상담', defaultVisible: true },
  { id: 'buyerRequirements', label: '희망', defaultVisible: true },
  { id: 'propertyContacts', label: '매물', defaultVisible: true },
  { id: 'updatedAt', label: '수정', defaultVisible: true },
] as const;

/** 사용자가 직접 켜거나 끈 열만 담는다. 손대지 않은 열은 기본값을 따른다. */
export type ContactColumnOverrides = Record<string, boolean>;

const STORAGE_KEY = 'contacts:columns:v1';

export function isContactColumnVisible(overrides: ContactColumnOverrides, id: string) {
  const column = CONTACT_OPTIONAL_COLUMNS.find((item) => item.id === id);
  // 목록에 없는 열(이름 · 작업)은 끌 수 없다.
  if (!column) return true;
  return overrides[id] ?? column.defaultVisible;
}

/** 기본값과 같아진 열은 기록에서 지운다. 나중에 기본값이 바뀌면 손대지 않은 열은 따라간다. */
export function setContactColumnVisible(
  overrides: ContactColumnOverrides,
  id: string,
  visible: boolean,
): ContactColumnOverrides {
  const column = CONTACT_OPTIONAL_COLUMNS.find((item) => item.id === id);
  if (!column) return overrides;
  const next = { ...overrides };
  if (visible === column.defaultVisible) delete next[id];
  else next[id] = visible;
  return next;
}

export function parseContactColumnOverrides(raw: string | null): ContactColumnOverrides {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([id, value]) =>
          typeof value === 'boolean' &&
          CONTACT_OPTIONAL_COLUMNS.some((column) => column.id === id),
      ),
    ) as ContactColumnOverrides;
  } catch {
    return {};
  }
}

export function readStoredContactColumns(): ContactColumnOverrides {
  try {
    return parseContactColumnOverrides(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

export function storeContactColumns(overrides: ContactColumnOverrides) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    /* 저장 못 해도 이번 세션 동작에는 영향 없음 */
  }
}

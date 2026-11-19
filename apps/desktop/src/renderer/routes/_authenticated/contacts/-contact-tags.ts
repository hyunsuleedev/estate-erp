import { CONTACT_TAG_NAME_MAX_LENGTH } from '@estate-erp/shared';

export interface ContactTagOption {
  name: string;
  color: string;
  count: number;
}

/** 서버와 같은 이름 규칙: 앞뒤 공백을 떼고 가운데 공백을 하나로 줄인다. */
export function normalizeContactTagName(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

/** 쓸 수 없는 이름이면 이유를, 쓸 수 있으면 null을 돌려준다. */
export function validateContactTagName(value: string): string | null {
  const name = normalizeContactTagName(value);
  if (!name) return '태그 이름을 입력하세요.';
  if (name.length > CONTACT_TAG_NAME_MAX_LENGTH) {
    return `태그 이름은 ${CONTACT_TAG_NAME_MAX_LENGTH}자까지 쓸 수 있습니다.`;
  }
  if (name.includes(',')) return '태그 이름에는 쉼표를 쓸 수 없습니다.';
  return null;
}

/**
 * 고르는 창의 목록. 입력한 글자가 든 태그만 남기고(대소문자 무시), 같은 이름이 없으면 "생성" 줄을 낸다.
 * 이미 붙은 태그도 목록에 그대로 둔다 — 누르면 떼어진다.
 */
export function buildContactTagChoices(
  options: ContactTagOption[],
  selected: string[],
  query: string,
) {
  const name = normalizeContactTagName(query);
  const needle = name.toLocaleLowerCase();
  const matches = needle
    ? options.filter((option) => option.name.toLocaleLowerCase().includes(needle))
    : options;
  const exists =
    options.some((option) => option.name === name) || selected.includes(name);
  const createName = name && !exists && validateContactTagName(name) === null ? name : null;
  return { matches, createName };
}

/** 한 번의 저장에서 붙일 태그와 뗄 태그. 사용자가 실제로 바꾼 것만 담는다. */
export function diffContactTags(initial: string[], selected: string[]) {
  return {
    added: selected.filter((name) => !initial.includes(name)),
    removed: initial.filter((name) => !selected.includes(name)),
  };
}

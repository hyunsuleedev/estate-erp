/**
 * 이름을 모르는 손님의 임시 이름.
 *
 * 모르는 번호로 전화가 오면 일단 번호만 저장하고, 통화 뒤에 이름을 채운다. DB의 이름 칸은 비워 둘 수 없으므로
 * 서버가 "미확인 5678"(대표 번호 끝 네 자리)로 채운다. 화면이 지어내지 않고 서버가 이 규칙 하나로만 만든다.
 * 번호를 바꿔도 임시 이름은 자동으로 바꾸지 않는다 (사람이 이름을 넣을 때까지 그대로).
 *
 * 같은 규칙이 화면에도 있다: apps/desktop/src/renderer/routes/_authenticated/contacts/-contact-name.ts.
 * 계약서 당사자처럼 이름이 문서에 찍히는 곳은 isPlaceholderContactName으로 걸러야 한다.
 */
export const PLACEHOLDER_CONTACT_NAME_PATTERN = /^미확인 \d{4}$/;

export function isPlaceholderContactName(name: string | null | undefined): boolean {
  return typeof name === 'string' && PLACEHOLDER_CONTACT_NAME_PATTERN.test(name);
}

/** "01012345678" → "미확인 5678". 숫자가 네 자리보다 짧으면 있는 만큼 앞을 0으로 채운다. */
export function placeholderContactName(canonicalPhone: string): string {
  const digits = canonicalPhone.replace(/\D/g, '');
  return `미확인 ${digits.slice(-4).padStart(4, '0')}`;
}

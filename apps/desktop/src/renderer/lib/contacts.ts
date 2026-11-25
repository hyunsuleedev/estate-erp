import { formatPhone } from './format';

export function normalizePhone(value?: string | null) {
  return value?.replace(/\D/g, '') ?? '';
}

/**
 * 전화번호 하이픈 표기. 규칙은 lib/format.ts의 formatPhone 하나다(02·휴대폰·지역번호·1588 대표번호).
 * 이 이름은 연락처 화면들이 쓰던 것이라 남겨 두고, 비었을 때만 예전처럼 "-"를 돌려준다.
 */
export function formatPhoneNumber(value?: string | null) {
  if (!normalizePhone(value)) return '-';
  return formatPhone(value);
}

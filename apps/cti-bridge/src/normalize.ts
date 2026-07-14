/**
 * 번호 정규화 — 레거시 frmMain.m_MyCallRecv 규칙 이식 (브리지 1차, 서버 2차).
 * 서버 측 동일 구현: apps/server/src/modules/cti/cti-phone.util.ts
 *
 * - 숫자 외 문자 제거 (멀티CID OCX의 Regex \D 제거와 동일)
 * - 3자리 미만 → 발신표시제한(Private)
 * - "82" 국가번호 → "0" + 나머지
 */
export interface NormalizedPhone {
  phoneNumber: string;
  isPrivate: boolean;
}

export function normalizePhone(raw: string | null | undefined): NormalizedPhone {
  const digits = (raw ?? '').replace(/\D/g, '');

  if (digits.length < 3) {
    return { phoneNumber: '', isPrivate: true };
  }

  if (digits.startsWith('82') && digits.length >= 10) {
    return { phoneNumber: `0${digits.slice(2)}`, isPrivate: false };
  }

  return { phoneNumber: digits, isPrivate: false };
}

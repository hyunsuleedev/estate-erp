/**
 * CTI 번호 정규화 — 레거시 frmMain.m_MyCallRecv 규칙 이식.
 *
 * - 숫자 외 문자 제거 (멀티CID OCX의 Regex \D 제거와 동일)
 * - 3자리 미만 → 발신표시제한(Private) 취급
 * - "82" 국가번호 시작 → "0" + 나머지 (국제 → 국내 변환)
 *
 * 같은 규칙이 apps/cti-bridge/src/normalize.ts에도 있다 (브리지 1차, 서버 2차).
 */
export interface NormalizedPhone {
  /// 정규화된 번호. 발신표시제한이면 빈 문자열.
  phoneNumber: string;
  isPrivate: boolean;
}

export function normalizeCtiPhone(raw: string | null | undefined): NormalizedPhone {
  const digits = (raw ?? '').replace(/\D/g, '');

  if (digits.length < 3) {
    return { phoneNumber: '', isPrivate: true };
  }

  if (digits.startsWith('82') && digits.length >= 10) {
    return { phoneNumber: `0${digits.slice(2)}`, isPrivate: false };
  }

  return { phoneNumber: digits, isPrivate: false };
}

/// 01012345678 → 010-1234-5678 (VendorContact.phone 등 대시 포함 저장 컬럼 검색용)
export function formatKoreanPhone(digits: string): string {
  if (/^01\d{9}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (/^02\d{8}$/.test(digits)) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  if (/^02\d{7}$/.test(digits)) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }
  if (/^0\d{10}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (/^0\d{9}$/.test(digits)) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

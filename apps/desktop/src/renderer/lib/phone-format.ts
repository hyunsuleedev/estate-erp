/**
 * 전화번호 입력·확인의 공용 규칙. "새 손님 바로 등록"(연락처 추가·매물 등록의 소유자·프로젝트 열기·
 * 희망매물의 새 고객)이 같은 규칙을 쓰도록 둔다.
 *
 * 저장 형식은 서버가 정한다: 숫자만, +82로 시작하면 0으로(contacts/contact-phone.utils.ts normalizePhone).
 * 같은 사무소 안에서 한 번호는 한 사람에게만 저장된다(서버가 409로 막는다).
 */

/** 서버와 같은 정리: 숫자만 남기고 +82 국가번호는 0으로. */
export function phoneDigits(raw: string | null | undefined): string {
  let digits = (raw ?? '').replace(/\D/g, '');
  if (digits.startsWith('82') && digits.length > 10) digits = `0${digits.slice(2)}`;
  return digits;
}

/**
 * 치는 동안 하이픈을 넣는다: "0101234" → "010-1234", "0212345678" → "02-1234-5678", "15881234" → "1588-1234".
 * 숫자가 아닌 글자는 버리고 11자리까지 받는다(파트너 사무소 입력칸이 쓰던 규칙과 같다).
 */
export function formatPhoneWhileTyping(raw: string): string {
  const digits = phoneDigits(raw).slice(0, 11);
  if (!digits) return '';
  if (digits.startsWith('02')) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) {
      return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
    }
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }
  if (/^1[5-9]\d{2}/.test(digits) && digits.length <= 8) {
    if (digits.length <= 4) return digits;
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, digits.length - 4)}-${digits.slice(-4)}`;
  }
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

/** 다 적은 번호처럼 보이는가(휴대폰 10~11자리, 02 9~10자리, 지역번호 10~11자리, 대표번호 8자리). */
export function isCompletePhone(raw: string | null | undefined): boolean {
  const digits = phoneDigits(raw);
  if (/^1[5-9]\d{6}$/.test(digits)) return true;
  if (digits.startsWith('02')) return digits.length === 9 || digits.length === 10;
  return digits.startsWith('0') && (digits.length === 10 || digits.length === 11);
}

/** 입력칸 아래 안내: 숫자 아닌 글자가 섞였거나 자리 수가 모자랄 때만 말한다. 괜찮으면 null. */
export function phoneInputProblem(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  if (/[^\d\s()+-]/.test(text)) return '전화번호에는 숫자만 적어 주세요.';
  if (!isCompletePhone(text)) return '번호가 끝까지 적혔는지 확인해 주세요. 예: 010-1234-5678';
  return null;
}

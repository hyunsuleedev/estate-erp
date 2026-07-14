/**
 * 계약서 금액 표기 유틸.
 *
 * 레거시 MySpider `ContractUtil.GetHangulFromNum` / `GetHanjaFromNum` 대응 이식.
 * - 입력은 Estate ERP 금액 관례인 **만원 단위 정수(Int)** 를 따른다. (예: 3.5억 = 35000)
 * - 레거시는 원 단위 정수를 받았으므로 이관 시 ÷10,000 변환이 필요하다.
 * - 한글: "일금 삼억오천만원정"
 * - 한자: "金參億五千萬원整" (위변조 방지 갖은자: 壹貳參拾 / 4~9·百·千은 통용 한자)
 * - 병기: "일금 삼억오천만원정 (₩350,000,000)"
 *
 * 모든 함수는 순수함수이며 부수효과가 없다.
 */

export type ContractAmountNotation = 'hangul' | 'hanja';

const HANGUL_DIGITS = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'] as const;
const HANJA_DIGITS = ['', '壹', '貳', '參', '四', '五', '六', '七', '八', '九'] as const;

const HANGUL_SMALL_UNITS = ['', '십', '백', '천'] as const;
const HANJA_SMALL_UNITS = ['', '拾', '百', '千'] as const;

/** 4자리 그룹 단위 (낮은 자리부터): '', 만, 억, 조, 경 */
const HANGUL_GROUP_UNITS = ['', '만', '억', '조', '경'] as const;
const HANJA_GROUP_UNITS = ['', '萬', '億', '兆', '京'] as const;

const HANGUL_ZERO = '영';
const HANJA_ZERO = '零';

/** 만원 단위 정수 검증. 음수/소수/비유한값은 거부한다. */
function assertManwonInteger(amountManwon: number): void {
  if (typeof amountManwon !== 'number' || !Number.isFinite(amountManwon)) {
    throw new TypeError(`금액은 유한한 숫자여야 합니다: ${String(amountManwon)}`);
  }
  if (!Number.isInteger(amountManwon)) {
    throw new TypeError(`금액은 만원 단위 정수여야 합니다: ${amountManwon}`);
  }
  if (amountManwon < 0) {
    throw new TypeError(`금액은 0 이상이어야 합니다: ${amountManwon}`);
  }
  if (!Number.isSafeInteger(amountManwon)) {
    throw new TypeError(`금액이 안전한 정수 범위를 벗어났습니다: ${amountManwon}`);
  }
}

/** 만원 단위 정수 → 원 단위 숫자 문자열 (오버플로 없이 문자열 연산으로 변환) */
function manwonToWonDigits(amountManwon: number): string {
  if (amountManwon === 0) return '0';
  return `${amountManwon}0000`;
}

/** 숫자 문자열에 3자리 콤마 삽입 ("350000000" → "350,000,000") */
function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 원 단위 숫자 문자열 → 한글/한자 금액 본문 (접두/접미어 없음).
 * 계약서 표기 관례에 따라 1도 명시한다. (예: 1500000000 → "일십오억")
 */
function digitsToKorean(wonDigits: string, notation: ContractAmountNotation): string {
  const digits = notation === 'hangul' ? HANGUL_DIGITS : HANJA_DIGITS;
  const smallUnits = notation === 'hangul' ? HANGUL_SMALL_UNITS : HANJA_SMALL_UNITS;
  const groupUnits = notation === 'hangul' ? HANGUL_GROUP_UNITS : HANJA_GROUP_UNITS;

  if (/^0+$/.test(wonDigits)) {
    return notation === 'hangul' ? HANGUL_ZERO : HANJA_ZERO;
  }

  const padded = wonDigits.padStart(Math.ceil(wonDigits.length / 4) * 4, '0');
  const groupCount = padded.length / 4;

  if (groupCount > groupUnits.length) {
    throw new RangeError(`지원 범위(경 단위)를 초과하는 금액입니다: ${wonDigits}원`);
  }

  let result = '';

  for (let groupIndex = 0; groupIndex < groupCount; groupIndex += 1) {
    const group = padded.slice(groupIndex * 4, groupIndex * 4 + 4);
    if (group === '0000') continue;

    let groupText = '';
    for (let position = 0; position < 4; position += 1) {
      const digit = group.charCodeAt(position) - 48;
      if (digit === 0) continue;
      groupText += digits[digit] + smallUnits[3 - position];
    }

    result += groupText + groupUnits[groupCount - 1 - groupIndex];
  }

  return result;
}

/** 만원 단위 정수 → 한글/한자 금액 본문. (35000 → "삼억오천만" / "參億五千萬") */
export function contractAmountToKorean(
  amountManwon: number,
  notation: ContractAmountNotation = 'hangul',
): string {
  assertManwonInteger(amountManwon);
  return digitsToKorean(manwonToWonDigits(amountManwon), notation);
}

/** 만원 단위 정수 → "일금 삼억오천만원정" (레거시 GetHangulFromNum 대응) */
export function formatContractAmountHangul(amountManwon: number): string {
  return `일금 ${contractAmountToKorean(amountManwon, 'hangul')}원정`;
}

/** 만원 단위 정수 → "金參億五千萬원整" (레거시 GetHanjaFromNum 대응) */
export function formatContractAmountHanja(amountManwon: number): string {
  return `金${contractAmountToKorean(amountManwon, 'hanja')}원整`;
}

/** 만원 단위 정수 → "₩350,000,000" */
export function formatContractAmountWon(amountManwon: number): string {
  assertManwonInteger(amountManwon);
  return `₩${groupThousands(manwonToWonDigits(amountManwon))}`;
}

/**
 * 만원 단위 정수 → 한글/한자 금액 + 원화 병기 문자열.
 * (35000 → "일금 삼억오천만원정 (₩350,000,000)" / "金參億五千萬원整 (₩350,000,000)")
 */
export function formatContractAmountWithWon(
  amountManwon: number,
  notation: ContractAmountNotation = 'hangul',
): string {
  const korean =
    notation === 'hangul'
      ? formatContractAmountHangul(amountManwon)
      : formatContractAmountHanja(amountManwon);
  return `${korean} (${formatContractAmountWon(amountManwon)})`;
}

import { formatPrice } from '@estate-erp/shared';

/**
 * 금액 글자 읽기 — 앱 전체의 규칙 하나.
 *
 * 전화로 들은 금액을 그대로 받아 만원 단위 정수로 바꾼다. 받는 모양:
 *   "15억" · "15.8억" · "15억 8천" · "15억8000" · "15억 8,000만" · "9억5천만" · "3억 5백" · "5천" ·
 *   "5000만" · "5천만원" · "158000" · "158,000" · "１５억"(전각) · "15억원" · "1조 2000억"
 * 숫자만 넣으면 만원으로 읽는다(158000 = 15억 8천만).
 *
 * 받지 않는 것: 음수("-5"), 만원 아래 자리("158000.5", "15.5"), 단위만("억"), 한글 숫자("구억"),
 * 지수("1e5"), 그 밖의 글자("15억 abc"), DB 칸(Int)을 넘는 값.
 *
 * 쓰는 곳: 매물 등록(properties/-manwon-input.ts), 희망매물(wanted-properties/-money-text.ts),
 * 거래의 금액 칸(deals/-deal-shared.tsx ManwonInput), 공용 표의 만원 칸(components/data-table).
 */
export type ManwonParseResult =
  | { valid: true; value: number | null }
  | { valid: false };

/** 만원 금액 칸(Prisma Int)이 담을 수 있는 가장 큰 값 */
export const MAX_MANWON = 2_147_483_647;

// 사용자가 친 한글 금액("15억 8천")을 읽는 단위다. 화면 언어와 상관없이 한글이어야 한다.
const UNIT_STEPS: ReadonlyArray<readonly [string, number]> = [
  ['조', 100_000_000], // i18n-ignore
  ['억', 10_000], // i18n-ignore
  ['천', 1_000], // i18n-ignore
  ['백', 100], // i18n-ignore
];

export function parseManwon(raw: string | null | undefined): ManwonParseResult {
  let text = String(raw ?? '')
    .normalize('NFKC')
    .replace(/[\s,]/g, '')
    .replace(/원$/, '');
  if (!text) return { valid: true, value: null };
  if (text.startsWith('-')) return { valid: false };

  // 숫자만: 만원으로 읽는다. 끝의 "만"도 허용한다(5000만).
  const plain = /^(\d+(?:\.\d+)?)만?$/.exec(text);
  if (plain) {
    const value = Number(plain[1]);
    // 만원 아래 자리(158000.5)는 저장할 수 없다
    return Number.isInteger(value) && value <= MAX_MANWON
      ? { valid: true, value }
      : { valid: false };
  }

  let total = 0;
  let matchedUnit = false;
  for (const [unit, multiplier] of UNIT_STEPS) {
    const match = new RegExp(`^(\\d+(?:\\.\\d+)?)${unit}만?`).exec(text);
    if (!match) continue;
    total += Number(match[1]) * multiplier;
    text = text.slice(match[0].length);
    matchedUnit = true;
  }
  if (!matchedUnit) return { valid: false };
  if (text) {
    const rest = /^(\d+)만?$/.exec(text);
    if (!rest) return { valid: false };
    total += Number(rest[1]);
  }
  const value = Math.round(total);
  return Number.isSafeInteger(value) && value <= MAX_MANWON
    ? { valid: true, value }
    : { valid: false };
}

/** 읽은 금액을 되비추는 글: "= 15억 8,000만" · 0이면 "= 0" */
export function formatManwonEcho(value: number): string {
  return `= ${value === 0 ? '0' : formatPrice(value)}`;
}

/** 입력칸 옆·아래에 보일 읽은 값. 못 읽으면 그렇다고 알린다. 비었으면 empty(없으면 문구 없음). */
export function describeManwon(
  raw: string | null | undefined,
  empty?: string,
): { text?: string; invalid: boolean } {
  const parsed = parseManwon(raw);
  if (!parsed.valid) return { text: '금액을 읽을 수 없습니다', invalid: true };
  if (parsed.value === null) return { text: empty, invalid: false };
  return { text: formatManwonEcho(parsed.value), invalid: false };
}

/** 금액 칸의 자리 표시·도움말에 쓰는 예시 */
export const MANWON_INPUT_HINT = '예: 15억, 15억 8천, 158000';

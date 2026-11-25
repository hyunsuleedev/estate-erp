import {
  describeManwon,
  MANWON_INPUT_HINT as SHARED_MANWON_INPUT_HINT,
  parseManwon,
  type ManwonParseResult as SharedManwonParseResult,
} from '@/lib/manwon';

/**
 * 전화로 들은 금액을 그대로 받아 만원 단위 정수로 바꾼다.
 * "15억" · "15.8억" · "15억 8천" · "15억8000" · "9억5천만" · "5천" · "158,000" · "158000" 모두 받는다.
 *
 * 숫자만 넣으면 만원으로 읽는다(158000 = 15억 8천만). 예전 입력칸은 type=number라
 * "15억"을 치면 "억"이 지워져 15만원으로 저장됐다.
 *
 * 읽는 규칙은 앱 공통(lib/manwon.ts) 하나다. 이 파일은 매물 화면이 쓰던 이름을 그대로 남겨 둔다.
 */
export type ManwonParseResult = SharedManwonParseResult;

export function parseManwonText(raw: string | null | undefined): ManwonParseResult {
  return parseManwon(raw);
}

/**
 * 저장할 값. 비었으면 undefined, 못 읽으면 오류를 던진다(등록 폼의 확인 단계에서 쓴다).
 * labelObject는 목적격 조사까지 붙인 이름("매매가를", "보증금을").
 */
export function requireManwon(raw: string, labelObject: string): number | undefined {
  const parsed = parseManwon(raw);
  if (!parsed.valid) {
    throw new Error(`${labelObject} 다시 확인하세요. 예: 15억, 15억 8천, 158000(만원)`);
  }
  return parsed.value ?? undefined;
}

/** 입력칸 옆에 보이는 읽은 값. 못 읽으면 그렇다고 알린다. */
export function describeManwonText(raw: string, empty?: string): { text?: string; invalid: boolean } {
  return describeManwon(raw, empty);
}

export const MANWON_INPUT_HINT = SHARED_MANWON_INPUT_HINT;

import { parseManwon } from '@/lib/manwon';

/**
 * 중개사가 말하듯 적은 금액을 만원 정수로 읽는다.
 * "90000" · "90,000" · "9억" · "9억 5000" · "9억5천" · "1.5억" · "8000만" · "5천만원" 모두 받는다.
 * 빈 글은 null, 읽을 수 없는 글은 NaN.
 *
 * 읽는 규칙은 앱 공통(lib/manwon.ts) 하나다. 이 파일은 희망매물 화면이 쓰던 모양(number | null, 못 읽으면 NaN)만 맞춘다.
 */
export function parseManwonText(text: string): number | null {
  const parsed = parseManwon(text);
  if (!parsed.valid) return Number.NaN;
  return parsed.value;
}

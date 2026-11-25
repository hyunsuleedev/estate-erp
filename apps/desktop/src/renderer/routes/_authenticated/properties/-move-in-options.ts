/** 입주 가능 시기 고르기 — 매물 등록과 가격·조건 수정이 같은 낱말을 쓴다. */
export const MOVE_IN_TYPES = [
  { value: 'immediate', label: '즉시 입주' },
  { value: 'date', label: '특정일 이후' },
  { value: 'range', label: '기간 협의' },
  { value: 'negotiable', label: '날짜 협의' },
  { value: 'unknown', label: '확인 필요' },
] as const;

export type MoveInType = (typeof MOVE_IN_TYPES)[number]['value'];

/** 저장된 날짜(ISO)를 날짜 칸 값(YYYY-MM-DD, 한국 날짜)으로 */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

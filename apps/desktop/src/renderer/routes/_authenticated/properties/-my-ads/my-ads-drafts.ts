/**
 * 표의 금액 입력칸에 친 값을 만원 단위 정수 글자로 바꾼다(제출 검사 isValidManwonInput과 같은 범위).
 * 천 단위 쉼표·공백·전각 숫자는 받아 들이고, 그 밖의 글자(소수점, 음수 부호, 문자)가 섞이면
 * null을 돌려준다 — 입력칸은 이전 값을 그대로 둔다. "12.5"를 "125"로 바꾸는 식으로 값의
 * 크기를 몰래 바꾸지 않기 위해서다.
 */
export function sanitizeManwonInput(value: string): string | null {
  const compact = value.normalize("NFKC").replace(/[,\s]/g, "");
  return /^\d*$/.test(compact) ? compact : null;
}

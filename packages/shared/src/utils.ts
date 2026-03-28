/**
 * 가격 단위: 만원 (10,000 KRW)
 * 예: 15.8억 = 158000 (만원)
 */

/** 만원 → 표시용 문자열 (예: 158000 → "15억 8,000만") */
export function formatPrice(priceInManwon: number): string {
  if (priceInManwon >= 10000) {
    const eok = Math.floor(priceInManwon / 10000);
    const man = priceInManwon % 10000;
    if (man === 0) return `${eok}억`;
    return `${eok}억 ${man.toLocaleString()}만`;
  }
  return `${priceInManwon.toLocaleString()}만`;
}

/** m² → 평 변환 (1평 = 3.3058m²) */
export function sqmToPyeong(sqm: number): number {
  return Math.round(sqm * 0.3025 * 10) / 10;
}

/** 평 → m² 변환 */
export function pyeongToSqm(pyeong: number): number {
  return Math.round(pyeong * 3.3058 * 100) / 100;
}

/**
 * 가격 단위: 만원 (10,000 KRW)
 * 예: 15.8억 = 158000 (만원)
 */

/**
 * 금액·날짜를 어느 말로 적을지. 데스크톱 화면이 영어일 때만 'en'으로 바꾼다(apps/desktop/src/renderer/i18n).
 * 서버와 테스트는 건드리지 않으므로 늘 한국어다.
 */
export type DisplayLocale = 'ko' | 'en';
let displayLocale: DisplayLocale = 'ko';

export function setDisplayLocale(locale: DisplayLocale): void {
  displayLocale = locale;
}

export function getDisplayLocale(): DisplayLocale {
  return displayLocale;
}

/**
 * 만원 → 표시용 문자열.
 *   한국어: 158000 → "15억 8,000만"
 *   영어:   158000 → "₩1.58B", 5000 → "₩50M", 250 → "₩2.5M", 85 → "₩850K"
 */
export function formatPrice(priceInManwon: number): string {
  if (displayLocale === 'en') return formatPriceEnglish(priceInManwon);
  if (priceInManwon >= 10000) {
    const eok = Math.floor(priceInManwon / 10000);
    const man = priceInManwon % 10000;
    if (man === 0) return `${eok}억`; // i18n-ignore
    return `${eok}억 ${man.toLocaleString()}만`; // i18n-ignore
  }
  return `${priceInManwon.toLocaleString()}만`; // i18n-ignore
}

/**
 * 영어 표기. 금액을 뭉개지 않는다 — 10억 이상이어도 B로 적어 소수 둘째 자리 안에 떨어지지 않으면 M으로 적는다
 * (123456만 → "₩1,234.56M"). 만원 단위라 M은 언제나 소수 둘째 자리 안에 떨어진다.
 */
function formatPriceEnglish(priceInManwon: number): string {
  const trim = (value: number) => value.toFixed(2).replace(/\.?0+$/, '');
  if (priceInManwon >= 100_000 && priceInManwon % 1_000 === 0) return `₩${trim(priceInManwon / 100_000)}B`;
  if (priceInManwon >= 100) {
    return `₩${(priceInManwon / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}M`;
  }
  return `₩${(priceInManwon * 10).toLocaleString('en-US')}K`;
}

/** m² → 평 변환 (1평 = 3.3058m²) */
export function sqmToPyeong(sqm: number): number {
  return Math.round(sqm * 0.3025 * 10) / 10;
}

/** 평 → m² 변환 */
export function pyeongToSqm(pyeong: number): number {
  return Math.round(pyeong * 3.3058 * 100) / 100;
}

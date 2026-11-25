/**
 * 표기 유틸 단일 소스 — 인라인 포맷 금지, 반드시 이 모듈을 사용한다.
 *
 * 금액은 만원(10,000 KRW) 단위 Int, 면적은 m² 기준 저장 (평 = m² × 0.3025).
 * 금액/면적의 핵심 변환은 @estate-erp/shared(formatPrice, sqmToPyeong)를 그대로 따른다.
 */
import { formatPrice, sqmToPyeong } from '@estate-erp/shared';

import { isEnglish } from '../i18n/auto';

const EMPTY = '—';

/**
 * 만원 단위 금액 → 표시 문자열.
 * formatMoney(158000) = "15억 8,000만" / formatMoney(5000) = "5,000만" / 0·null·undefined → "—"
 */
export function formatMoney(manwon: number | null | undefined): string {
  if (manwon == null || manwon === 0 || Number.isNaN(manwon)) return EMPTY;
  if (manwon < 0) return `-${formatPrice(Math.abs(manwon))}`;
  return formatPrice(manwon);
}

/**
 * 보증금/월세 표기. formatRent(10000, 250) = "1억 / 250만" — 둘 다 단위를 붙인다(화면 표기 기준).
 * 보증금 없음 → "— / 250만", 둘 다 없음 → "—"
 */
export function formatRent(
  deposit: number | null | undefined,
  monthlyRent: number | null | undefined,
): string {
  const hasDeposit = deposit != null && deposit !== 0;
  const hasRent = monthlyRent != null && monthlyRent !== 0;
  if (!hasDeposit && !hasRent) return EMPTY;
  const depositText = hasDeposit ? formatMoney(deposit) : EMPTY;
  // 영어에서는 월세도 금액 표기 그대로("₩2.5M"). "250만"처럼 만 단위 숫자만 남기면 읽을 수 없다.
  const rentText = hasRent ? (isEnglish ? formatMoney(monthlyRent) : `${monthlyRent.toLocaleString()}만`) : EMPTY;
  return `${depositText} / ${rentText}`;
}

/**
 * 금액 범위. "8억 ~ 9억" · 한쪽만 있으면 "8억 이상" / "9억 이하" · 같으면 "8억" · 둘 다 없으면 "—".
 */
export function formatMoneyRange(
  min: number | null | undefined,
  max: number | null | undefined,
): string {
  const hasMin = min != null && min > 0;
  const hasMax = max != null && max > 0;
  if (hasMin && hasMax) return min === max ? formatMoney(min) : `${formatMoney(min)} ~ ${formatMoney(max)}`;
  if (hasMin) return `${formatMoney(min)} 이상`;
  if (hasMax) return `${formatMoney(max)} 이하`;
  return EMPTY;
}

/**
 * 면적 표기(상세·폼). formatArea(84.92) = "84.92㎡ (25.7평)", formatArea(99.17) = "99.17㎡ (30평)" — 평은 소수 1자리, ".0"은 뗀다.
 * Prisma Decimal이 문자열로 내려오는 경우도 허용한다.
 */
export function formatArea(m2: number | string | null | undefined): string {
  if (m2 == null || m2 === '') return EMPTY;
  const value = typeof m2 === 'string' ? Number(m2) : m2;
  if (Number.isNaN(value) || value <= 0) return EMPTY;
  // 소수 2자리까지, 불필요한 trailing zero 제거 (84.92 → "84.92", 59 → "59")
  const m2Text = String(Math.round(value * 100) / 100);
  return `${m2Text}㎡ (${pyeongText(value)}평)`;
}

/**
 * 면적의 평 단위만 표기(목록·요약). formatPyeong(154.34) = "46.7평", formatPyeong(99.17) = "30평".
 */
export function formatPyeong(m2: number | string | null | undefined): string {
  if (m2 == null || m2 === '') return EMPTY;
  const value = typeof m2 === 'string' ? Number(m2) : m2;
  if (Number.isNaN(value) || value <= 0) return EMPTY;
  return `${pyeongText(value)}평`;
}

/** 평은 소수 1자리, ".0"은 뗀다: 99.17㎡ → "30", 84.92㎡ → "25.7" */
function pyeongText(m2: number): string {
  return sqmToPyeong(m2).toFixed(1).replace(/\.0$/, '');
}

/**
 * 전화번호 하이픈 표기.
 * "01012345678" → "010-1234-5678", "0212345678" → "02-1234-5678",
 * "021234567" → "02-123-4567", "15881234" → "1588-1234".
 * 패턴 불일치 시 원문 그대로 반환.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return EMPTY;
  let digits = phone.replace(/\D/g, '');
  if (!digits) return phone;
  // 국가번호로 저장된 번호(+82 10-…)는 국내 표기로 (서버의 normalizePhone과 같은 규칙)
  if (digits.startsWith('82') && digits.length > 10) digits = `0${digits.slice(2)}`;

  // 서울 지역번호 02 (총 9~10자리)
  if (digits.startsWith('02')) {
    if (digits.length === 10) return `02-${digits.slice(2, 6)}-${digits.slice(6)}`;
    if (digits.length === 9) return `02-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return phone;
  }
  // 전국 대표번호 (1588, 1577, 1899 등 — 8자리)
  if (/^1[0-9]{7}$/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }
  // 휴대폰(010 등) + 3자리 지역번호 (031, 051 등)
  if (digits.startsWith('0')) {
    if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
    if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

function toDate(d: string | number | Date | null | undefined): Date | null {
  if (d == null || d === '') return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']; // i18n-ignore
const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const startOfDayMs = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();

/**
 * 목록·옆 패널에서 쓰는 날짜 표기(앱 공통 규칙).
 * "오늘" · "어제" · "내일" · "11.19 (목)" · 다른 해는 "2027.03.01".
 * withWeekday=false면 좁은 칸용으로 요일을 뺀다("11.19").
 * 상담분석의 formatConsultationDay(consultations/-consultation-list-model.ts)와 같은 모양이다(다른 해만 다르다 — .qa/STANDARDS.md 기준).
 * 잘못된 값·빈 값이면 "".
 */
export function formatRelativeDay(
  d: string | number | Date | null | undefined,
  now: Date = new Date(),
  { withWeekday = true }: { withWeekday?: boolean } = {},
): string {
  const date = toDate(d);
  if (!date) return '';
  const dayGap = Math.round((startOfDayMs(now) - startOfDayMs(date)) / 86_400_000);
  if (dayGap === 0) return '오늘';
  if (dayGap === 1) return '어제';
  if (dayGap === -1) return '내일';
  // 다른 해는 요일 없이 "2027.03.01" (화면 표기 기준)
  if (date.getFullYear() !== now.getFullYear()) {
    return `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;
  }
  // 영어: "Nov 19 (Thu)". "11.19"는 영어권에서 11월 19일로도 19일 11월로도 읽힌다.
  if (isEnglish) {
    const weekdayEn = withWeekday ? ` (${WEEKDAYS_EN[date.getDay()]})` : '';
    return `${MONTHS_EN[date.getMonth()]} ${date.getDate()}${weekdayEn}`;
  }
  const weekday = withWeekday ? ` (${WEEKDAYS[date.getDay()]})` : '';
  return `${date.getMonth() + 1}.${date.getDate()}${weekday}`;
}

/** "오늘 14:20" · "어제 09:05" · "11.14 (금) 16:05". 잘못된 값이면 "". */
export function formatRelativeDayTime(
  d: string | number | Date | null | undefined,
  now: Date = new Date(),
): string {
  const date = toDate(d);
  if (!date) return '';
  return `${formatRelativeDay(date, now)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** "2026.06.10" */
export function formatDate(d: string | number | Date | null | undefined): string {
  const date = toDate(d);
  if (!date) return EMPTY;
  return `${date.getFullYear()}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;
}

/** "26.06.10" — 연도 2자리 단축 */
export function formatDateShortYear(
  d: string | number | Date | null | undefined,
): string {
  const date = toDate(d);
  if (!date) return EMPTY;
  return `${pad2(date.getFullYear() % 100)}.${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;
}

/** "06.10 14:30" */
export function formatDateTime(d: string | number | Date | null | undefined): string {
  const date = toDate(d);
  if (!date) return EMPTY;
  return `${pad2(date.getMonth() + 1)}.${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * D-Day 표기 (달력일 기준). 미래 → "D-7", 오늘 → "D-Day", 과거 → "D+3"
 */
export function formatDday(d: string | number | Date | null | undefined): string {
  const date = toDate(d);
  if (!date) return EMPTY;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(new Date())) / 86_400_000);
  if (diffDays === 0) return 'D-Day';
  return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`;
}

/**
 * 주소 축약 표기. formatAddressShort({ district: '강동구', ward: '고덕동', siteName: '래미안고덕' })
 * = "강동구 고덕동 · 래미안고덕". 모든 값이 없으면 "—".
 */
export function formatAddressShort(parts: {
  district?: string | null;
  ward?: string | null;
  siteName?: string | null;
}): string {
  const region = [parts.district, parts.ward].filter(Boolean).join(' ');
  if (region && parts.siteName) return `${region} · ${parts.siteName}`;
  return region || parts.siteName || EMPTY;
}

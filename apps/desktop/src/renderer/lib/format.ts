/**
 * 표기 유틸 단일 소스 — 인라인 포맷 금지, 반드시 이 모듈을 사용한다.
 *
 * 금액은 만원(10,000 KRW) 단위 Int, 면적은 m² 기준 저장 (평 = m² × 0.3025).
 * 금액/면적의 핵심 변환은 @estate-erp/shared(formatPrice, sqmToPyeong)를 그대로 따른다.
 */
import { formatPrice, sqmToPyeong } from '@estate-erp/shared';

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
 * 보증금/월세 표기. formatRent(10000, 120) = "1억 / 120"
 * 보증금 없음 → "— / 120", 둘 다 없음 → "—"
 */
export function formatRent(
  deposit: number | null | undefined,
  monthlyRent: number | null | undefined,
): string {
  const hasDeposit = deposit != null && deposit !== 0;
  const hasRent = monthlyRent != null && monthlyRent !== 0;
  if (!hasDeposit && !hasRent) return EMPTY;
  const depositText = hasDeposit ? formatMoney(deposit) : EMPTY;
  const rentText = hasRent ? monthlyRent.toLocaleString() : EMPTY;
  return `${depositText} / ${rentText}`;
}

/**
 * 면적 표기. formatArea(84.92) = "84.92㎡ (25.7평)" — 평은 소수 1자리.
 * Prisma Decimal이 문자열로 내려오는 경우도 허용한다.
 */
export function formatArea(m2: number | string | null | undefined): string {
  if (m2 == null || m2 === '') return EMPTY;
  const value = typeof m2 === 'string' ? Number(m2) : m2;
  if (Number.isNaN(value) || value <= 0) return EMPTY;
  // 소수 2자리까지, 불필요한 trailing zero 제거 (84.92 → "84.92", 59 → "59")
  const m2Text = String(Math.round(value * 100) / 100);
  const pyeong = sqmToPyeong(value).toFixed(1);
  return `${m2Text}㎡ (${pyeong}평)`;
}

/**
 * 면적의 평 단위만 표기. formatPyeong(154.34) = "46.7평".
 */
export function formatPyeong(m2: number | string | null | undefined): string {
  if (m2 == null || m2 === '') return EMPTY;
  const value = typeof m2 === 'string' ? Number(m2) : m2;
  if (Number.isNaN(value) || value <= 0) return EMPTY;
  return `${sqmToPyeong(value).toFixed(1)}평`;
}

/**
 * 전화번호 하이픈 표기.
 * "01012345678" → "010-1234-5678", "0212345678" → "02-1234-5678",
 * "021234567" → "02-123-4567", "15881234" → "1588-1234".
 * 패턴 불일치 시 원문 그대로 반환.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return EMPTY;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return phone;

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

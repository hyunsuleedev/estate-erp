import type { BuyerRequirement } from '@estate-erp/api-client';
import { formatArea, formatMoney } from '@/lib/format';

/** 매물유형 라벨 (shared SiteType 값 기준 — shared에 라벨 맵 부재로 로컬 정의) */
export const SITE_TYPE_LABELS: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라',
  house: '단독/다가구',
  commercial: '상가',
  land: '토지',
  living_accommodation: '생활숙박시설',
};

export const CONSULTATION_TYPE_LABELS: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

/** 다음 연락일 파생 상태 */
export type FollowUpState = 'overdue' | 'today' | 'scheduled' | 'none';

export function getFollowUpState(
  nextContactDate: string | null | undefined,
): FollowUpState {
  if (!nextContactDate) return 'none';
  const next = new Date(nextContactDate);
  const today = new Date();
  const dNext = new Date(next.getFullYear(), next.getMonth(), next.getDate());
  const dToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (dNext.getTime() < dToday.getTime()) return 'overdue';
  if (dNext.getTime() === dToday.getTime()) return 'today';
  return 'scheduled';
}

/** 예산 요약 — 거래유형별 표기 (만원 단위 입력) */
export function formatBudget(r: BuyerRequirement): string {
  const range = (min: number | null, max: number | null) => {
    if (!min && !max) return '';
    if (min && max) return `${formatMoney(min)} ~ ${formatMoney(max)}`;
    if (min) return `${formatMoney(min)} ~`;
    return `~ ${formatMoney(max)}`;
  };
  if (r.transactionType === 'monthly') {
    const dep = range(r.depositMin, r.depositMax);
    const rent = r.monthlyRentMax ? `월 ${formatMoney(r.monthlyRentMax)} 이하` : '';
    if (dep && rent) return `보증금 ${dep} / ${rent}`;
    if (dep) return `보증금 ${dep}`;
    if (rent) return rent;
    return '—';
  }
  const price = range(r.priceMin, r.priceMax);
  return price || '—';
}

/** 희망지역 칩 라벨 목록 */
export function regionLabels(r: BuyerRequirement): string[] {
  return (r.preferredRegions ?? [])
    .map((pr) => pr.ward?.name ?? pr.district?.name ?? pr.province?.name ?? '')
    .filter(Boolean);
}

/** 희망단지 칩 라벨 목록 */
export function siteLabels(r: BuyerRequirement): string[] {
  return (r.preferredSites ?? []).map((ps) => ps.site?.name ?? '').filter(Boolean);
}

/** 상태 전이 규칙 (PRD 10장) — 현재 상태에서 이동 가능한 상태 목록 */
export const STATUS_TRANSITIONS: Record<string, string[]> = {
  active: ['matched', 'inactive'],
  matched: ['completed', 'active'],
  completed: ['active'],
  inactive: ['active'],
};

/** date input(yyyy-MM-dd)용 변환 */
export function toDateInputValue(d: string | null | undefined): string {
  if (!d) return '';
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return '';
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${m}-${day}`;
}

/** 면적 범위 표기 — "59㎡ (17.8평) ~ 84.92㎡ (25.7평)" */
export function formatAreaRange(
  min: number | string | null | undefined,
  max: number | string | null | undefined,
): string {
  const minText = min != null && min !== '' ? formatArea(min) : '';
  const maxText = max != null && max !== '' ? formatArea(max) : '';
  if (minText && maxText) return `${minText} ~ ${maxText}`;
  if (minText) return `${minText} 이상`;
  if (maxText) return `${maxText} 이하`;
  return '—';
}

/** 폼에서 선택한 지역 1건 (regions.search 결과 기반) */
export interface RegionSelection {
  level: 'province' | 'district' | 'ward';
  code: string;
  label: string;
}

/** 폼에서 선택한 단지 1건 */
export interface SiteSelection {
  siteId: string;
  name: string;
}

/** BuyerRequirement의 preferredRegions → 폼 선택값으로 변환 */
export function toRegionSelections(r: BuyerRequirement): RegionSelection[] {
  return (r.preferredRegions ?? []).flatMap((pr): RegionSelection[] => {
    if (pr.wardCode && pr.ward) {
      return [{ level: 'ward' as const, code: pr.wardCode, label: pr.ward.name }];
    }
    if (pr.districtCode && pr.district) {
      return [{ level: 'district' as const, code: pr.districtCode, label: pr.district.name }];
    }
    if (pr.provinceCode && pr.province) {
      return [{ level: 'province' as const, code: pr.provinceCode, label: pr.province.name }];
    }
    return [];
  });
}

/** BuyerRequirement의 preferredSites → 폼 선택값으로 변환 */
export function toSiteSelections(r: BuyerRequirement): SiteSelection[] {
  return (r.preferredSites ?? []).flatMap((ps) =>
    ps.site ? [{ siteId: ps.siteId, name: ps.site.name }] : [],
  );
}

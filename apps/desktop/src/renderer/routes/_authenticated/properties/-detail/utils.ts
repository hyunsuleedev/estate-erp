import type { Property, PropertyListing } from '@estate-erp/api-client';
import type { Match, Tenant } from '@estate-erp/api-client';
import { formatPrice, sqmToPyeong } from '@estate-erp/shared';

export const transactionTypeLabels: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

export const transactionTypeColors: Record<string, string> = {
  sale: 'bg-rose-50 text-rose-700',
  jeonse: 'bg-blue-50 text-blue-700',
  monthly: 'bg-cyan-50 text-cyan-700',
};

export const checkStatusLabels: Record<string, string> = {
  unverified: '미확인',
  verified: '확인완료',
  in_contract: '거래중',
  hold: '보류',
  done: '종료',
};

export const checkStatusColors: Record<string, string> = {
  unverified: 'bg-gray-100 text-gray-600',
  verified: 'bg-emerald-50 text-emerald-700',
  in_contract: 'bg-blue-50 text-blue-700',
  hold: 'bg-amber-50 text-amber-700',
  done: 'bg-gray-50 text-gray-400',
};

export const siteTypeLabels: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라',
  house: '단독/다가구',
  commercial: '상가',
  land: '토지',
  living_accommodation: '생활숙박',
};

export const roleLabels: Record<string, string> = {
  owner: '소유자',
  co_owner: '공동소유',
  representative: '대리인',
  lawyer: '법무사',
  tax_agent: '세무사',
};

export const matchStageLabels: Record<string, string> = {
  suggested: '내부 후보',
  buyerInterested: '고객 관심',
  viewingConfirmed: '임장 가능 확인',
  viewing: '임장',
  negotiating: '협상중',
  dealCreated: '거래 생성',
  closed: '종료',
  buyerContacted: '고객 관심',
  ownerContacted: '임장 가능 확인',
};

export const consultationTypeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

export function getPropertyTitle(property: Property): string {
  const siteName = property.site?.name ?? '매물 상세';
  const unitLabel = getPropertyUnitLabel(property);
  return unitLabel ? `${siteName} ${unitLabel}` : siteName;
}

export function getPropertyUnitLabel(property: Property): string {
  const dongName =
    property.unit?.dong && !property.unit.dong.isPlaceholder
      ? property.unit.dong.name
      : '';
  return [dongName, property.unit?.name].filter(Boolean).join(' ');
}

export function formatPropertyArea(
  exclusive?: number | null,
  supply?: number | null,
): string {
  if (exclusive && supply) {
    return `${formatArea(exclusive)} / 공급 ${formatArea(supply)}`;
  }
  return formatArea(exclusive ?? supply);
}

export function formatArea(area?: number | null): string {
  if (!area) return '-';
  const value = Number(area);
  return `${value.toFixed(1)}㎡ · ${sqmToPyeong(value)}평`;
}

export function formatListingPrice(listing?: PropertyListing | null): string {
  if (!listing) return '-';
  if (listing.transactionType === 'monthly') {
    const deposit = listing.deposit ? formatPrice(listing.deposit) : '-';
    const rent = listing.monthlyRent
      ? `${listing.monthlyRent.toLocaleString()}만`
      : '-';
    return `${deposit} / ${rent}`;
  }
  return listing.price ? `${formatPrice(listing.price)}원` : '-';
}

export function formatDateShort(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
  });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelativeDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return '오늘';
  if (diffDays === 1) return '어제';
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)}개월 전`;
  return formatDateShort(value);
}

export function getMoveInLabel(tenant?: Tenant): string {
  if (!tenant) return '즉시 또는 협의';
  if (tenant.moveOutDate) return `${formatDateShort(tenant.moveOutDate)} 이후`;
  if (tenant.contractEnd) return `${formatDateShort(tenant.contractEnd)} 만료`;
  return '임차 조건 확인 필요';
}

export function getTenantPeriod(tenant: Tenant): string {
  if (!tenant.contractStart && !tenant.contractEnd) return '계약 기간 미등록';
  return `${formatDateShort(tenant.contractStart)} - ${formatDateShort(tenant.contractEnd)}`;
}

export function formatBuyerBudget(match: Match): string {
  const requirement = match.buyerRequirement;
  if (!requirement) return '조건 정보 없음';

  const min = requirement.priceMin ? formatPrice(requirement.priceMin) : null;
  const max = requirement.priceMax ? formatPrice(requirement.priceMax) : null;
  if (min && max) return `예산 ${min}~${max}`;
  if (max) return `예산 ${max} 이하`;
  if (min) return `예산 ${min} 이상`;
  return '예산 미등록';
}

export function comparePropertyListing(
  a: PropertyListing,
  b: PropertyListing,
): number {
  const order: Record<string, number> = { sale: 0, jeonse: 1, monthly: 2 };
  return (order[a.transactionType] ?? 99) - (order[b.transactionType] ?? 99);
}

export function getInitials(name: string): string {
  if (!name) return '';
  const cleaned = name.trim();
  if (!cleaned) return '';
  // 한글: 첫 글자 2개. 그 외: 첫 글자
  const first = cleaned.charAt(0);
  return first;
}

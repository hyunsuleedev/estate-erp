/**
 * 관리단지 페이지 보조 헬퍼 — 라벨, 배치 파싱, 점유상태 분류, 가격 표기.
 */
import type { Unit } from '@estate-erp/api-client';
import { formatMoney, formatRent } from '@/lib/format';

// ── Labels ──────────────────────────────────────────────────────

export const siteTypeLabels: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피스텔',
  villa: '빌라',
  house: '단독/다가구',
  commercial: '상가',
  land: '토지',
  living_accommodation: '생활숙박',
};

export const siteTypeShort: Record<string, string> = {
  apartment: '아파트',
  officetel: '오피',
  villa: '빌라',
  house: '단독',
  commercial: '상가',
  land: '토지',
  living_accommodation: '숙박',
};

export const consultationTypeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

export const tenantStatusLabels: Record<string, string> = {
  residing: '거주중',
  moving_out: '퇴거예정',
  moved: '퇴거',
};

// ── Region / placement helpers ──────────────────────────────────

export function extractRegion(address: string | null): string {
  if (!address) return '기타';
  const match = address.match(/([가-힣]+구)\s*([가-힣]+동)?/);
  if (match) return match[2] ? `${match[1]} ${match[2]}` : match[1];
  const cityMatch = address.match(/([가-힣]+[시군])/);
  return cityMatch ? cityMatch[1] : '기타';
}

/** 법정동 체인(ward)이 projection에 있으면 우선 사용, 없으면 주소 regex fallback */
export function extractRegionFromSite(site: {
  ward?: { name: string; district?: { name: string } | null } | null;
  roadAddress?: string | null;
  jibunAddress?: string | null;
}): string {
  if (site.ward?.district?.name) {
    return `${site.ward.district.name} ${site.ward.name ?? ''}`.trim();
  }
  return extractRegion(site.roadAddress ?? site.jibunAddress ?? null);
}

export function parseUnitPlacement(unit: Unit): { floor: number | null; lineNo: number | null } {
  const digits = unit.name.replace(/\D/g, '');
  const fallbackFloor = digits.length >= 3 ? Number.parseInt(digits.slice(0, -2), 10) : null;
  const fallbackLineNo = digits.length >= 2 ? Number.parseInt(digits.slice(-2), 10) : null;

  return {
    floor: unit.floor ?? (Number.isNaN(fallbackFloor) ? null : fallbackFloor),
    lineNo: unit.lineNo ?? (Number.isNaN(fallbackLineNo) ? null : fallbackLineNo),
  };
}

export function formatFloorLabel(floor: number): string {
  if (floor === 0) return 'P';
  if (floor < 0) return `B${Math.abs(floor)}`;
  return `${floor}`;
}

// ── 가격 표기 (만원 → 억 변환은 formatMoney가 담당) ─────────────

export function formatListingPrice(listing: {
  transactionType: string;
  price: number | null;
  deposit: number | null;
  monthlyRent: number | null;
}): string {
  if (listing.transactionType === 'monthly') {
    return formatRent(listing.deposit, listing.monthlyRent);
  }
  if (listing.transactionType === 'jeonse') {
    return formatMoney(listing.deposit ?? listing.price);
  }
  // sale, yearly_rent(연간 총액) 등
  return formatMoney(listing.price ?? listing.deposit);
}

// ── 점유상태 (내부 CRM 데이터 기반 분류) ────────────────────────

export type OccupancyStatus = 'owner_occupied' | 'jeonse' | 'monthly' | 'vacant_or_unknown';

export const OCCUPANCY_ORDER: OccupancyStatus[] = [
  'owner_occupied',
  'jeonse',
  'monthly',
  'vacant_or_unknown',
];

export interface OccupancyMeta {
  label: string;
  /** 배치표 셀 배경/보더 */
  cellClass: string;
  /** 범례/뱃지 점 색 */
  dotClass: string;
  /** 뱃지 (연한 배경 + 진한 글자) */
  badgeClass: string;
}

export const OCCUPANCY_META: Record<OccupancyStatus, OccupancyMeta> = {
  owner_occupied: {
    label: '자가',
    cellClass: 'border-success/30 bg-success-soft hover:bg-success-soft/80',
    dotClass: 'bg-success',
    badgeClass: 'bg-success-soft text-success',
  },
  jeonse: {
    label: '전세',
    cellClass: 'border-info/30 bg-info-soft hover:bg-info-soft/80',
    dotClass: 'bg-info',
    badgeClass: 'bg-info-soft text-info',
  },
  monthly: {
    label: '월세',
    cellClass: 'border-orange/30 bg-orange-soft hover:bg-orange-soft/80',
    dotClass: 'bg-orange',
    badgeClass: 'bg-orange-soft text-orange',
  },
  vacant_or_unknown: {
    label: '공실/미상',
    cellClass: 'border-dashed border-border/70 bg-background hover:bg-accent/60',
    dotClass: 'bg-muted-foreground/40',
    badgeClass: 'bg-neutral-soft text-muted-foreground',
  },
};

/**
 * 점유상태 분류 우선순위 (PRD):
 * 1. 세입자(residing) 있음 + 월세 금액 있음 → 월세
 * 2. 세입자(residing) 있음 + 월세 없음 → 전세
 * 3. 소유자(owner, active) 실거주 → 자가
 * 4. 신호 없음 → 공실/미상
 */
export function getUnitOccupancy(unit: Unit): OccupancyStatus {
  const properties = unit.properties ?? [];
  const tenants = properties.flatMap((property) => property.tenants ?? []);
  if (tenants.length > 0) {
    return tenants.some((tenant) => (tenant.monthlyRent ?? 0) > 0) ? 'monthly' : 'jeonse';
  }
  const ownerResident = properties
    .flatMap((property) => property.propertyContacts ?? [])
    .some((pc) => pc.role === 'owner' && pc.isResident);
  if (ownerResident) return 'owner_occupied';
  return 'vacant_or_unknown';
}

// ── 배치표 공용 타입 ────────────────────────────────────────────

export interface MultiSelectOption {
  value: string;
  label: string;
  helper?: string;
}

export interface PositionedUnit {
  unit: Unit;
  floor: number;
  lineNo: number;
}

export interface LayoutSection {
  key: string;
  label: string;
  floors: number[];
  lineNos: number[];
  cellMap: Map<string, PositionedUnit>;
  unpositionedUnits: Unit[];
}

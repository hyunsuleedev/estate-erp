import type { BuyerRequirement, ContactRelation } from '@estate-erp/api-client';
import {
  CONTACT_RELATION_TYPES,
  CONTACT_RELATION_TYPE_LABELS,
  sqmToPyeong,
  type ContactRelationType,
} from '@estate-erp/shared';
import { formatMoney } from '@/lib/format';

/**
 * 연락처 화면들이 함께 쓰는 이름표와 포맷 (상세 · 옆 패널 · 목록 · 대화창).
 * 카드 모양은 여기 두지 않는다: 상세 화면은 $id.tsx에서 매물 상세의 부품으로 그린다.
 */

export const consultationTypeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '온라인',
};

export const buyerStatusLabels: Record<string, string> = {
  active: '활성',
  matched: '활성',
  hold: '보류',
  inactive: '보류',
  completed: '완료',
};

export const urgencyLabels: Record<string, string> = {
  urgent: '급',
  normal: '보통',
  flexible: '여유',
};

export const propertyRoleLabels: Record<string, string> = {
  owner: '소유자',
  co_owner: '공동소유',
  representative: '대리인',
  lawyer: '법무사',
  tax_agent: '세무사',
};

export const relationTypeLabels = Object.fromEntries(
  CONTACT_RELATION_TYPES.map((type) => [
    type,
    CONTACT_RELATION_TYPE_LABELS[type],
  ]),
) as Record<ContactRelationType, string>;

export function getContactRelationLabel(relation: ContactRelation) {
  const displayType = relation.displayRelationType ?? relation.relationType;
  return (
    relation.displayLabel ||
    CONTACT_RELATION_TYPE_LABELS[displayType] ||
    displayType
  );
}

export function formatBudgetSummary(requirement: BuyerRequirement) {
  if (requirement.transactionType === 'monthly') {
    const deposit = formatMoneyRange(requirement.depositMin, requirement.depositMax);
    const monthly = requirement.monthlyRentMax
      ? `${formatMoney(requirement.monthlyRentMax)} 이하`
      : '협의';
    return `보증금 ${deposit} · 월세 ${monthly}`;
  }

  if (requirement.transactionType === 'jeonse') {
    return `전세 ${formatMoneyRange(requirement.depositMin, requirement.depositMax)}`;
  }

  return `매매 ${formatMoneyRange(requirement.priceMin, requirement.priceMax)}`;
}

export function formatMoneyRange(min: number | null, max: number | null) {
  if (min && max) return `${formatMoney(min)} ~ ${formatMoney(max)}`;
  if (min) return `${formatMoney(min)} 이상`;
  if (max) return `${formatMoney(max)} 이하`;
  return '협의';
}

/** 면적 범위 — m²+평 병기 (단일 값 포맷은 formatArea, 범위는 여기서 처리) */
export function formatAreaSummary(requirement: BuyerRequirement) {
  const fmt = (value: number) => `${value}㎡(${sqmToPyeong(value)}평)`;
  if (!requirement.areaMin && !requirement.areaMax) return '면적 조건 없음';
  if (requirement.areaMin && requirement.areaMax) {
    return `${fmt(requirement.areaMin)} ~ ${fmt(requirement.areaMax)}`;
  }
  if (requirement.areaMin) return `${fmt(requirement.areaMin)} 이상`;
  return `${fmt(requirement.areaMax ?? 0)} 이하`;
}

export function formatRegionSummary(requirement: BuyerRequirement) {
  const regions = (requirement.preferredRegions ?? [])
    .map((region) => region.ward?.name ?? region.district?.name ?? region.province?.name ?? '')
    .filter(Boolean);
  return regions.length > 0 ? regions.join(', ') : null;
}

export interface RelationItem {
  id: string;
  /** 관계 레코드 id (삭제용) */
  relationId: string;
  relation: ContactRelation;
  counterpartId: string | null;
  counterpartName: string;
  counterpartPhone: string | null;
  /** DB 원본 관계 방향을 편집 화면에서 사람 이름으로 설명하기 위한 값 */
  sourceName: string;
  targetName: string;
}

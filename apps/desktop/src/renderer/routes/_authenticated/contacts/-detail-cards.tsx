import type { BuyerRequirement, ContactDetail, Party, PartyMember } from '@estate-erp/api-client';
import {
  ContactKind,
  PartyKind,
  formatPlaceLabel,
} from '@estate-erp/shared';
import { formatMoney, formatMoneyRange, formatPyeong } from '@/lib/format';

/**
 * 연락처 화면들이 함께 쓰는 이름표와 포맷 (상세 · 옆 패널 · 목록 · 대화창).
 * 카드 모양은 여기 두지 않는다: 상세 화면은 $id.tsx에서 매물 상세의 부품으로 그린다.
 */

export const consultationTypeLabels: Record<string, string> = {
  phone: '전화',
  visit: '방문',
  online: '문자·온라인',
};

/** 상담을 적을 때 고르는 방식 (문자·카톡도 "문자·온라인"이다) */
export const CONSULTATION_TYPE_CHOICES = [
  { value: 'phone', label: '전화' },
  { value: 'visit', label: '방문' },
  { value: 'online', label: '문자·온라인' },
] as const;

/**
 * 전화번호 칸 검사. 서버와 같은 기준(숫자 7~12자리, +82는 0으로)이다. 문제가 없으면 null.
 * 저장한 뒤 번호가 조용히 사라지지 않게 저장 전에 알려 준다.
 */
export function findPhoneProblem(values: string[]): string | null {
  for (const value of values) {
    const raw = value.trim();
    if (!raw) continue;
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('82') && digits.length > 10) digits = `0${digits.slice(2)}`;
    if (digits.length < 7 || digits.length > 12) {
      return `전화번호 "${raw}"의 자릿수가 맞지 않습니다. 010-1234-5678처럼 숫자로 입력하세요.`;
    }
  }
  return null;
}

/** 오류 문구는 앱 공용 규칙을 따른다 (서버의 한국어 문구 → 연결 실패 안내 → 화면의 기본 문구) */
export { apiErrorMessage } from '@/lib/api-error';

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

export const contactKindLabels: Record<string, string> = {
  person: '개인',
  organization: '법인·단체',
};

/** 예산 한 줄. 금액 범위는 앱 공용 표기("8억 ~ 9억", "8억 이상")를 쓴다 */
export function formatBudgetSummary(requirement: BuyerRequirement) {
  const range = (min: number | null, max: number | null) => {
    const text = formatMoneyRange(min, max);
    return text === '—' ? '금액 미정' : text;
  };
  if (requirement.transactionType === 'monthly') {
    const monthly = requirement.monthlyRentMax ? `${formatMoney(requirement.monthlyRentMax)} 이하` : '금액 미정';
    return `보증금 ${range(requirement.depositMin, requirement.depositMax)} · 월세 ${monthly}`;
  }
  if (requirement.transactionType === 'jeonse') {
    // 전세가는 매매가와 같은 칸(priceMin/Max)에 저장된다 — 희망매물 · 희망 조건 화면과 같다.
    // 예전에는 보증금 칸을 읽어 "전세 9억 이하"가 여기서만 "금액 미정"으로 보였다. 옛 자료는 보증금 칸에 있을 수 있어 그다음에 본다.
    const hasPrice = requirement.priceMin != null || requirement.priceMax != null;
    return hasPrice
      ? `전세 ${range(requirement.priceMin, requirement.priceMax)}`
      : `전세 ${range(requirement.depositMin, requirement.depositMax)}`;
  }
  return `매매 ${range(requirement.priceMin, requirement.priceMax)}`;
}

/** 면적 범위. 요약이라 평으로만 적는다("30평 ~ 39평"). ㎡ 병기는 희망 조건 상세 화면의 몫이다 */
export function formatAreaSummary(requirement: BuyerRequirement) {
  const fmt = (value: number) => formatPyeong(value);
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
  // 고른 단지도 함께 적는다 ("고덕동, 고덕그라시움")
  const sites = (requirement.preferredSites ?? [])
    .map((preferred) => preferred.site?.name ?? '')
    .filter(Boolean);
  const all = [...regions, ...sites];
  return all.length > 0 ? all.join(', ') : null;
}

export interface PartyDisplayItem {
  id: string;
  partyId: string;
  memberId: string;
  partyKind: PartyKind;
  contactId: string;
  contactName: string;
  contactPhone: string | null;
  roleLabel: string | null;
  isPrimary: boolean;
  memo: string | null;
}

function mapMemberToDisplayItem(party: Party, member: PartyMember): PartyDisplayItem {
  return {
    id: member.id,
    partyId: party.id,
    memberId: member.id,
    partyKind: party.kind,
    contactId: member.contactId,
    contactName: member.contact?.name ?? '이름 없음',
    contactPhone: member.contact?.phone ?? null,
    roleLabel: member.roleLabel,
    isPrimary: member.isPrimary,
    memo: member.memo,
  };
}

export function collectPartyDisplayItems(contact: ContactDetail): {
  householdItems: PartyDisplayItem[];
  organizationItems: PartyDisplayItem[];
  allItems: PartyDisplayItem[];
} {
  const household = contact.parties?.household ?? null;
  const organizations = contact.parties?.organizations ?? [];

  if (contact.kind === ContactKind.ORGANIZATION) {
    const orgParty = organizations[0] ?? contact.organizationParty ?? null;
    const organizationItems = orgParty
      ? orgParty.members.map((member) => mapMemberToDisplayItem(orgParty, member))
      : [];
    return {
      householdItems: [],
      organizationItems,
      allItems: organizationItems,
    };
  }

  const householdItems = household
    ? household.members
        .filter((member) => member.contactId !== contact.id)
        .map((member) => mapMemberToDisplayItem(household, member))
    : [];

  const organizationItems = organizations
    .map((party) => {
      const self = party.members.find((member) => member.contactId === contact.id);
      if (!self || !party.organizationContactId) return null;
      return {
        id: `${party.id}:${self.id}`,
        partyId: party.id,
        memberId: self.id,
        partyKind: party.kind,
        contactId: party.organizationContactId,
        contactName: party.organizationContact?.name ?? party.name ?? '법인',
        contactPhone: party.organizationContact?.phone ?? null,
        roleLabel: self.roleLabel,
        isPrimary: self.isPrimary,
        memo: self.memo,
      } satisfies PartyDisplayItem;
    })
    .filter((item): item is PartyDisplayItem => item !== null);

  return {
    householdItems,
    organizationItems,
    allItems: [...householdItems, ...organizationItems],
  };
}

/** "고덕그라시움 102동 2203호" — 단지·동·호를 공용 규칙으로 잇는다 (손으로 이어 붙이지 않는다) */
export function placeLabelOf(
  property:
    | {
        site?: { name?: string | null } | null;
        unit?: {
          name?: string | null;
          floor?: number | null;
          floorEnd?: number | null;
          floorLabel?: string | null;
          dong?: { name?: string | null; isPlaceholder?: boolean | null } | null;
        } | null;
      }
    | null
    | undefined,
) {
  if (!property) return '';
  return formatPlaceLabel({
    siteName: property.site?.name,
    dongName: property.unit?.dong?.name,
    dongIsPlaceholder: property.unit?.dong?.isPlaceholder,
    unit: property.unit,
  });
}

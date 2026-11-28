import type { Listing, ListingIntake } from '@estate-erp/api-client';
import { IntakeConfirmationState } from '@estate-erp/shared';
import { getIntakeConfirmationState } from '@/lib/listing-status';
import type { Tone } from '@/lib/status-config';

// ── 목록 행 타입 (index.tsx + '-' 보조 파일 공유) ────────────────

export type ListingSummary = Pick<
  Listing,
  | 'id'
  | 'intakeId'
  | 'transactionType'
  | 'price'
  | 'deposit'
  | 'monthlyRent'
  | 'maintenanceFee'
  | 'maintenanceFeeIncludes'
  | 'loanAmount'
  | 'premium'
  | 'moveInAvailableType'
  | 'moveInAvailableFrom'
  | 'moveInAvailableTo'
  | 'isPaused'
  | 'intake'
  | 'deals'
  | 'memo'
  | 'createdAt'
  | 'updatedAt'
  | 'activeAdvertisements'
  | 'activeAdvertisementCount'
  | 'advertisements'
  | 'priceHistories'
  | '_count'
>;

export type ListingProperty = NonNullable<Listing['property']>;

export interface PropertyListingGroup {
  id: string;
  propertyId: string;
  property?: ListingProperty;
  representative: Listing;
  listings: ListingSummary[];
  matchedListings: Listing[];
}

type ListingPrimaryPriceInput = Pick<
  Listing,
  'transactionType' | 'price' | 'deposit'
>;

/** 목록·지도·거래 시작 UI에서 공통으로 표시할 대표 가격을 반환한다. */
export function getListingPrimaryPrice(listing: ListingPrimaryPriceInput) {
  return listing.transactionType === 'monthly'
    ? listing.deposit
    : listing.price;
}

/**
 * StatusBadge 톤 → EditableCell 칩 클래스 매핑.
 * (EditableCell chipOptions는 className 문자열을 요구하므로
 *  status-config의 tone을 같은 토큰 유틸로 변환한다.)
 */
export const TONE_CHIP_CLASSES: Record<Tone, string> = {
  gray: 'bg-neutral-soft text-muted-foreground',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  violet: 'bg-violet-soft text-violet',
  pink: 'bg-pink-soft text-pink',
  orange: 'bg-orange-soft text-orange',
  destructive: 'bg-destructive-soft text-destructive',
  neutral: 'bg-neutral-soft text-neutral-strong',
};

// ── 의뢰(ListingIntake) 헬퍼 ─────────────────────────────────────

const INTAKE_STATUS_PRIORITY: Record<string, number> = {
  open: 0,
  hold: 1,
  closed: 2,
};

export type IntakeRowSummary = Pick<
  ListingIntake,
  | 'id'
  | 'lifecycleStatus'
  | 'lifecycleChangedAt'
  | 'lifecycleChangedBy'
  | 'closedReason'
  | 'receivedAt'
  | 'lastCheckedAt'
  | 'lastVerifiedAt'
  | 'lastCheckResult'
  | 'nextConfirmAt'
  | 'memo'
  | 'updatedAt'
>;

/** 그룹의 매물들이 참조하는 의뢰 중 대표 의뢰 1건 선택 (진행 중 우선 → 최근 접수순). */
export function pickPrimaryIntake(
  listings: Array<Pick<ListingSummary, 'intakeId' | 'intake'>>,
): IntakeRowSummary | null {
  const seen = new Set<string>();
  const intakes: IntakeRowSummary[] = [];

  for (const listing of listings) {
    const intake = listing.intake;
    if (!intake || seen.has(intake.id)) continue;
    seen.add(intake.id);
    intakes.push({
      id: intake.id,
      lifecycleStatus: intake.lifecycleStatus,
      lifecycleChangedAt: intake.lifecycleChangedAt,
      lifecycleChangedBy: intake.lifecycleChangedBy,
      closedReason: intake.closedReason,
      receivedAt: intake.receivedAt,
      lastCheckedAt: intake.lastCheckedAt,
      lastVerifiedAt: intake.lastVerifiedAt,
      lastCheckResult: intake.lastCheckResult,
      nextConfirmAt: intake.nextConfirmAt,
      memo: intake.memo,
      updatedAt: intake.updatedAt,
    });
  }

  if (intakes.length === 0) return null;

  return intakes
    .slice()
    .sort(
      (a, b) =>
        (INTAKE_STATUS_PRIORITY[String(a.lifecycleStatus)] ?? 9) -
          (INTAKE_STATUS_PRIORITY[String(b.lifecycleStatus)] ?? 9) ||
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    )[0];
}

/** 다음 확인일이 지났는지 (달력일 기준) */
export function isIntakeOverdue(
  intake: Pick<
    ListingIntake,
    'lifecycleStatus' | 'lastVerifiedAt' | 'lastCheckResult' | 'nextConfirmAt'
  >,
) {
  return (
    getIntakeConfirmationState(intake) === IntakeConfirmationState.OVERDUE
  );
}

type MoveInAvailabilityInput = {
  moveInAvailableType?: string | null;
  moveInAvailableFrom?: string | null;
  moveInAvailableTo?: string | null;
};

type TenantPhoneLineInput = {
  contact?: {
    phone?: string | null;
  } | null;
  contractEnd?: string | null;
};

/**
 * 모르는 입주 시기는 강조하지 않고 다른 빈 칸처럼 "-"로 둔다(사용자 결정 2026-11-27, 거주상태 칸과 같게).
 * 주황 칩이 여러 줄에 되풀이되면 정작 봐야 할 "즉시"와 날짜가 묻힌다. 물어봐야 한다는 것은 매물 상세의 할 일이 챙긴다.
 */
const UNKNOWN_MOVE_IN = {
  label: '-',
  detail: null,
  className: 'px-0 text-muted-foreground',
} as const;

export function getMoveInAvailability(listing: MoveInAvailabilityInput) {
  const type = listing.moveInAvailableType ?? 'unknown';
  const from = listing.moveInAvailableFrom;
  const to = listing.moveInAvailableTo;

  if (type === 'immediate') {
    return {
      label: '즉시',
      detail: null,
      className: 'bg-neutral-soft text-neutral-strong',
    };
  }

  if (type === 'date') {
    if (!from) return UNKNOWN_MOVE_IN;
    return {
      label: `${formatMoveInDate(from)} 이후`,
      detail: null,
      className: 'bg-neutral-soft text-neutral-strong',
    };
  }

  if (type === 'range') {
    return {
      label: formatMoveInRange(from, to),
      detail: null,
      className: 'bg-neutral-soft text-neutral-strong',
    };
  }

  if (type === 'negotiable') {
    return {
      label: '협의',
      detail: null,
      className: 'bg-neutral-soft text-neutral-strong',
    };
  }

  return UNKNOWN_MOVE_IN;
}

export function formatMoveInRange(from?: string | null, to?: string | null) {
  if (from && to) return `${formatMoveInDate(from)}~${formatMoveInDate(to)}`;
  if (from) return `${formatMoveInDate(from)}~`;
  if (to) return `~${formatMoveInDate(to)}`;
  return '협의';
}

export function getTenantPhoneLine(tenant: TenantPhoneLineInput) {
  const phone = tenant.contact?.phone;
  if (!phone) return null;

  return tenant.contractEnd
    ? `${phone} · 만기 ${formatDateShort(tenant.contractEnd)}`
    : phone;
}

/**
 * 입주 가능 날짜는 해를 적지 않는다: "03.01". 입주일은 늘 가까운 앞날이라 해가 달라도 헷갈리지 않고,
 * 해를 붙이면 칸이 그만큼 넓어야 한다(사용자 결정 2026-11-27). 임대차 만기처럼 지난 해·먼 해가 섞이는
 * 날짜는 아래 formatDateShort가 해를 붙인다.
 */
function formatMoveInDate(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateShort(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  // "03.01" · 다른 해는 "2027.03.01" (화면 표기 기준 — 예전 "3. 1."은 해가 빠져 내년 날짜와 섞였다)
  const md = `${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
  return date.getFullYear() === new Date().getFullYear() ? md : `${date.getFullYear()}.${md}`;
}

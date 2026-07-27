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
  | 'privateMemo'
  | 'moveInAvailableType'
  | 'moveInAvailableFrom'
  | 'moveInAvailableTo'
  | 'isPaused'
  | 'intake'
  | 'deals'
  | 'memo'
  | 'createdAt'
  | 'updatedAt'
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

/** 그룹의 매물들이 참조하는 의뢰 중 대표 의뢰 1건 선택 (진행중 우선 → 최근 접수순). */
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

export function getMoveInAvailability(listing: MoveInAvailabilityInput) {
  const type = listing.moveInAvailableType ?? 'unknown';
  const from = listing.moveInAvailableFrom;
  const to = listing.moveInAvailableTo;

  if (type === 'immediate') {
    return {
      label: '즉시',
      detail: null,
      className: 'bg-[#eef3ed] text-[#44745a]',
    };
  }

  if (type === 'date') {
    return {
      label: from ? `${formatDateShort(from)} 이후` : '확인 필요',
      detail: null,
      className: from ? 'bg-[#e7f3f8] text-[#337ea9]' : 'bg-[#f1f1ef] text-[#787774]',
    };
  }

  if (type === 'range') {
    return {
      label: formatMoveInRange(from, to),
      detail: null,
      className: 'bg-[#fbf3db] text-[#8f6b1f]',
    };
  }

  if (type === 'negotiable') {
    return {
      label: '협의',
      detail: null,
      className: 'bg-[#fbf3db] text-[#8f6b1f]',
    };
  }

  return {
    label: '확인 필요',
    detail: null,
    className: 'bg-[#f1f1ef] text-[#787774]',
  };
}

export function formatMoveInRange(from?: string | null, to?: string | null) {
  if (from && to) return `${formatDateShort(from)}~${formatDateShort(to)}`;
  if (from) return `${formatDateShort(from)}~`;
  if (to) return `~${formatDateShort(to)}`;
  return '협의';
}

export function getTenantPhoneLine(tenant: TenantPhoneLineInput) {
  const phone = tenant.contact?.phone;
  if (!phone) return null;

  return tenant.contractEnd
    ? `${phone} · 만기 ${formatDateShort(tenant.contractEnd)}`
    : phone;
}

function formatDateShort(value?: string | null) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

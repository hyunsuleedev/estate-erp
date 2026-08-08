import {
  DONE_DEAL_STAGES,
  IN_CONTRACT_DEAL_STAGES,
  IntakeCheckResult,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  ListingAvailability,
} from '@estate-erp/shared';

interface OccupyingDealLike {
  stage: string;
}

export interface IntakeConfirmationSource {
  lifecycleStatus: string;
  lastVerifiedAt?: string | null;
  lastCheckResult?: string | null;
  nextConfirmAt?: string | null;
}

export interface ListingAvailabilitySource {
  isPaused?: boolean;
  deals?: OccupyingDealLike[] | null;
  intake?: { lifecycleStatus: string } | null;
}

export type ListingStatusChangePlan<T extends ListingAvailabilitySource> =
  | { kind: 'startDeal'; candidates: T[] }
  | { kind: 'closeWithActiveDeals'; activeDealCount: number }
  | {
      kind: 'reviewResume';
      canResume: boolean;
      completedListingCount: number;
      resumableListingCount: number;
    }
  | { kind: 'lifecycle'; lifecycleStatus: IntakeLifecycleStatus }
  | {
      kind: 'blocked';
      reason:
        | 'allHaveActiveDeals'
        | 'completedDeal'
        | 'closedIntake'
        | 'noCandidates'
        | 'activeDeal';
    }
  | { kind: 'noop' };

const DONE_STAGES: readonly string[] = DONE_DEAL_STAGES;
const IN_CONTRACT_STAGES: readonly string[] = IN_CONTRACT_DEAL_STAGES;

/** 확인 이력의 최신 결과와 재확인 기한으로 확인 상태를 계산한다. */
export function getIntakeConfirmationState(
  intake: IntakeConfirmationSource,
  now = new Date(),
): IntakeConfirmationState {
  if (intake.lastCheckResult === IntakeCheckResult.NO_ANSWER) {
    return IntakeConfirmationState.NO_ANSWER;
  }
  if (!intake.lastVerifiedAt) {
    return IntakeConfirmationState.UNVERIFIED;
  }
  if (
    intake.lifecycleStatus !== IntakeLifecycleStatus.CLOSED &&
    intake.nextConfirmAt
  ) {
    const nextConfirmTime = new Date(intake.nextConfirmAt).getTime();
    if (Number.isFinite(nextConfirmTime) && nextConfirmTime < now.getTime()) {
      return IntakeConfirmationState.OVERDUE;
    }
  }
  return IntakeConfirmationState.VERIFIED;
}

/**
 * 저장 컬럼 없이 Deal·의뢰·옵션 중지 상태에서 매물 가용 상태를 계산한다.
 * 우선순위: 종결 Deal > 진행 Deal > 의뢰 종료 > 보류/일시중지 > 가용.
 */
export function getListingAvailability(
  listing: ListingAvailabilitySource,
): ListingAvailability {
  const deals = listing.deals ?? [];
  if (deals.some((deal) => DONE_STAGES.includes(deal.stage))) {
    return ListingAvailability.CLOSED;
  }
  if (deals.some((deal) => IN_CONTRACT_STAGES.includes(deal.stage))) {
    return ListingAvailability.IN_CONTRACT;
  }
  if (listing.intake?.lifecycleStatus === IntakeLifecycleStatus.CLOSED) {
    return ListingAvailability.CLOSED;
  }
  if (
    listing.isPaused ||
    listing.intake?.lifecycleStatus === IntakeLifecycleStatus.HOLD
  ) {
    return ListingAvailability.PAUSED;
  }
  return ListingAvailability.AVAILABLE;
}

/**
 * 한 intake 안에서 활성 Deal이 점유한 listing의 위치를 반환한다.
 * 도메인 규칙상 intake당 활성 Deal은 최대 하나다.
 */
export function getActiveDealListingIndex(
  listings: ListingAvailabilitySource[],
): number {
  return listings.findIndex((listing) =>
    (listing.deals ?? []).some((deal) =>
      IN_CONTRACT_STAGES.includes(deal.stage),
    ),
  );
}

/**
 * 한 의뢰의 여러 거래유형을 한 행에 표시할 때 사용할 대표 매물 상태.
 */
export function getListingRowAvailability(
  intake: { lifecycleStatus: string },
  listings: ListingAvailabilitySource[],
): ListingAvailability {
  const availabilities = listings.map(getListingAvailability);

  if (
    availabilities.some(
      (availability) => availability === ListingAvailability.IN_CONTRACT,
    )
  ) {
    return ListingAvailability.IN_CONTRACT;
  }

  if (
    availabilities.length > 0 &&
    availabilities.every(
      (availability) => availability === ListingAvailability.CLOSED,
    )
  ) {
    return ListingAvailability.CLOSED;
  }

  if (intake.lifecycleStatus === IntakeLifecycleStatus.CLOSED) {
    return ListingAvailability.CLOSED;
  }

  if (intake.lifecycleStatus === IntakeLifecycleStatus.HOLD) {
    return ListingAvailability.PAUSED;
  }

  const nonClosedAvailabilities = availabilities.filter(
    (availability) => availability !== ListingAvailability.CLOSED,
  );
  if (
    nonClosedAvailabilities.length > 0 &&
    nonClosedAvailabilities.every(
      (availability) => availability === ListingAvailability.PAUSED,
    )
  ) {
    return ListingAvailability.PAUSED;
  }

  return ListingAvailability.AVAILABLE;
}

/**
 * 사용자가 선택한 매물 상태를 실제 소유 축의 명령으로 변환한다.
 * 거래중은 Deal 생성, 나머지는 의뢰 생명주기 전환으로 처리한다.
 */
export function planListingStatusChange<
  T extends ListingAvailabilitySource,
>(
  currentValue: ListingAvailability,
  targetValue: ListingAvailability,
  listings: T[],
): ListingStatusChangePlan<T> {
  if (
    currentValue === ListingAvailability.CLOSED &&
    (targetValue === ListingAvailability.AVAILABLE ||
      targetValue === ListingAvailability.PAUSED)
  ) {
    const completedListingCount = listings.filter((listing) =>
      (listing.deals ?? []).some((deal) => DONE_STAGES.includes(deal.stage)),
    ).length;
    const resumableListingCount = listings.filter(
      (listing) =>
        !(listing.deals ?? []).some((deal) =>
          DONE_STAGES.includes(deal.stage),
        ) &&
        listing.intake?.lifecycleStatus === IntakeLifecycleStatus.CLOSED,
    ).length;

    return {
      kind: 'reviewResume',
      canResume: resumableListingCount > 0,
      completedListingCount,
      resumableListingCount,
    };
  }

  if (targetValue === ListingAvailability.IN_CONTRACT) {
    const candidates = listings.filter((listing) => {
      const availability = getListingAvailability(listing);
      return (
        availability !== ListingAvailability.IN_CONTRACT &&
        availability !== ListingAvailability.CLOSED
      );
    });

    if (candidates.length > 0) {
      return { kind: 'startDeal', candidates };
    }

    if (
      listings.some((listing) =>
        (listing.deals ?? []).some((deal) =>
          DONE_STAGES.includes(deal.stage),
        ),
      )
    ) {
      return { kind: 'blocked', reason: 'completedDeal' };
    }

    if (
      listings.length > 0 &&
      listings.every(
        (listing) =>
          getListingAvailability(listing) ===
          ListingAvailability.IN_CONTRACT,
      )
    ) {
      return { kind: 'blocked', reason: 'allHaveActiveDeals' };
    }

    if (
      listings.some(
        (listing) =>
          listing.intake?.lifecycleStatus === IntakeLifecycleStatus.CLOSED,
      )
    ) {
      return { kind: 'blocked', reason: 'closedIntake' };
    }

    return { kind: 'blocked', reason: 'noCandidates' };
  }

  if (targetValue === currentValue) {
    return { kind: 'noop' };
  }

  if (currentValue === ListingAvailability.IN_CONTRACT) {
    if (targetValue === ListingAvailability.CLOSED) {
      const activeDealCount = listings.reduce(
        (count, listing) =>
          count +
          (listing.deals ?? []).filter((deal) =>
            IN_CONTRACT_STAGES.includes(deal.stage),
          ).length,
        0,
      );

      return { kind: 'closeWithActiveDeals', activeDealCount };
    }

    return { kind: 'blocked', reason: 'activeDeal' };
  }

  return {
    kind: 'lifecycle',
    lifecycleStatus:
      targetValue === ListingAvailability.AVAILABLE
        ? IntakeLifecycleStatus.OPEN
        : targetValue === ListingAvailability.PAUSED
          ? IntakeLifecycleStatus.HOLD
          : IntakeLifecycleStatus.CLOSED,
  };
}

import {
  DONE_DEAL_STAGES,
  IN_CONTRACT_DEAL_STAGES,
  IntakeCheckResult,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  ListingAvailability,
  OCCUPYING_DEAL_STAGES,
} from "@estate-erp/shared";

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
  intake?: Pick<IntakeConfirmationSource, "lifecycleStatus"> | null;
}

export type ListingStatusChangePlan<T extends ListingAvailabilitySource> =
  | { kind: "startDeal"; candidates: T[] }
  | { kind: "closeWithActiveDeals"; activeDealCount: number }
  | {
      kind: "reviewResume";
      canResume: boolean;
      completedListingCount: number;
      resumableListingCount: number;
    }
  | { kind: "lifecycle"; lifecycleStatus: IntakeLifecycleStatus }
  | {
      kind: "blocked";
      reason:
        | "allHaveActiveDeals"
        | "completedDeal"
        | "closedIntake"
        | "noCandidates"
        | "activeDeal";
    }
  | { kind: "noop" };

const DONE_STAGES: readonly string[] = DONE_DEAL_STAGES;
const IN_CONTRACT_STAGES: readonly string[] = IN_CONTRACT_DEAL_STAGES;
const OCCUPYING_STAGES: readonly string[] = OCCUPYING_DEAL_STAGES;

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
 * Listing 가용 상태를 저장하지 않고 소유 축에서 합성한다.
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
 * 여러 Listing을 한 행에 표시할 때의 대표 상태.
 * 진행 Deal이 하나라도 있으면 거래중, 남은 거래 가능 옵션이 하나도 없으면
 * 종료/보류, 그 외에는 가용으로 표시한다.
 */
export function getListingRowAvailability(
  intake: Pick<IntakeConfirmationSource, "lifecycleStatus">,
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

/** 이 거래 옵션이 비취소 Deal에 점유돼 있는지 */
export function isListingOccupied(listing: ListingAvailabilitySource): boolean {
  return (listing.deals ?? []).some((deal) =>
    OCCUPYING_STAGES.includes(deal.stage),
  );
}

/**
 * 행의 파생 상태와 사용자가 고른 상태로 다음 동작을 결정한다.
 * 거래중은 저장값이 아니라 Deal에서 파생되므로, 현재 행이 이미 거래중이어도
 * 아직 Deal이 없는 다른 Listing이 있으면 생성 흐름을 열어야 한다.
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
    targetValue === ListingAvailability.AVAILABLE
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
      kind: "reviewResume",
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
      return { kind: "startDeal", candidates };
    }

    if (
      listings.some((listing) =>
        (listing.deals ?? []).some((deal) =>
          DONE_STAGES.includes(deal.stage),
        ),
      )
    ) {
      return { kind: "blocked", reason: "completedDeal" };
    }

    if (
      listings.length > 0 &&
      listings.every(
        (listing) =>
          getListingAvailability(listing) ===
          ListingAvailability.IN_CONTRACT,
      )
    ) {
      return { kind: "blocked", reason: "allHaveActiveDeals" };
    }

    if (
      listings.some(
        (listing) =>
          listing.intake?.lifecycleStatus === IntakeLifecycleStatus.CLOSED,
      )
    ) {
      return { kind: "blocked", reason: "closedIntake" };
    }

    return {
      kind: "blocked",
      reason: "noCandidates",
    };
  }

  if (targetValue === currentValue) {
    return { kind: "noop" };
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

      return { kind: "closeWithActiveDeals", activeDealCount };
    }

    return { kind: "blocked", reason: "activeDeal" };
  }

  return {
    kind: "lifecycle",
    lifecycleStatus:
      targetValue === ListingAvailability.AVAILABLE
        ? IntakeLifecycleStatus.OPEN
        : targetValue === ListingAvailability.PAUSED
          ? IntakeLifecycleStatus.HOLD
          : IntakeLifecycleStatus.CLOSED,
  };
}

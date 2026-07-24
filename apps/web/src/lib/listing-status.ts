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

interface ListingAvailabilitySource {
  isPaused?: boolean;
  deals?: OccupyingDealLike[] | null;
  intake?: Pick<IntakeConfirmationSource, "lifecycleStatus"> | null;
}

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
 * 우선순위: 완료 Deal > 진행 Deal > 의뢰 종결 > 보류/일시중지 > 가용.
 */
export function getListingAvailability(
  listing: ListingAvailabilitySource,
): ListingAvailability {
  const deals = listing.deals ?? [];
  if (deals.some((deal) => DONE_STAGES.includes(deal.stage))) {
    return ListingAvailability.COMPLETED;
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

/** 이 거래 옵션이 비취소 Deal에 점유돼 있는지 */
export function isListingOccupied(listing: ListingAvailabilitySource): boolean {
  return (listing.deals ?? []).some((deal) =>
    OCCUPYING_STAGES.includes(deal.stage),
  );
}

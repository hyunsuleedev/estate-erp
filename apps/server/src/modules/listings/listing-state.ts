import {
  DONE_DEAL_STAGES,
  IN_CONTRACT_DEAL_STAGES,
  IntakeCheckResult,
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  ListingAvailability,
  NON_CLOSED_INTAKE_LIFECYCLE_STATUSES,
  OCCUPYING_DEAL_STAGES,
} from '@estate-erp/shared';
import { Prisma } from '@prisma/client';

/** 기본 목록에 포함되는 닫히지 않은 의뢰 조건 */
export const NON_CLOSED_INTAKE_WHERE = {
  lifecycleStatus: {
    in: [...NON_CLOSED_INTAKE_LIFECYCLE_STATUSES],
  },
} satisfies Prisma.ListingIntakeWhereInput;

/** 화면에서 의뢰 생명주기와 확인 상태를 파생하는 데 필요한 최소 필드 */
export const LISTING_INTAKE_STATE_SELECT = {
  lifecycleStatus: true,
  lifecycleChangedAt: true,
  lifecycleChangedBy: true,
  closedReason: true,
  lastCheckedAt: true,
  lastVerifiedAt: true,
  lastCheckResult: true,
  nextConfirmAt: true,
} satisfies Prisma.ListingIntakeSelect;

/** Listing 응답에서 파생 상태 계산에 필요한 최소 Deal select */
export const OCCUPYING_DEALS_SELECT = {
  where: {
    isCancelled: false,
    stage: { in: [...OCCUPYING_DEAL_STAGES] },
  },
  select: {
    id: true,
    stage: true,
    stageChangedAt: true,
  },
} satisfies Prisma.Listing$dealsArgs;

/** 확인 이력에서 계산되는 상태를 DB 조회 조건으로 변환한다. */
export function buildIntakeConfirmationWhere(
  confirmationState: string,
  now: Date,
): Prisma.ListingIntakeWhereInput {
  if (confirmationState === IntakeConfirmationState.UNVERIFIED) {
    return {
      lastVerifiedAt: null,
      OR: [
        { lastCheckResult: null },
        { lastCheckResult: { not: IntakeCheckResult.NO_ANSWER } },
      ],
    };
  }
  if (confirmationState === IntakeConfirmationState.NO_ANSWER) {
    return { lastCheckResult: IntakeCheckResult.NO_ANSWER };
  }
  if (confirmationState === IntakeConfirmationState.OVERDUE) {
    return {
      lifecycleStatus: { not: IntakeLifecycleStatus.CLOSED },
      lastVerifiedAt: { not: null },
      OR: [
        { lastCheckResult: null },
        { lastCheckResult: { not: IntakeCheckResult.NO_ANSWER } },
      ],
      nextConfirmAt: { lt: now },
    };
  }
  return {
    lastVerifiedAt: { not: null },
    AND: [
      {
        OR: [
          { lastCheckResult: null },
          { lastCheckResult: { not: IntakeCheckResult.NO_ANSWER } },
        ],
      },
      {
        OR: [{ nextConfirmAt: null }, { nextConfirmAt: { gte: now } }],
      },
    ],
  };
}

/** 화면의 Listing 가용 상태와 동일한 우선순위로 필터 조건을 만든다. */
export function buildListingAvailabilityWhere(
  availability: string,
): Prisma.ListingWhereInput {
  const noOccupyingDeal: Prisma.ListingWhereInput = {
    deals: {
      none: {
        isCancelled: false,
        stage: { in: [...OCCUPYING_DEAL_STAGES] },
      },
    },
  };

  if (availability === ListingAvailability.COMPLETED) {
    return {
      deals: {
        some: {
          isCancelled: false,
          stage: { in: [...DONE_DEAL_STAGES] },
        },
      },
    };
  }
  if (availability === ListingAvailability.IN_CONTRACT) {
    return {
      AND: [
        {
          deals: {
            some: {
              isCancelled: false,
              stage: { in: [...IN_CONTRACT_DEAL_STAGES] },
            },
          },
        },
        {
          deals: {
            none: {
              isCancelled: false,
              stage: { in: [...DONE_DEAL_STAGES] },
            },
          },
        },
      ],
    };
  }
  if (availability === ListingAvailability.CLOSED) {
    return {
      intake: { lifecycleStatus: IntakeLifecycleStatus.CLOSED },
      ...noOccupyingDeal,
    };
  }
  if (availability === ListingAvailability.PAUSED) {
    return {
      AND: [
        noOccupyingDeal,
        {
          intake: {
            lifecycleStatus: {
              in: [...NON_CLOSED_INTAKE_LIFECYCLE_STATUSES],
            },
          },
        },
        {
          OR: [
            { isPaused: true },
            {
              intake: {
                lifecycleStatus: IntakeLifecycleStatus.HOLD,
              },
            },
          ],
        },
      ],
    };
  }
  return {
    isPaused: false,
    intake: { lifecycleStatus: IntakeLifecycleStatus.OPEN },
    ...noOccupyingDeal,
  };
}

/** 대시보드·네트워크에서 공유하는 실제 가용 매물 조건 */
export const MARKETABLE_LISTING_WHERE = {
  isHidden: false,
  isPaused: false,
  intake: { lifecycleStatus: IntakeLifecycleStatus.OPEN },
  deals: {
    none: {
      isCancelled: false,
      stage: { in: [...OCCUPYING_DEAL_STAGES] },
    },
  },
} satisfies Prisma.ListingWhereInput;

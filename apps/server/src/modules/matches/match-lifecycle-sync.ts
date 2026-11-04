import type { Prisma } from '@prisma/client';
import { MatchClosedReason, MatchStage } from '@estate-erp/shared';

/**
 * 거래·의뢰 상태에 맞춰 매칭을 자동으로 종료하거나 되살린다. 모두 호출부 트랜잭션 안에서 실행한다.
 *
 * 규칙
 * - 본계약 이후: 같은 거래 조건(Listing)의 다른 진행 중 매칭 종료 (other_buyer_contracted)
 * - 의뢰 종료: 그 의뢰 거래 조건들의 진행 중 매칭 종료 (intake_closed)
 * - 거래 취소: 거래를 만든 매칭은 종료 (deal_cancelled),
 *   그 거래가 자동 종료한 매칭은 종료 직전 단계로 되살린다.
 *   사용자가 직접 종료한 매칭, 다른 거래가 종료한 매칭, 구매 조건이 끝난 손님 매칭은 그대로 둔다.
 */

/** 진행 중으로 보지 않는 단계: 종료, 거래 전환(성사) */
const SETTLED_MATCH_STAGES = [MatchStage.CLOSED, MatchStage.DEAL_CREATED];

type Tx = Prisma.TransactionClient;

async function closeMatches(
  tx: Tx,
  where: Prisma.MatchWhereInput,
  reason: MatchClosedReason,
  dealId: string | null,
) {
  const targets = await tx.match.findMany({
    where,
    select: { id: true, stage: true },
  });
  // 종료 직전 단계(closedFromStage)가 매칭마다 달라 한 건씩 바꾼다 (감사 로그도 건별로 남는다).
  for (const target of targets) {
    await tx.match.update({
      where: { id: target.id },
      data: {
        stage: MatchStage.CLOSED,
        closedFromStage: target.stage,
        closedReason: reason,
        closedByDealId: dealId,
      },
    });
  }
  return targets.length;
}

/** 본계약 이후: 같은 거래 조건의 다른 진행 중 매칭을 종료한다. */
export function closeCompetingMatchesForDeal(
  tx: Tx,
  deal: { id: string; officeId: string; listingId: string; matchId: string | null },
) {
  return closeMatches(
    tx,
    {
      officeId: deal.officeId,
      listingId: deal.listingId,
      stage: { notIn: SETTLED_MATCH_STAGES },
      ...(deal.matchId ? { id: { not: deal.matchId } } : {}),
    },
    MatchClosedReason.OTHER_BUYER_CONTRACTED,
    deal.id,
  );
}

/**
 * 의뢰 종료: 그 의뢰 거래 조건들의 진행 중 매칭을 종료한다.
 * 거래 완료로 닫힌 경우 dealId를 남겨, 거래가 되돌려져 의뢰가 다시 열리면 되살린다.
 * includeConverted: 거래 전환 매칭까지 닫는다 (진행 거래를 취소하며 의뢰를 닫을 때).
 */
export function closeOpenMatchesForIntake(
  tx: Tx,
  input: {
    officeId: string;
    intakeId: string;
    dealId?: string | null;
    includeConverted?: boolean;
  },
) {
  return closeMatches(
    tx,
    {
      officeId: input.officeId,
      listing: { intakeId: input.intakeId },
      stage: {
        notIn: input.includeConverted ? [MatchStage.CLOSED] : SETTLED_MATCH_STAGES,
      },
    },
    MatchClosedReason.INTAKE_CLOSED,
    input.dealId ?? null,
  );
}

/**
 * 거래가 자동 종료해서 되살릴 수 있는 매칭 id.
 * 그 사이 사용자가 다시 열었거나 직접 종료로 바꾼 매칭(종료 이유·거래가 바뀜),
 * 구매 조건이 active가 아닌 손님의 매칭은 빠진다.
 */
export async function findRestorableMatchIds(
  tx: Tx,
  input: {
    officeId: string;
    dealId: string;
    reasons: MatchClosedReason[];
    /** 거래가 아직 본계약 이후라 닫혀 있어야 하는 거래 조건 (그 매칭은 되살리지 않는다) */
    excludeListingId?: string | null;
  },
) {
  if (input.reasons.length === 0) return [];
  const targets = await tx.match.findMany({
    where: {
      officeId: input.officeId,
      closedByDealId: input.dealId,
      stage: MatchStage.CLOSED,
      closedReason: { in: input.reasons },
      buyerRequirement: { status: 'active' },
      ...(input.excludeListingId ? { listingId: { not: input.excludeListingId } } : {}),
    },
    select: { id: true },
  });
  return targets.map((target) => target.id);
}

/** 자동 종료됐던 매칭을 종료 직전 단계로 되살린다 (아직 자동 종료 상태인 것만). */
export async function restoreAutoClosedMatches(
  tx: Tx,
  input: { officeId: string; matchIds: string[] },
) {
  if (input.matchIds.length === 0) return 0;
  const targets = await tx.match.findMany({
    where: {
      officeId: input.officeId,
      id: { in: input.matchIds },
      stage: MatchStage.CLOSED,
      closedReason: {
        in: [MatchClosedReason.OTHER_BUYER_CONTRACTED, MatchClosedReason.INTAKE_CLOSED],
      },
    },
    select: { id: true, closedFromStage: true },
  });
  for (const target of targets) {
    const restoredStage =
      target.closedFromStage &&
      !SETTLED_MATCH_STAGES.includes(target.closedFromStage as (typeof SETTLED_MATCH_STAGES)[number])
        ? target.closedFromStage
        : MatchStage.SUGGESTED;
    await tx.match.update({
      where: { id: target.id },
      data: {
        stage: restoredStage,
        closedFromStage: null,
        closedReason: null,
        closedByDealId: null,
      },
    });
  }
  return targets.length;
}

/** 거래가 자동 종료한 매칭(지정한 이유)을 되살린다. */
export async function restoreMatchesClosedByDeal(
  tx: Tx,
  input: {
    officeId: string;
    dealId: string;
    reasons: MatchClosedReason[];
    excludeListingId?: string | null;
  },
) {
  const matchIds = await findRestorableMatchIds(tx, input);
  return restoreAutoClosedMatches(tx, { officeId: input.officeId, matchIds });
}

/** 거래를 만든 매칭이 아직 거래 전환 상태면 종료한다 (거래 취소). */
export function closeSourceMatchForCancelledDeal(
  tx: Tx,
  input: { officeId: string; dealId: string; matchId: string | null },
) {
  if (!input.matchId) return Promise.resolve(0);
  return closeMatches(
    tx,
    { id: input.matchId, officeId: input.officeId, stage: MatchStage.DEAL_CREATED },
    MatchClosedReason.DEAL_CANCELLED,
    input.dealId,
  );
}

/**
 * 거래 취소(또는 삭제) 시 매칭 정리.
 * - 거래를 만든 매칭이 아직 거래 전환 상태면 종료 (deal_cancelled)
 * - 의뢰가 열려 있으면(취소로 다시 열린 경우 포함) 이 거래가 자동 종료한 매칭을 되살린다.
 *   의뢰가 닫힌 채라면 매물이 끝났으므로 되살리지 않는다.
 */
export async function settleMatchesForCancelledDeal(
  tx: Tx,
  input: {
    officeId: string;
    dealId: string;
    matchId: string | null;
    /** 취소 처리 후 의뢰가 닫혀 있지 않은지 */
    intakeOpen: boolean;
  },
) {
  await closeSourceMatchForCancelledDeal(tx, input);
  if (!input.intakeOpen) return;
  await restoreMatchesClosedByDeal(tx, {
    officeId: input.officeId,
    dealId: input.dealId,
    reasons: [MatchClosedReason.OTHER_BUYER_CONTRACTED, MatchClosedReason.INTAKE_CLOSED],
  });
}

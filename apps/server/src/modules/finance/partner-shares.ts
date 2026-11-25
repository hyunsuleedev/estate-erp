import { formatPlaceLabel } from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { CalcReceipt, SettlementDetailItem } from './settlement-calc';

/**
 * 공동중개 상대가 수금한 청구에서 우리가 받은 몫('받음 기록')을 직원 정산에 입금 한 줄로 넣는다
 * (사용자 결정 2026-11-22: "사무소가 받은 금액을 선택한 직원의 정산 비율로 나눈다").
 * 담당 배정·배분율·3.3%·기본급·잔금 전 대기·확정한 달 넘기기는 우리가 수금한 입금과 같은 규칙을 탄다.
 *
 * 금액: 받음 기록에는 shareAmount(만원)만 있고 부가세 정보가 없다. 부가세 별도 금액(수수료 몫)으로 보고
 * 그대로 원으로 바꾼다 — 정산이 나누는 기준(부가세 뺀 원)과 같다. 화면에는 "부가세 별도"로 적는다.
 * 우리 몫만 담긴 금액이라 공동중개 비율(ourRatio)을 다시 곱하지 않는다(100).
 *
 * 분배 줄에는 정산에 들어갔다는 칸이 없어(DB를 바꾸지 않았다), 확정 정산에 굳혀 둔 계산 근거(detail)의
 * 줄 이름으로 알아본다: 받은 몫 "share:<분배 id>:<받은 날 ms>", 되돌림 "share-undo:<분배 id>:<받은 날 ms>:<n>".
 *  - 확정에 들어간 횟수 − 되돌림이 확정에 들어간 횟수 > 0 이면 이미 정산한 몫이다.
 *  - 받음 기록을 되돌렸는데(또는 받은 날을 바꿨는데) 이미 정산한 몫이 있으면, 돌려준 돈과 같은 규칙으로
 *    그때 나눠 준 비율대로 다음 정산에서 뺀다.
 */

export const SHARE_PREFIX = 'share:';
export const SHARE_UNDO_PREFIX = 'share-undo:';
export const isPartnerShareRowId = (id: string) => id.startsWith('share');

const WON_PER_MANWON = 10_000;

export const shareRowId = (distributionId: string, settledAt: Date) =>
  `${SHARE_PREFIX}${distributionId}:${settledAt.getTime()}`;

export interface ShareDistributionRow {
  id: string;
  dealId: string;
  dealTitle: string;
  status: string;
  settledAt: Date | null;
  /** 받음 기록을 되돌린 때로 쓴다 (분배 줄의 마지막 변경 시각) */
  updatedAt: Date;
  /** 만원, 부가세 별도로 본다 */
  shareAmount: number;
  deal: { stage: string; stageChangedAt: Date; isCancelled: boolean; cancelledAt: Date | null };
}

/** 확정 정산의 계산 근거 한 줄 (받은 몫·되돌림 줄만 쓴다) */
export interface ConfirmedDetail {
  settlementId: string;
  month: string;
  userId: string;
  item: SettlementDetailItem;
}

export type ShareCalcRow = CalcReceipt & {
  /** 취소한 거래의 받은 몫을 어느 달에 보일지 정하는 시각 (받은 날과 취소한 날 가운데 늦은 날) */
  eventAt: Date;
};

/**
 * 정산 계산에 넣을 받은 몫·되돌림 줄을 만든다. DB를 모르는 순수 함수다(spec 대상).
 * @param monthEnd 이 달의 끝(다음 달 1일 0시, 한국 시각). 이 시각 전에 받거나 되돌린 것만 본다.
 */
export function partnerShareCalcRows(
  distributions: ShareDistributionRow[],
  confirmed: ConfirmedDetail[],
  monthEnd: Date,
): ShareCalcRow[] {
  const rows: ShareCalcRow[] = [];
  for (const d of distributions) {
    const mine = confirmed.filter((c) => c.item.receiptId.startsWith(`${SHARE_PREFIX}${d.id}:`) || c.item.receiptId.startsWith(`${SHARE_UNDO_PREFIX}${d.id}:`));
    const current = d.status === 'settled' && d.settledAt ? shareRowId(d.id, d.settledAt) : null;
    const keys = new Set(
      mine.filter((c) => c.item.receiptId.startsWith(SHARE_PREFIX)).map((c) => c.item.receiptId),
    );
    if (current) keys.add(current);

    const done = !d.deal.isCancelled && ['completed', 'closed'].includes(d.deal.stage);
    const base = {
      dealId: d.dealId,
      dealTitle: d.dealTitle,
      ourRatio: 100,
      balanceDone: done,
      balanceDoneAt: done && d.deal.stage === 'completed' ? d.deal.stageChangedAt : null,
      dealCancelled: d.deal.isCancelled,
      source: 'partner_share' as const,
    };

    for (const key of keys) {
      const ms = key.slice(SHARE_PREFIX.length + d.id.length + 1);
      const undoPrefix = `${SHARE_UNDO_PREFIX}${d.id}:${ms}:`;
      const inclusions = new Set(mine.filter((c) => c.item.receiptId === key).map((c) => c.settlementId));
      const undos = new Set(mine.filter((c) => c.item.receiptId.startsWith(undoPrefix)).map((c) => c.settlementId));
      const net = inclusions.size - undos.size;

      if (key === current && net <= 0) {
        // 아직 정산하지 않은 받은 몫
        const settledAt = d.settledAt as Date;
        if (settledAt.getTime() >= monthEnd.getTime()) continue;
        const won = d.shareAmount * WON_PER_MANWON;
        const cancelledAt = d.deal.cancelledAt;
        rows.push({
          ...base,
          id: key,
          paymentId: `share-pay:${key}`,
          kind: 'receipt',
          receivedAt: settledAt,
          amountWon: won,
          supplyWon: won,
          eventAt: cancelledAt && cancelledAt > settledAt ? cancelledAt : settledAt,
        });
      } else if (key !== current && net > 0) {
        // 정산한 뒤 받음 기록을 되돌림 → 그때 나눠 준 비율대로 다음 정산에서 뺀다
        if (d.updatedAt.getTime() >= monthEnd.getTime()) continue;
        const latest = [...inclusions].pop() as string;
        const items = mine.filter((c) => c.settlementId === latest && c.item.receiptId === key);
        const supply = items[0]?.item.supplyWon ?? 0;
        if (supply <= 0) continue;
        const byUser = new Map<string, number>();
        for (const c of items) byUser.set(c.userId, (byUser.get(c.userId) ?? 0) + c.item.shareWon);
        const id = `${undoPrefix}${undos.size + 1}`;
        rows.push({
          ...base,
          id,
          paymentId: `share-pay:${id}`,
          kind: 'refund',
          receivedAt: d.updatedAt,
          amountWon: -supply,
          supplyWon: -supply,
          reversal: [...byUser]
            .filter(([, shareWon]) => shareWon > 0)
            .map(([userId, shareWon]) => ({ userId, fraction: shareWon / supply })),
          eventAt: d.updatedAt,
        });
      }
    }
  }
  return rows;
}

/** 받은 몫이 될 수 있는 분배 줄(상대가 수금한 청구의 우리 몫)과 확정 정산의 받은 몫 계산 근거를 읽는다 */
export async function loadPartnerShareInputs(
  db: PrismaService | Prisma.TransactionClient,
  officeId: string,
): Promise<{ distributions: ShareDistributionRow[]; confirmed: ConfirmedDetail[] }> {
  const [rows, lines] = await Promise.all([
    db.commissionDistribution.findMany({
      where: {
        officeId,
        recipientType: 'our_office',
        payment: { collectedByOffice: { not: 'us' }, status: { not: 'draft' } },
      },
      select: {
        id: true,
        status: true,
        settledAt: true,
        updatedAt: true,
        shareAmount: true,
        payment: {
          select: {
            dealId: true,
            deal: {
              select: {
                stage: true,
                stageChangedAt: true,
                isCancelled: true,
                cancelledAt: true,
                listing: {
                  select: {
                    property: {
                      select: {
                        site: { select: { name: true } },
                        unit: {
                          select: {
                            name: true,
                            floor: true,
                            floorEnd: true,
                            floorLabel: true,
                            dong: { select: { name: true, isPlaceholder: true } },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.settlementLine.findMany({
      where: { officeId },
      select: { settlementId: true, userId: true, detail: true, settlement: { select: { month: true } } },
      orderBy: { settlement: { month: 'asc' } },
    }),
  ]);
  const distributions: ShareDistributionRow[] = rows.map((row) => {
    const property = row.payment.deal.listing?.property;
    return {
      id: row.id,
      dealId: row.payment.dealId,
      dealTitle:
        formatPlaceLabel({
          siteName: property?.site?.name,
          dongName: property?.unit?.dong?.name,
          dongIsPlaceholder: property?.unit?.dong?.isPlaceholder,
          unit: property?.unit,
        }) || '거래',
      status: row.status,
      settledAt: row.settledAt,
      updatedAt: row.updatedAt,
      shareAmount: row.shareAmount,
      deal: {
        stage: row.payment.deal.stage,
        stageChangedAt: row.payment.deal.stageChangedAt,
        isCancelled: row.payment.deal.isCancelled,
        cancelledAt: row.payment.deal.cancelledAt,
      },
    };
  });
  const confirmed: ConfirmedDetail[] = lines.flatMap((line) =>
    ((line.detail as unknown as SettlementDetailItem[]) ?? [])
      .filter((item) => isPartnerShareRowId(item.receiptId))
      .map((item) => ({ settlementId: line.settlementId, month: line.settlement.month, userId: line.userId, item })),
  );
  return { distributions, confirmed };
}

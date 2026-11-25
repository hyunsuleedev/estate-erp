import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 우리 통장에 들어온 수수료 한 건. 캐시플로우의 수금·순이익, 수금 원장의 수금 합계, 캘린더의 입금이
 * 모두 이 목록 하나로 센다 (화면마다 숫자가 갈라지지 않게).
 *
 *  - receipt / refund: 우리가 수금하는 청구(collectedByOffice='us')의 입금 기록 (부가세 뺀 금액, 돌려준 돈은 음수)
 *  - partner_share: 공동중개 상대가 수금한 청구에서 우리 몫을 받았다고 기록한 것('받음 기록').
 *    분배 줄의 정산 날짜(settledAt)와 굳힌 금액(shareAmount, 만원)을 쓴다.
 *
 * 상대가 수금한 청구의 입금 기록은 상대 통장에 들어온 돈이라 넣지 않는다 (직원 정산도 같은 기준으로 뺀다).
 * 통장 기준이라 취소한 거래의 입금도 넣는다 — 손님에게 돌려주면 '돌려준 돈' 기록으로 빠진다.
 * (취소하는 순간 지난달 수금이 바뀌면 안 된다.)
 */
export interface OurCollection {
  id: string;
  paymentId: string;
  kind: 'receipt' | 'refund' | 'partner_share';
  at: Date;
  /** 원, 부가세 뺀 금액. 돌려준 돈은 음수 */
  won: number;
  /**
   * 이 돈 가운데 공동중개 상대에게 넘겨줄 몫 (원). 우리가 수금한 청구의 상대 분배 비율만큼이다.
   * 보냈는지와 상관없이 우리 돈이 아니므로 순이익에서 뺀다. 받은 몫(partner_share)은 0.
   */
  partnerWon: number;
}

const WON_PER_MANWON = 10_000;

export async function loadOurCollections(
  db: PrismaService | Prisma.TransactionClient,
  officeId: string,
  filter: { paymentIds?: string[]; from?: Date; to?: Date },
): Promise<OurCollection[]> {
  if (filter.paymentIds && filter.paymentIds.length === 0) return [];
  const range = (field: 'receivedAt' | 'settledAt') =>
    filter.from || filter.to
      ? { [field]: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lt: filter.to } : {}) } }
      : {};
  const paymentScope = {
    status: { not: 'draft' },
  } satisfies Prisma.CommissionPaymentWhereInput;

  const [receipts, shares] = await Promise.all([
    db.commissionReceipt.findMany({
      where: {
        officeId,
        voidedAt: null,
        ...(filter.paymentIds ? { paymentId: { in: filter.paymentIds } } : {}),
        ...range('receivedAt'),
        payment: { ...paymentScope, collectedByOffice: 'us' },
      },
      select: {
        id: true,
        paymentId: true,
        kind: true,
        receivedAt: true,
        supplyWon: true,
        payment: {
          select: { distributions: { where: { recipientType: 'partner_broker' }, select: { shareRatio: true } } },
        },
      },
      orderBy: [{ receivedAt: 'asc' }, { createdAt: 'asc' }],
    }),
    db.commissionDistribution.findMany({
      where: {
        officeId,
        recipientType: 'our_office',
        status: 'settled',
        settledAt: { not: null },
        ...(filter.paymentIds ? { paymentId: { in: filter.paymentIds } } : {}),
        ...range('settledAt'),
        payment: { ...paymentScope, collectedByOffice: { not: 'us' } },
      },
      select: { id: true, paymentId: true, settledAt: true, shareAmount: true },
      orderBy: { settledAt: 'asc' },
    }),
  ]);

  return [
    ...receipts.map((r) => {
      const partnerRatio = (r.payment?.distributions ?? []).reduce((sum, d) => sum + Number(d.shareRatio), 0);
      return {
        id: r.id,
        paymentId: r.paymentId,
        kind: (r.kind === 'refund' ? 'refund' : 'receipt') as OurCollection['kind'],
        at: r.receivedAt,
        won: r.supplyWon,
        partnerWon: (r.supplyWon * partnerRatio) / 100,
      };
    }),
    ...shares.map((d) => ({
      id: d.id,
      paymentId: d.paymentId,
      kind: 'partner_share' as const,
      at: d.settledAt as Date,
      won: d.shareAmount * WON_PER_MANWON,
      partnerWon: 0,
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** 한국 시각의 달 'YYYY-MM' */
export const kstMonthOf = (date: Date) =>
  new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);

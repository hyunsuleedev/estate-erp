import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  computeSettlement,
  monthRange,
  reversalFractions,
  type CalcParticipant,
  type CalcReceipt,
  type CalcStaff,
  type EmploymentType,
  type SettlementCalcLine,
  type SettlementDetailItem,
  type SettlementTiming,
  type SettlementWaitingItem,
} from './settlement-calc';

const WON_PER_MANWON = 10_000;
const TIMINGS: SettlementTiming[] = ['closed', 'received'];

export interface SettlementLineView extends SettlementCalcLine {
  /** 확정한 정산에만 있다 */
  lineId: string | null;
  paidAt: string | null;
}

export interface SettlementView {
  month: string;
  status: 'draft' | 'confirmed';
  /** 확정한 정산이면 확정 당시의 값, 아니면 지금 설정 */
  timing: SettlementTiming;
  confirmedAt: string | null;
  lines: SettlementLineView[];
  /** 이 달 정산에 들어가지 않은 입금 (지금 설정 기준) */
  waiting: SettlementWaitingItem[];
  /** 확정할 수 없는 이유. 확정할 수 있으면 null. */
  blockedReason: string | null;
  /** 확정을 취소할 수 있는지 (가장 최근 정산이고 지급 기록이 없을 때) */
  canUnconfirm: boolean;
}

function assertMonth(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new BadRequestException('달은 2026-11 같은 형식이어야 합니다.');
  }
}

/** 한국 시각의 이번 달 'YYYY-MM' */
function currentMonth(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

function dealTitle(deal: {
  listing: {
    property: {
      site: { name: string } | null;
      unit: { name: string | null; dong: { name: string | null; isPlaceholder: boolean } | null } | null;
    } | null;
  } | null;
}): string {
  const property = deal.listing?.property;
  const dong = property?.unit?.dong;
  const parts = [
    property?.site?.name,
    dong && !dong.isPlaceholder && dong.name ? `${dong.name}동` : null,
    property?.unit?.name ? `${property.unit.name}호` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' ') : '거래';
}

@Injectable()
export class SettlementService {
  constructor(private readonly prisma: PrismaService) {}

  /* ───────── 설정 ───────── */

  async getSettings(officeId: string) {
    const office = await this.prisma.office.findUnique({
      where: { id: officeId },
      select: { settlementTiming: true },
    });
    if (!office) throw new NotFoundException();
    return { timing: office.settlementTiming as SettlementTiming };
  }

  async updateSettings(officeId: string, data: { timing?: string }) {
    if (!TIMINGS.includes(data.timing as SettlementTiming)) {
      throw new BadRequestException('정산 시점은 잔금이 끝난 뒤(closed) 또는 돈이 들어온 달(received)이어야 합니다.');
    }
    await this.prisma.office.update({
      where: { id: officeId },
      data: { settlementTiming: data.timing },
    });
    return this.getSettings(officeId);
  }

  /* ───────── 조회 ───────── */

  /** 그 달의 정산. 확정했으면 굳혀 둔 값을, 아니면 입금 기록에서 지금 계산한 값을 돌려준다. */
  async get(officeId: string, month: string): Promise<SettlementView> {
    assertMonth(month);
    const [confirmed, latest, live] = await Promise.all([
      this.prisma.settlement.findUnique({
        where: { officeId_month: { officeId, month } },
        include: { lines: { include: { user: { select: { name: true } } }, orderBy: { createdAt: 'asc' } } },
      }),
      this.prisma.settlement.findFirst({ where: { officeId }, orderBy: { month: 'desc' }, select: { month: true } }),
      this.calculate(this.prisma, officeId, month),
    ]);
    if (confirmed) {
      return {
        month,
        status: 'confirmed',
        timing: confirmed.timing as SettlementTiming,
        confirmedAt: confirmed.confirmedAt.toISOString(),
        lines: confirmed.lines.map((line) => ({
          lineId: line.id,
          paidAt: line.paidAt ? line.paidAt.toISOString() : null,
          userId: line.userId,
          name: line.user.name,
          employmentType: line.employmentType as EmploymentType,
          withholdTax: line.withholdTax,
          targetWon: line.targetWon,
          shareWon: line.shareWon,
          baseWon: line.baseWon,
          adjustWon: line.adjustWon,
          carryInWon: line.carryInWon,
          withholdingWon: line.withholdingWon,
          netWon: line.netWon,
          carryOutWon: line.carryOutWon,
          detail: line.detail as unknown as SettlementDetailItem[],
        })),
        waiting: live.result.waiting,
        blockedReason: null,
        canUnconfirm: latest?.month === month && confirmed.lines.every((line) => !line.paidAt),
      };
    }
    return {
      month,
      status: 'draft',
      timing: live.timing,
      confirmedAt: null,
      lines: live.result.lines.map((line) => ({ ...line, lineId: null, paidAt: null })),
      waiting: live.result.waiting,
      blockedReason: this.blockedReason(month, latest?.month ?? null, live.result.lines.length),
      canUnconfirm: false,
    };
  }

  /** 내 정산 내역 (확정한 달만). 직원 본인이 자기 것만 본다. */
  async listMine(officeId: string, userId: string) {
    const lines = await this.prisma.settlementLine.findMany({
      where: { officeId, userId },
      include: { settlement: { select: { month: true, confirmedAt: true } } },
      orderBy: { createdAt: 'desc' },
      take: 24,
    });
    return lines.map((line) => ({
      lineId: line.id,
      month: line.settlement.month,
      confirmedAt: line.settlement.confirmedAt.toISOString(),
      employmentType: line.employmentType as EmploymentType,
      withholdTax: line.withholdTax,
      targetWon: line.targetWon,
      shareWon: line.shareWon,
      baseWon: line.baseWon,
      adjustWon: line.adjustWon,
      carryInWon: line.carryInWon,
      withholdingWon: line.withholdingWon,
      netWon: line.netWon,
      carryOutWon: line.carryOutWon,
      detail: line.detail as unknown as SettlementDetailItem[],
      paidAt: line.paidAt ? line.paidAt.toISOString() : null,
    }));
  }

  private blockedReason(month: string, latestConfirmed: string | null, lineCount: number): string | null {
    if (month > currentMonth()) return '아직 오지 않은 달은 확정할 수 없습니다.';
    if (latestConfirmed && latestConfirmed > month) {
      return `${latestConfirmed} 정산을 이미 확정해서 그 앞의 달은 확정할 수 없습니다.`;
    }
    if (lineCount === 0) return '이 달에 정산할 내용이 없습니다.';
    return null;
  }

  /* ───────── 확정과 지급 ───────── */

  async confirm(officeId: string, month: string, userId: string | null): Promise<SettlementView> {
    assertMonth(month);
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockOfficeSettlements(tx, officeId);
        const [existing, latest] = await Promise.all([
          tx.settlement.findUnique({ where: { officeId_month: { officeId, month } }, select: { id: true } }),
          tx.settlement.findFirst({ where: { officeId }, orderBy: { month: 'desc' }, select: { month: true } }),
        ]);
        if (existing) throw new ConflictException('이미 확정한 정산입니다.');
        const { result, timing } = await this.calculate(tx, officeId, month);
        const blocked = this.blockedReason(month, latest?.month ?? null, result.lines.length);
        if (blocked) throw new ConflictException(blocked);

        const settlement = await tx.settlement.create({
          data: { officeId, month, timing, confirmedById: userId },
        });
        await tx.settlementLine.createMany({
          data: result.lines.map((line) => ({
            officeId,
            settlementId: settlement.id,
            userId: line.userId,
            employmentType: line.employmentType,
            withholdTax: line.withholdTax,
            targetWon: line.targetWon,
            shareWon: line.shareWon,
            baseWon: line.baseWon,
            adjustWon: line.adjustWon,
            carryInWon: line.carryInWon,
            withholdingWon: line.withholdingWon,
            netWon: line.netWon,
            carryOutWon: line.carryOutWon,
            detail: line.detail as unknown as Prisma.InputJsonValue,
          })),
        });
        if (result.includedReceiptIds.length > 0) {
          // 계산한 뒤 그 사이에 취소되거나 다른 정산에 들어간 입금이 있으면 전부 되돌린다.
          const { count } = await tx.commissionReceipt.updateMany({
            where: { id: { in: result.includedReceiptIds }, officeId, settlementId: null, voidedAt: null },
            data: { settlementId: settlement.id },
          });
          if (count !== result.includedReceiptIds.length) {
            throw new ConflictException('계산하는 사이에 입금 기록이 바뀌었습니다. 다시 확인해 주세요.');
          }
        }
      });
    } catch (error) {
      // 같은 달을 동시에 확정하면 (office_id, month) 유일 제약에 걸린다
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('이미 확정한 정산입니다.');
      }
      throw error;
    }
    return this.get(officeId, month);
  }

  /** 확정을 취소한다. 가장 최근 정산이고 지급 기록이 하나도 없을 때만 된다. */
  async unconfirm(officeId: string, month: string): Promise<SettlementView> {
    assertMonth(month);
    await this.prisma.$transaction(async (tx) => {
      await lockOfficeSettlements(tx, officeId);
      const found = await tx.settlement.findUnique({
        where: { officeId_month: { officeId, month } },
        select: { id: true },
      });
      if (!found) throw new NotFoundException('확정한 정산이 없습니다.');
      // 내역 줄을 잠근 뒤에 지급 기록을 본다. 확인과 삭제 사이에 지급 기록이 끼어들어 함께 지워지는 일을 막는다.
      await tx.$queryRaw`SELECT id FROM settlement_lines WHERE settlement_id = ${found.id}::uuid FOR UPDATE`;
      const settlement = await tx.settlement.findUniqueOrThrow({
        where: { id: found.id },
        include: { lines: { select: { paidAt: true } } },
      });
      const later = await tx.settlement.findFirst({ where: { officeId, month: { gt: month } }, select: { month: true } });
      if (later) throw new ConflictException(`${later.month} 정산이 확정돼 있어 취소할 수 없습니다.`);
      if (settlement.lines.some((line) => line.paidAt)) {
        throw new ConflictException('지급 기록이 있는 정산은 취소할 수 없습니다. 지급 기록을 먼저 취소해 주세요.');
      }
      await tx.commissionReceipt.updateMany({
        where: { officeId, settlementId: settlement.id },
        data: { settlementId: null },
      });
      await tx.settlement.delete({ where: { id: settlement.id } });
    });
    return this.get(officeId, month);
  }

  /** 프리랜서: 지급했다고 기록 / 근로자: 급여에 넘겼다고 기록 */
  async markPaid(officeId: string, lineId: string, userId: string | null, paidAt?: string) {
    const date = paidAt ? new Date(paidAt) : new Date();
    if (Number.isNaN(date.getTime())) throw new BadRequestException('날짜 형식이 올바르지 않습니다.');
    const line = await this.prisma.settlementLine.findFirst({
      where: { id: lineId, officeId },
      include: { settlement: { select: { month: true } } },
    });
    if (!line) throw new NotFoundException();
    if (line.netWon <= 0) throw new ConflictException('지급할 금액이 없는 내역입니다.');
    const { count } = await this.prisma.settlementLine.updateMany({
      where: { id: lineId, officeId, paidAt: null },
      data: { paidAt: date, paidById: userId },
    });
    if (count === 0) {
      // 그 사이에 정산 확정이 취소됐으면 줄이 없다
      const still = await this.prisma.settlementLine.findFirst({ where: { id: lineId, officeId }, select: { id: true } });
      if (!still) throw new ConflictException('정산 확정이 취소되어 지급을 기록할 수 없습니다.');
      throw new ConflictException('이미 지급으로 기록한 내역입니다.');
    }
    return this.get(officeId, line.settlement.month);
  }

  async unmarkPaid(officeId: string, lineId: string) {
    const line = await this.prisma.settlementLine.findFirst({
      where: { id: lineId, officeId },
      include: { settlement: { select: { month: true } } },
    });
    if (!line) throw new NotFoundException();
    const { count } = await this.prisma.settlementLine.updateMany({
      where: { id: lineId, officeId, paidAt: { not: null } },
      data: { paidAt: null, paidById: null },
    });
    if (count === 0) throw new ConflictException('지급 기록이 없는 내역입니다.');
    return this.get(officeId, line.settlement.month);
  }

  /* ───────── 거래 담당 배분 ───────── */

  async getParticipants(officeId: string, dealId: string) {
    const deal = await this.prisma.deal.findFirst({ where: { id: dealId, officeId }, select: { id: true } });
    if (!deal) throw new NotFoundException();
    const rows = await this.prisma.dealParticipant.findMany({
      where: { officeId, dealId, sharePercent: { not: null } },
      include: { user: { select: { id: true, name: true, commissionRate: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      userId: row.userId,
      name: row.user.name,
      sharePercent: row.sharePercent as number,
      ratio: row.commissionRate === null ? null : Number(row.commissionRate),
      defaultRatio: row.user.commissionRate === null ? null : Number(row.user.commissionRate),
    }));
  }

  /**
   * 이 거래를 누가 얼마나 맡았는지 정한다. 합은 100이어야 한다.
   * 이미 확정한 정산은 바뀌지 않고, 아직 정산하지 않은 입금부터 이 배분으로 계산한다.
   */
  async setParticipants(
    officeId: string,
    dealId: string,
    items: Array<{ userId: string; sharePercent: number; ratio?: number | null }>,
  ) {
    if (!Array.isArray(items) || items.length === 0) {
      throw new BadRequestException('담당자를 한 명 이상 정해 주세요.');
    }
    const userIds = items.map((item) => item.userId);
    if (new Set(userIds).size !== userIds.length) {
      throw new BadRequestException('같은 직원이 두 번 들어 있습니다.');
    }
    for (const item of items) {
      if (!Number.isInteger(item.sharePercent) || item.sharePercent < 1 || item.sharePercent > 100) {
        throw new BadRequestException('맡은 비중은 1부터 100 사이의 정수여야 합니다.');
      }
      if (
        item.ratio != null &&
        (typeof item.ratio !== 'number' || !Number.isFinite(item.ratio) || item.ratio < 0 || item.ratio > 100)
      ) {
        throw new BadRequestException('직원 몫은 0부터 100 사이여야 합니다.');
      }
    }
    if (items.reduce((sum, item) => sum + item.sharePercent, 0) !== 100) {
      throw new BadRequestException('맡은 비중의 합은 100이어야 합니다.');
    }

    await this.prisma.$transaction(async (tx) => {
      // 같은 거래의 담당을 동시에 고치면 두 요청의 줄이 섞여 합이 100을 넘을 수 있다. 거래 줄을 잠근다.
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM deals WHERE id = ${dealId}::uuid AND office_id = ${officeId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException();
      const users = await tx.user.findMany({ where: { id: { in: userIds }, officeId }, select: { id: true } });
      if (users.length !== userIds.length) {
        throw new BadRequestException('우리 사무소 직원이 아닌 사람이 들어 있습니다.');
      }
      const existing = await tx.dealParticipant.findMany({ where: { officeId, dealId }, orderBy: { createdAt: 'asc' } });
      // 한 직원이 역할별로 여러 줄을 가질 수 있다. 배분은 그 가운데 첫 줄에만 둔다.
      await tx.dealParticipant.updateMany({
        where: { officeId, dealId },
        data: { sharePercent: null, commissionRate: null },
      });
      for (const item of items) {
        const row = existing.find((candidate) => candidate.userId === item.userId);
        if (row) {
          await tx.dealParticipant.update({
            where: { id: row.id },
            data: { sharePercent: item.sharePercent, commissionRate: item.ratio ?? null },
          });
        } else {
          await tx.dealParticipant.create({
            data: {
              officeId,
              dealId,
              userId: item.userId,
              role: 'dual_agent',
              side: 'both',
              sharePercent: item.sharePercent,
              commissionRate: item.ratio ?? null,
            },
          });
        }
      }
    });
    return this.getParticipants(officeId, dealId);
  }

  /* ───────── 계산에 넣을 자료 모으기 ───────── */

  /**
   * 돌려준 돈이 있는 청구마다, 그 청구에서 이미 정산해 준 몫을 직원별 비율로 구한다
   * (직원이 받은 몫 ÷ 정산한 금액, 둘 다 순액). 확정 정산에 굳혀 둔 계산 근거에서 읽는다.
   * 정산한 적이 없는 청구는 결과에 없고, 그때는 지금의 담당 배분으로 뺀다.
   */
  private async loadReversals(
    db: Prisma.TransactionClient | PrismaService,
    officeId: string,
    paymentIds: string[],
  ) {
    if (paymentIds.length === 0) return new Map<string, Array<{ userId: string; fraction: number }>>();
    // 입금뿐 아니라 앞서 정산에 반영된 환불도 함께 읽는다. 비율은 순액으로 구해야 한다.
    const settled = await db.commissionReceipt.findMany({
      where: { officeId, paymentId: { in: paymentIds }, settlementId: { not: null } },
      select: { id: true, paymentId: true, supplyWon: true, settlementId: true },
    });
    if (settled.length === 0) return new Map<string, Array<{ userId: string; fraction: number }>>();
    const lines = await db.settlementLine.findMany({
      where: { officeId, settlementId: { in: [...new Set(settled.map((r) => r.settlementId as string))] } },
      select: { userId: true, detail: true },
    });
    return reversalFractions(
      settled,
      lines.flatMap((line) =>
        (line.detail as unknown as SettlementDetailItem[]).map((item) => ({
          userId: line.userId,
          receiptId: item.receiptId,
          shareWon: item.shareWon,
        })),
      ),
    );
  }

  private async calculate(
    db: Prisma.TransactionClient | PrismaService,
    officeId: string,
    month: string,
  ) {
    const { end } = monthRange(month);
    const office = await db.office.findUnique({
      where: { id: officeId },
      select: { settlementTiming: true, commissionConfig: true },
    });
    if (!office) throw new NotFoundException();
    const timing = (TIMINGS.includes(office.settlementTiming as SettlementTiming)
      ? office.settlementTiming
      : 'closed') as SettlementTiming;
    const config = (office.commissionConfig ?? null) as { defaultAgentRate?: unknown } | null;
    // 직원 몫을 비워 둔 직원은 사무소 기준을 쓴다. 기준이 없으면 설정 화면이 안내하는 값과 같은 50%.
    const defaultRatio = typeof config?.defaultAgentRate === 'number' ? config.defaultAgentRate : 50;

    // 아직 정산하지 않은 입금. 상대 사무소가 받은 청구는 우리 통장에 들어온 돈이 아니므로 뺀다.
    const receipts = await db.commissionReceipt.findMany({
      where: {
        officeId,
        voidedAt: null,
        settlementId: null,
        receivedAt: { lt: end },
        payment: { collectedByOffice: 'us' },
      },
      include: {
        payment: {
          select: {
            dealId: true,
            distributions: { select: { recipientType: true, shareRatio: true } },
            deal: {
              select: {
                stage: true,
                stageChangedAt: true,
                isCancelled: true,
                listing: {
                  select: {
                    property: {
                      select: {
                        site: { select: { name: true } },
                        unit: { select: { name: true, dong: { select: { name: true, isPlaceholder: true } } } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    const reversals = await this.loadReversals(
      db,
      officeId,
      receipts.filter((receipt) => receipt.kind === 'refund').map((receipt) => receipt.paymentId),
    );
    const calcReceipts: CalcReceipt[] = receipts.map((receipt) => {
      const { payment } = receipt;
      const ours = payment.distributions.filter((d) => d.recipientType === 'our_office');
      const ourRatio = payment.distributions.length === 0 ? 100 : ours.reduce((sum, d) => sum + Number(d.shareRatio), 0);
      const done = !payment.deal.isCancelled && ['completed', 'closed'].includes(payment.deal.stage);
      return {
        id: receipt.id,
        paymentId: receipt.paymentId,
        dealId: payment.dealId,
        dealTitle: dealTitle(payment.deal),
        kind: receipt.kind === 'refund' ? 'refund' : 'receipt',
        receivedAt: receipt.receivedAt,
        amountWon: receipt.amountWon,
        supplyWon: receipt.supplyWon,
        ourRatio,
        balanceDone: done,
        // 잔금 완료(completed)로 바뀐 시각만 안다. 그 뒤 종료(closed)까지 갔으면 시각을 묻지 않는다.
        balanceDoneAt: done && payment.deal.stage === 'completed' ? payment.deal.stageChangedAt : null,
        reversal: receipt.kind === 'refund' ? reversals.get(receipt.paymentId) : undefined,
      };
    });

    const dealIds = [...new Set(calcReceipts.map((receipt) => receipt.dealId))];
    const participantRows = dealIds.length
      ? await db.dealParticipant.findMany({
          where: { officeId, dealId: { in: dealIds }, sharePercent: { not: null } },
          select: { dealId: true, userId: true, sharePercent: true, commissionRate: true },
        })
      : [];
    const participants: CalcParticipant[] = participantRows.map((row) => ({
      dealId: row.dealId,
      userId: row.userId,
      sharePercent: row.sharePercent as number,
      ratioOverride: row.commissionRate === null ? null : Number(row.commissionRate),
    }));

    // 지난 정산에서 다 못 빼고 넘긴 돈: 이 달보다 앞선 가장 최근 확정 정산에서 가져온다
    const previous = await db.settlement.findFirst({
      where: { officeId, month: { lt: month } },
      orderBy: { month: 'desc' },
      select: { lines: { select: { userId: true, carryOutWon: true } } },
    });
    const carryIn = new Map((previous?.lines ?? []).map((line) => [line.userId, line.carryOutWon]));

    const users = await db.user.findMany({
      where: { officeId },
      select: {
        id: true,
        name: true,
        isActive: true,
        payType: true,
        baseSalary: true,
        commissionRate: true,
        employmentType: true,
        withholdTax: true,
      },
      orderBy: { createdAt: 'asc' },
    });
    const staff: CalcStaff[] = users.map((user) => ({
      userId: user.id,
      name: user.name,
      employmentType: user.employmentType === 'employee' ? 'employee' : 'freelancer',
      withholdTax: user.withholdTax,
      ratio: user.commissionRate === null ? defaultRatio : Number(user.commissionRate),
      // 그만둔 직원과 순수 수수료제 직원에게는 기본급이 없다
      baseWon: user.isActive && user.payType !== 'commission_only' ? (user.baseSalary ?? 0) * WON_PER_MANWON : 0,
      carryInWon: carryIn.get(user.id) ?? 0,
    }));

    return { timing, result: computeSettlement({ monthEnd: end, timing, receipts: calcReceipts, participants, staff }) };
  }
}

/**
 * 한 사무소의 정산 확정·확정 취소를 한 번에 하나씩만 하게 한다.
 * 서로 다른 달을 동시에 확정하면 앞 달에서 넘어올 돈을 모른 채 계산하게 된다.
 * 트랜잭션이 끝나면 풀린다.
 */
async function lockOfficeSettlements(tx: Prisma.TransactionClient, officeId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'settlement:' + officeId}))`;
}

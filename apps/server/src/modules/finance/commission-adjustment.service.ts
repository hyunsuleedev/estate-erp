import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WON_PER_MANWON,
  paymentScopeFor,
  recomputeShareAmounts,
  type FinanceViewer,
  lockPayment,
  refreshPaymentFromReceipts,
  sumReceipts,
} from './commission-payment.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const ADJUSTMENT_TYPES = new Set<unknown>(['discount', 'waive', 'bad_debt']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 아직 받을 돈이 남아 조정할 수 있는 청구 상태 */
const OPEN_STATUSES = new Set(['pending', 'partial', 'overdue']);

/**
 * 수수료 조정 워크플로우 (ADJ-xxx)
 *
 * 담당자 → 할인/면제/대손 요청 (status='requested')
 * 사장님 → 승인 (approved) / 반려 (rejected)
 *
 * 승인 시 CommissionPayment 에 반영:
 *   - discount: actualAmount 를 expectedAmount + adjustment.amount (음수) 로 조정
 *   - waive:    status='waived'
 *   - bad_debt: status='waived' (회계상 구분은 adjustment 이력에 남음)
 */
@Injectable()
export class CommissionAdjustmentService {
  constructor(private readonly prisma: PrismaService) {}

  async listPending(officeId: string) {
    return this.prisma.commissionAdjustment.findMany({
      where: { officeId, status: 'requested' },
      include: {
        payment: {
          select: {
            id: true,
            code: true,
            clientSide: true,
            expectedAmount: true,
            deal: {
              select: {
                id: true,
                listing: {
                  select: {
                    property: {
                      select: {
                        site: { select: { name: true } },
                        unit: { select: { name: true, floor: true, floorEnd: true, floorLabel: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        requestedBy: { select: { id: true, name: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async listByPayment(officeId: string, paymentId: string) {
    if (typeof paymentId !== 'string' || !UUID.test(paymentId)) {
      throw new BadRequestException('청구를 골라 주세요.');
    }
    return this.prisma.commissionAdjustment.findMany({
      where: { officeId, paymentId },
      include: {
        requestedBy: { select: { id: true, name: true } },
        decidedBy: { select: { id: true, name: true } },
      },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async request(
    officeId: string,
    userId: string,
    dto: {
      paymentId: string;
      type: 'discount' | 'waive' | 'bad_debt';
      amount: number;
      reason: string;
    },
    viewer?: FinanceViewer,
  ) {
    if (!ADJUSTMENT_TYPES.has(dto?.type)) {
      throw new BadRequestException('조정 유형은 할인 합의, 면제, 대손 처리 가운데 하나여야 합니다.');
    }
    const reason = typeof dto.reason === 'string' ? dto.reason.trim() : '';
    if (!reason) throw new BadRequestException('요청 사유를 적어 주세요.');
    if (typeof dto.paymentId !== 'string' || !UUID.test(dto.paymentId)) {
      throw new BadRequestException('조정할 청구를 골라 주세요.');
    }
    // 직원은 자기가 담당으로 배정된 거래의 청구에만 조정을 요청한다 (볼 수 없는 청구는 없는 것과 같다)
    const payment = await this.prisma.commissionPayment.findFirst({
      where: { id: dto.paymentId, officeId, ...paymentScopeFor(viewer) },
    });
    if (!payment) throw new NotFoundException('청구를 찾지 못했습니다.');
    if (dto.type === 'discount' && (!Number.isInteger(dto.amount) || dto.amount === 0)) {
      throw new BadRequestException('할인 금액은 만원 단위 정수로 적어 주세요.');
    }

    // 청구 줄을 잠근 채 검사하고 만든다. 같은 청구에 요청이 동시에 두 번 들어와도 하나만 남는다.
    return this.prisma.$transaction(async (tx) => {
      const locked = await lockPayment(tx, payment.id, officeId, { anyStatus: true });
      if (!OPEN_STATUSES.has(locked.status)) {
        throw new ConflictException('다 받았거나 면제·취소한 청구는 조정할 수 없습니다.');
      }
      // 한 청구에 승인 대기 조정은 하나만 둔다 (둘이면 하나를 승인한 뒤 다른 하나가 틀린 금액을 깎는다)
      const waiting = await tx.commissionAdjustment.count({
        where: { officeId, paymentId: payment.id, status: 'requested' },
      });
      if (waiting > 0) {
        throw new ConflictException('이 청구에는 승인을 기다리는 조정 요청이 이미 있습니다.');
      }
      const received = await sumReceipts(tx, payment.id);
      // 남은 금액(만원). 부가세를 뺀 받은 돈을 만원으로 올려 센다.
      const leftManwon = locked.expectedAmount - Math.ceil(received.supplyWon / WON_PER_MANWON);
      if (leftManwon <= 0) {
        throw new ConflictException('남은 금액이 없어 조정할 수 없습니다.');
      }
      let amount: number;
      if (dto.type === 'discount') {
        // 금액은 만원 단위 음수로 저장한다. 양수로 와도 깎는 금액으로 본다.
        const discount = Math.abs(dto.amount);
        if (discount > leftManwon) {
          throw new BadRequestException(`남은 금액 ${leftManwon.toLocaleString('ko-KR')}만원까지 깎을 수 있습니다.`);
        }
        amount = -discount;
      } else {
        // 면제·대손은 남은 금액 전부다
        amount = -leftManwon;
      }

      const code = await nextAdjustmentCode(tx, officeId);
      return tx.commissionAdjustment.create({
        data: {
          officeId,
          paymentId: payment.id,
          code,
          type: dto.type,
          amount,
          reason,
          status: 'requested',
          requestedById: userId,
        },
      });
    });
  }

  async approve(
    id: string,
    officeId: string,
    deciderUserId: string,
    decisionNote?: string,
  ) {
    const adj = await this.prisma.commissionAdjustment.findFirst({
      where: { id, officeId },
      include: { payment: true },
    });
    if (!adj) throw new NotFoundException('조정 요청을 찾지 못했습니다.');
    if (adj.status !== 'requested') {
      throw new ConflictException(
        `이미 ${adj.status === 'approved' ? '승인' : '반려'}한 조정입니다.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 청구 줄을 잠그고 지금 값을 다시 읽는다. 요청한 뒤 돈이 더 들어왔을 수 있다.
      const payment = await lockPayment(tx, adj.paymentId, officeId, { anyStatus: true });
      if (!OPEN_STATUSES.has(payment.status)) {
        throw new ConflictException(
          '요청 뒤 이 청구가 다 받음·면제·취소로 바뀌어 조정할 금액이 없습니다. 반려해 주세요.',
        );
      }
      // 같은 조정을 동시에 두 번 승인해도 한 번만 적용되게 한다
      const { count } = await tx.commissionAdjustment.updateMany({
        where: { id, officeId, status: 'requested' },
        data: {
          status: 'approved',
          decidedById: deciderUserId,
          decidedAt: new Date(),
          decisionNote,
        },
      });
      if (count === 0) throw new ConflictException('이미 처리한 조정입니다.');
      const updated = await tx.commissionAdjustment.findUniqueOrThrow({ where: { id } });
      const current = await tx.commissionPayment.findUniqueOrThrow({ where: { id: payment.id } });

      if (adj.type === 'discount') {
        const nextExpected = Math.max(0, payment.expectedAmount + adj.amount);
        const received = await sumReceipts(tx, payment.id);
        if (received.supplyWon > nextExpected * WON_PER_MANWON) {
          throw new ConflictException(
            '이미 받은 돈이 할인한 뒤의 청구액보다 많습니다. 반려한 뒤 남은 금액 안에서 다시 요청해 주세요.',
          );
        }
        await tx.commissionPayment.update({
          where: { id: payment.id },
          data: {
            expectedAmount: nextExpected,
            note: `${current.note ? current.note + ' · ' : ''}조정 ${updated.code}: ${adj.reason}`,
          },
        });
        // 우리 몫·상대 몫도 줄어든 청구액으로 다시 나눈다 (정산을 기록한 줄은 그대로)
        await recomputeShareAmounts(tx, payment.id);
        // 할인으로 남은 돈이 없어졌으면 수금완료가 된다. 상태는 입금 기록에서 다시 계산한다.
        await refreshPaymentFromReceipts(tx, payment.id);
      } else {
        // waive / bad_debt
        await tx.commissionPayment.update({
          where: { id: payment.id },
          data: {
            status: 'waived',
            note: `${current.note ? current.note + ' · ' : ''}${adj.type === 'bad_debt' ? '대손' : '면제'} ${updated.code}: ${adj.reason}`,
          },
        });
      }

      return updated;
    });
  }

  async reject(
    id: string,
    officeId: string,
    deciderUserId: string,
    decisionNote?: string,
  ) {
    const adj = await this.prisma.commissionAdjustment.findFirst({
      where: { id, officeId },
    });
    if (!adj) throw new NotFoundException('조정 요청을 찾지 못했습니다.');
    // 승인과 반려가 동시에 들어와도 한쪽만 되게 한다
    const { count } = await this.prisma.commissionAdjustment.updateMany({
      where: { id, officeId, status: 'requested' },
      data: {
        status: 'rejected',
        decidedById: deciderUserId,
        decidedAt: new Date(),
        decisionNote,
      },
    });
    if (count === 0) {
      throw new ConflictException(`이미 ${adj.status === 'approved' ? '승인' : '처리'}한 조정입니다.`);
    }
    return this.prisma.commissionAdjustment.findUniqueOrThrow({ where: { id } });
  }

}

/**
 * 조정 번호 "ADJ-007". 사무소에서 가장 큰 번호 + 1. 건수 + 1로 정하면 지운 번호가 다시 나오고,
 * 동시에 두 요청이 같은 번호를 받는다 — 사무소 단위 잠금을 건 트랜잭션 안에서만 부른다.
 */
export async function nextAdjustmentCode(tx: Prisma.TransactionClient, officeId: string): Promise<string> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'adjustment-code:' + officeId}))`;
  const rows = await tx.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(CAST(SUBSTRING(code FROM 5) AS INTEGER)) AS max
    FROM commission_adjustments
    WHERE office_id = ${officeId}::uuid AND code ~ '^ADJ-[0-9]+$'`;
  const next = Number(rows[0]?.max ?? 0) + 1;
  return `ADJ-${String(next).padStart(3, '0')}`;
}

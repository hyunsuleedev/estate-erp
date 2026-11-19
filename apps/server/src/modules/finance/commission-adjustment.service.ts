import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  WON_PER_MANWON,
  lockPayment,
  refreshPaymentFromReceipts,
  sumReceipts,
} from './commission-payment.service';
import { PrismaService } from '../../prisma/prisma.service';

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
  ) {
    const payment = await this.prisma.commissionPayment.findFirst({
      where: { id: dto.paymentId, officeId },
    });
    if (!payment) throw new NotFoundException('CommissionPayment not found');

    const code = await this.nextCode(officeId);

    return this.prisma.commissionAdjustment.create({
      data: {
        officeId,
        paymentId: dto.paymentId,
        code,
        type: dto.type,
        amount: dto.amount, // 보통 음수
        reason: dto.reason,
        status: 'requested',
        requestedById: userId,
      },
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
    if (!adj) throw new NotFoundException('Adjustment not found');
    if (adj.status !== 'requested') {
      throw new BadRequestException(
        `이미 처리된 조정입니다. (status=${adj.status})`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // 청구 줄을 잠그고 지금 값을 다시 읽는다. 요청한 뒤 돈이 더 들어왔을 수 있다.
      const payment = await lockPayment(tx, adj.paymentId, officeId, { anyStatus: true });
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
      if (count === 0) throw new BadRequestException('이미 처리된 조정입니다.');
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
    if (!adj) throw new NotFoundException('Adjustment not found');
    if (adj.status !== 'requested') {
      throw new BadRequestException(
        `이미 처리된 조정입니다. (status=${adj.status})`,
      );
    }
    return this.prisma.commissionAdjustment.update({
      where: { id },
      data: {
        status: 'rejected',
        decidedById: deciderUserId,
        decidedAt: new Date(),
        decisionNote,
      },
    });
  }

  private async nextCode(officeId: string): Promise<string> {
    const count = await this.prisma.commissionAdjustment.count({
      where: { officeId },
    });
    return `ADJ-${String(count + 1).padStart(3, '0')}`;
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
                        unit: { select: { name: true } },
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
      const updated = await tx.commissionAdjustment.update({
        where: { id },
        data: {
          status: 'approved',
          decidedById: deciderUserId,
          decidedAt: new Date(),
          decisionNote,
        },
      });

      // CommissionPayment 에 반영
      const payment = adj.payment;
      if (adj.type === 'discount') {
        const nextExpected = Math.max(0, payment.expectedAmount + adj.amount);
        // actualAmount 가 이미 있으면 유지 (이미 일부 수금), 없으면 새 expected 설정
        await tx.commissionPayment.update({
          where: { id: payment.id },
          data: {
            expectedAmount: nextExpected,
            note: `${payment.note ? payment.note + ' · ' : ''}조정 ${updated.code}: ${adj.reason}`,
          },
        });
      } else {
        // waive / bad_debt
        await tx.commissionPayment.update({
          where: { id: payment.id },
          data: {
            status: 'waived',
            note: `${payment.note ? payment.note + ' · ' : ''}${adj.type === 'bad_debt' ? '대손' : '면제'} ${updated.code}: ${adj.reason}`,
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

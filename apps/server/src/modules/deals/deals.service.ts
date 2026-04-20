import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  calculateCommissionAmount,
  calculateCommissionBase,
  computeDealCommissionSummary,
  type CommissionTransactionType,
} from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';

const dealInclude = {
  listing: { include: { property: { include: { site: true, unit: true } } } },
  buyerContact: true,
  sellerContact: true,
  partnerBroker: { select: { id: true, name: true, phone: true } },
  payments: { orderBy: [{ kind: 'asc' }, { sequence: 'asc' }] },
  commissionPayments: {
    include: { distributions: true },
  },
} satisfies Prisma.DealInclude;

type DealWithRelations = Prisma.DealGetPayload<{ include: typeof dealInclude }>;

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly dealInclude = dealInclude;

  async findAll(officeId: string) {
    const deals = await this.prisma.deal.findMany({
      where: { officeId },
      include: this.dealInclude,
      orderBy: { createdAt: 'desc' },
    });

    return deals.map((deal) => this.withPropertyContext(deal));
  }

  async findOne(id: string, officeId: string) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, officeId },
      include: this.dealInclude,
    });
    if (!deal) throw new NotFoundException('Deal not found');
    return this.withPropertyContext(deal);
  }

  async create(
    officeId: string,
    dto: {
      propertyId?: string;
      listingId?: string;
      matchId?: string;
      transactionType?: string;
      agreedPrice?: number;
      agreedDeposit?: number;
      agreedMonthlyRent?: number;
      agreedMoveInDate?: string;
      specialTerms?: string;
      buyerContactId?: string;
      sellerContactId?: string;
      isJointBrokerage?: boolean;
      ourSide?: 'seller' | 'buyer' | 'both';
      partnerBrokerId?: string;
      memo?: string;
    },
  ) {
    const { listingId, transactionType } = await this.resolveListing(
      officeId,
      dto,
    );

    const ourSide = dto.ourSide ?? 'both';

    const deal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.deal.create({
        data: {
          officeId,
          listingId,
          matchId: dto.matchId,
          transactionType,
          agreedPrice: dto.agreedPrice,
          agreedDeposit: dto.agreedDeposit,
          agreedMonthlyRent: dto.agreedMonthlyRent,
          agreedMoveInDate: dto.agreedMoveInDate
            ? new Date(dto.agreedMoveInDate)
            : undefined,
          specialTerms: dto.specialTerms,
          buyerContactId: dto.buyerContactId,
          sellerContactId: dto.sellerContactId,
          isJointBrokerage: dto.isJointBrokerage ?? false,
          ourSide,
          partnerBrokerId: dto.partnerBrokerId,
          memo: dto.memo,
        },
      });

      // 합의가가 있으면 CommissionPayment 자동 생성
      await this.autoGenerateCommissionPayments(tx, {
        dealId: created.id,
        officeId,
        transactionType,
        agreedPrice: dto.agreedPrice,
        agreedDeposit: dto.agreedDeposit,
        agreedMonthlyRent: dto.agreedMonthlyRent,
        buyerContactId: dto.buyerContactId,
        sellerContactId: dto.sellerContactId,
        isJointBrokerage: dto.isJointBrokerage ?? false,
        ourSide,
        partnerBrokerId: dto.partnerBrokerId,
      });

      return tx.deal.findUnique({
        where: { id: created.id },
        include: this.dealInclude,
      });
    });

    if (!deal) throw new NotFoundException('Deal creation failed');
    return this.withPropertyContext(deal);
  }

  /**
   * Deal 생성 시 법정 요율에 맞춰 CommissionPayment 를 자동 생성한다.
   * 공동중개에서 우리 담당 측만 생성 (상대측은 파트너 사무소가 자기 DB 에 관리).
   * CommissionDistribution 도 기본값 (우리 100%) 으로 동반 생성.
   *
   * 기준 금액이 0 또는 null 이면 생성을 건너뛴다 (사용자가 나중에 수동 추가 가능).
   */
  private async autoGenerateCommissionPayments(
    tx: Prisma.TransactionClient,
    args: {
      dealId: string;
      officeId: string;
      transactionType: string;
      agreedPrice?: number | null;
      agreedDeposit?: number | null;
      agreedMonthlyRent?: number | null;
      buyerContactId?: string | null;
      sellerContactId?: string | null;
      isJointBrokerage: boolean;
      ourSide: 'seller' | 'buyer' | 'both';
      partnerBrokerId?: string | null;
    },
  ) {
    if (
      args.transactionType !== 'sale' &&
      args.transactionType !== 'jeonse' &&
      args.transactionType !== 'monthly'
    ) {
      return;
    }
    const txType = args.transactionType as CommissionTransactionType;

    const base = calculateCommissionBase(txType, {
      agreedPrice: args.agreedPrice ?? null,
      agreedDeposit: args.agreedDeposit ?? null,
      agreedMonthlyRent: args.agreedMonthlyRent ?? null,
    });
    if (base <= 0) return;

    const { rate, amount } = calculateCommissionAmount(txType, base);
    if (amount <= 0) return;

    // 우리가 담당하는 측만 CommissionPayment 생성.
    // 단독중개 (isJointBrokerage=false) 는 ourSide 무관하게 양쪽 다 우리 것.
    const sidesToGenerate: Array<'seller' | 'buyer'> = !args.isJointBrokerage
      ? ['seller', 'buyer']
      : args.ourSide === 'both'
        ? ['seller', 'buyer']
        : [args.ourSide];

    const code = await this.nextCommissionCode(tx, args.officeId);

    for (let i = 0; i < sidesToGenerate.length; i++) {
      const side = sidesToGenerate[i];
      const payment = await tx.commissionPayment.create({
        data: {
          officeId: args.officeId,
          dealId: args.dealId,
          code: `${code}-${String(i + 1).padStart(2, '0')}`,
          clientSide: side,
          collectedByOffice: 'us',
          payerContactId:
            side === 'seller' ? args.sellerContactId : args.buyerContactId,
          baseAmount: base,
          rate: new Prisma.Decimal(rate),
          expectedAmount: amount,
          status: 'draft',
        },
      });

      // 기본 분배: 우리 사무소 100%
      await tx.commissionDistribution.create({
        data: {
          officeId: args.officeId,
          paymentId: payment.id,
          recipientType: 'our_office',
          shareRatio: new Prisma.Decimal(100),
          shareAmount: amount,
        },
      });
    }
  }

  /**
   * CommissionPayment code 접두사 생성: "P-YYMM". 이미 존재하는 같은 접두사의
   * code 중 최대 -NN 을 찾아 +1 을 반환.
   */
  private async nextCommissionCode(
    tx: Prisma.TransactionClient,
    officeId: string,
  ): Promise<string> {
    const now = new Date();
    const prefix = `P-${String(now.getFullYear() % 100).padStart(2, '0')}${String(
      now.getMonth() + 1,
    ).padStart(2, '0')}`;

    // 이미 동일 접두사로 생성된 것들은 "-NN" 서픽스가 따로 붙어있으므로
    // 접두사 자체는 unique 하지 않아도 OK. 현재 시각 기반 + 랜덤 작은 suffix 로 충돌 회피.
    const count = await tx.commissionPayment.count({
      where: { officeId, code: { startsWith: prefix } },
    });
    const seq = String(Math.floor(count / 10) + 1).padStart(2, '0');
    return `${prefix}-${seq}`;
  }

  async updateStage(
    id: string,
    officeId: string,
    dto: {
      stage: string;
      agreedPrice?: number;
      agreedDeposit?: number;
      agreedMonthlyRent?: number;
      memo?: string;
    },
  ) {
    const existing = await this.findOne(id, officeId);

    // stage 가 contracted 이상이면 Contract 필수
    const contractRequiredStages = new Set([
      'contracted',
      'settling',
      'completed',
      'closed',
    ]);
    if (contractRequiredStages.has(dto.stage)) {
      const contract = await this.prisma.contract.findUnique({
        where: { dealId: id },
        select: { id: true },
      });
      if (!contract) {
        throw new BadRequestException(
          `Contract 가 존재해야 stage='${dto.stage}' 로 전이할 수 있습니다.`,
        );
      }
    }

    const stageChanged = dto.stage !== existing.stage;

    // contracted 진입 시 draft 수수료 청구를 pending 으로 확정하고
    // Contract.finalPaymentDate 가 있으면 dueDate 기본값으로 세팅.
    const enteringContracted =
      stageChanged &&
      dto.stage === 'contracted' &&
      existing.stage !== 'contracted';

    const deal = await this.prisma.$transaction(async (tx) => {
      if (enteringContracted) {
        const contract = await tx.contract.findUnique({
          where: { dealId: id },
          select: { statedBalanceDate: true },
        });
        await tx.commissionPayment.updateMany({
          where: { dealId: id, officeId, status: 'draft' },
          data: {
            status: 'pending',
            ...(contract?.statedBalanceDate
              ? { dueDate: contract.statedBalanceDate }
              : {}),
          },
        });
      }

      return tx.deal.update({
        where: { id },
        data: {
          stage: dto.stage,
          stageChangedAt: stageChanged ? new Date() : undefined,
          agreedPrice: dto.agreedPrice,
          agreedDeposit: dto.agreedDeposit,
          agreedMonthlyRent: dto.agreedMonthlyRent,
          memo: dto.memo,
        },
        include: this.dealInclude,
      });
    });

    return this.withPropertyContext(deal);
  }

  async cancel(
    id: string,
    officeId: string,
    dto: { cancelReason?: string; cancelledBy?: string },
  ) {
    await this.findOne(id, officeId);

    const deal = await this.prisma.deal.update({
      where: { id },
      data: {
        isCancelled: true,
        cancelledAt: new Date(),
        cancelReason: dto.cancelReason,
        cancelledBy: dto.cancelledBy,
      },
      include: this.dealInclude,
    });

    return this.withPropertyContext(deal);
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.deal.delete({ where: { id } });
  }

  private withPropertyContext(deal: DealWithRelations) {
    const property = deal.listing?.property ?? null;

    const commissionSummary = computeDealCommissionSummary(
      (deal.commissionPayments ?? []).map((p) => ({
        expectedAmount: p.expectedAmount,
        actualAmount: p.actualAmount,
        status: p.status,
        distributions: (p.distributions ?? []).map((d) => ({
          recipientType: d.recipientType,
          shareRatio: d.shareRatio.toString(),
          shareAmount: d.shareAmount,
        })),
      })),
    );

    return {
      ...deal,
      propertyId: property?.id ?? null,
      property,
      commissionSummary,
    };
  }

  private async resolveListing(
    officeId: string,
    dto: { propertyId?: string; listingId?: string; transactionType?: string },
  ): Promise<{ listingId: string | undefined; transactionType: string }> {
    if (dto.listingId) {
      const listing = await this.prisma.listing.findFirst({
        where: { id: dto.listingId, officeId },
        select: { id: true, transactionType: true },
      });
      if (!listing) throw new NotFoundException('Listing not found');
      return {
        listingId: listing.id,
        transactionType: dto.transactionType ?? listing.transactionType,
      };
    }

    if (dto.propertyId) {
      const listing = await this.prisma.listing.findFirst({
        where: { officeId, propertyId: dto.propertyId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, transactionType: true },
      });
      if (!listing) throw new NotFoundException('Listing not found');
      return {
        listingId: listing.id,
        transactionType: dto.transactionType ?? listing.transactionType,
      };
    }

    if (!dto.transactionType) {
      throw new BadRequestException(
        'listingId, propertyId, 또는 transactionType 중 하나는 필요합니다.',
      );
    }

    return { listingId: undefined, transactionType: dto.transactionType };
  }
}

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
  siteTypeToCommissionKind,
  TransactionType,
  type CommissionTransactionType,
} from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';

const dealInclude = {
  listing: {
    include: {
      property: {
        include: { site: true, unit: { include: { dong: true } } },
      },
    },
  },
  buyerContact: true,
  sellerContact: true,
  partnerBroker: { select: { id: true, name: true, phone: true } },
  participants: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  },
  payments: { orderBy: [{ kind: 'asc' }, { sequence: 'asc' }] },
  commissionPayments: {
    include: { distributions: true },
  },
} satisfies Prisma.DealInclude;

type DealWithRelations = Prisma.DealGetPayload<{ include: typeof dealInclude }>;

/// 가계약금 수령(preContract) 이상 = 매물을 점유하는 배타 단계.
/// 같은 Listing 에 이 단계의 활성(비취소) Deal 은 동시에 하나만 허용 (이중계약 방지).
const EXCLUSIVE_STAGES: ReadonlySet<string> = new Set([
  'preContract',
  'contracted',
  'settling',
  'completed',
  'closed',
]);

/// Listing.checkStatus / ListingIntake.status 를 'done' 으로 확정하는 단계.
const DONE_STAGES: ReadonlySet<string> = new Set(['completed', 'closed']);

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

  /**
   * 매물 단위 트랜잭션 advisory lock. 같은 Listing 에 대한 배타 단계 진입/취소
   * 트랜잭션을 직렬화해 check-then-write 경주를 막는다. 트랜잭션 종료 시 자동 해제.
   */
  private async lockListingForStageChange(
    tx: Prisma.TransactionClient,
    listingId: string,
  ) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${listingId}::text, 0))`;
  }

  /** 거래유형은 sale/jeonse/monthly 3종만 허용 (연세 등 폐기 유형 저장 차단) */
  private assertValidTransactionType(transactionType?: string) {
    if (transactionType === undefined) return;
    const valid = Object.values(TransactionType) as string[];
    if (!valid.includes(transactionType)) {
      throw new BadRequestException('Invalid transactionType');
    }
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
    this.assertValidTransactionType(dto.transactionType);
    const { listingId, transactionType, siteType } = await this.resolveListing(
      officeId,
      dto,
    );
    // listing에서 유도된 값도 방어적으로 확인 (과거 데이터가 남아있는 경우 차단)
    this.assertValidTransactionType(transactionType);

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
        siteType,
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
      siteType?: string | null;
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

    // Listing → Property → Site.type 체인으로 물건유형 결정.
    // 매물 미연결 Deal 은 'housing' 기본값 적용.
    const propertyKind = args.siteType
      ? siteTypeToCommissionKind(args.siteType)
      : 'housing';

    const { rate, amount } = calculateCommissionAmount(
      txType,
      base,
      propertyKind,
    );
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

    // 배타 단계 진입 시 같은 매물의 다른 활성 Deal 이 이미 배타 단계면 거부.
    // (이중계약 방지 — selection/negotiating 병행은 허용)
    // 검사는 트랜잭션 안에서 매물 단위 advisory lock 을 잡고 수행한다 —
    // 동시 요청 두 건이 모두 검사를 통과하는 check-then-write 경주 방지.
    const enteringExclusive =
      stageChanged &&
      EXCLUSIVE_STAGES.has(dto.stage) &&
      !EXCLUSIVE_STAGES.has(existing.stage);

    // contracted 진입 시 draft 수수료 청구를 pending 으로 확정하고
    // Contract.finalPaymentDate 가 있으면 dueDate 기본값으로 세팅.
    const enteringContracted =
      stageChanged &&
      dto.stage === 'contracted' &&
      existing.stage !== 'contracted';

    const enteringDone =
      stageChanged &&
      DONE_STAGES.has(dto.stage) &&
      !DONE_STAGES.has(existing.stage);

    const deal = await this.prisma.$transaction(async (tx) => {
      if (enteringExclusive && existing.listingId) {
        await this.lockListingForStageChange(tx, existing.listingId);
        const conflicting = await tx.deal.findFirst({
          where: {
            listingId: existing.listingId,
            id: { not: id },
            isCancelled: false,
            stage: { in: [...EXCLUSIVE_STAGES] },
          },
          select: { id: true, stage: true },
        });
        if (conflicting) {
          throw new BadRequestException(
            `이 매물에 이미 진행 중인 거래가 있습니다 (stage='${conflicting.stage}'). ` +
              '기존 거래를 취소한 후 진행하세요.',
          );
        }
      }

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

      // ── Listing/Intake 상태 동기화 — Deal 이 거래 사실의 source of truth ──
      // 배타 단계 진입: 해당 매물만 '거래중' (같은 의뢰의 다른 거래유형은
      // 세안고 매매 등 계속 진행 가능하므로 건드리지 않음)
      if (enteringExclusive && existing.listingId) {
        await tx.listing.updateMany({
          where: {
            id: existing.listingId,
            checkStatus: { notIn: ['in_contract', 'done'] },
          },
          data: { checkStatus: 'in_contract', checkStatusChangedAt: new Date() },
        });
        if (existing.listing?.intakeId) {
          await tx.listingIntake.updateMany({
            where: {
              id: existing.listing.intakeId,
              status: { notIn: ['in_contract', 'done'] },
            },
            data: { status: 'in_contract' },
          });
        }
      }

      // completed/closed 진입: 매물 done, 의뢰는 산하 매물이 전부 done 이면 done
      if (enteringDone && existing.listingId) {
        await tx.listing.updateMany({
          where: { id: existing.listingId, checkStatus: { not: 'done' } },
          data: { checkStatus: 'done', checkStatusChangedAt: new Date() },
        });
        if (existing.listing?.intakeId) {
          const remaining = await tx.listing.count({
            where: {
              intakeId: existing.listing.intakeId,
              checkStatus: { not: 'done' },
            },
          });
          if (remaining === 0) {
            await tx.listingIntake.updateMany({
              where: { id: existing.listing.intakeId, status: { not: 'done' } },
              data: { status: 'done' },
            });
          }
        }
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
    const existing = await this.findOne(id, officeId);

    const deal = await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.deal.update({
        where: { id },
        data: {
          isCancelled: true,
          cancelledAt: new Date(),
          cancelReason: dto.cancelReason,
          cancelledBy: dto.cancelledBy,
        },
        include: this.dealInclude,
      });

      // 배타 단계에서 취소되면 매물/의뢰 상태 복귀 — 단, 같은 매물을 점유한
      // 다른 활성 Deal 이 남아 있으면 건드리지 않는다.
      if (
        EXCLUSIVE_STAGES.has(existing.stage) &&
        !existing.isCancelled &&
        existing.listingId
      ) {
        // 동시 updateStage(배타 진입)와의 경주 방지 — 같은 매물 락으로 직렬화
        await this.lockListingForStageChange(tx, existing.listingId);
        const stillOccupied = await tx.deal.findFirst({
          where: {
            listingId: existing.listingId,
            id: { not: id },
            isCancelled: false,
            stage: { in: [...EXCLUSIVE_STAGES] },
          },
          select: { id: true },
        });
        if (!stillOccupied) {
          await tx.listing.updateMany({
            where: { id: existing.listingId, checkStatus: 'in_contract' },
            data: {
              checkStatus: 'verified',
              checkStatusChangedAt: new Date(),
            },
          });
          if (existing.listing?.intakeId) {
            await tx.listingIntake.updateMany({
              where: {
                id: existing.listing.intakeId,
                status: 'in_contract',
              },
              data: { status: 'active' },
            });
          }
        }
      }

      return cancelled;
    });

    return this.withPropertyContext(deal);
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.deal.delete({ where: { id } });
  }

  // ============================================================
  // DealPayment — 지급 스케줄 CRUD
  // ============================================================

  private static readonly PAYMENT_KINDS = new Set([
    'pre_contract',
    'contract',
    'interim',
    'balance',
    'refund',
  ]);

  private static readonly PAYMENT_STATUSES = new Set([
    'pending',
    'partial',
    'paid',
    'overdue',
    'cancelled',
  ]);

  async createPayment(
    dealId: string,
    officeId: string,
    dto: {
      kind: string;
      sequence?: number;
      scheduledAmount: number;
      scheduledDate?: string;
      memo?: string;
    },
  ) {
    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, officeId },
      select: { id: true },
    });
    if (!deal) throw new NotFoundException('Deal not found');

    if (!DealsService.PAYMENT_KINDS.has(dto.kind)) {
      throw new BadRequestException(`지원하지 않는 지급 종류입니다: ${dto.kind}`);
    }
    if (!dto.scheduledAmount || dto.scheduledAmount <= 0) {
      throw new BadRequestException('예정 금액(만원)을 입력해주세요.');
    }

    let sequence = dto.sequence;
    if (sequence == null) {
      if (dto.kind === 'interim') {
        const last = await this.prisma.dealPayment.findFirst({
          where: { dealId, kind: 'interim' },
          orderBy: { sequence: 'desc' },
          select: { sequence: true },
        });
        sequence = (last?.sequence ?? 0) + 1;
      } else {
        sequence = 1;
      }
    }

    try {
      return await this.prisma.dealPayment.create({
        data: {
          officeId,
          dealId,
          kind: dto.kind,
          sequence,
          scheduledAmount: dto.scheduledAmount,
          scheduledDate: dto.scheduledDate
            ? new Date(dto.scheduledDate)
            : undefined,
          memo: dto.memo,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException(
          '같은 종류·차수의 지급 항목이 이미 존재합니다.',
        );
      }
      throw error;
    }
  }

  async updatePayment(
    dealId: string,
    paymentId: string,
    officeId: string,
    dto: {
      scheduledAmount?: number;
      scheduledDate?: string | null;
      paidAmount?: number | null;
      paidAt?: string | null;
      status?: string;
      method?: string | null;
      payerName?: string | null;
      memo?: string | null;
    },
  ) {
    const existing = await this.prisma.dealPayment.findFirst({
      where: { id: paymentId, dealId, officeId },
    });
    if (!existing) throw new NotFoundException('DealPayment not found');

    if (dto.status && !DealsService.PAYMENT_STATUSES.has(dto.status)) {
      throw new BadRequestException(`지원하지 않는 상태입니다: ${dto.status}`);
    }
    if (dto.scheduledAmount !== undefined && dto.scheduledAmount <= 0) {
      throw new BadRequestException('예정 금액(만원)은 0보다 커야 합니다.');
    }

    // 입금액이 들어오고 status 를 명시하지 않으면 자동 판정 (paid / partial / pending)
    let status = dto.status;
    if (!status && dto.paidAmount !== undefined) {
      const scheduledAmount = dto.scheduledAmount ?? existing.scheduledAmount;
      status =
        dto.paidAmount == null
          ? 'pending'
          : dto.paidAmount >= scheduledAmount
            ? 'paid'
            : 'partial';
    }

    // 입금 확인인데 입금일이 없으면 현재 시각으로 기본 처리
    let paidAt: Date | null | undefined;
    if (dto.paidAt !== undefined) {
      paidAt = dto.paidAt ? new Date(dto.paidAt) : null;
    } else if (dto.paidAmount != null && existing.paidAt == null) {
      paidAt = new Date();
    }

    return this.prisma.dealPayment.update({
      where: { id: paymentId },
      data: {
        scheduledAmount: dto.scheduledAmount,
        scheduledDate:
          dto.scheduledDate !== undefined
            ? dto.scheduledDate
              ? new Date(dto.scheduledDate)
              : null
            : undefined,
        paidAmount: dto.paidAmount !== undefined ? dto.paidAmount : undefined,
        paidAt,
        status,
        method: dto.method !== undefined ? dto.method : undefined,
        payerName: dto.payerName !== undefined ? dto.payerName : undefined,
        memo: dto.memo !== undefined ? dto.memo : undefined,
      },
    });
  }

  async removePayment(dealId: string, paymentId: string, officeId: string) {
    const existing = await this.prisma.dealPayment.findFirst({
      where: { id: paymentId, dealId, officeId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('DealPayment not found');
    return this.prisma.dealPayment.delete({ where: { id: paymentId } });
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
  ): Promise<{
    listingId: string | undefined;
    transactionType: string;
    /** Listing → Property → Site.type (법정 중개보수 물건유형 결정용) */
    siteType: string | null;
  }> {
    const listingSelect = {
      id: true,
      transactionType: true,
      property: { select: { site: { select: { type: true } } } },
    } satisfies Prisma.ListingSelect;

    if (dto.listingId) {
      const listing = await this.prisma.listing.findFirst({
        where: { id: dto.listingId, officeId },
        select: listingSelect,
      });
      if (!listing) throw new NotFoundException('Listing not found');
      return {
        listingId: listing.id,
        transactionType: dto.transactionType ?? listing.transactionType,
        siteType: listing.property?.site?.type ?? null,
      };
    }

    if (dto.propertyId) {
      const listing = await this.prisma.listing.findFirst({
        where: { officeId, propertyId: dto.propertyId },
        orderBy: { createdAt: 'desc' },
        select: listingSelect,
      });
      if (!listing) throw new NotFoundException('Listing not found');
      return {
        listingId: listing.id,
        transactionType: dto.transactionType ?? listing.transactionType,
        siteType: listing.property?.site?.type ?? null,
      };
    }

    if (!dto.transactionType) {
      throw new BadRequestException(
        'listingId, propertyId, 또는 transactionType 중 하나는 필요합니다.',
      );
    }

    return {
      listingId: undefined,
      transactionType: dto.transactionType,
      siteType: null,
    };
  }
}

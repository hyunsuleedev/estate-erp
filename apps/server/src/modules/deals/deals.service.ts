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
  IntakeClosedReason,
  IntakeLifecycleStatus,
  NON_CLOSED_INTAKE_LIFECYCLE_STATUSES,
  OCCUPYING_DEAL_STAGES,
  siteTypeToCommissionKind,
  TransactionType,
  type CommissionTransactionType,
} from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';

const dealInclude = {
  listing: {
    include: {
      intake: {
        select: {
          lifecycleStatus: true,
          lifecycleChangedAt: true,
          closedReason: true,
          lastCheckedAt: true,
          lastVerifiedAt: true,
          lastCheckResult: true,
          nextConfirmAt: true,
        },
      },
      // 파생 상태("거래중/종료") 계산용 점유 Deal — getListingAvailability와 동일 기준
      deals: {
        where: {
          isCancelled: false,
          stage: {
            in: [...OCCUPYING_DEAL_STAGES],
          },
        },
        select: { id: true, stage: true, stageChangedAt: true },
      },
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

/// ListingIntake 생명주기를 closed로 확정하는 단계 (산하 매물 전부 종결 시).
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
   * 의뢰 자동 closed의 근거("산하 매물 전부가 활성 종결 Deal 보유")가 무너졌으면
   * 의뢰를 open으로 되살린다. 종결 Deal 취소·단계 롤백 후 호출 —
   * 호출 시점에는 해당 변경이 이미 tx 에 반영돼 있어야 한다.
   *
   * 다중 Listing 의뢰에서 일부 옵션의 종결만 무산된 경우도 여기서 잡힌다
   * (예: 매매+전세 모두 완료 → 의뢰 closed → 전세 취소 → 의뢰 재개).
   * 같은 Property에 새 non-closed 의뢰가 있으면 되살리지 않는다.
   */
  private async reopenAutoClosedIntakeIfBasisBroken(
    tx: Prisma.TransactionClient,
    intakeId: string,
  ) {
    const listingsWithoutDoneDeal = await tx.listing.count({
      where: {
        intakeId,
        deals: {
          none: {
            isCancelled: false,
            stage: { in: [...DONE_STAGES] },
          },
        },
      },
    });
    if (listingsWithoutDoneDeal === 0) return; // 여전히 전부 종결 — closed 유지

    const intakeRow = await tx.listingIntake.findFirst({
      where: { id: intakeId },
      select: { propertyId: true, officeId: true },
    });
    if (!intakeRow) return;

    const otherNonClosedIntake = await tx.listingIntake.findFirst({
      where: {
        officeId: intakeRow.officeId,
        propertyId: intakeRow.propertyId,
        id: { not: intakeId },
        lifecycleStatus: {
          in: [...NON_CLOSED_INTAKE_LIFECYCLE_STATUSES],
        },
      },
      select: { id: true },
    });
    if (otherNonClosedIntake) return;

    // Deal 자동화가 closed 처리한 의뢰만 되살린다. 사용자의 수동 종결은 유지한다.
    await tx.listingIntake.updateMany({
      where: {
        id: intakeId,
        lifecycleStatus: IntakeLifecycleStatus.CLOSED,
        lifecycleChangedBy: 'system:deal',
        closedReason: IntakeClosedReason.DEAL_COMPLETED,
      },
      data: {
        lifecycleStatus: IntakeLifecycleStatus.OPEN,
        lifecycleChangedAt: new Date(),
        lifecycleChangedBy: 'system:deal',
        closedReason: null,
      },
    });
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

  /**
   * 하나의 의뢰에 속한 서로 다른 Listing의 Deal이 동시에 완료/취소될 수 있다.
   * 의뢰 단위 판정과 쓰기를 직렬화해 둘 다 상대 트랜잭션의 이전 상태를 보고
   * 자동 closed/reopen을 놓치는 경쟁을 막는다.
   */
  private async lockIntakeForLifecycleSync(
    tx: Prisma.TransactionClient,
    intakeId: string,
  ) {
    const lockKey = `listing-intake:${intakeId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0))`;
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
      /** 상태 토글에서 Deal을 시작할 때 hold/isPaused를 같은 트랜잭션에서 해제 */
      resumeListing?: boolean;
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
      if (dto.resumeListing && listingId) {
        const listingToResume = await tx.listing.findFirst({
          where: { id: listingId, officeId },
          select: {
            id: true,
            isPaused: true,
            intake: {
              select: {
                id: true,
                lifecycleStatus: true,
              },
            },
          },
        });
        if (!listingToResume) {
          throw new NotFoundException('Listing not found');
        }
        if (
          listingToResume.intake.lifecycleStatus ===
          IntakeLifecycleStatus.CLOSED
        ) {
          throw new BadRequestException(
            'Closed intake cannot start a new Deal',
          );
        }

        if (
          listingToResume.intake.lifecycleStatus === IntakeLifecycleStatus.HOLD
        ) {
          await tx.listingIntake.update({
            where: { id: listingToResume.intake.id },
            data: {
              lifecycleStatus: IntakeLifecycleStatus.OPEN,
              lifecycleChangedAt: new Date(),
              lifecycleChangedBy: 'user',
              closedReason: null,
            },
          });
        }
        if (listingToResume.isPaused) {
          await tx.listing.update({
            where: { id: listingToResume.id },
            data: { isPaused: false },
          });
        }
      }

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
      !existing.isCancelled &&
      DONE_STAGES.has(dto.stage) &&
      !DONE_STAGES.has(existing.stage);

    // 종결 단계에서 되돌아 나가는 전이 (completed → settling 등) —
    // 이 Deal이 의뢰를 자동 closed 처리했을 수 있으므로 커밋 후 재평가한다.
    const leavingDone =
      stageChanged &&
      !existing.isCancelled &&
      !DONE_STAGES.has(dto.stage) &&
      DONE_STAGES.has(existing.stage);

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

      if (
        (enteringDone || leavingDone) &&
        existing.listing?.intakeId
      ) {
        await this.lockIntakeForLifecycleSync(
          tx,
          existing.listing.intakeId,
        );
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

      // ── 상태 동기화 — Deal 이 거래 사실의 source of truth ──
      // "이 거래 옵션이 거래중/종료" 는 비취소 Deal 에서 파생하므로 (Listing 에
      // 상태 컬럼 없음) 배타 단계 진입 시 쓸 것이 없다. 세안고 매매처럼 같은
      // 의뢰의 다른 거래유형은 계속 진행 가능 — 의뢰 상태도 건드리지 않는다.
      //
      // completed/closed 진입: 의뢰는 산하 매물이 전부 종결 Deal 을 가지면 done.
      if (enteringDone && existing.listing?.intakeId) {
        const remaining = await tx.listing.count({
          where: {
            intakeId: existing.listing.intakeId,
            deals: {
              none: {
                isCancelled: false,
                stage: { in: [...DONE_STAGES] },
              },
            },
            // 지금 갱신 중인 Deal 의 stage 는 아직 커밋 전이므로 자신의 매물은 제외
            id: { not: existing.listingId ?? undefined },
          },
        });
        if (remaining === 0) {
          await tx.listingIntake.updateMany({
            where: {
              id: existing.listing.intakeId,
              lifecycleStatus: { not: IntakeLifecycleStatus.CLOSED },
            },
            data: {
              lifecycleStatus: IntakeLifecycleStatus.CLOSED,
              lifecycleChangedAt: new Date(),
              lifecycleChangedBy: 'system:deal',
              closedReason: IntakeClosedReason.DEAL_COMPLETED,
            },
          });
        }
      }

      const updated = await tx.deal.update({
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

      // 종결 근거가 사라졌으면 (이 Deal 이 done 단계에서 빠져나감) 의뢰 재평가
      if (leavingDone && existing.listing?.intakeId) {
        await this.reopenAutoClosedIntakeIfBasisBroken(
          tx,
          existing.listing.intakeId,
        );
      }

      return updated;
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
      const shouldReevaluateIntake =
        DONE_STAGES.has(existing.stage) &&
        !existing.isCancelled &&
        Boolean(existing.listing?.intakeId);
      if (shouldReevaluateIntake && existing.listing?.intakeId) {
        await this.lockIntakeForLifecycleSync(
          tx,
          existing.listing.intakeId,
        );
      }

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

      // 배타 단계에서 취소돼도 매물 상태 복귀는 필요 없다 — "거래중" 은 활성
      // Deal 에서 파생하므로 isCancelled = true 가 되는 순간 점유가 자동 해제된다.
      //
      // 단, 종결 단계(completed/closed) Deal 취소는 의뢰 자동 done 의 근거를
      // 무너뜨릴 수 있다 (거래 무산 후 재판매 경로) — 커밋된 취소 상태 기준으로 재평가.
      if (shouldReevaluateIntake && existing.listing?.intakeId) {
        await this.reopenAutoClosedIntakeIfBasisBroken(
          tx,
          existing.listing.intakeId,
        );
      }

      return cancelled;
    });

    return this.withPropertyContext(deal);
  }

  async remove(id: string, officeId: string) {
    const existing = await this.findOne(id, officeId);

    return this.prisma.$transaction(async (tx) => {
      const shouldReevaluateIntake =
        DONE_STAGES.has(existing.stage) &&
        !existing.isCancelled &&
        Boolean(existing.listing?.intakeId);
      if (shouldReevaluateIntake && existing.listing?.intakeId) {
        await this.lockIntakeForLifecycleSync(
          tx,
          existing.listing.intakeId,
        );
      }

      const deleted = await tx.deal.delete({ where: { id } });

      if (shouldReevaluateIntake && existing.listing?.intakeId) {
        await this.reopenAutoClosedIntakeIfBasisBroken(
          tx,
          existing.listing.intakeId,
        );
      }

      return deleted;
    });
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
    dto: {
      propertyId?: string;
      listingId?: string;
      transactionType?: string;
      resumeListing?: boolean;
    },
  ): Promise<{
    listingId: string | undefined;
    transactionType: string;
    /** Listing → Property → Site.type (법정 중개보수 물건유형 결정용) */
    siteType: string | null;
  }> {
    const listingSelect = {
      id: true,
      transactionType: true,
      isPaused: true,
      intake: { select: { lifecycleStatus: true } },
      property: { select: { site: { select: { type: true } } } },
    } satisfies Prisma.ListingSelect;

    if (dto.listingId) {
      const listing = await this.prisma.listing.findFirst({
        where: { id: dto.listingId, officeId },
        select: listingSelect,
      });
      if (!listing) throw new NotFoundException('Listing not found');
      this.assertListingAvailableForDeal(listing, dto.resumeListing === true);
      if (
        dto.transactionType &&
        dto.transactionType !== listing.transactionType
      ) {
        throw new BadRequestException(
          'transactionType must match the selected Listing',
        );
      }
      return {
        listingId: listing.id,
        transactionType: listing.transactionType,
        siteType: listing.property?.site?.type ?? null,
      };
    }

    if (dto.propertyId) {
      const listing = await this.prisma.listing.findFirst({
        where: {
          officeId,
          propertyId: dto.propertyId,
          isPaused: false,
          intake: { lifecycleStatus: IntakeLifecycleStatus.OPEN },
          ...(dto.transactionType
            ? { transactionType: dto.transactionType }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        select: listingSelect,
      });
      if (!listing) throw new NotFoundException('Available Listing not found');
      return {
        listingId: listing.id,
        transactionType: listing.transactionType,
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

  private assertListingAvailableForDeal(listing: {
    isPaused: boolean;
    intake: { lifecycleStatus: string };
  }, allowResume = false) {
    if (listing.intake.lifecycleStatus === IntakeLifecycleStatus.CLOSED) {
      throw new BadRequestException('Closed intake cannot start a new Deal');
    }
    if (
      !allowResume &&
      (listing.intake.lifecycleStatus === IntakeLifecycleStatus.HOLD ||
        listing.isPaused)
    ) {
      throw new BadRequestException(
        'Paused Listing cannot start a new Deal until it is resumed',
      );
    }
  }
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  calculateCommissionAmount,
  calculateLegacyRoundedCommissionAmount,
  calculateCommissionBase,
  computeDealCommissionSummary,
  DealStage,
  IntakeClosedReason,
  IntakeLifecycleStatus,
  MatchClosedReason,
  MatchStage,
  NON_CLOSED_INTAKE_LIFECYCLE_STATUSES,
  normalizeDealStage,
  normalizeMatchStage,
  OCCUPYING_DEAL_STAGES,
  siteTypeToCommissionKind,
  TransactionType,
  type CommissionPropertyKind,
  type CommissionTransactionType,
} from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { withPrimaryPhone } from '../contacts/contact-phone.utils';
import {
  recomputeShareAmounts,
  seesAllPayments,
  type FinanceViewer,
} from '../finance/commission-payment.service';
import {
  closeCompetingMatchesForDeal,
  closeOpenMatchesForIntake,
  closeSourceMatchForCancelledDeal,
  findRestorableMatchIds,
  restoreAutoClosedMatches,
  restoreMatchesClosedByDeal,
  settleMatchesForCancelledDeal,
} from '../matches/match-lifecycle-sync';

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
  // 연락처의 전화번호는 contact_phones 표에 있다. 거래 화면의 당사자 줄이 번호와 전화 단추를 보이게
  // 번호를 함께 읽고, 응답에는 대표 번호를 phone으로 붙인다(withPropertyContext).
  buyerContact: { include: { phones: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } },
  sellerContact: { include: { phones: { orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }] } } },
  partnerBroker: { select: { id: true, name: true, phone: true } },
  participants: {
    include: { user: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  },
  payments: { orderBy: [{ kind: 'asc' }, { sequence: 'asc' }] },
  commissionPayments: {
    include: {
      distributions: true,
      // 승인을 기다리는 조정(할인·면제·대손). 거래 화면이 "승인 대기"를 보이고 같은 청구에
      // 두 번 올리지 않게 하는 데 쓴다. 수금 화면의 조정 목록 API는 대표·매니저만 읽을 수 있어
      // 직원도 보도록 거래 응답에 함께 싣는다.
      adjustments: {
        where: { status: 'requested' },
        select: {
          id: true,
          type: true,
          amount: true,
          reason: true,
          status: true,
          requestedAt: true,
          requestedBy: { select: { id: true, name: true } },
        },
        orderBy: { requestedAt: 'desc' },
      },
    },
  },
  // 거래와 계약은 1:1이다. 화면이 "이 거래에 계약서가 있는지 · 계약금과 잔금이 얼마이고 언제인지"를 보려고
  // 사무소의 계약 전체를 따로 받아 짝을 맞추던 것을, 거래에 그 계약의 요약을 실어 없앤다.
  contract: {
    select: {
      id: true,
      dealId: true,
      status: true,
      transactionType: true,
      totalPrice: true,
      monthlyRent: true,
      contractDate: true,
      statedDeposit: true,
      statedInterimPayment: true,
      statedInterimDate: true,
      statedBalance: true,
      statedBalanceDate: true,
      moveInDate: true,
      leaseStartDate: true,
      leaseEndDate: true,
    },
  },
} satisfies Prisma.DealInclude;

type DealWithRelations = Prisma.DealGetPayload<{ include: typeof dealInclude }>;

/// ListingIntake 생명주기를 closed로 확정하는 Deal 단계.
const DONE_STAGES: ReadonlySet<string> = new Set(['completed', 'closed']);

/// 본계약 이후 단계. 진입하면 같은 거래 조건의 다른 손님 매칭을 자동 종료한다.
const CONTRACTED_OR_LATER_STAGES: ReadonlySet<string> = new Set([
  'contracted',
  'settling',
  'completed',
  'closed',
]);

/// 본계약(contracted) 단계에서 Contract를 작성한다.
/// 따라서 Contract는 대금 이행(settling) 단계로 넘어갈 때부터 필수다.
const CONTRACT_REQUIRED_STAGES: ReadonlySet<string> = new Set([
  'settling',
  'completed',
  'closed',
]);

const DEAL_STAGE_VALUES: ReadonlySet<string> = new Set(
  Object.values(DealStage),
);

/** 사용자에게 보이는 오류 문구에 쓰는 단계 이름 (화면의 단계 이름과 같다) */
const DEAL_STAGE_LABELS: Record<string, string> = {
  preparing: '계약 준비',
  preContract: '가계약',
  contracted: '본계약',
  settling: '중도금/잔금',
  completed: '잔금 완료',
  closed: '정산 종료',
};

const stageLabel = (stage: string) => DEAL_STAGE_LABELS[stage] ?? stage;

/** 거래를 취소할 때 받은 돈 줄에 덧붙이는 처리 메모의 머리말. 되살리면 이 줄만 뗀다. */
const CANCEL_MEMO_PREFIX = '거래 취소: ';
/** 거래 취소 때 함께 취소한 줄에 덧붙이는 표식. 되살리면 이 표식이 있는 줄만 되돌린다. */
const DEAL_CANCEL_MARK = '거래 취소로 함께 취소됨';

/** 원래 메모 뒤에 한 줄을 덧붙인다 */
function appendMemoLine(memo: string | null | undefined, line: string) {
  return memo?.trim() ? `${memo}\n${line}` : line;
}

/** 거래 취소가 덧붙인 줄(표식·처리 메모)만 떼고 원래 메모를 돌려준다. 남는 것이 없으면 null. */
function stripDealCancelLines(memo: string | null | undefined) {
  if (!memo) return null;
  const kept = memo
    .split('\n')
    .filter((line) => line !== DEAL_CANCEL_MARK && !line.startsWith(CANCEL_MEMO_PREFIX));
  const joined = kept.join('\n').trim();
  return joined ? joined : null;
}

/** 거래 취소 주체 (화면의 선택지와 같다) */
const CANCELLED_BY_VALUES: ReadonlySet<string> = new Set([
  'buyer',
  'seller',
  'mutual',
  'office',
  'partner',
  'other',
]);

const COMMISSION_PROPERTY_KINDS: ReadonlySet<string> = new Set([
  'housing',
  'officetel',
  'non_housing',
]);

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;

/** int4 칸에 들어갈 수 있는 가장 큰 값. 만원 단위라 실제 거래가는 한참 아래다. */
const MAX_INT4 = 2_147_483_647;

/**
 * 만원 단위 금액 칸 검사. 비운 값(undefined·null)은 통과한다.
 * 소수·음수가 들어오면 DB가 잘라 저장하거나 500을 내므로 여기서 막는다.
 */
function assertManwon(
  value: unknown,
  label: string,
  { positive = false }: { positive?: boolean } = {},
) {
  if (value === undefined || value === null) return;
  const min = positive ? 1 : 0;
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > MAX_INT4
  ) {
    throw new BadRequestException(
      `${label}: ${min} 이상의 만원 단위 정수로 입력해 주세요.`,
    );
  }
}

/** 날짜 칸 검사. undefined는 "바꾸지 않음", null·빈 글자는 "비움"이다. */
function parseDateInput(
  value: unknown,
  label: string,
): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (Number.isNaN(date.getTime())) {
    throw new BadRequestException(`${label}의 날짜 형식이 잘못되었습니다.`);
  }
  return date;
}

/**
 * 계약서 문서의 차수별 중도금 (1차 interimPayment/interimPaymentDate, 2차 interimPayment2/interimPayment2Date).
 * 문서가 없거나 중도금 칸이 비었으면 null. 읽지 못하는 금액·날짜는 그 칸을 비운 것으로 본다.
 */
function readInterimInstallments(
  metadata: Prisma.JsonValue | null | undefined,
): Array<{ amount: number | null; date: Date | null }> | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const container = (metadata as Record<string, unknown>).documentEngine;
  const fields =
    container && typeof container === 'object' && !Array.isArray(container)
      ? ((container as Record<string, unknown>).fields as Record<string, unknown> | undefined)
      : undefined;
  if (!fields || typeof fields !== 'object') return null;
  const text = (key: string) => (typeof fields[key] === 'string' ? (fields[key] as string).trim() : '');
  const amount = (key: string) => {
    const value = text(key).replace(/,/g, '');
    return /^\d+$/.test(value) ? Number(value) : null;
  };
  const date = (key: string) => {
    const value = text(key);
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
  };
  const installments = [
    { amount: amount('interimPayment'), date: date('interimPaymentDate') },
    { amount: amount('interimPayment2'), date: date('interimPayment2Date') },
  ].filter((installment) => installment.amount != null || installment.date != null);
  return installments.length ? installments : null;
}

/** 한국 시간 기준 날짜 (YYYY-MM-DD). 날짜만 뜻이 있는 칸을 비교할 때 쓴다. */
function seoulDay(date: Date) {
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

/** 수수료를 다시 계산할 때 쓰는 거래 조건 */
type CommissionTerms = {
  transactionType: string;
  siteType: string | null;
  agreedPrice: number | null;
  agreedDeposit: number | null;
  agreedMonthlyRent: number | null;
  isJointBrokerage: boolean;
  ourSide: string | null;
  buyerContactId: string | null;
  sellerContactId: string | null;
};

type CommissionSide = 'seller' | 'buyer';

/** 우리가 수수료를 받는 쪽. 단독중개는 양쪽, 공동중개는 우리 담당 측. */
function ourCommissionSides(
  isJointBrokerage: boolean,
  ourSide: string | null,
): CommissionSide[] {
  if (!isJointBrokerage) return ['seller', 'buyer'];
  if (ourSide === 'seller' || ourSide === 'buyer') return [ourSide];
  return ['seller', 'buyer'];
}

function toCommissionTxType(
  transactionType: string,
): CommissionTransactionType | null {
  return transactionType === 'sale' ||
    transactionType === 'jeonse' ||
    transactionType === 'monthly'
    ? transactionType
    : null;
}

/** 요율 계산 기준 금액. 전세금이 보증금 칸에만 적힌 거래도 계산되게 한다. */
function commissionBaseOf(terms: {
  transactionType: string;
  agreedPrice: number | null;
  agreedDeposit: number | null;
  agreedMonthlyRent: number | null;
}): number {
  const txType = toCommissionTxType(terms.transactionType);
  if (!txType) return 0;
  return calculateCommissionBase(txType, {
    agreedPrice:
      terms.agreedPrice ?? (txType === 'jeonse' ? terms.agreedDeposit : null),
    agreedDeposit: terms.agreedDeposit,
    agreedMonthlyRent: terms.agreedMonthlyRent,
  });
}

/** 법정 상한으로 계산한 한쪽 수수료. 계산할 수 없으면 null. */
function computeAutoCommission(terms: CommissionTerms) {
  const txType = toCommissionTxType(terms.transactionType);
  if (!txType) return null;
  const base = commissionBaseOf(terms);
  if (base <= 0) return null;
  // Listing → Property → Site.type 으로 물건유형을 정한다. 매물 없는 거래는 주택.
  const propertyKind = terms.siteType
    ? siteTypeToCommissionKind(terms.siteType)
    : 'housing';
  const { rate, amount } = calculateCommissionAmount(txType, base, propertyKind);
  if (amount <= 0) return null;
  return {
    base,
    rate,
    amount,
    /**
     * 예전 계산(반올림)으로 나오던 금액. 그때 자동으로 만든 청구를 "손대지 않은 자동 청구"로
     * 알아보는 데만 쓴다(새 청구는 늘 `amount`로 만든다).
     */
    legacyAmount: calculateLegacyRoundedCommissionAmount(txType, base, propertyKind),
    sides: ourCommissionSides(terms.isJointBrokerage, terms.ourSide),
  };
}

@Injectable()
export class DealsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly dealInclude = dealInclude;

  /**
   * 보는 사람에 맞춰 수수료 칸을 가린다. 수금 화면과 같은 기준(paymentScopeFor): 대표·매니저는 모두,
   * 중개사는 담당(맡은 비중이 있는 DealParticipant)으로 들어간 거래의 수수료만 본다.
   * 담당이 아닌 거래는 청구·요약·조정을 비우고 commissionHidden 으로 알린다. 다른 직원의 몫(%)·배분 금액도 비운다.
   * viewer 를 넘기지 않은 내부 호출은 그대로 둔다.
   */
  forViewer<
    T extends {
      participants: Array<{ userId: string; sharePercent: number | null; commissionRate: unknown; commissionAmount: number | null }>;
      commissionPayments: unknown[];
      commissionSummary: unknown;
    },
  >(deal: T, viewer?: FinanceViewer): T & { commissionHidden?: boolean } {
    if (!viewer || seesAllPayments(viewer)) return deal;
    const participants = deal.participants.map((participant) =>
      participant.userId === viewer.userId
        ? participant
        : { ...participant, commissionRate: null, commissionAmount: null },
    );
    const assigned = deal.participants.some(
      (participant) => participant.userId === viewer.userId && participant.sharePercent != null,
    );
    if (assigned) return { ...deal, participants };
    return {
      ...deal,
      participants,
      commissionPayments: [],
      commissionSummary: null,
      commissionHidden: true,
    };
  }

  async findAll(officeId: string, activeOnly = false, viewer?: FinanceViewer) {
    const deals = await this.prisma.deal.findMany({
      where: { officeId, ...(activeOnly && { isCancelled: false, stage: { not: 'closed' } }) },
      include: this.dealInclude,
      orderBy: { createdAt: 'desc' },
    });

    return deals.map((deal) => this.forViewer(this.withPropertyContext(deal), viewer));
  }

  async findArchive(
    officeId: string,
    kind: 'closed' | 'cancelled',
    query?: string,
    since?: Date,
    cursor?: string,
    viewer?: FinanceViewer,
  ) {
    const cancelled = kind === 'cancelled';
    const dateField = cancelled ? 'cancelledAt' : 'stageChangedAt';
    const search = { contains: query, mode: 'insensitive' as const };
    const rows = await this.prisma.deal.findMany({
      where: {
        officeId,
        isCancelled: cancelled,
        ...(!cancelled && { stage: 'closed' }),
        ...(since && { [dateField]: { gte: since } }),
        ...(query && { OR: [
          { listing: { property: { site: { name: search } } } },
          { buyerContact: { name: search } },
          { sellerContact: { name: search } },
        ] }),
      },
      orderBy: [{ [dateField]: 'desc' }, { id: 'desc' }],
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      take: 31,
      include: this.dealInclude,
    });
    const page = rows.slice(0, 30);
    return {
      items: page.map((row) => this.forViewer(this.withPropertyContext(row), viewer)),
      nextCursor: rows.length > 30 ? page[29].id : null,
    };
  }

  async findOne(id: string, officeId: string, viewer?: FinanceViewer) {
    const deal = await this.prisma.deal.findFirst({
      where: { id, officeId },
      include: this.dealInclude,
    });
    if (!deal) throw new NotFoundException('거래를 찾을 수 없습니다.');
    return this.forViewer(this.withPropertyContext(deal), viewer);
  }

  /**
   * 의뢰 자동 closed의 근거("이 의뢰의 미취소 종결 Deal 보유")가 무너졌으면
   * 의뢰를 open으로 되살린다. 종결 Deal 취소·단계 롤백 후 호출 —
   * 호출 시점에는 해당 변경이 이미 tx 에 반영돼 있어야 한다.
   * 같은 Property에 새 non-closed 의뢰가 있으면 되살리지 않는다.
   */
  private async reopenAutoClosedIntakeIfBasisBroken(
    tx: Prisma.TransactionClient,
    intakeId: string,
  ): Promise<boolean> {
    const remainingDoneDeals = await tx.deal.count({
      where: {
        isCancelled: false,
        stage: { in: [...DONE_STAGES] },
        listing: { intakeId },
      },
    });
    if (remainingDoneDeals > 0) return false; // 여전히 종결 거래가 있음 — closed 유지

    const intakeRow = await tx.listingIntake.findFirst({
      where: { id: intakeId },
      select: { propertyId: true, officeId: true },
    });
    if (!intakeRow) return false;

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
    if (otherNonClosedIntake) return false;

    // Deal 자동화가 closed 처리한 의뢰만 되살린다. 사용자의 수동 종결은 유지한다.
    const reopened = await tx.listingIntake.updateMany({
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
    return reopened.count > 0;
  }

  /**
   * 의뢰 단위 트랜잭션 advisory lock. Deal 생성·단계 전이·취소와
   * 의뢰 생명주기 동기화를 직렬화해 같은 ListingIntake에 미취소
   * Deal 두 건이 동시에 생기는 check-then-write 경주를 막는다.
   */
  private async lockIntakeForLifecycleSync(
    tx: Prisma.TransactionClient,
    intakeId: string,
  ) {
    const lockKey = `listing-intake:${intakeId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0))`;
  }

  /**
   * 의뢰가 지금 닫혀 있지 않은지 트랜잭션 안에서 다시 읽는다. 의뢰 잠금을 잡은 뒤 호출한다.
   * 트랜잭션 전에 읽은 값은 그 사이 의뢰 종료와 겹치면 낡아, 닫힌 의뢰의 매칭을 되살릴 수 있다.
   */
  private async isIntakeOpen(
    tx: Prisma.TransactionClient,
    intakeId: string | null | undefined,
  ) {
    if (!intakeId) return true;
    const intake = await tx.listingIntake.findUnique({
      where: { id: intakeId },
      select: { lifecycleStatus: true },
    });
    return Boolean(intake) && intake!.lifecycleStatus !== IntakeLifecycleStatus.CLOSED;
  }

  /** 거래유형은 sale/jeonse/monthly 3종만 허용 (연세 등 폐기 유형 저장 차단) */
  private assertValidTransactionType(transactionType?: string) {
    if (transactionType === undefined) return;
    const valid = Object.values(TransactionType) as string[];
    if (!valid.includes(transactionType)) {
      throw new BadRequestException('거래유형은 매매·전세·월세 중 하나여야 합니다.');
    }
  }

  private assertValidStage(stage: string) {
    if (!DEAL_STAGE_VALUES.has(stage)) {
      throw new BadRequestException(`지원하지 않는 거래 단계입니다: ${stage}`);
    }
  }

  /**
   * 거래를 만들 때의 담당. 비우면 만든 사람이다. 직원(agent)은 자기만 담당으로 둘 수 있고,
   * 대표·매니저는 같은 사무소의 다른 직원을 고를 수 있다.
   */
  private async resolveAssignee(
    officeId: string,
    requested: string | undefined,
    actor: { userId: string; role: string } | undefined,
  ): Promise<string | null> {
    const canChoose = actor?.role === 'owner' || actor?.role === 'manager';
    const userId = requested && canChoose ? requested : (actor?.userId ?? null);
    if (!userId) return null;
    if (!UUID_PATTERN.test(userId)) {
      throw new BadRequestException('담당 직원을 다시 골라 주세요.');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: userId, officeId, isActive: true },
      select: { id: true },
    });
    if (!user) {
      // 만든 사람이 사무소 직원이 아니면(시스템·MCP 등) 담당 없이 만든다
      if (userId === actor?.userId && !requested) return null;
      throw new BadRequestException('우리 사무소 직원만 담당으로 정할 수 있습니다.');
    }
    return user.id;
  }

  /**
   * 거래의 담당을 한 사람으로 바꾼다 (맡은 비중 100). 수수료/정산에서 여러 사람으로 나눠 둔
   * 거래는 여기서 바꾸지 않는다 — 나눈 비중이 사라지기 때문이다.
   */
  async setAssignee(id: string, officeId: string, dto: { userId?: string }) {
    if (!dto.userId || !UUID_PATTERN.test(dto.userId)) {
      throw new BadRequestException('담당 직원을 골라 주세요.');
    }
    const userId = dto.userId;
    await this.prisma.$transaction(async (tx) => {
      // 수수료/정산의 담당 배분과 동시에 고치지 않게 거래 줄을 잠근다 (settlement 와 같은 잠금)
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM deals WHERE id = ${id}::uuid AND office_id = ${officeId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('거래를 찾을 수 없습니다.');
      const user = await tx.user.findFirst({
        where: { id: userId, officeId, isActive: true },
        select: { id: true },
      });
      if (!user) throw new BadRequestException('우리 사무소 직원만 담당으로 정할 수 있습니다.');
      const participants = await tx.dealParticipant.findMany({
        where: { officeId, dealId: id },
        orderBy: { createdAt: 'asc' },
      });
      const sharing = participants.filter((participant) => participant.sharePercent != null);
      if (sharing.length > 1) {
        throw new ConflictException(
          '담당이 여러 명으로 나뉘어 있습니다. 수수료/정산의 담당 배분에서 바꿔 주세요.',
        );
      }
      await tx.dealParticipant.updateMany({
        where: { officeId, dealId: id },
        data: { sharePercent: null, commissionRate: null },
      });
      const existing = participants.find((participant) => participant.userId === userId);
      if (existing) {
        await tx.dealParticipant.update({
          where: { id: existing.id },
          data: { sharePercent: 100 },
        });
      } else {
        await tx.dealParticipant.create({
          data: {
            officeId,
            dealId: id,
            userId,
            role: 'dual_agent',
            side: 'both',
            sharePercent: 100,
          },
        });
      }
    });
    return this.findOne(id, officeId);
  }

  /** 합의 금액 칸은 만원 단위 0 이상 정수다. */
  private assertDealAmounts(dto: {
    agreedPrice?: number | null;
    agreedDeposit?: number | null;
    agreedMonthlyRent?: number | null;
  }) {
    assertManwon(dto.agreedPrice, '합의 금액');
    assertManwon(dto.agreedDeposit, '보증금');
    assertManwon(dto.agreedMonthlyRent, '월세');
  }

  /** 당사자·파트너가 같은 사무소의 것인지 확인한다. 비운 값은 통과한다. */
  private async assertPartiesInOffice(
    officeId: string,
    dto: {
      buyerContactId?: string | null;
      sellerContactId?: string | null;
      partnerBrokerId?: string | null;
    },
  ) {
    const contactIds = [dto.buyerContactId, dto.sellerContactId].filter(
      (value): value is string => Boolean(value),
    );
    // 형식이 틀린 id는 DB까지 가면 500이 난다
    for (const value of [...contactIds, dto.partnerBrokerId]) {
      if (value && !UUID_PATTERN.test(value)) {
        throw new BadRequestException('고른 연락처나 파트너를 다시 골라 주세요.');
      }
    }
    if (contactIds.length > 0) {
      const found = await this.prisma.contact.count({
        where: { officeId, id: { in: [...new Set(contactIds)] } },
      });
      if (found !== new Set(contactIds).size) {
        throw new NotFoundException('고른 연락처를 찾을 수 없습니다.');
      }
    }
    if (dto.partnerBrokerId) {
      const partner = await this.prisma.partnerBroker.findFirst({
        where: { officeId, id: dto.partnerBrokerId },
        select: { id: true },
      });
      if (!partner) throw new NotFoundException('고른 파트너 중개사를 찾을 수 없습니다.');
    }
  }

  /**
   * 거래가 어느 구매 의뢰의 것인지 정한다. 매칭에서 전환한 거래는 그 매칭의
   * 희망조건이 속한 의뢰다. 매칭 없이 만든 거래(공동중개로 다른 사무소 매물을 살 때)는
   * 사용자가 고른 의뢰를 쓰고, 구매 의뢰 없이 바로 계약한 거래는 비워 둔다.
   */
  private async resolveBuyerIntakeId(
    tx: Pick<Prisma.TransactionClient, 'match' | 'buyerIntake'>,
    officeId: string,
    dto: { matchId?: string; buyerIntakeId?: string },
  ): Promise<string | null> {
    if (dto.matchId) {
      const match = await tx.match.findFirst({
        where: { id: dto.matchId, officeId },
        select: { buyerRequirement: { select: { buyerIntakeId: true } } },
      });
      if (match) return match.buyerRequirement.buyerIntakeId;
    }
    if (!dto.buyerIntakeId) return null;
    const intake = await tx.buyerIntake.findFirst({
      where: { id: dto.buyerIntakeId, officeId },
      select: { id: true },
    });
    if (!intake) throw new NotFoundException('구매 의뢰를 찾을 수 없습니다.');
    return intake.id;
  }

  /**
   * 거래로 넘기는 매칭을 확인하고, 화면의 거래 전환 창이 미리 채우는 당사자(매칭의 손님 · 물건의 대표 소유자)를 읽는다.
   * 받은 matchId를 그대로 저장하면 다른 매물의 매칭이 거래에 붙을 수 있으므로 같은 매물의 매칭인지 본다.
   */
  private async resolveSourceMatch(
    officeId: string,
    matchId: string,
    listingId: string | null | undefined,
  ): Promise<{ buyerContactId: string | null; sellerContactId: string | null }> {
    if (!UUID_PATTERN.test(matchId)) {
      throw new BadRequestException('매칭을 다시 골라 주세요.');
    }
    const match = await this.prisma.match.findFirst({
      where: { id: matchId, officeId },
      select: {
        listingId: true,
        stage: true,
        buyerRequirement: {
          select: {
            status: true,
            buyerIntake: {
              select: {
                lifecycleStatus: true,
                contacts: {
                  select: { contactId: true },
                  orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
                  take: 1,
                },
              },
            },
          },
        },
        listing: {
          select: {
            property: {
              select: {
                propertyContacts: {
                  where: {
                    status: 'active',
                    role: { in: ['owner', 'co_owner', 'representative'] },
                  },
                  select: { contactId: true },
                  orderBy: { isPrimary: 'desc' },
                  take: 1,
                },
              },
            },
          },
        },
      },
    });
    if (!match) throw new NotFoundException('매칭을 찾을 수 없습니다.');
    if (match.listingId !== listingId) {
      throw new BadRequestException('이 매물의 매칭이 아닙니다. 매칭을 다시 골라 주세요.');
    }
    // 종료한 매칭을 거래가 조용히 되살리지 않는다. 다시 진행하려면 사람이 먼저 매칭을 연다.
    if (normalizeMatchStage(match.stage) === MatchStage.CLOSED) {
      throw new ConflictException('종료한 매칭입니다. 매칭을 다시 연 뒤 거래를 만들어 주세요');
    }
    // 매칭 단계를 바꿀 때와 같은 기준: 완료한 손님 · 종료한 구매 의뢰의 매칭은 다시 진행하지 않는다
    if (match.buyerRequirement.status === 'completed') {
      throw new ConflictException(
        '완료한 희망 조건의 매칭입니다. 고객 상태를 활성으로 바꾼 뒤 다시 시작해 주세요',
      );
    }
    if (match.buyerRequirement.buyerIntake.lifecycleStatus === IntakeLifecycleStatus.CLOSED) {
      throw new ConflictException(
        '종료한 구매 의뢰의 매칭입니다. 구매 의뢰를 다시 연 뒤 진행해 주세요',
      );
    }
    return {
      buyerContactId: match.buyerRequirement.buyerIntake.contacts[0]?.contactId ?? null,
      sellerContactId: match.listing.property?.propertyContacts[0]?.contactId ?? null,
    };
  }

  async create(
    officeId: string,
    dto: {
      propertyId?: string;
      listingId?: string;
      matchId?: string;
      /** 매칭 없이 만드는 거래가 어느 구매 의뢰의 것인지. 매칭이 있으면 무시한다. */
      buyerIntakeId?: string;
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
      /** 담당 직원. 비우면 만든 사람. 대표·매니저만 다른 직원을 고를 수 있다. */
      assigneeUserId?: string;
    },
    actor?: { userId: string; role: string },
  ) {
    this.assertValidTransactionType(dto.transactionType);
    const assigneeUserId = await this.resolveAssignee(officeId, dto.assigneeUserId, actor);
    this.assertDealAmounts(dto);
    const agreedMoveInDate = parseDateInput(dto.agreedMoveInDate, '입주 예정일');
    await this.assertPartiesInOffice(officeId, dto);
    const { listingId, intakeId, transactionType, siteType } =
      await this.resolveListing(officeId, dto);
    // listing에서 유도된 값도 방어적으로 확인 (과거 데이터가 남아있는 경우 차단)
    this.assertValidTransactionType(transactionType);

    const ourSide = dto.ourSide ?? 'both';

    // 매칭에서 넘어온 거래: 당사자를 안 받았으면 매칭의 손님과 물건의 대표 소유자로 채운다.
    // (화면의 전환 창은 이 값을 보내지만 MCP는 보내지 않아 거래와 수수료 청구의 납부자가 비었다)
    const sourceMatch = dto.matchId
      ? await this.resolveSourceMatch(officeId, dto.matchId, listingId)
      : null;
    const buyerContactId = dto.buyerContactId ?? sourceMatch?.buyerContactId ?? undefined;
    const sellerContactId = dto.sellerContactId ?? sourceMatch?.sellerContactId ?? undefined;

    const deal = await this.prisma.$transaction(async (tx) => {
      if (intakeId) {
        await this.lockIntakeForLifecycleSync(tx, intakeId);
        const conflicting = await tx.deal.findFirst({
          where: {
            officeId,
            isCancelled: false,
            stage: { in: [...OCCUPYING_DEAL_STAGES] },
            listing: { intakeId },
          },
          select: { id: true, stage: true },
        });
        if (conflicting) {
          throw new BadRequestException(
            `이 의뢰에 이미 진행 중인 거래가 있습니다 (${stageLabel(normalizeDealStage(conflicting.stage))}). ` +
              '기존 거래를 취소한 뒤 진행하세요.',
          );
        }
      }

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
          throw new NotFoundException('매물(거래 조건)을 찾을 수 없습니다.');
        }
        if (
          listingToResume.intake.lifecycleStatus ===
          IntakeLifecycleStatus.CLOSED
        ) {
          throw new BadRequestException(
            '종료된 매물 의뢰로는 거래를 만들 수 없습니다.',
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

      const buyerIntakeId = await this.resolveBuyerIntakeId(tx, officeId, dto);

      const created = await tx.deal.create({
        data: {
          officeId,
          listingId,
          matchId: dto.matchId,
          buyerIntakeId,
          stage: DealStage.PREPARING,
          transactionType,
          agreedPrice: dto.agreedPrice,
          agreedDeposit: dto.agreedDeposit,
          agreedMonthlyRent: dto.agreedMonthlyRent,
          agreedMoveInDate: agreedMoveInDate ?? undefined,
          specialTerms: dto.specialTerms,
          buyerContactId,
          sellerContactId,
          isJointBrokerage: dto.isJointBrokerage ?? false,
          ourSide,
          partnerBrokerId: dto.isJointBrokerage ? dto.partnerBrokerId : undefined,
          memo: dto.memo,
        },
      });

      // 담당 직원(기본은 만든 사람). 직원 정산은 sharePercent가 있는 담당만 계산하므로 100으로 둔다.
      if (assigneeUserId) {
        await tx.dealParticipant.create({
          data: {
            officeId,
            dealId: created.id,
            userId: assigneeUserId,
            role: 'dual_agent',
            side: 'both',
            sharePercent: 100,
          },
        });
      }

      // 합의가가 있으면 CommissionPayment 자동 생성
      await this.autoGenerateCommissionPayments(tx, {
        dealId: created.id,
        officeId,
        transactionType,
        siteType,
        agreedPrice: dto.agreedPrice,
        agreedDeposit: dto.agreedDeposit,
        agreedMonthlyRent: dto.agreedMonthlyRent,
        buyerContactId,
        sellerContactId,
        isJointBrokerage: dto.isJointBrokerage ?? false,
        ourSide,
        partnerBrokerId: dto.partnerBrokerId,
      });

      // "거래 전환"은 사람이 올리는 단계가 아니라 거래가 연결됐다는 사실이다. 거래를 만드는 자리에서 함께 옮긴다
      // (따로 부르게 두면 거래는 있는데 매칭은 예전 단계에 남는다).
      if (dto.matchId) {
        // 앞의 확인과 이 자리 사이에 매칭이 종료될 수 있다(다른 직원의 종료, 다른 거래의 본계약으로 인한 자동 종료).
        // 조건을 붙여 옮기고, 옮기지 못했으면 거래까지 되돌린다 — 종료 이유를 지우며 되살리지 않는다.
        const moved = await tx.match.updateMany({
          where: {
            id: dto.matchId,
            officeId,
            stage: { not: MatchStage.CLOSED },
            buyerRequirement: {
              status: { not: 'completed' },
              buyerIntake: { lifecycleStatus: { not: IntakeLifecycleStatus.CLOSED } },
            },
          },
          data: { stage: MatchStage.DEAL_CREATED },
        });
        if (moved.count === 0) {
          throw new ConflictException(
            '그사이 매칭이 종료되어 거래를 만들지 않았습니다. 매칭을 확인한 뒤 다시 시도해 주세요',
          );
        }
      }

      return tx.deal.findUnique({
        where: { id: created.id },
        include: this.dealInclude,
      });
    });

    if (!deal) throw new NotFoundException('거래를 만들지 못했습니다.');
    return this.withPropertyContext(deal);
  }

  /**
   * Deal 생성 시 법정 요율에 맞춰 CommissionPayment 를 자동 생성한다.
   * 공동중개에서 우리 담당 측만 생성 (상대측은 파트너 사무소가 자기 DB 에 관리).
   * CommissionDistribution 도 기본값 (우리 100%) 으로 동반 생성.
   *
   * 기준 금액이 0 또는 null 이면 생성을 건너뛴다. 나중에 합의 금액을 넣으면
   * syncAutoCommission 이 그때 만든다.
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
      /** 본계약 이후에 만들면 바로 수금 대기(pending)로 둔다 */
      status?: 'draft' | 'pending';
      dueDate?: Date | null;
    },
  ) {
    const auto = computeAutoCommission({
      transactionType: args.transactionType,
      siteType: args.siteType ?? null,
      agreedPrice: args.agreedPrice ?? null,
      agreedDeposit: args.agreedDeposit ?? null,
      agreedMonthlyRent: args.agreedMonthlyRent ?? null,
      isJointBrokerage: args.isJointBrokerage,
      ourSide: args.ourSide,
      buyerContactId: args.buyerContactId ?? null,
      sellerContactId: args.sellerContactId ?? null,
    });
    if (!auto) return;

    for (const side of auto.sides) {
      await this.createCommissionPayment(tx, {
        officeId: args.officeId,
        dealId: args.dealId,
        side,
        payerContactId:
          side === 'seller' ? args.sellerContactId : args.buyerContactId,
        baseAmount: auto.base,
        rate: auto.rate,
        amount: auto.amount,
        status: args.status ?? 'draft',
        dueDate: args.dueDate ?? null,
      });
    }
  }

  /** 수수료 청구 한 건과 기본 분배(우리 사무소 100%)를 만든다. */
  private async createCommissionPayment(
    tx: Prisma.TransactionClient,
    args: {
      officeId: string;
      dealId: string;
      side: CommissionSide;
      payerContactId?: string | null;
      baseAmount: number;
      rate: number;
      amount: number;
      status: 'draft' | 'pending';
      dueDate?: Date | null;
    },
  ) {
    const payment = await tx.commissionPayment.create({
      data: {
        officeId: args.officeId,
        dealId: args.dealId,
        code: await this.nextCommissionCode(tx, args.officeId),
        clientSide: args.side,
        collectedByOffice: 'us',
        payerContactId: args.payerContactId ?? null,
        baseAmount: args.baseAmount,
        rate: new Prisma.Decimal(args.rate),
        expectedAmount: args.amount,
        status: args.status,
        dueDate: args.dueDate ?? undefined,
      },
    });
    await tx.commissionDistribution.create({
      data: {
        officeId: args.officeId,
        paymentId: payment.id,
        recipientType: 'our_office',
        shareRatio: new Prisma.Decimal(100),
        shareAmount: args.amount,
      },
    });
    return payment;
  }

  /** 수수료 청구 금액이 바뀐 뒤 분배 금액을 다시 나눈다 — 수금 화면과 같은 규칙(줄마다 내림, 남는 만원은 우리 몫, 정산한 줄은 그대로). */
  private recomputeDistributions(tx: Prisma.TransactionClient, paymentId: string) {
    return recomputeShareAmounts(tx, paymentId);
  }

  /**
   * CommissionPayment code 생성: "P-YYMM-NN". 그 달 번호 가운데 가장 큰 수 + 1.
   * 건수 + 1로 만들면 청구를 지운 뒤나 동시에 만들 때 번호가 겹친다. DB에 유일 제약이 없으므로
   * 사무소·달 단위로 트랜잭션 잠금을 잡고 정한다 (같은 트랜잭션 안의 두 번째 청구는 첫 청구를 보고 +1).
   */
  private async nextCommissionCode(
    tx: Prisma.TransactionClient,
    officeId: string,
  ): Promise<string> {
    // 달은 한국 시간으로 정한다 (서버가 UTC면 매월 1일 0~9시에 지난달 번호가 나온다)
    const [year, month] = seoulDay(new Date()).split('-');
    const prefix = `P-${year.slice(2)}${month}`;
    const lockKey = `commission-code:${officeId}:${prefix}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}::text, 0))`;
    const rows = await tx.commissionPayment.findMany({
      where: { officeId, code: { startsWith: `${prefix}-` } },
      select: { code: true },
    });
    // 문자 정렬이 아니라 숫자로 비교한다 ("P-2611-9" < "P-2611-10"). 옛 "P-YYMM-NN-NN" 꼴은 앞 번호를 본다.
    const largest = rows.reduce((max, row) => {
      const match = row.code?.slice(prefix.length + 1).match(/^(\d+)/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${prefix}-${String(largest + 1).padStart(2, '0')}`;
  }

  /**
   * 합의 조건(금액·공동중개·당사자)이 바뀐 뒤 자동으로 만든 수수료 청구를 새 조건에 맞춘다.
   *
   * - 청구가 아직 없고 새 조건으로 계산되면 만든다 (금액 없이 만든 거래에 나중에 금액을 넣은 경우).
   * - 이미 있는 청구는 "손대지 않은 자동 청구"일 때만 고친다: 이전 조건으로 계산한 값과 같고,
   *   입금·조정 기록이 없고, 분배가 기본값(우리 100%)인 경우. 사람이 금액이나 분배를 정했거나
   *   돈이 오간 청구는 그대로 둔다 (수금/정산 화면에서 고친다).
   *
   * 반환: 'synced' 맞췄음, 'kept' 손댄 청구가 있어 그대로 둠, 'none' 할 일 없음.
   */
  private async syncAutoCommission(
    tx: Prisma.TransactionClient,
    args: {
      dealId: string;
      officeId: string;
      stage: string;
      before: CommissionTerms;
      after: CommissionTerms;
    },
  ): Promise<'synced' | 'kept' | 'none'> {
    const payments = await tx.commissionPayment.findMany({
      where: { dealId: args.dealId, officeId: args.officeId },
      include: {
        distributions: true,
        // 취소한 입금, 반려한 조정은 "손댄 것"으로 세지 않는다
        _count: {
          select: {
            receipts: { where: { voidedAt: null } },
            adjustments: { where: { status: { not: 'rejected' } } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const prev = computeAutoCommission(args.before);
    const next = computeAutoCommission(args.after);
    const status = CONTRACTED_OR_LATER_STAGES.has(args.stage) ? 'pending' : 'draft';

    if (payments.length === 0) {
      if (!next) return 'none';
      await this.autoGenerateCommissionPayments(tx, {
        dealId: args.dealId,
        officeId: args.officeId,
        transactionType: args.after.transactionType,
        siteType: args.after.siteType,
        agreedPrice: args.after.agreedPrice,
        agreedDeposit: args.after.agreedDeposit,
        agreedMonthlyRent: args.after.agreedMonthlyRent,
        buyerContactId: args.after.buyerContactId,
        sellerContactId: args.after.sellerContactId,
        isJointBrokerage: args.after.isJointBrokerage,
        ourSide: (args.after.ourSide ?? 'both') as 'seller' | 'buyer' | 'both',
        status,
      });
      return 'synced';
    }

    const untouched =
      prev !== null &&
      payments.every(
        (payment) =>
          (payment.status === 'draft' || payment.status === 'pending') &&
          payment.actualAmount == null &&
          payment._count.receipts === 0 &&
          payment._count.adjustments === 0 &&
          payment.baseAmount === prev.base &&
          payment.rate != null &&
          Number(payment.rate) === prev.rate &&
          // 내림으로 바꾸기 전에 자동으로 만든 청구(반올림 금액)도 자동 청구로 본다
          (payment.expectedAmount === prev.amount ||
            payment.expectedAmount === prev.legacyAmount) &&
          (prev.sides as string[]).includes(payment.clientSide) &&
          payment.distributions.length === 1 &&
          payment.distributions[0].recipientType === 'our_office' &&
          Number(payment.distributions[0].shareRatio) === 100,
      );
    if (!untouched) return 'kept';

    const nothingChanged =
      next !== null &&
      next.base === prev.base &&
      next.rate === prev.rate &&
      next.amount === prev.amount &&
      // 예전 반올림 금액으로 남아 있는 청구는 조건이 같아도 지금 계산(법정 상한 이내)으로 맞춘다
      payments.every((payment) => payment.expectedAmount === next.amount) &&
      next.sides.length === payments.length &&
      payments.every((payment) =>
        (next.sides as string[]).includes(payment.clientSide),
      ) &&
      args.before.buyerContactId === args.after.buyerContactId &&
      args.before.sellerContactId === args.after.sellerContactId;
    if (nothingChanged) return 'none';

    for (const payment of payments) {
      if (!next || !(next.sides as string[]).includes(payment.clientSide)) {
        // 분배는 onDelete: Cascade 로 같이 지워진다.
        await tx.commissionPayment.delete({ where: { id: payment.id } });
        continue;
      }
      await tx.commissionPayment.update({
        where: { id: payment.id },
        data: {
          baseAmount: next.base,
          rate: new Prisma.Decimal(next.rate),
          expectedAmount: next.amount,
          payerContactId:
            payment.clientSide === 'seller'
              ? args.after.sellerContactId
              : args.after.buyerContactId,
        },
      });
      await this.recomputeDistributions(tx, payment.id);
    }

    if (next) {
      const existingSides = new Set(payments.map((payment) => payment.clientSide));
      for (const side of next.sides) {
        if (existingSides.has(side)) continue;
        await this.createCommissionPayment(tx, {
          officeId: args.officeId,
          dealId: args.dealId,
          side,
          payerContactId:
            side === 'seller' ? args.after.sellerContactId : args.after.buyerContactId,
          baseAmount: next.base,
          rate: next.rate,
          amount: next.amount,
          status: payments[0].status === 'pending' ? 'pending' : status,
          dueDate: payments[0].dueDate,
        });
      }
    }
    return 'synced';
  }

  /** 거래 행에서 수수료 계산 조건을 꺼낸다. */
  private commissionTermsOf(deal: {
    transactionType: string;
    agreedPrice: number | null;
    agreedDeposit: number | null;
    agreedMonthlyRent: number | null;
    isJointBrokerage: boolean;
    ourSide: string | null;
    buyerContactId: string | null;
    sellerContactId: string | null;
    listing?: { property?: { site?: { type: string } | null } | null } | null;
  }): CommissionTerms {
    return {
      transactionType: deal.transactionType,
      siteType: deal.listing?.property?.site?.type ?? null,
      agreedPrice: deal.agreedPrice,
      agreedDeposit: deal.agreedDeposit,
      agreedMonthlyRent: deal.agreedMonthlyRent,
      isJointBrokerage: deal.isJointBrokerage,
      ourSide: deal.ourSide,
      buyerContactId: deal.buyerContactId,
      sellerContactId: deal.sellerContactId,
    };
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
    const requestedStage = normalizeDealStage(dto.stage);
    this.assertValidStage(requestedStage);

    this.assertDealAmounts(dto);
    const existing = await this.findOne(id, officeId);
    const existingStage = normalizeDealStage(existing.stage);
    const stageChanged = requestedStage !== existingStage;

    if (stageChanged && existing.isCancelled) {
      throw new ConflictException(
        '취소된 거래는 단계를 바꿀 수 없습니다. 먼저 거래를 되살려 주세요.',
      );
    }
    if (
      existing.isCancelled &&
      (dto.agreedPrice !== undefined || dto.agreedDeposit !== undefined || dto.agreedMonthlyRent !== undefined)
    ) {
      throw new ConflictException('취소된 거래는 조건을 고칠 수 없습니다. 먼저 거래를 되살려 주세요.');
    }

    // 본계약 단계에서 계약서를 작성하므로 settling 진입부터 Contract 필수
    if (stageChanged && CONTRACT_REQUIRED_STAGES.has(requestedStage)) {
      const contract = await this.prisma.contract.findUnique({
        where: { dealId: id },
        select: { id: true },
      });
      if (!contract) {
        throw new BadRequestException(
          `계약서를 먼저 작성해야 '${stageLabel(requestedStage)}' 단계로 넘길 수 있습니다. ` +
            '거래 상세의 대금·계약 탭에서 계약서를 작성해 주세요.',
        );
      }
    }

    // 같은 의뢰의 매매·전세·월세 Listing은 서로 대안이다.
    // 단계를 바꾸는 동안에도 의뢰 전체에 미취소 Deal은 하나만 허용한다.
    const shouldCheckIntakeDealUniqueness =
      stageChanged &&
      !existing.isCancelled &&
      Boolean(existing.listing?.intakeId);

    // 본계약 이후 단계에 들어서면 draft 수수료 청구를 pending 으로 확정하고
    // 계약서 잔금일이 있으면 dueDate 기본값으로 둔다. (아래 enteringContractedOrLater)

    const enteringDone =
      stageChanged &&
      !existing.isCancelled &&
      DONE_STAGES.has(requestedStage) &&
      !DONE_STAGES.has(existingStage);

    // 종결 단계에서 되돌아 나가는 전이 (completed → settling 등) —
    // 이 Deal이 의뢰를 자동 closed 처리했을 수 있으므로 커밋 후 재평가한다.
    const leavingDone =
      stageChanged &&
      !existing.isCancelled &&
      !DONE_STAGES.has(requestedStage) &&
      DONE_STAGES.has(existingStage);

    // 본계약 진입: 같은 거래 조건의 다른 손님 매칭을 자동 종료한다.
    // 본계약 전으로 되돌아가면 이 거래가 닫은 매칭을 되살린다.
    const enteringContractedOrLater =
      stageChanged &&
      !existing.isCancelled &&
      CONTRACTED_OR_LATER_STAGES.has(requestedStage) &&
      !CONTRACTED_OR_LATER_STAGES.has(existingStage);
    const leavingContractedOrLater =
      stageChanged &&
      !existing.isCancelled &&
      !CONTRACTED_OR_LATER_STAGES.has(requestedStage) &&
      CONTRACTED_OR_LATER_STAGES.has(existingStage);

    const deal = await this.prisma.$transaction(async (tx) => {
      if (shouldCheckIntakeDealUniqueness && existing.listing?.intakeId) {
        await this.lockIntakeForLifecycleSync(tx, existing.listing.intakeId);
        const conflicting = await tx.deal.findFirst({
          where: {
            officeId,
            id: { not: id },
            isCancelled: false,
            stage: { in: [...OCCUPYING_DEAL_STAGES] },
            listing: { intakeId: existing.listing.intakeId },
          },
          select: { id: true, stage: true },
        });
        if (conflicting) {
          throw new BadRequestException(
            `이 의뢰에 이미 진행 중인 거래가 있습니다 (${stageLabel(normalizeDealStage(conflicting.stage))}). ` +
              '기존 거래를 취소한 뒤 진행하세요.',
          );
        }
      }

      if (
        (enteringDone || leavingDone) &&
        existing.listing?.intakeId &&
        !shouldCheckIntakeDealUniqueness
      ) {
        await this.lockIntakeForLifecycleSync(tx, existing.listing.intakeId);
      }

      // 본계약을 건너뛰어 중도금/잔금·잔금 완료로 바로 가도 청구는 확정(수금 대기)되어야 한다
      if (enteringContractedOrLater) {
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
      // "이 의뢰가 거래중/종료" 는 비취소 Deal 에서 파생하므로
      // Listing/Intake에 별도의 거래 상태를 저장하지 않는다.
      //
      // 본계약 진입: 같은 거래 조건의 다른 손님 매칭을 먼저 "다른 손님과 본계약"으로 닫는다.
      // (의뢰 종료보다 먼저 해야 가계약 → 완료처럼 건너뛰어도 이유가 맞고, 완료에서 본계약으로
      // 되돌아갈 때 의뢰 종료 매칭만 되살아난다.)
      if (enteringContractedOrLater && existing.listingId) {
        await closeCompetingMatchesForDeal(tx, {
          id,
          officeId,
          listingId: existing.listingId,
          matchId: existing.matchId ?? null,
        });
      }

      // completed/closed 진입: 해당 Deal이 성사된 거래이므로 의뢰 전체를 종료.
      if (enteringDone && existing.listing?.intakeId) {
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
        // 의뢰가 끝났으니 남은 진행 중 매칭도 닫는다. 이 거래를 남겨 거래가 되돌려지면 되살린다.
        await closeOpenMatchesForIntake(tx, {
          officeId,
          intakeId: existing.listing.intakeId,
          dealId: id,
        });
      }

      let updated = await tx.deal.update({
        where: { id },
        data: {
          stage: requestedStage,
          stageChangedAt: stageChanged ? new Date() : undefined,
          agreedPrice: dto.agreedPrice,
          agreedDeposit: dto.agreedDeposit,
          agreedMonthlyRent: dto.agreedMonthlyRent,
          memo: dto.memo,
        },
        include: this.dealInclude,
      });

      // 합의 금액이 바뀌었으면 자동 수수료 청구도 새 금액에 맞춘다.
      const amountsGiven =
        dto.agreedPrice !== undefined ||
        dto.agreedDeposit !== undefined ||
        dto.agreedMonthlyRent !== undefined;
      if (amountsGiven && !existing.isCancelled) {
        const synced = await this.syncAutoCommission(tx, {
          dealId: id,
          officeId,
          stage: requestedStage,
          before: this.commissionTermsOf(existing),
          after: this.commissionTermsOf(updated),
        });
        if (synced === 'synced') {
          updated = await tx.deal.findUniqueOrThrow({
            where: { id },
            include: this.dealInclude,
          });
        }
      }

      // 종결 근거가 사라졌으면 (이 Deal 이 done 단계에서 빠져나감) 의뢰 재평가
      let intakeReopened = false;
      if (leavingDone && existing.listing?.intakeId) {
        intakeReopened = await this.reopenAutoClosedIntakeIfBasisBroken(
          tx,
          existing.listing.intakeId,
        );
        // 의뢰가 다시 열렸으면 의뢰 종료로 닫았던 매칭을 되살린다.
        // 거래가 아직 본계약 이후면 그 거래 조건의 매칭은 닫아 둔다.
        if (intakeReopened) {
          await restoreMatchesClosedByDeal(tx, {
            officeId,
            dealId: id,
            reasons: [MatchClosedReason.INTAKE_CLOSED],
            excludeListingId: CONTRACTED_OR_LATER_STAGES.has(requestedStage)
              ? existing.listingId
              : null,
          });
        }
      }

      if (leavingContractedOrLater) {
        // 의뢰가 닫힌 채면(매물이 끝남) 되살리지 않는다. 잠금 안에서 최신 상태로 판단한다.
        const intakeOpen = await this.isIntakeOpen(
          tx,
          existing.listing?.intakeId,
        );
        // 본계약 전으로 내려왔고 의뢰가 열려 있으면 이 거래가 닫은 매칭의 근거가 모두 사라졌다.
        // "의뢰 종료"로 닫혔다가 본계약 중이라 남겨 둔 같은 거래 조건 매칭도 여기서 되살린다.
        if (intakeOpen) {
          await restoreMatchesClosedByDeal(tx, {
            officeId,
            dealId: id,
            reasons: [
              MatchClosedReason.OTHER_BUYER_CONTRACTED,
              MatchClosedReason.INTAKE_CLOSED,
            ],
          });
        }
      }

      return updated;
    });

    return this.withPropertyContext(deal);
  }

  /**
   * 이미 만든 거래를 구매 의뢰에 잇거나 끊는다. 매칭 없이 만든 거래(공동중개로 다른
   * 사무소 매물을 산 경우)를 나중에 그 손님의 구매 의뢰에 연결할 때 쓴다.
   * 매칭에서 전환한 거래는 매칭이 정한 의뢰를 바꾸지 못한다.
   */
  async setBuyerIntake(
    id: string,
    officeId: string,
    dto: { buyerIntakeId?: string | null },
  ) {
    const existing = await this.prisma.deal.findFirst({
      where: { id, officeId },
      select: { id: true, matchId: true },
    });
    if (!existing) throw new NotFoundException('거래를 찾을 수 없습니다.');
    if (existing.matchId) {
      throw new BadRequestException(
        '매칭에서 전환한 거래의 구매 의뢰는 바꿀 수 없습니다.',
      );
    }
    const buyerIntakeId = dto.buyerIntakeId
      ? await this.resolveBuyerIntakeId(this.prisma, officeId, {
          buyerIntakeId: dto.buyerIntakeId,
        })
      : null;
    await this.prisma.deal.update({ where: { id }, data: { buyerIntakeId } });
    return this.findOne(id, officeId);
  }

  /**
   * 거래 조건 고치기: 당사자, 합의 금액, 입주 예정일, 특약, 메모, 공동중개.
   * 단계는 updateStage 로만 바꾼다. 금액·공동중개·당사자가 바뀌면 손대지 않은 자동 수수료 청구를 맞춘다.
   * 응답의 commissionNotice 가 'kept' 면 사람이 정한 수수료가 있어 그대로 두었다는 뜻이다.
   */
  async update(
    id: string,
    officeId: string,
    dto: {
      buyerContactId?: string | null;
      sellerContactId?: string | null;
      agreedPrice?: number | null;
      agreedDeposit?: number | null;
      agreedMonthlyRent?: number | null;
      agreedMoveInDate?: string | null;
      specialTerms?: string | null;
      memo?: string | null;
      isJointBrokerage?: boolean;
      ourSide?: 'seller' | 'buyer' | 'both';
      partnerBrokerId?: string | null;
    },
  ) {
    this.assertDealAmounts(dto);
    const agreedMoveInDate = parseDateInput(dto.agreedMoveInDate, '입주 예정일');
    if (
      dto.ourSide !== undefined &&
      !['seller', 'buyer', 'both'].includes(dto.ourSide)
    ) {
      throw new BadRequestException('우리 담당 측을 다시 골라 주세요.');
    }
    if (dto.isJointBrokerage !== undefined && typeof dto.isJointBrokerage !== 'boolean') {
      throw new BadRequestException('공동중개 여부를 다시 골라 주세요.');
    }
    await this.assertPartiesInOffice(officeId, dto);
    const existing = await this.findOne(id, officeId);
    if (existing.isCancelled) {
      // 취소한 거래의 금액을 바꾸면 수수료 청구와 어긋난 채 되살아난다
      throw new ConflictException('취소된 거래는 조건을 고칠 수 없습니다. 먼저 거래를 되살려 주세요.');
    }

    const isJoint = dto.isJointBrokerage ?? existing.isJointBrokerage;
    const text = (value: string | null | undefined) =>
      value === undefined ? undefined : value?.trim() || null;

    let commissionNotice: 'synced' | 'kept' | 'none' = 'none';
    const deal = await this.prisma.$transaction(async (tx) => {
      let updated = await tx.deal.update({
        where: { id },
        data: {
          buyerContactId: dto.buyerContactId,
          sellerContactId: dto.sellerContactId,
          agreedPrice: dto.agreedPrice,
          agreedDeposit: dto.agreedDeposit,
          agreedMonthlyRent: dto.agreedMonthlyRent,
          agreedMoveInDate,
          specialTerms: text(dto.specialTerms),
          memo: text(dto.memo),
          isJointBrokerage: dto.isJointBrokerage,
          // 단독중개로 돌리면 파트너·담당 측은 의미가 없다
          ourSide: isJoint ? dto.ourSide : 'both',
          partnerBrokerId: isJoint ? dto.partnerBrokerId : null,
        },
        include: this.dealInclude,
      });

      if (!existing.isCancelled) {
        commissionNotice = await this.syncAutoCommission(tx, {
          dealId: id,
          officeId,
          stage: normalizeDealStage(existing.stage),
          before: this.commissionTermsOf(existing),
          after: this.commissionTermsOf(updated),
        });
        if (commissionNotice === 'synced') {
          updated = await tx.deal.findUniqueOrThrow({
            where: { id },
            include: this.dealInclude,
          });
        }
      }
      return updated;
    });

    return { ...this.withPropertyContext(deal), commissionNotice };
  }

  /**
   * 우리 쪽 한 청구(매도측·매수측)의 수수료 금액을 정한다. 법정 상한은 기본이고,
   * 손님과 합의한 금액은 여기서 적는다. 법정 상한을 넘게는 적을 수 없다.
   * 입금 기록이 생긴 청구는 수금/정산 화면에서 조정한다.
   */
  async setCommission(
    id: string,
    officeId: string,
    dto: { side?: string; amount?: number; propertyKind?: string },
  ) {
    if (dto.side !== 'seller' && dto.side !== 'buyer') {
      throw new BadRequestException('매도측·매수측 중 어느 쪽 수수료인지 골라 주세요.');
    }
    const side: CommissionSide = dto.side;
    if (dto.amount === undefined || dto.amount === null) {
      throw new BadRequestException('수수료 금액을 입력해 주세요.');
    }
    assertManwon(dto.amount, '수수료');
    if (dto.propertyKind !== undefined && !COMMISSION_PROPERTY_KINDS.has(dto.propertyKind)) {
      throw new BadRequestException('물건 종류를 다시 골라 주세요.');
    }
    const amount = dto.amount;
    const existing = await this.findOne(id, officeId);
    if (existing.isCancelled) {
      throw new ConflictException('취소된 거래의 수수료는 고칠 수 없습니다.');
    }
    const terms = this.commissionTermsOf(existing);
    const txType = toCommissionTxType(terms.transactionType);
    const base = commissionBaseOf(terms);
    if (!txType || base <= 0) {
      throw new BadRequestException('합의 금액을 먼저 입력해 주세요.');
    }
    if (!ourCommissionSides(terms.isJointBrokerage, terms.ourSide).includes(side)) {
      throw new BadRequestException(
        '공동중개에서 우리 담당이 아닌 쪽입니다. 그쪽 수수료는 상대 중개사가 받습니다.',
      );
    }
    const propertyKind = (dto.propertyKind ??
      (terms.siteType ? siteTypeToCommissionKind(terms.siteType) : 'housing')) as CommissionPropertyKind;
    const legalMax = calculateCommissionAmount(txType, base, propertyKind).amount;
    if (amount > legalMax) {
      throw new BadRequestException(
        `법정 상한(${legalMax.toLocaleString('ko-KR')}만원)보다 많이 받을 수 없습니다.`,
      );
    }
    // 요율은 기록용이다. 만원 금액을 기준 금액으로 나눈 값을 소수 넷째 자리까지 남긴다.
    const rate = Math.round((amount / base) * 100 * 10_000) / 10_000;
    const stage = normalizeDealStage(existing.stage);

    const deal = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.commissionPayment.findFirst({
        where: {
          dealId: id,
          officeId,
          clientSide: side,
          status: { notIn: ['cancelled', 'waived'] },
        },
        include: { distributions: true, _count: { select: { receipts: { where: { voidedAt: null } } } } },
        orderBy: { createdAt: 'asc' },
      });
      if (!payment) {
        // 면제·취소한 청구가 있는 쪽에 새 청구를 만들면 대표 승인 없이 금액을 바꾸는 길이 된다
        const closed = await tx.commissionPayment.findFirst({
          where: { dealId: id, officeId, clientSide: side, status: { in: ['cancelled', 'waived'] } },
          select: { id: true },
        });
        if (closed) {
          throw new ConflictException(
            '이 쪽 수수료는 면제되었거나 취소되어 있습니다. 다시 받으려면 수수료/정산에서 처리해 주세요.',
          );
        }
        await this.createCommissionPayment(tx, {
          officeId,
          dealId: id,
          side,
          payerContactId:
            side === 'seller' ? existing.sellerContactId : existing.buyerContactId,
          baseAmount: base,
          rate,
          amount,
          status: CONTRACTED_OR_LATER_STAGES.has(stage) ? 'pending' : 'draft',
        });
      } else {
        if (payment._count.receipts > 0 || payment.actualAmount != null) {
          throw new ConflictException(
            '이미 입금 기록이 있는 수수료입니다. 수금/정산 화면에서 조정해 주세요.',
          );
        }
        // 본계약으로 확정된 청구(수금 대기)는 금액을 바로 고치지 않고 조정 요청(할인·면제)으로 바꾼다.
        // 대표 승인을 거치게 하기 위해서다. 다만 예전 반올림 계산으로 법정 상한보다 1만 크게 만든
        // 자동 청구를 지금 상한으로 내리는 것은 잘못 계산된 금액을 바로잡는 일이라 그대로 허용한다.
        const legacyMax = calculateLegacyRoundedCommissionAmount(txType, base, propertyKind);
        const fixingLegacyRounding =
          legacyMax !== legalMax && payment.expectedAmount === legacyMax && amount === legalMax;
        if (payment.status !== 'draft' && !fixingLegacyRounding) {
          throw new ConflictException('본계약으로 확정된 수수료는 조정 요청으로 바꿔 주세요.');
        }
        await tx.commissionPayment.update({
          where: { id: payment.id },
          data: {
            baseAmount: base,
            rate: new Prisma.Decimal(rate),
            expectedAmount: amount,
          },
        });
        await this.recomputeDistributions(tx, payment.id);
      }
      return tx.deal.findUniqueOrThrow({ where: { id }, include: this.dealInclude });
    });
    return this.withPropertyContext(deal);
  }

  /**
   * 취소한 거래를 되살린다. 취소 때 정리한 것을 거꾸로 맞춘다:
   * 거래를 만든 매칭은 다시 "거래 전환"으로, 본계약 이후 거래면 같은 매물의 다른 손님 매칭을 닫고,
   * 잔금 완료 이후 거래면 의뢰를 다시 닫는다. 그 사이 같은 의뢰에 다른 거래가 생겼으면 되살리지 않는다.
   */
  async restore(id: string, officeId: string) {
    const existing = await this.findOne(id, officeId);
    if (!existing.isCancelled) {
      throw new ConflictException('취소된 거래가 아닙니다.');
    }
    const stage = normalizeDealStage(existing.stage);
    const intakeId = existing.listing?.intakeId ?? null;

    const deal = await this.prisma.$transaction(async (tx) => {
      if (intakeId) {
        await this.lockIntakeForLifecycleSync(tx, intakeId);
        const intake = await tx.listingIntake.findUnique({
          where: { id: intakeId },
          select: { lifecycleStatus: true },
        });
        if (
          intake?.lifecycleStatus === IntakeLifecycleStatus.CLOSED &&
          !DONE_STAGES.has(stage)
        ) {
          throw new ConflictException(
            '이 매물의 의뢰가 종료되어 거래를 되살릴 수 없습니다. 매물관리에서 의뢰를 다시 연 뒤 시도해 주세요.',
          );
        }
        const conflicting = await tx.deal.findFirst({
          where: {
            officeId,
            id: { not: id },
            isCancelled: false,
            stage: { in: [...OCCUPYING_DEAL_STAGES] },
            listing: { intakeId },
          },
          select: { stage: true },
        });
        if (conflicting) {
          throw new ConflictException(
            `이 매물에 진행 중인 다른 거래가 있어 되살릴 수 없습니다 (${stageLabel(normalizeDealStage(conflicting.stage))}).`,
          );
        }
      }

      const flipped = await tx.deal.updateMany({
        where: { id, officeId, isCancelled: true },
        data: {
          isCancelled: false,
          cancelledAt: null,
          cancelReason: null,
          cancelledBy: null,
        },
      });
      if (flipped.count === 0) {
        throw new ConflictException('취소된 거래가 아닙니다.');
      }

      // 거래 취소 때 함께 취소한 줄(표식이 붙은 줄)만 되돌리고 표식·처리 메모를 뗀다.
      // 사람이 따로 취소해 둔 줄과 원래 메모는 그대로 둔다.
      const cancelledCommissions = await tx.commissionPayment.findMany({
        where: { dealId: id, officeId, note: { contains: DEAL_CANCEL_MARK } },
        select: { id: true, status: true, note: true },
      });
      for (const payment of cancelledCommissions) {
        await tx.commissionPayment.update({
          where: { id: payment.id },
          data: {
            status:
              payment.status === 'cancelled'
                ? CONTRACTED_OR_LATER_STAGES.has(stage)
                  ? 'pending'
                  : 'draft'
                : undefined,
            note: stripDealCancelLines(payment.note),
          },
        });
      }
      const markedSchedule = await tx.dealPayment.findMany({
        where: {
          dealId: id,
          officeId,
          OR: [
            { memo: { contains: DEAL_CANCEL_MARK } },
            { memo: { contains: CANCEL_MEMO_PREFIX } },
          ],
        },
        select: { id: true, status: true, paidAmount: true, memo: true },
      });
      for (const row of markedSchedule) {
        const revive = row.status === 'cancelled' && row.paidAmount == null && row.memo?.includes(DEAL_CANCEL_MARK);
        await tx.dealPayment.update({
          where: { id: row.id },
          data: { status: revive ? 'pending' : undefined, memo: stripDealCancelLines(row.memo) },
        });
      }

      // 취소 때 "거래 취소"로 닫은 원래 매칭을 다시 거래 전환 상태로 돌린다.
      if (existing.matchId) {
        await tx.match.updateMany({
          where: {
            id: existing.matchId,
            officeId,
            stage: MatchStage.CLOSED,
            closedReason: MatchClosedReason.DEAL_CANCELLED,
            closedByDealId: id,
          },
          data: {
            stage: MatchStage.DEAL_CREATED,
            closedFromStage: null,
            closedReason: null,
            closedByDealId: null,
          },
        });
      }

      if (CONTRACTED_OR_LATER_STAGES.has(stage) && existing.listingId) {
        await closeCompetingMatchesForDeal(tx, {
          id,
          officeId,
          listingId: existing.listingId,
          matchId: existing.matchId ?? null,
        });
      }

      if (DONE_STAGES.has(stage) && intakeId) {
        await tx.listingIntake.updateMany({
          where: {
            id: intakeId,
            lifecycleStatus: { not: IntakeLifecycleStatus.CLOSED },
          },
          data: {
            lifecycleStatus: IntakeLifecycleStatus.CLOSED,
            lifecycleChangedAt: new Date(),
            lifecycleChangedBy: 'system:deal',
            closedReason: IntakeClosedReason.DEAL_COMPLETED,
          },
        });
        await closeOpenMatchesForIntake(tx, { officeId, intakeId, dealId: id });
      }

      return tx.deal.findUniqueOrThrow({ where: { id }, include: this.dealInclude });
    });

    return this.withPropertyContext(deal);
  }

  async cancel(
    id: string,
    officeId: string,
    dto: {
      cancelReason?: string;
      cancelledBy?: string;
      /** 이미 받은 가계약금·계약금을 어떻게 했는지 (돌려줌 / 위약금으로 남김 / 직접 적은 글). 돈 계산은 하지 않는다. */
      paidMoneyNote?: string;
    },
  ) {
    if (dto.cancelledBy && !CANCELLED_BY_VALUES.has(dto.cancelledBy)) {
      throw new BadRequestException('취소 주체를 다시 골라 주세요.');
    }
    const existing = await this.findOne(id, officeId);
    if (existing.isCancelled) {
      throw new ConflictException('이미 취소된 거래입니다.');
    }

    const deal = await this.prisma.$transaction(async (tx) => {
      const shouldReevaluateIntake =
        DONE_STAGES.has(existing.stage) &&
        !existing.isCancelled &&
        Boolean(existing.listing?.intakeId);
      // 매칭을 되살릴지 의뢰 상태로 판단하므로, 의뢰 종료와 겹치지 않게 항상 잠근다.
      if (!existing.isCancelled && existing.listing?.intakeId) {
        await this.lockIntakeForLifecycleSync(
          tx,
          existing.listing.intakeId,
        );
      }

      // 두 번 눌러 같이 들어온 요청이 취소일·사유를 덮어쓰지 않게 아직 취소 전일 때만 바꾼다.
      const flipped = await tx.deal.updateMany({
        where: { id, officeId, isCancelled: false },
        data: {
          isCancelled: true,
          cancelledAt: new Date(),
          cancelReason: dto.cancelReason?.trim() || null,
          cancelledBy: dto.cancelledBy ?? null,
        },
      });
      if (flipped.count === 0) {
        throw new ConflictException('이미 취소된 거래입니다.');
      }

      // 아직 돈이 오가지 않은 수수료 청구는 함께 취소한다. 받은 수수료가 있는 청구는 그대로 두고
      // 화면이 "수수료/정산에서 돌려준 돈으로 기록하세요"로 안내한다. 되살릴 때 이 줄만 되돌리도록
      // 원래 메모 뒤에 표식 한 줄을 덧붙인다 (사람이 미리 취소해 둔 줄은 건드리지 않는다).
      const openCommissions = await tx.commissionPayment.findMany({
        where: {
          dealId: id,
          officeId,
          status: { in: ['draft', 'pending', 'overdue'] },
          actualAmount: null,
          receipts: { none: { voidedAt: null } },
        },
        select: { id: true, note: true },
      });
      for (const payment of openCommissions) {
        await tx.commissionPayment.update({
          where: { id: payment.id },
          data: { status: 'cancelled', note: appendMemoLine(payment.note, DEAL_CANCEL_MARK) },
        });
      }
      // 앞으로 받을 대금 일정(아직 안 받은 줄)은 취소로 보이게 한다. 받은 돈 줄은 기록으로 남기고
      // 처리 메모(돌려줌·위약금)를 원래 메모 뒤에 덧붙인다.
      const paidMoneyNote = dto.paidMoneyNote?.trim().slice(0, 200);
      const schedule = await tx.dealPayment.findMany({
        where: { dealId: id, officeId },
        select: { id: true, status: true, paidAmount: true, memo: true },
      });
      for (const row of schedule) {
        if (row.paidAmount == null && (row.status === 'pending' || row.status === 'overdue')) {
          await tx.dealPayment.update({
            where: { id: row.id },
            data: { status: 'cancelled', memo: appendMemoLine(row.memo, DEAL_CANCEL_MARK) },
          });
        } else if (row.paidAmount != null && paidMoneyNote) {
          await tx.dealPayment.update({
            where: { id: row.id },
            data: { memo: appendMemoLine(row.memo, `${CANCEL_MEMO_PREFIX}${paidMoneyNote}`) },
          });
        }
      }

      const cancelled = await tx.deal.findUniqueOrThrow({
        where: { id },
        include: this.dealInclude,
      });

      // 배타 단계에서 취소돼도 매물 상태 복귀는 필요 없다 — "거래중" 은 활성
      // Deal 에서 파생하므로 isCancelled = true 가 되는 순간 점유가 자동 해제된다.
      //
      // 단, 종결 단계(completed/closed) Deal 취소는 의뢰 자동 done 의 근거를
      // 무너뜨릴 수 있다 (거래 무산 후 재판매 경로) — 커밋된 취소 상태 기준으로 재평가.
      let intakeReopened = false;
      if (shouldReevaluateIntake && existing.listing?.intakeId) {
        intakeReopened = await this.reopenAutoClosedIntakeIfBasisBroken(
          tx,
          existing.listing.intakeId,
        );
      }

      // 매칭 정리: 거래를 만든 매칭은 종료, 이 거래가 자동 종료한 매칭은 되살린다.
      if (!existing.isCancelled) {
        await settleMatchesForCancelledDeal(tx, {
          officeId,
          dealId: id,
          matchId: existing.matchId ?? null,
          intakeOpen: await this.isIntakeOpen(tx, existing.listing?.intakeId),
        });
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
      if (!existing.isCancelled && existing.listing?.intakeId) {
        await this.lockIntakeForLifecycleSync(
          tx,
          existing.listing.intakeId,
        );
      }

      // 계약서·수수료 입금은 남겨야 하는 기록이라 지우지 않고 막는다. 거래가 깨졌으면 취소로 남긴다.
      const contract = await tx.contract.findUnique({
        where: { dealId: id },
        select: { id: true },
      });
      if (contract) {
        throw new ConflictException(
          '계약서가 연결된 거래는 지울 수 없습니다. 계약서 관리에서 계약서를 먼저 지우거나, 거래 취소로 기록을 남겨 주세요.',
        );
      }
      // 취소한 입금 기록도 감사 기록이라 지우지 않는다 (FK도 Restrict) — 그런 거래도 지우지 않고 취소로 남긴다.
      const receiptCount = await tx.commissionReceipt.count({
        where: { officeId, payment: { dealId: id } },
      });
      if (receiptCount > 0) {
        throw new ConflictException(
          '수수료 입금 기록(취소한 기록 포함)이 있는 거래는 지울 수 없습니다. 거래 취소로 기록을 남겨 주세요.',
        );
      }

      // 돈이 오가지 않은 수수료 청구(분배·조정은 같이 지워진다)와 담당 배정은 거래와 함께 지운다.
      // 업무·일정은 남기고 거래 연결만 끊는다.
      await tx.commissionPayment.deleteMany({ where: { dealId: id, officeId } });
      await tx.dealParticipant.deleteMany({ where: { dealId: id, officeId } });
      await tx.task.updateMany({ where: { dealId: id, officeId }, data: { dealId: null } });
      await tx.calendarEvent.updateMany({
        where: { dealId: id, officeId },
        data: { dealId: null },
      });

      // 삭제하면 FK가 closedByDealId를 비우므로 되살릴 매칭을 먼저 찾아 둔다.
      // 거래를 만든 매칭은 취소와 같이 종료한다.
      const restorableMatchIds = existing.isCancelled
        ? []
        : await findRestorableMatchIds(tx, {
            officeId,
            dealId: id,
            reasons: [
              MatchClosedReason.OTHER_BUYER_CONTRACTED,
              MatchClosedReason.INTAKE_CLOSED,
            ],
          });
      if (!existing.isCancelled) {
        await closeSourceMatchForCancelledDeal(tx, {
          officeId,
          dealId: id,
          matchId: existing.matchId ?? null,
        });
      }

      const deleted = await tx.deal.delete({ where: { id } });

      if (shouldReevaluateIntake && existing.listing?.intakeId) {
        await this.reopenAutoClosedIntakeIfBasisBroken(
          tx,
          existing.listing.intakeId,
        );
      }

      if (
        !existing.isCancelled &&
        (await this.isIntakeOpen(tx, existing.listing?.intakeId))
      ) {
        await restoreAutoClosedMatches(tx, {
          officeId,
          matchIds: restorableMatchIds,
        });
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
    if (!DealsService.PAYMENT_KINDS.has(dto.kind)) {
      throw new BadRequestException('지급 종류를 다시 골라 주세요.');
    }
    if (dto.scheduledAmount === undefined || dto.scheduledAmount === null) {
      throw new BadRequestException('예정 금액(만원)을 입력해 주세요.');
    }
    assertManwon(dto.scheduledAmount, '예정 금액', { positive: true });
    const scheduledDate = parseDateInput(dto.scheduledDate, '예정일');
    if (
      dto.sequence !== undefined &&
      dto.sequence !== null &&
      (!Number.isInteger(dto.sequence) || dto.sequence < 1 || dto.sequence > 99)
    ) {
      throw new BadRequestException('차수는 1 이상의 정수로 입력해 주세요.');
    }

    const deal = await this.prisma.deal.findFirst({
      where: { id: dealId, officeId },
      select: { id: true },
    });
    if (!deal) throw new NotFoundException('거래를 찾을 수 없습니다.');

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
          scheduledDate: scheduledDate ?? undefined,
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
    if (!existing) throw new NotFoundException('지급 항목을 찾을 수 없습니다.');

    if (dto.status && !DealsService.PAYMENT_STATUSES.has(dto.status)) {
      throw new BadRequestException('지급 상태를 다시 골라 주세요.');
    }
    assertManwon(dto.scheduledAmount, '예정 금액', { positive: true });
    assertManwon(dto.paidAmount, '입금액');
    const scheduledDate = parseDateInput(dto.scheduledDate, '예정일');
    const paidAtInput = parseDateInput(dto.paidAt, '입금일');
    // 받지 않은 돈을 앞날 입금일로 적으면 받은 것처럼 보인다 (시간대 차이로 하루는 봐준다)
    if (paidAtInput && paidAtInput.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      throw new BadRequestException('입금일은 오늘이나 그 전 날짜만 적을 수 있습니다.');
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
    let paidAt: Date | null | undefined = paidAtInput;
    if (paidAtInput === undefined && dto.paidAmount != null && existing.paidAt == null) {
      paidAt = new Date();
    }

    return this.prisma.dealPayment.update({
      where: { id: paymentId },
      data: {
        scheduledAmount: dto.scheduledAmount,
        scheduledDate,
        paidAmount: dto.paidAmount !== undefined ? dto.paidAmount : undefined,
        paidAt,
        status,
        method: dto.method !== undefined ? dto.method : undefined,
        payerName: dto.payerName !== undefined ? dto.payerName : undefined,
        memo: dto.memo !== undefined ? dto.memo : undefined,
      },
    });
  }

  /**
   * 거래의 대금 일정을 계약서 요약(계약금·중도금·잔금과 날짜)에 맞춘다. 사람이 "계약서 값으로 맞추기"를
   * 눌렀을 때만 부른다 — 계약서를 저장해도 거래 쪽은 자동으로 덮지 않는다.
   *
   * - 계약서에 값이 있는 칸만 맞춘다. 비어 있으면 거래 쪽을 그대로 둔다.
   * - 이미 받은(완납) 줄, 여러 차수로 나뉜 중도금은 짝을 정할 수 없어 그대로 두고 skipped 로 알린다.
   * - 거래에 그 종류의 줄이 없으면 새로 만든다 (계약금 날짜는 계약일).
   */
  async matchPaymentsToContract(dealId: string, officeId: string) {
    const skipped: string[] = [];
    let changed = 0;

    await this.prisma.$transaction(async (tx) => {
      // 두 번 눌러 같이 들어와도 한 번만 맞춘다 (같은 줄을 두 번 만들면 차수 중복으로 실패한다)
      const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM deals WHERE id = ${dealId}::uuid AND office_id = ${officeId}::uuid FOR UPDATE`;
      if (locked.length === 0) throw new NotFoundException('거래를 찾을 수 없습니다.');
      const deal = await tx.deal.findFirst({
        where: { id: dealId, officeId },
        select: {
          isCancelled: true,
          contract: {
            select: {
              id: true,
              contractDate: true,
              statedDeposit: true,
              statedInterimPayment: true,
              statedInterimDate: true,
              statedBalance: true,
              statedBalanceDate: true,
            },
          },
          payments: {
            select: { id: true, kind: true, sequence: true, status: true, scheduledAmount: true, scheduledDate: true },
            orderBy: { sequence: 'asc' },
          },
        },
      });
      if (!deal) throw new NotFoundException('거래를 찾을 수 없습니다.');
      if (deal.isCancelled) throw new ConflictException('취소된 거래입니다.');
      if (!deal.contract) throw new ConflictException('이 거래에는 계약서가 없습니다.');
      const contract = deal.contract;

      // 계약서 요약에는 중도금 칸이 하나뿐이라 1·2차가 합쳐져 있다. 계약서 문서에 2차 중도금이 있으면
      // 문서의 차수별 금액·날짜로 맞춘다.
      const document = await tx.contractDocument.findFirst({
        where: { contractId: contract.id, officeId, category: 'contract', status: { not: 'cancelled' } },
        orderBy: { updatedAt: 'desc' },
        select: { metadata: true },
      });
      const interimFromDocument = readInterimInstallments(document?.metadata);

      type Target = { kind: string; sequence?: number; label: string; amount: number | null; date: Date | null | undefined };
      const targets: Target[] = [
        // 계약금 요약 칸에는 날짜가 없다 — 새로 만들 때만 계약일을 쓴다
        { kind: 'contract', label: '계약금', amount: contract.statedDeposit, date: undefined },
        ...(interimFromDocument && interimFromDocument.length > 1
          ? interimFromDocument.map((installment, index) => ({
              kind: 'interim',
              sequence: index + 1,
              label: `${index + 1}차 중도금`,
              amount: installment.amount,
              date: installment.date,
            }))
          : [{ kind: 'interim', label: '중도금', amount: contract.statedInterimPayment, date: contract.statedInterimDate }]),
        { kind: 'balance', label: '잔금', amount: contract.statedBalance, date: contract.statedBalanceDate },
      ];

      for (const target of targets) {
        if (target.amount == null && !target.date) continue;
        const rowsOfKind = deal.payments.filter(
          (payment) => payment.kind === target.kind && payment.status !== 'cancelled',
        );
        let row: (typeof rowsOfKind)[number] | undefined;
        if (target.sequence != null) {
          // 차수별: 거래 쪽 중도금 줄이 문서 차수보다 많으면 짝을 정할 수 없다
          if (rowsOfKind.length > (interimFromDocument?.length ?? 0)) {
            if (target.sequence === 1) skipped.push('거래의 중도금이 계약서보다 여러 번으로 나뉘어 있어 그대로 두었습니다.');
            continue;
          }
          row = rowsOfKind[target.sequence - 1];
        } else {
          if (rowsOfKind.length > 1) {
            skipped.push(`${target.label}이 여러 번으로 나뉘어 있어 그대로 두었습니다.`);
            continue;
          }
          row = rowsOfKind[0];
        }
        if (!row) {
          if (target.amount == null || target.amount <= 0) continue;
          const lastSequence = Math.max(
            0,
            ...deal.payments.filter((payment) => payment.kind === target.kind).map((payment) => payment.sequence),
          );
          const created = await tx.dealPayment.create({
            data: {
              officeId,
              dealId,
              kind: target.kind,
              sequence: lastSequence + 1,
              scheduledAmount: target.amount,
              scheduledDate:
                target.kind === 'contract' ? (contract.contractDate ?? undefined) : (target.date ?? undefined),
            },
            select: { id: true, kind: true, sequence: true, status: true, scheduledAmount: true, scheduledDate: true },
          });
          deal.payments.push(created);
          changed += 1;
          continue;
        }
        const amountDiffers = target.amount != null && target.amount > 0 && target.amount !== row.scheduledAmount;
        const dateDiffers =
          target.date != null && seoulDay(target.date) !== (row.scheduledDate ? seoulDay(row.scheduledDate) : null);
        if (!amountDiffers && !dateDiffers) continue;
        if (row.status === 'paid') {
          skipped.push(`${target.label}은 이미 받아서 그대로 두었습니다.`);
          continue;
        }
        await tx.dealPayment.update({
          where: { id: row.id },
          data: {
            scheduledAmount: amountDiffers ? target.amount! : undefined,
            scheduledDate: dateDiffers ? target.date! : undefined,
          },
        });
        changed += 1;
      }
    });

    return { deal: await this.findOne(dealId, officeId), changed, skipped };
  }

  async removePayment(dealId: string, paymentId: string, officeId: string) {
    const existing = await this.prisma.dealPayment.findFirst({
      where: { id: paymentId, dealId, officeId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('지급 항목을 찾을 수 없습니다.');
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
      buyerContact: deal.buyerContact ? withPrimaryPhone(deal.buyerContact) : null,
      sellerContact: deal.sellerContact ? withPrimaryPhone(deal.sellerContact) : null,
      stage: normalizeDealStage(deal.stage),
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
    intakeId: string | undefined;
    transactionType: string;
    /** Listing → Property → Site.type (법정 중개보수 물건유형 결정용) */
    siteType: string | null;
  }> {
    const listingSelect = {
      id: true,
      transactionType: true,
      isPaused: true,
      intake: { select: { id: true, lifecycleStatus: true } },
      property: { select: { site: { select: { type: true } } } },
    } satisfies Prisma.ListingSelect;

    if (dto.listingId) {
      const listing = await this.prisma.listing.findFirst({
        where: { id: dto.listingId, officeId },
        select: listingSelect,
      });
      if (!listing) throw new NotFoundException('매물(거래 조건)을 찾을 수 없습니다.');
      this.assertListingAvailableForDeal(listing, dto.resumeListing === true);
      if (
        dto.transactionType &&
        dto.transactionType !== listing.transactionType
      ) {
        throw new BadRequestException(
          '고른 매물의 거래유형과 다릅니다.',
        );
      }
      return {
        listingId: listing.id,
        intakeId: listing.intake.id,
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
      if (!listing) throw new NotFoundException('거래를 시작할 수 있는 매물이 없습니다.');
      return {
        listingId: listing.id,
        intakeId: listing.intake.id,
        transactionType: listing.transactionType,
        siteType: listing.property?.site?.type ?? null,
      };
    }

    if (!dto.transactionType) {
      throw new BadRequestException(
        '매물을 고르거나 거래유형을 정해 주세요.',
      );
    }

    return {
      listingId: undefined,
      intakeId: undefined,
      transactionType: dto.transactionType,
      siteType: null,
    };
  }

  private assertListingAvailableForDeal(listing: {
    isPaused: boolean;
    intake: { lifecycleStatus: string };
  }, allowResume = false) {
    if (listing.intake.lifecycleStatus === IntakeLifecycleStatus.CLOSED) {
      throw new BadRequestException('종료된 매물 의뢰로는 거래를 만들 수 없습니다.');
    }
    if (
      !allowResume &&
      (listing.intake.lifecycleStatus === IntakeLifecycleStatus.HOLD ||
        listing.isPaused)
    ) {
      throw new BadRequestException(
        '보류 중인 매물입니다. 매물관리에서 보류를 풀고 거래를 만들어 주세요.',
      );
    }
  }

  async getPropertyTransitionPreview(id: string, officeId: string) {
    const context = await this.loadPropertyTransitionContext(id, officeId);
    if (!context.eligible) {
      return {
        eligible: false,
        reason: context.reason,
        kind: context.kind,
        propertyId: context.propertyId,
        currentOwners: [],
        currentLeases: [],
        proposedBuyers: [],
        leaseTerms: null,
      };
    }

    return {
      eligible: true,
      kind: context.kind,
      propertyId: context.propertyId,
      currentOwners: context.currentOwners.map((owner) => ({
        propertyContactId: owner.id,
        contactId: owner.contactId,
        name: owner.contact.name,
        role: owner.role,
      })),
      currentLeases: context.currentLeases.map((lease) => ({
        leaseId: lease.id,
        deposit: lease.deposit,
        monthlyRent: lease.monthlyRent,
        tenants: lease.tenants.map((member) => ({
          contactId: member.contactId,
          name: member.contact.name,
          role: member.role,
        })),
      })),
      proposedBuyers: context.proposedBuyers,
      leaseTerms: context.leaseTerms,
    };
  }

  async applyPropertyTransition(
    id: string,
    officeId: string,
    dto: {
      archiveExistingOwners?: boolean;
      registerNewOwners?: boolean;
      markBuyersResident?: boolean;
      closeExistingLeases?: boolean;
      createNewLease?: boolean;
    },
  ): Promise<{ applied: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const context = await this.loadPropertyTransitionContext(id, officeId, tx);
      if (!context.eligible || !context.propertyId || !context.kind) {
        throw new BadRequestException(
          context.reason ?? '이 거래는 매물 소유·임대차 변경을 반영할 수 없습니다.',
        );
      }

      const now = context.deal.stageChangedAt ?? new Date();

      if (context.kind === 'sale') {
        if (dto.archiveExistingOwners && context.currentOwners.length > 0) {
          for (const owner of context.currentOwners) {
            await tx.propertyContact.update({
              where: { id: owner.id },
              data: {
                status: 'transferred',
                isPrimary: false,
                endedAt: now,
              },
            });
          }
        }

        if (dto.registerNewOwners && context.proposedBuyers.length > 0) {
          for (let index = 0; index < context.proposedBuyers.length; index += 1) {
            const buyer = context.proposedBuyers[index];
            const existing = await tx.propertyContact.findFirst({
              where: {
                officeId,
                propertyId: context.propertyId,
                contactId: buyer.contactId,
                status: 'active',
                role: { in: ['owner', 'co_owner'] },
              },
              select: { id: true },
            });
            if (existing) continue;
            await tx.propertyContact.create({
              data: {
                officeId,
                propertyId: context.propertyId,
                contactId: buyer.contactId,
                role: context.proposedBuyers.length > 1 ? 'co_owner' : 'owner',
                shareRatio: buyer.shareRatio,
                isResident: Boolean(dto.markBuyersResident),
                isPrimary:
                  dto.archiveExistingOwners
                    ? buyer.isPrimary || index === 0
                    : false,
                status: 'active',
                startedAt: now,
                sourceDealId: context.deal.id,
              },
            });
          }
        }
      } else if (context.kind === 'lease') {
        if (dto.closeExistingLeases && context.currentLeases.length > 0) {
          for (const lease of context.currentLeases) {
            await tx.propertyLease.update({
              where: { id: lease.id },
              data: {
                status: 'moved',
                moveOutDate: now,
              },
            });
          }
        }

        if (dto.createNewLease && context.proposedBuyers.length > 0) {
          await tx.propertyLease.create({
            data: {
              officeId,
              propertyId: context.propertyId,
              deposit: context.leaseTerms?.deposit ?? null,
              monthlyRent: context.leaseTerms?.monthlyRent ?? null,
              contractStart: context.leaseTerms?.contractStart
                ? new Date(context.leaseTerms.contractStart)
                : null,
              contractEnd: context.leaseTerms?.contractEnd
                ? new Date(context.leaseTerms.contractEnd)
                : null,
              status: 'residing',
              sourceDealId: context.deal.id,
              sourceContractId: context.deal.contract?.id ?? null,
              tenants: {
                create: context.proposedBuyers.map((buyer, index) => ({
                  contactId: buyer.contactId,
                  role: context.proposedBuyers.length > 1 ? 'co_tenant' : 'tenant',
                  isPrimary: buyer.isPrimary || index === 0,
                })),
              },
            },
          });
        }
      }

      return { applied: true };
    });
  }

  private async loadPropertyTransitionContext(
    id: string,
    officeId: string,
    client: Prisma.TransactionClient = this.prisma,
  ) {
    const deal = await client.deal.findFirst({
      where: { id, officeId },
      include: {
        listing: { select: { propertyId: true } },
        buyerContact: { select: { id: true, name: true } },
        contract: {
          include: {
            parties: {
              where: { side: 'two', parentId: null, contactId: { not: null } },
              include: { contact: { select: { id: true, name: true } } },
              orderBy: { subId: 'asc' },
            },
          },
        },
      },
    });
    if (!deal) {
      throw new NotFoundException('거래를 찾을 수 없습니다.');
    }

    const normalizedStage = normalizeDealStage(deal.stage);
    const propertyId = deal.listing?.propertyId ?? null;
    const txKind: 'sale' | 'lease' | null =
      deal.transactionType === TransactionType.SALE
        ? 'sale'
        : deal.transactionType === TransactionType.JEONSE ||
            deal.transactionType === TransactionType.MONTHLY ||
            deal.transactionType === 'yearly'
          ? 'lease'
          : null;

    if (deal.isCancelled) {
      return {
        eligible: false,
        reason: '취소된 거래는 매물 소유·임대차를 변경할 수 없습니다.',
        kind: txKind,
        propertyId,
        deal,
        currentOwners: [],
        currentLeases: [],
        proposedBuyers: [],
        leaseTerms: null,
      };
    }

    if (normalizedStage !== DealStage.COMPLETED && normalizedStage !== DealStage.CLOSED) {
      return {
        eligible: false,
        reason: '완료된 거래에서만 소유·임대차 변경을 반영할 수 있습니다.',
        kind: txKind,
        propertyId,
        deal,
        currentOwners: [],
        currentLeases: [],
        proposedBuyers: [],
        leaseTerms: null,
      };
    }

    if (!propertyId || !txKind) {
      return {
        eligible: false,
        reason: '매물이 연결된 매매·임대차 거래에서만 변경할 수 있습니다.',
        kind: txKind,
        propertyId,
        deal,
        currentOwners: [],
        currentLeases: [],
        proposedBuyers: [],
        leaseTerms: null,
      };
    }

    const [alreadyAppliedContact, alreadyAppliedLease, currentOwners, currentLeases] =
      await Promise.all([
        client.propertyContact.count({ where: { officeId, sourceDealId: deal.id } }),
        client.propertyLease.count({ where: { officeId, sourceDealId: deal.id } }),
        client.propertyContact.findMany({
          where: {
            officeId,
            propertyId,
            status: 'active',
            role: { in: ['owner', 'co_owner'] },
          },
          include: { contact: { select: { id: true, name: true } } },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        }),
        client.propertyLease.findMany({
          where: {
            officeId,
            propertyId,
            status: { in: ['residing', 'moving_out'] },
          },
          include: {
            tenants: {
              include: { contact: { select: { id: true, name: true } } },
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            },
          },
          orderBy: { createdAt: 'desc' },
        }),
      ]);

    if (alreadyAppliedContact > 0 || alreadyAppliedLease > 0) {
      return {
        eligible: false,
        reason: '이미 이 거래의 소유·임대차 변경이 반영되었습니다.',
        kind: txKind,
        propertyId,
        deal,
        currentOwners,
        currentLeases,
        proposedBuyers: [],
        leaseTerms: null,
      };
    }

    const contractBuyers = (deal.contract?.parties ?? [])
      .filter((party): party is typeof party & { contactId: string; contact: { id: string; name: string } } =>
        Boolean(party.contactId && party.contact),
      )
      .map((party, index) => ({
        contactId: party.contactId,
        name: party.contact.name,
        shareRatio: party.sharePercent ? Number(party.sharePercent) : null,
        isPrimary: index === 0,
      }));

    const proposedBuyers =
      contractBuyers.length > 0
        ? contractBuyers
        : deal.buyerContact
          ? [
              {
                contactId: deal.buyerContact.id,
                name: deal.buyerContact.name,
                shareRatio: null,
                isPrimary: true,
              },
            ]
          : [];

    const leaseTerms =
      txKind === 'lease'
        ? {
            deposit:
              deal.transactionType === TransactionType.JEONSE
                ? (deal.contract?.totalPrice ?? deal.agreedPrice ?? deal.agreedDeposit ?? null)
                : (deal.contract?.statedDeposit ?? deal.agreedDeposit ?? null),
            monthlyRent:
              deal.transactionType === TransactionType.JEONSE
                ? null
                : (deal.contract?.monthlyRent ?? deal.agreedMonthlyRent ?? null),
            contractStart: (deal.contract?.leaseStartDate ?? deal.contract?.moveInDate ?? deal.agreedMoveInDate)?.toISOString() ?? null,
            contractEnd: deal.contract?.leaseEndDate?.toISOString() ?? null,
          }
        : null;

    return {
      eligible: true,
      reason: undefined,
      kind: txKind,
      propertyId,
      deal,
      currentOwners,
      currentLeases,
      proposedBuyers,
      leaseTerms,
    };
  }
}

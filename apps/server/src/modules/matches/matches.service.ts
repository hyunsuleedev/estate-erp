import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IntakeConfirmationState,
  IntakeLifecycleStatus,
  MATCH_STAGE_ORDER,
  MatchClosedReason,
  MatchStage,
  normalizeMatchStage,
} from '@estate-erp/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  getIntakeConfirmationState,
  LISTING_INTAKE_STATE_SELECT,
  OCCUPYING_DEALS_SELECT,
} from '../listings/listing-state';
import { MATCH_STAGES } from './dto/match.dto';
import {
  buyerIntakeContactsInclude,
  withBuyerRequirementContact,
} from '../buyer-requirements/buyer-requirement.presenter';

function getMatchStageStorageValues(stage: string): string[] {
  const normalizedStage = normalizeMatchStage(stage);
  if (normalizedStage === MatchStage.BUYER_INTERESTED) {
    return [MatchStage.BUYER_INTERESTED, 'buyerContacted'];
  }
  if (normalizedStage === MatchStage.VIEWING_CONFIRMED) {
    return [MatchStage.VIEWING_CONFIRMED, 'ownerContacted'];
  }
  return [normalizedStage];
}

const matchInclude = {
  listing: {
    include: {
      intake: {
        select: {
          ...LISTING_INTAKE_STATE_SELECT,
          // 한 의뢰에는 진행 중인 거래가 하나뿐이다. 같은 집의 다른 거래 조건(매매 ↔ 전세)이 거래 중이면
          // 이 매칭은 거래로 넘길 수 없으므로, 화면이 협상 끝에서야 알지 않게 미리 보여 준다.
          listings: {
            select: { id: true, transactionType: true, deals: OCCUPYING_DEALS_SELECT },
          },
        },
      },
      deals: OCCUPYING_DEALS_SELECT,
      property: {
        include: {
          site: true,
          unit: { include: { dong: true } },
          propertyContacts: {
            where: { status: 'active' },
            include: { contact: true },
            orderBy: { isPrimary: 'desc' },
          },
        },
      },
    },
  },
  buyerRequirement: {
    include: {
      buyerIntake: { include: { contacts: buyerIntakeContactsInclude } },
      preferredRegions: {
        include: { province: true, district: true, ward: true },
      },
      // 매칭 상세 · 희망매물 줄의 "희망 지역·단지"가 단지만 고른 손님에게 "지역 협의"로 보이지 않게 단지도 보낸다
      preferredSites: {
        include: { site: { select: { id: true, name: true, type: true } } },
        orderBy: { priority: 'asc' },
      },
    },
  },
  calendarEvents: {
    where: { type: 'viewing' },
    orderBy: { start: 'asc' },
  },
  deals: {
    select: { id: true, stage: true, isCancelled: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  },
} satisfies Prisma.MatchInclude;

type MatchWithRelations = Prisma.MatchGetPayload<{ include: typeof matchInclude }>;

export interface MatchesFilter {
  propertyId?: string;
  listingId?: string;
  buyerReqId?: string;
  /** 콤마 구분 다중 stage 허용 (예: "suggested,viewing") */
  stage?: string;
}

@Injectable()
export class MatchesService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly matchInclude = matchInclude;

  async findAll(officeId: string, filters: MatchesFilter = {}) {
    const where: Prisma.MatchWhereInput = { officeId };

    if (filters.listingId) {
      where.listingId = filters.listingId;
    }
    if (filters.buyerReqId) {
      where.buyerReqId = filters.buyerReqId;
    }
    if (filters.propertyId) {
      where.listing = { propertyId: filters.propertyId };
    }
    if (filters.stage) {
      const stages = filters.stage
        .split(',')
        .map((stage) => stage.trim())
        .filter(Boolean);
      const storageStages = Array.from(
        new Set(stages.flatMap(getMatchStageStorageValues)),
      );
      if (storageStages.length === 1) {
        where.stage = storageStages[0];
      } else if (storageStages.length > 1) {
        where.stage = { in: storageStages };
      }
    }

    const matches = await this.prisma.match.findMany({
      where,
      include: this.matchInclude,
      orderBy: { createdAt: 'desc' },
    });

    return matches.map((match) => this.withPropertyContext(match));
  }

  async findOne(id: string, officeId: string) {
    const match = await this.prisma.match.findFirst({
      where: { id, officeId },
      include: this.matchInclude,
    });
    if (!match) throw new NotFoundException('매칭을 찾을 수 없습니다');
    return this.withPropertyContext(match);
  }

  async create(
    officeId: string,
    dto: {
      listingId: string;
      buyerReqId: string;
      memo?: string;
    },
    /** id: 같은 요청을 다시 보내도 한 건만 생기게 할 때 (통화 분석 제안 반영) */
    options: { id?: string } = {},
  ) {
    // 매물과 희망 조건이 이 사무소의 것인지 본다 (FK는 id만 가리킨다)
    const [listing, requirement] = await Promise.all([
      this.prisma.listing.findFirst({
        where: { id: dto.listingId, officeId },
        select: { id: true, intake: { select: { lifecycleStatus: true } } },
      }),
      this.prisma.buyerRequirement.findFirst({
        where: { id: dto.buyerReqId, officeId },
        select: { id: true, status: true, buyerIntake: { select: { lifecycleStatus: true } } },
      }),
    ]);
    if (!listing) throw new NotFoundException('매물을 찾을 수 없습니다');
    if (!requirement) throw new NotFoundException('희망 조건을 찾을 수 없습니다');
    if (listing.intake.lifecycleStatus === IntakeLifecycleStatus.CLOSED) {
      throw new BadRequestException(
        '종료된 매물은 연결할 수 없습니다. 매물관리에서 의뢰를 다시 연 뒤 연결해 주세요',
      );
    }
    if (requirement.status === 'completed') {
      throw new ConflictException(
        '완료한 희망 조건입니다. 상태를 활성으로 바꾼 뒤 매물을 연결해 주세요',
      );
    }
    if (requirement.buyerIntake?.lifecycleStatus === IntakeLifecycleStatus.CLOSED) {
      throw new ConflictException(
        '종료한 구매 의뢰의 희망 조건입니다. 구매 의뢰를 다시 연 뒤 매물을 연결해 주세요',
      );
    }

    // 동일 매물 + 동일 구매조건 조합 중복 방지 (종료된 매칭은 재생성 허용).
    // 같은 조합을 동시에 두 번 보내면(단추 두 번 누르기) 둘 다 검사를 통과할 수 있어, 조합마다 잠그고 본다.
    const match = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`match:${dto.listingId}:${dto.buyerReqId}`}::text, 0))`;
      const duplicate = await tx.match.findFirst({
        where: {
          officeId,
          listingId: dto.listingId,
          buyerReqId: dto.buyerReqId,
          stage: { not: 'closed' },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictException(
          '이미 이 고객에게 연결해 진행 중인 매물입니다',
        );
      }

      return tx.match.create({
        data: { ...(options.id ? { id: options.id } : {}), officeId, ...dto },
        include: this.matchInclude,
      });
    });

    return this.withPropertyContext(match);
  }

  async updateStage(
    id: string,
    officeId: string,
    dto: { stage: string; memo?: string | null },
  ) {
    if (!(MATCH_STAGES as readonly string[]).includes(dto.stage)) {
      throw new BadRequestException('유효하지 않은 매칭 단계입니다');
    }
    const targetStage = normalizeMatchStage(dto.stage);
    if (!(MATCH_STAGE_ORDER as readonly string[]).includes(targetStage)) {
      throw new BadRequestException('유효하지 않은 매칭 단계입니다');
    }

    const currentMatch = await this.findOne(id, officeId);
    const currentStage = normalizeMatchStage(currentMatch.stage);

    // 완료한 손님의 매칭은 다시 열지 않는다. 손님 조건을 먼저 활성으로 바꾼다 (새로 연결할 때와 같다).
    if (
      targetStage !== MatchStage.CLOSED &&
      currentMatch.buyerRequirement?.status === 'completed'
    ) {
      throw new ConflictException(
        '완료한 희망 조건의 매칭입니다. 고객 상태를 활성으로 바꾼 뒤 다시 시작해 주세요',
      );
    }
    // 구매 의뢰를 닫았으면(고객 원장의 의뢰 종료) 그 의뢰의 매칭도 옮기거나 다시 열지 않는다
    if (
      targetStage !== MatchStage.CLOSED &&
      currentMatch.buyerRequirement?.buyerIntake?.lifecycleStatus === IntakeLifecycleStatus.CLOSED
    ) {
      throw new ConflictException(
        '종료한 구매 의뢰의 매칭입니다. 구매 의뢰를 다시 연 뒤 진행해 주세요',
      );
    }

    // 거래로 넘긴 매칭은 읽기 전용이다. 진행은 거래관리가 맡고, 거래를 취소하면 매칭이 알아서 닫힌다.
    // 단계를 되돌리면 거래는 진행 중인데 매칭만 예전 단계로 돌아가 두 화면이 어긋난다.
    if (
      currentStage === MatchStage.DEAL_CREATED &&
      targetStage !== MatchStage.DEAL_CREATED &&
      currentMatch.deals.some((deal) => !deal.isCancelled)
    ) {
      throw new ConflictException(
        '거래로 전환한 매칭이라 단계를 바꿀 수 없습니다. 진행은 거래관리에서 해 주세요',
      );
    }
    const currentIndex = MATCH_STAGE_ORDER.indexOf(
      currentStage as (typeof MATCH_STAGE_ORDER)[number],
    );
    const targetIndex = MATCH_STAGE_ORDER.indexOf(
      targetStage as (typeof MATCH_STAGE_ORDER)[number],
    );
    const buyerInterestedIndex = MATCH_STAGE_ORDER.indexOf(
      MatchStage.BUYER_INTERESTED,
    );
    const isCrossingBuyerInterest =
      targetStage !== MatchStage.CLOSED &&
      currentIndex < buyerInterestedIndex &&
      targetIndex >= buyerInterestedIndex;

    if (isCrossingBuyerInterest) {
      const listing = currentMatch.listing;
      const intake = listing?.intake;

      if (!intake) {
        throw new BadRequestException(
          '매물 확인 정보가 없어 고객 관심 단계로 이동할 수 없습니다',
        );
      }
      if (intake.lifecycleStatus === IntakeLifecycleStatus.CLOSED) {
        throw new BadRequestException(
          '종료된 매물은 고객에게 제안할 수 없습니다',
        );
      }
      if (
        listing.isPaused ||
        intake.lifecycleStatus === IntakeLifecycleStatus.HOLD
      ) {
        throw new BadRequestException(
          '보류된 매물은 재개한 뒤 고객에게 제안할 수 있습니다',
        );
      }

      const confirmationState = getIntakeConfirmationState(intake);
      if (confirmationState !== IntakeConfirmationState.VERIFIED) {
        throw new BadRequestException(
          confirmationState === IntakeConfirmationState.NO_ANSWER
            ? '집주인·의뢰인 확인이 되지 않은 매물입니다. 다시 확인한 뒤 진행해 주세요'
            : confirmationState === IntakeConfirmationState.OVERDUE
              ? '매물 확인 기한이 지났습니다. 다시 확인한 뒤 고객에게 제안해 주세요'
              : '매물 확인을 완료한 뒤 고객 관심 단계로 이동할 수 있습니다',
        );
      }
    }

    // 단계 순서는 강제하지 않는다. 임장 없이 계약으로 가는 경우처럼 실제 업무가 단계를 건너뛰기 때문이다.
    // 막는 것은 위의 "확인되지 않은 매물을 고객에게 제안하는 일"뿐이다.

    const match = await this.prisma.match.update({
      where: { id },
      data: {
        stage: targetStage,
        closedFromStage:
          targetStage === MatchStage.CLOSED
            ? currentStage === MatchStage.CLOSED
              ? currentMatch.closedFromStage
              : currentStage
            : null,
        // 사용자가 직접 종료하면 "직접 종료"로 바꿔 거래 취소 시 되살리기 대상에서 뺀다.
        // 다시 열면 종료 이유를 지운다.
        closedReason:
          targetStage === MatchStage.CLOSED ? MatchClosedReason.MANUAL : null,
        closedByDealId: null,
        // null = 메모 비우기, undefined = 변경 없음
        memo: dto.memo === undefined ? undefined : dto.memo,
      },
      include: this.matchInclude,
    });

    return this.withPropertyContext(match);
  }

  async updateMemo(
    id: string,
    officeId: string,
    dto: {
      memo: string | null;
      expectedUpdatedAt?: string | Date | null;
    },
  ) {
    const expectedUpdatedAt = dto.expectedUpdatedAt
      ? this.parseExpectedUpdatedAt(dto.expectedUpdatedAt)
      : null;
    const where: Prisma.MatchWhereUniqueInput = {
      id,
      officeId,
      ...(expectedUpdatedAt ? { updatedAt: expectedUpdatedAt } : {}),
    };

    try {
      const match = await this.prisma.match.update({
        where,
        // 메모 전용 경로에서는 클라이언트가 마지막으로 본 stage를 다시 쓰지 않는다.
        data: { memo: dto.memo },
        include: this.matchInclude,
      });

      return this.withPropertyContext(match);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        const accessibleMatch = await this.prisma.match.findFirst({
          where: { id, officeId },
          select: { id: true },
        });
        if (!accessibleMatch) {
          throw new NotFoundException('매칭을 찾을 수 없습니다');
        }
        if (expectedUpdatedAt) {
          throw new ConflictException('다른 사용자가 먼저 수정했습니다.');
        }
        throw new NotFoundException('매칭을 찾을 수 없습니다');
      }
      throw error;
    }
  }

  /**
   * 협상하며 적어 두는 합의 조건. 보낸 칸만 바꾼다(undefined = 변경 없음, null = 비우기).
   * 거래로 전환한 뒤에는 Deal 의 합의 조건이 기준이므로 여기서는 고치지 못한다.
   */
  async updateAgreedTerms(
    id: string,
    officeId: string,
    dto: {
      agreedPrice?: number | null;
      agreedDeposit?: number | null;
      agreedMonthlyRent?: number | null;
      agreedMoveInDate?: string | null;
    },
  ) {
    const current = await this.prisma.match.findFirst({
      where: { id, officeId },
      select: { stage: true },
    });
    if (!current) throw new NotFoundException('매칭을 찾을 수 없습니다');
    if (normalizeMatchStage(current.stage) === MatchStage.DEAL_CREATED) {
      throw new ConflictException(
        '거래로 전환한 매칭입니다. 합의 조건은 거래관리에서 수정해 주세요',
      );
    }

    let agreedMoveInDate: Date | null | undefined;
    if (dto.agreedMoveInDate === null) {
      agreedMoveInDate = null;
    } else if (dto.agreedMoveInDate !== undefined) {
      agreedMoveInDate = new Date(dto.agreedMoveInDate);
      if (Number.isNaN(agreedMoveInDate.getTime())) {
        throw new BadRequestException('입주일 형식이 올바르지 않습니다');
      }
    }

    const match = await this.prisma.match.update({
      where: { id },
      data: {
        agreedPrice: dto.agreedPrice,
        agreedDeposit: dto.agreedDeposit,
        agreedMonthlyRent: dto.agreedMonthlyRent,
        agreedMoveInDate,
      },
      include: this.matchInclude,
    });

    return this.withPropertyContext(match);
  }

  async remove(id: string, officeId: string) {
    await this.findOne(id, officeId);
    return this.prisma.match.delete({ where: { id } });
  }

  private withPropertyContext(match: MatchWithRelations) {
    const property = match.listing.property;

    return {
      ...match,
      stage: normalizeMatchStage(match.stage),
      propertyId: property.id,
      property,
      buyerRequirement: match.buyerRequirement
        ? withBuyerRequirementContact(match.buyerRequirement)
        : null,
    };
  }

  private parseExpectedUpdatedAt(value: string | Date) {
    const parsed = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('수정 시각 형식이 올바르지 않습니다.');
    }
    return parsed;
  }
}

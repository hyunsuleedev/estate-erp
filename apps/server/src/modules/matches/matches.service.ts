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
      intake: { select: LISTING_INTAKE_STATE_SELECT },
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
    },
  },
  calendarEvents: {
    where: { type: 'viewing' },
    orderBy: { start: 'asc' },
  },
  deals: {
    select: { id: true, stage: true, isCancelled: true },
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
    if (!match) throw new NotFoundException('Match not found');
    return this.withPropertyContext(match);
  }

  async create(
    officeId: string,
    dto: {
      listingId: string;
      buyerReqId: string;
      memo?: string;
    },
  ) {
    // 동일 매물 + 동일 구매조건 조합 중복 방지 (종료된 매칭은 재생성 허용)
    const duplicate = await this.prisma.match.findFirst({
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
        '이미 같은 매물과 구매조건으로 진행 중인 매칭이 있습니다',
      );
    }

    const match = await this.prisma.match.create({
      data: { officeId, ...dto },
      include: this.matchInclude,
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
    const currentIndex = MATCH_STAGE_ORDER.indexOf(
      currentStage as (typeof MATCH_STAGE_ORDER)[number],
    );
    const targetIndex = MATCH_STAGE_ORDER.indexOf(
      targetStage as (typeof MATCH_STAGE_ORDER)[number],
    );
    const buyerInterestedIndex = MATCH_STAGE_ORDER.indexOf(
      MatchStage.BUYER_INTERESTED,
    );
    const viewingConfirmedIndex = MATCH_STAGE_ORDER.indexOf(
      MatchStage.VIEWING_CONFIRMED,
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

    if (
      targetStage === MatchStage.VIEWING &&
      currentIndex >= 0 &&
      currentIndex < viewingConfirmedIndex
    ) {
      throw new BadRequestException(
        '집주인·점유자의 임장 가능 확인을 먼저 완료해 주세요',
      );
    }

    if (
      targetStage !== MatchStage.CLOSED &&
      currentIndex >= 0 &&
      targetIndex > currentIndex + 1
    ) {
      throw new BadRequestException(
        '현재 단계의 다음 업무를 먼저 완료해 주세요',
      );
    }

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
          throw new NotFoundException('Match not found');
        }
        if (expectedUpdatedAt) {
          throw new ConflictException('다른 사용자가 먼저 수정했습니다.');
        }
        throw new NotFoundException('Match not found');
      }
      throw error;
    }
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
      throw new BadRequestException('expectedUpdatedAt must be a valid date');
    }
    return parsed;
  }
}

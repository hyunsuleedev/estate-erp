import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DONE_DEAL_STAGES, formatUnitName } from '@estate-erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  appendIntakeStep,
  listingIntakeStepTitle,
  type CaseIntakeKind,
} from './project-membership';

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

const MAX_TITLE_LENGTH = 100;
const MAX_MEMO_LENGTH = 2_000;
const MAX_STEPS_PER_PROJECT = 50;
/** 목록 한 쪽의 프로젝트 수. 끝낸 프로젝트까지 모두 쪽을 넘겨 볼 수 있다. */
const DEFAULT_PROJECT_PAGE = 50;
const MAX_PROJECT_PAGE = 100;
const PROJECT_LIST_STATUSES = ['open', 'archived', 'all'];
const PROJECT_LIST_SORTS = ['updated', 'created'];

/** 단계가 가리키는 거래에서 읽는 것. 금액은 표시용이고 자금 계산은 하지 않는다. */
const dealFlowSelect = {
  id: true,
  stage: true,
  isCancelled: true,
  transactionType: true,
  agreedPrice: true,
  agreedDeposit: true,
  agreedMonthlyRent: true,
  createdAt: true,
  buyerContact: { select: { name: true } },
  sellerContact: { select: { name: true } },
  listing: {
    select: {
      intakeId: true,
      property: {
        select: {
          site: { select: { name: true } },
          unit: {
            select: {
              name: true, floor: true, floorEnd: true, floorLabel: true,
              dong: { select: { name: true, isPlaceholder: true } },
            },
          },
        },
      },
    },
  },
  payments: {
    where: { kind: 'balance' },
    orderBy: { sequence: 'asc' as const },
    select: { scheduledDate: true, paidAt: true, status: true },
    take: 1,
  },
  contract: { select: { statedBalanceDate: true } },
} satisfies Prisma.DealSelect;

type DealFlowRow = Prisma.DealGetPayload<{ select: typeof dealFlowSelect }>;

const personSelect = {
  id: true,
  name: true,
  phones: {
    orderBy: [{ isPrimary: 'desc' as const }, { createdAt: 'asc' as const }],
    take: 1,
    select: { phone: true },
  },
} satisfies Prisma.ContactSelect;

/** 매물 의뢰의 당사자로 보는 소유 관계 (고객 원장과 같은 기준) */
const OWNER_ROLES = ['owner', 'co_owner'];

const caseDetailInclude = {
  primaryContact: { select: personSelect },
  assignedTo: { select: { id: true, name: true } },
  _count: { select: { comments: true } },
  steps: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      listingIntake: {
        select: {
          id: true,
          propertyId: true,
          lifecycleStatus: true,
          closedReason: true,
          property: {
            select: {
              site: { select: { name: true } },
              unit: {
                select: {
                  name: true, floor: true, floorEnd: true, floorLabel: true,
                  dong: { select: { name: true, isPlaceholder: true } },
                },
              },
              propertyContacts: {
                where: { status: 'active', role: { in: OWNER_ROLES } },
                orderBy: [
                  { isPrimary: 'desc' as const },
                  { createdAt: 'asc' as const },
                ],
                select: { contact: { select: personSelect } },
              },
            },
          },
          listings: {
            orderBy: { createdAt: 'asc' as const },
            select: {
              id: true,
              transactionType: true,
              price: true,
              deposit: true,
              monthlyRent: true,
              isPaused: true,
              _count: { select: { matches: true } },
              deals: {
                orderBy: { createdAt: 'desc' as const },
                select: dealFlowSelect,
              },
            },
          },
        },
      },
      buyerIntake: {
        select: {
          id: true,
          lifecycleStatus: true,
          contacts: {
            orderBy: [
              { isPrimary: 'desc' as const },
              { createdAt: 'asc' as const },
            ],
            select: { contact: { select: personSelect } },
          },
          requirements: {
            orderBy: { priorityRank: 'asc' as const },
            select: {
              id: true,
              status: true,
              transactionType: true,
              _count: { select: { matches: true } },
            },
          },
          deals: {
            orderBy: { createdAt: 'desc' as const },
            select: dealFlowSelect,
          },
        },
      },
      deal: { select: dealFlowSelect },
    },
  },
} satisfies Prisma.ProjectInclude;

type CaseDetail = Prisma.ProjectGetPayload<{
  include: typeof caseDetailInclude;
}>;
type StepRow = CaseDetail['steps'][number];

interface PropertyLabelSource {
  site: { name: string };
  unit: {
    name: string | null;
    floor?: number | null;
    floorEnd?: number | null;
    floorLabel?: string | null;
    dong: { name: string; isPlaceholder: boolean } | null;
  } | null;
}

function propertyLabel(property: PropertyLabelSource | null | undefined) {
  if (!property) return null;
  const dong = property.unit?.dong;
  return [
    property.site.name,
    dong && !dong.isPlaceholder
      ? dong.name.endsWith('동')
        ? dong.name
        : `${dong.name}동`
      : null,
    // 호가 없는 공간은 층이 이름이다
    formatUnitName(property.unit) || null,
  ]
    .filter(Boolean)
    .join(' ');
}

function presentDeal(deal: DealFlowRow) {
  const balance = deal.payments[0];
  return {
    id: deal.id,
    stage: deal.stage,
    isCancelled: deal.isCancelled,
    transactionType: deal.transactionType,
    agreedPrice: deal.agreedPrice,
    agreedDeposit: deal.agreedDeposit,
    agreedMonthlyRent: deal.agreedMonthlyRent,
    propertyLabel: propertyLabel(deal.listing?.property),
    buyerName: deal.buyerContact?.name ?? null,
    sellerName: deal.sellerContact?.name ?? null,
    /** 잔금 예정일. 대금 일정에 없으면 계약서의 잔금일을 쓴다. */
    balanceDate:
      balance?.scheduledDate ?? deal.contract?.statedBalanceDate ?? null,
    balancePaidAt: balance?.paidAt ?? null,
  };
}

/** 한 의뢰의 현재 거래: 취소되지 않은 거래 중 가장 최근 것. */
function currentDeal(deals: DealFlowRow[]) {
  return deals.find((deal) => !deal.isCancelled) ?? null;
}

function isDealDone(deal: DealFlowRow | null) {
  return Boolean(
    deal &&
      !deal.isCancelled &&
      (DONE_DEAL_STAGES as readonly string[]).includes(deal.stage),
  );
}

/**
 * 프로젝트와 진행 계획.
 *
 * 프로젝트는 사용자가 의뢰를 골라 묶을 때만 생긴다. 프로젝트에 담긴 의뢰는 진행 계획에 단계가
 * 하나씩 있다(담기면 단계가 생기고, 그 단계를 지우면 프로젝트에서 빠진다). 단계의 진행
 * 상태와 잔금일은 저장하지 않고 의뢰·거래에서 읽는다.
 */
@Injectable()
export class ProjectPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    officeId: string,
    dto: {
      title?: string | null;
      memo?: string | null;
      primaryContactId?: string | null;
      assignedToId?: string | null;
      listingIntakeIds?: string[];
      buyerIntakeIds?: string[];
    },
  ) {
    const listingIntakeIds = [...new Set(dto.listingIntakeIds ?? [])];
    const buyerIntakeIds = [...new Set(dto.buyerIntakeIds ?? [])];
    const primaryContactId = dto.primaryContactId ?? null;
    const assignedToId = dto.assignedToId ?? null;
    // 누구의 일인지는 있어야 한다: 대표 고객을 정하거나, 사람이 딸린 의뢰를 담는다.
    if (
      listingIntakeIds.length + buyerIntakeIds.length === 0 &&
      !primaryContactId
    ) {
      throw new BadRequestException(
        '대표 고객을 정하거나 프로젝트에 담을 의뢰를 하나 이상 고르세요.',
      );
    }
    if (listingIntakeIds.length + buyerIntakeIds.length > MAX_STEPS_PER_PROJECT) {
      throw new BadRequestException(
        `한 프로젝트에는 의뢰를 ${MAX_STEPS_PER_PROJECT}개까지 담을 수 있습니다.`,
      );
    }
    const title = this.normalizeText(dto.title, MAX_TITLE_LENGTH, '제목');
    const memo = this.normalizeText(dto.memo, MAX_MEMO_LENGTH, '메모');

    const projectId = await this.prisma.$transaction(async (tx) => {
      if (primaryContactId) {
        await this.assertContact(tx, officeId, primaryContactId);
      }
      if (assignedToId) await this.assertStaff(tx, officeId, assignedToId);
      const created = await tx.project.create({
        data: { officeId, title, memo, primaryContactId, assignedToId },
        select: { id: true },
      });
      // 접수된 순서대로 단계를 만든다. 순서는 사용자가 나중에 바꾼다.
      const intakes = await this.readIntakesForAttach(
        tx,
        officeId,
        listingIntakeIds,
        buyerIntakeIds,
      );
      for (const intake of intakes) {
        await this.attachIntake(tx, officeId, created.id, intake);
      }
      return created.id;
    });
    return this.findOne(projectId, officeId);
  }

  /**
   * 프로젝트 목록. 고객 원장은 진행 중인 의뢰만 보여 주므로, 의뢰가 모두 종료된 프로젝트나
   * 거래·직접 추가 단계만 있는 프로젝트, 의뢰 없이 사람만으로 연 프로젝트는 원장에 줄이 없다.
   * 그런 프로젝트도 여기서는 모두 나온다.
   *
   * status: open(기본, 끝내지 않은 것) · archived(끝낸 것) · all.
   * sort: updated(기본, 최근 고친 순) · created(최근 시작한 순). offset·limit으로 쪽을 넘긴다.
   * 줄마다 진행 계획을 읽어 "몇 단계 중 몇 단계가 끝났나"를 계산한다(저장하지 않는다).
   */
  async findAll(
    officeId: string,
    query: {
      status?: string;
      search?: string;
      assignedToId?: string;
      sort?: string;
      offset?: number;
      limit?: number;
    } = {},
  ) {
    const status = query.status ?? 'open';
    if (!PROJECT_LIST_STATUSES.includes(status)) {
      throw new BadRequestException('status 값이 올바르지 않습니다.');
    }
    const sort = query.sort ?? 'updated';
    if (!PROJECT_LIST_SORTS.includes(sort)) {
      throw new BadRequestException('sort 값이 올바르지 않습니다.');
    }
    const offset = query.offset ?? 0;
    const limit = query.limit ?? DEFAULT_PROJECT_PAGE;
    if (
      !Number.isInteger(offset) ||
      offset < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > MAX_PROJECT_PAGE
    ) {
      throw new BadRequestException('offset·limit 값이 올바르지 않습니다.');
    }
    const search = query.search?.trim();
    const where: Prisma.ProjectWhereInput = {
      officeId,
      ...(status === 'open' ? { archivedAt: null } : {}),
      ...(status === 'archived' ? { archivedAt: { not: null } } : {}),
      ...(query.assignedToId ? { assignedToId: query.assignedToId } : {}),
      ...(search
        ? {
            OR: [
              { title: { contains: search, mode: 'insensitive' } },
              {
                primaryContact: {
                  name: { contains: search, mode: 'insensitive' },
                },
              },
              {
                buyerIntakes: {
                  some: {
                    contacts: {
                      some: {
                        contact: {
                          name: { contains: search, mode: 'insensitive' },
                        },
                      },
                    },
                  },
                },
              },
              {
                listingIntakes: {
                  some: {
                    property: {
                      propertyContacts: {
                        some: {
                          status: 'active',
                          role: { in: OWNER_ROLES },
                          contact: {
                            name: { contains: search, mode: 'insensitive' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };
    const [total, projects] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        // 같은 시각이면 id로 순서를 고정한다(쪽을 넘길 때 줄이 겹치거나 빠지지 않게).
        orderBy: [
          sort === 'created' ? { createdAt: 'desc' } : { updatedAt: 'desc' },
          { id: 'asc' },
        ],
        skip: offset,
        take: limit,
        include: {
          ...caseDetailInclude,
          comments: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: {
              body: true,
              createdAt: true,
              author: { select: { name: true } },
            },
          },
        },
      }),
    ]);
    return {
      total,
      /** 다음 쪽의 offset. 더 없으면 null. */
      nextOffset: offset + projects.length < total ? offset + projects.length : null,
      items: projects.map((project) => {
        const detail = this.present(project);
        const nextStep = detail.steps.find((step) => !step.done) ?? null;
        const latestComment = project.comments[0] ?? null;
        return {
          id: detail.id,
          title: detail.title,
          memo: detail.memo,
          archivedAt: detail.archivedAt,
          createdAt: detail.createdAt,
          updatedAt: detail.updatedAt,
          primaryContact: detail.primaryContact,
          assignedTo: detail.assignedTo,
          /** 대표 고객. 정하지 않았으면 담긴 의뢰의 첫 당사자. 둘 다 없으면 null. */
          customerName: detail.people[0]?.name ?? null,
          peopleCount: detail.people.length,
          buyerIntakeCount: detail.steps.filter(
            (step) => step.kind === 'buyer_intake',
          ).length,
          listingIntakeCount: detail.steps.filter(
            (step) => step.kind === 'listing_intake',
          ).length,
          stepCount: detail.steps.length,
          doneStepCount: detail.steps.filter((step) => step.done).length,
          firstStepTitle: detail.steps[0]?.title ?? null,
          /** 아직 끝나지 않은 첫 단계. 모두 끝났거나 단계가 없으면 null. */
          nextStepTitle: nextStep?.title ?? null,
          nextStepTargetDate: nextStep?.targetDate ?? null,
          commentCount: detail.commentCount,
          latestComment: latestComment
            ? {
                body: latestComment.body,
                createdAt: latestComment.createdAt,
                authorName: latestComment.author?.name ?? null,
              }
            : null,
        };
      }),
    };
  }

  async findOne(id: string, officeId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id, officeId },
      include: caseDetailInclude,
    });
    if (!project) {
      throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
    }
    return this.present(project);
  }

  async update(
    id: string,
    officeId: string,
    dto: {
      title?: string | null;
      memo?: string | null;
      archived?: boolean;
      primaryContactId?: string | null;
      assignedToId?: string | null;
    },
  ) {
    await this.assertCase(this.prisma, officeId, id);
    if (dto.primaryContactId) {
      await this.assertContact(this.prisma, officeId, dto.primaryContactId);
    }
    if (dto.assignedToId) {
      await this.assertStaff(this.prisma, officeId, dto.assignedToId);
    }
    await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.primaryContactId !== undefined
          ? { primaryContactId: dto.primaryContactId }
          : {}),
        ...(dto.assignedToId !== undefined
          ? { assignedToId: dto.assignedToId }
          : {}),
        ...(dto.title !== undefined
          ? { title: this.normalizeText(dto.title, MAX_TITLE_LENGTH, '제목') }
          : {}),
        ...(dto.memo !== undefined
          ? { memo: this.normalizeText(dto.memo, MAX_MEMO_LENGTH, '메모') }
          : {}),
        ...(dto.archived !== undefined
          ? { archivedAt: dto.archived ? new Date() : null }
          : {}),
      },
    });
    return this.findOne(id, officeId);
  }

  /** 묶음을 푼다. 의뢰와 거래는 그대로 남고 프로젝트와 진행 계획, 프로젝트에 적은 코멘트가 없어진다. */
  async remove(id: string, officeId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.assertCase(tx, officeId, id);
      // 단계가 의뢰의 (프로젝트, 의뢰) 조합을 가리키므로 단계부터 지워야 의뢰를 뺄 수 있다.
      await tx.projectStep.deleteMany({
        where: { officeId, projectId: id },
      });
      await tx.listingIntake.updateMany({
        where: { officeId, projectId: id },
        data: { projectId: null },
      });
      await tx.buyerIntake.updateMany({
        where: { officeId, projectId: id },
        data: { projectId: null },
      });
      await tx.project.delete({ where: { id } });
    });
    return { success: true };
  }

  /** 의뢰를 프로젝트에 담는다. 진행 계획의 맨 끝 단계로 들어간다. */
  async addIntake(
    id: string,
    officeId: string,
    dto: { kind: CaseIntakeKind; intakeId: string },
  ) {
    if (dto.kind !== 'listing' && dto.kind !== 'buyer') {
      throw new BadRequestException('의뢰 종류가 올바르지 않습니다.');
    }
    await this.prisma.$transaction(async (tx) => {
      await this.assertCase(tx, officeId, id);
      await this.assertStepRoom(tx, officeId, id);
      const [intake] = await this.readIntakesForAttach(
        tx,
        officeId,
        dto.kind === 'listing' ? [dto.intakeId] : [],
        dto.kind === 'buyer' ? [dto.intakeId] : [],
      );
      if (!intake) throw new NotFoundException('의뢰를 찾을 수 없습니다.');
      await this.attachIntake(tx, officeId, id, intake);
    });
    return this.findOne(id, officeId);
  }

  /**
   * 의뢰를 가리키지 않는 단계를 만든다. 거래를 직접 가리키거나("의뢰 없이 바로 한
   * 계약"), 아무것도 가리키지 않는다("대출 실행", "이사").
   */
  async createStep(
    id: string,
    officeId: string,
    dto: {
      title?: string;
      targetDate?: string | null;
      memo?: string | null;
      dealId?: string | null;
    },
  ) {
    const memo = this.normalizeText(dto.memo, MAX_MEMO_LENGTH, '메모');
    const targetDate = this.parseDate(dto.targetDate);
    await this.prisma.$transaction(async (tx) => {
      await this.assertCase(tx, officeId, id);
      await this.assertStepRoom(tx, officeId, id);
      let title = this.normalizeText(dto.title, MAX_TITLE_LENGTH, '제목');
      if (dto.dealId) {
        const deal = await this.assertDealCanBeStep(tx, officeId, id, dto.dealId);
        title ??= this.dealStepTitle(deal);
      }
      if (!title) throw new BadRequestException('단계 제목을 입력하세요.');
      const last = await tx.projectStep.aggregate({
        where: { officeId, projectId: id },
        _max: { sortOrder: true },
      });
      await tx.projectStep.create({
        data: {
          officeId,
          projectId: id,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
          title,
          dealId: dto.dealId ?? null,
          targetDate,
          memo,
        },
      });
      await tx.project.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
    });
    return this.findOne(id, officeId);
  }

  async updateStep(
    id: string,
    stepId: string,
    officeId: string,
    dto: {
      title?: string;
      targetDate?: string | null;
      memo?: string | null;
      /** 아무것도 가리키지 않는 단계에만 쓴다. */
      done?: boolean;
    },
  ) {
    const step = await this.prisma.projectStep.findFirst({
      where: { id: stepId, officeId, projectId: id },
    });
    if (!step) throw new NotFoundException('단계를 찾을 수 없습니다.');

    const data: Prisma.ProjectStepUpdateInput = {};
    if (dto.title !== undefined) {
      const title = this.normalizeText(dto.title, MAX_TITLE_LENGTH, '제목');
      if (!title) throw new BadRequestException('단계 제목을 입력하세요.');
      data.title = title;
    }
    if (dto.targetDate !== undefined) {
      data.targetDate = this.parseDate(dto.targetDate);
    }
    if (dto.memo !== undefined) {
      data.memo = this.normalizeText(dto.memo, MAX_MEMO_LENGTH, '메모');
    }
    if (dto.done !== undefined) {
      if (step.listingIntakeId || step.buyerIntakeId || step.dealId) {
        throw new BadRequestException(
          '의뢰나 거래를 가리키는 단계의 완료 여부는 거래 단계에서 정해집니다.',
        );
      }
      data.doneAt = dto.done ? (step.doneAt ?? new Date()) : null;
    }
    await this.prisma.projectStep.update({ where: { id: stepId }, data });
    return this.findOne(id, officeId);
  }

  /** 단계를 지운다. 의뢰를 가리키는 단계였다면 그 의뢰도 프로젝트에서 빠진다. */
  async removeStep(id: string, stepId: string, officeId: string) {
    await this.prisma.$transaction(async (tx) => {
      const step = await tx.projectStep.findFirst({
        where: { id: stepId, officeId, projectId: id },
      });
      if (!step) throw new NotFoundException('단계를 찾을 수 없습니다.');
      await tx.projectStep.delete({ where: { id: stepId } });
      if (step.listingIntakeId) {
        await tx.listingIntake.updateMany({
          where: { id: step.listingIntakeId, officeId, projectId: id },
          data: { projectId: null },
        });
      }
      if (step.buyerIntakeId) {
        await tx.buyerIntake.updateMany({
          where: { id: step.buyerIntakeId, officeId, projectId: id },
          data: { projectId: null },
        });
      }
      await tx.project.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
    });
    return this.findOne(id, officeId);
  }

  /**
   * 사용자가 정한 순서를 저장한다. 프로젝트의 모든 단계를 빠짐없이 보내야 한다
   * (일부만 받으면 다른 화면에서 추가된 단계의 순서가 뒤섞인다).
   * 같은 번호는 동시 진행이다.
   */
  async reorderSteps(
    id: string,
    officeId: string,
    dto: { steps: Array<{ id: string; sortOrder: number }> },
  ) {
    const steps = Array.isArray(dto.steps) ? dto.steps : [];
    for (const step of steps) {
      if (
        typeof step?.id !== 'string' ||
        !Number.isInteger(step.sortOrder) ||
        step.sortOrder < 1 ||
        step.sortOrder > MAX_STEPS_PER_PROJECT
      ) {
        throw new BadRequestException('단계 순서가 올바르지 않습니다.');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await this.assertCase(tx, officeId, id);
      const existing = await tx.projectStep.findMany({
        where: { officeId, projectId: id },
        select: { id: true },
      });
      const sent = new Set(steps.map((step) => step.id));
      if (
        sent.size !== steps.length ||
        sent.size !== existing.length ||
        existing.some((step) => !sent.has(step.id))
      ) {
        throw new ConflictException(
          '진행 계획이 다른 곳에서 바뀌었습니다. 다시 불러온 뒤 순서를 정해 주세요.',
        );
      }
      for (const step of steps) {
        await tx.projectStep.update({
          where: { id: step.id },
          data: { sortOrder: step.sortOrder },
        });
      }
      await tx.project.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
    });
    return this.findOne(id, officeId);
  }

  /**
   * 이 프로젝트에 더 담을 만한 것: 프로젝트에 담긴 의뢰의 당사자와 같은 사람의, 아직 어느 프로젝트에도
   * 담기지 않은 의뢰(이미 종료된 것 포함 — 거래가 끝난 의뢰도 흐름에 넣을 수 있어야
   * 한다)와, 이 프로젝트의 의뢰 단계에 나오지 않는 거래. 제안일 뿐이고 담는 것은
   * 사용자가 한다.
   */
  async findCandidates(id: string, officeId: string) {
    await this.assertCase(this.prisma, officeId, id);
    const [project, buyerContacts, ownerContacts] = await Promise.all([
      this.prisma.project.findFirst({
        where: { id, officeId },
        select: { primaryContactId: true },
      }),
      this.prisma.buyerIntakeContact.findMany({
        where: { officeId, buyerIntake: { projectId: id } },
        select: { contactId: true },
      }),
      this.prisma.propertyContact.findMany({
        where: {
          officeId,
          status: 'active',
          property: { listingIntakes: { some: { projectId: id } } },
        },
        select: { contactId: true },
      }),
    ]);
    // 대표 고객만 정하고 연 프로젝트도 그 사람의 의뢰를 담을 수 있어야 한다.
    const contactIds = [
      ...new Set([
        ...(project?.primaryContactId ? [project.primaryContactId] : []),
        ...[...buyerContacts, ...ownerContacts].map((item) => item.contactId),
      ]),
    ];
    if (contactIds.length === 0) {
      return { listingIntakes: [], buyerIntakes: [], deals: [] };
    }

    const [listingIntakes, buyerIntakes, deals] = await Promise.all([
      this.prisma.listingIntake.findMany({
        where: {
          officeId,
          // 어느 프로젝트에도 없거나, 보관한 프로젝트에 남아 있는 의뢰.
          OR: [
            { projectId: null },
            { project: { archivedAt: { not: null } } },
          ],
          property: {
            propertyContacts: {
              some: { status: 'active', contactId: { in: contactIds } },
            },
          },
        },
        orderBy: { receivedAt: 'desc' },
        take: 30,
        select: {
          id: true,
          lifecycleStatus: true,
          property: {
            select: {
              site: { select: { name: true } },
              unit: {
                select: {
                  name: true, floor: true, floorEnd: true, floorLabel: true,
                  dong: { select: { name: true, isPlaceholder: true } },
                },
              },
            },
          },
          listings: { select: { transactionType: true } },
        },
      }),
      this.prisma.buyerIntake.findMany({
        where: {
          officeId,
          // 어느 프로젝트에도 없거나, 보관한 프로젝트에 남아 있는 의뢰.
          OR: [
            { projectId: null },
            { project: { archivedAt: { not: null } } },
          ],
          contacts: { some: { contactId: { in: contactIds } } },
        },
        orderBy: { receivedAt: 'desc' },
        take: 30,
        select: {
          id: true,
          lifecycleStatus: true,
          contacts: {
            orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
            select: { contact: { select: { name: true } } },
          },
          requirements: {
            orderBy: { priorityRank: 'asc' },
            select: { transactionType: true },
          },
        },
      }),
      // 이 프로젝트의 의뢰 단계에 이미 나오는 거래와, 이미 단계로 넣은 거래만 뺀다.
      // (구매 의뢰가 있더라도 그 의뢰가 이 프로젝트에 없으면 거래를 직접 담을 수 있다.)
      this.prisma.deal.findMany({
        where: {
          officeId,
          isCancelled: false,
          OR: [
            { buyerContactId: { in: contactIds } },
            { sellerContactId: { in: contactIds } },
          ],
          NOT: [
            { buyerIntake: { projectId: id } },
            { listing: { intake: { projectId: id } } },
          ],
          projectSteps: { none: { projectId: id } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: dealFlowSelect,
      }),
    ]);

    return {
      listingIntakes: listingIntakes.map((intake) => ({
        id: intake.id,
        label: propertyLabel(intake.property) ?? '매물 의뢰',
        lifecycleStatus: intake.lifecycleStatus,
        transactionTypes: [
          ...new Set(intake.listings.map((item) => item.transactionType)),
        ],
      })),
      buyerIntakes: buyerIntakes.map((intake) => ({
        id: intake.id,
        label: intake.contacts[0]?.contact.name ?? '구매 의뢰',
        lifecycleStatus: intake.lifecycleStatus,
        transactionTypes: [
          ...new Set(
            intake.requirements.flatMap((item) =>
              item.transactionType ? [item.transactionType] : [],
            ),
          ),
        ],
      })),
      deals: deals.map(presentDeal),
    };
  }

  // ─── 내부 ────────────────────────────────────────────────────

  private async assertCase(
    client: Pick<Prisma.TransactionClient, 'project'>,
    officeId: string,
    id: string,
  ) {
    const found = await client.project.findFirst({
      where: { id, officeId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('프로젝트를 찾을 수 없습니다.');
  }

  private async assertContact(
    client: Pick<Prisma.TransactionClient, 'contact'>,
    officeId: string,
    contactId: string,
  ) {
    const found = await client.contact.findFirst({
      where: { id: contactId, officeId },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('대표 고객을 찾을 수 없습니다.');
  }

  private async assertStaff(
    client: Pick<Prisma.TransactionClient, 'user'>,
    officeId: string,
    userId: string,
  ) {
    const found = await client.user.findFirst({
      where: { id: userId, officeId, isActive: true },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('담당 직원을 찾을 수 없습니다.');
  }

  private async assertStepRoom(
    tx: Prisma.TransactionClient,
    officeId: string,
    id: string,
  ) {
    const count = await tx.projectStep.count({
      where: { officeId, projectId: id },
    });
    if (count >= MAX_STEPS_PER_PROJECT) {
      throw new BadRequestException(
        `한 프로젝트의 진행 계획은 ${MAX_STEPS_PER_PROJECT}단계까지 만들 수 있습니다.`,
      );
    }
  }

  /** 담을 의뢰를 읽어 접수 순으로 돌려준다. 하나라도 없으면 거절한다. */
  private async readIntakesForAttach(
    tx: Prisma.TransactionClient,
    officeId: string,
    listingIntakeIds: string[],
    buyerIntakeIds: string[],
  ) {
    const [listingIntakes, buyerIntakes] = await Promise.all([
      listingIntakeIds.length
        ? tx.listingIntake.findMany({
            where: { officeId, id: { in: listingIntakeIds } },
            select: {
              id: true,
              projectId: true,
              propertyId: true,
              receivedAt: true,
            },
          })
        : [],
      buyerIntakeIds.length
        ? tx.buyerIntake.findMany({
            where: { officeId, id: { in: buyerIntakeIds } },
            select: {
              id: true,
              projectId: true,
              receivedAt: true,
              requirements: {
                orderBy: { priorityRank: 'asc' },
                select: { transactionType: true },
                take: 1,
              },
            },
          })
        : [],
    ]);
    if (
      listingIntakes.length !== listingIntakeIds.length ||
      buyerIntakes.length !== buyerIntakeIds.length
    ) {
      throw new NotFoundException('묶으려는 의뢰를 찾을 수 없습니다.');
    }
    return [
      ...listingIntakes.map((intake) => ({
        kind: 'listing' as const,
        id: intake.id,
        projectId: intake.projectId,
        receivedAt: intake.receivedAt,
        propertyId: intake.propertyId,
        transactionType: null as string | null,
      })),
      ...buyerIntakes.map((intake) => ({
        kind: 'buyer' as const,
        id: intake.id,
        projectId: intake.projectId,
        receivedAt: intake.receivedAt,
        propertyId: null as string | null,
        transactionType: intake.requirements[0]?.transactionType ?? null,
      })),
    ].sort(
      (left, right) =>
        left.receivedAt.getTime() - right.receivedAt.getTime() ||
        left.id.localeCompare(right.id),
    );
  }

  private async attachIntake(
    tx: Prisma.TransactionClient,
    officeId: string,
    projectId: string,
    intake: {
      kind: CaseIntakeKind;
      id: string;
      projectId: string | null;
      propertyId: string | null;
      transactionType: string | null;
    },
  ) {
    // 보관한 프로젝트에서 옮겨 오는 의뢰의 옛 단계. 새 프로젝트의 단계가 제목·목표일·메모를 이어받는다.
    let carried: {
      title: string;
      targetDate: Date | null;
      memo: string | null;
    } | null = null;
    if (intake.projectId && intake.projectId !== projectId) {
      const other = await tx.project.findFirst({
        where: { id: intake.projectId, officeId },
        select: { archivedAt: true },
      });
      // 진행 중인 다른 프로젝트에 담긴 의뢰는 옮기지 않는다. 보관한 프로젝트에 남아 있는 의뢰는
      // 고객 원장에 프로젝트 없는 의뢰로 보이므로(다시 꺼낼 화면이 없다) 새 프로젝트로 옮긴다.
      if (other && other.archivedAt === null) {
        throw new ConflictException(
          '이미 다른 프로젝트에 담긴 의뢰입니다. 그 프로젝트에서 먼저 빼 주세요.',
        );
      }
      // 보관한 프로젝트의 진행 계획은 지난 기록이다. 그 단계를 지우지 않고, 의뢰를 가리키는
      // 연결만 끊어 제목·목표일·메모가 적힌 기록으로 남긴다. 연결을 그대로 두면 의뢰의
      // 프로젝트를 바꿀 때 단계가 새 프로젝트로 딸려 가 옛 기록에서 사라진다.
      const intakeTarget =
        intake.kind === 'listing'
          ? { listingIntakeId: intake.id }
          : { buyerIntakeId: intake.id };
      const previousSteps = await tx.projectStep.findMany({
        where: {
          officeId,
          projectId: intake.projectId,
          ...intakeTarget,
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: { id: true, title: true, targetDate: true, memo: true },
      });
      carried = previousSteps[0] ?? null;
      if (previousSteps.length > 0) {
        // 의뢰를 가리키는 단계의 완료 여부는 거래에서 읽어 왔다. 연결을 끊으면 읽을 곳이
        // 없어지므로, 지금 완료 상태였다면 그 사실을 기록에 적어 둔다(완료였던 단계가
        // 미완료로 바뀌어 보이지 않게).
        const completedAt = await this.readIntakeDoneAt(tx, officeId, intake);
        await tx.projectStep.updateMany({
          where: { id: { in: previousSteps.map((step) => step.id) } },
          data: {
            ...(intake.kind === 'listing'
              ? { listingIntakeId: null }
              : { buyerIntakeId: null }),
            doneAt: completedAt,
          },
        });
      }
    }
    if (intake.kind === 'listing') {
      await tx.listingIntake.update({
        where: { id: intake.id },
        data: { projectId },
      });
    } else {
      await tx.buyerIntake.update({
        where: { id: intake.id },
        data: { projectId },
      });
    }
    const typeLabel = intake.transactionType
      ? TRANSACTION_TYPE_LABELS[intake.transactionType]
      : null;
    await appendIntakeStep(tx, {
      officeId,
      projectId,
      kind: intake.kind,
      intakeId: intake.id,
      title:
        carried?.title ??
        (intake.kind === 'listing' && intake.propertyId
          ? await listingIntakeStepTitle(tx, intake.propertyId)
          : typeLabel
            ? `${typeLabel} 구매 의뢰`
            : '구매 의뢰'),
      targetDate: carried?.targetDate,
      memo: carried?.memo,
    });
  }

  /**
   * 의뢰의 현재 거래(취소되지 않은 가장 최근 거래)가 완료 단계면 그 시각, 아니면 null.
   * 단계 표시(presentStep)가 완료 여부를 정하는 기준과 같다.
   */
  private async readIntakeDoneAt(
    tx: Prisma.TransactionClient,
    officeId: string,
    intake: { kind: CaseIntakeKind; id: string },
  ): Promise<Date | null> {
    const deal = await tx.deal.findFirst({
      where: {
        officeId,
        isCancelled: false,
        ...(intake.kind === 'listing'
          ? { listing: { intakeId: intake.id } }
          : { buyerIntakeId: intake.id }),
      },
      orderBy: { createdAt: 'desc' },
      select: { stage: true, stageChangedAt: true },
    });
    return deal && (DONE_DEAL_STAGES as readonly string[]).includes(deal.stage)
      ? deal.stageChangedAt
      : null;
  }

  /**
   * 거래를 직접 가리키는 단계는 의뢰를 거치지 않은 거래에만 쓴다. 이 프로젝트에 담긴
   * 의뢰에서 나온 거래는 그 의뢰의 단계에 이미 보이므로 두 줄로 넣지 못하게 한다.
   */
  private async assertDealCanBeStep(
    tx: Prisma.TransactionClient,
    officeId: string,
    projectId: string,
    dealId: string,
  ) {
    const deal = await tx.deal.findFirst({
      where: { id: dealId, officeId },
      select: {
        ...dealFlowSelect,
        buyerIntake: { select: { projectId: true } },
        listing: {
          select: {
            ...dealFlowSelect.listing.select,
            intake: { select: { projectId: true } },
          },
        },
      },
    });
    if (!deal) throw new NotFoundException('거래를 찾을 수 없습니다.');
    if (
      deal.buyerIntake?.projectId === projectId ||
      deal.listing?.intake.projectId === projectId
    ) {
      throw new ConflictException(
        '이 거래는 프로젝트에 담긴 의뢰의 단계에 이미 나옵니다.',
      );
    }
    const existing = await tx.projectStep.findFirst({
      where: { projectId, dealId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('이미 진행 계획에 있는 거래입니다.');
    }
    return deal;
  }

  private dealStepTitle(deal: DealFlowRow) {
    return [
      propertyLabel(deal.listing?.property),
      TRANSACTION_TYPE_LABELS[deal.transactionType] ?? null,
      '거래',
    ]
      .filter(Boolean)
      .join(' ');
  }

  private normalizeText(
    value: string | null | undefined,
    maxLength: number,
    label: string,
  ) {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${label} 값이 올바르지 않습니다.`);
    }
    const trimmed = value.trim();
    if (trimmed.length > maxLength) {
      throw new BadRequestException(
        `${label}은(는) ${maxLength}자까지 입력할 수 있습니다.`,
      );
    }
    return trimmed || null;
  }

  private parseDate(value: string | null | undefined) {
    if (value === undefined || value === null || value === '') return null;
    const date = new Date(value);
    if (typeof value !== 'string' || Number.isNaN(date.getTime())) {
      throw new BadRequestException('목표일이 올바르지 않습니다.');
    }
    return date;
  }

  private presentStep(step: StepRow) {
    const base = {
      id: step.id,
      sortOrder: step.sortOrder,
      title: step.title,
      targetDate: step.targetDate,
      memo: step.memo,
    };

    if (step.listingIntake) {
      const intake = step.listingIntake;
      const deal = currentDeal(
        intake.listings
          .flatMap((listing) => listing.deals)
          .sort(
            (left, right) =>
              right.createdAt.getTime() - left.createdAt.getTime(),
          ),
      );
      return {
        ...base,
        kind: 'listing_intake' as const,
        done: isDealDone(deal),
        doneAt: null,
        listingIntake: {
          id: intake.id,
          propertyId: intake.propertyId,
          label: propertyLabel(intake.property),
          lifecycleStatus: intake.lifecycleStatus,
          closedReason: intake.closedReason,
          listings: intake.listings.map((listing) => ({
            id: listing.id,
            transactionType: listing.transactionType,
            price: listing.price,
            deposit: listing.deposit,
            monthlyRent: listing.monthlyRent,
            isPaused: listing.isPaused,
          })),
          matchCount: intake.listings.reduce(
            (sum, listing) => sum + listing._count.matches,
            0,
          ),
        },
        buyerIntake: null,
        deal: deal ? presentDeal(deal) : null,
      };
    }

    if (step.buyerIntake) {
      const intake = step.buyerIntake;
      const deal = currentDeal(intake.deals);
      return {
        ...base,
        kind: 'buyer_intake' as const,
        done: isDealDone(deal),
        doneAt: null,
        listingIntake: null,
        buyerIntake: {
          id: intake.id,
          label: intake.contacts[0]?.contact.name ?? null,
          contactId: intake.contacts[0]?.contact.id ?? null,
          lifecycleStatus: intake.lifecycleStatus,
          requirements: intake.requirements.map((requirement) => ({
            id: requirement.id,
            status: requirement.status,
            transactionType: requirement.transactionType,
          })),
          matchCount: intake.requirements.reduce(
            (sum, requirement) => sum + requirement._count.matches,
            0,
          ),
        },
        deal: deal ? presentDeal(deal) : null,
      };
    }

    if (step.deal) {
      return {
        ...base,
        kind: 'deal' as const,
        done: isDealDone(step.deal),
        doneAt: null,
        listingIntake: null,
        buyerIntake: null,
        deal: presentDeal(step.deal),
      };
    }

    return {
      ...base,
      kind: 'manual' as const,
      done: step.doneAt !== null,
      doneAt: step.doneAt,
      listingIntake: null,
      buyerIntake: null,
      deal: null,
    };
  }

  private present(project: CaseDetail) {
    const person = (
      contact: { id: string; name: string; phones: Array<{ phone: string }> },
      role: 'primary' | 'buyer' | 'owner',
    ) => ({
      contactId: contact.id,
      name: contact.name,
      phone: contact.phones[0]?.phone ?? null,
      role,
    });
    // 이 프로젝트의 사람들: 대표 고객이 맨 앞, 그다음 담긴 의뢰의 당사자(단계 순서대로).
    // 저장하지 않고 읽을 때마다 모은다. 같은 사람은 한 번만 나온다.
    const people = [
      ...(project.primaryContact
        ? [person(project.primaryContact, 'primary')]
        : []),
      ...project.steps.flatMap((step) => [
        ...(step.buyerIntake?.contacts ?? []).map((item) =>
          person(item.contact, 'buyer'),
        ),
        ...(step.listingIntake?.property.propertyContacts ?? []).map((item) =>
          person(item.contact, 'owner'),
        ),
      ]),
    ].filter(
      (item, index, list) =>
        list.findIndex((other) => other.contactId === item.contactId) === index,
    );
    return {
      id: project.id,
      title: project.title,
      memo: project.memo,
      archivedAt: project.archivedAt,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      primaryContact: project.primaryContact
        ? {
            id: project.primaryContact.id,
            name: project.primaryContact.name,
            phone: project.primaryContact.phones[0]?.phone ?? null,
          }
        : null,
      assignedTo: project.assignedTo,
      people,
      commentCount: project._count.comments,
      steps: project.steps.map((step) => this.presentStep(step)),
    };
  }
}

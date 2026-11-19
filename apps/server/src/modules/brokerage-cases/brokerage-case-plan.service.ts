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
} from './brokerage-case-membership';

const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  sale: '매매',
  jeonse: '전세',
  monthly: '월세',
};

const MAX_TITLE_LENGTH = 100;
const MAX_MEMO_LENGTH = 2_000;
const MAX_STEPS_PER_CASE = 50;

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

const caseDetailInclude = {
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
            select: { contact: { select: { id: true, name: true } } },
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
} satisfies Prisma.BrokerageCaseInclude;

type CaseDetail = Prisma.BrokerageCaseGetPayload<{
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
 * 중개 건과 진행 계획.
 *
 * 건은 사용자가 의뢰를 골라 묶을 때만 생긴다. 건에 담긴 의뢰는 진행 계획에 단계가
 * 하나씩 있다(담기면 단계가 생기고, 그 단계를 지우면 건에서 빠진다). 단계의 진행
 * 상태와 잔금일은 저장하지 않고 의뢰·거래에서 읽는다.
 */
@Injectable()
export class BrokerageCasePlanService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    officeId: string,
    dto: {
      title?: string | null;
      memo?: string | null;
      listingIntakeIds?: string[];
      buyerIntakeIds?: string[];
    },
  ) {
    const listingIntakeIds = [...new Set(dto.listingIntakeIds ?? [])];
    const buyerIntakeIds = [...new Set(dto.buyerIntakeIds ?? [])];
    if (listingIntakeIds.length + buyerIntakeIds.length === 0) {
      throw new BadRequestException('건으로 묶을 의뢰를 하나 이상 고르세요.');
    }
    if (listingIntakeIds.length + buyerIntakeIds.length > MAX_STEPS_PER_CASE) {
      throw new BadRequestException(
        `한 건에는 의뢰를 ${MAX_STEPS_PER_CASE}개까지 묶을 수 있습니다.`,
      );
    }
    const title = this.normalizeText(dto.title, MAX_TITLE_LENGTH, '제목');
    const memo = this.normalizeText(dto.memo, MAX_MEMO_LENGTH, '메모');

    const caseId = await this.prisma.$transaction(async (tx) => {
      const created = await tx.brokerageCase.create({
        data: { officeId, title, memo },
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
    return this.findOne(caseId, officeId);
  }

  /**
   * 보관하지 않은 중개 건 전부. 고객 원장은 진행 중인 의뢰만 보여 주므로, 의뢰가 모두
   * 종료된 건이나 거래·직접 추가 단계만 있는 건은 원장에 줄이 없다. 그런 건의 진행
   * 계획도 열 수 있도록 건 자체의 목록을 따로 준다.
   */
  async findAll(officeId: string) {
    const cases = await this.prisma.brokerageCase.findMany({
      where: { officeId, archivedAt: null },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        title: true,
        updatedAt: true,
        steps: {
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: { title: true },
        },
        buyerIntakes: {
          orderBy: { receivedAt: 'asc' },
          take: 1,
          select: {
            contacts: {
              orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
              take: 1,
              select: { contact: { select: { name: true } } },
            },
          },
        },
        listingIntakes: {
          orderBy: { receivedAt: 'asc' },
          take: 1,
          select: {
            property: {
              select: {
                propertyContacts: {
                  where: { status: 'active' },
                  orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
                  take: 1,
                  select: { contact: { select: { name: true } } },
                },
              },
            },
          },
        },
      },
    });
    return cases.map((item) => ({
      id: item.id,
      title: item.title,
      updatedAt: item.updatedAt,
      stepCount: item.steps.length,
      firstStepTitle: item.steps[0]?.title ?? null,
      /** 건에 담긴 의뢰의 대표 연락 고객. 의뢰가 없는 건은 null. */
      customerName:
        item.buyerIntakes[0]?.contacts[0]?.contact.name ??
        item.listingIntakes[0]?.property.propertyContacts[0]?.contact.name ??
        null,
    }));
  }

  async findOne(id: string, officeId: string) {
    const brokerageCase = await this.prisma.brokerageCase.findFirst({
      where: { id, officeId },
      include: caseDetailInclude,
    });
    if (!brokerageCase) {
      throw new NotFoundException('중개 건을 찾을 수 없습니다.');
    }
    return this.present(brokerageCase);
  }

  async update(
    id: string,
    officeId: string,
    dto: { title?: string | null; memo?: string | null; archived?: boolean },
  ) {
    await this.assertCase(this.prisma, officeId, id);
    await this.prisma.brokerageCase.update({
      where: { id },
      data: {
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

  /** 묶음을 푼다. 의뢰와 거래는 그대로 남고 건과 진행 계획만 없어진다. */
  async remove(id: string, officeId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.assertCase(tx, officeId, id);
      // 단계가 의뢰의 (건, 의뢰) 조합을 가리키므로 단계부터 지워야 의뢰를 뺄 수 있다.
      await tx.brokerageCaseStep.deleteMany({
        where: { officeId, brokerageCaseId: id },
      });
      await tx.listingIntake.updateMany({
        where: { officeId, brokerageCaseId: id },
        data: { brokerageCaseId: null },
      });
      await tx.buyerIntake.updateMany({
        where: { officeId, brokerageCaseId: id },
        data: { brokerageCaseId: null },
      });
      await tx.brokerageCase.delete({ where: { id } });
    });
    return { success: true };
  }

  /** 의뢰를 건에 담는다. 진행 계획의 맨 끝 단계로 들어간다. */
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
      const last = await tx.brokerageCaseStep.aggregate({
        where: { officeId, brokerageCaseId: id },
        _max: { sortOrder: true },
      });
      await tx.brokerageCaseStep.create({
        data: {
          officeId,
          brokerageCaseId: id,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
          title,
          dealId: dto.dealId ?? null,
          targetDate,
          memo,
        },
      });
      await tx.brokerageCase.update({
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
    const step = await this.prisma.brokerageCaseStep.findFirst({
      where: { id: stepId, officeId, brokerageCaseId: id },
    });
    if (!step) throw new NotFoundException('단계를 찾을 수 없습니다.');

    const data: Prisma.BrokerageCaseStepUpdateInput = {};
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
    await this.prisma.brokerageCaseStep.update({ where: { id: stepId }, data });
    return this.findOne(id, officeId);
  }

  /** 단계를 지운다. 의뢰를 가리키는 단계였다면 그 의뢰도 건에서 빠진다. */
  async removeStep(id: string, stepId: string, officeId: string) {
    await this.prisma.$transaction(async (tx) => {
      const step = await tx.brokerageCaseStep.findFirst({
        where: { id: stepId, officeId, brokerageCaseId: id },
      });
      if (!step) throw new NotFoundException('단계를 찾을 수 없습니다.');
      await tx.brokerageCaseStep.delete({ where: { id: stepId } });
      if (step.listingIntakeId) {
        await tx.listingIntake.updateMany({
          where: { id: step.listingIntakeId, officeId, brokerageCaseId: id },
          data: { brokerageCaseId: null },
        });
      }
      if (step.buyerIntakeId) {
        await tx.buyerIntake.updateMany({
          where: { id: step.buyerIntakeId, officeId, brokerageCaseId: id },
          data: { brokerageCaseId: null },
        });
      }
      await tx.brokerageCase.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
    });
    return this.findOne(id, officeId);
  }

  /**
   * 사용자가 정한 순서를 저장한다. 건의 모든 단계를 빠짐없이 보내야 한다
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
        step.sortOrder > MAX_STEPS_PER_CASE
      ) {
        throw new BadRequestException('단계 순서가 올바르지 않습니다.');
      }
    }
    await this.prisma.$transaction(async (tx) => {
      await this.assertCase(tx, officeId, id);
      const existing = await tx.brokerageCaseStep.findMany({
        where: { officeId, brokerageCaseId: id },
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
        await tx.brokerageCaseStep.update({
          where: { id: step.id },
          data: { sortOrder: step.sortOrder },
        });
      }
      await tx.brokerageCase.update({
        where: { id },
        data: { updatedAt: new Date() },
      });
    });
    return this.findOne(id, officeId);
  }

  /**
   * 이 건에 더 담을 만한 것: 건에 담긴 의뢰의 당사자와 같은 사람의, 아직 어느 건에도
   * 담기지 않은 의뢰(이미 종료된 것 포함 — 거래가 끝난 의뢰도 흐름에 넣을 수 있어야
   * 한다)와, 이 건의 의뢰 단계에 나오지 않는 거래. 제안일 뿐이고 담는 것은
   * 사용자가 한다.
   */
  async findCandidates(id: string, officeId: string) {
    await this.assertCase(this.prisma, officeId, id);
    const [buyerContacts, ownerContacts] = await Promise.all([
      this.prisma.buyerIntakeContact.findMany({
        where: { officeId, buyerIntake: { brokerageCaseId: id } },
        select: { contactId: true },
      }),
      this.prisma.propertyContact.findMany({
        where: {
          officeId,
          status: 'active',
          property: { listingIntakes: { some: { brokerageCaseId: id } } },
        },
        select: { contactId: true },
      }),
    ]);
    const contactIds = [
      ...new Set(
        [...buyerContacts, ...ownerContacts].map((item) => item.contactId),
      ),
    ];
    if (contactIds.length === 0) {
      return { listingIntakes: [], buyerIntakes: [], deals: [] };
    }

    const [listingIntakes, buyerIntakes, deals] = await Promise.all([
      this.prisma.listingIntake.findMany({
        where: {
          officeId,
          // 어느 건에도 없거나, 보관한 건에 남아 있는 의뢰.
          OR: [
            { brokerageCaseId: null },
            { brokerageCase: { archivedAt: { not: null } } },
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
          // 어느 건에도 없거나, 보관한 건에 남아 있는 의뢰.
          OR: [
            { brokerageCaseId: null },
            { brokerageCase: { archivedAt: { not: null } } },
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
      // 이 건의 의뢰 단계에 이미 나오는 거래와, 이미 단계로 넣은 거래만 뺀다.
      // (구매 의뢰가 있더라도 그 의뢰가 이 건에 없으면 거래를 직접 담을 수 있다.)
      this.prisma.deal.findMany({
        where: {
          officeId,
          isCancelled: false,
          OR: [
            { buyerContactId: { in: contactIds } },
            { sellerContactId: { in: contactIds } },
          ],
          NOT: [
            { buyerIntake: { brokerageCaseId: id } },
            { listing: { intake: { brokerageCaseId: id } } },
          ],
          caseSteps: { none: { brokerageCaseId: id } },
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
    client: Pick<Prisma.TransactionClient, 'brokerageCase'>,
    officeId: string,
    id: string,
  ) {
    const found = await client.brokerageCase.findFirst({
      where: { id, officeId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('중개 건을 찾을 수 없습니다.');
  }

  private async assertStepRoom(
    tx: Prisma.TransactionClient,
    officeId: string,
    id: string,
  ) {
    const count = await tx.brokerageCaseStep.count({
      where: { officeId, brokerageCaseId: id },
    });
    if (count >= MAX_STEPS_PER_CASE) {
      throw new BadRequestException(
        `한 건의 진행 계획은 ${MAX_STEPS_PER_CASE}단계까지 만들 수 있습니다.`,
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
              brokerageCaseId: true,
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
              brokerageCaseId: true,
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
        brokerageCaseId: intake.brokerageCaseId,
        receivedAt: intake.receivedAt,
        propertyId: intake.propertyId,
        transactionType: null as string | null,
      })),
      ...buyerIntakes.map((intake) => ({
        kind: 'buyer' as const,
        id: intake.id,
        brokerageCaseId: intake.brokerageCaseId,
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
    brokerageCaseId: string,
    intake: {
      kind: CaseIntakeKind;
      id: string;
      brokerageCaseId: string | null;
      propertyId: string | null;
      transactionType: string | null;
    },
  ) {
    // 보관한 건에서 옮겨 오는 의뢰의 옛 단계. 새 건의 단계가 제목·목표일·메모를 이어받는다.
    let carried: {
      title: string;
      targetDate: Date | null;
      memo: string | null;
    } | null = null;
    if (intake.brokerageCaseId && intake.brokerageCaseId !== brokerageCaseId) {
      const other = await tx.brokerageCase.findFirst({
        where: { id: intake.brokerageCaseId, officeId },
        select: { archivedAt: true },
      });
      // 진행 중인 다른 건에 담긴 의뢰는 옮기지 않는다. 보관한 건에 남아 있는 의뢰는
      // 고객 원장에 건 없는 의뢰로 보이므로(다시 꺼낼 화면이 없다) 새 건으로 옮긴다.
      if (other && other.archivedAt === null) {
        throw new ConflictException(
          '이미 다른 중개 건에 묶인 의뢰입니다. 그 건에서 먼저 빼 주세요.',
        );
      }
      // 보관한 건의 진행 계획은 지난 기록이다. 그 단계를 지우지 않고, 의뢰를 가리키는
      // 연결만 끊어 제목·목표일·메모가 적힌 기록으로 남긴다. 연결을 그대로 두면 의뢰의
      // 건을 바꿀 때 단계가 새 건으로 딸려 가 옛 기록에서 사라진다.
      const intakeTarget =
        intake.kind === 'listing'
          ? { listingIntakeId: intake.id }
          : { buyerIntakeId: intake.id };
      const previousSteps = await tx.brokerageCaseStep.findMany({
        where: {
          officeId,
          brokerageCaseId: intake.brokerageCaseId,
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
        await tx.brokerageCaseStep.updateMany({
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
        data: { brokerageCaseId },
      });
    } else {
      await tx.buyerIntake.update({
        where: { id: intake.id },
        data: { brokerageCaseId },
      });
    }
    const typeLabel = intake.transactionType
      ? TRANSACTION_TYPE_LABELS[intake.transactionType]
      : null;
    await appendIntakeStep(tx, {
      officeId,
      brokerageCaseId,
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
   * 거래를 직접 가리키는 단계는 의뢰를 거치지 않은 거래에만 쓴다. 이 건에 담긴
   * 의뢰에서 나온 거래는 그 의뢰의 단계에 이미 보이므로 두 줄로 넣지 못하게 한다.
   */
  private async assertDealCanBeStep(
    tx: Prisma.TransactionClient,
    officeId: string,
    brokerageCaseId: string,
    dealId: string,
  ) {
    const deal = await tx.deal.findFirst({
      where: { id: dealId, officeId },
      select: {
        ...dealFlowSelect,
        buyerIntake: { select: { brokerageCaseId: true } },
        listing: {
          select: {
            ...dealFlowSelect.listing.select,
            intake: { select: { brokerageCaseId: true } },
          },
        },
      },
    });
    if (!deal) throw new NotFoundException('거래를 찾을 수 없습니다.');
    if (
      deal.buyerIntake?.brokerageCaseId === brokerageCaseId ||
      deal.listing?.intake.brokerageCaseId === brokerageCaseId
    ) {
      throw new ConflictException(
        '이 거래는 건에 담긴 의뢰의 단계에 이미 나옵니다.',
      );
    }
    const existing = await tx.brokerageCaseStep.findFirst({
      where: { brokerageCaseId, dealId },
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

  private present(brokerageCase: CaseDetail) {
    return {
      id: brokerageCase.id,
      title: brokerageCase.title,
      memo: brokerageCase.memo,
      archivedAt: brokerageCase.archivedAt,
      createdAt: brokerageCase.createdAt,
      updatedAt: brokerageCase.updatedAt,
      steps: brokerageCase.steps.map((step) => this.presentStep(step)),
    };
  }
}

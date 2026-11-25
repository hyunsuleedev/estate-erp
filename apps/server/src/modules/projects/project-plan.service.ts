import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DONE_DEAL_STAGES, formatPlaceLabel } from '@estate-erp/shared';
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

/** 프로젝트를 풀 수 있는 역할 (코멘트를 남의 것까지 지울 수 있는 역할과 같다) */
const PROJECT_REMOVER_ROLES = ['owner', 'manager'];

const MAX_TITLE_LENGTH = 100;
const MAX_MEMO_LENGTH = 2_000;
const MAX_STEPS_PER_PROJECT = 50;
/** 목록 한 쪽의 프로젝트 수. 끝낸 프로젝트까지 모두 쪽을 넘겨 볼 수 있다. */
const DEFAULT_PROJECT_PAGE = 50;
const MAX_PROJECT_PAGE = 100;
const PROJECT_LIST_STATUSES = ['open', 'archived', 'all'];
const PROJECT_LIST_SORTS = ['updated', 'created', 'title'];
/** 목록에서 고를 수 있는 계산한 상태 (끝낸 것은 보기 탭으로 고른다) */
const PROJECT_DERIVED_STATUSES = ['preparing', 'active', 'wrapping'];
const PROJECT_INTAKE_FILTERS = ['listing', 'buyer', 'none'];
const PROJECT_PRIMARY_FILTERS = ['set', 'empty'];
/** 상태(계산한 값)로 거를 때 한 번에 읽어 계산하는 프로젝트 수의 상한 */
const STATUS_FILTER_SCAN_LIMIT = 2_000;

/**
 * 목록 한 줄의 상태 (화면의 getProjectStatus와 같은 계산): 끝냈으면 archived, 단계가 없으면 preparing(준비),
 * 단계가 모두 끝났으면 wrapping(마무리), 아니면 active(진행 중).
 */
export function projectListStatus(item: {
  archivedAt: Date | string | null;
  stepCount: number;
  doneStepCount: number;
}) {
  if (item.archivedAt) return 'archived';
  if (item.stepCount === 0) return 'preparing';
  return item.doneStepCount >= item.stepCount ? 'wrapping' : 'active';
}

/** 단계가 가리키는 거래에서 읽는 것. 금액은 표시용이고 자금 계산은 하지 않는다. */
const dealFlowSelect = {
  id: true,
  stage: true,
  isCancelled: true,
  cancelledAt: true,
  cancelReason: true,
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
              // 진행 중인 매칭만 센다(상세 화면의 "매칭 N"과 같은 기준). 종료된 것은 따로 보인다.
              _count: { select: { matches: { where: { stage: { not: 'closed' } } } } },
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
              _count: { select: { matches: { where: { stage: { not: 'closed' } } } } },
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

/** 집을 부르는 글: "고덕그라시움 102동 2203호" (공용 formatPlaceLabel — 화면 · 문서와 같은 모양) */
function propertyLabel(property: PropertyLabelSource | null | undefined) {
  if (!property) return null;
  return (
    formatPlaceLabel({
      siteName: property.site.name,
      dongName: property.unit?.dong?.name,
      dongIsPlaceholder: property.unit?.dong?.isPlaceholder,
      unit: property.unit,
    }) || null
  );
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
    /** 취소한 거래만: 취소한 때와 사유 */
    cancelledAt: deal.isCancelled ? deal.cancelledAt : null,
    cancelReason: deal.isCancelled ? deal.cancelReason : null,
  };
}

/**
 * 한 의뢰에서 가장 최근에 취소된 거래. 가계약까지 갔다가 깨진 것은 이어받는 직원이 꼭 알아야 하는
 * 맥락이라, 지금 거래가 따로 있어도 함께 보여 준다(새 거래가 위, 취소 줄은 그 아래).
 */
function latestCancelledDeal(deals: DealFlowRow[]) {
  const cancelled = deals.filter((deal) => deal.isCancelled);
  if (cancelled.length === 0) return null;
  const when = (deal: DealFlowRow) => (deal.cancelledAt ?? deal.createdAt).getTime();
  return cancelled.reduce((latest, deal) => (when(deal) > when(latest) ? deal : latest));
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
    /** 만드는 사람. 담당을 따로 정하지 않았으면(undefined) 이 사람이 담당이 된다(거래와 같다). */
    creatorId: string | null = null,
  ) {
    const listingIntakeIds = [...new Set(dto.listingIntakeIds ?? [])];
    const buyerIntakeIds = [...new Set(dto.buyerIntakeIds ?? [])];
    const primaryContactId = dto.primaryContactId ?? null;
    // 담당: 보내지 않았으면 만든 사람, null을 보냈으면 담당 없음.
    const assignedToId =
      dto.assignedToId === undefined ? creatorId : dto.assignedToId;
    // 프로젝트는 작업 공간이다(사용자 결정, 2026-11-22): 이름 · 대표 고객 · 의뢰가 모두 없어도 연다.
    // Notion의 새 페이지처럼 빈 채로 만들고 나중에 채운다. 그래서 "누구의 일인지" 검사를 두지 않는다.
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
      /** 담당이 이 직원들인 것만. "none"은 담당 없음 */
      assignedToIds?: string[];
      /** "내 프로젝트": 담당이 이 사람(요청한 사람)인 것만 */
      mineUserId?: string;
      /** 계산한 상태로 거른다: preparing(준비) · active(진행 중) · wrapping(마무리). 끝낸 것(archived)은 status로 고른다 */
      statuses?: string[];
      /** 담긴 의뢰: listing(매물 의뢰 있음) · buyer(구매 의뢰 있음) · none(의뢰 없음). 여럿이면 하나라도 맞으면 */
      intakes?: string[];
      /** 대표 고객: set(있음) · empty(비어 있음) */
      primary?: string;
      /** 시작(만든 날)의 범위. YYYY-MM-DD, 한국 날짜로 자른다(끝 날 포함) */
      createdFrom?: string;
      createdTo?: string;
      /** 이 사람이 대표 고객이거나 담긴 의뢰의 당사자인 프로젝트만 (연락처 화면에서 그 손님의 프로젝트를 볼 때) */
      contactId?: string;
      /** 이 매물 의뢰를 담은 프로젝트만 (매물 상세에서). 한 의뢰는 한 프로젝트에만 담기므로 0~1건이다. */
      listingIntakeId?: string;
      /** 이 구매 의뢰를 담은 프로젝트만 (희망 조건 화면에서). 0~1건이다. */
      buyerIntakeId?: string;
      /** updated(최근 고친 순, 기본) · created(시작 순) · title(이름 순) */
      sort?: string;
      /** asc · desc. 기본은 updated · created가 desc, title이 asc */
      order?: string;
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
      throw new BadRequestException('정렬 기준이 올바르지 않습니다.');
    }
    const order = (query.order ?? (sort === 'title' ? 'asc' : 'desc')) as 'asc' | 'desc';
    if (order !== 'asc' && order !== 'desc') {
      throw new BadRequestException('정렬 방향이 올바르지 않습니다.');
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
    const statuses = query.statuses ?? [];
    if (statuses.some((value) => !PROJECT_DERIVED_STATUSES.includes(value))) {
      throw new BadRequestException('상태는 준비 · 진행 중 · 마무리 중에서 고르세요.');
    }
    const intakes = query.intakes ?? [];
    if (intakes.some((value) => !PROJECT_INTAKE_FILTERS.includes(value))) {
      throw new BadRequestException('의뢰 조건이 올바르지 않습니다.');
    }
    if (query.primary && !PROJECT_PRIMARY_FILTERS.includes(query.primary)) {
      throw new BadRequestException('대표 고객 조건이 올바르지 않습니다.');
    }
    const createdFrom = this.parseKoreanDay(query.createdFrom, '시작');
    const createdTo = this.parseKoreanDay(query.createdTo, '시작');
    if (createdFrom && createdTo && createdFrom > createdTo) {
      throw new BadRequestException('시작 기간의 앞 날짜가 뒤 날짜보다 늦습니다.');
    }

    const search = query.search?.trim();
    // 조건마다 AND에 하나씩 넣는다(같은 칸 OR끼리 서로 덮어쓰지 않게).
    const and: Prisma.ProjectWhereInput[] = [];
    if (query.assignedToId) and.push({ assignedToId: query.assignedToId });
    const assignees = query.assignedToIds ?? [];
    if (assignees.length > 0) {
      const ids = assignees.filter((value) => value !== 'none');
      and.push({
        OR: [
          ...(ids.length > 0 ? [{ assignedToId: { in: ids } }] : []),
          ...(assignees.includes('none') ? [{ assignedToId: null }] : []),
        ],
      });
    }
    if (query.mineUserId) and.push({ assignedToId: query.mineUserId });
    if (intakes.length > 0) {
      and.push({
        OR: intakes.map((value): Prisma.ProjectWhereInput =>
          value === 'listing'
            ? { listingIntakes: { some: {} } }
            : value === 'buyer'
              ? { buyerIntakes: { some: {} } }
              : { listingIntakes: { none: {} }, buyerIntakes: { none: {} } },
        ),
      });
    }
    if (query.primary === 'set') and.push({ primaryContactId: { not: null } });
    if (query.primary === 'empty') and.push({ primaryContactId: null });
    if (createdFrom || createdTo) {
      and.push({
        createdAt: {
          ...(createdFrom ? { gte: createdFrom } : {}),
          // 끝 날을 포함한다: 그다음 날 0시(한국) 전까지
          ...(createdTo ? { lt: new Date(createdTo.getTime() + 24 * 60 * 60 * 1000) } : {}),
        },
      });
    }
    if (query.listingIntakeId) {
      and.push({ listingIntakes: { some: { id: query.listingIntakeId } } });
    }
    if (query.buyerIntakeId) {
      and.push({ buyerIntakes: { some: { id: query.buyerIntakeId } } });
    }
    if (query.contactId) {
      and.push({
        OR: [
          { primaryContactId: query.contactId },
          {
            buyerIntakes: {
              some: { contacts: { some: { contactId: query.contactId } } },
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
                      contactId: query.contactId,
                    },
                  },
                },
              },
            },
          },
        ],
      });
    }
    if (search) {
      and.push({
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
      });
    }
    const where: Prisma.ProjectWhereInput = {
      officeId,
      ...(status === 'open' ? { archivedAt: null } : {}),
      ...(status === 'archived' ? { archivedAt: { not: null } } : {}),
      ...(and.length > 0 ? { AND: and } : {}),
    };
    const orderBy: Prisma.ProjectOrderByWithRelationInput[] = [
      sort === 'title'
        ? { title: { sort: order, nulls: 'last' } }
        : sort === 'created'
          ? { createdAt: order }
          : { updatedAt: order },
      // 같은 값이면 id로 순서를 고정한다(쪽을 넘길 때 줄이 겹치거나 빠지지 않게).
      { id: 'asc' },
    ];
    const include = {
      ...caseDetailInclude,
      comments: {
        orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
        take: 1,
        select: {
          body: true,
          createdAt: true,
          author: { select: { name: true } },
        },
      },
    } satisfies Prisma.ProjectInclude;

    // 상태(준비 · 진행 중 · 마무리)는 저장하지 않고 단계 · 거래에서 계산하는 값이라 SQL로 거를 수 없다.
    // 그래서 상태로 거를 때는 다른 조건에 맞는 프로젝트를 한 번에 읽어 계산한 뒤 거르고 쪽을 자른다.
    // 한 사무소의 열린 프로젝트는 많아야 수백 건이라 감당할 수 있다. 한 번에 읽는 상한은
    // STATUS_FILTER_SCAN_LIMIT이고, 넘으면(그럴 일은 드물다) 앞의 그만큼 안에서만 거른다.
    const filterByStatus = statuses.length > 0 && status !== 'archived';
    if (filterByStatus) {
      const scanned = await this.prisma.project.findMany({
        where,
        orderBy,
        take: STATUS_FILTER_SCAN_LIMIT,
        include,
      });
      const matched = scanned
        .map((project) => this.toListItem(project))
        .filter((item) => statuses.includes(projectListStatus(item)));
      const items = matched.slice(offset, offset + limit);
      return {
        total: matched.length,
        nextOffset: offset + items.length < matched.length ? offset + items.length : null,
        items,
      };
    }

    const [total, projects] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.findMany({
        where,
        orderBy,
        skip: offset,
        take: limit,
        include,
      }),
    ]);
    return {
      total,
      /** 다음 쪽의 offset. 더 없으면 null. */
      nextOffset: offset + projects.length < total ? offset + projects.length : null,
      items: projects.map((project) => this.toListItem(project)),
    };
  }

  /** 목록의 한 줄: 진행 계획을 읽어 "몇 단계 중 몇 단계가 끝났나"를 계산한다(저장하지 않는다). */
  private toListItem(
    project: CaseDetail & {
      comments: Array<{ body: string; createdAt: Date; author: { name: string } | null }>;
    },
  ) {
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
      buyerIntakeCount: detail.steps.filter((step) => step.kind === 'buyer_intake').length,
      listingIntakeCount: detail.steps.filter((step) => step.kind === 'listing_intake').length,
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
  }

  /** "2026-11-22" → 그날 0시(한국 시각). 없으면 null, 모양이 틀리면 400. */
  private parseKoreanDay(value: string | undefined, label: string) {
    if (!value) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${label} 날짜가 올바르지 않습니다.`);
    }
    const date = new Date(`${value}T00:00:00+09:00`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`${label} 날짜가 올바르지 않습니다.`);
    }
    return date;
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

  /**
   * 프로젝트를 푼다. 의뢰와 거래, 프로젝트에 적은 업무는 그대로 남고(업무는 프로젝트 연결만 끊긴다)
   * 프로젝트와 진행 계획, 프로젝트에 적은 코멘트가 없어진다.
   *
   * 대표 · 매니저만 한다: 풀면 남이 적은 코멘트까지 지워지므로, 중개사가 하면 "남의 코멘트는 지우지 못한다"는
   * 규칙을 프로젝트 삭제로 돌아가게 된다. 직원은 되돌릴 수 있는 끝내기로 정리한다.
   * 예외: 아무것도 적지 않은 빈 프로젝트는 담당(만든 사람)이 지울 수 있다.
   */
  async remove(id: string, officeId: string, role: string, userId: string | null = null) {
    await this.prisma.$transaction(async (tx) => {
      await this.assertCase(tx, officeId, id);
      if (!PROJECT_REMOVER_ROLES.includes(role)) {
        // 예외: 아무것도 적지 않은 빈 프로젝트(이름 · 대표 고객 · 메모 · 단계 · 코멘트 · 업무가 모두 없음)는 담당인
        // 사람(만든 사람)이 지울 수 있다. "프로젝트 열기"로 빈 프로젝트가 바로 만들어지므로 잘못 연 것을 치우는 길이다.
        // 지워질 남의 코멘트가 없으니 "남의 코멘트는 지우지 못한다"는 규칙을 돌아가지 않는다.
        const project = await tx.project.findFirst({
          where: { id, officeId },
          select: {
            title: true,
            memo: true,
            primaryContactId: true,
            assignedToId: true,
            _count: { select: { steps: true, comments: true, tasks: true } },
          },
        });
        const empty =
          project !== null &&
          !project.title &&
          !project.memo &&
          !project.primaryContactId &&
          project._count.steps === 0 &&
          project._count.comments === 0 &&
          project._count.tasks === 0;
        if (!empty || !userId || project?.assignedToId !== userId) {
          throw new ForbiddenException(
            '프로젝트 풀기는 대표·매니저만 할 수 있습니다. 정리하려면 끝내기를 쓰세요.',
          );
        }
      }
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
      // 업무는 프로젝트가 없어져도 해야 할 일로 남는다. 연결만 끊는다.
      await tx.task.updateMany({
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
  async findCandidates(
    id: string,
    officeId: string,
    options: { contactId?: string } = {},
  ) {
    await this.assertCase(this.prisma, officeId, id);
    // 사용자가 고른 다른 손님의 의뢰를 찾을 때(부부 · 공동명의처럼 이 프로젝트 사람이 아닌 명의):
    // 그 사람 한 명의 의뢰만 본다. 담는 것은 사용자가 한다.
    if (options.contactId) {
      const contact = await this.prisma.contact.findFirst({
        where: { id: options.contactId, officeId },
        select: { id: true },
      });
      if (!contact) throw new NotFoundException('손님을 찾을 수 없습니다.');
      return this.readCandidates(id, officeId, [contact.id]);
    }
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
    const baseContactIds = [
      ...new Set([
        ...(project?.primaryContactId ? [project.primaryContactId] : []),
        ...[...buyerContacts, ...ownerContacts].map((item) => item.contactId),
      ]),
    ];
    let contactIds = baseContactIds;
    if (baseContactIds.length > 0 && this.prisma.partyMember) {
      const householdMemberships = await this.prisma.partyMember.findMany({
        where: {
          officeId,
          contactId: { in: baseContactIds },
          partyKind: 'household',
          status: 'active',
        },
        select: { partyId: true },
      });
      if (householdMemberships.length > 0) {
        const siblings = await this.prisma.partyMember.findMany({
          where: {
            officeId,
            partyId: { in: householdMemberships.map((m) => m.partyId) },
            status: 'active',
          },
          select: { contactId: true },
        });
        contactIds = Array.from(
          new Set([...baseContactIds, ...siblings.map((item) => item.contactId)]),
        );
      }
    }
    return this.readCandidates(id, officeId, contactIds);
  }

  /** 그 사람들의, 이 프로젝트에 담을 수 있는 의뢰와 거래. */
  private async readCandidates(
    id: string,
    officeId: string,
    contactIds: string[],
  ) {
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
        // 방금 등록한 의뢰가 맨 위에 오게 만든 순서로(프로젝트에서 "새 매물 의뢰 등록"을 하고 돌아왔을 때).
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 30,
        select: {
          id: true,
          createdAt: true,
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
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 30,
        select: {
          id: true,
          createdAt: true,
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
        createdAt: intake.createdAt,
        lifecycleStatus: intake.lifecycleStatus,
        transactionTypes: [
          ...new Set(intake.listings.map((item) => item.transactionType)),
        ],
      })),
      buyerIntakes: buyerIntakes.map((intake) => ({
        id: intake.id,
        label: intake.contacts[0]?.contact.name ?? '구매 의뢰',
        createdAt: intake.createdAt,
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
      const cancelledDeal = latestCancelledDeal(
        intake.listings.flatMap((listing) => listing.deals),
      );
      return {
        ...base,
        kind: 'listing_intake' as const,
        cancelledDeal: cancelledDeal ? presentDeal(cancelledDeal) : null,
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
      const cancelledDeal = latestCancelledDeal(intake.deals);
      return {
        ...base,
        kind: 'buyer_intake' as const,
        cancelledDeal: cancelledDeal ? presentDeal(cancelledDeal) : null,
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
        cancelledDeal: null,
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
      cancelledDeal: null,
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

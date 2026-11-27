import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import {
  Auth0ManagementError,
  Auth0ManagementService,
} from '../auth/auth0-management.service';
import { Auth0AccountSyncService } from '../auth/auth0-account-sync.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { contactPhonesSelectOrdered } from '../contacts/contact-phone.utils';
import {
  LISTING_INTAKE_STATE_SELECT,
  OCCUPYING_DEALS_SELECT,
} from '../listings/listing-state';
import {
  buyerIntakeContactsInclude,
  withBuyerRequirementContact,
} from '../buyer-requirements/buyer-requirement.presenter';

const taskInclude = {
  contact: { select: { id: true, name: true, phones: contactPhonesSelectOrdered } },
  property: { include: { site: true, unit: { include: { dong: true } } } },
  listing: true,
  consultation: true,
} satisfies Prisma.TaskInclude;

const dealInclude = {
  listing: {
    include: {
      property: {
        include: {
          site: true,
          unit: {
            include: {
              dong: true,
            },
          },
        },
      },
    },
  },
  buyerContact: true,
  sellerContact: true,
  contract: true,
  payments: {
    where: { status: { not: 'cancelled' } },
    select: {
      id: true,
      kind: true,
      sequence: true,
      scheduledAmount: true,
      scheduledDate: true,
      status: true,
    },
    orderBy: [{ sequence: 'asc' }, { scheduledDate: 'asc' }],
  },
} satisfies Prisma.DealInclude;

const consultationInclude = {
  contact: { select: { id: true, name: true, phones: contactPhonesSelectOrdered } },
  // NOTE: Property 모델에는 memo 필드가 schema상 존재하지 않음 (docs/DATA_STRUCTURE.md와 불일치).
  // schema 기준으로 select 제한.
  property: { select: { id: true, site: { select: { name: true } } } },
  listing: {
    select: {
      id: true,
      transactionType: true,
      price: true,
      isPaused: true,
      intake: { select: LISTING_INTAKE_STATE_SELECT },
      deals: OCCUPYING_DEALS_SELECT,
    },
  },
  match: { select: { id: true, stage: true } },
  buyerRequirement: { select: { id: true, status: true, transactionType: true } },
} as const;

/** 직원 상세에 담는 업무·고객·거래 참여의 최대 건수 */
const EMPLOYEE_DETAIL_LIST_LIMIT = 100;

const employeeDetailInclude = {
  office: {
    select: {
      id: true,
      name: true,
      commissionConfig: true,
    },
  },
  // 직원관리의 "지금 챙길 것"은 이 목록에서 밀린 일을 찾는다. 끝난 일까지 섞어서 앞에서
  // 자르면 예전에 끝난 일이 자리를 채워 지금 밀린 일이 빠진다. 그래서 진행 중인 것만,
  // 급한 것(기한·연락일이 빠른 것, 미정산)부터 담는다 — 잘리더라도 급한 것은 남는다.
  assignedTasks: {
    where: { status: { notIn: ['completed', 'cancelled'] } },
    include: taskInclude,
    orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: EMPLOYEE_DETAIL_LIST_LIMIT,
  },
  assignedRequirements: {
    where: { status: 'active' },
    include: {
      buyerIntake: { include: { contacts: buyerIntakeContactsInclude } },
      preferredSites: {
        include: { site: { select: { id: true, name: true, type: true } } },
        orderBy: { priority: 'asc' },
        take: 3,
      },
      preferredRegions: {
        include: {
          province: { select: { code: true, name: true } },
          district: { select: { code: true, name: true } },
          ward: { select: { code: true, name: true } },
        },
        take: 3,
      },
      _count: { select: { matches: true } },
    },
    orderBy: [{ nextContactDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    take: EMPLOYEE_DETAIL_LIST_LIMIT,
  },
  assignedProjects: {
    where: { archivedAt: null },
    select: {
      id: true,
      title: true,
      memo: true,
      createdAt: true,
      updatedAt: true,
      primaryContact: { select: { id: true, name: true } },
      steps: {
        select: {
          id: true,
          doneAt: true,
          listingIntakeId: true,
          buyerIntakeId: true,
          dealId: true,
        },
      },
      _count: {
        select: {
          listingIntakes: true,
          buyerIntakes: true,
          steps: true,
          comments: true,
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
    take: 20,
  },
  // 취소한 거래는 진행·미정산·참여 수수료 어디에도 세지 않는다(거래관리의 진행 목록과 같은 기준)
  dealParticipants: {
    where: { deal: { isCancelled: false } },
    include: {
      deal: {
        include: dealInclude,
      },
    },
    // 'unsettled'가 'settled'보다 뒤 글자라 내림차순이면 미정산이 먼저 온다
    orderBy: [{ settlementStatus: 'desc' }, { createdAt: 'desc' }],
    take: EMPLOYEE_DETAIL_LIST_LIMIT,
  },
  settlementLines: {
    select: {
      id: true,
      employmentType: true,
      withholdTax: true,
      targetWon: true,
      shareWon: true,
      baseWon: true,
      adjustWon: true,
      carryInWon: true,
      withholdingWon: true,
      netWon: true,
      carryOutWon: true,
      paidAt: true,
      settlement: {
        select: {
          id: true,
          month: true,
          timing: true,
          confirmedAt: true,
        },
      },
    },
    orderBy: { settlement: { month: 'desc' } },
    take: 6,
  },
  consultations: {
    include: consultationInclude,
    orderBy: { createdAt: 'desc' },
    take: 25,
  },
  activityLogs: {
    orderBy: { createdAt: 'desc' },
    take: 35,
  },
} satisfies Prisma.UserInclude;

/**
 * 직원 상세에 딸린 목록. 화면과 MCP가 필요한 것만 따로 받는다(GET /employees/:id/sections/:section).
 * 한 응답에 다 붙이면 직원 한 명이 100KB를 넘고, 업무 하나가 바뀌어도 전부 다시 받게 된다.
 */
export const EMPLOYEE_SECTIONS = [
  'tasks',
  'buyerRequirements',
  'projects',
  'deals',
  'settlements',
  'consultations',
  'activities',
] as const;
export type EmployeeSection = (typeof EMPLOYEE_SECTIONS)[number];

export function isEmployeeSection(value: string): value is EmployeeSection {
  return (EMPLOYEE_SECTIONS as readonly string[]).includes(value);
}

type EmployeeDetail = Prisma.UserGetPayload<{
  include: typeof employeeDetailInclude;
}>;

function withProjectStepCounts<T extends { steps: Array<{ doneAt: Date | null }> }>(project: T) {
  return {
    ...project,
    completedStepCount: project.steps.filter((step) => Boolean(step.doneAt)).length,
    totalStepCount: project.steps.length,
  };
}

function toSettlementSummary(line: EmployeeDetail['settlementLines'][number]) {
  return {
    id: line.id,
    month: line.settlement.month,
    timing: line.settlement.timing,
    confirmedAt: line.settlement.confirmedAt,
    employmentType: line.employmentType,
    withholdTax: line.withholdTax,
    targetWon: line.targetWon,
    shareWon: line.shareWon,
    baseWon: line.baseWon,
    adjustWon: line.adjustWon,
    carryInWon: line.carryInWon,
    withholdingWon: line.withholdingWon,
    netWon: line.netWon,
    carryOutWon: line.carryOutWon,
    paidAt: line.paidAt,
  };
}

const USER_LICENSE_TYPES = ['broker_owner', 'broker_associate', 'assistant'] as const;
const USER_PAY_TYPES = ['fixed', 'mixed', 'commission_only'] as const;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;
const MAX_ATTENTION_ITEMS_PER_EMPLOYEE = 15;

export interface EmployeeAttentionItem {
  kind: 'task' | 'buyer';
  id: string;
  title: string;
  dueDate: string;
}

function kstDayStartUtc(now: Date = new Date()): Date {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  return new Date(
    Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()) - KST_OFFSET_MS,
  );
}

/** Auth0 아이디·비밀번호 연결이 받는 아이디 규칙(1~30자, 영문·숫자와 일부 기호). */
const LOGIN_ID_MAX_LENGTH = 30;
const LOGIN_ID_PATTERN = /^[a-z0-9_+\-.!#$'^`~@]+$/;
const LOGIN_ID_RULE_MESSAGE =
  '아이디는 영문 소문자·숫자와 일부 기호(_ - . 등)로 30자까지 쓸 수 있습니다.';
const WEAK_PASSWORD_MESSAGE =
  '비밀번호가 보안 기준에 맞지 않습니다. 8자 이상으로, 영문 대문자·소문자·숫자·특수문자 중 3가지 이상을 섞어 주세요.';
const LOGIN_ID_TAKEN_MESSAGE = '이미 사용 중인 로그인 ID입니다.';
/**
 * 비활성화 응답이 Auth0 뒤처리를 기다리는 최대 시간. 넘으면 뒤처리는 계속 돌게 두고
 * 응답한다(접근은 이미 DB에서 끊겼다).
 */
const LOCKOUT_FOLLOW_UP_WAIT_MS = 4_000;

@Injectable()
export class EmployeesService {
  private readonly logger = new Logger(EmployeesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth0: Auth0ManagementService,
    private readonly accountSync: Auth0AccountSyncService,
    private readonly realtime: RealtimeService,
  ) {}

  async findAll(officeId: string) {
    const employees = await this.prisma.user.findMany({
      where: { officeId },
      include: {
        assignedTasks: {
          where: { status: { notIn: ['completed', 'cancelled'] } },
          select: { id: true, title: true, dueDate: true },
          orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        },
        assignedRequirements: {
          where: { status: 'active' },
          select: {
            id: true,
            nextContactDate: true,
            buyerIntake: {
              select: {
                contacts: {
                  select: {
                    isPrimary: true,
                    contact: { select: { name: true } },
                  },
                  orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
                  take: 1,
                },
              },
            },
          },
          orderBy: [{ nextContactDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
        },
        dealParticipants: {
          where: { deal: { isCancelled: false } },
          include: {
            deal: {
              select: {
                id: true,
                stage: true,
              },
            },
          },
        },
        consultations: {
          select: { id: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        activityLogs: {
          select: { id: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        _count: {
          select: { consultations: true },
        },
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });

    const kstTodayStart = kstDayStartUtc();
    const kstTodayMs = kstTodayStart.getTime();
    const kstTomorrowMs = kstTodayMs + DAY_MS;

    return employees.map((employee) => {
      const latestConsultationAt = employee.consultations[0]?.createdAt ?? null;
      const latestActivityAt = employee.activityLogs[0]?.createdAt ?? null;

      let overdueTaskCount = 0;
      const attentionItems: EmployeeAttentionItem[] = [];
      for (const task of employee.assignedTasks) {
        if (!task.dueDate) continue;
        const dueMs = new Date(task.dueDate).getTime();
        if (dueMs < kstTodayMs) overdueTaskCount += 1;
        if (dueMs < kstTomorrowMs) {
          attentionItems.push({
            kind: 'task',
            id: task.id,
            title: task.title,
            dueDate: new Date(task.dueDate).toISOString(),
          });
        }
      }

      let overdueBuyerCount = 0;
      for (const requirement of employee.assignedRequirements) {
        if (!requirement.nextContactDate) continue;
        const contactMs = new Date(requirement.nextContactDate).getTime();
        if (contactMs < kstTodayMs) overdueBuyerCount += 1;
        if (contactMs < kstTomorrowMs) {
          const contactName =
            requirement.buyerIntake?.contacts?.[0]?.contact?.name ?? '고객';
          attentionItems.push({
            kind: 'buyer',
            id: requirement.id,
            title: contactName,
            dueDate: new Date(requirement.nextContactDate).toISOString(),
          });
        }
      }

      attentionItems.sort(
        (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
      );

      let commissionAmountTotal = 0;
      let unsettledCommissionTotal = 0;
      for (const participant of employee.dealParticipants) {
        const amount = participant.commissionAmount ?? 0;
        commissionAmountTotal += amount;
        if (participant.settlementStatus !== 'settled') {
          unsettledCommissionTotal += amount;
        }
      }

      return {
        id: employee.id,
        officeId: employee.officeId,
        loginId: employee.loginId,
        email: employee.email,
        name: employee.name,
        phone: employee.phone,
        role: employee.role,
        isActive: employee.isActive,
        licenseType: employee.licenseType,
        licenseNo: employee.licenseNo,
        payType: employee.payType,
        baseSalary: employee.baseSalary,
        commissionRate:
          employee.commissionRate === null ? null : Number(employee.commissionRate),
        employmentType: employee.employmentType,
        withholdTax: employee.withholdTax,
        createdAt: employee.createdAt,
        updatedAt: employee.updatedAt,
        counts: {
          activeTaskCount: employee.assignedTasks.length,
          activeBuyerRequirementCount: employee.assignedRequirements.length,
          activeDealCount: employee.dealParticipants.filter(
            (participant) => participant.deal.stage !== 'closed',
          ).length,
          unsettledDealCount: employee.dealParticipants.filter(
            (participant) => participant.settlementStatus !== 'settled',
          ).length,
          overdueTaskCount,
          overdueBuyerCount,
          unsettledCommissionTotal,
          consultationCount:
            employee._count?.consultations ?? employee.consultations.length,
          commissionAmountTotal,
        },
        attentionItems: attentionItems.slice(0, MAX_ATTENTION_ITEMS_PER_EMPLOYEE),
        latestActivityAt:
          latestActivityAt && latestConsultationAt
            ? latestActivityAt > latestConsultationAt
              ? latestActivityAt
              : latestConsultationAt
            : latestActivityAt ?? latestConsultationAt,
      };
    });
  }

  /**
   * 기본 정보 + 딸린 목록 전부. 직원을 고친 뒤의 응답이 이 모양이다.
   * 조회는 findProfile(기본·건수)과 findSection(목록 하나)으로 나눠 받는다.
   */
  async findOne(id: string, officeId: string) {
    const employee = await this.prisma.user.findFirst({
      where: { id, officeId },
      include: employeeDetailInclude,
    });

    if (!employee) {
      throw new NotFoundException('직원을 찾을 수 없습니다.');
    }

    return this.enrichEmployee(employee);
  }

  /**
   * 직원 한 명의 기본 정보와 건수. 딸린 목록은 싣지 않는다(findSection).
   * 건수는 목록을 세지 않고 DB에서 바로 센다 — 목록은 상한에서 잘리지만 건수는 잘리지 않는다.
   */
  async findProfile(id: string, officeId: string) {
    const employee = await this.prisma.user.findFirst({
      where: { id, officeId },
      include: { office: employeeDetailInclude.office },
    });
    if (!employee) {
      throw new NotFoundException('직원을 찾을 수 없습니다.');
    }

    const kstToday = kstDayStartUtc();
    const activeTask = { ...employeeDetailInclude.assignedTasks.where, assignedToId: id, officeId };
    const activeRequirement = {
      ...employeeDetailInclude.assignedRequirements.where,
      assignedToId: id,
      officeId,
    };
    const participation = { ...employeeDetailInclude.dealParticipants.where, userId: id, officeId };
    const [
      activeTaskCount,
      overdueTaskCount,
      activeBuyerRequirementCount,
      overdueBuyerCount,
      activeProjectCount,
      activeDealCount,
      unsettledDealCount,
      commissionAll,
      commissionUnsettled,
    ] = await Promise.all([
      this.prisma.task.count({ where: activeTask }),
      this.prisma.task.count({ where: { ...activeTask, dueDate: { lt: kstToday } } }),
      this.prisma.buyerRequirement.count({ where: activeRequirement }),
      this.prisma.buyerRequirement.count({
        where: { ...activeRequirement, nextContactDate: { lt: kstToday } },
      }),
      this.prisma.project.count({
        where: { ...employeeDetailInclude.assignedProjects.where, assignedToId: id, officeId },
      }),
      this.prisma.dealParticipant.count({
        where: { ...participation, deal: { isCancelled: false, stage: { not: 'closed' } } },
      }),
      this.prisma.dealParticipant.count({
        where: { ...participation, settlementStatus: { not: 'settled' } },
      }),
      this.prisma.dealParticipant.aggregate({
        where: participation,
        _sum: { commissionAmount: true },
      }),
      this.prisma.dealParticipant.aggregate({
        where: { ...participation, settlementStatus: { not: 'settled' } },
        _sum: { commissionAmount: true },
      }),
    ]);

    return {
      ...this.employeeBaseFields(employee),
      office: employee.office,
      counts: {
        activeTaskCount,
        activeBuyerRequirementCount,
        activeProjectCount,
        activeDealCount,
        unsettledDealCount,
        overdueTaskCount,
        overdueBuyerCount,
        unsettledCommissionTotal: commissionUnsettled._sum.commissionAmount ?? 0,
        commissionAmountTotal: commissionAll._sum.commissionAmount ?? 0,
      },
    };
  }

  /**
   * 직원 상세에 딸린 목록 하나. 줄의 모양·조건·순서·상한은 employeeDetailInclude가 정한다
   * (진행 중인 것만, 급한 것부터 — 그 주석 참고). 보는 사람에 따른 가리기는 sectionForViewer.
   */
  async findSection(id: string, officeId: string, section: EmployeeSection) {
    const where = { id, officeId };
    const missing = () => new NotFoundException('직원을 찾을 수 없습니다.');
    switch (section) {
      case 'tasks': {
        const row = await this.prisma.user.findFirst({
          where,
          select: { assignedTasks: employeeDetailInclude.assignedTasks },
        });
        if (!row) throw missing();
        return row.assignedTasks;
      }
      case 'buyerRequirements': {
        const row = await this.prisma.user.findFirst({
          where,
          select: { assignedRequirements: employeeDetailInclude.assignedRequirements },
        });
        if (!row) throw missing();
        return row.assignedRequirements.map(withBuyerRequirementContact);
      }
      case 'projects': {
        const row = await this.prisma.user.findFirst({
          where,
          select: { assignedProjects: employeeDetailInclude.assignedProjects },
        });
        if (!row) throw missing();
        return row.assignedProjects.map(withProjectStepCounts);
      }
      case 'deals': {
        const row = await this.prisma.user.findFirst({
          where,
          select: { dealParticipants: employeeDetailInclude.dealParticipants },
        });
        if (!row) throw missing();
        return row.dealParticipants;
      }
      case 'settlements': {
        const row = await this.prisma.user.findFirst({
          where,
          select: { settlementLines: employeeDetailInclude.settlementLines },
        });
        if (!row) throw missing();
        return row.settlementLines.map(toSettlementSummary);
      }
      case 'consultations': {
        const row = await this.prisma.user.findFirst({
          where,
          select: { consultations: employeeDetailInclude.consultations },
        });
        if (!row) throw missing();
        return row.consultations;
      }
      case 'activities': {
        const row = await this.prisma.user.findFirst({
          where,
          select: { activityLogs: employeeDetailInclude.activityLogs },
        });
        if (!row) throw missing();
        return row.activityLogs;
      }
    }
  }

  /**
   * 목록 하나에 거는 가리기 — forViewer가 상세 전체에 하던 것과 같은 기준이다.
   * 대표와 본인은 그대로 본다. 그 밖에는 정산 내역을 비우고, 중개사에게는 남의 거래 수수료를 가린다.
   */
  sectionForViewer(
    viewer: CurrentUserPayload,
    employeeId: string,
    section: EmployeeSection,
    rows: readonly object[],
  ): readonly object[] {
    if (viewer.role === 'owner' || viewer.userId === employeeId) return rows;
    if (section === 'settlements') return [];
    if (section === 'deals' && viewer.role === 'agent') {
      return rows.map((row) => ({ ...row, commissionAmount: null, commissionRate: null }));
    }
    return rows;
  }

  /**
   * 사장님 직원 발급: Auth0 계정과 자체 DB User를 함께 만든다.
   * DB 저장이 실패하면 방금 만든 Auth0 계정을 지워, 로그인만 되고 주인 없는 계정이 남지 않게 한다.
   */
  async create(
    actor: CurrentUserPayload,
    dto: {
      name: string;
      password: string;
      phone?: string;
      email?: string;
      role?: string;
      loginId?: string;
      licenseType?: string | null;
      licenseNo?: string | null;
    },
  ) {
    const office = await this.prisma.office.findUnique({
      where: { id: actor.officeId },
      select: { id: true, maxUsers: true },
    });

    if (!office) {
      throw new NotFoundException('사무소를 찾을 수 없습니다.');
    }

    const activeUserCount = await this.prisma.user.count({
      where: { officeId: actor.officeId, isActive: true },
    });
    if (activeUserCount >= office.maxUsers) {
      throw new BadRequestException(
        `최대 사용자 수(${office.maxUsers}명)를 초과했습니다. 플랜을 업그레이드하거나 비활성 처리 후 추가하세요.`,
      );
    }

    const name = typeof dto.name === 'string' ? dto.name.trim() : '';
    if (!name) {
      throw new BadRequestException('이름을 입력해 주세요.');
    }

    const role = dto.role ?? 'agent';
    this.assertMutableRole(actor.role, role);
    const licenseType = this.normalizeLicenseType(dto.licenseType);

    const loginId = dto.loginId ? this.normalizeLoginId(dto.loginId) : '';
    if (!loginId) {
      throw new BadRequestException('로그인 ID를 생성할 수 없습니다.');
    }
    if (loginId.length > LOGIN_ID_MAX_LENGTH || !LOGIN_ID_PATTERN.test(loginId)) {
      throw new BadRequestException(LOGIN_ID_RULE_MESSAGE);
    }
    if (typeof dto.password !== 'string' || !dto.password) {
      throw new BadRequestException('비밀번호를 입력해 주세요.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { loginId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(LOGIN_ID_TAKEN_MESSAGE);
    }

    const email = this.normalizeNullableEmail(dto.email);
    const auth0User = await this.auth0
      .createUser({ username: loginId, password: dto.password, name })
      .catch((error: unknown) => {
        throw this.toAuth0HttpError(error, '직원 계정을 만들지 못했습니다.');
      });

    try {
      const employee = await this.prisma.user.create({
        data: {
          officeId: actor.officeId,
          loginId,
          email,
          name,
          phone: dto.phone,
          role,
          licenseType,
          licenseNo: this.normalizeNullableText(dto.licenseNo),
          auth0Id: auth0User.userId,
        },
        include: employeeDetailInclude,
      });

      return this.enrichEmployee(employee);
    } catch (error) {
      await this.auth0.deleteUser(auth0User.userId).catch((cleanupError) => {
        this.logger.error(
          `직원 생성 실패 뒤 Auth0 계정(${auth0User.userId})을 지우지 못했습니다: ${this.getErrorMessage(cleanupError)}`,
        );
      });

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException(LOGIN_ID_TAKEN_MESSAGE);
        }
      }
      throw error;
    }
  }

  async update(
    id: string,
    actor: CurrentUserPayload,
    dto: {
      name?: string;
      phone?: string | null;
      email?: string | null;
      licenseType?: string | null;
      licenseNo?: string | null;
      payType?: string;
      baseSalary?: number | null;
      commissionRate?: number | null;
      employmentType?: string;
      withholdTax?: boolean;
    },
  ) {
    if (dto.name !== undefined && (typeof dto.name !== 'string' || !dto.name.trim())) {
      throw new BadRequestException('이름을 입력해 주세요.');
    }
    const target = await this.findOne(id, actor.officeId);
    this.assertCanManageTarget(actor.role, target.role);
    // 급여와 배분율은 사장님만 정한다. 매니저는 직원의 이름·연락처·자격만 고칠 수 있다.
    if (
      actor.role !== 'owner' &&
      (dto.payType !== undefined ||
        dto.baseSalary !== undefined ||
        dto.commissionRate !== undefined ||
        dto.employmentType !== undefined ||
        dto.withholdTax !== undefined)
    ) {
      throw new ForbiddenException('급여와 배분율은 대표만 변경할 수 있습니다.');
    }

    if (dto.payType !== undefined && !USER_PAY_TYPES.includes(dto.payType as never)) {
      throw new BadRequestException('유효하지 않은 급여 유형입니다.');
    }
    if (
      dto.commissionRate !== undefined &&
      dto.commissionRate !== null &&
      (typeof dto.commissionRate !== 'number' ||
        !Number.isFinite(dto.commissionRate) ||
        dto.commissionRate < 0 ||
        dto.commissionRate > 100)
    ) {
      throw new BadRequestException('수수료 배분율은 0~100 사이여야 합니다.');
    }
    if (
      dto.baseSalary !== undefined &&
      dto.baseSalary !== null &&
      (!Number.isInteger(dto.baseSalary) || dto.baseSalary < 0)
    ) {
      throw new BadRequestException('기본급은 0 이상의 정수(만원)여야 합니다.');
    }

    if (
      dto.employmentType !== undefined &&
      dto.employmentType !== 'freelancer' &&
      dto.employmentType !== 'employee'
    ) {
      throw new BadRequestException('구분은 프리랜서 또는 근로자여야 합니다.');
    }
    if (dto.withholdTax !== undefined && typeof dto.withholdTax !== 'boolean') {
      throw new BadRequestException('3.3% 공제 여부는 켬 또는 끔이어야 합니다.');
    }

    const employee = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        phone: dto.phone,
        email: dto.email === undefined ? undefined : this.normalizeNullableEmail(dto.email),
        licenseType:
          dto.licenseType === undefined
            ? undefined
            : this.normalizeLicenseType(dto.licenseType),
        licenseNo:
          dto.licenseNo === undefined
            ? undefined
            : this.normalizeNullableText(dto.licenseNo),
        payType: dto.payType,
        baseSalary: dto.baseSalary,
        commissionRate: dto.commissionRate,
        employmentType: dto.employmentType,
        withholdTax: dto.withholdTax,
      },
      include: employeeDetailInclude,
    });

    return this.enrichEmployee(employee);
  }

  async updateStatus(
    id: string,
    actor: CurrentUserPayload,
    isActive: boolean,
  ) {
    // 본문이 비었거나 "false" 같은 문자열이면 어느 쪽으로도 처리하지 않는다.
    if (typeof isActive !== 'boolean') {
      throw new BadRequestException('계정 사용 여부는 켬 또는 끔이어야 합니다.');
    }

    const target = await this.findOne(id, actor.officeId);
    this.assertCanManageTarget(actor.role, target.role);

    if (!isActive) {
      // 접근을 끊는 기준은 우리 DB다. Auth0가 응답하지 않아도 여기서 끝난다:
      // 요청마다 isActive를 읽고, 이 시각 이전에 발급된 토큰은 받지 않는다.
      // 마지막 owner 확인과 변경은 사무소 잠금을 잡은 한 트랜잭션에서 한다.
      const employee = await this.prisma.$transaction(async (tx) => {
        await this.lockOfficeRoleChanges(tx, actor.officeId);
        await this.assertAnotherActiveOwnerRemains(
          tx,
          actor.officeId,
          id,
          '마지막 대표 계정은 비활성화할 수 없습니다. 다른 사람을 먼저 대표로 지정해 주세요.',
        );
        return tx.user.update({
          where: { id },
          data: { isActive: false, tokensValidAfter: new Date() },
          include: employeeDetailInclude,
        });
      });
      await this.disconnectRealtime(id);
      // Auth0 계정 차단과 refresh token 폐기는 뒤처리다. 실패하면 뒤에서 다시 시도한다.
      await this.withinBudget(this.accountSync.lockOut(id, 'deactivated'));
      return this.enrichEmployee(employee);
    }

    // 다시 활성화: Auth0 차단을 먼저 푼다. 못 풀면 로그인할 수 없으므로 DB도 바꾸지 않는다.
    this.accountSync.cancel(id);
    const auth0Id = await this.findAuth0Id(target.id);
    if (auth0Id) {
      await this.auth0.setBlocked(auth0Id, false).catch((error: unknown) => {
        throw this.toAuth0HttpError(error, '계정을 다시 활성화하지 못했습니다.');
      });
    }

    let employee: EmployeeDetail;
    try {
      employee = await this.prisma.user.update({
        where: { id },
        data: { isActive: true },
        include: employeeDetailInclude,
      });
    } catch (error) {
      if (auth0Id) {
        await this.auth0.setBlocked(auth0Id, true).catch((rollbackError) => {
          this.logger.error(
            `활성화 실패 뒤 Auth0 차단 상태(${auth0Id})를 되돌리지 못했습니다: ${this.getErrorMessage(rollbackError)}`,
          );
        });
      }
      throw error;
    }

    return this.enrichEmployee(employee);
  }

  async updateRole(id: string, actor: CurrentUserPayload, role: string) {
    const target = await this.findOne(id, actor.officeId);
    this.assertCanManageTarget(actor.role, target.role);
    this.assertMutableRole(actor.role, role);

    // 역할은 요청마다 DB에서 읽으므로 다음 요청부터 바로 적용된다.
    const employee = await this.prisma.$transaction(async (tx) => {
      // 승격도 같은 잠금을 잡는다(이유는 lockOfficeRoleChanges 설명 참고).
      await this.lockOfficeRoleChanges(tx, actor.officeId);
      if (role !== 'owner') {
        await this.assertAnotherActiveOwnerRemains(
          tx,
          actor.officeId,
          id,
          '마지막 대표 계정의 역할은 바꿀 수 없습니다. 다른 사람을 먼저 대표로 지정해 주세요.',
        );
      }
      return tx.user.update({
        where: { id },
        data: { role },
        include: employeeDetailInclude,
      });
    });

    return this.enrichEmployee(employee);
  }

  /**
   * 사장님이 직원 비밀번호를 새 임시 비밀번호로 재설정한다.
   * 재설정하면 그 직원의 기존 로그인을 모두 끊는다: 이미 발급된 접근 토큰은
   * tokensValidAfter로 즉시 거절하고, 실시간 연결을 끊고, refresh token을 폐기한다.
   * 직원의 API 키(esk_)는 건드리지 않는다.
   */
  async resetPassword(
    id: string,
    actor: CurrentUserPayload,
    newPassword: string,
  ) {
    const target = await this.findOne(id, actor.officeId);
    this.assertCanManageTarget(actor.role, target.role);

    if (!target.id) {
      throw new NotFoundException('직원을 찾을 수 없습니다.');
    }

    if (typeof newPassword !== 'string' || !newPassword) {
      throw new BadRequestException('새 비밀번호를 입력해 주세요.');
    }

    const auth0Id = await this.findAuth0Id(target.id);
    if (!auth0Id) {
      throw new BadRequestException(
        '로그인 계정과 연결되지 않은 직원입니다. 계정 이전이 필요합니다.',
      );
    }

    await this.auth0
      .updatePassword(auth0Id, newPassword)
      .catch((error: unknown) => {
        throw this.toAuth0HttpError(error, '비밀번호를 재설정하지 못했습니다.');
      });

    // 예전 비밀번호로 받은 접근 토큰을 만료 전에 끊는다(우리 DB 기준, 즉시).
    await this.prisma.user.update({
      where: { id: target.id },
      data: { tokensValidAfter: new Date() },
    });
    await this.disconnectRealtime(target.id);

    // Auth0는 비밀번호를 바꿔도 기존 refresh token을 살려 둔다. 폐기하지 않으면 예전
    // PC가 새 접근 토큰을 계속 받을 수 있다. 실패하면 뒤에서 다시 시도한다.
    const revoked = await this.accountSync.lockOut(target.id, 'password-reset');
    if (!revoked) {
      throw new InternalServerErrorException(
        '비밀번호는 바뀌었지만 다른 PC의 로그인 유지를 아직 끊지 못했습니다. 자동으로 다시 시도합니다. 급하면 계정을 잠시 비활성화해 주세요.',
      );
    }

    return {
      success: true,
      message: '비밀번호가 재설정되었습니다. 직원에게 카톡으로 전달하세요.',
    };
  }

  async getPerformance(id: string, officeId: string) {
    const target = await this.prisma.user.findFirst({
      where: { id, officeId },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException('직원을 찾을 수 없습니다.');
    }

    const kstTodayStart = kstDayStartUtc();
    const kstTodayMs = kstTodayStart.getTime();
    const thirtyDaysAgo = new Date(kstTodayMs - 29 * DAY_MS);
    const twentyEightDaysAgoMs = kstTodayMs - 27 * DAY_MS;
    const twentyEightDaysAgo = new Date(twentyEightDaysAgoMs);

    const [
      activeTaskCount,
      activeBuyerRequirementCount,
      activeDealParticipants,
      consultationCount,
      commissionAggregate,
      completedTaskCount30d,
      recentConsultations30d,
      recentActivities28d,
    ] = await Promise.all([
      this.prisma.task.count({
        where: {
          officeId,
          assignedToId: id,
          status: { notIn: ['completed', 'cancelled'] },
        },
      }),
      this.prisma.buyerRequirement.count({
        where: {
          officeId,
          assignedToId: id,
          status: 'active',
        },
      }),
      this.prisma.dealParticipant.findMany({
        where: {
          officeId,
          userId: id,
          deal: { isCancelled: false },
        },
        select: {
          settlementStatus: true,
          deal: { select: { stage: true } },
        },
      }),
      this.prisma.consultation.count({
        where: { officeId, createdById: id },
      }),
      this.prisma.dealParticipant.aggregate({
        where: { officeId, userId: id, deal: { isCancelled: false } },
        _sum: { commissionAmount: true },
      }),
      this.prisma.task.count({
        where: {
          officeId,
          assignedToId: id,
          status: 'completed',
          updatedAt: { gte: thirtyDaysAgo },
        },
      }),
      this.prisma.consultation.findMany({
        where: {
          officeId,
          createdById: id,
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { type: true, createdAt: true },
      }),
      this.prisma.activityLog.findMany({
        where: {
          officeId,
          userId: id,
          createdAt: { gte: twentyEightDaysAgo },
        },
        select: { createdAt: true },
      }),
    ]);

    const consultationByType30d = { phone: 0, visit: 0, online: 0 };
    const weeklyLabels = ['3주 전', '2주 전', '지난주', '이번 주'] as const;
    const weeklyActivity = weeklyLabels.map((label) => ({
      label,
      consultations: 0,
      activities: 0,
    }));

    for (const consultation of recentConsultations30d) {
      if (consultation.type === 'phone') consultationByType30d.phone += 1;
      else if (consultation.type === 'visit') consultationByType30d.visit += 1;
      else if (consultation.type === 'online') consultationByType30d.online += 1;

      const ts = new Date(consultation.createdAt).getTime();
      const bucket = Math.floor((ts - twentyEightDaysAgoMs) / (7 * DAY_MS));
      if (bucket >= 0 && bucket < weeklyActivity.length) {
        weeklyActivity[bucket].consultations += 1;
      }
    }

    for (const activity of recentActivities28d) {
      const ts = new Date(activity.createdAt).getTime();
      const bucket = Math.floor((ts - twentyEightDaysAgoMs) / (7 * DAY_MS));
      if (bucket >= 0 && bucket < weeklyActivity.length) {
        weeklyActivity[bucket].activities += 1;
      }
    }

    return {
      activeTaskCount,
      activeBuyerRequirementCount,
      activeDealCount: activeDealParticipants.filter(
        (participant) => participant.deal.stage !== 'closed',
      ).length,
      closedDealCount: activeDealParticipants.filter((participant) =>
        ['completed', 'closed'].includes(participant.deal.stage),
      ).length,
      unsettledDealCount: activeDealParticipants.filter(
        (participant) => participant.settlementStatus !== 'settled',
      ).length,
      consultationCount,
      commissionAmountTotal:
        commissionAggregate._sum.commissionAmount ?? 0,
      completedTaskCount30d,
      consultationCount30d: recentConsultations30d.length,
      consultationByType30d,
      weeklyActivity,
    };
  }

  /**
   * 급여 설정(급여 유형·기본급·개인 배분율)과 월별 정산 내역은 사장님과 본인만 본다.
   * 그 밖의 사람(매니저, 다른 중개사)에게 나가는 응답에서는 값을 비우고 payVisible을 false로 둔다.
   * 중개사가 다른 직원을 조회할 때는 수수료 집계·긴급 업무/고객 상세 목록·거래 참여 수수료도 가린다.
   * 서비스 안에서 쓰는 값은 그대로이고, 컨트롤러가 응답을 내보내기 직전에 이것을 거친다.
   */
  forViewer<
    T extends {
      id: string;
      payType: string | null;
      baseSalary: number | null;
      commissionRate: number | null;
      employmentType?: string | null;
      withholdTax?: boolean | null;
      counts?: Record<string, number | undefined>;
      attentionItems?: EmployeeAttentionItem[];
      recentSettlementLines?: unknown[];
      dealParticipants?: Array<
        {
          commissionAmount?: number | null;
          commissionRate?: unknown;
        } & Record<string, unknown>
      >;
    },
  >(viewer: CurrentUserPayload, employee: T): T & { payVisible: boolean } {
    if (viewer.role === 'owner' || viewer.userId === employee.id) {
      return { ...employee, payVisible: true };
    }
    const redacted = {
      ...employee,
      payType: null,
      baseSalary: null,
      commissionRate: null,
      employmentType: null,
      withholdTax: null,
      ...(employee.recentSettlementLines !== undefined
        ? { recentSettlementLines: [] }
        : {}),
      payVisible: false,
    };
    if (viewer.role === 'agent') {
      return {
        ...redacted,
        ...(employee.counts
          ? {
              counts: {
                ...employee.counts,
                commissionAmountTotal: 0,
                unsettledCommissionTotal: 0,
              },
            }
          : {}),
        ...(employee.attentionItems ? { attentionItems: [] } : {}),
        ...(employee.dealParticipants
          ? {
              dealParticipants: employee.dealParticipants.map((participant) => ({
                ...participant,
                commissionAmount: null,
                commissionRate: null,
              })),
            }
          : {}),
      } as T & { payVisible: boolean };
    }
    return redacted;
  }

  private employeeBaseFields(
    employee: Pick<
      EmployeeDetail,
      | 'id'
      | 'officeId'
      | 'loginId'
      | 'email'
      | 'name'
      | 'phone'
      | 'role'
      | 'isActive'
      | 'licenseType'
      | 'licenseNo'
      | 'payType'
      | 'baseSalary'
      | 'commissionRate'
      | 'employmentType'
      | 'withholdTax'
      | 'lastLoginAt'
      | 'createdAt'
      | 'updatedAt'
    >,
  ) {
    return {
      id: employee.id,
      officeId: employee.officeId,
      loginId: employee.loginId,
      email: employee.email,
      name: employee.name,
      phone: employee.phone,
      role: employee.role,
      isActive: employee.isActive,
      licenseType: employee.licenseType,
      licenseNo: employee.licenseNo,
      payType: employee.payType,
      baseSalary: employee.baseSalary,
      commissionRate:
        employee.commissionRate === null ? null : Number(employee.commissionRate),
      employmentType: employee.employmentType,
      withholdTax: employee.withholdTax,
      lastLoginAt: employee.lastLoginAt ?? null,
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
    };
  }

  private enrichEmployee(employee: EmployeeDetail) {
    const activeTasks = employee.assignedTasks.filter(
      (task) => !['completed', 'cancelled'].includes(task.status),
    );
    const activeRequirements = employee.assignedRequirements.filter(
      (requirement) => requirement.status === 'active',
    );
    const activeDeals = employee.dealParticipants.filter(
      (participant) => participant.deal.stage !== 'closed',
    );
    const assignedProjects = (employee.assignedProjects ?? []).map(withProjectStepCounts);
    const recentSettlementLines = (employee.settlementLines ?? []).map(toSettlementSummary);
    const kstTodayMs = kstDayStartUtc().getTime();

    const overdueTaskCount = activeTasks.filter(
      (task) => task.dueDate != null && new Date(task.dueDate).getTime() < kstTodayMs,
    ).length;
    const overdueBuyerCount = activeRequirements.filter(
      (requirement) =>
        requirement.nextContactDate != null &&
        new Date(requirement.nextContactDate).getTime() < kstTodayMs,
    ).length;

    let commissionAmountTotal = 0;
    let unsettledCommissionTotal = 0;
    for (const participant of employee.dealParticipants) {
      const amount = participant.commissionAmount ?? 0;
      commissionAmountTotal += amount;
      if (participant.settlementStatus !== 'settled') {
        unsettledCommissionTotal += amount;
      }
    }

    return {
      ...this.employeeBaseFields(employee),
      office: employee.office,
      counts: {
        activeTaskCount: activeTasks.length,
        activeBuyerRequirementCount: activeRequirements.length,
        activeProjectCount: assignedProjects.length,
        activeDealCount: activeDeals.length,
        unsettledDealCount: employee.dealParticipants.filter(
          (participant) => participant.settlementStatus !== 'settled',
        ).length,
        overdueTaskCount,
        overdueBuyerCount,
        unsettledCommissionTotal,
        commissionAmountTotal,
      },
      assignedTasks: employee.assignedTasks,
      assignedBuyerRequirements: employee.assignedRequirements.map(
        withBuyerRequirementContact,
      ),
      assignedProjects,
      dealParticipants: employee.dealParticipants,
      recentSettlementLines,
      recentConsultations: employee.consultations,
      recentActivities: employee.activityLogs,
    };
  }

  /**
   * 한 사무소 안의 역할 변경과 비활성화를 한 번에 하나씩만 처리하게 하는 잠금.
   * 트랜잭션이 끝나면 풀린다. "대상 확인 → 남는 owner 확인 → 변경"이 모두 이 잠금
   * 안에서 일어나므로, 확인한 뒤 쓰기 전에 다른 요청이 끼어들어 결과를 뒤집을 수 없다.
   *
   * owner 행만 잠그는 방식으로는 부족하다. 확인 시점에 owner가 아니던 사람이 그 사이
   * owner로 승격되면(사장님 교체), 다른 요청이 그 사람을 "남는 owner"로 세고 통과한 뒤
   * 먼저 시작한 요청이 그 사람을 내려 활성 owner가 0명이 될 수 있다. 그래서 승격도
   * 같은 잠금을 잡는다.
   */
  private async lockOfficeRoleChanges(
    tx: Prisma.TransactionClient,
    officeId: string,
  ) {
    const key = `employee-roles:${officeId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }

  /**
   * 대상이 owner라면, 이 변경(강등·비활성화) 뒤에도 사무소에 활성 owner가 한 명은
   * 남는지 확인한다. 반드시 lockOfficeRoleChanges를 잡은 트랜잭션 안에서, 실제
   * 변경 직전에 부른다.
   */
  private async assertAnotherActiveOwnerRemains(
    tx: Prisma.TransactionClient,
    officeId: string,
    targetId: string,
    message: string,
  ) {
    const current = await tx.user.findFirst({
      where: { id: targetId, officeId },
      select: { role: true },
    });
    if (current?.role !== 'owner') return;

    const otherActiveOwners = await tx.user.count({
      where: {
        officeId,
        role: 'owner',
        isActive: true,
        id: { not: targetId },
      },
    });
    if (otherActiveOwners < 1) throw new BadRequestException(message);
  }

  private assertCanManageTarget(actorRole: string, targetRole: string) {
    if (actorRole === 'manager' && targetRole !== 'agent') {
      throw new ForbiddenException('매니저는 중개사 계정만 관리할 수 있습니다.');
    }
  }

  private assertMutableRole(actorRole: string, nextRole: string) {
    if (!['owner', 'manager', 'agent'].includes(nextRole)) {
      throw new BadRequestException('유효하지 않은 역할입니다.');
    }

    if (actorRole === 'manager' && nextRole !== 'agent') {
      throw new ForbiddenException('매니저는 중개사 계정만 만들거나 바꿀 수 있습니다.');
    }

    if (nextRole === 'owner' && actorRole !== 'owner') {
      throw new ForbiddenException('대표 역할은 대표만 줄 수 있습니다.');
    }
  }

  private normalizeLoginId(loginId: string) {
    return typeof loginId === 'string' ? loginId.trim().toLowerCase() : '';
  }

  private normalizeLicenseType(licenseType?: string | null) {
    if (licenseType === undefined || licenseType === null || licenseType === '') {
      return null;
    }
    if (!USER_LICENSE_TYPES.includes(licenseType as never)) {
      throw new BadRequestException('유효하지 않은 자격 구분입니다.');
    }
    return licenseType;
  }

  private normalizeNullableText(value?: string | null) {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeNullableEmail(email?: string | null) {
    if (email === undefined || email === null || email.trim() === '') {
      return null;
    }

    return email.trim().toLowerCase();
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'unknown';
  }

  /** 이미 연결된 실시간 화면을 끊는다. 실패해도 다음 연결 시도는 인증에서 거절된다. */
  private async disconnectRealtime(userId: string): Promise<void> {
    await this.realtime.disconnectUser(userId).catch((error: unknown) => {
      this.logger.warn(
        `직원(${userId})의 실시간 연결을 끊지 못했습니다: ${this.getErrorMessage(error)}`,
      );
    });
  }

  /** 뒤처리의 첫 시도를 잠깐만 기다린다. 오래 걸리면 뒤에서 계속 돌게 두고 넘어간다. */
  private async withinBudget(work: Promise<unknown>): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    const budget = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, LOCKOUT_FOLLOW_UP_WAIT_MS);
      timer.unref?.();
    });
    await Promise.race([work.then(() => undefined), budget]);
    if (timer) clearTimeout(timer);
  }

  private async findAuth0Id(userId: string): Promise<string | null> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { auth0Id: true },
    });
    return row?.auth0Id ?? null;
  }

  /** Auth0 Management API 오류를 화면에 보여 줄 한국어 안내로 바꾼다. */
  private toAuth0HttpError(error: unknown, fallback: string): HttpException {
    if (error instanceof HttpException) return error;
    if (error instanceof Auth0ManagementError) {
      switch (error.reason) {
        case 'user-exists':
          return new ConflictException(LOGIN_ID_TAKEN_MESSAGE);
        case 'weak-password':
          return new BadRequestException(WEAK_PASSWORD_MESSAGE);
        case 'invalid-username':
          return new BadRequestException(LOGIN_ID_RULE_MESSAGE);
        case 'not-found':
          return new NotFoundException(
            '로그인 계정을 찾을 수 없습니다. 계정 이전이 필요합니다.',
          );
        case 'not-configured':
        case 'unavailable':
          this.logger.error(
            `Auth0 Management API ${error.reason}: ${error.message}`,
          );
          return new ServiceUnavailableException(
            '로그인 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.',
          );
        default:
          break;
      }
    }
    this.logger.error(`${fallback} ${this.getErrorMessage(error)}`);
    return new InternalServerErrorException(fallback);
  }
}

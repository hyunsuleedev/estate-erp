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
  property: { include: { site: true, unit: true } },
  listing: true,
  consultation: true,
} as const;

const dealInclude = {
  listing: {
    include: {
      property: {
        include: {
          site: true,
          unit: true,
        },
      },
    },
  },
  buyerContact: true,
  sellerContact: true,
  contract: true,
} as const;

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

const employeeDetailInclude = {
  office: {
    select: {
      id: true,
      name: true,
      commissionConfig: true,
    },
  },
  assignedTasks: {
    include: taskInclude,
    orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
    take: 20,
  },
  assignedRequirements: {
    include: {
      buyerIntake: { include: { contacts: buyerIntakeContactsInclude } },
    },
    orderBy: [{ nextContactDate: 'asc' }, { createdAt: 'desc' }],
    take: 20,
  },
  dealParticipants: {
    include: {
      deal: {
        include: dealInclude,
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  },
  consultations: {
    include: consultationInclude,
    orderBy: { createdAt: 'desc' },
    take: 10,
  },
  activityLogs: {
    orderBy: { createdAt: 'desc' },
    take: 20,
  },
} satisfies Prisma.UserInclude;

type EmployeeDetail = Prisma.UserGetPayload<{
  include: typeof employeeDetailInclude;
}>;

const USER_LICENSE_TYPES = ['broker_owner', 'broker_associate', 'assistant'] as const;
const USER_PAY_TYPES = ['fixed', 'mixed', 'commission_only'] as const;

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
          select: { id: true },
        },
        assignedRequirements: {
          where: { status: 'active' },
          select: { id: true },
        },
        dealParticipants: {
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
      },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });

    return employees.map((employee) => {
      const latestConsultationAt = employee.consultations[0]?.createdAt ?? null;
      const latestActivityAt = employee.activityLogs[0]?.createdAt ?? null;

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
        },
        latestActivityAt:
          latestActivityAt && latestConsultationAt
            ? latestActivityAt > latestConsultationAt
              ? latestActivityAt
              : latestConsultationAt
            : latestActivityAt ?? latestConsultationAt,
      };
    });
  }

  async findOne(id: string, officeId: string) {
    const employee = await this.prisma.user.findFirst({
      where: { id, officeId },
      include: employeeDetailInclude,
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    return this.enrichEmployee(employee);
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
      throw new NotFoundException('Office not found');
    }

    const activeUserCount = await this.prisma.user.count({
      where: { officeId: actor.officeId, isActive: true },
    });
    if (activeUserCount >= office.maxUsers) {
      throw new BadRequestException(
        `최대 사용자 수(${office.maxUsers}명)를 초과했습니다. 플랜을 업그레이드하거나 비활성 처리 후 추가하세요.`,
      );
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
      .createUser({ username: loginId, password: dto.password, name: dto.name })
      .catch((error: unknown) => {
        throw this.toAuth0HttpError(error, '직원 계정을 만들지 못했습니다.');
      });

    try {
      const employee = await this.prisma.user.create({
        data: {
          officeId: actor.officeId,
          loginId,
          email,
          name: dto.name,
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
    },
  ) {
    const target = await this.findOne(id, actor.officeId);
    this.assertCanManageTarget(actor.role, target.role);

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

    const employee = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
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
      throw new BadRequestException('isActive는 true 또는 false여야 합니다.');
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
          '마지막 owner 계정은 비활성화할 수 없습니다.',
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
          '마지막 owner 계정의 역할은 바꿀 수 없습니다. 다른 사람을 먼저 owner로 지정해 주세요.',
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
      throw new NotFoundException('Employee not found');
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
      throw new NotFoundException('Employee not found');
    }

    const [
      activeTaskCount,
      activeBuyerRequirementCount,
      activeDealParticipants,
      consultationCount,
      commissionAggregate,
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
        where: { officeId, userId: id },
        _sum: { commissionAmount: true },
      }),
    ]);

    return {
      activeTaskCount,
      activeBuyerRequirementCount,
      activeDealCount: activeDealParticipants.filter(
        (participant) => participant.deal.stage !== 'closed',
      ).length,
      unsettledDealCount: activeDealParticipants.filter(
        (participant) => participant.settlementStatus !== 'settled',
      ).length,
      consultationCount,
      commissionAmountTotal:
        commissionAggregate._sum.commissionAmount ?? 0,
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
      createdAt: employee.createdAt,
      updatedAt: employee.updatedAt,
      office: employee.office,
      counts: {
        activeTaskCount: activeTasks.length,
        activeBuyerRequirementCount: activeRequirements.length,
        activeDealCount: activeDeals.length,
        unsettledDealCount: employee.dealParticipants.filter(
          (participant) => participant.settlementStatus !== 'settled',
        ).length,
      },
      assignedTasks: employee.assignedTasks,
      assignedBuyerRequirements: employee.assignedRequirements.map(
        withBuyerRequirementContact,
      ),
      dealParticipants: employee.dealParticipants,
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
      throw new ForbiddenException('manager는 일반 agent만 관리할 수 있습니다.');
    }
  }

  private assertMutableRole(actorRole: string, nextRole: string) {
    if (!['owner', 'manager', 'agent'].includes(nextRole)) {
      throw new BadRequestException('유효하지 않은 역할입니다.');
    }

    if (actorRole === 'manager' && nextRole !== 'agent') {
      throw new ForbiddenException('manager는 agent 계정만 생성/변경할 수 있습니다.');
    }

    if (nextRole === 'owner' && actorRole !== 'owner') {
      throw new ForbiddenException('owner 권한은 owner만 부여할 수 있습니다.');
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

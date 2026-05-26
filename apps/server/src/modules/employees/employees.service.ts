import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { ClerkAuthService } from '../auth/clerk-auth.service';
import { contactPhonesSelectOrdered } from '../contacts/contact-phone.utils';

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
  listing: { select: { id: true, transactionType: true, price: true, checkStatus: true } },
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
      contact: { select: { id: true, name: true, phones: contactPhonesSelectOrdered } },
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

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clerkAuth: ClerkAuthService,
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
          where: { status: { in: ['active', 'matched'] } },
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
   * 사장님 직원 발급: Clerk 사용자와 자체 DB User를 함께 생성한다.
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
    },
  ) {
    const office = await this.prisma.office.findUnique({
      where: { id: actor.officeId },
      select: { id: true },
    });

    if (!office) {
      throw new NotFoundException('Office not found');
    }

    const role = dto.role ?? 'agent';
    this.assertMutableRole(actor.role, role);

    const loginId = dto.loginId ? this.normalizeLoginId(dto.loginId) : '';
    if (!loginId) {
      throw new BadRequestException('로그인 ID를 생성할 수 없습니다.');
    }

    const existing = await this.prisma.user.findUnique({
      where: { loginId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('이미 사용 중인 로그인 ID입니다.');
    }

    const email = this.normalizeNullableEmail(dto.email);
    const clerkUser = await this.clerkAuth.createUser({
      loginId,
      password: dto.password,
      email,
      name: dto.name,
      officeId: actor.officeId,
      role,
    }).catch((error: unknown) => {
      throw new InternalServerErrorException(
        `Clerk user 생성 실패: ${this.getErrorMessage(error)}`,
      );
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
          clerkId: clerkUser.id,
        },
        include: employeeDetailInclude,
      });

      return this.enrichEmployee(employee);
    } catch (error) {
      await this.clerkAuth.deleteUser(clerkUser.id).catch(() => {});

      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === 'P2002') {
          throw new ConflictException('이미 사용 중인 로그인 ID입니다.');
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
    },
  ) {
    const target = await this.findOne(id, actor.officeId);
    this.assertCanManageTarget(actor.role, target.role);

    const employee = await this.prisma.user.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email === undefined ? undefined : this.normalizeNullableEmail(dto.email),
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
    const target = await this.findOne(id, actor.officeId);
    this.assertCanManageTarget(actor.role, target.role);

    if (!isActive && target.role === 'owner') {
      const activeOwnerCount = await this.prisma.user.count({
        where: {
          officeId: actor.officeId,
          role: 'owner',
          isActive: true,
        },
      });

      if (activeOwnerCount <= 1) {
        throw new BadRequestException(
          '마지막 owner 계정은 비활성화할 수 없습니다.',
        );
      }
    }

    const employee = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      include: employeeDetailInclude,
    });

    return this.enrichEmployee(employee);
  }

  async updateRole(id: string, actor: CurrentUserPayload, role: string) {
    const target = await this.findOne(id, actor.officeId);
    this.assertCanManageTarget(actor.role, target.role);
    this.assertMutableRole(actor.role, role);

    const employee = await this.prisma.user.update({
      where: { id },
      data: { role },
      include: employeeDetailInclude,
    });

    return this.enrichEmployee(employee);
  }

  /**
   * 사장님이 직원 Clerk 비밀번호를 새 임시 비밀번호로 재설정한다.
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

    const targetRaw = await this.prisma.user.findUnique({
      where: { id: target.id },
      select: { clerkId: true },
    });

    if (!targetRaw?.clerkId) {
      throw new BadRequestException(
        'Clerk 매핑이 없는 계정입니다. 마이그레이션 필요.',
      );
    }

    try {
      await this.clerkAuth.updateUserPassword(targetRaw.clerkId, newPassword);
    } catch (error) {
      throw new InternalServerErrorException(
        `Clerk 비번 변경 실패: ${this.getErrorMessage(error)}`,
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
          status: { in: ['active', 'matched'] },
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
    const activeRequirements = employee.assignedRequirements.filter((requirement) =>
      ['active', 'matched'].includes(requirement.status),
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
      assignedBuyerRequirements: employee.assignedRequirements,
      dealParticipants: employee.dealParticipants,
      recentConsultations: employee.consultations,
      recentActivities: employee.activityLogs,
    };
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

  private normalizeNullableEmail(email?: string | null) {
    if (email === undefined || email === null || email.trim() === '') {
      return null;
    }

    return email.trim().toLowerCase();
  }

  private getErrorMessage(error: unknown) {
    return error instanceof Error ? error.message : 'unknown';
  }
}

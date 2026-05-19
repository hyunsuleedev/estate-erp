import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { CurrentUserPayload } from '../../common/decorators/current-user.decorator';
import { SupabaseService } from '../supabase/supabase.service';
import { contactPhonesSelectOrdered } from '../contacts/contact-phone.utils';

const PASSWORD_SALT_ROUNDS = 10;

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
    private readonly supabase: SupabaseService,
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
   * 사장님 직원 발급 (모델 B + Supabase Auth 통합).
   *
   * 흐름:
   *   1. loginId unique 검증 (자체 DB)
   *   2. Supabase admin.createUser (합성 이메일 + 임시 비번)
   *   3. 자체 DB User 생성 (supabaseId, syntheticEmail 매핑)
   *   4. 첫 로그인 시 비번 변경 강제 (mustChangePassword: true)
   *
   * 비번 복구는 resetPassword (옵션 1: 사장님이 새 임시 비번 발급).
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

    const syntheticEmail = this.supabase.buildSyntheticEmail(loginId);

    // 1. Supabase auth.users 생성
    const { data: supabaseData, error: supabaseError } =
      await this.supabase.getAdmin().auth.admin.createUser({
        email: syntheticEmail,
        password: dto.password,
        email_confirm: true,
        user_metadata: {
          loginId,
          name: dto.name,
          realEmail: this.normalizeNullableEmail(dto.email),
        },
      });

    if (supabaseError || !supabaseData.user) {
      throw new InternalServerErrorException(
        `Supabase user 생성 실패: ${supabaseError?.message ?? 'unknown'}`,
      );
    }

    const supabaseUserId = supabaseData.user.id;

    // 2. 자체 DB User 생성 (Supabase 매핑 포함)
    try {
      // password 컬럼은 마이그레이션 잔재라 dummy hash로 채움
      const dummyHash = await bcrypt.hash(
        Math.random().toString(36) + Math.random().toString(36),
        PASSWORD_SALT_ROUNDS,
      );

      const employee = await this.prisma.user.create({
        data: {
          officeId: actor.officeId,
          loginId,
          email: this.normalizeNullableEmail(dto.email),
          password: dummyHash,
          name: dto.name,
          phone: dto.phone,
          role,
          supabaseId: supabaseUserId,
          syntheticEmail,
          mustChangePassword: true, // 사장님이 임시 비번 발급 → 첫 로그인 시 변경 강제
        },
        include: employeeDetailInclude,
      });

      return this.enrichEmployee(employee);
    } catch (error) {
      // 자체 DB 실패 시 Supabase user 청소
      await this.supabase
        .getAdmin()
        .auth.admin.deleteUser(supabaseUserId)
        .catch(() => {
          // orphan supabase user는 운영에서 정리
        });

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
   * 비번 재설정 (옵션 1 — 사장님이 새 임시 비번 직접 발급).
   *
   * 합성 이메일 모델에선 Supabase 기본 reset 메일 흐름이 안 되므로:
   *   1. 사장님이 estate-erp 앱에서 [비번 재설정] 클릭
   *   2. 새 임시 비번 입력 (또는 자동 생성)
   *   3. NestJS가 Supabase admin.updateUserById로 비번 변경
   *   4. 모든 세션 무효화 (signOut global)
   *   5. mustChangePassword: true → 직원 첫 로그인 시 변경 강제
   *   6. 사장님 화면에 새 임시 비번 1회 표시 → 카톡 전달
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

    // Supabase 사용자 매핑 확인
    const targetRaw = await this.prisma.user.findUnique({
      where: { id: target.id },
      select: { supabaseId: true },
    });

    if (!targetRaw?.supabaseId) {
      throw new BadRequestException(
        'Supabase 매핑이 없는 계정입니다. 마이그레이션 필요.',
      );
    }

    // 1. Supabase 비번 변경
    const { error: updateError } = await this.supabase
      .getAdmin()
      .auth.admin.updateUserById(targetRaw.supabaseId, {
        password: newPassword,
      });

    if (updateError) {
      throw new InternalServerErrorException(
        `Supabase 비번 변경 실패: ${updateError.message}`,
      );
    }

    // 2. 모든 세션 무효화 (옛 비번/토큰 즉시 차단)
    await this.supabase
      .getAdmin()
      .auth.admin.signOut(targetRaw.supabaseId, 'global')
      .catch(() => {
        // signOut 실패는 무시 (비번 변경은 이미 완료)
      });

    // 3. 자체 DB 플래그 (첫 로그인 시 변경 강제 + refresh token 폐기)
    await this.prisma.user.update({
      where: { id },
      data: {
        mustChangePassword: true,
        refreshTokenHash: null,
      },
    });

    return {
      success: true,
      message: '비밀번호가 재설정되었습니다. 직원에게 카톡으로 전달하세요.',
    };
  }

  /**
   * 직원 본인 비번 변경 (첫 로그인 시 강제 또는 평소 변경).
   *
   * 흐름:
   *   1. 현재 비번으로 Supabase signInWithPassword (검증)
   *   2. 새 비번으로 admin.updateUserById
   *   3. mustChangePassword: false, passwordChangedAt 기록
   */
  async changeMyPassword(
    actor: CurrentUserPayload,
    dto: { currentPassword: string; newPassword: string },
  ) {
    const me = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { id: true, supabaseId: true, syntheticEmail: true, isActive: true },
    });

    if (!me || !me.isActive) {
      throw new NotFoundException('사용자를 찾을 수 없습니다.');
    }

    if (!me.supabaseId || !me.syntheticEmail) {
      throw new BadRequestException(
        'Supabase 매핑이 없는 계정입니다. 사장님께 문의하세요.',
      );
    }

    if (!dto.newPassword || dto.newPassword.length < 8) {
      throw new BadRequestException('새 비밀번호는 8자 이상이어야 합니다.');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        '새 비밀번호는 현재 비밀번호와 달라야 합니다.',
      );
    }

    // 1. 현재 비번 검증 (Supabase signInWithPassword)
    const { error: signInError } = await this.supabase
      .getAdmin()
      .auth.signInWithPassword({
        email: me.syntheticEmail,
        password: dto.currentPassword,
      });

    if (signInError) {
      throw new BadRequestException('현재 비밀번호가 올바르지 않습니다.');
    }

    // 2. 새 비번으로 변경
    const { error: updateError } = await this.supabase
      .getAdmin()
      .auth.admin.updateUserById(me.supabaseId, {
        password: dto.newPassword,
      });

    if (updateError) {
      throw new InternalServerErrorException(
        `비번 변경 실패: ${updateError.message}`,
      );
    }

    // 3. 자체 DB 플래그 + refresh token 폐기 (재로그인 유도 X — 현재 access token은 유지)
    await this.prisma.user.update({
      where: { id: me.id },
      data: {
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    });

    return { success: true };
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
}

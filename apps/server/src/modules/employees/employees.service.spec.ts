import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Auth0ManagementError } from '../auth/auth0-management.service';
import { EmployeesService } from './employees.service';

const owner = { userId: 'owner-1', officeId: 'office-1', role: 'owner' };
const manager = { userId: 'manager-1', officeId: 'office-1', role: 'manager' };

function employeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'emp-1',
    officeId: 'office-1',
    loginId: 'kim',
    email: null,
    name: '김직원',
    phone: null,
    role: 'agent',
    isActive: true,
    licenseType: null,
    licenseNo: null,
    payType: 'mixed',
    baseSalary: null,
    commissionRate: null,
    createdAt: new Date('2026-11-10T00:00:00Z'),
    updatedAt: new Date('2026-11-10T00:00:00Z'),
    office: { id: 'office-1', name: '사무소', commissionConfig: null },
    assignedTasks: [],
    assignedRequirements: [],
    dealParticipants: [],
    consultations: [],
    activityLogs: [],
    ...overrides,
  };
}

function setup(
  options: {
    auth0Id?: string | null;
    target?: Record<string, unknown> | null;
    activeOwners?: number;
    employees?: Array<Record<string, unknown>>;
    completedTaskCount30d?: number;
    consultations30d?: Array<{ type: string; createdAt: Date }>;
    activities28d?: Array<{ createdAt: Date }>;
    dealParticipants?: Array<{ settlementStatus: string; deal: { stage: string } }>;
    commissionSum?: number | null;
  } = {},
) {
  const auth0Id = options.auth0Id === undefined ? 'auth0|emp-1' : options.auth0Id;
  const target =
    options.target === undefined ? employeeRow() : options.target;
  const calls: string[] = [];
  const prisma = {
    // 트랜잭션 안에서도 같은 가짜 객체를 쓴다.
    $transaction: jest.fn(
      async (run: (tx: unknown) => unknown): Promise<unknown> =>
        run(transactionClient()),
    ),
    $executeRaw: jest.fn(async () => {
      calls.push('db.lockOffice');
      return 1;
    }),
    office: {
      findUnique: jest.fn().mockResolvedValue({ id: 'office-1', maxUsers: 5 }),
    },
    user: {
      count: jest.fn().mockResolvedValue(options.activeOwners ?? 1),
      // create(): 아이디 중복 확인 → null. 그 밖에는 auth0Id 조회.
      findUnique: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        'loginId' in where ? null : { auth0Id },
      ),
      // 대상 직원은 항상 { id, officeId }로 찾는다(다른 사무소 직원은 없는 것으로 본다).
      findFirst: jest.fn(async () => target),
      findMany: jest.fn(async () => options.employees ?? []),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        employeeRow(data),
      ),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        calls.push(`db.update ${Object.keys(data).sort().join(',')}`);
        return employeeRow({ ...(target ?? {}), ...data });
      }),
    },
    task: {
      count: jest.fn(async ({ where }: { where?: { status?: unknown } }) =>
        where?.status === 'completed' ? (options.completedTaskCount30d ?? 0) : 0,
      ),
    },
    buyerRequirement: {
      count: jest.fn().mockResolvedValue(0),
    },
    dealParticipant: {
      findMany: jest.fn(async () => options.dealParticipants ?? []),
      aggregate: jest.fn(async () => ({
        _sum: { commissionAmount: options.commissionSum ?? 0 },
      })),
    },
    consultation: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn(async () => options.consultations30d ?? []),
    },
    activityLog: {
      findMany: jest.fn(async () => options.activities28d ?? []),
    },
  };
  function transactionClient(): unknown {
    return prisma;
  }
  const auth0 = {
    createUser: jest.fn().mockResolvedValue({ userId: 'auth0|new' }),
    deleteUser: jest.fn().mockResolvedValue(undefined),
    updatePassword: jest.fn(async () => {
      calls.push('auth0.updatePassword');
    }),
    setBlocked: jest.fn(async (_id: string, blocked: boolean) => {
      calls.push(`auth0.setBlocked(${blocked})`);
    }),
  };
  const accountSync = {
    lockOut: jest.fn(async (_id: string, reason: string) => {
      calls.push(`accountSync.lockOut(${reason})`);
      return true;
    }),
    cancel: jest.fn(),
  };
  const realtime = {
    disconnectUser: jest.fn(async () => {
      calls.push('realtime.disconnectUser');
    }),
  };
  const service = new EmployeesService(
    prisma as never,
    auth0 as never,
    accountSync as never,
    realtime as never,
  );
  return { service, prisma, auth0, accountSync, realtime, calls };
}

const createDto = { name: '김직원', password: 'Secret-123', loginId: ' Kim ' };

describe('EmployeesService account management (Auth0)', () => {
  describe('create', () => {
    it('creates the Auth0 account and stores its id on the DB user', async () => {
      const { service, prisma, auth0 } = setup();

      const result = await service.create(owner, createDto);

      expect(auth0.createUser).toHaveBeenCalledWith({
        username: 'kim',
        password: 'Secret-123',
        name: '김직원',
      });
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            officeId: 'office-1',
            loginId: 'kim',
            role: 'agent',
            auth0Id: 'auth0|new',
          }),
        }),
      );
      expect(result.loginId).toBe('kim');
      expect(auth0.deleteUser).not.toHaveBeenCalled();
    });

    it('deletes the Auth0 account again when the DB write fails', async () => {
      const { service, prisma, auth0 } = setup();
      prisma.user.create.mockRejectedValueOnce(new Error('db down'));

      await expect(service.create(owner, createDto)).rejects.toThrow('db down');
      expect(auth0.deleteUser).toHaveBeenCalledWith('auth0|new');
    });

    it('reports a login id race as a conflict and still rolls the Auth0 account back', async () => {
      const { service, prisma, auth0 } = setup();
      prisma.user.create.mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.create(owner, createDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(auth0.deleteUser).toHaveBeenCalledWith('auth0|new');
    });

    it('rejects login ids Auth0 would refuse before calling Auth0', async () => {
      const { service, auth0 } = setup();
      for (const loginId of ['x'.repeat(31), '김직원', 'has space']) {
        await expect(
          service.create(owner, { ...createDto, loginId }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(auth0.createUser).not.toHaveBeenCalled();
    });

    it('does not create anything when the login id is already in the DB', async () => {
      const { service, prisma, auth0 } = setup();
      prisma.user.findUnique.mockResolvedValueOnce({ id: 'someone' } as never);
      await expect(service.create(owner, createDto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(auth0.createUser).not.toHaveBeenCalled();
    });

    it('turns Auth0 errors into Korean messages with the right status', async () => {
      const cases: Array<[Auth0ManagementError, unknown, string]> = [
        [new Auth0ManagementError('user-exists', 409, 'The user already exists.'), ConflictException, '이미 사용 중인 로그인 ID'],
        [new Auth0ManagementError('weak-password', 400, 'PasswordStrengthError'), BadRequestException, '비밀번호가 보안 기준'],
        [new Auth0ManagementError('invalid-username', 400, 'Username can only…'), BadRequestException, '아이디는 영문 소문자'],
        [new Auth0ManagementError('unavailable', null, 'fetch failed'), ServiceUnavailableException, '로그인 서버에 연결하지 못했습니다'],
        [new Auth0ManagementError('not-configured', null, 'missing'), ServiceUnavailableException, '로그인 서버에 연결하지 못했습니다'],
        [new Auth0ManagementError('unknown', 403, 'Insufficient scope'), InternalServerErrorException, '직원 계정을 만들지 못했습니다'],
      ];
      for (const [error, type, message] of cases) {
        const { service, prisma, auth0 } = setup();
        auth0.createUser.mockRejectedValueOnce(error);
        const attempt = service.create(owner, createDto);
        await expect(attempt).rejects.toBeInstanceOf(type as never);
        await expect(attempt).rejects.toThrow(message);
        expect(prisma.user.create).not.toHaveBeenCalled();
      }
    });
  });

  describe('resetPassword', () => {
    it('sets the password, then ends every existing login of that user', async () => {
      const { service, prisma, auth0, accountSync, calls } = setup();

      await expect(
        service.resetPassword('emp-1', owner, 'New-Secret-1'),
      ).resolves.toMatchObject({ success: true });

      expect(auth0.updatePassword).toHaveBeenCalledWith('auth0|emp-1', 'New-Secret-1');
      // 이미 발급된 접근 토큰은 DB의 기준 시각으로 즉시 끊고, 실시간 연결을 끊고,
      // refresh token을 폐기한다.
      expect(calls).toEqual([
        'auth0.updatePassword',
        'db.update tokensValidAfter',
        'realtime.disconnectUser',
        'accountSync.lockOut(password-reset)',
      ]);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: { tokensValidAfter: expect.any(Date) },
      });
      expect(accountSync.lockOut).toHaveBeenCalledWith('emp-1', 'password-reset');
    });

    it('explains a weak password and changes nothing else', async () => {
      const { service, prisma, auth0, accountSync } = setup();
      auth0.updatePassword.mockRejectedValueOnce(
        new Auth0ManagementError('weak-password', 400, 'PasswordStrengthError'),
      );
      await expect(service.resetPassword('emp-1', owner, 'abc')).rejects.toThrow(
        '비밀번호가 보안 기준',
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(accountSync.lockOut).not.toHaveBeenCalled();
    });

    it('refuses a user that has no Auth0 account', async () => {
      const { service, auth0 } = setup({ auth0Id: null });
      await expect(
        service.resetPassword('emp-1', owner, 'New-Secret-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(auth0.updatePassword).not.toHaveBeenCalled();
    });

    it('does not report success while the old refresh tokens are still alive', async () => {
      const { service, prisma, accountSync } = setup();
      accountSync.lockOut.mockResolvedValueOnce(false);
      await expect(
        service.resetPassword('emp-1', owner, 'New-Secret-1'),
      ).rejects.toThrow('아직 끊지 못했습니다');
      // 그래도 이미 발급된 접근 토큰은 끊겼다.
      expect(prisma.user.update).toHaveBeenCalled();
    });
  });

  describe('updateStatus', () => {
    it('cuts access in the DB first; Auth0 is a follow-up', async () => {
      const { service, prisma, accountSync, calls } = setup();

      const result = await service.updateStatus('emp-1', owner, false);

      // 사무소 잠금 → DB 변경 → 연결 끊기 → Auth0 뒤처리 순서다.
      expect(calls).toEqual([
        'db.lockOffice',
        'db.update isActive,tokensValidAfter',
        'realtime.disconnectUser',
        'accountSync.lockOut(deactivated)',
      ]);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'emp-1' },
          data: { isActive: false, tokensValidAfter: expect.any(Date) },
        }),
      );
      expect(accountSync.lockOut).toHaveBeenCalledWith('emp-1', 'deactivated');
      expect(result.isActive).toBe(false);
    });

    it('deactivates even when Auth0 cannot be reached', async () => {
      const { service, prisma, accountSync } = setup();
      // 뒤처리가 실패해 뒤에서 다시 시도하는 중(false).
      accountSync.lockOut.mockResolvedValueOnce(false);

      const result = await service.updateStatus('emp-1', owner, false);

      expect(result.isActive).toBe(false);
      expect(prisma.user.update).toHaveBeenCalled();
    });

    it('does not wait forever for a slow Auth0 follow-up', async () => {
      jest.useFakeTimers();
      try {
        const { service, accountSync } = setup();
        accountSync.lockOut.mockReturnValueOnce(new Promise<boolean>(() => undefined));

        const pending = service.updateStatus('emp-1', owner, false);
        await jest.advanceTimersByTimeAsync(4_000);

        await expect(pending).resolves.toMatchObject({ isActive: false });
      } finally {
        jest.useRealTimers();
      }
    });

    it('still deactivates when the realtime disconnect fails', async () => {
      const { service, realtime, accountSync } = setup();
      realtime.disconnectUser.mockRejectedValueOnce(new Error('redis down'));
      await expect(
        service.updateStatus('emp-1', owner, false),
      ).resolves.toMatchObject({ isActive: false });
      expect(accountSync.lockOut).toHaveBeenCalled();
    });

    it('reactivation unblocks Auth0 first and cancels a pending lock-out retry', async () => {
      const { service, accountSync, calls } = setup({
        target: employeeRow({ isActive: false }),
      });

      const result = await service.updateStatus('emp-1', owner, true);

      expect(accountSync.cancel).toHaveBeenCalledWith('emp-1');
      expect(calls).toEqual(['auth0.setBlocked(false)', 'db.update isActive']);
      expect(result.isActive).toBe(true);
    });

    it('does not reactivate in the DB when Auth0 cannot be updated', async () => {
      const { service, prisma, auth0 } = setup();
      auth0.setBlocked.mockRejectedValueOnce(
        new Auth0ManagementError('unavailable', null, 'fetch failed'),
      );
      await expect(
        service.updateStatus('emp-1', owner, true),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(prisma.user.update).not.toHaveBeenCalled();

      const missing = setup();
      missing.auth0.setBlocked.mockRejectedValueOnce(
        new Auth0ManagementError('not-found', 404, 'The user does not exist.'),
      );
      await expect(
        missing.service.updateStatus('emp-1', owner, true),
      ).rejects.toThrow('로그인 계정을 찾을 수 없습니다');
      expect(missing.prisma.user.update).not.toHaveBeenCalled();
    });

    it('blocks Auth0 again when the reactivating DB write fails', async () => {
      const { service, prisma, calls } = setup();
      prisma.user.update.mockRejectedValueOnce(new Error('db down'));

      await expect(service.updateStatus('emp-1', owner, true)).rejects.toThrow(
        'db down',
      );
      expect(calls).toEqual(['auth0.setBlocked(false)', 'auth0.setBlocked(true)']);
    });

    it('rejects a missing or non-boolean isActive without touching anything', async () => {
      for (const value of [undefined, null, 'false', 'true', 0, 1, {}]) {
        const { service, prisma, auth0, accountSync, realtime } = setup();
        await expect(
          service.updateStatus('emp-1', owner, value as never),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(prisma.user.findFirst).not.toHaveBeenCalled();
        expect(prisma.user.update).not.toHaveBeenCalled();
        expect(auth0.setBlocked).not.toHaveBeenCalled();
        expect(accountSync.lockOut).not.toHaveBeenCalled();
        expect(realtime.disconnectUser).not.toHaveBeenCalled();
      }
    });

    it('does not deactivate the last active owner', async () => {
      // 다른 활성 owner가 없다(count는 대상 자신을 뺀 수).
      const { service, prisma, calls } = setup({
        target: employeeRow({ id: 'owner-1', role: 'owner' }),
        activeOwners: 0,
      });
      await expect(
        service.updateStatus('owner-1', owner, false),
      ).rejects.toThrow('마지막 대표 계정은 비활성화할 수 없습니다');
      expect(prisma.user.update).not.toHaveBeenCalled();
      // 확인은 사무소 잠금을 잡은 뒤, 변경과 같은 트랜잭션에서 한다.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(calls).toEqual(['db.lockOffice']);
      expect(prisma.user.count).toHaveBeenCalledWith({
        where: {
          officeId: 'office-1',
          role: 'owner',
          isActive: true,
          id: { not: 'owner-1' },
        },
      });

      const twoOwners = setup({
        target: employeeRow({ id: 'owner-2', role: 'owner' }),
        activeOwners: 1,
      });
      await expect(
        twoOwners.service.updateStatus('owner-2', owner, false),
      ).resolves.toMatchObject({ isActive: false });
    });
  });

  describe('employee detail for activity tracking', () => {
    it('loads only work in progress, most urgent first, so overdue work is never cut off', async () => {
      const { service, prisma } = setup();
      await service.findOne('emp-1', 'office-1');

      const calls = prisma.user.findFirst.mock.calls as unknown as Array<
        [{ include: Record<string, { where?: unknown; orderBy?: unknown; take?: number }> }]
      >;
      const { include } = calls[0][0];
      // 끝난 일이 자리를 채워 밀린 일이 잘리지 않게 한다
      expect(include.assignedTasks.where).toEqual({
        status: { notIn: ['completed', 'cancelled'] },
      });
      expect(include.assignedTasks.orderBy).toEqual([
        { dueDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
      ]);
      expect(include.assignedRequirements.where).toEqual({ status: 'active' });
      expect(include.assignedRequirements.orderBy).toEqual([
        { nextContactDate: { sort: 'asc', nulls: 'last' } },
        { createdAt: 'desc' },
      ]);
      // 취소한 거래는 진행·미정산 어디에도 세지 않는다
      expect(include.dealParticipants.where).toEqual({ deal: { isCancelled: false } });
      // 미정산 거래가 먼저
      expect(include.dealParticipants.orderBy).toEqual([
        { settlementStatus: 'desc' },
        { createdAt: 'desc' },
      ]);
      for (const key of ['assignedTasks', 'assignedRequirements', 'dealParticipants']) {
        expect(include[key].take).toBe(100);
      }
    });
  });

  describe('pay settings belong to the owner', () => {
    const agent = { userId: 'emp-1', officeId: 'office-1', role: 'agent' };

    it('lets only an owner change pay type, base salary or commission rate', async () => {
      const { service, prisma } = setup();

      for (const dto of [{ payType: 'fixed' }, { baseSalary: 300 }, { commissionRate: 40 }, { commissionRate: null }]) {
        await expect(service.update('emp-1', manager, dto)).rejects.toBeInstanceOf(
          ForbiddenException,
        );
      }
      expect(prisma.user.update).not.toHaveBeenCalled();

      // 매니저는 급여가 아닌 정보는 그대로 고칠 수 있다
      await service.update('emp-1', manager, { name: '김수정', phone: '01011112222' });
      expect(prisma.user.update).toHaveBeenCalledTimes(1);

      await service.update('emp-1', owner, { payType: 'fixed', baseSalary: 300, commissionRate: 40 });
      expect(prisma.user.update).toHaveBeenCalledTimes(2);
    });

    it('shows pay settings to the owner and to the employee themself, and to nobody else', async () => {
      const { service } = setup({
        target: employeeRow({ payType: 'mixed', baseSalary: 250, commissionRate: 45 }),
      });
      const employee = await service.findOne('emp-1', 'office-1');

      expect(service.forViewer(owner, employee)).toMatchObject({
        payType: 'mixed',
        baseSalary: 250,
        commissionRate: 45,
        payVisible: true,
      });
      expect(service.forViewer(agent, employee)).toMatchObject({
        baseSalary: 250,
        commissionRate: 45,
        payVisible: true,
      });
      for (const viewer of [manager, { userId: 'emp-2', officeId: 'office-1', role: 'agent' }]) {
        expect(service.forViewer(viewer, employee)).toMatchObject({
          id: 'emp-1',
          name: '김직원',
          payType: null,
          baseSalary: null,
          commissionRate: null,
          payVisible: false,
        });
      }
    });
  });

  describe('tenant scoping and role rules', () => {
    it('looks the target up by id AND the actor’s office in every account operation', async () => {
      const operations: Array<(s: EmployeesService) => Promise<unknown>> = [
        (s) => s.updateStatus('emp-x', owner, false),
        (s) => s.updateStatus('emp-x', owner, true),
        (s) => s.updateRole('emp-x', owner, 'manager'),
        (s) => s.resetPassword('emp-x', owner, 'New-Secret-1'),
        (s) => s.update('emp-x', owner, { name: '이름' }),
      ];
      for (const operation of operations) {
        // 다른 사무소 직원의 id: { id, officeId } 조회에 걸리지 않는다.
        const { service, prisma, auth0, accountSync } = setup({ target: null });
        await expect(operation(service)).rejects.toBeInstanceOf(NotFoundException);
        expect(prisma.user.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({ where: { id: 'emp-x', officeId: 'office-1' } }),
        );
        expect(prisma.user.update).not.toHaveBeenCalled();
        expect(auth0.updatePassword).not.toHaveBeenCalled();
        expect(auth0.setBlocked).not.toHaveBeenCalled();
        expect(accountSync.lockOut).not.toHaveBeenCalled();
      }
    });

    it('a manager can only act on agents', async () => {
      for (const targetRole of ['owner', 'manager']) {
        const operations: Array<(s: EmployeesService) => Promise<unknown>> = [
          (s) => s.updateStatus('emp-1', manager, false),
          (s) => s.updateRole('emp-1', manager, 'agent'),
          (s) => s.resetPassword('emp-1', manager, 'New-Secret-1'),
          (s) => s.update('emp-1', manager, { name: '이름' }),
        ];
        for (const operation of operations) {
          const { service, prisma, auth0, accountSync } = setup({
            target: employeeRow({ role: targetRole }),
            activeOwners: 2,
          });
          await expect(operation(service)).rejects.toBeInstanceOf(
            ForbiddenException,
          );
          expect(prisma.user.update).not.toHaveBeenCalled();
          expect(auth0.updatePassword).not.toHaveBeenCalled();
          expect(accountSync.lockOut).not.toHaveBeenCalled();
        }
      }

      const onAgent = setup();
      await expect(
        onAgent.service.resetPassword('emp-1', manager, 'New-Secret-1'),
      ).resolves.toMatchObject({ success: true });
    });

    it('a manager cannot create or promote anyone above agent', async () => {
      for (const role of ['owner', 'manager']) {
        const { service, auth0, prisma } = setup();
        await expect(
          service.create(manager, { ...createDto, role }),
        ).rejects.toBeInstanceOf(ForbiddenException);
        await expect(
          service.updateRole('emp-1', manager, role),
        ).rejects.toBeInstanceOf(ForbiddenException);
        expect(auth0.createUser).not.toHaveBeenCalled();
        expect(prisma.user.update).not.toHaveBeenCalled();
      }
    });

    it('only an owner can grant the owner role, and unknown roles are rejected', async () => {
      const byOwner = setup();
      await expect(
        byOwner.service.updateRole('emp-1', owner, 'owner'),
      ).resolves.toMatchObject({ role: 'owner' });

      const unknown = setup();
      await expect(
        unknown.service.updateRole('emp-1', owner, 'admin'),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        unknown.service.create(owner, { ...createDto, role: 'admin' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to demote the last active owner', async () => {
      for (const role of ['manager', 'agent']) {
        // 다른 활성 owner가 없다(count는 대상 자신을 뺀 수).
        const { service, prisma } = setup({
          target: employeeRow({ id: 'owner-1', role: 'owner' }),
          activeOwners: 0,
        });
        await expect(
          service.updateRole('owner-1', owner, role),
        ).rejects.toThrow('마지막 대표 계정의 역할은 바꿀 수 없습니다');
        expect(prisma.user.update).not.toHaveBeenCalled();
        expect(prisma.user.count).toHaveBeenCalledWith({
          where: {
            officeId: 'office-1',
            role: 'owner',
            isActive: true,
            id: { not: 'owner-1' },
          },
        });
      }
    });

    it('lets an owner be demoted while another active owner remains, under the office lock', async () => {
      const { service, prisma, calls } = setup({
        target: employeeRow({ id: 'owner-2', role: 'owner' }),
        activeOwners: 1,
      });
      await expect(
        service.updateRole('owner-2', owner, 'manager'),
      ).resolves.toMatchObject({ role: 'manager' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // 잠금 → 확인 → 변경 순서여야 동시에 두 owner를 내리는 경우를 막는다.
      expect(calls).toEqual(['db.lockOffice', 'db.update role']);
    });

    it('takes the office lock for every role change, including promotions', async () => {
      // 대상이 owner가 아니면 남는 owner 수는 세지 않지만 잠금은 잡는다.
      const agent = setup();
      await agent.service.updateRole('emp-1', owner, 'manager');
      expect(agent.prisma.user.count).not.toHaveBeenCalled();
      expect(agent.calls).toEqual(['db.lockOffice', 'db.update role']);

      // 승격(사장님 교체의 앞 절반)도 같은 잠금 안에서 쓴다.
      const promote = setup();
      await promote.service.updateRole('emp-1', owner, 'owner');
      expect(promote.prisma.user.count).not.toHaveBeenCalled();
      expect(promote.calls).toEqual(['db.lockOffice', 'db.update role']);
    });

    it('takes the office lock before deactivating anyone, owner or not', async () => {
      const { service, calls } = setup();
      await service.updateStatus('emp-1', owner, false);
      expect(calls[0]).toBe('db.lockOffice');
      expect(calls[1]).toBe('db.update isActive,tokensValidAfter');
    });
  });

  describe('findAll ops hub metrics and privacy', () => {
    function kstDayDates() {
      const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
      const nowKst = new Date(Date.now() + KST_OFFSET_MS);
      const kstMidnightUtcMs =
        Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), nowKst.getUTCDate()) -
        KST_OFFSET_MS;
      return {
        yesterdayLate: new Date(kstMidnightUtcMs - 60_000), // 전날 23:59 KST
        todayEarly: new Date(kstMidnightUtcMs + 60_000), // 오늘 00:01 KST
        todayNoon: new Date(kstMidnightUtcMs + 12 * 60 * 60 * 1000), // 오늘 12:00 KST
        tomorrowStart: new Date(kstMidnightUtcMs + 24 * 60 * 60 * 1000), // 내일 00:00 KST
      };
    }

    it('computes overdue counts, commission sums, consultation count, and sorted attention items using KST day boundaries', async () => {
      const { yesterdayLate, todayEarly, todayNoon, tomorrowStart } = kstDayDates();

      const { service } = setup({
        employees: [
          employeeRow({
            id: 'emp-1',
            payType: 'mixed',
            baseSalary: 250,
            commissionRate: 55,
            employmentType: 'freelancer',
            withholdTax: true,
            assignedTasks: [
              { id: 't-late', title: '계약서 검토', dueDate: yesterdayLate },
              { id: 't-today', title: '오늘 잔금 확인', dueDate: todayNoon },
              { id: 't-tomorrow', title: '내일 일정', dueDate: tomorrowStart },
              { id: 't-none', title: '기한 없는 업무', dueDate: null },
            ],
            assignedRequirements: [
              {
                id: 'b-late',
                nextContactDate: yesterdayLate,
                buyerIntake: { contacts: [{ isPrimary: true, contact: { name: '오세훈' } }] },
              },
              {
                id: 'b-today',
                nextContactDate: todayEarly,
                buyerIntake: { contacts: [{ isPrimary: true, contact: { name: '윤서영' } }] },
              },
              {
                id: 'b-tomorrow',
                nextContactDate: tomorrowStart,
                buyerIntake: { contacts: [{ isPrimary: true, contact: { name: '장민혁' } }] },
              },
            ],
            dealParticipants: [
              { settlementStatus: 'unsettled', commissionAmount: 540, deal: { id: 'd-1', stage: 'contract' } },
              { settlementStatus: 'settled', commissionAmount: 720, deal: { id: 'd-2', stage: 'closed' } },
              { settlementStatus: 'unsettled', commissionAmount: null, deal: { id: 'd-3', stage: 'interim' } },
            ],
            consultations: [{ id: 'c-1', createdAt: todayNoon }],
            activityLogs: [{ id: 'a-1', createdAt: todayEarly }],
            _count: { consultations: 42 },
          }),
        ],
      });

      const list = await service.findAll('office-1');
      expect(list).toHaveLength(1);
      const item = list[0];
      expect(item.counts).toEqual({
        activeTaskCount: 4,
        activeBuyerRequirementCount: 3,
        activeDealCount: 2,
        unsettledDealCount: 2,
        overdueTaskCount: 1,
        overdueBuyerCount: 1,
        unsettledCommissionTotal: 540,
        consultationCount: 42,
        commissionAmountTotal: 1260,
      });
      expect(item.attentionItems.map((a) => `${a.kind}:${a.id}:${a.title}`)).toEqual([
        'task:t-late:계약서 검토',
        'buyer:b-late:오세훈',
        'buyer:b-today:윤서영',
        'task:t-today:오늘 잔금 확인',
      ]);
      expect(item.latestActivityAt).toEqual(todayNoon);
    });

    it('redacts other employees commission totals and attention items for agents while keeping manager visibility', async () => {
      const { todayEarly } = kstDayDates();
      const { service } = setup({
        employees: [
          employeeRow({
            id: 'emp-1',
            payType: 'mixed',
            baseSalary: 250,
            commissionRate: 60,
            employmentType: 'freelancer',
            withholdTax: true,
            assignedTasks: [{ id: 't-1', title: '대외비 고객 업무', dueDate: todayEarly }],
            assignedRequirements: [],
            dealParticipants: [
              { settlementStatus: 'unsettled', commissionAmount: 450, deal: { id: 'd-1', stage: 'contract' } },
            ],
            _count: { consultations: 15 },
          }),
        ],
      });

      const [row] = await service.findAll('office-1');

      // owner sees everything + pay
      const asOwner = service.forViewer(owner, row);
      expect(asOwner.payVisible).toBe(true);
      expect(asOwner.commissionRate).toBe(60);
      expect(asOwner.counts.commissionAmountTotal).toBe(450);
      expect(asOwner.counts.unsettledCommissionTotal).toBe(450);
      expect(asOwner.attentionItems).toHaveLength(1);

      // manager sees ops hub totals/attention but not pay
      const asManager = service.forViewer(manager, row);
      expect(asManager.payVisible).toBe(false);
      expect(asManager.payType).toBeNull();
      expect(asManager.commissionRate).toBeNull();
      expect(asManager.counts.commissionAmountTotal).toBe(450);
      expect(asManager.attentionItems).toHaveLength(1);

      // self (agent viewing own row) sees own pay, commissions, attention
      const selfViewer = { userId: 'emp-1', officeId: 'office-1', role: 'agent' };
      const asSelf = service.forViewer(selfViewer, row);
      expect(asSelf.payVisible).toBe(true);
      expect(asSelf.commissionRate).toBe(60);
      expect(asSelf.counts.commissionAmountTotal).toBe(450);
      expect(asSelf.attentionItems).toHaveLength(1);

      // another agent sees neither pay nor other employee's commission sums nor attention items
      const otherAgent = { userId: 'emp-2', officeId: 'office-1', role: 'agent' };
      const asOtherAgent = service.forViewer(otherAgent, row);
      expect(asOtherAgent.payVisible).toBe(false);
      expect(asOtherAgent.payType).toBeNull();
      expect(asOtherAgent.counts.commissionAmountTotal).toBe(0);
      expect(asOtherAgent.counts.unsettledCommissionTotal).toBe(0);
      expect(asOtherAgent.attentionItems).toEqual([]);
    });

    it('enriches findOne with projects, lastLoginAt, and settlement lines while gating pay visibility via forViewer', async () => {
      const loginAt = new Date('2026-11-22T01:00:00Z');
      const confirmedAt = new Date('2026-11-05T03:00:00Z');
      const { service } = setup({
        target: employeeRow({
          id: 'emp-1',
          lastLoginAt: loginAt,
          assignedProjects: [
            {
              id: 'proj-1',
              title: '김민수 고객 갈아타기',
              memo: '메모',
              createdAt: new Date('2026-11-01T00:00:00Z'),
              updatedAt: new Date('2026-11-20T00:00:00Z'),
              primaryContact: { id: 'c-1', name: '김민수' },
              steps: [
                { id: 's-1', doneAt: new Date('2026-11-10T00:00:00Z'), listingIntakeId: null, buyerIntakeId: null, dealId: null },
                { id: 's-2', doneAt: null, listingIntakeId: null, buyerIntakeId: 'bi-1', dealId: null },
              ],
              _count: { listingIntakes: 1, buyerIntakes: 1, steps: 2, comments: 1 },
            },
          ],
          dealParticipants: [
            {
              id: 'dp-1',
              role: 'buying_agent',
              side: 'buyer',
              commissionAmount: 350,
              commissionRate: 50,
              settlementStatus: 'unsettled',
              settlementDate: null,
              deal: { id: 'deal-1', stage: 'contracted', transactionType: 'sale', payments: [] },
            },
          ],
          settlementLines: [
            {
              id: 'sl-1',
              employmentType: 'freelancer',
              withholdTax: true,
              targetWon: 3500000,
              shareWon: 1750000,
              baseWon: 2000000,
              adjustWon: 0,
              carryInWon: 0,
              withholdingWon: 123750,
              netWon: 3626250,
              carryOutWon: 0,
              paidAt: confirmedAt,
              settlement: {
                id: 'set-1',
                month: '2026-10',
                timing: 'closed',
                confirmedAt,
              },
            },
          ],
        }),
      });

      const detail = await service.findOne('emp-1', 'office-1');
      expect(detail.lastLoginAt).toEqual(loginAt);
      expect(detail.counts.activeProjectCount).toBe(1);
      expect(detail.assignedProjects[0]).toMatchObject({
        id: 'proj-1',
        completedStepCount: 1,
        totalStepCount: 2,
      });
      expect(detail.recentSettlementLines[0]).toMatchObject({
        id: 'sl-1',
        month: '2026-10',
        netWon: 3626250,
      });

      const asOwner = service.forViewer(owner, detail);
      expect(asOwner.payVisible).toBe(true);
      expect(asOwner.recentSettlementLines).toHaveLength(1);
      expect(asOwner.dealParticipants[0].commissionAmount).toBe(350);

      const asSelf = service.forViewer({ userId: 'emp-1', officeId: 'office-1', role: 'agent' }, detail);
      expect(asSelf.payVisible).toBe(true);
      expect(asSelf.recentSettlementLines).toHaveLength(1);

      const asManager = service.forViewer(manager, detail);
      expect(asManager.payVisible).toBe(false);
      expect(asManager.recentSettlementLines).toEqual([]);
      expect(asManager.dealParticipants[0].commissionAmount).toBe(350);

      const asOtherAgent = service.forViewer({ userId: 'emp-2', officeId: 'office-1', role: 'agent' }, detail);
      expect(asOtherAgent.payVisible).toBe(false);
      expect(asOtherAgent.recentSettlementLines).toEqual([]);
      expect(asOtherAgent.dealParticipants[0].commissionAmount).toBeNull();
      expect(asOtherAgent.dealParticipants[0].commissionRate).toBeNull();
    });

    it('computes 30d scorecard metrics and 4-week activity buckets in getPerformance', async () => {
      const { todayNoon } = kstDayDates();
      const twoWeeksAgo = new Date(todayNoon.getTime() - 10 * 86_400_000);
      const { service } = setup({
        completedTaskCount30d: 7,
        dealParticipants: [
          { settlementStatus: 'unsettled', deal: { stage: 'contracted' } },
          { settlementStatus: 'settled', deal: { stage: 'completed' } },
          { settlementStatus: 'settled', deal: { stage: 'closed' } },
        ],
        commissionSum: 1480,
        consultations30d: [
          { type: 'phone', createdAt: todayNoon },
          { type: 'visit', createdAt: todayNoon },
          { type: 'online', createdAt: twoWeeksAgo },
        ],
        activities28d: [
          { createdAt: todayNoon },
          { createdAt: todayNoon },
          { createdAt: twoWeeksAgo },
        ],
      });

      const perf = await service.getPerformance('emp-1', 'office-1');
      expect(perf).toMatchObject({
        activeDealCount: 2,
        closedDealCount: 2,
        unsettledDealCount: 1,
        completedTaskCount30d: 7,
        consultationCount30d: 3,
        commissionAmountTotal: 1480,
        consultationByType30d: { phone: 1, visit: 1, online: 1 },
      });
      expect(perf.weeklyActivity).toEqual([
        { label: '3주 전', consultations: 0, activities: 0 },
        { label: '2주 전', consultations: 0, activities: 0 },
        { label: '지난주', consultations: 1, activities: 1 },
        { label: '이번 주', consultations: 2, activities: 2 },
      ]);
    });
  });
});

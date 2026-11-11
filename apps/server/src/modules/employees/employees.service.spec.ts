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
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) =>
        employeeRow(data),
      ),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        calls.push(`db.update ${Object.keys(data).sort().join(',')}`);
        return employeeRow({ ...(target ?? {}), ...data });
      }),
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
      ).rejects.toThrow('마지막 owner 계정은 비활성화할 수 없습니다');
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
        ).rejects.toThrow('마지막 owner 계정의 역할은 바꿀 수 없습니다');
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
});

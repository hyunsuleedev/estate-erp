import { Auth0PasswordChangeService } from './auth0-password-change.service';

function setup(
  user: { id: string; tokensValidAfter: Date | null } | null,
  secret: string | undefined = 's3cret-value',
) {
  const calls: string[] = [];
  // users 표의 한 행. updateMany는 DB처럼 조건을 그 순간의 값으로 판단한다.
  const row = user ? { ...user } : null;
  const prisma = {
    user: {
      findUnique: jest.fn(async () => (row ? { id: row.id } : null)),
      updateMany: jest.fn(
        async (args: {
          where: { OR: [{ tokensValidAfter: null }, { tokensValidAfter: { lt: Date } }] };
          data: { tokensValidAfter: Date };
        }) => {
          if (!row) return { count: 0 };
          const lt = args.where.OR[1].tokensValidAfter.lt;
          if (row.tokensValidAfter && row.tokensValidAfter.getTime() >= lt.getTime()) {
            return { count: 0 };
          }
          row.tokensValidAfter = args.data.tokensValidAfter;
          calls.push(`tokensValidAfter=${args.data.tokensValidAfter.toISOString()}`);
          return { count: 1 };
        },
      ),
    },
  };
  const config = { get: jest.fn(() => secret) };
  const accountSync = {
    lockOut: jest.fn(async (_id: string, reason: string): Promise<boolean> => {
      calls.push(`lockOut(${reason})`);
      return true;
    }),
  };
  const realtime = {
    disconnectUser: jest.fn(async () => {
      calls.push('disconnectRealtime');
    }),
  };
  const service = new Auth0PasswordChangeService(
    prisma as never,
    config as never,
    accountSync as never,
    realtime as never,
  );
  return { service, prisma, accountSync, realtime, calls, row };
}

const NOW = new Date('2026-11-15T10:00:00.000Z');

describe('Auth0PasswordChangeService', () => {
  it('accepts only the configured secret, and nothing when it is not configured', () => {
    const { service } = setup(null);
    expect(service.isAuthorized('s3cret-value')).toBe(true);
    expect(service.isAuthorized('s3cret-valuX')).toBe(false);
    expect(service.isAuthorized('short')).toBe(false);
    expect(service.isAuthorized(undefined)).toBe(false);

    expect(setup(null, undefined).service.isAuthorized('anything')).toBe(false);
    expect(setup(null, '  ').service.isAuthorized('  ')).toBe(false);
  });

  it('cuts logins made before the change: cutoff at the change time, realtime, refresh tokens', async () => {
    const { service, calls, prisma } = setup({ id: 'user-1', tokensValidAfter: null });
    const changedAt = new Date('2026-11-15T09:59:58.000Z');

    const result = await service.handlePasswordChanged('auth0|owner', changedAt, NOW);

    expect(result).toBe('locked-out');
    expect(prisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { auth0Id: 'auth0|owner' } }),
    );
    // 기준 시각은 알림을 받은 지금이 아니라 변경 시각이다. 새 비밀번호로 로그인한
    // 세션(로그인 시각이 변경 뒤)은 알림이 늦게 와도 끊기지 않는다.
    expect(calls).toEqual([
      `tokensValidAfter=${changedAt.toISOString()}`,
      'disconnectRealtime',
      'lockOut(password-reset)',
    ]);
  });

  it('never moves the cutoff backwards, and still revokes (staff reset already stamped a later time)', async () => {
    const { service, calls } = setup({
      id: 'user-1',
      tokensValidAfter: new Date('2026-11-15T09:59:59.500Z'),
    });
    await expect(
      service.handlePasswordChanged('auth0|staff', new Date('2026-11-15T09:59:59.000Z'), NOW),
    ).resolves.toBe('locked-out');
    expect(calls).toEqual(['disconnectRealtime', 'lockOut(password-reset)']);
  });

  it('does not skip a repeated notice: a retry after a failed revocation revokes again', async () => {
    const { service, calls, accountSync } = setup({ id: 'user-1', tokensValidAfter: null });
    const changedAt = new Date('2026-11-15T09:59:58.000Z');
    accountSync.lockOut.mockResolvedValueOnce(false);

    // 첫 시도: 기준 시각은 올렸지만 refresh token 폐기가 실패했다.
    await expect(service.handlePasswordChanged('auth0|owner', changedAt, NOW)).resolves.toBe(
      'revoke-pending',
    );
    // 다시 온 알림: 기준 시각이 이미 변경 시각이어도 폐기를 다시 한다.
    await expect(service.handlePasswordChanged('auth0|owner', changedAt, NOW)).resolves.toBe(
      'locked-out',
    );
    expect(accountSync.lockOut).toHaveBeenCalledTimes(2);
    expect(calls.filter((call) => call.startsWith('tokensValidAfter='))).toHaveLength(1);
  });

  it('keeps the latest cutoff when notices are handled at the same time or out of order', async () => {
    const { service, row } = setup({ id: 'user-1', tokensValidAfter: null });
    const earlier = new Date('2026-11-15T09:50:00.000Z');
    const later = new Date('2026-11-15T09:59:00.000Z');

    // 두 알림이 동시에 처리된다. 둘 다 사용자를 읽은 뒤에 쓰더라도 늦은 시각이 남는다.
    await Promise.all([
      service.handlePasswordChanged('auth0|owner', later, NOW),
      service.handlePasswordChanged('auth0|owner', earlier, NOW),
    ]);
    expect(row?.tokensValidAfter).toEqual(later);

    // 더 이른 변경의 알림이 뒤늦게 와도 기준 시각을 되돌리지 않는다.
    await service.handlePasswordChanged('auth0|owner', earlier, NOW);
    expect(row?.tokensValidAfter).toEqual(later);
  });

  it('writes the cutoff with a compare in the database, not from a value read earlier', async () => {
    const { service, prisma } = setup({ id: 'user-1', tokensValidAfter: null });
    const changedAt = new Date('2026-11-15T09:59:58.000Z');
    await service.handlePasswordChanged('auth0|owner', changedAt, NOW);
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
        OR: [{ tokensValidAfter: null }, { tokensValidAfter: { lt: changedAt } }],
      },
      data: { tokensValidAfter: changedAt },
    });
  });

  it('ignores accounts that are not ERP users', async () => {
    const { service, calls } = setup(null);
    await expect(service.handlePasswordChanged('auth0|stranger', null, NOW)).resolves.toBe(
      'unknown-user',
    );
    expect(calls).toEqual([]);
  });

  it('treats a missing or future change time as now, and still revokes when realtime fails', async () => {
    const { service, calls, realtime } = setup({ id: 'user-1', tokensValidAfter: null });
    realtime.disconnectUser.mockRejectedValue(new Error('redis down'));
    await expect(
      service.handlePasswordChanged('auth0|owner', new Date('2030-01-01T00:00:00.000Z'), NOW),
    ).resolves.toBe('locked-out');
    expect(calls).toEqual([`tokensValidAfter=${NOW.toISOString()}`, 'lockOut(password-reset)']);
  });
});

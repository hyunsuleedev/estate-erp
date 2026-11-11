import { Auth0ManagementError } from './auth0-management.service';
import {
  Auth0AccountSyncService,
  LOCKOUT_RETRY_DELAYS_MS,
} from './auth0-account-sync.service';

class TestSync extends Auth0AccountSyncService {
  scheduled: Array<{ run: () => void; delayMs: number; cancelled: boolean }> = [];
  protected override schedule(run: () => void, delayMs: number) {
    const entry = { run, delayMs, cancelled: false };
    this.scheduled.push(entry);
    return () => {
      entry.cancelled = true;
    };
  }
  /** 예약된 다음 시도를 실행하고 끝날 때까지 기다린다. */
  async runNext() {
    const entry = this.scheduled.shift();
    if (!entry || entry.cancelled) return false;
    entry.run();
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    return true;
  }
}

function setup(user: { auth0Id: string | null; isActive: boolean } | null) {
  const row = user ? { ...user } : null;
  const calls: string[] = [];
  const prisma = {
    user: { findUnique: jest.fn(async () => (row ? { ...row } : null)) },
  };
  const management = {
    setBlocked: jest.fn(async (_id: string, blocked: boolean) => {
      calls.push(`setBlocked(${blocked})`);
    }),
    revokeRefreshTokens: jest.fn(async () => {
      calls.push('revokeRefreshTokens');
    }),
  };
  const service = new TestSync(prisma as never, management as never);
  return { service, prisma, management, calls, row };
}

const down = () => new Auth0ManagementError('unavailable', null, 'fetch failed');

describe('Auth0AccountSyncService', () => {
  it('blocks the account and revokes refresh tokens after a deactivation', async () => {
    const { service, calls } = setup({ auth0Id: 'auth0|u1', isActive: false });
    await expect(service.lockOut('user-1', 'deactivated')).resolves.toBe(true);
    expect(calls).toEqual(['setBlocked(true)', 'revokeRefreshTokens']);
    expect(service.scheduled).toHaveLength(0);
  });

  it('only revokes refresh tokens after a password reset', async () => {
    const { service, calls } = setup({ auth0Id: 'auth0|u1', isActive: true });
    await expect(service.lockOut('user-1', 'password-reset')).resolves.toBe(true);
    expect(calls).toEqual(['revokeRefreshTokens']);
  });

  it('never throws: reports failure and retries with growing delays, then gives up', async () => {
    const { service, management } = setup({ auth0Id: 'auth0|u1', isActive: false });
    management.setBlocked.mockRejectedValue(down());

    await expect(service.lockOut('user-1', 'deactivated')).resolves.toBe(false);
    const delays: number[] = [];
    while (service.scheduled.length > 0) {
      delays.push(service.scheduled[0]?.delayMs ?? -1);
      await service.runNext();
    }
    expect(delays).toEqual(LOCKOUT_RETRY_DELAYS_MS);
    // 첫 시도 + 정해진 횟수만큼만 다시 시도하고 멈춘다.
    expect(management.setBlocked).toHaveBeenCalledTimes(
      LOCKOUT_RETRY_DELAYS_MS.length + 1,
    );
  });

  it('finishes on a later attempt once Auth0 is reachable again', async () => {
    const { service, management, calls } = setup({ auth0Id: 'auth0|u1', isActive: false });
    management.setBlocked.mockRejectedValueOnce(down());

    await expect(service.lockOut('user-1', 'deactivated')).resolves.toBe(false);
    expect(calls).toEqual([]);
    await service.runNext();
    expect(calls).toEqual(['setBlocked(true)', 'revokeRefreshTokens']);
    expect(service.scheduled).toHaveLength(0);
  });

  it('a retry does nothing when the user was reactivated in the meantime', async () => {
    const { service, management, calls, row } = setup({ auth0Id: 'auth0|u1', isActive: false });
    management.setBlocked.mockRejectedValueOnce(down());
    await service.lockOut('user-1', 'deactivated');

    if (row) row.isActive = true;
    await service.runNext();

    expect(calls).toEqual([]);
    expect(service.scheduled).toHaveLength(0);
  });

  it('undoes a block that landed after the user was reactivated', async () => {
    const { service, management, calls, row } = setup({ auth0Id: 'auth0|u1', isActive: false });
    management.setBlocked.mockImplementationOnce(async () => {
      calls.push('setBlocked(true)');
      // 차단 요청이 Auth0에 가 있는 동안 다시 활성화가 끝났다.
      if (row) row.isActive = true;
    });

    await expect(service.lockOut('user-1', 'deactivated')).resolves.toBe(true);
    expect(calls).toEqual(['setBlocked(true)', 'setBlocked(false)']);
    expect(management.revokeRefreshTokens).not.toHaveBeenCalled();
  });

  it('cancel() stops a scheduled retry, and a new lock-out replaces the old one', async () => {
    const { service, management } = setup({ auth0Id: 'auth0|u1', isActive: false });
    management.setBlocked.mockRejectedValue(down());

    await service.lockOut('user-1', 'deactivated');
    const first = service.scheduled[0];
    service.cancel('user-1');
    expect(first?.cancelled).toBe(true);

    await service.lockOut('user-1', 'deactivated');
    const second = service.scheduled.at(-1);
    await service.lockOut('user-1', 'password-reset');
    expect(second?.cancelled).toBe(true);
  });

  it('has nothing to do for users without an Auth0 account or with a deleted one', async () => {
    const legacy = setup({ auth0Id: null, isActive: false });
    await expect(legacy.service.lockOut('user-1', 'deactivated')).resolves.toBe(true);
    expect(legacy.calls).toEqual([]);

    const deleted = setup({ auth0Id: 'auth0|gone', isActive: false });
    deleted.management.setBlocked.mockRejectedValueOnce(
      new Auth0ManagementError('not-found', 404, 'The user does not exist.'),
    );
    await expect(deleted.service.lockOut('user-1', 'deactivated')).resolves.toBe(true);
    expect(deleted.management.revokeRefreshTokens).not.toHaveBeenCalled();
    expect(deleted.service.scheduled).toHaveLength(0);
  });
});

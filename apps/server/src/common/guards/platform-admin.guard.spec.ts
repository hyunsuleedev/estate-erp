import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PlatformAdminGuard } from './platform-admin.guard';

function makeContext(user?: { userId: string }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('PlatformAdminGuard', () => {
  it('allows an active platform admin', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ isPlatformAdmin: true, isActive: true }),
      },
    };
    const guard = new PlatformAdminGuard(prisma as never);

    await expect(guard.canActivate(makeContext({ userId: 'u1' }))).resolves.toBe(
      true,
    );
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'u1' },
      select: { isPlatformAdmin: true, isActive: true },
    });
  });

  it('rejects a non-admin user', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ isPlatformAdmin: false, isActive: true }),
      },
    };
    const guard = new PlatformAdminGuard(prisma as never);

    await expect(
      guard.canActivate(makeContext({ userId: 'u1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an inactive platform admin', async () => {
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ isPlatformAdmin: true, isActive: false }),
      },
    };
    const guard = new PlatformAdminGuard(prisma as never);

    await expect(
      guard.canActivate(makeContext({ userId: 'u1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when request.user is missing without querying DB', async () => {
    const prisma = {
      user: { findUnique: jest.fn() },
    };
    const guard = new PlatformAdminGuard(prisma as never);

    await expect(guard.canActivate(makeContext(undefined))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
});

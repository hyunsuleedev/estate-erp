import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  function createContext(request: Record<string, unknown>) {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as ExecutionContext;
  }

  function createGuard(currentUser: {
    userId: string;
    officeId: string;
    role: string;
  }) {
    return new JwtAuthGuard({
      authenticateBearerToken: jest.fn().mockResolvedValue(currentUser),
    } as never);
  }

  it('blocks office-less users from business APIs before controllers run', async () => {
    const guard = createGuard({
      userId: 'user-1',
      officeId: '',
      role: 'owner',
    });

    await expect(
      guard.canActivate(
        createContext({
          headers: { authorization: 'Bearer token' },
          method: 'GET',
          route: { path: '/contacts' },
          url: '/contacts?limit=1',
        }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows office-less users to fetch auth state for onboarding routing', async () => {
    const request = {
      headers: { authorization: 'Bearer token' },
      method: 'GET',
      route: { path: '/auth/me' },
      url: '/auth/me',
    };
    const guard = createGuard({
      userId: 'user-1',
      officeId: '',
      role: 'owner',
    });

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request).toMatchObject({
      user: {
        userId: 'user-1',
        officeId: '',
        role: 'owner',
      },
    });
  });

  it('allows office-less users to create an office using the full request URL', async () => {
    const guard = createGuard({
      userId: 'user-1',
      officeId: '',
      role: 'owner',
    });

    await expect(
      guard.canActivate(
        createContext({
          headers: { authorization: 'Bearer token' },
          method: 'POST',
          route: { path: '/me' },
          url: '/offices/me',
        }),
      ),
    ).resolves.toBe(true);
  });
});

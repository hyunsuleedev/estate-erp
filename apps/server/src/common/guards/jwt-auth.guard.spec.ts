import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  function createContext(request: Record<string, unknown>) {
    const response = {
      setHeader: jest.fn(),
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
      response,
    } as ExecutionContext & { response: typeof response };
  }

  function createGuard(currentUser: {
    userId: string;
    officeId: string;
    role: string;
  }) {
    const authenticateBearerToken = jest.fn().mockResolvedValue(currentUser);
    return new JwtAuthGuard({
      authenticateBearerToken,
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

  it('exposes auth timing details on successful requests', async () => {
    const currentUser = {
      userId: 'user-1',
      officeId: 'office-1',
      role: 'owner',
    };
    const authenticateBearerToken = jest
      .fn()
      .mockImplementation(async (_token: string, timings: { verifyTokenMs?: number; userLookupMs?: number }) => {
        timings.verifyTokenMs = 7;
        timings.userLookupMs = 3;
        return currentUser;
      });
    const guard = new JwtAuthGuard({ authenticateBearerToken } as never);
    const context = createContext({
      headers: { authorization: 'Bearer token' },
      method: 'GET',
      route: { path: '/contacts' },
      url: '/contacts?limit=1',
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(authenticateBearerToken).toHaveBeenCalledWith(
      'token',
      expect.any(Object),
    );
    expect(context.response.setHeader).toHaveBeenCalledWith(
      'Server-Timing',
      expect.stringContaining('clerk_verify;dur=7'),
    );
    expect(context.response.setHeader).toHaveBeenCalledWith(
      'Server-Timing',
      expect.stringContaining('auth_user;dur=3'),
    );
  });
});

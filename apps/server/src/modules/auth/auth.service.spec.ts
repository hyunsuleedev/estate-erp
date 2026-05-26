import { AuthService } from './auth.service';

describe('AuthService', () => {
  it('returns an authenticated user without an office for onboarding', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          loginId: 'owner@example.com',
          email: 'owner@example.com',
          name: '홍길동',
          role: 'owner',
          isActive: true,
          isPlatformAdmin: false,
          office: null,
        }),
      },
    };
    const service = new AuthService(prisma as never);

    await expect(service.me('user-1')).resolves.toEqual({
      id: 'user-1',
      loginId: 'owner@example.com',
      email: 'owner@example.com',
      name: '홍길동',
      role: 'owner',
      isPlatformAdmin: false,
      office: null,
      onboardingRequired: true,
    });
  });
});

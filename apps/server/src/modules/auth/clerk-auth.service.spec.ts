import { verifyToken } from '@clerk/backend';
import { ClerkAuthService } from './clerk-auth.service';

jest.mock('@clerk/backend', () => ({
  createClerkClient: jest.fn(() => ({
    users: {
      getUser: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      deleteUser: jest.fn(),
    },
    idPOAuthAccessToken: {
      verify: jest.fn(),
    },
  })),
  verifyToken: jest.fn(),
}));

const verifyTokenMock = verifyToken as jest.MockedFunction<typeof verifyToken>;

function createService() {
  const config = {
    get: jest.fn((key: string) => (key === 'CLERK_SECRET_KEY' ? 'sk_test' : undefined)),
  };
  const prisma = {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'user-1',
        clerkId: 'clerk-user-1',
        officeId: 'office-1',
        role: 'owner',
        isActive: true,
        office: { isActive: true },
      }),
    },
  };

  return {
    service: new ClerkAuthService(config as never, prisma as never),
    prisma,
  };
}

describe('ClerkAuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verifyTokenMock.mockResolvedValue({
      sub: 'clerk-user-1',
      exp: Math.floor(Date.now() / 1000) + 60,
    } as never);
  });

  it('reuses a recently authenticated bearer token', async () => {
    const { service, prisma } = createService();

    await service.authenticateBearerToken('session-token');
    await service.authenticateBearerToken('session-token');

    expect(verifyTokenMock).toHaveBeenCalledTimes(1);
    expect(prisma.user.findUnique).toHaveBeenCalledTimes(1);
  });
});

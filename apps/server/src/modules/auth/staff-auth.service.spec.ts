import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Auth0ManagementError } from './auth0-management.service';
import { MAX_ACCESS_TOKEN_LENGTH } from './auth0-token-verifier';
import {
  StaffAuthService,
  VERIFIED_CLAIMS_MAX_ENTRIES,
  isIssuedBeforeCutoff,
} from './staff-auth.service';

const SUB = 'auth0|abc';
const CONNECTION = 'Username-Password-Authentication';
/** 데스크톱 Native 앱의 client ID (직원 REST API 기본 허용 앱). */
const DESKTOP_CLIENT = 'iOIMt1hOFpmyk5IlD1jl0JARuoycUCMF';

type UserRow = {
  id: string;
  auth0Id: string | null;
  loginId: string;
  officeId: string | null;
  role: string;
  isActive: boolean;
  office: { isActive: boolean } | null;
  tokensValidAfter?: Date | null;
};

const linkedUser: UserRow = {
  id: 'user-1',
  auth0Id: SUB,
  loginId: 'hyunsu',
  officeId: 'office-1',
  role: 'owner',
  isActive: true,
  office: { isActive: true },
};

function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

/** 메모리 users 표. auth0Id·loginId가 유일하다. */
function createPrisma(initial: UserRow[] = []) {
  const rows = [...initial];
  const findUnique = jest.fn(
    async ({ where }: { where: { auth0Id?: string; loginId?: string } }) =>
      rows.find((row) =>
        where.auth0Id !== undefined
          ? row.auth0Id === where.auth0Id
          : row.loginId === where.loginId,
      ) ?? null,
  );
  const create = jest.fn(
    async ({ data }: { data: Partial<UserRow> & { loginId: string } }) => {
      if (
        rows.some(
          (row) => row.loginId === data.loginId || row.auth0Id === data.auth0Id,
        )
      ) {
        throw uniqueViolation();
      }
      const row: UserRow = {
        id: `user-${rows.length + 1}`,
        auth0Id: data.auth0Id ?? null,
        loginId: data.loginId,
        officeId: null,
        role: data.role ?? 'agent',
        isActive: true,
        office: null,
      };
      rows.push(row);
      return row;
    },
  );
  const user = { findUnique, create };
  const prisma = {
    user,
    $transaction: jest.fn(async (run: (tx: { user: typeof user }) => unknown) =>
      run({ user }),
    ),
  };
  return { prisma, rows, findUnique, create };
}

function createService(options: {
  users?: UserRow[];
  profile?: unknown;
  getUser?: jest.Mock;
  exp?: number;
  iat?: number | null;
  azp?: string | null;
  staffClientIds?: string;
}) {
  const db = createPrisma(options.users);
  const verifyAccessToken = jest.fn().mockResolvedValue({
    sub: SUB,
    exp: options.exp ?? Math.floor(Date.now() / 1000) + 900,
    ...(options.iat === null
      ? {}
      : { iat: options.iat ?? Math.floor(Date.now() / 1000) }),
    ...(options.azp === null ? {} : { azp: options.azp ?? DESKTOP_CLIENT }),
  });
  const getUser =
    options.getUser ??
    jest.fn().mockResolvedValue(
      options.profile === undefined
        ? {
            userId: SUB,
            username: 'NewOwner',
            name: '새 사장님',
            email: null,
            blocked: false,
            connection: CONNECTION,
          }
        : options.profile,
    );
  const service = new StaffAuthService(
    {
      get: (key: string) =>
        key === 'AUTH0_STAFF_CLIENT_IDS' ? options.staffClientIds : undefined,
    } as never,
    db.prisma as never,
    { verifyAccessToken } as never,
    { getUser, getConnection: () => CONNECTION } as never,
  );
  return { service, verifyAccessToken, getUser, ...db };
}

describe('StaffAuthService', () => {
  it('finds the user by the Auth0 user id in the token, never by login id', async () => {
    const { service, findUnique, getUser } = createService({
      users: [linkedUser],
    });

    await expect(service.authenticateBearerToken('token')).resolves.toEqual({
      userId: 'user-1',
      auth0UserId: SUB,
      officeId: 'office-1',
      role: 'owner',
    });
    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { auth0Id: SUB } }),
    );
    expect(getUser).not.toHaveBeenCalled();
  });

  it('refuses REST tokens minted for any app other than the desktop client', async () => {
    // 외부 AI가 스스로 등록한 MCP 클라이언트(tpc_…)나 URL client_id(CIMD), azp 없는 토큰.
    for (const azp of [
      'tpc_uZXbFzEq5ob2NQW5qeCuWg',
      'https://claude.ai/oauth/claude-code-client-metadata',
      'ZS4hde7sfS7K9jdls8roR959sFPEYuYM',
      null,
    ]) {
      const { service, findUnique } = createService({ users: [linkedUser], azp });
      await expect(service.authenticateBearerToken('token')).rejects.toThrow(
        '이 앱에서는 사용할 수 없는 토큰입니다',
      );
      await expect(
        service.authenticateBearerToken('token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      // 사용자 조회까지 가지 않는다.
      expect(findUnique).not.toHaveBeenCalled();
    }
  });

  it('lets AUTH0_STAFF_CLIENT_IDS replace the allowed apps', async () => {
    const allowed = createService({
      users: [linkedUser],
      azp: 'web-client',
      staffClientIds: ' web-client , other-client ',
    });
    await expect(
      allowed.service.authenticateBearerToken('token'),
    ).resolves.toMatchObject({ userId: 'user-1' });

    const desktopNoLongerListed = createService({
      users: [linkedUser],
      staffClientIds: 'web-client',
    });
    await expect(
      desktopNoLongerListed.service.authenticateBearerToken('token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('remembers the signature check but reads the user on every request', async () => {
    const { service, verifyAccessToken, findUnique } = createService({
      users: [linkedUser],
    });
    const first: Record<string, unknown> = {};
    const second: Record<string, unknown> = {};

    await service.authenticateBearerToken('token', first);
    await service.authenticateBearerToken('token', second);

    expect(verifyAccessToken).toHaveBeenCalledTimes(1);
    // 활성 여부·사무소·역할은 기억하지 않는다.
    expect(findUnique).toHaveBeenCalledTimes(2);
    expect(first.cacheHit).toBeUndefined();
    expect(typeof first.verifyTokenMs).toBe('number');
    expect(second.cacheHit).toBe(true);
    expect(typeof second.userLookupMs).toBe('number');
  });

  it('does not remember a token that is about to expire', async () => {
    const { service, verifyAccessToken } = createService({
      users: [linkedUser],
      exp: Math.floor(Date.now() / 1000) + 2,
    });
    await service.authenticateBearerToken('token');
    await service.authenticateBearerToken('token');
    expect(verifyAccessToken).toHaveBeenCalledTimes(2);
  });

  it('returns the token expiry for callers that keep a connection open', async () => {
    const exp = Math.floor(Date.now() / 1000) + 600;
    const { service } = createService({ users: [linkedUser], exp });
    await expect(service.authenticateBearer('token')).resolves.toEqual({
      user: expect.objectContaining({ userId: 'user-1' }),
      expiresAtSeconds: exp,
    });
  });

  it('applies deactivation, role and office changes to the very next request', async () => {
    const { service, rows } = createService({ users: [{ ...linkedUser }] });
    const row = rows[0];
    if (!row) throw new Error('user row missing');
    await expect(service.authenticateBearerToken('token')).resolves.toMatchObject({
      role: 'owner',
      officeId: 'office-1',
    });

    row.role = 'agent';
    row.officeId = 'office-2';
    await expect(service.authenticateBearerToken('token')).resolves.toMatchObject({
      role: 'agent',
      officeId: 'office-2',
    });

    row.office = { isActive: false };
    await expect(service.authenticateBearerToken('token')).rejects.toThrow(
      '비활성화된 계정',
    );

    row.office = { isActive: true };
    row.isActive = false;
    await expect(service.authenticateBearerToken('token')).rejects.toThrow(
      '비활성화된 계정',
    );
  });

  it('cannot serve a stale "active" answer when a deactivation lands during a request', async () => {
    // 인증이 DB를 읽고 응답하기 전에 비활성화가 끝난 경우. 사용자 결과를 기억하면 이
    // 요청이 뒤늦게 "활성"을 저장해 다음 요청들이 통과한다.
    const { service, rows, findUnique } = createService({ users: [{ ...linkedUser }] });
    const row = rows[0];
    if (!row) throw new Error('user row missing');
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    findUnique.mockImplementationOnce(async () => {
      const snapshot = { ...row };
      await gate;
      return snapshot;
    });

    const inFlight = service.authenticateBearerToken('token');
    await new Promise((resolve) => setImmediate(resolve));
    row.isActive = false;
    release();
    await inFlight;

    await expect(service.authenticateBearerToken('token')).rejects.toThrow(
      '비활성화된 계정',
    );
  });

  it('refuses tokens issued before the user’s cut-off (password reset, deactivation)', async () => {
    const cutoff = new Date('2026-11-11T03:00:00.400Z');
    const cutoffSeconds = Math.floor(cutoff.getTime() / 1000);
    const user = { ...linkedUser, tokensValidAfter: cutoff };

    for (const iat of [cutoffSeconds - 600, cutoffSeconds]) {
      const { service } = createService({ users: [user], iat, exp: cutoffSeconds + 900 });
      await expect(service.authenticateBearerToken('token')).rejects.toThrow(
        '다시 로그인해 주세요',
      );
    }
    // 그 뒤에 새로 로그인해 받은 토큰은 통과한다.
    const fresh = createService({
      users: [user],
      iat: cutoffSeconds + 1,
      exp: Math.floor(Date.now() / 1000) + 900,
    });
    await expect(
      fresh.service.authenticateBearerToken('token'),
    ).resolves.toMatchObject({ userId: 'user-1' });
    // 기준 시각이 있는데 발급 시각이 없는 토큰은 확인할 수 없으니 거절한다.
    const noIat = createService({ users: [user], iat: null });
    await expect(noIat.service.authenticateBearerToken('token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('compares issue time and cut-off on the safe side', () => {
    const cutoff = new Date('2026-11-11T03:00:00.400Z');
    const second = Math.floor(cutoff.getTime() / 1000);
    expect(isIssuedBeforeCutoff(second - 1, cutoff)).toBe(true);
    expect(isIssuedBeforeCutoff(second, cutoff)).toBe(true);
    expect(isIssuedBeforeCutoff(second + 1, cutoff)).toBe(false);
    expect(isIssuedBeforeCutoff(undefined, cutoff)).toBe(true);
    expect(isIssuedBeforeCutoff(undefined, null)).toBe(false);
    expect(isIssuedBeforeCutoff(1, null)).toBe(false);
  });

  it('keys the cache by a fixed-size hash and never holds more than the cap', async () => {
    const { service, verifyAccessToken } = createService({ users: [linkedUser] });
    const cache = (
      service as unknown as { bearerAuthCache: Map<string, unknown> }
    ).bearerAuthCache;

    for (let i = 0; i < VERIFIED_CLAIMS_MAX_ENTRIES + 250; i += 1) {
      await service.authenticateBearerToken(`token-${i}`);
    }

    expect(cache.size).toBeLessThanOrEqual(VERIFIED_CLAIMS_MAX_ENTRIES);
    for (const key of cache.keys()) expect(key).toMatch(/^[0-9a-f]{64}$/);
    // 가장 최근 토큰은 남아 있고, 가장 오래된 토큰은 밀려났다.
    verifyAccessToken.mockClear();
    await service.authenticateBearerToken(
      `token-${VERIFIED_CLAIMS_MAX_ENTRIES + 249}`,
    );
    expect(verifyAccessToken).not.toHaveBeenCalled();
    await service.authenticateBearerToken('token-0');
    expect(verifyAccessToken).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized token before hashing or verifying it', async () => {
    const { service, verifyAccessToken } = createService({ users: [linkedUser] });
    const cache = (
      service as unknown as { bearerAuthCache: Map<string, unknown> }
    ).bearerAuthCache;
    await expect(
      service.authenticateBearerToken('x'.repeat(MAX_ACCESS_TOKEN_LENGTH + 1)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(cache.size).toBe(0);
  });

  it('provisions an office-less owner on the first login of a new signup', async () => {
    const { service, rows, getUser } = createService({});

    await expect(service.authenticateBearerToken('token')).resolves.toEqual({
      userId: 'user-1',
      auth0UserId: SUB,
      officeId: '',
      role: 'owner',
    });
    expect(getUser).toHaveBeenCalledWith(SUB);
    expect(rows).toEqual([
      expect.objectContaining({
        auth0Id: SUB,
        loginId: 'newowner',
        role: 'owner',
        officeId: null,
      }),
    ]);
  });

  it('refuses to link a signup whose username is an existing unlinked login id', async () => {
    const legacy: UserRow = { ...linkedUser, id: 'legacy', auth0Id: null, loginId: 'newowner' };
    const { service, rows } = createService({ users: [legacy] });

    await expect(service.authenticateBearerToken('token')).rejects.toThrow(
      '이미 사용 중인 아이디입니다',
    );
    await expect(
      service.authenticateBearerToken('token'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // 기존 User는 그대로다. 아이디가 같다고 연결하지 않는다.
    expect(rows).toEqual([legacy]);
  });

  it('refuses a username that belongs to a user linked to another Auth0 account', async () => {
    const other: UserRow = { ...linkedUser, auth0Id: 'auth0|other', loginId: 'newowner' };
    const { service, rows } = createService({ users: [other] });
    await expect(service.authenticateBearerToken('token')).rejects.toThrow(
      '이미 사용 중인 아이디입니다',
    );
    expect(rows[0]?.auth0Id).toBe('auth0|other');
  });

  it('rejects deactivated users and users of a deactivated office', async () => {
    for (const user of [
      { ...linkedUser, isActive: false },
      { ...linkedUser, office: { isActive: false } },
    ]) {
      const { service } = createService({ users: [user] });
      await expect(service.authenticateBearerToken('token')).rejects.toThrow(
        '비활성화된 계정',
      );
    }
  });

  it('only provisions accounts from the username-password connection', async () => {
    for (const profile of [
      null,
      { userId: SUB, username: null, name: 'G', email: 'g@example.com', blocked: false, connection: 'google-oauth2' },
      { userId: SUB, username: 'kim', name: 'K', email: null, blocked: false, connection: 'other-db' },
    ]) {
      const { service, rows } = createService({ profile });
      await expect(
        service.authenticateBearerToken('token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(rows).toHaveLength(0);
    }
  });

  it('rejects social-login and app tokens without asking Auth0 about them', async () => {
    for (const sub of ['google-oauth2|123', 'abcDEF123@clients']) {
      const { service, getUser, verifyAccessToken, rows } = createService({});
      verifyAccessToken.mockResolvedValue({
        sub,
        azp: DESKTOP_CLIENT,
        exp: Math.floor(Date.now() / 1000) + 900,
      });
      await expect(
        service.authenticateBearerToken('token'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(getUser).not.toHaveBeenCalled();
      expect(rows).toHaveLength(0);
    }
  });

  it('remembers a rejected account briefly instead of asking Auth0 on every request', async () => {
    const legacy: UserRow = { ...linkedUser, id: 'legacy', auth0Id: null, loginId: 'newowner' };
    const { service, getUser } = createService({ users: [legacy] });

    for (let i = 0; i < 3; i += 1) {
      await expect(service.authenticateBearerToken(`token-${i}`)).rejects.toThrow(
        '이미 사용 중인 아이디입니다',
      );
    }
    expect(getUser).toHaveBeenCalledTimes(1);
  });

  it('retries the lookup after a temporary Auth0 failure', async () => {
    const getUser = jest
      .fn()
      .mockRejectedValueOnce(new Auth0ManagementError('unavailable', 429, 'busy'))
      .mockResolvedValue({
        userId: SUB,
        username: 'newowner',
        name: '새 사장님',
        email: null,
        blocked: false,
        connection: CONNECTION,
      });
    const { service } = createService({ getUser });

    await expect(
      service.authenticateBearerToken('token'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.authenticateBearerToken('token')).resolves.toMatchObject({
      role: 'owner',
      officeId: '',
    });
  });

  it('does not provision a blocked Auth0 account', async () => {
    const { service, rows } = createService({
      profile: { userId: SUB, username: 'kim', name: 'K', email: null, blocked: true, connection: CONNECTION },
    });
    await expect(service.authenticateBearerToken('token')).rejects.toThrow(
      '비활성화된 계정',
    );
    expect(rows).toHaveLength(0);
  });

  it('answers 503 when the new account cannot be looked up, so the app does not sign out', async () => {
    const { service } = createService({
      getUser: jest
        .fn()
        .mockRejectedValue(new Auth0ManagementError('unavailable', null, 'down')),
    });
    await expect(
      service.authenticateBearerToken('token'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('creates the owner once when first requests arrive together', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const getUser = jest.fn(async () => {
      await gate;
      return {
        userId: SUB,
        username: 'newowner',
        name: '새 사장님',
        email: null,
        blocked: false,
        connection: CONNECTION,
      };
    });
    const { service, rows, create } = createService({ getUser });

    const calls = [
      service.authenticateBearerToken('token-a'),
      service.authenticateBearerToken('token-b'),
    ];
    await new Promise((resolve) => setImmediate(resolve));
    release();
    const [a, b] = await Promise.all(calls);

    expect(a.userId).toBe(b.userId);
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(1);
  });

  it('uses the user another server process created first (unique violation)', async () => {
    const { service, prisma, rows } = createService({});
    const raced: UserRow = { ...linkedUser, id: 'raced', officeId: null, office: null, loginId: 'newowner' };
    prisma.$transaction.mockImplementationOnce(async () => {
      rows.push(raced);
      throw uniqueViolation();
    });

    await expect(service.authenticateBearerToken('token')).resolves.toMatchObject({
      userId: 'raced',
    });
  });

  it('can resolve without provisioning for callers that must not create users', async () => {
    const { service, getUser, rows } = createService({});
    await expect(
      service.resolveStaffUser({ sub: SUB, iat: 1 }, { allowProvisioning: false }),
    ).rejects.toThrow('연결되어 있지 않습니다');
    expect(getUser).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });
});

import {
  Auth0ManagementError,
  Auth0ManagementService,
} from './auth0-management.service';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown) {
  return new Response(body === null ? null : JSON.stringify(body), { status });
}

class TestManagement extends Auth0ManagementService {
  calls: Array<{ url: string; method: string; body: unknown; auth: string | null }> = [];
  clock = 1_000_000;
  constructor(
    config: Record<string, string | undefined>,
    private readonly handler: Handler,
  ) {
    super({ get: (key: string) => config[key] } as never);
  }
  protected override async fetchImpl(url: string, init: RequestInit) {
    const headers = (init.headers ?? {}) as Record<string, string>;
    this.calls.push({
      url,
      method: init.method ?? 'GET',
      body: init.body ? JSON.parse(String(init.body)) : null,
      auth: headers.authorization ?? null,
    });
    return this.handler(url, init);
  }
  protected override now() {
    return this.clock;
  }
  sleeps: number[] = [];
  protected override async sleep(ms: number) {
    this.sleeps.push(ms);
  }
  tokenRequests() {
    return this.calls.filter((call) => call.url.endsWith('/oauth/token')).length;
  }
}

const CONFIG = {
  AUTH0_DOMAIN: 'estait.jp.auth0.com',
  AUTH0_MGMT_CLIENT_ID: 'mgmt-client',
  AUTH0_MGMT_CLIENT_SECRET: 'mgmt-secret',
};

const USER = {
  user_id: 'auth0|u1',
  username: 'kim',
  name: '김직원',
  blocked: false,
  identities: [{ provider: 'auth0', connection: 'Username-Password-Authentication' }],
};

function withToken(handler: Handler, expiresIn = 86_400): Handler {
  let issued = 0;
  return (url, init) => {
    if (url.endsWith('/oauth/token')) {
      issued += 1;
      return json(200, { access_token: `mgmt-token-${issued}`, expires_in: expiresIn });
    }
    return handler(url, init);
  };
}

describe('Auth0ManagementService', () => {
  it('requests one management token and reuses it until shortly before expiry', async () => {
    const service = new TestManagement(
      CONFIG,
      withToken(() => json(200, USER)),
    );

    await service.getUser('auth0|u1');
    await service.getUser('auth0|u1');
    expect(service.tokenRequests()).toBe(1);
    expect(service.calls[0]).toMatchObject({
      url: 'https://estait.jp.auth0.com/oauth/token',
      body: {
        grant_type: 'client_credentials',
        client_id: 'mgmt-client',
        client_secret: 'mgmt-secret',
        audience: 'https://estait.jp.auth0.com/api/v2/',
      },
    });
    expect(service.calls[1]?.auth).toBe('Bearer mgmt-token-1');

    // 만료 10분 전: 아직 같은 토큰. 만료 4분 전: 새로 받는다.
    service.clock += (86_400 - 600) * 1000;
    await service.getUser('auth0|u1');
    expect(service.tokenRequests()).toBe(1);
    service.clock += 360 * 1000;
    await service.getUser('auth0|u1');
    expect(service.tokenRequests()).toBe(2);
    expect(service.calls.at(-1)?.auth).toBe('Bearer mgmt-token-2');
  });

  it('shares one token request between concurrent calls', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const service = new TestManagement(CONFIG, async (url) => {
      if (url.endsWith('/oauth/token')) {
        await gate;
        return json(200, { access_token: 'mgmt-token', expires_in: 86_400 });
      }
      return json(200, USER);
    });

    const calls = [
      service.getUser('auth0|u1'),
      service.getUser('auth0|u2'),
      service.setBlocked('auth0|u3', true),
    ];
    await new Promise((resolve) => setImmediate(resolve));
    release();
    await Promise.all(calls);
    expect(service.tokenRequests()).toBe(1);
  });

  it('fetches a fresh token once when the API rejects the cached one', async () => {
    let rejected = false;
    const service = new TestManagement(
      CONFIG,
      withToken(() => {
        if (!rejected) {
          rejected = true;
          return json(401, { message: 'Invalid token' });
        }
        return json(200, USER);
      }),
    );
    await expect(service.getUser('auth0|u1')).resolves.toMatchObject({
      userId: 'auth0|u1',
    });
    expect(service.tokenRequests()).toBe(2);
  });

  it('keeps a token another request already refreshed instead of fetching one per failed request', async () => {
    // 같은 낡은 토큰으로 나간 요청 두 개가 401을 받는다. 먼저 돌아온 요청이 새 토큰을
    // 받아 놓으면, 나중 요청은 그 새 토큰을 버리지 않고 그대로 쓴다.
    let releaseSecond!: () => void;
    const secondGate = new Promise<void>((resolve) => {
      releaseSecond = resolve;
    });
    let staleCalls = 0;
    const service = new TestManagement(
      CONFIG,
      withToken(async (_url, init) => {
        const auth = (init.headers as Record<string, string>).authorization;
        if (auth === 'Bearer mgmt-token-1') {
          staleCalls += 1;
          if (staleCalls === 2) await secondGate;
          return json(401, { message: 'Invalid token' });
        }
        return json(200, USER);
      }),
    );

    const first = service.getUser('auth0|a');
    const second = service.getUser('auth0|b');
    await expect(first).resolves.toMatchObject({ userId: 'auth0|u1' });
    releaseSecond();
    await expect(second).resolves.toMatchObject({ userId: 'auth0|u1' });

    // 처음 받은 토큰 + 새로 받은 토큰 하나. 요청마다 새로 받지 않았다.
    expect(service.tokenRequests()).toBe(2);
  });

  it('maps a user profile and treats a missing user as null', async () => {
    const service = new TestManagement(
      CONFIG,
      withToken((url) =>
        url.endsWith(encodeURIComponent('auth0|gone'))
          ? json(404, { message: 'The user does not exist.' })
          : json(200, USER),
      ),
    );
    await expect(service.getUser('auth0|u1')).resolves.toEqual({
      userId: 'auth0|u1',
      username: 'kim',
      name: '김직원',
      email: null,
      blocked: false,
      connection: 'Username-Password-Authentication',
    });
    await expect(service.getUser('auth0|gone')).resolves.toBeNull();
  });

  it('creates users in the username-password connection', async () => {
    const service = new TestManagement(
      CONFIG,
      withToken(() => json(201, USER)),
    );
    await service.createUser({ username: 'kim', password: 'Secret-123', name: '김직원' });
    expect(service.calls.at(-1)).toMatchObject({
      url: 'https://estait.jp.auth0.com/api/v2/users',
      method: 'POST',
      body: {
        connection: 'Username-Password-Authentication',
        username: 'kim',
        password: 'Secret-123',
        name: '김직원',
      },
    });
  });

  it('classifies the error responses Auth0 actually returns', async () => {
    const cases: Array<[number, unknown, Auth0ManagementError['reason']]> = [
      [409, { message: 'The user already exists.' }, 'user-exists'],
      [400, { message: 'PasswordStrengthError: Password is too weak' }, 'weak-password'],
      [
        400,
        { message: 'Payload validation error: \'"username" does not meet length criteria.\'.' },
        'invalid-username',
      ],
      [
        400,
        { message: 'Username can only contain alphanumeric characters and the following characters: …' },
        'invalid-username',
      ],
      [429, { message: 'Too Many Requests' }, 'unavailable'],
      [500, { message: 'oops' }, 'unavailable'],
      [403, { message: 'Insufficient scope' }, 'unknown'],
    ];
    for (const [status, body, reason] of cases) {
      const service = new TestManagement(
        CONFIG,
        withToken(() => json(status, body)),
      );
      await expect(
        service.createUser({ username: 'kim', password: 'x', name: 'n' }),
      ).rejects.toMatchObject({ name: 'Auth0ManagementError', reason, status });
    }
  });

  it('reports missing credentials and network failures without throwing raw errors', async () => {
    const unconfigured = new TestManagement(
      { AUTH0_DOMAIN: 'estait.jp.auth0.com' },
      () => json(200, USER),
    );
    await expect(unconfigured.getUser('auth0|u1')).rejects.toMatchObject({
      reason: 'not-configured',
    });
    expect(unconfigured.calls).toHaveLength(0);

    const offline = new TestManagement(CONFIG, () => {
      throw new TypeError('fetch failed');
    });
    await expect(offline.getUser('auth0|u1')).rejects.toMatchObject({
      reason: 'unavailable',
    });
  });

  it('revokes every refresh token of a user through device credentials', async () => {
    let listed = 0;
    const service = new TestManagement(
      CONFIG,
      withToken((url, init) => {
        if (init.method === 'DELETE') return json(204, null);
        if (url.includes('type=rotating_refresh_token')) {
          listed += 1;
          return json(200, listed === 1 ? [{ id: 'dcr_1' }, { id: 'dcr_2' }] : []);
        }
        return json(200, []);
      }),
    );
    await service.revokeRefreshTokens('auth0|u1');
    const deletes = service.calls
      .filter((call) => call.method === 'DELETE')
      .map((call) => call.url.split('/').at(-1));
    expect(deletes).toEqual(['dcr_1', 'dcr_2']);
    // 지운 뒤 한 번 더 확인해서, 목록에 늦게 나타난 토큰이 남지 않게 한다.
    expect(listed).toBe(2);
  });

  it('waits and retries when the Management API rate limit is hit', async () => {
    let attempts = 0;
    const service = new TestManagement(
      CONFIG,
      withToken(() => {
        attempts += 1;
        return attempts <= 2
          ? new Response(JSON.stringify({ message: 'Too Many Requests' }), {
              status: 429,
              headers: { 'retry-after': '1' },
            })
          : json(200, USER);
      }),
    );
    await expect(service.getUser('auth0|u1')).resolves.toMatchObject({
      userId: 'auth0|u1',
    });
    expect(attempts).toBe(3);
    expect(service.sleeps).toEqual([1000, 1000]);
    expect(service.tokenRequests()).toBe(1);
  });

  it('gives up with an "unavailable" error when the rate limit persists', async () => {
    const service = new TestManagement(
      CONFIG,
      withToken(() => json(429, { message: 'Too Many Requests' })),
    );
    await expect(service.getUser('auth0|u1')).rejects.toMatchObject({
      reason: 'unavailable',
      status: 429,
    });
    expect(service.sleeps).toHaveLength(2);
  });

  it('fails instead of pretending success when refresh tokens keep reappearing', async () => {
    const service = new TestManagement(
      CONFIG,
      withToken((_url, init) =>
        init.method === 'DELETE' ? json(204, null) : json(200, [{ id: 'dcr_x' }]),
      ),
    );
    await expect(service.revokeRefreshTokens('auth0|u1')).rejects.toBeInstanceOf(
      Auth0ManagementError,
    );
  });

  it('blocks, updates passwords and deletes users; deleting a missing user succeeds', async () => {
    const service = new TestManagement(
      CONFIG,
      withToken((_url, init) =>
        init.method === 'DELETE'
          ? json(404, { message: 'The user does not exist.' })
          : json(200, USER),
      ),
    );
    await service.setBlocked('auth0|u1', true);
    expect(service.calls.at(-1)).toMatchObject({
      method: 'PATCH',
      body: { blocked: true },
    });
    await service.updatePassword('auth0|u1', 'New-Secret-1');
    expect(service.calls.at(-1)).toMatchObject({
      method: 'PATCH',
      body: {
        password: 'New-Secret-1',
        connection: 'Username-Password-Authentication',
      },
    });
    await expect(service.deleteUser('auth0|u1')).resolves.toBeUndefined();
  });
});

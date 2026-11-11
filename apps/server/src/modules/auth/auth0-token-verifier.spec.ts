import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';
import {
  Auth0TokenVerifier,
  MAX_ACCESS_TOKEN_LENGTH,
} from './auth0-token-verifier';

const DOMAIN = 'estait.jp.auth0.com';
const ISSUER = `https://${DOMAIN}/`;
const AUDIENCE = 'https://api.estaitt.com';

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function signToken(
  privateKey: KeyObject,
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT', kid: 'key-1' },
) {
  const unsigned = `${encode(header)}.${encode(payload)}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey);
  return `${unsigned}.${signature.toString('base64url')}`;
}

function validPayload(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: ISSUER,
    sub: 'auth0|abc',
    aud: [AUDIENCE, `${ISSUER}userinfo`],
    iat: now,
    exp: now + 900,
    ...overrides,
  };
}

class TestVerifier extends Auth0TokenVerifier {
  jwksRequests = 0;
  /** 0이면 실제 시계. 테스트가 시간을 옮길 때만 값을 준다. */
  clock = 0;
  constructor(
    config: unknown,
    public jwks: () => unknown,
  ) {
    super(config as never);
  }
  protected override async fetchJwks(): Promise<unknown> {
    this.jwksRequests += 1;
    return this.jwks();
  }
  protected override now(): number {
    return this.clock || Date.now();
  }
}

function newKey(kid: string) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    privateKey,
    jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' },
  };
}

function setup(jwksOverride?: () => unknown) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  const jwk = {
    ...publicKey.export({ format: 'jwk' }),
    kid: 'key-1',
    alg: 'RS256',
    use: 'sig',
  };
  const config = {
    get: (key: string) =>
      key === 'AUTH0_DOMAIN'
        ? DOMAIN
        : key === 'AUTH0_AUDIENCE'
          ? AUDIENCE
          : undefined,
  };
  const verifier = new TestVerifier(
    config,
    jwksOverride ?? (() => ({ keys: [jwk] })),
  );
  return { verifier, privateKey };
}

describe('Auth0TokenVerifier', () => {
  it('returns the claims of a signed access token for this API', async () => {
    const { verifier, privateKey } = setup();
    const claims = await verifier.verifyAccessToken(
      signToken(privateKey, validPayload({ azp: 'desktop-client' })),
    );
    expect(claims.sub).toBe('auth0|abc');
    expect(claims.azp).toBe('desktop-client');
    expect(verifier.getIssuer()).toBe(ISSUER);
  });

  it('rejects tokens for another API, another issuer, expired or tampered', async () => {
    const { verifier, privateKey } = setup();
    const now = Math.floor(Date.now() / 1000);
    const cases = [
      signToken(privateKey, validPayload({ aud: 'https://other.example' })),
      signToken(privateKey, validPayload({ iss: 'https://evil.auth0.com/' })),
      signToken(privateKey, validPayload({ exp: now - 120 })),
      signToken(privateKey, validPayload({ nbf: now + 600 })),
      signToken(privateKey, validPayload({ sub: '' })),
      signToken(privateKey, validPayload(), { alg: 'HS256', kid: 'key-1' }),
      signToken(privateKey, validPayload(), { alg: 'none', kid: 'key-1' }),
      'not-a-jwt',
    ];
    const valid = signToken(privateKey, validPayload());
    const [head, , signature] = valid.split('.');
    cases.push(
      `${head}.${encode(validPayload({ sub: 'auth0|someone-else' }))}.${signature}`,
    );

    for (const token of cases) {
      await expect(verifier.verifyAccessToken(token)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
  });

  it('checks a caller-supplied audience instead of the staff API audience', async () => {
    const { verifier, privateKey } = setup();
    const mcpToken = signToken(
      privateKey,
      validPayload({ aud: 'https://api.estaitt.com/mcp' }),
    );
    await expect(verifier.verifyAccessToken(mcpToken)).rejects.toThrow(
      '이 서버용 토큰이 아닙니다',
    );
    await expect(
      verifier.verifyAccessToken(mcpToken, {
        audience: 'https://api.estaitt.com/mcp',
      }),
    ).resolves.toMatchObject({ sub: 'auth0|abc' });
  });

  it('fetches signing keys once and does not hammer JWKS for unknown key ids', async () => {
    const { verifier, privateKey } = setup();
    await verifier.verifyAccessToken(signToken(privateKey, validPayload()));
    await verifier.verifyAccessToken(signToken(privateKey, validPayload()));
    for (let i = 0; i < 5; i += 1) {
      await expect(
        verifier.verifyAccessToken(
          signToken(privateKey, validPayload(), {
            alg: 'RS256',
            kid: `unknown-${i}`,
          }),
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    }
    expect(verifier.jwksRequests).toBe(1);
  });

  it('answers 503, not 401, for an unknown key id it may not look up yet (key rotation), then judges it', async () => {
    // Auth0가 서명 키를 막 바꿨다. 새 키로 서명된 정상 토큰이, 목록을 다시 받을 수 있는
    // 간격(30초) 안에 도착한다. 401로 답하면 데스크톱이 로그아웃하고 refresh token을 폐기한다.
    const current = newKey('key-1');
    const rotated = newKey('key-2');
    const verifier = setup(() => ({ keys: [current.jwk] })).verifier;
    verifier.clock = 1_800_000_000_000;
    const payload = () => validPayload({ exp: verifier.clock / 1000 + 900 });
    await verifier.verifyAccessToken(signToken(current.privateKey, payload()));

    verifier.jwks = () => ({ keys: [rotated.jwk] });
    const newToken = () =>
      signToken(rotated.privateKey, payload(), { alg: 'RS256', kid: 'key-2' });
    verifier.clock += 5_000;
    await expect(verifier.verifyAccessToken(newToken())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(verifier.jwksRequests).toBe(1);

    // 간격이 지나면 목록을 새로 받아 통과시킨다.
    verifier.clock += 26_000;
    await expect(verifier.verifyAccessToken(newToken())).resolves.toBeTruthy();
    expect(verifier.jwksRequests).toBe(2);
  });

  it('answers 401 for a key id that is missing from a list it has just fetched', async () => {
    const { verifier, privateKey } = setup();
    verifier.clock = 1_800_000_000_000;
    const forged = () =>
      signToken(privateKey, validPayload({ exp: verifier.clock / 1000 + 900 }), {
        alg: 'RS256',
        kid: 'not-ours',
      });

    // 첫 요청: 목록을 받았고, 거기에 없다 → 판정할 수 있다.
    await expect(verifier.verifyAccessToken(forged())).rejects.toThrow(
      '알 수 없는 서명 키',
    );
    // 간격 안: 다시 받지 않으므로 단정하지 않는다.
    await expect(verifier.verifyAccessToken(forged())).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    // 간격 뒤: 새로 받아 다시 판정한다.
    verifier.clock += 31_000;
    await expect(verifier.verifyAccessToken(forged())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(verifier.jwksRequests).toBe(2);
  });

  it('does not fetch signing keys for a token from another issuer', async () => {
    const { verifier, privateKey } = setup();
    await expect(
      verifier.verifyAccessToken(
        signToken(privateKey, validPayload({ iss: 'https://evil.example/' })),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifier.jwksRequests).toBe(0);
  });

  it('answers 503, not 401, when the signing keys cannot be fetched', async () => {
    const { verifier, privateKey } = setup(() => {
      throw new TypeError('fetch failed');
    });
    await expect(
      verifier.verifyAccessToken(signToken(privateKey, validPayload())),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('rejects every token when Auth0 is not configured', async () => {
    const { privateKey } = setup();
    const verifier = new TestVerifier({ get: () => undefined }, () => ({
      keys: [],
    }));
    expect(verifier.getIssuer()).toBeNull();
    await expect(
      verifier.verifyAccessToken(signToken(privateKey, validPayload())),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  describe('token format (before any parsing or signature work)', () => {
    it('rejects non-canonical encodings of a valid signature', async () => {
      const { verifier, privateKey } = setup();
      const token = signToken(privateKey, validPayload());
      await expect(verifier.verifyAccessToken(token)).resolves.toBeTruthy();

      // Node의 base64url 해석은 알파벳 밖의 글자를 건너뛰고 남는 비트를 무시한다.
      // 아래는 모두 같은 서명 바이트로 읽히지만, 글자가 표준 형태가 아니다.
      const [header, payload, signature] = token.split('.') as [string, string, string];
      const lastChar = signature.slice(-1);
      const alphabet =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
      const sameBitsDifferentChar = alphabet[alphabet.indexOf(lastChar) ^ 1];
      const variants = [
        `${token}!`,
        `${token}!!!***`,
        `${token}=`,
        `${token}==`,
        `${token} `,
        `${token}\n`,
        `${header}.${payload}.${signature.slice(0, -1)}${sameBitsDifferentChar}`,
        `${header}.${payload}.${signature.replace(/-/g, '+').replace(/_/g, '/')}+`,
        `${token}.`,
        `${token}.extra`,
        ` ${token}`,
      ];
      for (const variant of variants) {
        await expect(verifier.verifyAccessToken(variant)).rejects.toBeInstanceOf(
          UnauthorizedException,
        );
      }
    });

    it('rejects an oversized token without fetching keys or decoding it', async () => {
      const { verifier, privateKey } = setup();
      const token = signToken(privateKey, validPayload());
      const padded = `${token}${'A'.repeat(MAX_ACCESS_TOKEN_LENGTH)}`;
      const huge = `${token}${'!'.repeat(1_000_000)}`;

      for (const candidate of [padded, huge]) {
        await expect(
          verifier.verifyAccessToken(candidate),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }
      expect(verifier.jwksRequests).toBe(0);
    });

    it('rejects empty and non-string input', async () => {
      const { verifier } = setup();
      for (const candidate of ['', '..', 'a.b', undefined, 42, {}]) {
        await expect(
          verifier.verifyAccessToken(candidate as never),
        ).rejects.toBeInstanceOf(UnauthorizedException);
      }
    });
  });

  it('rejects a token without an expiry, or with a non-numeric one', async () => {
    const { verifier, privateKey } = setup();
    for (const exp of [undefined, '9999999999', null, Number.NaN]) {
      await expect(
        verifier.verifyAccessToken(signToken(privateKey, validPayload({ exp }))),
      ).rejects.toThrow('만료된 토큰입니다');
    }
  });

  describe('signing keys', () => {
    it('picks up a rotated key and stops accepting the removed one after the next refresh', async () => {
      const oldKey = newKey('key-1');
      const nextKey = newKey('key-2');
      const { verifier } = setup(() => ({ keys: [oldKey.jwk] }));
      verifier.clock = 1_800_000_000_000;
      const sign = (key: typeof oldKey, kid: string) =>
        signToken(key.privateKey, validPayload({ exp: verifier.clock / 1000 + 900 }), {
          alg: 'RS256',
          typ: 'JWT',
          kid,
        });

      await verifier.verifyAccessToken(sign(oldKey, 'key-1'));

      // Auth0가 키를 바꿨다. 새 kid를 처음 보면(최소 간격이 지난 뒤) 목록을 다시 받는다.
      verifier.jwks = () => ({ keys: [nextKey.jwk] });
      verifier.clock += 31_000;
      await expect(
        verifier.verifyAccessToken(sign(nextKey, 'key-2')),
      ).resolves.toBeTruthy();
      expect(verifier.jwksRequests).toBe(2);
      // 목록에서 빠진 예전 키로 서명한 토큰은 더 받지 않는다. 방금 받은 목록이 있는
      // 간격 안에서는 단정하지 않고(503), 다음에 목록을 새로 받으면 401로 판정한다.
      await expect(
        verifier.verifyAccessToken(sign(oldKey, 'key-1')),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      verifier.clock += 31_000;
      await expect(
        verifier.verifyAccessToken(sign(oldKey, 'key-1')),
      ).rejects.toThrow('알 수 없는 서명 키');
    });

    it('keeps serving known keys while a refresh for an unknown key fails, and answers 503 for that key', async () => {
      const known = newKey('key-1');
      const rotated = newKey('key-2');
      const { verifier } = setup(() => ({ keys: [known.jwk] }));
      verifier.clock = 1_800_000_000_000;
      const payload = () => validPayload({ exp: verifier.clock / 1000 + 900 });
      await verifier.verifyAccessToken(signToken(known.privateKey, payload()));

      verifier.jwks = () => {
        throw new TypeError('fetch failed');
      };
      verifier.clock += 31_000;
      // 확인하지 못한 것이지 틀린 토큰이 아니다: 401이 아니라 503.
      await expect(
        verifier.verifyAccessToken(
          signToken(rotated.privateKey, payload(), { alg: 'RS256', kid: 'key-2' }),
        ),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      // 이미 가진(아직 유효한) 키의 토큰은 계속 통과한다.
      await expect(
        verifier.verifyAccessToken(signToken(known.privateKey, payload())),
      ).resolves.toBeTruthy();
    });

    it('stops trusting cached keys after the maximum age and answers 503 if they cannot be refreshed', async () => {
      const known = newKey('key-1');
      const { verifier } = setup(() => ({ keys: [known.jwk] }));
      verifier.clock = 1_800_000_000_000;
      const payload = () => validPayload({ exp: verifier.clock / 1000 + 900 });
      await verifier.verifyAccessToken(signToken(known.privateKey, payload()));
      expect(verifier.jwksRequests).toBe(1);

      // 6시간이 지나면 다시 받아야 쓴다.
      verifier.clock += 6 * 60 * 60_000 + 1;
      await verifier.verifyAccessToken(signToken(known.privateKey, payload()));
      expect(verifier.jwksRequests).toBe(2);

      // 다시 오래됐는데 이번에는 받지 못한다 → 오래된 키로 통과시키지 않는다.
      verifier.clock += 6 * 60 * 60_000 + 1;
      verifier.jwks = () => {
        throw new TypeError('fetch failed');
      };
      await expect(
        verifier.verifyAccessToken(signToken(known.privateKey, payload())),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);

      // Auth0가 돌아오면(최소 간격 뒤) 다시 통과한다.
      verifier.jwks = () => ({ keys: [known.jwk] });
      verifier.clock += 31_000;
      await expect(
        verifier.verifyAccessToken(signToken(known.privateKey, payload())),
      ).resolves.toBeTruthy();
    });
  });
});

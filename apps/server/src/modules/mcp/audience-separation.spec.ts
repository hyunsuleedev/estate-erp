import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Auth0TokenVerifier } from '../auth/auth0-token-verifier';
import { StaffAuthService } from '../auth/staff-auth.service';
import { McpAuthGuard } from './mcp-auth.guard';

/**
 * 실제 토큰 검증기를 두 guard에 그대로 물려서, 직원 REST 토큰과 MCP 토큰이 서로의
 * 입구에서 거절되는지 확인한다(서명한 JWT를 쓴다. 검증기는 흉내 내지 않는다).
 */
const DOMAIN = 'tenant.example.auth0.com';
const ISSUER = `https://${DOMAIN}/`;
const REST_AUDIENCE = 'https://api.example.test';
const MCP_RESOURCE = 'https://api.example.test/mcp';
const DESKTOP_CLIENT = 'desktop-client';
const MCP_CLIENT = 'tpc_external_ai_client';

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: 'key-1',
  alg: 'RS256',
  use: 'sig',
};

const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

function sign(payload: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT', kid: 'key-1' })}.${encode({
    iss: ISSUER,
    sub: 'auth0|u1',
    iat: now,
    exp: now + 900,
    ...payload,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(privateKey);
  return `${unsigned}.${signature.toString('base64url')}`;
}

class TestVerifier extends Auth0TokenVerifier {
  protected override async fetchJwks() {
    return { keys: [jwk] };
  }
}

function createGuards() {
  const config = {
    get: (key: string) =>
      (
        ({
          AUTH0_DOMAIN: DOMAIN,
          AUTH0_AUDIENCE: REST_AUDIENCE,
          AUTH0_STAFF_CLIENT_IDS: DESKTOP_CLIENT,
          MCP_RESOURCE_URL: MCP_RESOURCE,
        }) as Record<string, string>
      )[key],
  };
  const prisma = {
    user: {
      findUnique: jest.fn(async () => ({
        id: 'user-1',
        auth0Id: 'auth0|u1',
        officeId: 'office-1',
        role: 'agent',
        isActive: true,
        tokensValidAfter: null,
        office: { isActive: true },
      })),
    },
  };
  const verifier = new TestVerifier(config as never);
  const staffAuth = new StaffAuthService(
    config as never,
    prisma as never,
    verifier,
    {} as never,
  );
  const validateAndResolve = jest.fn().mockResolvedValue(null);
  return {
    rest: new JwtAuthGuard(staffAuth),
    mcp: new McpAuthGuard(
      config as never,
      verifier,
      staffAuth,
      { validateAndResolve } as never,
    ),
    prisma,
    validateAndResolve,
  };
}

function context(token: string) {
  const request: Record<string, unknown> = {
    headers: { authorization: `Bearer ${token}` },
    method: 'GET',
    route: { path: '/contacts' },
    url: '/contacts',
  };
  const response = { setHeader: jest.fn() };
  return {
    context: {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as unknown as ExecutionContext,
    request,
    response,
  };
}

const restToken = () =>
  sign({ aud: [REST_AUDIENCE, `${ISSUER}userinfo`], azp: DESKTOP_CLIENT });
const mcpToken = () =>
  sign({ aud: MCP_RESOURCE, azp: MCP_CLIENT, scope: 'mcp:tools offline_access' });

describe('audience separation between the staff REST API and /mcp (real verifier)', () => {
  it('each entrance accepts its own token', async () => {
    const { rest, mcp } = createGuards();

    const restRequest = context(restToken());
    await expect(rest.canActivate(restRequest.context)).resolves.toBe(true);
    expect(restRequest.request.user).toMatchObject({ userId: 'user-1' });

    const mcpRequest = context(mcpToken());
    await expect(mcp.canActivate(mcpRequest.context)).resolves.toBe(true);
    expect(mcpRequest.request.user).toMatchObject({ userId: 'user-1' });
  });

  it('the REST API refuses an MCP token', async () => {
    const { rest, prisma } = createGuards();
    const attempt = context(mcpToken());

    await expect(rest.canActivate(attempt.context)).rejects.toThrow(
      '이 서버용 토큰이 아닙니다',
    );
    expect(attempt.request.user).toBeUndefined();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('/mcp refuses the desktop app’s REST token and does not try it as an API key', async () => {
    const { mcp, prisma, validateAndResolve } = createGuards();
    const attempt = context(restToken());

    await expect(mcp.canActivate(attempt.context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(attempt.response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringContaining('error="invalid_token"'),
    );
    expect(attempt.request.user).toBeUndefined();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(validateAndResolve).not.toHaveBeenCalled();
  });

  it('the REST API refuses a REST-audience token minted for an external AI client', async () => {
    // 테넌트 설정이 잘못돼 외부 앱이 REST 대상 토큰을 받았더라도, 토큰을 받은 앱(azp)으로 거른다.
    const { rest, prisma } = createGuards();
    for (const token of [
      sign({ aud: [REST_AUDIENCE], azp: MCP_CLIENT }),
      sign({ aud: [REST_AUDIENCE, MCP_RESOURCE], azp: MCP_CLIENT, scope: 'mcp:tools' }),
      sign({ aud: [REST_AUDIENCE] }),
    ]) {
      await expect(rest.canActivate(context(token).context)).rejects.toThrow(
        '이 앱에서는 사용할 수 없는 토큰입니다',
      );
    }
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('neither entrance accepts a token signed by someone else', async () => {
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const forge = (payload: Record<string, unknown>) => {
      const now = Math.floor(Date.now() / 1000);
      const unsigned = `${encode({ alg: 'RS256', typ: 'JWT', kid: 'key-1' })}.${encode({ iss: ISSUER, sub: 'auth0|u1', iat: now, exp: now + 900, ...payload })}`;
      return `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(other.privateKey).toString('base64url')}`;
    };
    const { rest, mcp } = createGuards();
    await expect(
      rest.canActivate(
        context(forge({ aud: [REST_AUDIENCE], azp: DESKTOP_CLIENT })).context,
      ),
    ).rejects.toThrow('토큰 서명이 올바르지 않습니다');
    await expect(
      mcp.canActivate(
        context(forge({ aud: MCP_RESOURCE, azp: MCP_CLIENT, scope: 'mcp:tools' }))
          .context,
      ),
    ).rejects.toThrow('토큰 서명이 올바르지 않습니다');
  });
});

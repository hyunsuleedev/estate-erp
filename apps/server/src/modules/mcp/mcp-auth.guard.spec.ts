import {
  ExecutionContext,
  ForbiddenException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  getRequestContext,
  runWithRequestContext,
} from '../../common/request-context/request-context';
import { McpAuthGuard } from './mcp-auth.guard';

const MCP_RESOURCE = 'http://localhost:3000/mcp';
const METADATA_URL =
  'http://localhost:3000/.well-known/oauth-protected-resource/mcp';

function createContext(authorization?: string) {
  const request: Record<string, unknown> = {
    headers: authorization ? { authorization } : {},
  };
  const response = { setHeader: jest.fn() };
  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return { context, request, response };
}

function createGuard(
  options: {
    claims?: Record<string, unknown>;
    verifyError?: Error;
    staffUser?: Record<string, unknown>;
    resolveError?: Error;
    apiKeyUser?: Record<string, unknown> | null;
    resourceUrl?: string;
  } = {},
) {
  const verifyAccessToken = options.verifyError
    ? jest.fn().mockRejectedValue(options.verifyError)
    : jest.fn().mockResolvedValue(
        options.claims ?? {
          sub: 'auth0|abc',
          iat: 1_800_000_000,
          scope: 'mcp:tools offline_access',
        },
      );
  const resolveStaffUser = options.resolveError
    ? jest.fn().mockRejectedValue(options.resolveError)
    : jest.fn().mockResolvedValue(
        options.staffUser ?? {
          userId: 'user-1',
          auth0UserId: 'auth0|abc',
          officeId: 'office-1',
          role: 'agent',
        },
      );
  const authenticateBearerToken = jest.fn();
  const validateAndResolve = jest
    .fn()
    .mockResolvedValue(
      options.apiKeyUser === undefined
        ? { userId: 'user-9', officeId: 'office-9', role: 'owner' }
        : options.apiKeyUser,
    );
  const guard = new McpAuthGuard(
    {
      get: (key: string) =>
        key === 'MCP_RESOURCE_URL'
          ? (options.resourceUrl ?? MCP_RESOURCE)
          : undefined,
    } as never,
    { verifyAccessToken } as never,
    { resolveStaffUser, authenticateBearerToken } as never,
    { validateAndResolve } as never,
  );
  return {
    guard,
    verifyAccessToken,
    resolveStaffUser,
    authenticateBearerToken,
    validateAndResolve,
  };
}

/** guard는 요청 컨텍스트(AsyncLocalStorage) 안에서 돈다. */
function run<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    runWithRequestContext({ source: 'mcp', actor: 'mcp:claude' }, () => {
      fn().then(resolve, reject);
    });
  });
}

describe('McpAuthGuard', () => {
  it('challenges unauthenticated requests with the resource metadata and scope', async () => {
    const { guard, verifyAccessToken, validateAndResolve } = createGuard();
    const { context, response } = createContext();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      `Bearer resource_metadata="${METADATA_URL}", scope="mcp:tools"`,
    );
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(validateAndResolve).not.toHaveBeenCalled();
  });

  it('accepts an Auth0 token issued for the MCP resource and never provisions users', async () => {
    const { guard, verifyAccessToken, resolveStaffUser } = createGuard();
    const { context, request } = createContext('Bearer mcp-token');

    await run(async () => {
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(getRequestContext()).toMatchObject({
        userId: 'user-1',
        officeId: 'office-1',
        role: 'agent',
        actor: 'mcp:claude',
      });
    });

    // 대상(aud)은 직원 REST API가 아니라 MCP 주소로 확인한다.
    expect(verifyAccessToken).toHaveBeenCalledWith('mcp-token', {
      audience: MCP_RESOURCE,
    });
    // 클레임을 통째로 넘긴다: 발급 시각(iat)으로 비밀번호 재설정·비활성화 이전 토큰을 거른다.
    expect(resolveStaffUser).toHaveBeenCalledWith(
      expect.objectContaining({ sub: 'auth0|abc', iat: 1_800_000_000 }),
      { allowProvisioning: false },
    );
    expect(request.user).toMatchObject({ userId: 'user-1', officeId: 'office-1' });
  });

  it('refuses the desktop app’s REST token: wrong audience, and no fallback to the staff guard', async () => {
    const { guard, authenticateBearerToken, resolveStaffUser } = createGuard({
      verifyError: new UnauthorizedException('이 서버용 토큰이 아닙니다.'),
    });
    const { context, response } = createContext('Bearer desktop-rest-token');

    await expect(guard.canActivate(context)).rejects.toThrow(
      '이 서버용 토큰이 아닙니다',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      `Bearer error="invalid_token", resource_metadata="${METADATA_URL}", scope="mcp:tools"`,
    );
    expect(authenticateBearerToken).not.toHaveBeenCalled();
    expect(resolveStaffUser).not.toHaveBeenCalled();
  });

  it('refuses a deactivated user, a token from before a password reset, and an account that is not an ERP user', async () => {
    for (const message of [
      '비활성화된 계정입니다.',
      '로그인이 만료되었습니다. 다시 로그인해 주세요.',
      '이 계정은 에스테잇플로우 사용자와 연결되어 있지 않습니다.',
    ]) {
      const { guard } = createGuard({
        resolveError: new UnauthorizedException(message),
      });
      const { context, response, request } = createContext('Bearer mcp-token');

      await expect(guard.canActivate(context)).rejects.toThrow(message);
      expect(response.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        expect.stringContaining('error="invalid_token"'),
      );
      expect(request.user).toBeUndefined();
    }
  });

  it('answers 403 insufficient_scope when the token lacks the MCP scope', async () => {
    for (const scope of [undefined, 'offline_access', 'mcp:toolsx']) {
      const { guard } = createGuard({ claims: { sub: 'auth0|abc', scope } });
      const { context, response, request } = createContext('Bearer mcp-token');

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'WWW-Authenticate',
        `Bearer error="insufficient_scope", resource_metadata="${METADATA_URL}", scope="mcp:tools", error_description="The mcp:tools scope is required"`,
      );
      expect(request.user).toBeUndefined();
    }
  });

  it('keeps office-less owners out of MCP tools', async () => {
    const { guard } = createGuard({
      staffUser: { userId: 'user-1', auth0UserId: 'auth0|abc', officeId: '', role: 'owner' },
    });
    const { context, request } = createContext('Bearer mcp-token');
    await expect(guard.canActivate(context)).rejects.toThrow(
      '사무소 생성이 필요합니다',
    );
    expect(request.user).toBeUndefined();
  });

  it('passes a login-server outage through as 503 without an invalid_token challenge', async () => {
    const { guard } = createGuard({
      verifyError: new ServiceUnavailableException('로그인 서버에 연결하지 못했습니다.'),
    });
    const { context, response } = createContext('Bearer mcp-token');
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('keeps the API key path unchanged', async () => {
    const { guard, validateAndResolve, verifyAccessToken } = createGuard();
    const { context, request } = createContext('Bearer esk_abc123');

    await run(async () => {
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect(getRequestContext()).toMatchObject({
        userId: 'user-9',
        officeId: 'office-9',
        role: 'owner',
        actor: 'mcp:claude',
      });
    });
    expect(validateAndResolve).toHaveBeenCalledWith('esk_abc123');
    expect(verifyAccessToken).not.toHaveBeenCalled();
    expect(request.user).toEqual({
      userId: 'user-9',
      officeId: 'office-9',
      role: 'owner',
    });
  });

  it('rejects an unknown API key without trying it as an OAuth token', async () => {
    const { guard, verifyAccessToken } = createGuard({ apiKeyUser: null });
    const { context, response } = createContext('Bearer esk_wrong');

    await expect(guard.canActivate(context)).rejects.toThrow(
      '유효하지 않은 API 키입니다',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      expect.stringContaining('error="invalid_token"'),
    );
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('uses the configured resource URL for the audience and the metadata address', async () => {
    const { guard, verifyAccessToken } = createGuard({
      resourceUrl: 'https://api.estaitt.com/mcp/',
    });
    const { context } = createContext('Bearer mcp-token');
    await run(async () => {
      await guard.canActivate(context);
    });
    expect(verifyAccessToken).toHaveBeenCalledWith('mcp-token', {
      audience: 'https://api.estaitt.com/mcp',
    });

    const unauthenticated = createContext();
    await expect(
      guard.canActivate(unauthenticated.context),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(unauthenticated.response.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'Bearer resource_metadata="https://api.estaitt.com/.well-known/oauth-protected-resource/mcp", scope="mcp:tools"',
    );
  });
});

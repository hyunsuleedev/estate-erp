import { MCP_RESOURCE_URI } from '@estate-erp/shared';

// 직원 로그인은 Auth0다. AUTH0_DOMAIN은 테넌트 도메인, AUTH0_AUDIENCE는 이 서버의
// API 식별자다. CLERK_SECRET_KEY는 소비자 사이트 로그인에만 쓰이며, 없어도 서버는
// 뜬다(그 기능만 꺼진다).
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'AUTH0_DOMAIN',
  'AUTH0_AUDIENCE',
] as const;

/**
 * 운영(NODE_ENV=production)에서만 필수.
 * - AUTH0_MGMT_*: 없으면 직원 계정 관리와 신규 가입자 확인이 요청 시점에야 실패한다.
 * - AUTH0_STAFF_CLIENT_IDS: 생략 시 기본값은 시험 테넌트의 데스크톱 앱이라, 운영
 *   테넌트의 앱 ID를 명시해야 한다.
 */
const PRODUCTION_REQUIRED_ENV_VARS = [
  'AUTH0_MGMT_CLIENT_ID',
  'AUTH0_MGMT_CLIENT_SECRET',
  'AUTH0_STAFF_CLIENT_IDS',
] as const;

export function validateEnv(config: Record<string, unknown>) {
  const env = config as Record<string, string | undefined>;
  const missing = REQUIRED_ENV_VARS.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  // MCP 토큰과 직원 REST 토큰은 대상(aud)으로 구분한다. 두 값이 같으면 외부 AI가 받은
  // MCP 토큰이 REST API에서도 통한다.
  const normalize = (value: string | undefined) =>
    value?.trim().replace(/\/+$/, '');
  const mcpResource = normalize(env.MCP_RESOURCE_URL) || MCP_RESOURCE_URI;
  if (normalize(env.AUTH0_AUDIENCE) === mcpResource) {
    throw new Error(
      'AUTH0_AUDIENCE and MCP_RESOURCE_URL must be different: staff REST tokens and MCP tokens are told apart by audience',
    );
  }

  // 운영에서는 시험 테넌트 기본값이나 빠진 설정으로 뜨지 않는다.
  if (env.NODE_ENV === 'production') {
    const missingInProduction = PRODUCTION_REQUIRED_ENV_VARS.filter(
      (key) => !env[key]?.trim(),
    );
    if (missingInProduction.length > 0) {
      throw new Error(
        `Missing required environment variables for production: ${missingInProduction.join(', ')}`,
      );
    }
  }

  if (
    env.DATABASE_URL &&
    !env.DATABASE_URL.startsWith('postgresql://') &&
    !env.DATABASE_URL.startsWith('postgres://')
  ) {
    throw new Error('DATABASE_URL must be a PostgreSQL connection string');
  }

  if (env.PORT && Number.isNaN(Number(env.PORT))) {
    throw new Error('PORT must be a valid number');
  }

  if (
    env.REDIS_URL &&
    !env.REDIS_URL.startsWith('redis://') &&
    !env.REDIS_URL.startsWith('rediss://')
  ) {
    throw new Error('REDIS_URL must be a Redis connection string');
  }

  const registryProviders = ['manual', 'tilko', 'hyphen', 'codef', 'coocon'];
  if (
    env.REGISTRY_PROVIDER &&
    !registryProviders.includes(env.REGISTRY_PROVIDER.toLowerCase())
  ) {
    throw new Error(
      `REGISTRY_PROVIDER must be one of: ${registryProviders.join(', ')}`,
    );
  }

  return config;
}

const REQUIRED_ENV_VARS = ['DATABASE_URL', 'CLERK_SECRET_KEY'] as const;

export function validateEnv(config: Record<string, unknown>) {
  const env = config as Record<string, string | undefined>;
  const missing = REQUIRED_ENV_VARS.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
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

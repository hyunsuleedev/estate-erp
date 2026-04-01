const REQUIRED_ENV_VARS = ['DATABASE_URL', 'JWT_SECRET'] as const;

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

  return config;
}

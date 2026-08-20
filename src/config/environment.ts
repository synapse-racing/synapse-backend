const environments = ['development', 'test', 'production'] as const;

function requireUrl(config: Record<string, unknown>, key: string): string {
  const value = config[key];

  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${key} is required`);
  }

  try {
    new URL(value);
  } catch {
    throw new Error(`${key} must be a valid URL`);
  }

  return value;
}

function requireSecret(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value !== 'string' || value.length < 32) {
    throw new Error(`${key} must contain at least 32 characters`);
  }

  return value;
}

function parsePositiveInteger(
  config: Record<string, unknown>,
  key: string,
  defaultValue: number,
): number {
  const value = Number(config[key] ?? defaultValue);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer`);
  }

  return value;
}

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const nodeEnvironment = config.NODE_ENV ?? 'development';
  if (
    typeof nodeEnvironment !== 'string' ||
    !environments.includes(nodeEnvironment as (typeof environments)[number])
  ) {
    throw new Error(`NODE_ENV must be one of: ${environments.join(', ')}`);
  }

  const port = Number(config.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }

  const frontendUrl = requireUrl(config, 'FRONTEND_URL');
  const databaseUrl = requireUrl(config, 'DATABASE_URL');
  if (!databaseUrl.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must use the postgresql protocol');
  }

  const accessSecret = requireSecret(config, 'JWT_ACCESS_SECRET');
  const refreshSecret = requireSecret(config, 'JWT_REFRESH_SECRET');
  if (accessSecret === refreshSecret) {
    throw new Error('JWT access and refresh secrets must be different');
  }

  return {
    ...config,
    NODE_ENV: nodeEnvironment,
    PORT: port,
    FRONTEND_URL: frontendUrl,
    DATABASE_URL: databaseUrl,
    JWT_ACCESS_SECRET: accessSecret,
    JWT_REFRESH_SECRET: refreshSecret,
    JWT_ACCESS_TTL_SECONDS: parsePositiveInteger(
      config,
      'JWT_ACCESS_TTL_SECONDS',
      900,
    ),
    JWT_REFRESH_TTL_DAYS: parsePositiveInteger(
      config,
      'JWT_REFRESH_TTL_DAYS',
      30,
    ),
  };
}

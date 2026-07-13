/**
 * Validates required environment variables at startup.
 * Called by ConfigModule.forRoot({ validate }) in app.module.ts.
 * Throws on the first missing or invalid variable so the process
 * exits immediately with a clear message rather than failing later.
 */

type Env = Record<string, string | undefined>;

function required(env: Env, key: string): string {
  const value = env[key];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value.trim();
}

function optionalString(env: Env, key: string, fallback: string): string {
  const value = env[key];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

function optionalInt(env: Env, key: string, fallback: number): number {
  const raw = env[key];
  if (!raw || raw.trim() === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed)) {
    throw new Error(
      `Environment variable ${key} must be an integer, got: "${raw}"`,
    );
  }
  return parsed;
}

function optionalBool(env: Env, key: string, fallback: boolean): boolean {
  const raw = env[key];
  if (!raw || raw.trim() === '') return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new Error(
    `Environment variable ${key} must be "true" or "false", got: "${raw}"`,
  );
}

function optionalEnum<T extends string>(
  env: Env,
  key: string,
  allowed: T[],
  fallback: T,
): T {
  const raw = env[key];
  if (!raw || raw.trim() === '') return fallback;
  if (!(allowed as string[]).includes(raw)) {
    throw new Error(
      `Environment variable ${key} must be one of [${allowed.join(', ')}], got: "${raw}"`,
    );
  }
  return raw as T;
}

export function validateEnv(env: Env) {
  // ── Database ────────────────────────────────────────────────────────────
  const DB_HOST = optionalString(env, 'DB_HOST', 'localhost');
  const DB_PORT = optionalInt(env, 'DB_PORT', 5432);
  const DB_USERNAME = optionalString(env, 'DB_USERNAME', 'postgres');
  const DB_PASSWORD = optionalString(env, 'DB_PASSWORD', '');
  const DB_NAME = required(env, 'DB_NAME');

  // ── JWT secrets ─────────────────────────────────────────────────────────
  const JWT_ACCESS_SECRET = required(env, 'JWT_ACCESS_SECRET');
  const JWT_REFRESH_SECRET = required(env, 'JWT_REFRESH_SECRET');
  const JWT_RESET_SECRET = required(env, 'JWT_RESET_SECRET');

  // ── JWT options ─────────────────────────────────────────────────────────
  const JWT_ACCESS_EXPIRATION = optionalString(
    env,
    'JWT_ACCESS_EXPIRATION',
    '15m',
  );
  const JWT_REFRESH_EXPIRATION = optionalString(
    env,
    'JWT_REFRESH_EXPIRATION',
    '7d',
  );
  const JWT_ISSUER = optionalString(env, 'JWT_ISSUER', 'hrms');
  const JWT_AUDIENCE = optionalString(env, 'JWT_AUDIENCE', 'hrms-client');

  // ── App ─────────────────────────────────────────────────────────────────
  const PORT = optionalInt(env, 'PORT', 3000);
  const NODE_ENV = optionalEnum(
    env,
    'NODE_ENV',
    ['development', 'production', 'test'],
    'production',
  );
  const APP_URL = optionalString(env, 'APP_URL', `http://localhost:${PORT}`);
  const APP_FRONTEND_URL = optionalString(env, 'APP_FRONTEND_URL', APP_URL);
  const APP_NAME = optionalString(env, 'APP_NAME', 'HRMS');
  const SUPPORT_EMAIL = optionalString(env, 'SUPPORT_EMAIL', '');

  // ── Mail ────────────────────────────────────────────────────────────────
  const MAIL_HOST = required(env, 'MAIL_HOST');
  const MAIL_PORT = optionalInt(env, 'MAIL_PORT', 587);
  const MAIL_USER = required(env, 'MAIL_USER');
  const MAIL_PASS = required(env, 'MAIL_PASS');
  const MAIL_FROM = optionalString(env, 'MAIL_FROM', MAIL_USER);
  const MAIL_SECURE = optionalBool(env, 'MAIL_SECURE', false);

  // ── Redis ───────────────────────────────────────────────────────────────
  const USE_REDIS = optionalBool(env, 'USE_REDIS', false);
  const REDIS_URL = optionalString(env, 'REDIS_URL', 'redis://127.0.0.1:6379');

  // ── Throttler ───────────────────────────────────────────────────────────
  const THROTTLER_TTL = optionalInt(env, 'THROTTLER_TTL', 60000);
  const THROTTLER_LIMIT = optionalInt(env, 'THROTTLER_LIMIT', 100);

  // ── Feature flags ───────────────────────────────────────────────────────
  const ENABLE_EMAIL_VERIFICATION = optionalBool(
    env,
    'ENABLE_EMAIL_VERIFICATION',
    true,
  );
  const EMAIL_VERIFICATION_EXPIRY_HOURS = optionalInt(
    env,
    'EMAIL_VERIFICATION_EXPIRY_HOURS',
    24,
  );

  return {
    DB_HOST,
    DB_PORT,
    DB_USERNAME,
    DB_PASSWORD,
    DB_NAME,
    JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET,
    JWT_RESET_SECRET,
    JWT_ACCESS_EXPIRATION,
    JWT_REFRESH_EXPIRATION,
    JWT_ISSUER,
    JWT_AUDIENCE,
    PORT,
    NODE_ENV,
    APP_URL,
    APP_FRONTEND_URL,
    APP_NAME,
    SUPPORT_EMAIL,
    MAIL_HOST,
    MAIL_PORT,
    MAIL_USER,
    MAIL_PASS,
    MAIL_FROM,
    MAIL_SECURE,
    USE_REDIS,
    REDIS_URL,
    THROTTLER_TTL,
    THROTTLER_LIMIT,
    ENABLE_EMAIL_VERIFICATION,
    EMAIL_VERIFICATION_EXPIRY_HOURS,
  };
}

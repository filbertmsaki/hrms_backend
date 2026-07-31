/**
 * Validates required environment variables at startup.
 * Called by ConfigModule.forRoot({ validate }) in app.module.ts.
 * Throws on the first missing or invalid variable so the process
 * exits immediately with a clear message rather than failing later.
 */

import {
  normalizeConfiguredEnvironment,
  resolveMailRecipientSafetyConfig,
} from '../modules/mail/mail-recipient-safety.util';

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

export function validateEnv(env: Env) {
  const DB_HOST = optionalString(env, 'DB_HOST', 'localhost');
  const DB_PORT = optionalInt(env, 'DB_PORT', 5432);
  const DB_USERNAME = optionalString(env, 'DB_USERNAME', 'postgres');
  const DB_PASSWORD = optionalString(env, 'DB_PASSWORD', '');
  const DB_NAME = required(env, 'DB_NAME');

  const JWT_ACCESS_SECRET = required(env, 'JWT_ACCESS_SECRET');
  const JWT_REFRESH_SECRET = required(env, 'JWT_REFRESH_SECRET');
  const JWT_RESET_SECRET = required(env, 'JWT_RESET_SECRET');

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

  const PORT = optionalInt(env, 'PORT', 3000);
  const NODE_ENV = normalizeConfiguredEnvironment(
    env.NODE_ENV,
    'NODE_ENV',
    'production',
  );
  const APP_ENV = normalizeConfiguredEnvironment(
    env.APP_ENV,
    'APP_ENV',
    NODE_ENV,
  );
  const APP_URL = optionalString(env, 'APP_URL', `http://localhost:${PORT}`);
  const APP_FRONTEND_URL = optionalString(env, 'APP_FRONTEND_URL', APP_URL);
  const APP_NAME = optionalString(env, 'APP_NAME', 'HRMS');
  const SUPPORT_EMAIL = optionalString(env, 'SUPPORT_EMAIL', '');

  const MAIL_HOST = required(env, 'MAIL_HOST');
  const MAIL_PORT = optionalInt(env, 'MAIL_PORT', 587);
  const MAIL_USER = required(env, 'MAIL_USER');
  const MAIL_PASS = required(env, 'MAIL_PASS');
  const MAIL_FROM = optionalString(env, 'MAIL_FROM', MAIL_USER);
  const MAIL_SECURE = optionalBool(env, 'MAIL_SECURE', false);
  const MAIL_OVERRIDE_ENABLED = optionalBool(
    env,
    'MAIL_OVERRIDE_ENABLED',
    false,
  );
  const MAIL_TEST_TO = optionalString(env, 'MAIL_TEST_TO', '');
  const MAIL_TEST_CC = optionalString(env, 'MAIL_TEST_CC', '');
  const MAIL_TEST_BCC = optionalString(env, 'MAIL_TEST_BCC', '');
  const MAIL_OVERRIDE_ADD_ORIGINAL_RECIPIENTS_TO_BODY = optionalBool(
    env,
    'MAIL_OVERRIDE_ADD_ORIGINAL_RECIPIENTS_TO_BODY',
    true,
  );
  const MAIL_OVERRIDE_SUBJECT_PREFIX = optionalString(
    env,
    'MAIL_OVERRIDE_SUBJECT_PREFIX',
    '',
  );

  const mailSafetyConfig = resolveMailRecipientSafetyConfig({
    appEnv: APP_ENV,
    nodeEnv: NODE_ENV,
    appName: APP_NAME,
    overrideEnabled: MAIL_OVERRIDE_ENABLED,
    testTo: MAIL_TEST_TO,
    testCc: MAIL_TEST_CC,
    testBcc: MAIL_TEST_BCC,
    addOriginalRecipientsToBody: MAIL_OVERRIDE_ADD_ORIGINAL_RECIPIENTS_TO_BODY,
    subjectPrefix: MAIL_OVERRIDE_SUBJECT_PREFIX,
  });

  if (MAIL_OVERRIDE_ENABLED && mailSafetyConfig.testTo.length === 0) {
    throw new Error(
      'MAIL_TEST_TO must contain at least one valid email address when MAIL_OVERRIDE_ENABLED=true.',
    );
  }

  const invalidOverrideRecipients = [
    ...mailSafetyConfig.invalidTestTo,
    ...mailSafetyConfig.invalidTestCc,
    ...mailSafetyConfig.invalidTestBcc,
  ];

  if (invalidOverrideRecipients.length > 0) {
    throw new Error(
      `MAIL_TEST_TO, MAIL_TEST_CC, and MAIL_TEST_BCC must contain only valid email addresses when MAIL_OVERRIDE_ENABLED=true. Invalid values: ${invalidOverrideRecipients.join(', ')}`,
    );
  }

  const USE_REDIS = optionalBool(env, 'USE_REDIS', false);
  const REDIS_URL = optionalString(env, 'REDIS_URL', 'redis://127.0.0.1:6379');

  const THROTTLER_TTL = optionalInt(env, 'THROTTLER_TTL', 60000);
  const THROTTLER_LIMIT = optionalInt(env, 'THROTTLER_LIMIT', 100);

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
  const EMPLOYEE_IMPORT_DEFAULT_PASSWORD = optionalString(
    env,
    'EMPLOYEE_IMPORT_DEFAULT_PASSWORD',
    '',
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
    APP_ENV,
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
    MAIL_OVERRIDE_ENABLED,
    MAIL_TEST_TO,
    MAIL_TEST_CC,
    MAIL_TEST_BCC,
    MAIL_OVERRIDE_ADD_ORIGINAL_RECIPIENTS_TO_BODY,
    MAIL_OVERRIDE_SUBJECT_PREFIX,
    USE_REDIS,
    REDIS_URL,
    THROTTLER_TTL,
    THROTTLER_LIMIT,
    ENABLE_EMAIL_VERIFICATION,
    EMAIL_VERIFICATION_EXPIRY_HOURS,
    EMPLOYEE_IMPORT_DEFAULT_PASSWORD,
  };
}

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

function optionalCsv(env: Env, key: string): string[] {
  const raw = env[key];

  if (!raw || raw.trim() === '') {
    return [];
  }

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function validateUrl(value: string, key: string): string {
  try {
    const parsed = new URL(value);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Unsupported protocol');
    }

    return value.replace(/\/+$/, '');
  } catch {
    throw new Error(
      `Environment variable ${key} must be a valid HTTP or HTTPS URL.`,
    );
  }
}

function validateOrigin(value: string): string {
  const parsed = validateUrl(value, 'APP_ALLOWED_ORIGINS');
  const url = new URL(parsed);

  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error(
      `APP_ALLOWED_ORIGINS must contain origins only, without paths: ${value}`,
    );
  }

  return url.origin;
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
  const JWT_ISSUER = optionalString(env, 'JWT_ISSUER', 'alliance-hrms');
  const JWT_AUDIENCE = optionalString(env, 'JWT_AUDIENCE', 'alliance-hrms-web');

  const NODE_ENV = normalizeConfiguredEnvironment(
    env.NODE_ENV,
    'NODE_ENV',
    'development',
  );
  const APP_ENV = normalizeConfiguredEnvironment(
    env.APP_ENV,
    'APP_ENV',
    NODE_ENV,
  );
  const APP_NAME = optionalString(env, 'APP_NAME', 'Alliance HRMS');
  const APP_HOST = optionalString(env, 'APP_HOST', '0.0.0.0');
  const APP_PORT = optionalInt(env, 'APP_PORT', optionalInt(env, 'PORT', 8888));
  const APP_GLOBAL_PREFIX = optionalString(
    env,
    'APP_GLOBAL_PREFIX',
    'api',
  ).replace(/^\/+|\/+$/g, '');
  const APP_TIMEZONE = optionalString(
    env,
    'APP_TIMEZONE',
    optionalString(
      env,
      'DEFAULT_TIMEZONE',
      optionalString(env, 'TZ', 'Africa/Dar_es_Salaam'),
    ),
  );
  const APP_URL = validateUrl(
    optionalString(env, 'APP_URL', `http://localhost:${APP_PORT}`),
    'APP_URL',
  );
  const APP_FRONTEND_URL = validateUrl(
    optionalString(env, 'APP_FRONTEND_URL', APP_URL),
    'APP_FRONTEND_URL',
  );
  const APP_ALLOWED_ORIGINS = optionalCsv(env, 'APP_ALLOWED_ORIGINS').map(
    validateOrigin,
  );
  const APP_ENABLE_API_DOCS = optionalBool(
    env,
    'APP_ENABLE_API_DOCS',
    APP_ENV !== 'production',
  );
  const APP_TRUST_PROXY = optionalBool(
    env,
    'APP_TRUST_PROXY',
    APP_ENV === 'production',
  );
  const APP_PUBLIC_STORAGE_PATH = optionalString(
    env,
    'APP_PUBLIC_STORAGE_PATH',
    'uploads',
  );
  const APP_PRIVATE_STORAGE_PATH = optionalString(
    env,
    'APP_PRIVATE_STORAGE_PATH',
    'private-uploads',
  );
  const MAX_UPLOAD_FILE_SIZE_BYTES = optionalInt(
    env,
    'MAX_UPLOAD_FILE_SIZE_BYTES',
    10 * 1024 * 1024,
  );
  const SUPPORT_EMAIL = optionalString(env, 'SUPPORT_EMAIL', '');

  if (APP_ENV === 'production' && APP_ALLOWED_ORIGINS.length === 0) {
    throw new Error(
      'APP_ALLOWED_ORIGINS must contain at least one trusted origin in production.',
    );
  }

  if (MAX_UPLOAD_FILE_SIZE_BYTES < 1024) {
    throw new Error('MAX_UPLOAD_FILE_SIZE_BYTES must be at least 1024 bytes.');
  }

  if (APP_ENV === 'production') {
    if (APP_URL.includes('localhost')) {
      throw new Error('APP_URL cannot use localhost in production.');
    }

    if (APP_FRONTEND_URL.includes('localhost')) {
      throw new Error('APP_FRONTEND_URL cannot use localhost in production.');
    }

    if (JWT_ACCESS_SECRET.length < 48) {
      throw new Error(
        'JWT_ACCESS_SECRET must be at least 48 characters in production.',
      );
    }

    if (JWT_REFRESH_SECRET.length < 48) {
      throw new Error(
        'JWT_REFRESH_SECRET must be at least 48 characters in production.',
      );
    }

    if (JWT_ACCESS_SECRET === JWT_REFRESH_SECRET) {
      throw new Error(
        'Access and refresh token secrets must be different in production.',
      );
    }

    if (optionalBool(env, 'USE_REDIS', false) && !env.REDIS_URL?.trim()) {
      throw new Error(
        'REDIS_URL is required in production when USE_REDIS=true.',
      );
    }

    if (APP_ENABLE_API_DOCS) {
      throw new Error(
        'APP_ENABLE_API_DOCS must be false in production. API documentation must not be publicly exposed.',
      );
    }
  }

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

  const HEALTH_DISK_PATH = optionalString(env, 'HEALTH_DISK_PATH', '.');
  const HEALTH_DISK_MIN_FREE_BYTES = optionalInt(
    env,
    'HEALTH_DISK_MIN_FREE_BYTES',
    1024 * 1024 * 1024,
  );
  const HEALTH_EXPOSE_DETAILS = optionalBool(
    env,
    'HEALTH_EXPOSE_DETAILS',
    false,
  );

  const DB_SSL_ENABLED = optionalBool(env, 'DB_SSL_ENABLED', false);
  const DB_SSL_REJECT_UNAUTHORIZED = optionalBool(
    env,
    'DB_SSL_REJECT_UNAUTHORIZED',
    true,
  );
  const DB_POOL_MAX = optionalInt(env, 'DB_POOL_MAX', 15);
  const DB_POOL_MIN = optionalInt(env, 'DB_POOL_MIN', 2);
  const DB_CONNECTION_TIMEOUT_MS = optionalInt(
    env,
    'DB_CONNECTION_TIMEOUT_MS',
    10000,
  );
  const DB_IDLE_TIMEOUT_MS = optionalInt(env, 'DB_IDLE_TIMEOUT_MS', 30000);
  const DB_STATEMENT_TIMEOUT_MS = optionalInt(
    env,
    'DB_STATEMENT_TIMEOUT_MS',
    30000,
  );
  const DB_SLOW_QUERY_MS = optionalInt(env, 'DB_SLOW_QUERY_MS', 2000);

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

  if (APP_ENV === 'production' && EMPLOYEE_IMPORT_DEFAULT_PASSWORD) {
    throw new Error(
      'EMPLOYEE_IMPORT_DEFAULT_PASSWORD must be empty in production. ' +
        'Imported employees must be assigned strong, unique temporary passwords.',
    );
  }

  const AUTH_REQUIRED_2FA_ROLES = optionalString(
    env,
    'AUTH_REQUIRED_2FA_ROLES',
    'SUPER_ADMIN,PLATFORM_ADMINISTRATOR,COMPANY_ADMIN,HR_MANAGER,IT_ADMIN,AUDITOR',
  );
  const EMPLOYEE_IMPORT_MAX_FILE_SIZE_BYTES = optionalInt(
    env,
    'EMPLOYEE_IMPORT_MAX_FILE_SIZE_BYTES',
    10 * 1024 * 1024,
  );
  const EMPLOYEE_IMPORT_MAX_ROWS = optionalInt(
    env,
    'EMPLOYEE_IMPORT_MAX_ROWS',
    1000,
  );
  const EMPLOYEE_IMPORT_PREVIEW_TTL_MINUTES = optionalInt(
    env,
    'EMPLOYEE_IMPORT_PREVIEW_TTL_MINUTES',
    30,
  );
  const EMPLOYEE_IMPORT_RETENTION_DAYS = optionalInt(
    env,
    'EMPLOYEE_IMPORT_RETENTION_DAYS',
    90,
  );
  const EMPLOYEE_IMPORT_QUEUE_CONCURRENCY = optionalInt(
    env,
    'EMPLOYEE_IMPORT_QUEUE_CONCURRENCY',
    1,
  );
  const EMPLOYEE_IMPORT_MAX_ATTEMPTS = optionalInt(
    env,
    'EMPLOYEE_IMPORT_MAX_ATTEMPTS',
    3,
  );
  const EMPLOYEE_IMPORT_STALE_MINUTES = optionalInt(
    env,
    'EMPLOYEE_IMPORT_STALE_MINUTES',
    30,
  );
  const EMPLOYEE_IMPORT_CREATE_PENDING_USERS = optionalBool(
    env,
    'EMPLOYEE_IMPORT_CREATE_PENDING_USERS',
    true,
  );
  const HR_DOCUMENT_MAX_FILE_SIZE_BYTES = optionalInt(
    env,
    'HR_DOCUMENT_MAX_FILE_SIZE_BYTES',
    10 * 1024 * 1024,
  );
  const HR_DOCUMENT_RETENTION_DAYS = optionalInt(
    env,
    'HR_DOCUMENT_RETENTION_DAYS',
    365,
  );
  const HR_DOCUMENT_DELETE_GRACE_DAYS = optionalInt(
    env,
    'HR_DOCUMENT_DELETE_GRACE_DAYS',
    30,
  );
  const FILE_MALWARE_SCAN_MODE = optionalString(
    env,
    'FILE_MALWARE_SCAN_MODE',
    'optional',
  ).toLowerCase();

  if (!['disabled', 'optional', 'required'].includes(FILE_MALWARE_SCAN_MODE)) {
    throw new Error(
      'FILE_MALWARE_SCAN_MODE must be disabled, optional or required.',
    );
  }

  const FILE_MALWARE_SCAN_COMMAND = optionalString(
    env,
    'FILE_MALWARE_SCAN_COMMAND',
    'clamdscan',
  );
  const FILE_MALWARE_SCAN_TIMEOUT_MS = optionalInt(
    env,
    'FILE_MALWARE_SCAN_TIMEOUT_MS',
    30000,
  );
  const ONBOARDING_ACTIVATION_QUEUE_CONCURRENCY = optionalInt(
    env,
    'ONBOARDING_ACTIVATION_QUEUE_CONCURRENCY',
    1,
  );
  const ONBOARDING_ACTIVATION_MAX_ATTEMPTS = optionalInt(
    env,
    'ONBOARDING_ACTIVATION_MAX_ATTEMPTS',
    5,
  );
  const ONBOARDING_ACTIVATION_RETRY_DELAY_MS = optionalInt(
    env,
    'ONBOARDING_ACTIVATION_RETRY_DELAY_MS',
    60000,
  );
  const ONBOARDING_TASK_REMINDER_HOURS = optionalInt(
    env,
    'ONBOARDING_TASK_REMINDER_HOURS',
    24,
  );
  const ONBOARDING_APPROVAL_REMINDER_HOURS = optionalInt(
    env,
    'ONBOARDING_APPROVAL_REMINDER_HOURS',
    48,
  );
  const ONBOARDING_DOCUMENT_REMINDER_HOURS = optionalInt(
    env,
    'ONBOARDING_DOCUMENT_REMINDER_HOURS',
    48,
  );
  const ONBOARDING_ESCALATION_AFTER_REMINDERS = optionalInt(
    env,
    'ONBOARDING_ESCALATION_AFTER_REMINDERS',
    2,
  );
  const ONBOARDING_DEFAULT_DURATION_DAYS = optionalInt(
    env,
    'ONBOARDING_DEFAULT_DURATION_DAYS',
    14,
  );
  const ONBOARDING_ACKNOWLEDGEMENT_VERSION = optionalString(
    env,
    'ONBOARDING_ACKNOWLEDGEMENT_VERSION',
    '1.0',
  );
  const ONBOARDING_REQUIRED_EMPLOYEE_FIELDS = optionalCsv(
    env,
    'ONBOARDING_REQUIRED_EMPLOYEE_FIELDS',
  );
  const OFFBOARDING_DEFAULT_NOTICE_DAYS = optionalInt(
    env,
    'OFFBOARDING_DEFAULT_NOTICE_DAYS',
    30,
  );
  const OFFBOARDING_DEFAULT_DURATION_DAYS = optionalInt(
    env,
    'OFFBOARDING_DEFAULT_DURATION_DAYS',
    14,
  );
  const OFFBOARDING_ACCESS_TERMINATION_HOUR = optionalInt(
    env,
    'OFFBOARDING_ACCESS_TERMINATION_HOUR',
    18,
  );
  const OFFBOARDING_ACCESS_TERMINATION_MINUTE = optionalInt(
    env,
    'OFFBOARDING_ACCESS_TERMINATION_MINUTE',
    0,
  );
  const OFFBOARDING_ACCESS_TERMINATION_QUEUE_CONCURRENCY = optionalInt(
    env,
    'OFFBOARDING_ACCESS_TERMINATION_QUEUE_CONCURRENCY',
    1,
  );
  const OFFBOARDING_ACCESS_TERMINATION_MAX_ATTEMPTS = optionalInt(
    env,
    'OFFBOARDING_ACCESS_TERMINATION_MAX_ATTEMPTS',
    5,
  );
  const OFFBOARDING_ACCESS_TERMINATION_RETRY_DELAY_MS = optionalInt(
    env,
    'OFFBOARDING_ACCESS_TERMINATION_RETRY_DELAY_MS',
    60000,
  );
  const OFFBOARDING_TASK_REMINDER_HOURS = optionalInt(
    env,
    'OFFBOARDING_TASK_REMINDER_HOURS',
    24,
  );
  const OFFBOARDING_CLEARANCE_REMINDER_HOURS = optionalInt(
    env,
    'OFFBOARDING_CLEARANCE_REMINDER_HOURS',
    24,
  );
  const OFFBOARDING_APPROVAL_REMINDER_HOURS = optionalInt(
    env,
    'OFFBOARDING_APPROVAL_REMINDER_HOURS',
    24,
  );
  const OFFBOARDING_ESCALATION_AFTER_REMINDERS = optionalInt(
    env,
    'OFFBOARDING_ESCALATION_AFTER_REMINDERS',
    2,
  );
  const OFFBOARDING_DEVICE_REMOVAL_REQUIRED = optionalBool(
    env,
    'OFFBOARDING_DEVICE_REMOVAL_REQUIRED',
    true,
  );
  const OFFBOARDING_REQUIRE_EXIT_INTERVIEW = optionalBool(
    env,
    'OFFBOARDING_REQUIRE_EXIT_INTERVIEW',
    false,
  );
  const OFFBOARDING_REQUIRE_SERVICE_LETTER = optionalBool(
    env,
    'OFFBOARDING_REQUIRE_SERVICE_LETTER',
    true,
  );
  const OFFBOARDING_REQUIRE_RELIEVING_LETTER = optionalBool(
    env,
    'OFFBOARDING_REQUIRE_RELIEVING_LETTER',
    true,
  );
  const OFFBOARDING_FINALIZATION_LOOKBACK_DAYS = optionalInt(
    env,
    'OFFBOARDING_FINALIZATION_LOOKBACK_DAYS',
    30,
  );

  if (
    OFFBOARDING_ACCESS_TERMINATION_HOUR < 0 ||
    OFFBOARDING_ACCESS_TERMINATION_HOUR > 23
  ) {
    throw new Error(
      'OFFBOARDING_ACCESS_TERMINATION_HOUR must be between 0 and 23.',
    );
  }

  if (
    OFFBOARDING_ACCESS_TERMINATION_MINUTE < 0 ||
    OFFBOARDING_ACCESS_TERMINATION_MINUTE > 59
  ) {
    throw new Error(
      'OFFBOARDING_ACCESS_TERMINATION_MINUTE must be between 0 and 59.',
    );
  }
  const ATTENDANCE_RAW_EVENT_BATCH_SIZE = optionalInt(
    env,
    'ATTENDANCE_RAW_EVENT_BATCH_SIZE',
    500,
  );
  const ATTENDANCE_MOBILE_EVENT_BATCH_SIZE = optionalInt(
    env,
    'ATTENDANCE_MOBILE_EVENT_BATCH_SIZE',
    200,
  );
  const ATTENDANCE_DUPLICATE_PUNCH_SECONDS = optionalInt(
    env,
    'ATTENDANCE_DUPLICATE_PUNCH_SECONDS',
    60,
  );
  const ATTENDANCE_CALCULATION_VERSION = optionalInt(
    env,
    'ATTENDANCE_CALCULATION_VERSION',
    3,
  );
  const ATTENDANCE_CORRECTION_MAX_AGE_DAYS = optionalInt(
    env,
    'ATTENDANCE_CORRECTION_MAX_AGE_DAYS',
    30,
  );
  const ATTENDANCE_CORRECTION_FUTURE_DAYS = optionalInt(
    env,
    'ATTENDANCE_CORRECTION_FUTURE_DAYS',
    0,
  );
  const ATTENDANCE_CORRECTION_REQUIRES_MANAGER = optionalBool(
    env,
    'ATTENDANCE_CORRECTION_REQUIRES_MANAGER',
    true,
  );
  const ATTENDANCE_CORRECTION_REQUIRES_HR = optionalBool(
    env,
    'ATTENDANCE_CORRECTION_REQUIRES_HR',
    true,
  );
  const ATTENDANCE_MOBILE_MAX_CLOCK_SKEW_SECONDS = optionalInt(
    env,
    'ATTENDANCE_MOBILE_MAX_CLOCK_SKEW_SECONDS',
    300,
  );
  const ATTENDANCE_MOBILE_REQUIRE_DEVICE_IDENTIFIER = optionalBool(
    env,
    'ATTENDANCE_MOBILE_REQUIRE_DEVICE_IDENTIFIER',
    true,
  );
  const ATTENDANCE_MOBILE_CLIENT_REQUEST_TTL_DAYS = optionalInt(
    env,
    'ATTENDANCE_MOBILE_CLIENT_REQUEST_TTL_DAYS',
    90,
  );
  const HIKVISION_ATTENDANCE_SYNC_ATTEMPTS = optionalInt(
    env,
    'HIKVISION_ATTENDANCE_SYNC_ATTEMPTS',
    5,
  );
  const HIKVISION_ATTENDANCE_SYNC_RETRY_DELAY_MS = optionalInt(
    env,
    'HIKVISION_ATTENDANCE_SYNC_RETRY_DELAY_MS',
    60000,
  );
  const HIKVISION_DEVICE_OFFLINE_AFTER_FAILURES = optionalInt(
    env,
    'HIKVISION_DEVICE_OFFLINE_AFTER_FAILURES',
    3,
  );
  const HIKVISION_DEVICE_CLOCK_DRIFT_WARNING_SECONDS = optionalInt(
    env,
    'HIKVISION_DEVICE_CLOCK_DRIFT_WARNING_SECONDS',
    120,
  );
  const LEAVE_DEFAULT_WORKING_DAY_MINUTES = optionalInt(
    env,
    'LEAVE_DEFAULT_WORKING_DAY_MINUTES',
    480,
  );
  const LEAVE_REQUEST_MAX_FUTURE_DAYS = optionalInt(
    env,
    'LEAVE_REQUEST_MAX_FUTURE_DAYS',
    365,
  );
  const LEAVE_REQUEST_MAX_BACKDATE_DAYS = optionalInt(
    env,
    'LEAVE_REQUEST_MAX_BACKDATE_DAYS',
    0,
  );
  const LEAVE_CORRECTION_WINDOW_DAYS = optionalInt(
    env,
    'LEAVE_CORRECTION_WINDOW_DAYS',
    30,
  );
  const LEAVE_APPROVAL_REMINDER_HOURS = optionalInt(
    env,
    'LEAVE_APPROVAL_REMINDER_HOURS',
    24,
  );
  const LEAVE_APPROVAL_ESCALATION_AFTER_REMINDERS = optionalInt(
    env,
    'LEAVE_APPROVAL_ESCALATION_AFTER_REMINDERS',
    2,
  );
  const LEAVE_CANCELLATION_REMINDER_HOURS = optionalInt(
    env,
    'LEAVE_CANCELLATION_REMINDER_HOURS',
    24,
  );
  const LEAVE_RECONCILIATION_LOOKBACK_DAYS = optionalInt(
    env,
    'LEAVE_RECONCILIATION_LOOKBACK_DAYS',
    60,
  );
  const LEAVE_CALENDAR_MAX_RANGE_DAYS = optionalInt(
    env,
    'LEAVE_CALENDAR_MAX_RANGE_DAYS',
    366,
  );
  const LEAVE_TEAM_CAPACITY_WARNING_PERCENT = optionalInt(
    env,
    'LEAVE_TEAM_CAPACITY_WARNING_PERCENT',
    30,
  );
  const LEAVE_TEAM_CAPACITY_BLOCK_PERCENT = optionalInt(
    env,
    'LEAVE_TEAM_CAPACITY_BLOCK_PERCENT',
    50,
  );

  const PROBATION_DEFAULT_PERIOD_DAYS = optionalInt(
    env,
    'PROBATION_DEFAULT_PERIOD_DAYS',
    180,
  );
  const PROBATION_DEFAULT_EXTENSION_DAYS = optionalInt(
    env,
    'PROBATION_DEFAULT_EXTENSION_DAYS',
    90,
  );
  const PROBATION_MAX_EXTENSION_DAYS = optionalInt(
    env,
    'PROBATION_MAX_EXTENSION_DAYS',
    180,
  );
  const PROBATION_MAX_EXTENSIONS = optionalInt(
    env,
    'PROBATION_MAX_EXTENSIONS',
    2,
  );
  const PROBATION_SELF_ASSESSMENT_REQUIRED = optionalBool(
    env,
    'PROBATION_SELF_ASSESSMENT_REQUIRED',
    false,
  );
  const PROBATION_OBJECTIVES_REQUIRED = optionalBool(
    env,
    'PROBATION_OBJECTIVES_REQUIRED',
    true,
  );
  const PROBATION_MINIMUM_CONFIRMATION_SCORE = optionalInt(
    env,
    'PROBATION_MINIMUM_CONFIRMATION_SCORE',
    60,
  );
  const PROBATION_REMINDER_CRON = optionalString(
    env,
    'PROBATION_REMINDER_CRON',
    '0 0 7 * * *',
  );
  const PROBATION_RECONCILIATION_CRON = optionalString(
    env,
    'PROBATION_RECONCILIATION_CRON',
    '0 30 1 * * *',
  );
  const PROBATION_REMINDER_DAYS = optionalCsv(
    env,
    'PROBATION_REMINDER_DAYS',
  ).map(Number);
  const PROBATION_OVERDUE_REMINDER_INTERVAL_DAYS = optionalInt(
    env,
    'PROBATION_OVERDUE_REMINDER_INTERVAL_DAYS',
    3,
  );
  const PROBATION_REQUIRE_MANAGER_RECOMMENDATION = optionalBool(
    env,
    'PROBATION_REQUIRE_MANAGER_RECOMMENDATION',
    true,
  );
  const PROBATION_REQUIRE_HR_APPROVAL = optionalBool(
    env,
    'PROBATION_REQUIRE_HR_APPROVAL',
    true,
  );
  const PROBATION_REQUIRE_CONFIRMATION_LETTER = optionalBool(
    env,
    'PROBATION_REQUIRE_CONFIRMATION_LETTER',
    true,
  );
  const PROBATION_MAX_REVIEW_BACKDATE_DAYS = optionalInt(
    env,
    'PROBATION_MAX_REVIEW_BACKDATE_DAYS',
    30,
  );

  if (PROBATION_DEFAULT_PERIOD_DAYS <= 0) {
    throw new Error(
      'PROBATION_DEFAULT_PERIOD_DAYS must be greater than zero.',
    );
  }

  if (
    PROBATION_MINIMUM_CONFIRMATION_SCORE < 0 ||
    PROBATION_MINIMUM_CONFIRMATION_SCORE > 100
  ) {
    throw new Error(
      'PROBATION_MINIMUM_CONFIRMATION_SCORE must be between 0 and 100.',
    );
  }

  const resolvedProbationReminderDays =
    PROBATION_REMINDER_DAYS.length > 0
      ? PROBATION_REMINDER_DAYS
      : [30, 14, 7, 3, 1];

  if (resolvedProbationReminderDays.some((day) => Number.isNaN(day))) {
    throw new Error('PROBATION_REMINDER_DAYS must contain only integers.');
  }

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
    NODE_ENV,
    APP_ENV,
    APP_NAME,
    APP_HOST,
    APP_PORT,
    PORT: APP_PORT,
    APP_GLOBAL_PREFIX,
    APP_TIMEZONE,
    APP_URL,
    APP_FRONTEND_URL,
    APP_ALLOWED_ORIGINS,
    APP_ENABLE_API_DOCS,
    APP_TRUST_PROXY,
    APP_PUBLIC_STORAGE_PATH,
    APP_PRIVATE_STORAGE_PATH,
    MAX_UPLOAD_FILE_SIZE_BYTES,
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
    HEALTH_DISK_PATH,
    HEALTH_DISK_MIN_FREE_BYTES,
    HEALTH_EXPOSE_DETAILS,
    DB_SSL_ENABLED,
    DB_SSL_REJECT_UNAUTHORIZED,
    DB_POOL_MAX,
    DB_POOL_MIN,
    DB_CONNECTION_TIMEOUT_MS,
    DB_IDLE_TIMEOUT_MS,
    DB_STATEMENT_TIMEOUT_MS,
    DB_SLOW_QUERY_MS,
    THROTTLER_TTL,
    THROTTLER_LIMIT,
    ENABLE_EMAIL_VERIFICATION,
    EMAIL_VERIFICATION_EXPIRY_HOURS,
    EMPLOYEE_IMPORT_DEFAULT_PASSWORD,
    AUTH_REQUIRED_2FA_ROLES,
    EMPLOYEE_IMPORT_MAX_FILE_SIZE_BYTES,
    EMPLOYEE_IMPORT_MAX_ROWS,
    EMPLOYEE_IMPORT_PREVIEW_TTL_MINUTES,
    EMPLOYEE_IMPORT_RETENTION_DAYS,
    EMPLOYEE_IMPORT_QUEUE_CONCURRENCY,
    EMPLOYEE_IMPORT_MAX_ATTEMPTS,
    EMPLOYEE_IMPORT_STALE_MINUTES,
    EMPLOYEE_IMPORT_CREATE_PENDING_USERS,
    HR_DOCUMENT_MAX_FILE_SIZE_BYTES,
    HR_DOCUMENT_RETENTION_DAYS,
    HR_DOCUMENT_DELETE_GRACE_DAYS,
    FILE_MALWARE_SCAN_MODE,
    FILE_MALWARE_SCAN_COMMAND,
    FILE_MALWARE_SCAN_TIMEOUT_MS,
    ONBOARDING_ACTIVATION_QUEUE_CONCURRENCY,
    ONBOARDING_ACTIVATION_MAX_ATTEMPTS,
    ONBOARDING_ACTIVATION_RETRY_DELAY_MS,
    ONBOARDING_TASK_REMINDER_HOURS,
    ONBOARDING_APPROVAL_REMINDER_HOURS,
    ONBOARDING_DOCUMENT_REMINDER_HOURS,
    ONBOARDING_ESCALATION_AFTER_REMINDERS,
    ONBOARDING_DEFAULT_DURATION_DAYS,
    ONBOARDING_ACKNOWLEDGEMENT_VERSION,
    ONBOARDING_REQUIRED_EMPLOYEE_FIELDS,
    OFFBOARDING_DEFAULT_NOTICE_DAYS,
    OFFBOARDING_DEFAULT_DURATION_DAYS,
    OFFBOARDING_ACCESS_TERMINATION_HOUR,
    OFFBOARDING_ACCESS_TERMINATION_MINUTE,
    OFFBOARDING_ACCESS_TERMINATION_QUEUE_CONCURRENCY,
    OFFBOARDING_ACCESS_TERMINATION_MAX_ATTEMPTS,
    OFFBOARDING_ACCESS_TERMINATION_RETRY_DELAY_MS,
    OFFBOARDING_TASK_REMINDER_HOURS,
    OFFBOARDING_CLEARANCE_REMINDER_HOURS,
    OFFBOARDING_APPROVAL_REMINDER_HOURS,
    OFFBOARDING_ESCALATION_AFTER_REMINDERS,
    OFFBOARDING_DEVICE_REMOVAL_REQUIRED,
    OFFBOARDING_REQUIRE_EXIT_INTERVIEW,
    OFFBOARDING_REQUIRE_SERVICE_LETTER,
    OFFBOARDING_REQUIRE_RELIEVING_LETTER,
    OFFBOARDING_FINALIZATION_LOOKBACK_DAYS,
    ATTENDANCE_RAW_EVENT_BATCH_SIZE,
    ATTENDANCE_MOBILE_EVENT_BATCH_SIZE,
    ATTENDANCE_DUPLICATE_PUNCH_SECONDS,
    ATTENDANCE_CALCULATION_VERSION,
    ATTENDANCE_CORRECTION_MAX_AGE_DAYS,
    ATTENDANCE_CORRECTION_FUTURE_DAYS,
    ATTENDANCE_CORRECTION_REQUIRES_MANAGER,
    ATTENDANCE_CORRECTION_REQUIRES_HR,
    ATTENDANCE_MOBILE_MAX_CLOCK_SKEW_SECONDS,
    ATTENDANCE_MOBILE_REQUIRE_DEVICE_IDENTIFIER,
    ATTENDANCE_MOBILE_CLIENT_REQUEST_TTL_DAYS,
    HIKVISION_ATTENDANCE_SYNC_ATTEMPTS,
    HIKVISION_ATTENDANCE_SYNC_RETRY_DELAY_MS,
    HIKVISION_DEVICE_OFFLINE_AFTER_FAILURES,
    HIKVISION_DEVICE_CLOCK_DRIFT_WARNING_SECONDS,
    LEAVE_DEFAULT_WORKING_DAY_MINUTES,
    LEAVE_REQUEST_MAX_FUTURE_DAYS,
    LEAVE_REQUEST_MAX_BACKDATE_DAYS,
    LEAVE_CORRECTION_WINDOW_DAYS,
    LEAVE_APPROVAL_REMINDER_HOURS,
    LEAVE_APPROVAL_ESCALATION_AFTER_REMINDERS,
    LEAVE_CANCELLATION_REMINDER_HOURS,
    LEAVE_RECONCILIATION_LOOKBACK_DAYS,
    LEAVE_CALENDAR_MAX_RANGE_DAYS,
    LEAVE_TEAM_CAPACITY_WARNING_PERCENT,
    LEAVE_TEAM_CAPACITY_BLOCK_PERCENT,
    PROBATION_DEFAULT_PERIOD_DAYS,
    PROBATION_DEFAULT_EXTENSION_DAYS,
    PROBATION_MAX_EXTENSION_DAYS,
    PROBATION_MAX_EXTENSIONS,
    PROBATION_SELF_ASSESSMENT_REQUIRED,
    PROBATION_OBJECTIVES_REQUIRED,
    PROBATION_MINIMUM_CONFIRMATION_SCORE,
    PROBATION_REMINDER_CRON,
    PROBATION_RECONCILIATION_CRON,
    PROBATION_REMINDER_DAYS: resolvedProbationReminderDays,
    PROBATION_OVERDUE_REMINDER_INTERVAL_DAYS,
    PROBATION_REQUIRE_MANAGER_RECOMMENDATION,
    PROBATION_REQUIRE_HR_APPROVAL,
    PROBATION_REQUIRE_CONFIRMATION_LETTER,
    PROBATION_MAX_REVIEW_BACKDATE_DAYS,
  };
}

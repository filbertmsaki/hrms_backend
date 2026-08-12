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

function isLocalTestingUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname
      .toLowerCase()
      .replace(/^\[|\]$/g, '');

    if (
      hostname === 'localhost' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local')
    ) {
      return true;
    }

    const ipv4Match = hostname.match(
      /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
    );

    if (!ipv4Match) {
      return false;
    }

    const octets = ipv4Match.slice(1).map(Number);

    if (octets.some((octet) => octet < 0 || octet > 255)) {
      return false;
    }

    return (
      octets[0] === 10 ||
      octets[0] === 127 ||
      (octets[0] === 192 && octets[1] === 168) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    );
  } catch {
    return false;
  }
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
  const APP_PORT = optionalInt(env, 'APP_PORT', 8888);
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
  const DEBUG = optionalBool(env, 'DEBUG', false);
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
    if (APP_URL.includes('localhost') && !isLocalTestingUrl(APP_URL)) {
      throw new Error('APP_URL cannot use localhost in production.');
    }

    if (
      APP_FRONTEND_URL.includes('localhost') &&
      !isLocalTestingUrl(APP_FRONTEND_URL)
    ) {
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
  const SMS_GATEWAY_ENABLED = optionalBool(env, 'SMS_GATEWAY_ENABLED', false);
  const SMS_GATEWAY_URL = optionalString(env, 'SMS_GATEWAY_URL', '');
  const SMS_GATEWAY_USERNAME = optionalString(env, 'SMS_GATEWAY_USERNAME', '');
  const SMS_GATEWAY_PASSWORD = optionalString(env, 'SMS_GATEWAY_PASSWORD', '');
  const SMS_GATEWAY_SHORTCODE = optionalString(
    env,
    'SMS_GATEWAY_SHORTCODE',
    '',
  );
  const SMS_GATEWAY_CHANNEL = optionalString(env, 'SMS_GATEWAY_CHANNEL', '');
  const SMS_GATEWAY_TIMEOUT_MS = optionalInt(
    env,
    'SMS_GATEWAY_TIMEOUT_MS',
    10000,
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
    throw new Error('PROBATION_DEFAULT_PERIOD_DAYS must be greater than zero.');
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

  const PERFORMANCE_DEFAULT_TIMEZONE = optionalString(
    env,
    'PERFORMANCE_DEFAULT_TIMEZONE',
    'Africa/Dar_es_Salaam',
  );
  const PERFORMANCE_PERIOD_GENERATION_CRON = optionalString(
    env,
    'PERFORMANCE_PERIOD_GENERATION_CRON',
    '0 15 0 * * *',
  );
  const PERFORMANCE_DATA_SYNC_CRON = optionalString(
    env,
    'PERFORMANCE_DATA_SYNC_CRON',
    '0 */30 * * * *',
  );
  const PERFORMANCE_REMINDER_CRON = optionalString(
    env,
    'PERFORMANCE_REMINDER_CRON',
    '0 0 8 * * *',
  );
  const PERFORMANCE_RECONCILIATION_CRON = optionalString(
    env,
    'PERFORMANCE_RECONCILIATION_CRON',
    '0 30 2 * * *',
  );
  const PERFORMANCE_DEFAULT_SELF_REVIEW_DAYS = optionalInt(
    env,
    'PERFORMANCE_DEFAULT_SELF_REVIEW_DAYS',
    3,
  );
  const PERFORMANCE_DEFAULT_MANAGER_REVIEW_DAYS = optionalInt(
    env,
    'PERFORMANCE_DEFAULT_MANAGER_REVIEW_DAYS',
    5,
  );
  const PERFORMANCE_DEFAULT_HR_REVIEW_DAYS = optionalInt(
    env,
    'PERFORMANCE_DEFAULT_HR_REVIEW_DAYS',
    3,
  );
  const PERFORMANCE_DEFAULT_APPEAL_DAYS = optionalInt(
    env,
    'PERFORMANCE_DEFAULT_APPEAL_DAYS',
    5,
  );
  const PERFORMANCE_REQUIRE_SELF_REVIEW = optionalBool(
    env,
    'PERFORMANCE_REQUIRE_SELF_REVIEW',
    true,
  );
  const PERFORMANCE_REQUIRE_MANAGER_REVIEW = optionalBool(
    env,
    'PERFORMANCE_REQUIRE_MANAGER_REVIEW',
    true,
  );
  const PERFORMANCE_REQUIRE_HR_APPROVAL = optionalBool(
    env,
    'PERFORMANCE_REQUIRE_HR_APPROVAL',
    true,
  );
  const PERFORMANCE_REQUIRE_PUBLICATION = optionalBool(
    env,
    'PERFORMANCE_REQUIRE_PUBLICATION',
    true,
  );
  const PERFORMANCE_DEFAULT_SCORE_CAP = optionalInt(
    env,
    'PERFORMANCE_DEFAULT_SCORE_CAP',
    120,
  );
  const PERFORMANCE_MINIMUM_WEIGHT_TOTAL = optionalInt(
    env,
    'PERFORMANCE_MINIMUM_WEIGHT_TOTAL',
    100,
  );
  const PERFORMANCE_MAXIMUM_WEIGHT_TOTAL = optionalInt(
    env,
    'PERFORMANCE_MAXIMUM_WEIGHT_TOTAL',
    100,
  );
  const PERFORMANCE_ALLOW_MANAGER_SCORE_OVERRIDE = optionalBool(
    env,
    'PERFORMANCE_ALLOW_MANAGER_SCORE_OVERRIDE',
    true,
  );
  const PERFORMANCE_ALLOW_HR_SCORE_OVERRIDE = optionalBool(
    env,
    'PERFORMANCE_ALLOW_HR_SCORE_OVERRIDE',
    true,
  );
  const PERFORMANCE_REQUIRE_OVERRIDE_REASON = optionalBool(
    env,
    'PERFORMANCE_REQUIRE_OVERRIDE_REASON',
    true,
  );
  const PERFORMANCE_MAX_BACKDATE_DAYS = optionalInt(
    env,
    'PERFORMANCE_MAX_BACKDATE_DAYS',
    30,
  );
  const PERFORMANCE_ALLOW_REOPEN = optionalBool(
    env,
    'PERFORMANCE_ALLOW_REOPEN',
    false,
  );
  const PERFORMANCE_REOPEN_REQUIRE_2FA = optionalBool(
    env,
    'PERFORMANCE_REOPEN_REQUIRE_2FA',
    true,
  );
  const PERFORMANCE_PERIOD_MOVEMENT_POLICY = optionalString(
    env,
    'PERFORMANCE_PERIOD_MOVEMENT_POLICY',
    'FIX_AT_PERIOD_START',
  );
  const PERFORMANCE_PUBLISH_AFTER_PERIOD_DAYS = optionalInt(
    env,
    'PERFORMANCE_PUBLISH_AFTER_PERIOD_DAYS',
    10,
  );
  const PERFORMANCE_QUEUE_CONCURRENCY = optionalInt(
    env,
    'PERFORMANCE_QUEUE_CONCURRENCY',
    2,
  );
  const PERFORMANCE_MAX_JOB_ATTEMPTS = optionalInt(
    env,
    'PERFORMANCE_MAX_JOB_ATTEMPTS',
    5,
  );
  const PERFORMANCE_RETRY_DELAY_MS = optionalInt(
    env,
    'PERFORMANCE_RETRY_DELAY_MS',
    60000,
  );
  const PERFORMANCE_ACTIVITY_PROVIDER_ENABLED = optionalBool(
    env,
    'PERFORMANCE_ACTIVITY_PROVIDER_ENABLED',
    false,
  );
  const PERFORMANCE_FIELD_VISIT_PROVIDER_ENABLED = optionalBool(
    env,
    'PERFORMANCE_FIELD_VISIT_PROVIDER_ENABLED',
    false,
  );
  const PERFORMANCE_EXTERNAL_PROVIDER_ENABLED = optionalBool(
    env,
    'PERFORMANCE_EXTERNAL_PROVIDER_ENABLED',
    false,
  );
  const ACTIVITY_DEFAULT_CUTOFF_TIME = optionalString(
    env,
    'ACTIVITY_DEFAULT_CUTOFF_TIME',
    '20:00',
  );
  const ACTIVITY_DEFAULT_TIMEZONE = optionalString(
    env,
    'ACTIVITY_DEFAULT_TIMEZONE',
    'Africa/Dar_es_Salaam',
  );
  const ACTIVITY_ALLOW_NEXT_DAY_SUBMISSION = optionalBool(
    env,
    'ACTIVITY_ALLOW_NEXT_DAY_SUBMISSION',
    false,
  );
  const ACTIVITY_MAX_BACKDATE_DAYS = optionalInt(
    env,
    'ACTIVITY_MAX_BACKDATE_DAYS',
    3,
  );
  const ACTIVITY_REQUIRE_MANAGER_REVIEW = optionalBool(
    env,
    'ACTIVITY_REQUIRE_MANAGER_REVIEW',
    true,
  );
  const ACTIVITY_REQUIRE_DAILY_SUBMISSION = optionalBool(
    env,
    'ACTIVITY_REQUIRE_DAILY_SUBMISSION',
    true,
  );
  const ACTIVITY_REQUIRE_OUTCOME_FOR_COMPLETED = optionalBool(
    env,
    'ACTIVITY_REQUIRE_OUTCOME_FOR_COMPLETED',
    true,
  );
  const ACTIVITY_REQUIRE_EVIDENCE_FOR_CONFIGURED_CATEGORIES = optionalBool(
    env,
    'ACTIVITY_REQUIRE_EVIDENCE_FOR_CONFIGURED_CATEGORIES',
    true,
  );
  const ACTIVITY_REMINDER_CRON = optionalString(
    env,
    'ACTIVITY_REMINDER_CRON',
    '0 0 18 * * *',
  );
  const ACTIVITY_ESCALATION_CRON = optionalString(
    env,
    'ACTIVITY_ESCALATION_CRON',
    '0 30 21 * * *',
  );
  const ACTIVITY_SUMMARY_CRON = optionalString(
    env,
    'ACTIVITY_SUMMARY_CRON',
    '0 30 1 * * *',
  );
  const ACTIVITY_RECONCILIATION_CRON = optionalString(
    env,
    'ACTIVITY_RECONCILIATION_CRON',
    '0 0 2 * * *',
  );
  const ACTIVITY_REMINDER_MINUTES_BEFORE_CUTOFF = optionalString(
    env,
    'ACTIVITY_REMINDER_MINUTES_BEFORE_CUTOFF',
    '120,60,30',
  );
  const ACTIVITY_MANAGER_REVIEW_DUE_HOURS = optionalInt(
    env,
    'ACTIVITY_MANAGER_REVIEW_DUE_HOURS',
    24,
  );
  const ACTIVITY_DEPARTMENT_ESCALATION_HOURS = optionalInt(
    env,
    'ACTIVITY_DEPARTMENT_ESCALATION_HOURS',
    48,
  );
  const FIELD_VISIT_ENABLED = optionalBool(env, 'FIELD_VISIT_ENABLED', true);
  const FIELD_VISIT_REQUIRE_PLAN = optionalBool(
    env,
    'FIELD_VISIT_REQUIRE_PLAN',
    true,
  );
  const FIELD_VISIT_ALLOW_UNPLANNED = optionalBool(
    env,
    'FIELD_VISIT_ALLOW_UNPLANNED',
    true,
  );
  const FIELD_VISIT_REQUIRE_MANAGER_APPROVAL = optionalBool(
    env,
    'FIELD_VISIT_REQUIRE_MANAGER_APPROVAL',
    false,
  );
  const FIELD_VISIT_CHECKIN_EARLY_MINUTES = optionalInt(
    env,
    'FIELD_VISIT_CHECKIN_EARLY_MINUTES',
    60,
  );
  const FIELD_VISIT_CHECKIN_LATE_MINUTES = optionalInt(
    env,
    'FIELD_VISIT_CHECKIN_LATE_MINUTES',
    240,
  );
  const FIELD_VISIT_MIN_DURATION_MINUTES = optionalInt(
    env,
    'FIELD_VISIT_MIN_DURATION_MINUTES',
    5,
  );
  const FIELD_VISIT_MAX_OPEN_HOURS = optionalInt(
    env,
    'FIELD_VISIT_MAX_OPEN_HOURS',
    12,
  );
  const FIELD_VISIT_REQUIRE_GPS = optionalBool(
    env,
    'FIELD_VISIT_REQUIRE_GPS',
    true,
  );
  const FIELD_VISIT_MAX_GPS_ACCURACY_METERS = optionalInt(
    env,
    'FIELD_VISIT_MAX_GPS_ACCURACY_METERS',
    100,
  );
  const FIELD_VISIT_DEFAULT_RADIUS_METERS = optionalInt(
    env,
    'FIELD_VISIT_DEFAULT_RADIUS_METERS',
    250,
  );
  const FIELD_VISIT_REQUIRE_SELFIE = optionalBool(
    env,
    'FIELD_VISIT_REQUIRE_SELFIE',
    false,
  );
  const FIELD_VISIT_REQUIRE_DEVICE_BINDING = optionalBool(
    env,
    'FIELD_VISIT_REQUIRE_DEVICE_BINDING',
    true,
  );
  const FIELD_VISIT_REQUIRE_CHECKOUT_OUTCOME = optionalBool(
    env,
    'FIELD_VISIT_REQUIRE_CHECKOUT_OUTCOME',
    true,
  );
  const FIELD_VISIT_REVERSE_GEOCODING_ENABLED = optionalBool(
    env,
    'FIELD_VISIT_REVERSE_GEOCODING_ENABLED',
    false,
  );
  const FIELD_VISIT_REVERSE_GEOCODING_PROVIDER = optionalString(
    env,
    'FIELD_VISIT_REVERSE_GEOCODING_PROVIDER',
    '',
  );
  const FIELD_VISIT_REVERSE_GEOCODING_API_KEY = optionalString(
    env,
    'FIELD_VISIT_REVERSE_GEOCODING_API_KEY',
    '',
  );
  const FIELD_VISIT_OFFLINE_SYNC_MAX_DAYS = optionalInt(
    env,
    'FIELD_VISIT_OFFLINE_SYNC_MAX_DAYS',
    3,
  );
  const FIELD_VISIT_ALLOW_BACKDATED_CAPTURE = optionalBool(
    env,
    'FIELD_VISIT_ALLOW_BACKDATED_CAPTURE',
    false,
  );
  const FIELD_VISIT_REQUIRE_SAME_DEVICE_CHECKOUT = optionalBool(
    env,
    'FIELD_VISIT_REQUIRE_SAME_DEVICE_CHECKOUT',
    false,
  );
  const FIELD_LOCATION_RETENTION_DAYS = optionalInt(
    env,
    'FIELD_LOCATION_RETENTION_DAYS',
    730,
  );
  const FIELD_LOCATION_ANONYMIZE_AFTER_RETENTION = optionalBool(
    env,
    'FIELD_LOCATION_ANONYMIZE_AFTER_RETENTION',
    true,
  );
  const FIELD_LOCATION_REPORT_AUDIT_ENABLED = optionalBool(
    env,
    'FIELD_LOCATION_REPORT_AUDIT_ENABLED',
    true,
  );
  const FIELD_LOCATION_EXPORT_MAX_DAYS = optionalInt(
    env,
    'FIELD_LOCATION_EXPORT_MAX_DAYS',
    31,
  );
  const FIELD_EXPENSE_ENABLED = optionalBool(
    env,
    'FIELD_EXPENSE_ENABLED',
    true,
  );
  const FIELD_EXPENSE_REQUIRE_RECEIPT_ABOVE = optionalInt(
    env,
    'FIELD_EXPENSE_REQUIRE_RECEIPT_ABOVE',
    50000,
  );
  const FIELD_EXPENSE_DEFAULT_CURRENCY = optionalString(
    env,
    'FIELD_EXPENSE_DEFAULT_CURRENCY',
    'TZS',
  );
  const FIELD_EXPENSE_MAX_AMOUNT_PER_VISIT = optionalInt(
    env,
    'FIELD_EXPENSE_MAX_AMOUNT_PER_VISIT',
    500000,
  );
  const FIELD_EXPENSE_REIMBURSEMENT_INTEGRATION_ENABLED = optionalBool(
    env,
    'FIELD_EXPENSE_REIMBURSEMENT_INTEGRATION_ENABLED',
    false,
  );
  const FIELD_MOBILE_SYNC_BATCH_SIZE = optionalInt(
    env,
    'FIELD_MOBILE_SYNC_BATCH_SIZE',
    100,
  );
  const FIELD_MOBILE_SYNC_MAX_PAYLOAD_MB = optionalInt(
    env,
    'FIELD_MOBILE_SYNC_MAX_PAYLOAD_MB',
    10,
  );
  const FIELD_MOBILE_SYNC_REQUEST_EXPIRY_DAYS = optionalInt(
    env,
    'FIELD_MOBILE_SYNC_REQUEST_EXPIRY_DAYS',
    14,
  );
  const PAYROLL_DEFAULT_CURRENCY = optionalString(
    env,
    'PAYROLL_DEFAULT_CURRENCY',
    'TZS',
  );
  const PAYROLL_DEFAULT_TIMEZONE = optionalString(
    env,
    'PAYROLL_DEFAULT_TIMEZONE',
    'Africa/Dar_es_Salaam',
  );
  const PAYROLL_DEFAULT_CUTOFF_DAY = optionalInt(
    env,
    'PAYROLL_DEFAULT_CUTOFF_DAY',
    20,
  );
  const PAYROLL_DEFAULT_PAYMENT_DAY = optionalInt(
    env,
    'PAYROLL_DEFAULT_PAYMENT_DAY',
    28,
  );
  const PAYROLL_REQUIRE_HR_APPROVAL = optionalBool(
    env,
    'PAYROLL_REQUIRE_HR_APPROVAL',
    true,
  );
  const PAYROLL_REQUIRE_FINANCE_APPROVAL = optionalBool(
    env,
    'PAYROLL_REQUIRE_FINANCE_APPROVAL',
    true,
  );
  const PAYROLL_REQUIRE_MANAGEMENT_APPROVAL = optionalBool(
    env,
    'PAYROLL_REQUIRE_MANAGEMENT_APPROVAL',
    true,
  );
  const PAYROLL_REQUIRE_MAKER_CHECKER = optionalBool(
    env,
    'PAYROLL_REQUIRE_MAKER_CHECKER',
    true,
  );
  const PAYROLL_REQUIRE_2FA_FOR_APPROVAL = optionalBool(
    env,
    'PAYROLL_REQUIRE_2FA_FOR_APPROVAL',
    true,
  );
  const PAYROLL_ALLOW_NEGATIVE_NET_PAY = optionalBool(
    env,
    'PAYROLL_ALLOW_NEGATIVE_NET_PAY',
    false,
  );
  const PAYROLL_MINIMUM_NET_PAY = optionalInt(
    env,
    'PAYROLL_MINIMUM_NET_PAY',
    0,
  );
  const PAYROLL_MAX_MANUAL_ADJUSTMENT_PERCENT = optionalInt(
    env,
    'PAYROLL_MAX_MANUAL_ADJUSTMENT_PERCENT',
    20,
  );
  const PAYROLL_DEFAULT_PRORATION_METHOD = optionalString(
    env,
    'PAYROLL_DEFAULT_PRORATION_METHOD',
    'CALENDAR_DAYS',
  );
  const PAYROLL_DEFAULT_LWP_METHOD = optionalString(
    env,
    'PAYROLL_DEFAULT_LWP_METHOD',
    'CALENDAR_DAYS',
  );
  const PAYROLL_DEFAULT_OVERTIME_METHOD = optionalString(
    env,
    'PAYROLL_DEFAULT_OVERTIME_METHOD',
    'HOURLY_RATE',
  );
  const PAYROLL_ALLOW_BACKDATED_INPUT = optionalBool(
    env,
    'PAYROLL_ALLOW_BACKDATED_INPUT',
    false,
  );
  const PAYROLL_MAX_BACKDATE_DAYS = optionalInt(
    env,
    'PAYROLL_MAX_BACKDATE_DAYS',
    31,
  );
  const PAYROLL_PAYSLIP_PUBLICATION_ENABLED = optionalBool(
    env,
    'PAYROLL_PAYSLIP_PUBLICATION_ENABLED',
    true,
  );
  const PAYROLL_PAYSLIP_PASSWORD_PROTECTED = optionalBool(
    env,
    'PAYROLL_PAYSLIP_PASSWORD_PROTECTED',
    false,
  );
  const PAYROLL_PAYSLIP_RETENTION_YEARS = optionalInt(
    env,
    'PAYROLL_PAYSLIP_RETENTION_YEARS',
    10,
  );
  const PAYROLL_BANK_FILE_ENCRYPTION_ENABLED = optionalBool(
    env,
    'PAYROLL_BANK_FILE_ENCRYPTION_ENABLED',
    true,
  );
  const PAYROLL_BANK_FILE_RETENTION_DAYS = optionalInt(
    env,
    'PAYROLL_BANK_FILE_RETENTION_DAYS',
    90,
  );
  const PAYROLL_JOURNAL_RETENTION_YEARS = optionalInt(
    env,
    'PAYROLL_JOURNAL_RETENTION_YEARS',
    10,
  );
  const PAYROLL_RECONCILIATION_CRON = optionalString(
    env,
    'PAYROLL_RECONCILIATION_CRON',
    '0 30 2 * * *',
  );
  const PAYROLL_PERIOD_REMINDER_CRON = optionalString(
    env,
    'PAYROLL_PERIOD_REMINDER_CRON',
    '0 0 8 * * *',
  );
  const PAYROLL_DOCUMENT_CLEANUP_CRON = optionalString(
    env,
    'PAYROLL_DOCUMENT_CLEANUP_CRON',
    '0 30 3 * * *',
  );
  const PAYROLL_PARALLEL_RUN_REQUIRED = optionalBool(
    env,
    'PAYROLL_PARALLEL_RUN_REQUIRED',
    true,
  );
  const PAYROLL_PARALLEL_RUN_MONTHS = optionalInt(
    env,
    'PAYROLL_PARALLEL_RUN_MONTHS',
    3,
  );
  const PAYROLL_PARALLEL_VARIANCE_TOLERANCE = optionalString(
    env,
    'PAYROLL_PARALLEL_VARIANCE_TOLERANCE',
    '0.01',
  );
  const EMPLOYEE_FINANCE_ENABLED = optionalBool(
    env,
    'EMPLOYEE_FINANCE_ENABLED',
    true,
  );
  const EMPLOYEE_FINANCE_DEFAULT_CURRENCY = optionalString(
    env,
    'EMPLOYEE_FINANCE_DEFAULT_CURRENCY',
    PAYROLL_DEFAULT_CURRENCY,
  );
  const EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY = optionalInt(
    env,
    'EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY',
    PAYROLL_DEFAULT_PAYMENT_DAY,
  );
  const EMPLOYEE_FINANCE_MAX_INSTALLMENT_PERCENT_OF_NET_PAY = optionalInt(
    env,
    'EMPLOYEE_FINANCE_MAX_INSTALLMENT_PERCENT_OF_NET_PAY',
    35,
  );
  const EMPLOYEE_FINANCE_MAX_ACTIVE_APPLICATIONS = optionalInt(
    env,
    'EMPLOYEE_FINANCE_MAX_ACTIVE_APPLICATIONS',
    1,
  );
  const EMPLOYEE_FINANCE_REQUIRE_MANAGER_RECOMMENDATION = optionalBool(
    env,
    'EMPLOYEE_FINANCE_REQUIRE_MANAGER_RECOMMENDATION',
    true,
  );
  const EMPLOYEE_FINANCE_REQUIRE_HR_APPROVAL = optionalBool(
    env,
    'EMPLOYEE_FINANCE_REQUIRE_HR_APPROVAL',
    true,
  );
  const EMPLOYEE_FINANCE_REQUIRE_FINANCE_APPROVAL = optionalBool(
    env,
    'EMPLOYEE_FINANCE_REQUIRE_FINANCE_APPROVAL',
    true,
  );
  const EMPLOYEE_FINANCE_REQUIRE_MAKER_CHECKER = optionalBool(
    env,
    'EMPLOYEE_FINANCE_REQUIRE_MAKER_CHECKER',
    true,
  );
  const EMPLOYEE_FINANCE_SETTLEMENT_QUOTE_VALID_DAYS = optionalInt(
    env,
    'EMPLOYEE_FINANCE_SETTLEMENT_QUOTE_VALID_DAYS',
    7,
  );
  const EMPLOYEE_FINANCE_MAX_DEFERMENTS_PER_YEAR = optionalInt(
    env,
    'EMPLOYEE_FINANCE_MAX_DEFERMENTS_PER_YEAR',
    2,
  );
  const EMPLOYEE_FINANCE_RECONCILIATION_CRON = optionalString(
    env,
    'EMPLOYEE_FINANCE_RECONCILIATION_CRON',
    '0 30 2 * * *',
  );
  const ANALYTICS_ENABLED = optionalBool(env, 'ANALYTICS_ENABLED', true);
  const ANALYTICS_SCHEMA = optionalString(env, 'ANALYTICS_SCHEMA', 'analytics');
  const ANALYTICS_DATABASE_URL = optionalString(
    env,
    'ANALYTICS_DATABASE_URL',
    '',
  );
  const ANALYTICS_DATABASE_SSL = optionalBool(
    env,
    'ANALYTICS_DATABASE_SSL',
    false,
  );
  const ANALYTICS_DB_POOL_MIN = optionalInt(env, 'ANALYTICS_DB_POOL_MIN', 1);
  const ANALYTICS_DB_POOL_MAX = optionalInt(env, 'ANALYTICS_DB_POOL_MAX', 3);
  const ANALYTICS_DB_STATEMENT_TIMEOUT_MS = optionalInt(
    env,
    'ANALYTICS_DB_STATEMENT_TIMEOUT_MS',
    30000,
  );
  const ANALYTICS_DB_QUERY_TIMEOUT_MS = optionalInt(
    env,
    'ANALYTICS_DB_QUERY_TIMEOUT_MS',
    30000,
  );
  const ANALYTICS_INCREMENTAL_REFRESH_CRON = optionalString(
    env,
    'ANALYTICS_INCREMENTAL_REFRESH_CRON',
    '0 */15 * * * *',
  );
  const ANALYTICS_DAILY_SNAPSHOT_CRON = optionalString(
    env,
    'ANALYTICS_DAILY_SNAPSHOT_CRON',
    '0 15 1 * * *',
  );
  const ANALYTICS_MONTHLY_CLOSE_CRON = optionalString(
    env,
    'ANALYTICS_MONTHLY_CLOSE_CRON',
    '0 30 2 1 * *',
  );
  const ANALYTICS_RECONCILIATION_CRON = optionalString(
    env,
    'ANALYTICS_RECONCILIATION_CRON',
    '0 30 3 * * *',
  );
  const ANALYTICS_RETENTION_CRON = optionalString(
    env,
    'ANALYTICS_RETENTION_CRON',
    '0 0 4 * * 0',
  );
  const ANALYTICS_DASHBOARD_CACHE_ENABLED = optionalBool(
    env,
    'ANALYTICS_DASHBOARD_CACHE_ENABLED',
    true,
  );
  const ANALYTICS_DASHBOARD_CACHE_TTL_SECONDS = optionalInt(
    env,
    'ANALYTICS_DASHBOARD_CACHE_TTL_SECONDS',
    300,
  );
  const ANALYTICS_EXECUTIVE_CACHE_TTL_SECONDS = optionalInt(
    env,
    'ANALYTICS_EXECUTIVE_CACHE_TTL_SECONDS',
    900,
  );
  const ANALYTICS_DEFAULT_TIMEZONE = optionalString(
    env,
    'ANALYTICS_DEFAULT_TIMEZONE',
    'Africa/Dar_es_Salaam',
  );
  const ANALYTICS_DEFAULT_CURRENCY = optionalString(
    env,
    'ANALYTICS_DEFAULT_CURRENCY',
    'TZS',
  );
  const ANALYTICS_MAX_QUERY_DATE_RANGE_DAYS = optionalInt(
    env,
    'ANALYTICS_MAX_QUERY_DATE_RANGE_DAYS',
    1095,
  );
  const ANALYTICS_MAX_EXPORT_DATE_RANGE_DAYS = optionalInt(
    env,
    'ANALYTICS_MAX_EXPORT_DATE_RANGE_DAYS',
    3660,
  );
  const ANALYTICS_MAX_EXPORT_ROWS = optionalInt(
    env,
    'ANALYTICS_MAX_EXPORT_ROWS',
    250000,
  );
  const ANALYTICS_EXPORT_EXPIRY_HOURS = optionalInt(
    env,
    'ANALYTICS_EXPORT_EXPIRY_HOURS',
    24,
  );
  const ANALYTICS_SMALL_CELL_SUPPRESSION_ENABLED = optionalBool(
    env,
    'ANALYTICS_SMALL_CELL_SUPPRESSION_ENABLED',
    true,
  );
  const ANALYTICS_SMALL_CELL_MINIMUM_COUNT = optionalInt(
    env,
    'ANALYTICS_SMALL_CELL_MINIMUM_COUNT',
    5,
  );
  const ANALYTICS_ALLOW_CUSTOM_REPORTS = optionalBool(
    env,
    'ANALYTICS_ALLOW_CUSTOM_REPORTS',
    true,
  );
  const ANALYTICS_ALLOW_RAW_SQL = optionalBool(
    env,
    'ANALYTICS_ALLOW_RAW_SQL',
    false,
  );
  const ANALYTICS_ALLOW_PREDICTIVE_INDICATORS = optionalBool(
    env,
    'ANALYTICS_ALLOW_PREDICTIVE_INDICATORS',
    true,
  );
  const ANALYTICS_ALLOW_AUTOMATED_EMPLOYMENT_DECISIONS = optionalBool(
    env,
    'ANALYTICS_ALLOW_AUTOMATED_EMPLOYMENT_DECISIONS',
    false,
  );
  const ANALYTICS_DATA_FRESHNESS_WARNING_MINUTES = optionalInt(
    env,
    'ANALYTICS_DATA_FRESHNESS_WARNING_MINUTES',
    30,
  );
  const ANALYTICS_DATA_FRESHNESS_CRITICAL_MINUTES = optionalInt(
    env,
    'ANALYTICS_DATA_FRESHNESS_CRITICAL_MINUTES',
    120,
  );
  const ANALYTICS_SNAPSHOT_RETENTION_YEARS = optionalInt(
    env,
    'ANALYTICS_SNAPSHOT_RETENTION_YEARS',
    10,
  );
  const ANALYTICS_EXPORT_RETENTION_DAYS = optionalInt(
    env,
    'ANALYTICS_EXPORT_RETENTION_DAYS',
    30,
  );
  const ANALYTICS_ACCESS_LOG_RETENTION_YEARS = optionalInt(
    env,
    'ANALYTICS_ACCESS_LOG_RETENTION_YEARS',
    7,
  );

  if (
    PERFORMANCE_DEFAULT_SCORE_CAP < 100 ||
    PERFORMANCE_DEFAULT_SCORE_CAP > 500
  ) {
    throw new Error(
      'PERFORMANCE_DEFAULT_SCORE_CAP must be between 100 and 500.',
    );
  }

  if (
    PERFORMANCE_MINIMUM_WEIGHT_TOTAL < 0 ||
    PERFORMANCE_MAXIMUM_WEIGHT_TOTAL > 100 ||
    PERFORMANCE_MINIMUM_WEIGHT_TOTAL > PERFORMANCE_MAXIMUM_WEIGHT_TOTAL
  ) {
    throw new Error('Invalid performance KPI weight configuration.');
  }

  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(ACTIVITY_DEFAULT_CUTOFF_TIME)) {
    throw new Error('ACTIVITY_DEFAULT_CUTOFF_TIME must use HH:mm format.');
  }

  if (
    FIELD_VISIT_MAX_GPS_ACCURACY_METERS < 1 ||
    FIELD_VISIT_MAX_GPS_ACCURACY_METERS > 5000
  ) {
    throw new Error(
      'FIELD_VISIT_MAX_GPS_ACCURACY_METERS must be between 1 and 5000.',
    );
  }

  if (FIELD_LOCATION_RETENTION_DAYS < 30) {
    throw new Error('FIELD_LOCATION_RETENTION_DAYS cannot be less than 30.');
  }

  if (PAYROLL_DEFAULT_CUTOFF_DAY < 1 || PAYROLL_DEFAULT_CUTOFF_DAY > 31) {
    throw new Error('PAYROLL_DEFAULT_CUTOFF_DAY must be between 1 and 31.');
  }

  if (PAYROLL_DEFAULT_PAYMENT_DAY < 1 || PAYROLL_DEFAULT_PAYMENT_DAY > 31) {
    throw new Error('PAYROLL_DEFAULT_PAYMENT_DAY must be between 1 and 31.');
  }

  if (PAYROLL_REQUIRE_MAKER_CHECKER && !PAYROLL_REQUIRE_FINANCE_APPROVAL) {
    throw new Error(
      'Finance approval must be enabled when payroll maker-checker is enabled.',
    );
  }

  if (
    EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY < 1 ||
    EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY > 31
  ) {
    throw new Error(
      'EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY must be between 1 and 31.',
    );
  }

  if (
    EMPLOYEE_FINANCE_MAX_INSTALLMENT_PERCENT_OF_NET_PAY < 1 ||
    EMPLOYEE_FINANCE_MAX_INSTALLMENT_PERCENT_OF_NET_PAY > 100
  ) {
    throw new Error(
      'EMPLOYEE_FINANCE_MAX_INSTALLMENT_PERCENT_OF_NET_PAY must be between 1 and 100.',
    );
  }

  if (EMPLOYEE_FINANCE_MAX_ACTIVE_APPLICATIONS < 1) {
    throw new Error(
      'EMPLOYEE_FINANCE_MAX_ACTIVE_APPLICATIONS must be at least 1.',
    );
  }

  if (EMPLOYEE_FINANCE_SETTLEMENT_QUOTE_VALID_DAYS < 1) {
    throw new Error(
      'EMPLOYEE_FINANCE_SETTLEMENT_QUOTE_VALID_DAYS must be at least 1.',
    );
  }

  if (EMPLOYEE_FINANCE_MAX_DEFERMENTS_PER_YEAR < 0) {
    throw new Error(
      'EMPLOYEE_FINANCE_MAX_DEFERMENTS_PER_YEAR cannot be negative.',
    );
  }

  if (
    EMPLOYEE_FINANCE_REQUIRE_MAKER_CHECKER &&
    !EMPLOYEE_FINANCE_REQUIRE_FINANCE_APPROVAL
  ) {
    throw new Error(
      'Finance approval must be enabled when employee-finance maker-checker is enabled.',
    );
  }

  if (ANALYTICS_SCHEMA !== 'analytics') {
    throw new Error(
      'ANALYTICS_SCHEMA must remain "analytics" for the current deployment.',
    );
  }

  if (ANALYTICS_DB_POOL_MAX < 1 || ANALYTICS_DB_POOL_MAX > 20) {
    throw new Error('ANALYTICS_DB_POOL_MAX must be between 1 and 20.');
  }

  if (
    ANALYTICS_DB_POOL_MIN < 0 ||
    ANALYTICS_DB_POOL_MIN > ANALYTICS_DB_POOL_MAX
  ) {
    throw new Error(
      'ANALYTICS_DB_POOL_MIN cannot exceed ANALYTICS_DB_POOL_MAX.',
    );
  }

  if (ANALYTICS_SMALL_CELL_MINIMUM_COUNT < 2) {
    throw new Error('ANALYTICS_SMALL_CELL_MINIMUM_COUNT must be at least 2.');
  }

  if (ANALYTICS_ALLOW_RAW_SQL) {
    throw new Error('ANALYTICS_ALLOW_RAW_SQL must remain false.');
  }

  if (ANALYTICS_ALLOW_AUTOMATED_EMPLOYMENT_DECISIONS) {
    throw new Error(
      'ANALYTICS_ALLOW_AUTOMATED_EMPLOYMENT_DECISIONS must remain false.',
    );
  }

  if (
    ANALYTICS_MAX_QUERY_DATE_RANGE_DAYS < 1 ||
    ANALYTICS_MAX_EXPORT_DATE_RANGE_DAYS < 1
  ) {
    throw new Error('Analytics date range limits must be positive.');
  }

  if (ANALYTICS_MAX_EXPORT_ROWS < 1) {
    throw new Error('ANALYTICS_MAX_EXPORT_ROWS must be positive.');
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
    APP_GLOBAL_PREFIX,
    APP_TIMEZONE,
    APP_URL,
    APP_FRONTEND_URL,
    APP_ALLOWED_ORIGINS,
    APP_ENABLE_API_DOCS,
    APP_TRUST_PROXY,
    DEBUG,
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
    SMS_GATEWAY_ENABLED,
    SMS_GATEWAY_URL,
    SMS_GATEWAY_USERNAME,
    SMS_GATEWAY_PASSWORD,
    SMS_GATEWAY_SHORTCODE,
    SMS_GATEWAY_CHANNEL,
    SMS_GATEWAY_TIMEOUT_MS,
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
    PERFORMANCE_DEFAULT_TIMEZONE,
    PERFORMANCE_PERIOD_GENERATION_CRON,
    PERFORMANCE_DATA_SYNC_CRON,
    PERFORMANCE_REMINDER_CRON,
    PERFORMANCE_RECONCILIATION_CRON,
    PERFORMANCE_DEFAULT_SELF_REVIEW_DAYS,
    PERFORMANCE_DEFAULT_MANAGER_REVIEW_DAYS,
    PERFORMANCE_DEFAULT_HR_REVIEW_DAYS,
    PERFORMANCE_DEFAULT_APPEAL_DAYS,
    PERFORMANCE_REQUIRE_SELF_REVIEW,
    PERFORMANCE_REQUIRE_MANAGER_REVIEW,
    PERFORMANCE_REQUIRE_HR_APPROVAL,
    PERFORMANCE_REQUIRE_PUBLICATION,
    PERFORMANCE_DEFAULT_SCORE_CAP,
    PERFORMANCE_MINIMUM_WEIGHT_TOTAL,
    PERFORMANCE_MAXIMUM_WEIGHT_TOTAL,
    PERFORMANCE_ALLOW_MANAGER_SCORE_OVERRIDE,
    PERFORMANCE_ALLOW_HR_SCORE_OVERRIDE,
    PERFORMANCE_REQUIRE_OVERRIDE_REASON,
    PERFORMANCE_MAX_BACKDATE_DAYS,
    PERFORMANCE_ALLOW_REOPEN,
    PERFORMANCE_REOPEN_REQUIRE_2FA,
    PERFORMANCE_PERIOD_MOVEMENT_POLICY,
    PERFORMANCE_PUBLISH_AFTER_PERIOD_DAYS,
    PERFORMANCE_QUEUE_CONCURRENCY,
    PERFORMANCE_MAX_JOB_ATTEMPTS,
    PERFORMANCE_RETRY_DELAY_MS,
    PERFORMANCE_ACTIVITY_PROVIDER_ENABLED,
    PERFORMANCE_FIELD_VISIT_PROVIDER_ENABLED,
    PERFORMANCE_EXTERNAL_PROVIDER_ENABLED,
    ACTIVITY_DEFAULT_CUTOFF_TIME,
    ACTIVITY_DEFAULT_TIMEZONE,
    ACTIVITY_ALLOW_NEXT_DAY_SUBMISSION,
    ACTIVITY_MAX_BACKDATE_DAYS,
    ACTIVITY_REQUIRE_MANAGER_REVIEW,
    ACTIVITY_REQUIRE_DAILY_SUBMISSION,
    ACTIVITY_REQUIRE_OUTCOME_FOR_COMPLETED,
    ACTIVITY_REQUIRE_EVIDENCE_FOR_CONFIGURED_CATEGORIES,
    ACTIVITY_REMINDER_CRON,
    ACTIVITY_ESCALATION_CRON,
    ACTIVITY_SUMMARY_CRON,
    ACTIVITY_RECONCILIATION_CRON,
    ACTIVITY_REMINDER_MINUTES_BEFORE_CUTOFF,
    ACTIVITY_MANAGER_REVIEW_DUE_HOURS,
    ACTIVITY_DEPARTMENT_ESCALATION_HOURS,
    FIELD_VISIT_ENABLED,
    FIELD_VISIT_REQUIRE_PLAN,
    FIELD_VISIT_ALLOW_UNPLANNED,
    FIELD_VISIT_REQUIRE_MANAGER_APPROVAL,
    FIELD_VISIT_CHECKIN_EARLY_MINUTES,
    FIELD_VISIT_CHECKIN_LATE_MINUTES,
    FIELD_VISIT_MIN_DURATION_MINUTES,
    FIELD_VISIT_MAX_OPEN_HOURS,
    FIELD_VISIT_REQUIRE_GPS,
    FIELD_VISIT_MAX_GPS_ACCURACY_METERS,
    FIELD_VISIT_DEFAULT_RADIUS_METERS,
    FIELD_VISIT_REQUIRE_SELFIE,
    FIELD_VISIT_REQUIRE_DEVICE_BINDING,
    FIELD_VISIT_REQUIRE_CHECKOUT_OUTCOME,
    FIELD_VISIT_REVERSE_GEOCODING_ENABLED,
    FIELD_VISIT_REVERSE_GEOCODING_PROVIDER,
    FIELD_VISIT_REVERSE_GEOCODING_API_KEY,
    FIELD_VISIT_OFFLINE_SYNC_MAX_DAYS,
    FIELD_VISIT_ALLOW_BACKDATED_CAPTURE,
    FIELD_VISIT_REQUIRE_SAME_DEVICE_CHECKOUT,
    FIELD_LOCATION_RETENTION_DAYS,
    FIELD_LOCATION_ANONYMIZE_AFTER_RETENTION,
    FIELD_LOCATION_REPORT_AUDIT_ENABLED,
    FIELD_LOCATION_EXPORT_MAX_DAYS,
    FIELD_EXPENSE_ENABLED,
    FIELD_EXPENSE_REQUIRE_RECEIPT_ABOVE,
    FIELD_EXPENSE_DEFAULT_CURRENCY,
    FIELD_EXPENSE_MAX_AMOUNT_PER_VISIT,
    FIELD_EXPENSE_REIMBURSEMENT_INTEGRATION_ENABLED,
    FIELD_MOBILE_SYNC_BATCH_SIZE,
    FIELD_MOBILE_SYNC_MAX_PAYLOAD_MB,
    FIELD_MOBILE_SYNC_REQUEST_EXPIRY_DAYS,
    PAYROLL_DEFAULT_CURRENCY,
    PAYROLL_DEFAULT_TIMEZONE,
    PAYROLL_DEFAULT_CUTOFF_DAY,
    PAYROLL_DEFAULT_PAYMENT_DAY,
    PAYROLL_REQUIRE_HR_APPROVAL,
    PAYROLL_REQUIRE_FINANCE_APPROVAL,
    PAYROLL_REQUIRE_MANAGEMENT_APPROVAL,
    PAYROLL_REQUIRE_MAKER_CHECKER,
    PAYROLL_REQUIRE_2FA_FOR_APPROVAL,
    PAYROLL_ALLOW_NEGATIVE_NET_PAY,
    PAYROLL_MINIMUM_NET_PAY,
    PAYROLL_MAX_MANUAL_ADJUSTMENT_PERCENT,
    PAYROLL_DEFAULT_PRORATION_METHOD,
    PAYROLL_DEFAULT_LWP_METHOD,
    PAYROLL_DEFAULT_OVERTIME_METHOD,
    PAYROLL_ALLOW_BACKDATED_INPUT,
    PAYROLL_MAX_BACKDATE_DAYS,
    PAYROLL_PAYSLIP_PUBLICATION_ENABLED,
    PAYROLL_PAYSLIP_PASSWORD_PROTECTED,
    PAYROLL_PAYSLIP_RETENTION_YEARS,
    PAYROLL_BANK_FILE_ENCRYPTION_ENABLED,
    PAYROLL_BANK_FILE_RETENTION_DAYS,
    PAYROLL_JOURNAL_RETENTION_YEARS,
    PAYROLL_RECONCILIATION_CRON,
    PAYROLL_PERIOD_REMINDER_CRON,
    PAYROLL_DOCUMENT_CLEANUP_CRON,
    PAYROLL_PARALLEL_RUN_REQUIRED,
    PAYROLL_PARALLEL_RUN_MONTHS,
    PAYROLL_PARALLEL_VARIANCE_TOLERANCE,
    EMPLOYEE_FINANCE_ENABLED,
    EMPLOYEE_FINANCE_DEFAULT_CURRENCY,
    EMPLOYEE_FINANCE_DEFAULT_REPAYMENT_DAY,
    EMPLOYEE_FINANCE_MAX_INSTALLMENT_PERCENT_OF_NET_PAY,
    EMPLOYEE_FINANCE_MAX_ACTIVE_APPLICATIONS,
    EMPLOYEE_FINANCE_REQUIRE_MANAGER_RECOMMENDATION,
    EMPLOYEE_FINANCE_REQUIRE_HR_APPROVAL,
    EMPLOYEE_FINANCE_REQUIRE_FINANCE_APPROVAL,
    EMPLOYEE_FINANCE_REQUIRE_MAKER_CHECKER,
    EMPLOYEE_FINANCE_SETTLEMENT_QUOTE_VALID_DAYS,
    EMPLOYEE_FINANCE_MAX_DEFERMENTS_PER_YEAR,
    EMPLOYEE_FINANCE_RECONCILIATION_CRON,
    ANALYTICS_ENABLED,
    ANALYTICS_SCHEMA,
    ANALYTICS_DATABASE_URL,
    ANALYTICS_DATABASE_SSL,
    ANALYTICS_DB_POOL_MIN,
    ANALYTICS_DB_POOL_MAX,
    ANALYTICS_DB_STATEMENT_TIMEOUT_MS,
    ANALYTICS_DB_QUERY_TIMEOUT_MS,
    ANALYTICS_INCREMENTAL_REFRESH_CRON,
    ANALYTICS_DAILY_SNAPSHOT_CRON,
    ANALYTICS_MONTHLY_CLOSE_CRON,
    ANALYTICS_RECONCILIATION_CRON,
    ANALYTICS_RETENTION_CRON,
    ANALYTICS_DASHBOARD_CACHE_ENABLED,
    ANALYTICS_DASHBOARD_CACHE_TTL_SECONDS,
    ANALYTICS_EXECUTIVE_CACHE_TTL_SECONDS,
    ANALYTICS_DEFAULT_TIMEZONE,
    ANALYTICS_DEFAULT_CURRENCY,
    ANALYTICS_MAX_QUERY_DATE_RANGE_DAYS,
    ANALYTICS_MAX_EXPORT_DATE_RANGE_DAYS,
    ANALYTICS_MAX_EXPORT_ROWS,
    ANALYTICS_EXPORT_EXPIRY_HOURS,
    ANALYTICS_SMALL_CELL_SUPPRESSION_ENABLED,
    ANALYTICS_SMALL_CELL_MINIMUM_COUNT,
    ANALYTICS_ALLOW_CUSTOM_REPORTS,
    ANALYTICS_ALLOW_RAW_SQL,
    ANALYTICS_ALLOW_PREDICTIVE_INDICATORS,
    ANALYTICS_ALLOW_AUTOMATED_EMPLOYMENT_DECISIONS,
    ANALYTICS_DATA_FRESHNESS_WARNING_MINUTES,
    ANALYTICS_DATA_FRESHNESS_CRITICAL_MINUTES,
    ANALYTICS_SNAPSHOT_RETENTION_YEARS,
    ANALYTICS_EXPORT_RETENTION_DAYS,
    ANALYTICS_ACCESS_LOG_RETENTION_YEARS,
  };
}

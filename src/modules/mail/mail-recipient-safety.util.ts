import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ISendMailOptions } from '@nestjs-modules/mailer';
import addressParser from 'nodemailer/lib/addressparser';

type ParsedAddress = {
  address: string;
  name?: string;
};

type AddressParser = (
  input: string,
  options?: { flatten?: boolean },
) => ParsedAddress[];

const parseAddresses = addressParser as unknown as AddressParser;

export type NormalizedAppEnvironment =
  | 'local'
  | 'development'
  | 'uat'
  | 'production'
  | 'test'
  | 'unknown';

export type MailSafetyContext = {
  sourceModule?: string;
};

export type SafeSendMailOptions = ISendMailOptions & {
  mailSafetyContext?: MailSafetyContext;
};

export type MailRecipientSafetyConfig = {
  appEnv?: string | null;
  nodeEnv?: string | null;
  appName?: string | null;
  overrideEnabled: boolean;
  testTo?: string | null;
  testCc?: string | null;
  testBcc?: string | null;
  addOriginalRecipientsToBody?: boolean;
  subjectPrefix?: string | null;
};

export type ResolvedMailRecipientSafetyConfig = {
  environment: NormalizedAppEnvironment;
  rawEnvironment: string | null;
  appName: string;
  overrideEnabled: boolean;
  testTo: string[];
  testCc: string[];
  testBcc: string[];
  invalidTestTo: string[];
  invalidTestCc: string[];
  invalidTestBcc: string[];
  addOriginalRecipientsToBody: boolean;
  subjectPrefix: string | null;
};

export type MailRecipientSafetyResult = {
  environment: NormalizedAppEnvironment;
  recipientsOverridden: boolean;
  originalTo: ParsedAddress[];
  originalCc: ParsedAddress[];
  originalBcc: ParsedAddress[];
};

export class UnsafeEmailDeliveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsafeEmailDeliveryError';
  }
}

const EMAIL_SEPARATOR_REGEX = /[,\n;]+/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeAppEnvironment(
  value?: string | null,
): NormalizedAppEnvironment {
  const normalized = value?.trim().toLowerCase();

  switch (normalized) {
    case 'local':
      return 'local';
    case 'dev':
    case 'development':
      return 'development';
    case 'uat':
      return 'uat';
    case 'prod':
    case 'production':
    case 'live':
      return 'production';
    case 'test':
      return 'test';
    default:
      return 'unknown';
  }
}

export function normalizeConfiguredEnvironment(
  value: string | undefined,
  key: string,
  fallback: NormalizedAppEnvironment,
): NormalizedAppEnvironment {
  if (!value || value.trim() === '') {
    return fallback;
  }

  const normalized = normalizeAppEnvironment(value);
  if (normalized === 'unknown') {
    throw new Error(
      `Environment variable ${key} must be one of [local, dev, development, uat, prod, production, live, test], got: "${value}"`,
    );
  }

  return normalized;
}

export function resolveMailRecipientSafetyConfig(
  config: MailRecipientSafetyConfig,
): ResolvedMailRecipientSafetyConfig {
  const rawEnvironment =
    config.appEnv?.trim() || config.nodeEnv?.trim() || null;
  const environment = normalizeAppEnvironment(rawEnvironment);
  const parsedTestTo = parseConfiguredRecipients(config.testTo);
  const parsedTestCc = parseConfiguredRecipients(config.testCc);
  const parsedTestBcc = parseConfiguredRecipients(config.testBcc);

  return {
    environment,
    rawEnvironment,
    appName: config.appName?.trim() || 'Your App',
    overrideEnabled: config.overrideEnabled,
    testTo: parsedTestTo.valid,
    testCc: parsedTestCc.valid,
    testBcc: parsedTestBcc.valid,
    invalidTestTo: parsedTestTo.invalid,
    invalidTestCc: parsedTestCc.invalid,
    invalidTestBcc: parsedTestBcc.invalid,
    addOriginalRecipientsToBody: config.addOriginalRecipientsToBody !== false,
    subjectPrefix: config.subjectPrefix?.trim() || null,
  };
}

export function resolveMailRecipientSafetyConfigFromConfigService(
  configService: Pick<ConfigService, 'get'>,
): ResolvedMailRecipientSafetyConfig {
  return resolveMailRecipientSafetyConfig({
    appEnv: configService.get<string>('APP_ENV'),
    nodeEnv: configService.get<string>('NODE_ENV'),
    appName: configService.get<string>('APP_NAME'),
    overrideEnabled:
      configService.get<boolean>('MAIL_OVERRIDE_ENABLED') === true,
    testTo: configService.get<string>('MAIL_TEST_TO'),
    testCc: configService.get<string>('MAIL_TEST_CC'),
    testBcc: configService.get<string>('MAIL_TEST_BCC'),
    addOriginalRecipientsToBody:
      configService.get<boolean>(
        'MAIL_OVERRIDE_ADD_ORIGINAL_RECIPIENTS_TO_BODY',
      ) !== false,
    subjectPrefix: configService.get<string>('MAIL_OVERRIDE_SUBJECT_PREFIX'),
  });
}

export function resolveMailRecipientSafetyConfigFromEnv(
  env: NodeJS.ProcessEnv,
): ResolvedMailRecipientSafetyConfig {
  return resolveMailRecipientSafetyConfig({
    appEnv: env.APP_ENV,
    nodeEnv: env.NODE_ENV,
    appName: env.APP_NAME,
    overrideEnabled:
      env.MAIL_OVERRIDE_ENABLED === 'true' || env.MAIL_OVERRIDE_ENABLED === '1',
    testTo: env.MAIL_TEST_TO,
    testCc: env.MAIL_TEST_CC,
    testBcc: env.MAIL_TEST_BCC,
    addOriginalRecipientsToBody:
      env.MAIL_OVERRIDE_ADD_ORIGINAL_RECIPIENTS_TO_BODY === undefined
        ? true
        : env.MAIL_OVERRIDE_ADD_ORIGINAL_RECIPIENTS_TO_BODY === 'true' ||
          env.MAIL_OVERRIDE_ADD_ORIGINAL_RECIPIENTS_TO_BODY === '1',
    subjectPrefix: env.MAIL_OVERRIDE_SUBJECT_PREFIX,
  });
}

export function applyMailRecipientSafety(
  options: SafeSendMailOptions,
  config: ResolvedMailRecipientSafetyConfig,
  logger?: Pick<Logger, 'log' | 'warn'>,
): MailRecipientSafetyResult {
  const result = prepareMailRecipientSafety(options, config, logger);
  appendMailRecipientSafetyDebugFooter(options, result, config);
  return result;
}

export function prepareMailRecipientSafety(
  options: SafeSendMailOptions,
  config: ResolvedMailRecipientSafetyConfig,
  logger?: Pick<Logger, 'log' | 'warn'>,
): MailRecipientSafetyResult {
  const originalTo = normalizeRecipientInput(options.to);
  const originalCc = normalizeRecipientInput(options.cc);
  const originalBcc = normalizeRecipientInput(options.bcc);

  if (!config.overrideEnabled) {
    return {
      environment: config.environment,
      recipientsOverridden: false,
      originalTo,
      originalCc,
      originalBcc,
    };
  }

  const invalidConfiguredRecipients = [
    ...config.invalidTestTo,
    ...config.invalidTestCc,
    ...config.invalidTestBcc,
  ];

  if (invalidConfiguredRecipients.length > 0) {
    const message =
      `Email override is enabled, but one or more configured test recipients are invalid: ${invalidConfiguredRecipients.join(', ')}. ` +
      'The email was blocked to prevent delivery to the original recipients.';
    logger?.warn?.(message);
    throw new UnsafeEmailDeliveryError(message);
  }

  if (!config.testTo.length) {
    const message =
      'Email override is enabled, but MAIL_TEST_TO is not configured. The email was blocked to prevent delivery to the original recipients.';
    logger?.warn?.(message);
    throw new UnsafeEmailDeliveryError(message);
  }

  if (config.subjectPrefix && typeof options.subject === 'string') {
    const normalizedPrefix = config.subjectPrefix.trim();
    if (normalizedPrefix && !options.subject.startsWith(normalizedPrefix)) {
      options.subject = `${normalizedPrefix} ${options.subject}`.trim();
    }
  }

  options.to = [...config.testTo];
  options.cc = config.testCc.length ? [...config.testCc] : undefined;
  options.bcc = config.testBcc.length ? [...config.testBcc] : undefined;

  logger?.log?.(
    `Email recipient override applied. Environment: ${config.rawEnvironment ?? config.environment}. Application: ${config.appName}. Source: ${resolveSourceModule(options)}. Original recipient count: ${originalTo.length + originalCc.length + originalBcc.length}. Test recipient count: ${config.testTo.length + config.testCc.length + config.testBcc.length}. Replaced to=${originalTo.length > 0}, cc=${originalCc.length > 0}, bcc=${originalBcc.length > 0}.`,
  );

  return {
    environment: config.environment,
    recipientsOverridden: true,
    originalTo,
    originalCc,
    originalBcc,
  };
}

export function appendMailRecipientSafetyDebugFooter(
  options: SafeSendMailOptions,
  result: MailRecipientSafetyResult,
  config: Pick<
    ResolvedMailRecipientSafetyConfig,
    'appName' | 'rawEnvironment' | 'addOriginalRecipientsToBody'
  >,
) {
  if (!result.recipientsOverridden) {
    return;
  }

  const debugBlock = buildDebugFooter(
    config.appName,
    config.rawEnvironment ?? result.environment,
    result.environment,
    resolveSourceModule(options),
    result.originalTo,
    result.originalCc,
    result.originalBcc,
    config.addOriginalRecipientsToBody,
  );

  if (typeof options.html === 'string' || Buffer.isBuffer(options.html)) {
    const html = toUtf8String(options.html);
    options.html = injectHtmlDebugFooter(html, debugBlock.html);
  }

  if (typeof options.text === 'string' || Buffer.isBuffer(options.text)) {
    const text = toUtf8String(options.text);
    options.text = `${text}${debugBlock.text}`;
  }
}

function parseConfiguredRecipients(value?: string | null): {
  valid: string[];
  invalid: string[];
} {
  if (!value || value.trim() === '') {
    return {
      valid: [],
      invalid: [],
    };
  }

  const valid: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of value.split(EMAIL_SEPARATOR_REGEX)) {
    const trimmed = rawValue.trim();
    if (!trimmed) {
      continue;
    }

    if (!EMAIL_REGEX.test(trimmed)) {
      invalid.push(trimmed);
      continue;
    }

    const normalized = trimmed.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    valid.push(normalized);
  }

  return {
    valid,
    invalid,
  };
}

function normalizeRecipientInput(
  value: SafeSendMailOptions['to'],
): ParsedAddress[] {
  if (!value) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeRecipientInput(entry));
  }

  if (typeof value === 'string') {
    return parseAddresses(value, { flatten: true }).filter((entry) =>
      Boolean(entry.address),
    );
  }

  if (typeof value === 'object' && 'address' in value && value.address) {
    return [
      {
        address: String(value.address).trim(),
        name:
          'name' in value && typeof value.name === 'string'
            ? value.name.trim()
            : undefined,
      },
    ];
  }

  return [];
}

function buildDebugFooter(
  appName: string,
  displayEnvironment: string,
  environment: NormalizedAppEnvironment,
  sourceModule: string,
  originalTo: ParsedAddress[],
  originalCc: ParsedAddress[],
  originalBcc: ParsedAddress[],
  includeOriginalRecipients: boolean,
) {
  const fields: Array<readonly [string, string]> = [
    ['Environment', displayEnvironment],
    ['Application', appName],
    ['Source Module', sourceModule],
  ];
  const originalRecipientFields: Array<readonly [string, string]> =
    includeOriginalRecipients
      ? [
          ['Original To', formatAddressList(originalTo)],
          ['Original Cc', formatAddressList(originalCc)],
          ['Original Bcc', formatAddressList(originalBcc)],
        ]
      : [];

  const html = [
    '<hr />',
    '<section style="margin-top:24px;padding:16px;border:1px solid #d1d5db;background:#fff8dc;color:#111827;font-family:Arial,sans-serif;font-size:14px;">',
    '<strong>TEST EMAIL - RECIPIENT OVERRIDE ENABLED</strong>',
    '<p style="margin:12px 0 0;">This message was redirected by the application email test configuration.</p>',
    '<ul style="margin:12px 0 0 18px;padding:0;">',
    ...fields.map(
      ([label, value]) =>
        `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`,
    ),
    ...originalRecipientFields.map(
      ([label, value]) =>
        `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`,
    ),
    '</ul>',
    '</section>',
  ].join('');

  const text = [
    '',
    '',
    'TEST EMAIL - RECIPIENT OVERRIDE ENABLED',
    'This message was redirected by the application email test configuration.',
    ...fields.map(([label, value]) => `${label}: ${value}`),
    ...originalRecipientFields.map(([label, value]) => `${label}: ${value}`),
  ].join('\n');

  void environment;

  return { html, text };
}

function formatAddressList(addresses: ParsedAddress[]): string {
  if (!addresses.length) {
    return '(none)';
  }

  return addresses
    .map((address) =>
      address.name ? `${address.name} <${address.address}>` : address.address,
    )
    .join(', ');
}

function injectHtmlDebugFooter(html: string, footer: string): string {
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${footer}</body>`);
  }

  return `${html}${footer}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toUtf8String(value: string | Buffer): string {
  return Buffer.isBuffer(value) ? value.toString('utf8') : value;
}

function resolveSourceModule(options: SafeSendMailOptions): string {
  return options.mailSafetyContext?.sourceModule?.trim() || 'unknown';
}

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
  overrideEnabled: boolean;
  testTo?: string | null;
  testCc?: string | null;
  testBcc?: string | null;
};

export type ResolvedMailRecipientSafetyConfig = {
  environment: NormalizedAppEnvironment;
  rawEnvironment: string | null;
  overrideEnabled: boolean;
  testTo: string[];
  testCc: string[];
  testBcc: string[];
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
const DEVELOPMENT_ENVS = new Set<NormalizedAppEnvironment>([
  'local',
  'development',
  'uat',
]);

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

  return {
    environment,
    rawEnvironment,
    overrideEnabled: config.overrideEnabled,
    testTo: parseConfiguredRecipients(config.testTo),
    testCc: parseConfiguredRecipients(config.testCc),
    testBcc: parseConfiguredRecipients(config.testBcc),
  };
}

export function resolveMailRecipientSafetyConfigFromConfigService(
  configService: Pick<ConfigService, 'get'>,
): ResolvedMailRecipientSafetyConfig {
  return resolveMailRecipientSafetyConfig({
    appEnv: configService.get<string>('APP_ENV'),
    nodeEnv: configService.get<string>('NODE_ENV'),
    overrideEnabled:
      configService.get<boolean>('MAIL_OVERRIDE_ENABLED') === true,
    testTo: configService.get<string>('MAIL_TEST_TO'),
    testCc: configService.get<string>('MAIL_TEST_CC'),
    testBcc: configService.get<string>('MAIL_TEST_BCC'),
  });
}

export function resolveMailRecipientSafetyConfigFromEnv(
  env: NodeJS.ProcessEnv,
): ResolvedMailRecipientSafetyConfig {
  return resolveMailRecipientSafetyConfig({
    appEnv: env.APP_ENV,
    nodeEnv: env.NODE_ENV,
    overrideEnabled:
      env.MAIL_OVERRIDE_ENABLED === 'true' || env.MAIL_OVERRIDE_ENABLED === '1',
    testTo: env.MAIL_TEST_TO,
    testCc: env.MAIL_TEST_CC,
    testBcc: env.MAIL_TEST_BCC,
  });
}

export function applyMailRecipientSafety(
  options: SafeSendMailOptions,
  config: ResolvedMailRecipientSafetyConfig,
  logger?: Pick<Logger, 'log' | 'warn'>,
): MailRecipientSafetyResult {
  const result = prepareMailRecipientSafety(options, config, logger);
  appendMailRecipientSafetyDebugFooter(options, result);
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

  if (config.environment === 'production') {
    if (config.overrideEnabled) {
      logger?.warn?.(
        `Ignoring MAIL_OVERRIDE_ENABLED in production for source "${resolveSourceModule(options)}".`,
      );
    }

    return {
      environment: config.environment,
      recipientsOverridden: false,
      originalTo,
      originalCc,
      originalBcc,
    };
  }

  if (!DEVELOPMENT_ENVS.has(config.environment)) {
    return {
      environment: config.environment,
      recipientsOverridden: false,
      originalTo,
      originalCc,
      originalBcc,
    };
  }

  if (!config.overrideEnabled) {
    throw new UnsafeEmailDeliveryError(
      `Email delivery is blocked in ${config.environment}. Enable MAIL_OVERRIDE_ENABLED and configure MAIL_TEST_TO to send safely.`,
    );
  }

  if (!config.testTo.length) {
    throw new UnsafeEmailDeliveryError(
      `Email delivery is blocked in ${config.environment} because MAIL_TEST_TO is missing or invalid while recipient override is enabled.`,
    );
  }

  options.to = [...config.testTo];
  options.cc = config.testCc.length ? [...config.testCc] : undefined;
  options.bcc = config.testBcc.length ? [...config.testBcc] : undefined;

  logger?.log?.(
    `Mail recipient override applied for source "${resolveSourceModule(options)}" in ${config.environment}. Original recipient counts: to=${originalTo.length}, cc=${originalCc.length}, bcc=${originalBcc.length}.`,
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
) {
  if (!result.recipientsOverridden) {
    return;
  }

  const debugBlock = buildDebugFooter(
    result.environment,
    resolveSourceModule(options),
    result.originalTo,
    result.originalCc,
    result.originalBcc,
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

function parseConfiguredRecipients(value?: string | null): string[] {
  if (!value || value.trim() === '') {
    return [];
  }

  return value
    .split(EMAIL_SEPARATOR_REGEX)
    .map((item) => item.trim())
    .filter((item) => item !== '')
    .filter((item) => EMAIL_REGEX.test(item));
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
  environment: NormalizedAppEnvironment,
  sourceModule: string,
  originalTo: ParsedAddress[],
  originalCc: ParsedAddress[],
  originalBcc: ParsedAddress[],
) {
  const fields = [
    ['Current Environment', environment],
    ['Source Module', sourceModule],
    ['Original To', formatAddressList(originalTo)],
    ['Original CC', formatAddressList(originalCc)],
    ['Original BCC', formatAddressList(originalBcc)],
  ] as const;

  const html = [
    '<hr />',
    '<section style="margin-top:24px;padding:16px;border:1px solid #d1d5db;background:#fff8dc;color:#111827;font-family:Arial,sans-serif;font-size:14px;">',
    '<strong>Development Mail Override Applied</strong>',
    '<ul style="margin:12px 0 0 18px;padding:0;">',
    ...fields.map(
      ([label, value]) =>
        `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`,
    ),
    '</ul>',
    '</section>',
  ].join('');

  const text = [
    '',
    '',
    '--- Development Mail Override Applied ---',
    ...fields.map(([label, value]) => `${label}: ${value}`),
  ].join('\n');

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

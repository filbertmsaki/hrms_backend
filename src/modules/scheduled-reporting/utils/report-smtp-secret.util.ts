import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const SECRET_PREFIX = 'enc:rpt:v1:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getSecretKey(): Buffer {
  const raw =
    process.env.REPORT_SMTP_SECRET_KEY ||
    process.env.APP_KEY ||
    process.env.JWT_ACCESS_SECRET ||
    process.env.JWT_REFRESH_SECRET ||
    process.env.JWT_RESET_SECRET ||
    '';

  const fallback =
    raw || 'development-only-report-smtp-secret-change-this-value';

  return createHash('sha256').update(fallback).digest();
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): Buffer {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    '=',
  );

  return Buffer.from(padded, 'base64');
}

export function isEncryptedReportSmtpSecret(value?: string | null): boolean {
  return Boolean(value?.startsWith(SECRET_PREFIX));
}

export function encryptReportSmtpSecret(value: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    return normalized;
  }

  if (isEncryptedReportSmtpSecret(normalized)) {
    return normalized;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', getSecretKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(normalized, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    SECRET_PREFIX,
    toBase64Url(iv),
    '.',
    toBase64Url(authTag),
    '.',
    toBase64Url(encrypted),
  ].join('');
}

export function decryptReportSmtpSecret(value?: string | null): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  if (!isEncryptedReportSmtpSecret(normalized)) {
    return normalized;
  }

  const payload = normalized.slice(SECRET_PREFIX.length);
  const [ivPart, authTagPart, encryptedPart] = payload.split('.');

  if (!ivPart || !authTagPart || !encryptedPart) {
    throw new Error('Invalid encrypted report SMTP secret format.');
  }

  const iv = fromBase64Url(ivPart);
  const authTag = fromBase64Url(authTagPart);
  const encrypted = fromBase64Url(encryptedPart);

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted report SMTP secret payload.');
  }

  const decipher = createDecipheriv('aes-256-gcm', getSecretKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}

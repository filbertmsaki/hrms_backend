import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'crypto';

const SECRET_PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const SENSITIVE_KEY_PATTERN =
  /(password|pass|secret|token|credential|fingerprint|face|biometric|template|private|authorization|auth|pin)/i;

const CARD_KEY_PATTERN = /(card|cardNo|cardNumber|card_no|card_number)/i;

function getSecretKey(): Buffer {
  const raw =
    process.env.ATTENDANCE_DEVICE_SECRET_KEY ||
    process.env.APP_KEY ||
    process.env.JWT_SECRET ||
    '';

  if (!raw && process.env.NODE_ENV === 'production') {
    throw new Error(
      'ATTENDANCE_DEVICE_SECRET_KEY is required in production for attendance device password encryption.',
    );
  }

  const fallback =
    raw || 'development-only-attendance-device-secret-change-this-value';

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

export function isEncryptedDeviceSecret(value?: string | null): boolean {
  return Boolean(value?.startsWith(SECRET_PREFIX));
}

export function encryptDeviceSecret(value: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    return normalized;
  }

  if (isEncryptedDeviceSecret(normalized)) {
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

export function decryptDeviceSecret(value: string): string {
  const normalized = value?.trim();

  if (!normalized) {
    return normalized;
  }

  /**
   * Backward compatibility: old devices may still have plain-text api_password.
   * If value is not encrypted, return it as-is.
   */
  if (!isEncryptedDeviceSecret(normalized)) {
    return normalized;
  }

  const payload = normalized.slice(SECRET_PREFIX.length);
  const [ivPart, authTagPart, encryptedPart] = payload.split('.');

  if (!ivPart || !authTagPart || !encryptedPart) {
    throw new Error('Invalid encrypted attendance device secret format.');
  }

  const iv = fromBase64Url(ivPart);
  const authTag = fromBase64Url(authTagPart);
  const encrypted = fromBase64Url(encryptedPart);

  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted attendance device secret payload.');
  }

  const decipher = createDecipheriv('aes-256-gcm', getSecretKey(), iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString('utf8');
}

export function maskSecret(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const text = String(value);

  if (!text) {
    return text;
  }

  if (text.length <= 4) {
    return '****';
  }

  return `${text.slice(0, 2)}****${text.slice(-2)}`;
}

export function maskCardValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const text = String(value).trim();

  if (!text) {
    return text;
  }

  if (text.length <= 4) {
    return '****';
  }

  return `****${text.slice(-4)}`;
}

export function maskSensitiveObject<T = unknown>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => maskSensitiveObject(item)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const output: Record<string, unknown> = {};

  for (const [key, childValue] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      output[key] = maskSecret(childValue);
      continue;
    }

    if (CARD_KEY_PATTERN.test(key)) {
      output[key] = maskCardValue(childValue);
      continue;
    }

    output[key] = maskSensitiveObject(childValue);
  }

  return output as T;
}

export function safeCompareSecrets(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

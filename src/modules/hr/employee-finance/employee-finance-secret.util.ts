import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const SECRET_PREFIX = 'enc:efi:v1:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/**
 * Key for bank and ERP credentials. Production must set
 * EMPLOYEE_FINANCE_INTEGRATION_SECRET_KEY (or APP_KEY); only development and
 * test fall back to a fixed key.
 */
function secretKey(): Buffer {
  const raw =
    process.env.EMPLOYEE_FINANCE_INTEGRATION_SECRET_KEY ||
    process.env.APP_KEY ||
    '';
  if (!raw && process.env.NODE_ENV === 'production') {
    throw new Error(
      'EMPLOYEE_FINANCE_INTEGRATION_SECRET_KEY must be set to store bank or ERP credentials.',
    );
  }
  return createHash('sha256')
    .update(raw || 'development-only-employee-finance-integration-key')
    .digest();
}

export function isEncryptedIntegrationSecret(value?: string | null) {
  return Boolean(value?.startsWith(SECRET_PREFIX));
}

export function encryptIntegrationSecret(value: string): string {
  if (isEncryptedIntegrationSecret(value)) return value;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', secretKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  return `${SECRET_PREFIX}${iv.toString('base64url')}.${cipher
    .getAuthTag()
    .toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function decryptIntegrationSecret(value?: string | null): string | null {
  if (!value) return null;
  if (!isEncryptedIntegrationSecret(value)) return value;
  const [ivPart, tagPart, dataPart] = value
    .slice(SECRET_PREFIX.length)
    .split('.');
  if (!ivPart || !tagPart || !dataPart) {
    throw new Error('Invalid encrypted integration secret.');
  }
  const iv = Buffer.from(ivPart, 'base64url');
  const tag = Buffer.from(tagPart, 'base64url');
  if (iv.length !== IV_LENGTH || tag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid encrypted integration secret.');
  }
  const decipher = createDecipheriv('aes-256-gcm', secretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

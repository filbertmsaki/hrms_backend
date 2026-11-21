import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'crypto';

/**
 * Versioned AES-256-GCM field encryption for sensitive values such as bank
 * account numbers.
 *
 * Keys never live in source code. They come from a key provider:
 * - environment provider (development, or where no KMS exists yet):
 *     FIELD_ENCRYPTION_KEYS="v1:<base64 32 bytes>,v2:<base64 32 bytes>"
 *     FIELD_ENCRYPTION_ACTIVE_KEY=v2
 * - a KMS provider installed at bootstrap with `installFieldEncryptionKeys`
 *   (e.g. data keys unwrapped by the cloud KMS). Production should use KMS.
 *
 * Ciphertext format: `fenc:<keyVersion>:<iv>:<tag>:<ciphertext>` (base64url).
 * The key version travels with each value, so rotation = add a new key, make
 * it active, and re-encrypt in the background; old values keep decrypting.
 *
 * Encryption on write is switched on by FIELD_ENCRYPTION_ENABLED=true. Values
 * written before that (plaintext) still read correctly, so the switch and the
 * backfill can be done after keys, backups and recovery are verified.
 */

const PREFIX = 'fenc:';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

type Keyring = { active: string; keys: Map<string, Buffer> };

let installed: Keyring | null = null;

function b64url(buffer: Buffer) {
  return buffer.toString('base64url');
}

function fromB64url(value: string) {
  return Buffer.from(value, 'base64url');
}

function parseEnvKeyring(): Keyring | null {
  const raw = process.env.FIELD_ENCRYPTION_KEYS?.trim();
  if (!raw) return null;
  const keys = new Map<string, Buffer>();
  for (const entry of raw.split(',')) {
    const [version, material] = entry.split(':').map((part) => part?.trim());
    if (!version || !material) continue;
    const key = Buffer.from(material, 'base64');
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `Field encryption key ${version} must be ${KEY_LENGTH} bytes (base64).`,
      );
    }
    keys.set(version, key);
  }
  if (keys.size === 0) return null;
  const active =
    process.env.FIELD_ENCRYPTION_ACTIVE_KEY?.trim() || [...keys.keys()].pop()!;
  if (!keys.has(active)) {
    throw new Error(`Active field encryption key ${active} is not configured.`);
  }
  return { active, keys };
}

/** Install keys from a KMS-backed provider at application bootstrap. */
export function installFieldEncryptionKeys(
  keys: Record<string, Buffer>,
  activeVersion: string,
) {
  const map = new Map(Object.entries(keys));
  for (const [version, key] of map) {
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `Field encryption key ${version} must be ${KEY_LENGTH} bytes.`,
      );
    }
  }
  if (!map.has(activeVersion)) {
    throw new Error(`Active field encryption key ${activeVersion} is missing.`);
  }
  installed = { active: activeVersion, keys: map };
}

/** Test/support helper: forget installed keys (env keys are re-read). */
export function resetFieldEncryptionKeys() {
  installed = null;
}

function keyring(): Keyring | null {
  return installed ?? parseEnvKeyring();
}

export function isFieldEncryptionEnabled() {
  return (
    process.env.FIELD_ENCRYPTION_ENABLED?.trim().toLowerCase() === 'true' &&
    keyring() !== null
  );
}

export function isEncryptedField(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptField(plaintext: string, context: string) {
  const ring = keyring();
  if (!ring) throw new Error('Field encryption keys are not configured.');
  const key = ring.keys.get(ring.active)!;
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(context, 'utf8'));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  return `${PREFIX}${ring.active}:${b64url(iv)}:${b64url(cipher.getAuthTag())}:${b64url(ciphertext)}`;
}

export function decryptField(value: string, context: string) {
  if (!isEncryptedField(value)) return value;
  const [version, iv, tag, data] = value.slice(PREFIX.length).split(':');
  const key = keyring()?.keys.get(version);
  if (!key) {
    // Never echo the ciphertext or plaintext in errors.
    throw new Error(`Field encryption key ${version} is not available.`);
  }
  const decipher = createDecipheriv('aes-256-gcm', key, fromB64url(iv));
  decipher.setAAD(Buffer.from(context, 'utf8'));
  decipher.setAuthTag(fromB64url(tag));
  return Buffer.concat([
    decipher.update(fromB64url(data)),
    decipher.final(),
  ]).toString('utf8');
}

/** Key version of an encrypted value (null for legacy plaintext). */
export function fieldKeyVersion(value: unknown) {
  return isEncryptedField(value)
    ? value.slice(PREFIX.length).split(':')[0]
    : null;
}

export function activeFieldKeyVersion() {
  return keyring()?.active ?? null;
}

/**
 * Deterministic keyed fingerprint for duplicate detection without storing
 * plaintext; uses the active key so it should be recomputed on rotation.
 */
export function fieldFingerprint(plaintext: string, context: string) {
  const ring = keyring();
  if (!ring) return null;
  return createHmac('sha256', ring.keys.get(ring.active)!)
    .update(`${context}:${plaintext}`)
    .digest('hex');
}

export function maskAccountNumber(value: string | null | undefined) {
  if (!value) return value ?? null;
  const visible = value.slice(-4);
  return `${'•'.repeat(Math.max(4, value.length - 4))}${visible}`;
}

export function looksMasked(value: string | null | undefined) {
  return Boolean(value && /^[•*]{2,}[0-9A-Za-z]{0,4}$/.test(value.trim()));
}

/** TypeORM transformer: encrypts on write when enabled, always decrypts on read. */
export function encryptedColumnTransformer(context: string) {
  return {
    to(value: string | null | undefined) {
      if (value === null || value === undefined || value === '') return value;
      if (isEncryptedField(value) || !isFieldEncryptionEnabled()) return value;
      return encryptField(value, context);
    },
    from(value: string | null | undefined) {
      if (value === null || value === undefined) return value;
      return decryptField(value, context);
    },
  };
}

/**
 * Startup check. With FIELD_ENCRYPTION_ENABLED=true the keyring must parse
 * (each key 32 bytes, active version present) and, in production, the
 * enterprise key management must be signed off explicitly with
 * FIELD_ENCRYPTION_PRODUCTION_APPROVED=true. Reports versions, never keys.
 */
export function assertFieldEncryptionConfiguration(env = process.env) {
  const enabled = env.FIELD_ENCRYPTION_ENABLED?.trim().toLowerCase() === 'true';
  if (!enabled) return { enabled: false as const };
  const ring = installed ?? parseEnvKeyring();
  if (!ring) {
    throw new Error(
      'FIELD_ENCRYPTION_ENABLED=true but no encryption keys are configured.',
    );
  }
  // UAT runs with NODE_ENV=production; the deployment environment is
  // APP_ENV (uat | production). NODE_ENV is only a fallback when APP_ENV is unset.
  const appEnv = env.APP_ENV?.trim().toLowerCase();
  const isProduction = appEnv
    ? appEnv === 'production' || appEnv === 'prod'
    : env.NODE_ENV === 'production';
  if (
    isProduction &&
    env.FIELD_ENCRYPTION_PRODUCTION_APPROVED?.trim().toLowerCase() !== 'true'
  ) {
    throw new Error(
      'Field encryption is not approved for production (set FIELD_ENCRYPTION_PRODUCTION_APPROVED=true after key management, backup and recovery are signed off).',
    );
  }
  return {
    enabled: true as const,
    activeVersion: ring.active,
    versions: [...ring.keys.keys()],
  };
}

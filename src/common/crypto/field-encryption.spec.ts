import { randomBytes } from 'crypto';
import {
  decryptField,
  encryptField,
  encryptedColumnTransformer,
  fieldKeyVersion,
  looksMasked,
  maskAccountNumber,
  resetFieldEncryptionKeys,
} from './field-encryption';

const CONTEXT = 'employee_bank_accounts.account_number';

describe('field encryption', () => {
  const v1 = randomBytes(32).toString('base64');
  const v2 = randomBytes(32).toString('base64');
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
    resetFieldEncryptionKeys();
  });

  it('round-trips with AES-256-GCM and never stores plaintext', () => {
    process.env.FIELD_ENCRYPTION_KEYS = `v1:${v1}`;
    const cipher = encryptField('0152345678901', CONTEXT);
    expect(cipher).not.toContain('0152345678901');
    expect(decryptField(cipher, CONTEXT)).toBe('0152345678901');
  });

  it('detects tampering and wrong context', () => {
    process.env.FIELD_ENCRYPTION_KEYS = `v1:${v1}`;
    const cipher = encryptField('0152345678901', CONTEXT);
    expect(() => decryptField(cipher, 'other.column')).toThrow();
    const parts = cipher.split(':');
    parts[4] = Buffer.from('tampered').toString('base64url');
    expect(() => decryptField(parts.join(':'), CONTEXT)).toThrow();
  });

  it('rotates keys: old values still decrypt, new values use the active key', () => {
    process.env.FIELD_ENCRYPTION_KEYS = `v1:${v1}`;
    const old = encryptField('111122223333', CONTEXT);
    process.env.FIELD_ENCRYPTION_KEYS = `v1:${v1},v2:${v2}`;
    process.env.FIELD_ENCRYPTION_ACTIVE_KEY = 'v2';
    const fresh = encryptField('444455556666', CONTEXT);
    expect(fieldKeyVersion(old)).toBe('v1');
    expect(fieldKeyVersion(fresh)).toBe('v2');
    expect(decryptField(old, CONTEXT)).toBe('111122223333');
    expect(decryptField(fresh, CONTEXT)).toBe('444455556666');
  });

  it('errors without leaking data when a key is missing', () => {
    process.env.FIELD_ENCRYPTION_KEYS = `v1:${v1}`;
    const cipher = encryptField('999988887777', CONTEXT);
    process.env.FIELD_ENCRYPTION_KEYS = `v2:${v2}`;
    expect(() => decryptField(cipher, CONTEXT)).toThrow(
      'Field encryption key v1 is not available.',
    );
  });

  it('transformer writes plaintext until enabled, and always reads legacy plaintext', () => {
    const transformer = encryptedColumnTransformer(CONTEXT);
    process.env.FIELD_ENCRYPTION_KEYS = `v1:${v1}`;
    expect(transformer.to('12345678')).toBe('12345678');
    process.env.FIELD_ENCRYPTION_ENABLED = 'true';
    const stored = transformer.to('12345678') as string;
    expect(stored.startsWith('fenc:v1:')).toBe(true);
    expect(transformer.from(stored)).toBe('12345678');
    expect(transformer.from('legacy-plain')).toBe('legacy-plain');
  });

  it('masks account numbers and recognises masked input', () => {
    expect(maskAccountNumber('0152345678901')).toBe('•••••••••8901');
    expect(looksMasked('•••••••••8901')).toBe(true);
    expect(looksMasked('0152345678901')).toBe(false);
  });
});

describe('field encryption startup configuration', () => {
  const key = randomBytes(32).toString('base64');
  afterEach(() => resetFieldEncryptionKeys());

  it('is a no-op when disabled and fails fast when enabled without keys', () => {
    const { assertFieldEncryptionConfiguration } =
      jest.requireActual('./field-encryption');
    expect(assertFieldEncryptionConfiguration({})).toEqual({ enabled: false });
    expect(() =>
      assertFieldEncryptionConfiguration({ FIELD_ENCRYPTION_ENABLED: 'true' }),
    ).toThrow('no encryption keys');
  });

  it('rejects short keys and an unknown active version', () => {
    const { assertFieldEncryptionConfiguration } =
      jest.requireActual('./field-encryption');
    const saved = { ...process.env };
    process.env.FIELD_ENCRYPTION_KEYS = `v1:${randomBytes(16).toString('base64')}`;
    expect(() =>
      assertFieldEncryptionConfiguration({ FIELD_ENCRYPTION_ENABLED: 'true' }),
    ).toThrow('must be 32 bytes');
    process.env.FIELD_ENCRYPTION_KEYS = `v1:${key}`;
    process.env.FIELD_ENCRYPTION_ACTIVE_KEY = 'v9';
    expect(() =>
      assertFieldEncryptionConfiguration({ FIELD_ENCRYPTION_ENABLED: 'true' }),
    ).toThrow('Active field encryption key v9');
    process.env = saved;
  });

  it('blocks production until key management is approved', () => {
    const { assertFieldEncryptionConfiguration } =
      jest.requireActual('./field-encryption');
    const saved = { ...process.env };
    process.env.FIELD_ENCRYPTION_KEYS = `v1:${key}`;
    delete process.env.FIELD_ENCRYPTION_ACTIVE_KEY;
    expect(() =>
      assertFieldEncryptionConfiguration({
        FIELD_ENCRYPTION_ENABLED: 'true',
        NODE_ENV: 'production',
      }),
    ).toThrow('not approved for production');
    expect(
      assertFieldEncryptionConfiguration({
        FIELD_ENCRYPTION_ENABLED: 'true',
        NODE_ENV: 'production',
        FIELD_ENCRYPTION_PRODUCTION_APPROVED: 'true',
      }),
    ).toMatchObject({ enabled: true, activeVersion: 'v1', versions: ['v1'] });
    process.env = saved;
  });
});

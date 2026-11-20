import {
  decryptDeviceSecret,
  encryptDeviceSecret,
  isEncryptedDeviceSecret,
} from './attendance-device-secret.util';

describe('attendance device secrets', () => {
  it('uses the existing application key in production without a device-specific key', () => {
    const original = { ...process.env };
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.ATTENDANCE_DEVICE_SECRET_KEY;
      process.env.APP_KEY = 'existing-application-secret';
      expect(decryptDeviceSecret(encryptDeviceSecret('password'))).toBe('password');
    } finally {
      process.env = original;
    }
  });
  it('encrypts with randomized authenticated ciphertext and decrypts it', () => {
    const first = encryptDeviceSecret('device-password');
    const second = encryptDeviceSecret('device-password');
    expect(first).not.toContain('device-password');
    expect(first).not.toEqual(second);
    expect(isEncryptedDeviceSecret(first)).toBe(true);
    expect(decryptDeviceSecret(first)).toBe('device-password');
    expect(encryptDeviceSecret(first)).toBe(first);
  });

  it('reads legacy plaintext and rejects tampered ciphertext', () => {
    expect(decryptDeviceSecret('legacy-password')).toBe('legacy-password');
    const value = encryptDeviceSecret('device-password');
    const [header, tag, ciphertext] = value.split('.');
    const changed = `${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;
    expect(() => decryptDeviceSecret(`${header}.${tag}.${changed}`)).toThrow();
  });
});

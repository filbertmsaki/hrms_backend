import { DataSource } from 'typeorm';
import { DeviceSecretBackfillService } from './device-secret-backfill.service';
import {
  decryptDeviceSecret,
  encryptDeviceSecret,
} from '../utils/attendance-device-secret.util';

describe('device secret backfill', () => {
  it('encrypts legacy values and skips whitespace-sensitive values', async () => {
    const encrypted = encryptDeviceSecret('existing');
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        { id: 1, api_password: 'legacy' },
        { id: 2, api_password: encrypted },
        { id: 3, api_password: ' preserve ' },
      ])
      .mockResolvedValue([]);
    const dataSource = {
      transaction: (callback: (manager: unknown) => unknown) =>
        callback({ query }),
    } as unknown as DataSource;
    await new DeviceSecretBackfillService(dataSource).onModuleInit();
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][1][1]).toBe(1);
    expect(decryptDeviceSecret(query.mock.calls[1][1][0])).toBe('legacy');
  });

  it('does not write when an existing ciphertext cannot be decrypted', async () => {
    const query = jest.fn().mockResolvedValue([
      { id: 1, api_password: 'legacy' },
      { id: 2, api_password: 'enc:v1:invalid' },
    ]);
    const dataSource = {
      transaction: (callback: (manager: unknown) => unknown) =>
        callback({ query }),
    } as unknown as DataSource;
    await expect(
      new DeviceSecretBackfillService(dataSource).onModuleInit(),
    ).rejects.toThrow();
    expect(query).toHaveBeenCalledTimes(1);
  });
});

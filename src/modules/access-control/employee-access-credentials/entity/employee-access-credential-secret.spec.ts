import 'reflect-metadata';
import { getMetadataArgsStorage, ValueTransformer } from 'typeorm';
import { EmployeeAccessCredential } from './employee-access-credential.entity';
import { EncryptEmployeeAccessPins1797900039000 } from '../../../../database/migrations/1797900039000-EncryptEmployeeAccessPins';

describe('employee PIN storage', () => {
  it('encrypts new values and reads legacy plaintext and nulls', () => {
    const column = getMetadataArgsStorage().columns.find(
      (entry) =>
        entry.target === EmployeeAccessCredential &&
        entry.propertyName === 'pinPassword',
    );
    expect(column?.options.type).toBe('text');
    const transformer = column?.options.transformer as ValueTransformer;
    const ciphertext = transformer.to('123456') as string;
    expect(ciphertext).toMatch(/^enc:v1:/);
    expect(ciphertext).not.toContain('123456');
    expect(transformer.from(ciphertext)).toBe('123456');
    expect(transformer.from('legacy-pin')).toBe('legacy-pin');
    expect(transformer.to(null)).toBeNull();
  });

  it('refuses a destructive rollback while encrypted PINs exist', async () => {
    const query = jest.fn().mockResolvedValue([{ count: '1' }]);
    await expect(
      new EncryptEmployeeAccessPins1797900039000().down({ query } as never),
    ).rejects.toThrow('Cannot revert PIN column');
    expect(query).toHaveBeenCalledTimes(1);
  });
});

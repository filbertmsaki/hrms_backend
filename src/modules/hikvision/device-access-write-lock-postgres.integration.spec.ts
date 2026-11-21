import { DataSource } from 'typeorm';
import { DeviceAccessWriteLockService } from './device-access-write-lock.service';

const run =
  process.env.RUN_ACCESS_CAPTURE_PG_TEST === '1' ? describe : describe.skip;

run('device access lock on PostgreSQL', () => {
  let dataSource: DataSource;
  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'postgres',
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    });
    await dataSource.initialize();
  });
  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('excludes another instance and releases the lock when the work ends', async () => {
    const first = new DeviceAccessWriteLockService(dataSource);
    const second = new DeviceAccessWriteLockService(dataSource);
    // The test key is deliberately separate from real company/device IDs.
    await first.run(-process.pid, -1, async () => {
      await expect(
        second.run(-process.pid, -1, async () => undefined),
      ).rejects.toThrow('in progress');
      await expect(
        second.run(-process.pid, -2, async () => 'other'),
      ).resolves.toBe('other');
    });
    await expect(
      second.run(-process.pid, -1, async () => 'released'),
    ).resolves.toBe('released');
  });
});

import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import {
  DeviceAccessWriteLockService,
  isDeviceAccessWrite,
} from './device-access-write-lock.service';

describe('device access write lock', () => {
  const runner = { connect: jest.fn(), query: jest.fn(), release: jest.fn() };
  let service: DeviceAccessWriteLockService;
  beforeEach(() => {
    jest.resetAllMocks();
    runner.query.mockResolvedValue([{ acquired: true }]);
    service = new DeviceAccessWriteLockService({
      createQueryRunner: () => runner,
    } as unknown as DataSource);
  });
  it('holds and releases the lock once for reentrant work', async () => {
    await expect(
      service.run(1, 2, () => service.run(1, 2, async () => 'ok')),
    ).resolves.toBe('ok');
    expect(runner.query).toHaveBeenCalledTimes(2);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });
  it('rejects nesting locks for different devices', async () => {
    await expect(
      service.run(1, 2, () => service.run(1, 3, async () => undefined)),
    ).rejects.toThrow('Nested access locks');
    expect(runner.query).toHaveBeenCalledTimes(2);
  });
  it('releases the lock when a device request fails', async () => {
    await expect(
      service.run(1, 2, async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');
    expect(runner.query).toHaveBeenCalledTimes(2);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });
  it('fails safely when another instance holds the lock', async () => {
    runner.query.mockResolvedValueOnce([{ acquired: false }]);
    const work = jest.fn();
    await expect(service.run(1, 2, work)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(work).not.toHaveBeenCalled();
    expect(runner.query).toHaveBeenCalledTimes(1);
    expect(runner.release).toHaveBeenCalledTimes(1);
  });
  it('releases its query runner if connecting fails', async () => {
    runner.connect.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.run(1, 2, async () => undefined)).rejects.toThrow(
      'database unavailable',
    );
    expect(runner.release).toHaveBeenCalledTimes(1);
    expect(runner.query).not.toHaveBeenCalled();
  });
  it('classifies user and credential mutations while leaving searches unlocked', () => {
    expect(
      isDeviceAccessWrite(
        '/ISAPI/AccessControl/UserInfo/Delete?format=json',
        'PUT',
      ),
    ).toBe(true);
    expect(
      isDeviceAccessWrite(
        '/ISAPI/AccessControl/CardInfo/Record?format=json',
        'POST',
      ),
    ).toBe(true);
    expect(
      isDeviceAccessWrite(
        '/ISAPI/AccessControl/FingerPrint/SetUp?format=json',
        'POST',
      ),
    ).toBe(true);
    expect(
      isDeviceAccessWrite(
        '/ISAPI/AccessControl/UserInfo/Search?format=json',
        'POST',
      ),
    ).toBe(false);
  });
});

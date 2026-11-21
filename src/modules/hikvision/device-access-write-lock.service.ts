import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { AsyncLocalStorage } from 'node:async_hooks';
import { DataSource } from 'typeorm';

/** Serializes HRMS access writes per device across application instances. */
@Injectable()
export class DeviceAccessWriteLockService {
  private readonly active = new AsyncLocalStorage<string>();

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async run<T>(
    companyId: number,
    deviceId: number,
    work: () => Promise<T>,
  ): Promise<T> {
    const key = `${companyId}:${deviceId}`;
    const held = this.active.getStore();
    if (held === key) return work();
    if (held)
      throw new Error(
        'Nested access locks for different devices are not supported',
      );
    const runner = this.dataSource.createQueryRunner();
    let acquired = false;
    try {
      await runner.connect();
      const rows = (await runner.query(
        "SELECT pg_try_advisory_lock(hashtext('hrms-device-access'), hashtext($1)) AS acquired",
        [key],
      )) as Array<{ acquired: boolean }>;
      acquired = rows[0]?.acquired === true;
      if (!acquired)
        throw new ServiceUnavailableException(
          'Another device access operation is in progress; retry shortly.',
        );
      return await this.active.run(key, work);
    } finally {
      try {
        if (acquired)
          await runner.query(
            "SELECT pg_advisory_unlock(hashtext('hrms-device-access'), hashtext($1))",
            [key],
          );
      } finally {
        await runner.release();
      }
    }
  }
}

export function isDeviceAccessWrite(path: string, method: string): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase()))
    return false;
  return (
    /^\/ISAPI\/AccessControl\/(?:UserInfo|CardInfo|FingerPrint)(?:\/|\?|$)/i.test(
      path,
    ) && !/\/(?:Search|Upload)(?:\?|$)/i.test(path)
  );
}

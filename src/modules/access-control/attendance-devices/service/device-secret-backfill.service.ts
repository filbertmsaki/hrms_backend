import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  decryptDeviceSecret,
  encryptDeviceSecret,
  isEncryptedDeviceSecret,
} from '../utils/attendance-device-secret.util';

@Injectable()
export class DeviceSecretBackfillService implements OnModuleInit {
  private readonly logger = new Logger(DeviceSecretBackfillService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    const result = await this.dataSource.transaction(async (manager) => {
      const rows: Array<{ id: number; api_password: string }> =
        await manager.query(
          'SELECT id, api_password FROM attendance_devices ORDER BY id FOR UPDATE',
        );
      let updated = 0;
      let skipped = 0;
      // Verify the configured key before touching any legacy records.
      for (const row of rows) {
        if (isEncryptedDeviceSecret(row.api_password))
          decryptDeviceSecret(row.api_password);
      }
      for (const row of rows) {
        if (isEncryptedDeviceSecret(row.api_password)) continue;
        if (!row.api_password || row.api_password !== row.api_password.trim()) {
          skipped++;
          continue;
        }
        await manager.query(
          'UPDATE attendance_devices SET api_password = $1 WHERE id = $2',
          [encryptDeviceSecret(row.api_password), row.id],
        );
        updated++;
      }
      return { updated, skipped };
    });
    if (result.updated)
      this.logger.log(`Encrypted ${result.updated} legacy device password(s).`);
    if (result.skipped)
      this.logger.warn(
        `${result.skipped} device password(s) need manual rotation because they are blank or contain surrounding whitespace.`,
      );
  }
}

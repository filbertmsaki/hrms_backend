import { AppDataSource } from '../database/data-source';
import {
  encryptDeviceSecret,
  isEncryptedDeviceSecret,
  decryptDeviceSecret,
} from '../modules/access-control/attendance-devices/utils/attendance-device-secret.util';

async function main() {
  const apply = process.argv.includes('--apply');
  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (manager) => {
      const rows: Array<{ id: number; api_password: string }> =
        await manager.query(
          'SELECT id, api_password FROM attendance_devices ORDER BY id FOR UPDATE',
        );
      let plaintext = 0;
      let encrypted = 0;
      for (const row of rows) {
        if (isEncryptedDeviceSecret(row.api_password)) {
          // Check the configured key before modifying any rows.
          decryptDeviceSecret(row.api_password);
          encrypted++;
          continue;
        }
        plaintext++;
        if (apply) {
          if (row.api_password !== row.api_password.trim()) {
            throw new Error(
              `Device ${row.id} has a password with surrounding whitespace; rotate it manually first.`,
            );
          }
          await manager.query(
            'UPDATE attendance_devices SET api_password = $1 WHERE id = $2',
            [encryptDeviceSecret(row.api_password), row.id],
          );
        }
      }
      console.log(
        `Device secrets: ${encrypted} encrypted, ${plaintext} plaintext. ${apply ? 'Plaintext rows encrypted.' : 'Dry run; no rows changed.'}`,
      );
    });
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});

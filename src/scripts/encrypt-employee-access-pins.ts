import { AppDataSource } from '../database/data-source';
import {
  decryptDeviceSecret,
  encryptDeviceSecret,
  isEncryptedDeviceSecret,
} from '../modules/access-control/attendance-devices/utils/attendance-device-secret.util';

async function main() {
  const apply = process.argv.includes('--apply');
  decryptDeviceSecret(encryptDeviceSecret('key-verification-probe'));
  await AppDataSource.initialize();
  try {
    await AppDataSource.transaction(async (manager) => {
      const columns: Array<{ data_type: string }> = await manager.query(
        `SELECT data_type FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = 'employee_access_credentials' AND column_name = 'pin_password'`,
      );
      if (columns[0]?.data_type !== 'text')
        throw new Error(
          'PIN column must be migrated to text before running this command.',
        );
      const rows: Array<{ id: number; pin_password: string }> =
        await manager.query(
          'SELECT id, pin_password FROM employee_access_credentials WHERE pin_password IS NOT NULL ORDER BY id FOR UPDATE',
        );
      let encrypted = 0;
      let plaintext = 0;
      for (const row of rows) {
        if (isEncryptedDeviceSecret(row.pin_password)) {
          decryptDeviceSecret(row.pin_password);
          encrypted++;
        } else {
          plaintext++;
          if (!row.pin_password || row.pin_password !== row.pin_password.trim())
            throw new Error(
              `Credential ${row.id} has an empty or whitespace-sensitive PIN; rotate it manually first.`,
            );
        }
      }
      if (apply) {
        for (const row of rows)
          if (!isEncryptedDeviceSecret(row.pin_password)) {
            await manager.query(
              'UPDATE employee_access_credentials SET pin_password = $1 WHERE id = $2',
              [encryptDeviceSecret(row.pin_password), row.id],
            );
          }
      }
      console.log(
        `Employee PINs: ${encrypted} encrypted, ${plaintext} plaintext. ${apply ? 'Plaintext rows encrypted.' : 'Dry run; no rows changed.'}`,
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

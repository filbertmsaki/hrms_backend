import { AppDataSource } from '../data-source';
import { seedModule8UatTestAccounts } from './module8-uat-test-accounts.seed';

async function run() {
  const appEnv = (process.env.APP_ENV ?? '').trim().toLowerCase();
  const database = (process.env.DB_NAME ?? '').trim().toLowerCase();
  if (
    appEnv !== 'uat' ||
    database !== 'hrms_module8_uat_test_db' ||
    process.env.MODULE8_UAT_TEST_CONFIRM !== 'YES'
  ) {
    throw new Error(
      'Module 8 test-account seeding requires APP_ENV=uat, DB_NAME=hrms_module8_uat_test_db, and MODULE8_UAT_TEST_CONFIRM=YES.',
    );
  }

  await AppDataSource.initialize();
  try {
    const result = await seedModule8UatTestAccounts(AppDataSource);
    console.log('[Module8UatTestAccounts]', JSON.stringify(result));
  } finally {
    await AppDataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  console.error(
    '[Module8UatTestAccounts] Failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});

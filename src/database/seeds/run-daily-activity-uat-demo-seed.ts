import { AppDataSource } from '../data-source';
import { seedDailyActivityUatDemo } from './daily-activity-uat-demo.seed';

function requiredPositiveInteger(name: string): number {
  const raw = process.env[name];
  const value = Number(raw);
  if (!raw || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be set to a positive integer.`);
  }
  return value;
}

async function run() {
  const appEnv = (process.env.APP_ENV ?? '').trim().toLowerCase();
  const dbName = (process.env.DB_NAME ?? '').trim().toLowerCase();
  if (appEnv !== 'uat' || !dbName.includes('uat') || dbName.includes('prod')) {
    throw new Error(
      'Daily Activity demo seeding requires APP_ENV=uat and a DB_NAME containing "uat" that does not contain "prod".',
    );
  }
  if (process.env.DAILY_ACTIVITY_DEMO_CONFIRM !== 'YES') {
    throw new Error(
      'Set DAILY_ACTIVITY_DEMO_CONFIRM=YES to confirm UAT demo seeding.',
    );
  }

  const companyId = requiredPositiveInteger('DAILY_ACTIVITY_DEMO_COMPANY_ID');
  const employeeId = requiredPositiveInteger('DAILY_ACTIVITY_DEMO_EMPLOYEE_ID');
  const activityDate = process.env.DAILY_ACTIVITY_DEMO_DATE;
  if (activityDate && !/^\d{4}-\d{2}-\d{2}$/.test(activityDate)) {
    throw new Error('DAILY_ACTIVITY_DEMO_DATE must use YYYY-MM-DD format.');
  }

  await AppDataSource.initialize();
  try {
    const result = await seedDailyActivityUatDemo(AppDataSource, {
      companyId,
      employeeId,
      ...(activityDate ? { activityDate } : {}),
    });
    console.log('[DailyActivityUatDemoSeed]', JSON.stringify(result));
  } finally {
    await AppDataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  console.error(
    '[DailyActivityUatDemoSeed] Failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});

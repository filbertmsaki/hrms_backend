import { AppDataSource } from '../data-source';
import { seedFieldVisitUatDemo } from './field-visit-uat-demo.seed';

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
      'Field Visit demo seeding requires APP_ENV=uat and a DB_NAME containing "uat" that does not contain "prod".',
    );
  }
  if (process.env.FIELD_VISIT_DEMO_CONFIRM !== 'YES') {
    throw new Error(
      'Set FIELD_VISIT_DEMO_CONFIRM=YES to confirm demo seeding.',
    );
  }

  const companyId = requiredPositiveInteger('FIELD_VISIT_DEMO_COMPANY_ID');
  const employeeId = requiredPositiveInteger('FIELD_VISIT_DEMO_EMPLOYEE_ID');
  const visitDate = process.env.FIELD_VISIT_DEMO_DATE;
  if (visitDate && !/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) {
    throw new Error('FIELD_VISIT_DEMO_DATE must use YYYY-MM-DD format.');
  }

  await AppDataSource.initialize();
  try {
    const result = await seedFieldVisitUatDemo(AppDataSource, {
      companyId,
      employeeId,
      ...(visitDate ? { visitDate } : {}),
    });
    console.log('[FieldVisitUatDemoSeed]', JSON.stringify(result));
  } finally {
    await AppDataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  console.error(
    '[FieldVisitUatDemoSeed] Failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});

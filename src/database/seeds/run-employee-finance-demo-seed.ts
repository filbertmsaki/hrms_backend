import { AppDataSource } from '../data-source';
import { seedEmployeeFinanceDemo } from './employee-finance-demo.seed';

async function run() {
  const environment = (process.env.APP_ENV ?? process.env.NODE_ENV ?? '')
    .trim()
    .toLowerCase();
  const database = (process.env.DB_NAME ?? '').trim().toLowerCase();
  if (
    !['development', 'test', 'uat'].includes(environment) ||
    [process.env.APP_ENV, process.env.NODE_ENV].some(
      (value) => value?.trim().toLowerCase() === 'production',
    ) ||
    !database ||
    !/(test|uat|demo)/.test(database) ||
    database.includes('prod') ||
    process.env.EMPLOYEE_FINANCE_DEMO_CONFIRM !== 'YES' ||
    !process.env.EMPLOYEE_FINANCE_DEMO_COMPANY_SLUG?.trim()
  ) {
    throw new Error(
      'Finance demo requires a development/test/UAT environment, an isolated test/UAT/demo database name, an explicit company slug and EMPLOYEE_FINANCE_DEMO_CONFIRM=YES.',
    );
  }
  await AppDataSource.initialize();
  try {
    const result = await seedEmployeeFinanceDemo(AppDataSource);
    console.log('[EmployeeFinanceDemoSeed]', JSON.stringify(result));
  } finally {
    await AppDataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  console.error('[EmployeeFinanceDemoSeed] Failed:', error);
  process.exitCode = 1;
});

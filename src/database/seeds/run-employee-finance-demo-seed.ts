import { AppDataSource } from '../data-source';
import { seedEmployeeFinanceDemo } from './employee-finance-demo.seed';

async function run() {
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

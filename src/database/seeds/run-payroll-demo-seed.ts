import { AppDataSource } from '../data-source';
import { seedPayrollDemo } from './payroll-demo.seed';

async function run() {
  if (process.env.PAYROLL_DEMO_SEED_CONFIRM !== 'YES') {
    throw new Error(
      'Set PAYROLL_DEMO_SEED_CONFIRM=YES to create/update the isolated synthetic payroll demo tenant.',
    );
  }
  await AppDataSource.initialize();
  try {
    const result = await seedPayrollDemo(AppDataSource);
    console.log(
      '[PayrollDemoSeed] Save these one-time passwords now; accounts require a password change at first login.',
    );
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await AppDataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  console.error(
    '[PayrollDemoSeed] Failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});

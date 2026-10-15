import { runSeeders } from 'typeorm-extension';
import { AppDataSource } from '../data-source';
import PayrollBaselineSeeder from './038-payroll-baseline.seed';

async function bootstrap() {
  await AppDataSource.initialize();
  try {
    await runSeeders(AppDataSource, { seeds: [PayrollBaselineSeeder] });
  } finally {
    await AppDataSource.destroy();
  }
}

bootstrap().catch((error: unknown) => {
  console.error('Payroll baseline setup failed.', error);
  process.exit(1);
});

import { AppDataSource } from '../data-source';
import AllianceEmployeesSeeder from './045-alliance-employees.seed';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await new AllianceEmployeesSeeder().run(AppDataSource, undefined as never);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('[Seeder][AllianceEmployees] Failed:', error);
  process.exitCode = 1;
});

import { AppDataSource } from '../data-source';
import AttendancePolicySeeder from './018a-attendance-policy.seed';

async function main(): Promise<void> {
  await AppDataSource.initialize();
  try {
    await new AttendancePolicySeeder().run(AppDataSource, undefined as never);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('[Seeder][AttendancePolicy] Failed:', error);
  process.exitCode = 1;
});

import { DataSource } from 'typeorm';
import { createAppDataSourceOptions } from '../../../../database/typeorm-options';
import { loadCommandEnv } from '../../../../database/load-command-env';
import { Phase2ScorecardsDevelopmentOnly1793900001000 } from './phase2-scorecards.dev-migration';

async function main() {
  const env = loadCommandEnv(process.env);
  if (
    !['hrms_kpi_dev_test', 'hrms_kpi_app_dev'].includes(env.DB_NAME ?? '') ||
    !['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST ?? 'localhost')
  )
    throw new Error(
      'Phase 2 migration requires an approved local KPI development database',
    );
  const db = new DataSource({
    ...createAppDataSourceOptions(env),
    migrations: [Phase2ScorecardsDevelopmentOnly1793900001000],
    migrationsRun: false,
  });
  await db.initialize();
  try {
    console.log((await db.runMigrations()).map((migration) => migration.name));
  } finally {
    await db.destroy();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

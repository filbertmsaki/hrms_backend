import { DataSource } from 'typeorm';
import { createAppDataSourceOptions } from '../../../../database/typeorm-options';
import { loadCommandEnv } from '../../../../database/load-command-env';
import { Phase1aKpiDevelopmentOnly1793900000000 } from './phase1a-kpi.dev-migration';

async function main() {
  const dbName = process.env.DB_NAME;
  const host = process.env.DB_HOST ?? 'localhost';
  if (
    !['hrms_kpi_dev_test', 'hrms_kpi_app_dev'].includes(dbName ?? '') ||
    !['localhost', '127.0.0.1', '::1'].includes(host)
  ) {
    throw new Error(
      'KPI development migration requires an approved disposable local KPI database',
    );
  }
  const db = new DataSource({
    ...createAppDataSourceOptions(loadCommandEnv(process.env)),
    migrations: [Phase1aKpiDevelopmentOnly1793900000000],
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

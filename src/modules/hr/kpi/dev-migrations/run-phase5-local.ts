import { DataSource } from 'typeorm';
import { execFileSync } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { createAppDataSourceOptions } from '../../../../database/typeorm-options';
import { loadCommandEnv } from '../../../../database/load-command-env';
import { Phase5AchievementActivitiesDevelopmentOnly1798000000000 } from './phase5-achievement-activities.dev-migration';
import { Phase5bActivityEvidenceScopeDevelopmentOnly1798000001000 } from './phase5b-activity-evidence-scope.dev-migration';

async function main() {
  const env = loadCommandEnv(process.env);
  const databaseName = env.DB_NAME ?? '';
  const isDisposable = ['hrms_kpi_dev_test', 'hrms_kpi_app_dev'].includes(
    databaseName,
  );
  let verifiedBackup: string | undefined;
  if (databaseName === 'hrms_db') {
    const backupArg = process.argv[2];
    const backupRoot = '/home/innocent/.local/share/hrms-backups';
    if (!backupArg) {
      throw new Error('A verified private hrms_db backup path is required');
    }
    verifiedBackup = realpathSync(backupArg);
    if (
      resolve(verifiedBackup) !==
        resolve(backupRoot, basename(verifiedBackup)) ||
      !basename(verifiedBackup).startsWith('hrms_db-') ||
      !basename(verifiedBackup).endsWith('.dump') ||
      (statSync(verifiedBackup).mode & 0o077) !== 0
    ) {
      throw new Error(
        'Main database backup must be a private approved hrms_db archive',
      );
    }
    const listing = execFileSync('pg_restore', ['--list', verifiedBackup], {
      encoding: 'utf8',
    });
    if (!listing.includes('TABLE DATA')) {
      throw new Error(
        'The supplied backup archive did not pass pg_restore verification',
      );
    }
  }
  if (
    (!isDisposable && databaseName !== 'hrms_db') ||
    !['localhost', '127.0.0.1', '::1'].includes(env.DB_HOST ?? 'localhost')
  ) {
    throw new Error(
      'KPI activity migration is limited to an approved disposable local KPI database',
    );
  }
  const db = new DataSource({
    ...createAppDataSourceOptions(env),
    migrations: [
      Phase5AchievementActivitiesDevelopmentOnly1798000000000,
      Phase5bActivityEvidenceScopeDevelopmentOnly1798000001000,
    ],
    migrationsRun: false,
  });
  await db.initialize();
  try {
    console.log(
      JSON.stringify({
        database: databaseName,
        verifiedBackup,
        migrations: (await db.runMigrations()).map(
          (migration) => migration.name,
        ),
      }),
    );
  } finally {
    await db.destroy();
  }
}
void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

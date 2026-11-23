import { AppDataSource } from './data-source';
import { DataSource } from 'typeorm';
import { inspectPermissionMigration } from './migration-helpers/canonical-permissions';

async function main() {
  const options = AppDataSource.options;
  if (options.type !== 'postgres')
    throw new Error('The RBAC preflight requires PostgreSQL');
  const connection = new DataSource({
    ...options,
    installExtensions: false,
    logging: false,
    synchronize: false,
    migrationsRun: false,
  });
  await connection.initialize();
  const runner = connection.createQueryRunner();
  try {
    await runner.startTransaction('REPEATABLE READ');
    await runner.query('SET TRANSACTION READ ONLY');
    const plan = await inspectPermissionMigration(runner);
    console.log(
      JSON.stringify(
        {
          database: AppDataSource.options.database,
          definitions: plan.definitions,
          rename: plan.changes.filter((change) => !change.target).length,
          merge: plan.changes.filter((change) => change.target).length,
          conflicts: plan.conflicts,
        },
        null,
        2,
      ),
    );
    if (plan.conflicts.length) process.exitCode = 1;
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await connection.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

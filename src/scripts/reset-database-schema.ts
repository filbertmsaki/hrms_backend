import { AppDataSource } from '../database/data-source';

async function main() {
  if (!process.argv.includes('--yes')) {
    throw new Error(
      'Refusing to reset the database schema without --yes confirmation.',
    );
  }

  await AppDataSource.initialize();

  try {
    // Migrations recreate both application schemas from an empty database state.
    await AppDataSource.query('DROP SCHEMA IF EXISTS analytics CASCADE');
    await AppDataSource.query('DROP SCHEMA IF EXISTS public CASCADE');
    await AppDataSource.query('CREATE SCHEMA public');
  } finally {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error ? (error.stack ?? error.message) : error,
  );
  process.exit(1);
});

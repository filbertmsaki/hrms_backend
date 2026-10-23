import { AppDataSource } from '../data-source';
import ActivityCategoriesSeeder from './activity-categories.seed';

async function run() {
  const appEnv = (process.env.APP_ENV ?? '').trim().toLowerCase();
  const database = (process.env.DB_NAME ?? '').trim().toLowerCase();
  if (
    !['test', 'uat'].includes(appEnv) ||
    database !== 'hrms_module8_uat_test_db' ||
    process.env.MODULE8_ACTIVITY_CATEGORIES_CONFIRM !== 'YES'
  ) {
    throw new Error(
      'Module 8 category seeding requires APP_ENV=test|uat, DB_NAME=hrms_module8_uat_test_db, and MODULE8_ACTIVITY_CATEGORIES_CONFIRM=YES.',
    );
  }

  await AppDataSource.initialize();
  try {
    await new ActivityCategoriesSeeder().run(AppDataSource);
    console.log('[Module8ActivityCategories] Repeatable seed completed.');
  } finally {
    await AppDataSource.destroy();
  }
}

void run().catch((error: unknown) => {
  console.error(
    '[Module8ActivityCategories] Failed:',
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});

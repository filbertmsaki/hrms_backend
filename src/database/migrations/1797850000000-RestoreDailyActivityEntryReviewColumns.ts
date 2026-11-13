import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Activity review fields lived in the removed employee-KPI workflow migration.
 * Daily activities still read and write them, so fresh databases need the
 * columns without restoring employee_kpis or performance_periods.
 * ADD COLUMN IF NOT EXISTS keeps databases that already applied 1789300000000.
 */
export class RestoreDailyActivityEntryReviewColumns1797850000000 implements MigrationInterface {
  name = 'RestoreDailyActivityEntryReviewColumns1797850000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "expected_result" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "due_date" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "completion_date" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "origin" varchar(30) NOT NULL DEFAULT 'SELF_CREATED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "review_status" varchar(30) NOT NULL DEFAULT 'NOT_REQUIRED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "reviewed_by_company_user_id" integer`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_daily_activity_entry_review_due" ON "daily_activity_entries" ("review_status", "due_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_daily_activity_entry_review_due"`,
    );
    for (const column of [
      'reviewed_by_company_user_id',
      'reviewed_at',
      'review_status',
      'origin',
      'completion_date',
      'due_date',
      'expected_result',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "daily_activity_entries" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
  }
}

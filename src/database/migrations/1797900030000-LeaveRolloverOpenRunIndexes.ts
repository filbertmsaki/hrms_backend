import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the single COALESCE-based "one open rollover run" index (which
 * TypeORM cannot declare, so it showed as schema drift) with two partial
 * unique indexes that the LeaveRolloverRun entity declares:
 * - company-wide runs (leave_type_id IS NULL);
 * - per-leave-type runs.
 * Same rule as before: one open run per company, year and scope.
 */
const OPEN = `"status" NOT IN ('cancelled', 'failed', 'completed', 'partially_failed')`;

export class LeaveRolloverOpenRunIndexes1797900030000 implements MigrationInterface {
  name = 'LeaveRolloverOpenRunIndexes1797900030000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "UQ_leave_rollover_open_run"`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_leave_rollover_open_run_all" ON "leave_rollover_runs" ("company_id", "from_leave_year") WHERE "leave_type_id" IS NULL AND ${OPEN}`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_leave_rollover_open_run_type" ON "leave_rollover_runs" ("company_id", "from_leave_year", "leave_type_id") WHERE "leave_type_id" IS NOT NULL AND ${OPEN}`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "UQ_leave_rollover_open_run_type"`);
    await q.query(`DROP INDEX IF EXISTS "UQ_leave_rollover_open_run_all"`);
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_leave_rollover_open_run"
        ON "leave_rollover_runs" ("company_id", "from_leave_year", COALESCE("leave_type_id", 0))
        WHERE ${OPEN}
    `);
  }
}

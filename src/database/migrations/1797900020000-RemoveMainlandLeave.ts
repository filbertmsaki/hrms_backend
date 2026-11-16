import { MigrationInterface, QueryRunner } from 'typeorm';
import { LeavePolicyDraftRevisions1797900011000 } from './1797900011000-LeavePolicyDraftRevisions';
import { LeaveEmployeeProfiles1797900012000 } from './1797900012000-LeaveEmployeeProfiles';
import { LeavePolicyRevisionsAssignments1797900013000 } from './1797900013000-LeavePolicyRevisionsAssignments';
import { LeaveMainlandLedger1797900014000 } from './1797900014000-LeaveMainlandLedger';
import { LeaveLifeEventsOverrides1797900015000 } from './1797900015000-LeaveLifeEventsOverrides';
import { LeaveCutoverSnapshots1797900016000 } from './1797900016000-LeaveCutoverSnapshots';
import { LeaveCycleJobRuns1797900017000 } from './1797900017000-LeaveCycleJobRuns';

/**
 * The Mainland Tanzania leave engine was removed; every employee uses the
 * regular leave policies. Drops its tables, trigger functions and the two
 * columns only it used. The holiday `is_provisional` flag stays (regular
 * holiday API uses it).
 */
export class RemoveMainlandLeave1797900020000 implements MigrationInterface {
  name = 'RemoveMainlandLeave1797900020000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "leave_life_event_id"',
    );
    await q.query(
      'DROP INDEX IF EXISTS "UQ_attendance_holidays_company_seed_key"',
    );
    await q.query(
      'ALTER TABLE "attendance_holidays" DROP COLUMN IF EXISTS "seed_key", DROP COLUMN IF EXISTS "jurisdiction"',
    );
    // CASCADE removes the triggers and cross-table foreign keys with them.
    for (const table of [
      'leave_cutover_rows',
      'leave_policy_assignments',
      'leave_cutover_snapshots',
      'leave_policy_revisions',
      'leave_ledger_entries',
      'leave_rule_overrides',
      'leave_life_events',
      'leave_notification_log',
      'leave_cycle_job_runs',
      'leave_employee_profiles',
      'leave_policy_draft_revisions',
    ]) {
      await q.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
    }
    for (const fn of [
      'leave_policy_revision_guard',
      'leave_ledger_append_only',
      'leave_cutover_row_guard',
      'leave_cutover_snapshot_guard',
    ]) {
      await q.query(`DROP FUNCTION IF EXISTS ${fn}() CASCADE`);
    }
  }

  /** Recreates the empty schema exactly as the original migrations built it. */
  async down(q: QueryRunner): Promise<void> {
    await new LeavePolicyDraftRevisions1797900011000().up(q);
    await new LeaveEmployeeProfiles1797900012000().up(q);
    await new LeavePolicyRevisionsAssignments1797900013000().up(q);
    await new LeaveMainlandLedger1797900014000().up(q);
    await new LeaveLifeEventsOverrides1797900015000().up(q);
    await new LeaveCutoverSnapshots1797900016000().up(q);
    await new LeaveCycleJobRuns1797900017000().up(q);
    await q.query(`ALTER TABLE "attendance_holidays"
      ADD COLUMN "jurisdiction" varchar(20) NULL CHECK ("jurisdiction" IS NULL OR "jurisdiction" IN ('mainland','zanzibar')),
      ADD COLUMN "seed_key" varchar(100) NULL`);
    await q.query(
      `CREATE UNIQUE INDEX "UQ_attendance_holidays_company_seed_key" ON "attendance_holidays" ("company_id", "seed_key") WHERE "seed_key" IS NOT NULL`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveRepeatedEscalation1797900006000 implements MigrationInterface {
  name = 'LeaveRepeatedEscalation1797900006000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE leave_approval_workflows
      ADD COLUMN IF NOT EXISTS max_escalations int NOT NULL DEFAULT 1
      CHECK (max_escalations BETWEEN 1 AND 5)`);
    await q.query(`ALTER TABLE leave_requests
      ADD COLUMN IF NOT EXISTS stage_escalation_count int NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS stage_overdue_flagged_at timestamp NULL`);
    // Requests already escalated under the old once-per-stage rule.
    await q.query(`UPDATE leave_requests SET stage_escalation_count = 1
      WHERE stage_escalated_at IS NOT NULL AND stage_escalation_count = 0`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE leave_requests
      DROP COLUMN IF EXISTS stage_overdue_flagged_at,
      DROP COLUMN IF EXISTS stage_escalation_count`);
    await q.query(
      `ALTER TABLE leave_approval_workflows DROP COLUMN IF EXISTS max_escalations`,
    );
  }
}

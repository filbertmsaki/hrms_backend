import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveTypeAutoApproval1797900007000 implements MigrationInterface {
  name = 'LeaveTypeAutoApproval1797900007000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE leave_types
      ADD COLUMN IF NOT EXISTS auto_approve_after_days int NULL
      CHECK (auto_approve_after_days IS NULL OR auto_approve_after_days BETWEEN 1 AND 90)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE leave_types DROP COLUMN IF EXISTS auto_approve_after_days`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveAttachmentDayThreshold1797900005000 implements MigrationInterface {
  name = 'LeaveAttachmentDayThreshold1797900005000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE leave_types
      ADD COLUMN IF NOT EXISTS attachment_required_after_days numeric(5,1) NULL
      CHECK (attachment_required_after_days IS NULL OR attachment_required_after_days >= 0)`);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE leave_types DROP COLUMN IF EXISTS attachment_required_after_days`,
    );
  }
}

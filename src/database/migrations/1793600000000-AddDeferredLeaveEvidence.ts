import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeferredLeaveEvidence1793600000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE leave_types
      ADD COLUMN allow_deferred_attachment boolean NOT NULL DEFAULT false,
      ADD COLUMN attachment_grace_days integer NOT NULL DEFAULT 3 CHECK (attachment_grace_days BETWEEN 1 AND 365)`);
    await q.query(`ALTER TABLE leave_requests
      ADD COLUMN evidence_required boolean,
      ADD COLUMN evidence_due_at timestamptz,
      ADD COLUMN evidence_received_at timestamptz,
      ADD COLUMN evidence_last_reminder_at timestamptz,
      ADD COLUMN routing_required boolean NOT NULL DEFAULT false`);
    await q.query(`CREATE INDEX IDX_leave_evidence_due ON leave_requests (evidence_due_at)
      WHERE evidence_required = true AND evidence_received_at IS NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX IDX_leave_evidence_due');
    await q.query(`ALTER TABLE leave_requests DROP COLUMN evidence_required,
      DROP COLUMN evidence_due_at, DROP COLUMN evidence_received_at,
      DROP COLUMN evidence_last_reminder_at, DROP COLUMN routing_required`);
    await q.query(
      'ALTER TABLE leave_types DROP COLUMN allow_deferred_attachment, DROP COLUMN attachment_grace_days',
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Public QR verification for leave PDFs: a random token per leave request,
 * issued on first PDF download. Unique so a lookup hits one row.
 */
export class LeaveRequestVerificationToken1797900021000 implements MigrationInterface {
  name = 'LeaveRequestVerificationToken1797900021000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      'ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "verification_token" character varying(64)',
    );
    await q.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_leave_request_verification_token" ON "leave_requests" ("verification_token")',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP INDEX IF EXISTS "UQ_leave_request_verification_token"');
    await q.query(
      'ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "verification_token"',
    );
  }
}

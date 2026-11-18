import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Leave signatures carry the signature itself: a typed name or a drawn
 * image (PNG, max ~200 KB), so the leave application form shows it.
 * Existing rows keep NULL (confirmation-only signatures).
 */
export class LeaveSignatureMarks1797900036000 implements MigrationInterface {
  name = 'LeaveSignatureMarks1797900036000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "leave_signatures"
      ADD COLUMN IF NOT EXISTS "signature_kind" varchar(10) NULL,
      ADD COLUMN IF NOT EXISTS "signature_text" varchar(100) NULL,
      ADD COLUMN IF NOT EXISTS "signature_png" bytea NULL`);
    await q.query(`ALTER TABLE "leave_signatures"
      ADD CONSTRAINT "CHK_leave_signature_kind"
      CHECK ("signature_kind" IS NULL OR "signature_kind" IN ('TYPED', 'DRAWN'))`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "leave_signatures" DROP CONSTRAINT IF EXISTS "CHK_leave_signature_kind"`,
    );
    await q.query(`ALTER TABLE "leave_signatures"
      DROP COLUMN IF EXISTS "signature_png",
      DROP COLUMN IF EXISTS "signature_text",
      DROP COLUMN IF EXISTS "signature_kind"`);
  }
}

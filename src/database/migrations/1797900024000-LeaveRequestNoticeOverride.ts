import { MigrationInterface, QueryRunner } from 'typeorm';

/** Records when HR files future leave inside the policy notice period. */
export class LeaveRequestNoticeOverride1797900024000 implements MigrationInterface {
  name = 'LeaveRequestNoticeOverride1797900024000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "leave_requests"
        ADD COLUMN IF NOT EXISTS "notice_override_reason" text,
        ADD COLUMN IF NOT EXISTS "notice_overridden_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "notice_overridden_by_company_user_id" integer
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "leave_requests"
        DROP COLUMN IF EXISTS "notice_overridden_by_company_user_id",
        DROP COLUMN IF EXISTS "notice_overridden_at",
        DROP COLUMN IF EXISTS "notice_override_reason"
    `);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

const REQUEST_TABLES = [
  'attendance_correction_requests',
  'employee_profile_update_requests',
];

export class AddSelfServiceTwoStageApproval1797100000000 implements MigrationInterface {
  name = 'AddSelfServiceTwoStageApproval1797100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of REQUEST_TABLES) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "manager_reviewed_by_company_user_id" int NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "manager_reviewed_at" timestamp NULL`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "manager_review_comment" text NULL`,
      );
      // Legacy single-step requests enter the manager stage; HR may still
      // finalize them directly.
      await queryRunner.query(
        `UPDATE "${table}" SET "status" = 'pending_manager_approval' WHERE "status" = 'submitted'`,
      );
    }
    await queryRunner.query(
      'ALTER TABLE "attendance_correction_requests" ADD COLUMN IF NOT EXISTS "original_snapshot" json NULL',
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "self_service_request_approvals" (
        "id" SERIAL PRIMARY KEY,
        "company_id" int NOT NULL,
        "request_kind" varchar(40) NOT NULL,
        "request_id" int NOT NULL,
        "stage" varchar(20) NOT NULL,
        "action" varchar(40) NOT NULL,
        "from_status" varchar(30) NULL,
        "to_status" varchar(30) NOT NULL,
        "actor_company_user_id" int NULL,
        "actor_employee_id" int NULL,
        "comment" text NULL,
        "metadata" json NULL,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_self_service_request_approval_request" ON "self_service_request_approvals" ("company_id", "request_kind", "request_id")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "self_service_request_approvals"',
    );
    await queryRunner.query(
      'ALTER TABLE "attendance_correction_requests" DROP COLUMN IF EXISTS "original_snapshot"',
    );
    for (const table of REQUEST_TABLES) {
      await queryRunner.query(
        `UPDATE "${table}" SET "status" = 'submitted' WHERE "status" IN ('pending_manager_approval', 'pending_hr_approval')`,
      );
      await queryRunner.query(
        `UPDATE "${table}" SET "status" = 'draft' WHERE "status" = 'returned_for_correction'`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "manager_review_comment"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "manager_reviewed_at"`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP COLUMN IF EXISTS "manager_reviewed_by_company_user_id"`,
      );
    }
  }
}

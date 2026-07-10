import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDepartmentManagerAndLeaveApprovalCycle1786103000000
  implements MigrationInterface
{
  name = 'AddDepartmentManagerAndLeaveApprovalCycle1786103000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "departments"
      ADD COLUMN IF NOT EXISTS "manager_employee_id" integer NULL
    `);
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_department_manager_employee'
        ) THEN
          ALTER TABLE "departments"
          ADD CONSTRAINT "FK_department_manager_employee"
          FOREIGN KEY ("manager_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_department_manager_employee"
      ON "departments" ("manager_employee_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      ADD COLUMN IF NOT EXISTS "approval_cycle" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      ADD COLUMN IF NOT EXISTS "returned_at" TIMESTAMP NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      ADD COLUMN IF NOT EXISTS "return_reason" text NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_request_approvals"
      ADD COLUMN IF NOT EXISTS "approval_cycle" integer NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_request_approvals"
      ADD COLUMN IF NOT EXISTS "action" character varying(30) NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_leave_request_approval_cycle_level_approver"
      ON "leave_request_approvals" ("leave_request_id", "approval_cycle", "approval_level", "approver_company_user_id")
      WHERE "approver_company_user_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_leave_request_approval_cycle_level_approver"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_request_approvals" DROP COLUMN IF EXISTS "action"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_request_approvals" DROP COLUMN IF EXISTS "approval_cycle"
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "return_reason"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "returned_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "approval_cycle"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_department_manager_employee"
    `);
    await queryRunner.query(`
      ALTER TABLE "departments" DROP CONSTRAINT IF EXISTS "FK_department_manager_employee"
    `);
    await queryRunner.query(`
      ALTER TABLE "departments" DROP COLUMN IF EXISTS "manager_employee_id"
    `);
  }
}

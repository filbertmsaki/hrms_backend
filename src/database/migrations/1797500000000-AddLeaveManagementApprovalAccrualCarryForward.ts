import { MigrationInterface, QueryRunner } from 'typeorm';

const POLICY_TYPE_COLUMNS: Array<[string, string]> = [
  ['accrual_method', 'varchar(20) NULL'],
  ['carry_forward_enabled', 'boolean NULL'],
  ['carry_forward_max_days', 'numeric(8,2) NULL'],
  ['carry_forward_expiry_months', 'int NULL'],
  ['carry_forward_expiry_date', 'varchar(5) NULL'],
  ['carry_forward_auto_expire', 'boolean NOT NULL DEFAULT true'],
  ['carry_forward_consume_first', 'boolean NOT NULL DEFAULT true'],
];

/**
 * Leave Phase 3: conditional management approval rules, daily pro-rata
 * accrual, and HR-configurable carry-forward with expiry.
 */
export class AddLeaveManagementApprovalAccrualCarryForward1797500000000 implements MigrationInterface {
  name = 'AddLeaveManagementApprovalAccrualCarryForward1797500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Not used in this migration, so it is safe inside the shared transaction.
    await queryRunner.query(
      `ALTER TYPE "public"."leave_policies_accrual_method_enum" ADD VALUE IF NOT EXISTS 'daily'`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leave_management_approval_rules" (
        "id" SERIAL PRIMARY KEY,
        "company_id" int NOT NULL,
        "name" varchar(150) NOT NULL,
        "description" text NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "leave_type_ids" json NULL,
        "min_total_days" numeric(8,2) NULL,
        "position_ids" json NULL,
        "grade_ids" json NULL,
        "department_ids" json NULL,
        "approver_type" varchar(20) NOT NULL,
        "role_id" int NULL,
        "position_id" int NULL,
        "company_user_id" int NULL,
        "created_by_company_user_id" int NULL,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_leave_management_rule_company" ON "leave_management_approval_rules" ("company_id", "status")',
    );

    for (const [column, definition] of POLICY_TYPE_COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "leave_policy_types" ADD COLUMN IF NOT EXISTS "${column}" ${definition}`,
      );
    }

    // max_carry_forward_days: null now means "no cap" and 0 means "none".
    // Existing 0 caps meant unlimited, so keep that behaviour explicitly.
    await queryRunner.query(
      'ALTER TABLE "leave_types" ALTER COLUMN "max_carry_forward_days" DROP NOT NULL',
    );
    await queryRunner.query(
      `UPDATE "leave_types" SET "max_carry_forward_days" = NULL
       WHERE "is_carry_forward_allowed" = true AND "max_carry_forward_days" = 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE "leave_types" SET "max_carry_forward_days" = 0 WHERE "max_carry_forward_days" IS NULL`,
    );
    await queryRunner.query(
      'ALTER TABLE "leave_types" ALTER COLUMN "max_carry_forward_days" SET NOT NULL',
    );
    for (const [column] of POLICY_TYPE_COLUMNS) {
      await queryRunner.query(
        `ALTER TABLE "leave_policy_types" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
    await queryRunner.query(
      'DROP TABLE IF EXISTS "leave_management_approval_rules"',
    );
    // Postgres cannot drop an enum value; policies using 'daily' fall back to
    // the column default only if HR changes them.
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-workflow reminder/escalation settings, per-request stage timing and
 * approver out-of-office delegations.
 * Requests already pending start their stage clock at submission.
 */
export class AddLeaveApprovalRemindersEscalation1797600000000 implements MigrationInterface {
  name = 'AddLeaveApprovalRemindersEscalation1797600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "leave_approval_workflows" ADD COLUMN IF NOT EXISTS "reminder_after_days" int NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "leave_approval_workflows" ADD COLUMN IF NOT EXISTS "escalate_after_days" int NULL',
    );
    for (const column of [
      'stage_entered_at',
      'stage_reminded_at',
      'stage_escalated_at',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "${column}" timestamp NULL`,
      );
    }
    await queryRunner.query(
      `UPDATE "leave_requests" SET "stage_entered_at" = COALESCE("applied_at", "updated_at")
       WHERE "stage_entered_at" IS NULL
         AND "status" IN ('pending_department_manager', 'pending_hr', 'in_review')`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leave_approval_delegations" (
        "id" SERIAL PRIMARY KEY,
        "company_id" int NOT NULL,
        "delegator_company_user_id" int NOT NULL,
        "delegate_company_user_id" int NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "reason" varchar(500) NULL,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "created_by_company_user_id" int NULL,
        "created_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "sandwich_rule" boolean NOT NULL DEFAULT false',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_leave_delegation_delegator" ON "leave_approval_delegations" ("company_id", "delegator_company_user_id", "status")',
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leave_exit_settlements" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "leave_type_id" integer NOT NULL,
        "offboarding_request_id" integer,
        "exit_date" date NOT NULL,
        "earned_to_exit_days" numeric(8,2) NOT NULL,
        "carried_forward_days" numeric(8,2) NOT NULL,
        "adjusted_days" numeric(8,2) NOT NULL,
        "used_days" numeric(8,2) NOT NULL,
        "deducted_days" numeric(8,2) NOT NULL,
        "settlement_days" numeric(8,2) NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending_payroll',
        "details" json,
        "created_by_company_user_id" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_leave_exit_settlement" UNIQUE ("company_id", "employee_id", "leave_type_id", "exit_date")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_leave_exit_settlement_employee" ON "leave_exit_settlements" ("company_id", "employee_id")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "leave_exit_settlements"');
    await queryRunner.query(
      'DROP TABLE IF EXISTS "leave_approval_delegations"',
    );
    await queryRunner.query(
      'ALTER TABLE "leave_types" DROP COLUMN IF EXISTS "sandwich_rule"',
    );
    for (const column of [
      'stage_escalated_at',
      'stage_reminded_at',
      'stage_entered_at',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
    await queryRunner.query(
      'ALTER TABLE "leave_approval_workflows" DROP COLUMN IF EXISTS "escalate_after_days"',
    );
    await queryRunner.query(
      'ALTER TABLE "leave_approval_workflows" DROP COLUMN IF EXISTS "reminder_after_days"',
    );
  }
}

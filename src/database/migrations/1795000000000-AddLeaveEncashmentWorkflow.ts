import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeaveEncashmentWorkflow1795000000000 implements MigrationInterface {
  name = 'AddLeaveEncashmentWorkflow1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."leave_balance_transaction_type_enum" ADD VALUE IF NOT EXISTS 'ENCASHMENT'`,
    );
    await queryRunner.query(`
      CREATE TABLE "leave_encashment_requests" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "leave_type_id" integer NOT NULL,
        "leave_balance_id" integer NOT NULL,
        "fiscal_year" character varying(20) NOT NULL,
        "requested_days" numeric(8,2) NOT NULL,
        "approved_days" numeric(8,2),
        "minimum_balance_after_encashment" numeric(8,2) NOT NULL,
        "reason" text NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'pending',
        "reviewer_comments" text,
        "reviewed_by_company_user_id" integer,
        "created_by_company_user_id" integer,
        "ledger_transaction_id" integer,
        "payroll_handoff_reference" character varying(120),
        "payroll_handed_off_at" TIMESTAMP,
        "payroll_handed_off_by_company_user_id" integer,
        "reviewed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_encashment_requests" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_leave_encashment_ledger_transaction" UNIQUE ("ledger_transaction_id"),
        CONSTRAINT "FK_leave_encashment_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_leave_encashment_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_leave_encashment_type" FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_leave_encashment_balance" FOREIGN KEY ("leave_balance_id") REFERENCES "leave_balances"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_leave_encashment_transaction" FOREIGN KEY ("ledger_transaction_id") REFERENCES "leave_balance_transactions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_leave_encashment_reviewer" FOREIGN KEY ("reviewed_by_company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_leave_encashment_creator" FOREIGN KEY ("created_by_company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_leave_encashment_payroll_actor" FOREIGN KEY ("payroll_handed_off_by_company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_leave_encashment_status" CHECK ("status" IN ('pending', 'approved', 'rejected', 'cancelled')),
        CONSTRAINT "CHK_leave_encashment_requested_days" CHECK ("requested_days" > 0),
        CONSTRAINT "CHK_leave_encashment_approved_days" CHECK ("approved_days" IS NULL OR "approved_days" > 0)
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_leave_encashment_company_status" ON "leave_encashment_requests" ("company_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_leave_encashment_employee_year" ON "leave_encashment_requests" ("employee_id", "leave_type_id", "fiscal_year")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_leave_encashment_employee_year"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_leave_encashment_company_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "leave_encashment_requests"`);
    // PostgreSQL enum values are intentionally retained during rollback.
  }
}

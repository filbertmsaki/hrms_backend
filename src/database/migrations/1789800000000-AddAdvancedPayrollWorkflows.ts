import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAdvancedPayrollWorkflows1789800000000 implements MigrationInterface {
  name = 'AddAdvancedPayrollWorkflows1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."payroll_run_type_enum" ADD VALUE IF NOT EXISTS 'BONUS'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."payroll_run_type_enum" ADD VALUE IF NOT EXISTS 'ARREARS'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."payroll_run_type_enum" ADD VALUE IF NOT EXISTS 'ADJUSTMENT'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."payroll_run_status_enum" ADD VALUE IF NOT EXISTS 'CLOSED'`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payroll_groups" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "code" varchar(80) NOT NULL,
        "name" varchar(180) NOT NULL,
        "frequency" varchar(60) NOT NULL DEFAULT 'MONTHLY',
        "payroll_calendar_id" integer,
        "branch_id" integer,
        "department_id" integer,
        "employee_category" varchar(80),
        "employment_type" varchar(80),
        "currency" varchar(3) NOT NULL DEFAULT 'TZS',
        "policy" jsonb,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_groups" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payroll_group_company_code" UNIQUE ("company_id", "code")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_group_company_status"
       ON "payroll_groups" ("company_id", "status")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payroll_overtime_policies" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "code" varchar(80) NOT NULL,
        "name" varchar(180) NOT NULL,
        "component_code" varchar(80) NOT NULL DEFAULT 'OVERTIME',
        "regular_multiplier" numeric(8,4) NOT NULL DEFAULT '1.5000',
        "weekend_multiplier" numeric(8,4) NOT NULL DEFAULT '2.0000',
        "holiday_multiplier" numeric(8,4) NOT NULL DEFAULT '2.0000',
        "minimum_minutes" integer NOT NULL DEFAULT 0,
        "approval_required" boolean NOT NULL DEFAULT true,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "configuration" jsonb,
        CONSTRAINT "PK_payroll_overtime_policies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payroll_overtime_policy_company_code" UNIQUE ("company_id", "code")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_overtime_policy_company_status"
       ON "payroll_overtime_policies" ("company_id", "status")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payroll_bonus_schemes" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "code" varchar(80) NOT NULL,
        "name" varchar(180) NOT NULL,
        "scheme_type" varchar(60) NOT NULL DEFAULT 'BONUS',
        "component_code" varchar(80) NOT NULL,
        "calculation_method" varchar(60) NOT NULL DEFAULT 'FIXED_AMOUNT',
        "default_amount" numeric(18,2),
        "default_rate" numeric(12,6),
        "approval_required" boolean NOT NULL DEFAULT true,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "configuration" jsonb,
        CONSTRAINT "PK_payroll_bonus_schemes" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payroll_bonus_scheme_company_code" UNIQUE ("company_id", "code")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_bonus_scheme_company_status"
       ON "payroll_bonus_schemes" ("company_id", "status")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payroll_payment_reconciliations" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "payroll_run_id" integer NOT NULL,
        "bank_batch_id" integer,
        "payment_reference" varchar(150) NOT NULL,
        "payment_date" date NOT NULL,
        "expected_amount" numeric(20,2) NOT NULL DEFAULT '0',
        "paid_amount" numeric(20,2) NOT NULL DEFAULT '0',
        "variance_amount" numeric(20,2) NOT NULL DEFAULT '0',
        "status" varchar(30) NOT NULL DEFAULT 'MATCHED',
        "snapshot" jsonb,
        "reconciled_by_company_user_id" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_payment_reconciliations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payroll_payment_reconciliation_run_ref" UNIQUE ("company_id", "payroll_run_id", "payment_reference")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "payroll_payment_reconciliations"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payroll_bonus_scheme_company_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_bonus_schemes"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payroll_overtime_policy_company_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_overtime_policies"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payroll_group_company_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_groups"`);
  }
}

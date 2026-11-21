import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cross-run payment obligations: every earning a payroll run pays is claimed
 * here so no run type can pay the same salary amount or one-off item twice.
 * Existing runs are not backfilled; obligations start with the next
 * calculation, and runs already paid are protected by their paid status.
 */
export class PayrollPaymentObligations1797900046000 implements MigrationInterface {
  name = 'PayrollPaymentObligations1797900046000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_payment_obligations" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "payroll_period_id" integer NOT NULL,
        "component_code" character varying(80) NOT NULL,
        "obligation_kind" character varying(20) NOT NULL,
        "source_key" character varying(160) NOT NULL,
        "amount" numeric(18,2) NOT NULL,
        "entitlement_amount" numeric(18,2) NULL,
        "payroll_run_id" integer NOT NULL,
        "run_type" character varying(30) NOT NULL,
        "status" character varying(20) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_payment_obligations" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_obligation_employee_period"
       ON "payroll_payment_obligations" ("company_id", "employee_id", "payroll_period_id", "component_code")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_obligation_run"
       ON "payroll_payment_obligations" ("payroll_run_id")`,
    );
    // Database-level backstop: a one-off source can be claimed once.
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payroll_obligation_one_off_live"
       ON "payroll_payment_obligations" ("company_id", "employee_id", "payroll_period_id", "component_code", "source_key")
       WHERE "obligation_kind" = 'ONE_OFF' AND "status" <> 'RELEASED'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "payroll_payment_obligations"`,
    );
  }
}

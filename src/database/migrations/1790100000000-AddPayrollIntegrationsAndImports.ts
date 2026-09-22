import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayrollIntegrationsAndImports1790100000000 implements MigrationInterface {
  name = 'AddPayrollIntegrationsAndImports1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payroll_integration_connections" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "provider_type" varchar(40) NOT NULL,
        "provider_key" varchar(80) NOT NULL,
        "name" varchar(150) NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "configuration" jsonb,
        "credentials_ref" varchar(180),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_integration_connections" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payroll_integration_connection_key" UNIQUE ("company_id", "provider_type", "provider_key")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payroll_integration_sync_jobs" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "connection_id" integer,
        "job_type" varchar(60) NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'COMPLETED',
        "direction" varchar(20) NOT NULL DEFAULT 'IMPORT',
        "record_count" integer NOT NULL DEFAULT 0,
        "success_count" integer NOT NULL DEFAULT 0,
        "failure_count" integer NOT NULL DEFAULT 0,
        "snapshot" jsonb,
        "started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "created_by_company_user_id" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_integration_sync_jobs" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_integration_sync_job_company_type"
       ON "payroll_integration_sync_jobs" ("company_id", "job_type", "status")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payroll_integration_sync_logs" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "job_id" integer NOT NULL,
        "level" varchar(20) NOT NULL DEFAULT 'INFO',
        "message" text NOT NULL,
        "snapshot" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_integration_sync_logs" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_integration_sync_log_job"
       ON "payroll_integration_sync_logs" ("job_id", "level")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payroll_payment_imports" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "payroll_run_id" integer NOT NULL,
        "bank_batch_id" integer,
        "provider_key" varchar(80),
        "payment_reference" varchar(150) NOT NULL,
        "payment_date" date NOT NULL,
        "record_count" integer NOT NULL DEFAULT 0,
        "matched_count" integer NOT NULL DEFAULT 0,
        "partial_count" integer NOT NULL DEFAULT 0,
        "failed_count" integer NOT NULL DEFAULT 0,
        "unmatched_count" integer NOT NULL DEFAULT 0,
        "expected_amount" numeric(20,2) NOT NULL DEFAULT '0',
        "paid_amount" numeric(20,2) NOT NULL DEFAULT '0',
        "variance_amount" numeric(20,2) NOT NULL DEFAULT '0',
        "status" varchar(30) NOT NULL DEFAULT 'IMPORTED',
        "snapshot" jsonb,
        "created_by_company_user_id" integer,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_payment_imports" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_payment_import_run_status"
       ON "payroll_payment_imports" ("company_id", "payroll_run_id", "status")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payroll_payment_import_lines" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "payment_import_id" integer NOT NULL,
        "payroll_run_id" integer NOT NULL,
        "employee_id" integer,
        "employee_no" varchar(80),
        "account_number" varchar(80),
        "account_number_masked" varchar(80),
        "reference" varchar(180),
        "amount" numeric(20,2) NOT NULL DEFAULT '0',
        "expected_amount" numeric(20,2) NOT NULL DEFAULT '0',
        "variance_amount" numeric(20,2) NOT NULL DEFAULT '0',
        "match_status" varchar(30) NOT NULL,
        "payload" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_payment_import_lines" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_payment_import_line_import_status"
       ON "payroll_payment_import_lines" ("payment_import_id", "match_status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payroll_payment_import_line_import_status"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "payroll_payment_import_lines"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payroll_payment_import_run_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_payment_imports"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payroll_integration_sync_log_job"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "payroll_integration_sync_logs"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payroll_integration_sync_job_company_type"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "payroll_integration_sync_jobs"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "payroll_integration_connections"`,
    );
  }
}

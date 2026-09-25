import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHiringContractsAndApprovalFields1791000000000 implements MigrationInterface {
  name = 'AddHiringContractsAndApprovalFields1791000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "employment_contracts" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL REFERENCES "companies"("id"),
        "employee_id" integer NOT NULL REFERENCES "employees"("id"),
        "version" integer NOT NULL,
        "contract_type" varchar(30) NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date,
        "particulars" jsonb NOT NULL,
        "status" varchar(20) NOT NULL DEFAULT 'ISSUED',
        "document_id" integer REFERENCES "documents"("id"),
        "issued_by_company_user_id" integer NOT NULL,
        "signed_by_user_id" integer,
        "signed_name" varchar(200),
        "signed_ip" varchar(64),
        "signed_at" timestamptz,
        "created_at" timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_employment_contract_version" UNIQUE ("company_id", "employee_id", "version"),
        CONSTRAINT "CHK_employment_contract_dates" CHECK ("end_date" IS NULL OR "end_date" >= "start_date")
      )
    `);
    await queryRunner.query(`ALTER TABLE "statutory_rule_versions" ADD COLUMN "created_by_company_user_id" integer`);
    await queryRunner.query(`ALTER TABLE "employee_bank_accounts" ADD COLUMN "created_by_company_user_id" integer`);
    await queryRunner.query(`ALTER TABLE "payroll_audit_logs" ADD COLUMN "before_values" jsonb`);
    await queryRunner.query(`ALTER TABLE "payroll_audit_logs" ADD COLUMN "after_values" jsonb`);
    await queryRunner.query(`ALTER TABLE "payroll_audit_logs" ADD COLUMN "ip_address" varchar(64)`);
    await queryRunner.query(`ALTER TABLE "payroll_inputs" ADD COLUMN "created_by_company_user_id" integer`);
    await queryRunner.query(`ALTER TABLE "payroll_source_records" ADD COLUMN "created_by_company_user_id" integer`);
    await queryRunner.query(`CREATE TABLE "probation_letter_templates" (
      "id" SERIAL PRIMARY KEY,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "letter_type" varchar(30) NOT NULL,
      "letterhead" text NOT NULL,
      "body" text NOT NULL,
      "signatory_name" varchar(160) NOT NULL,
      "signatory_title" varchar(160) NOT NULL,
      "updated_by_company_user_id" integer NOT NULL,
      "updated_at" timestamp NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_probation_letter_template_company_type" UNIQUE ("company_id", "letter_type")
    )`);
    await queryRunner.query(`
      CREATE TABLE "employee_employment_events" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL REFERENCES "companies"("id"),
        "employee_id" integer NOT NULL REFERENCES "employees"("id"),
        "event_type" varchar(40) NOT NULL,
        "effective_date" date NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text,
        "source_module" varchar(60),
        "source_entity_type" varchar(60),
        "source_entity_id" integer,
        "old_values" jsonb,
        "new_values" jsonb,
        "dedupe_key" varchar(160),
        "created_by_company_user_id" integer,
        "ip_address" varchar(64),
        "request_id" varchar(100),
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_employee_employment_event_employee" ON "employee_employment_events" ("company_id", "employee_id", "effective_date")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_employee_employment_event_dedupe" ON "employee_employment_events" ("company_id", "dedupe_key") WHERE "dedupe_key" IS NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "employment_contracts"`);
    await queryRunner.query(`ALTER TABLE "statutory_rule_versions" DROP COLUMN "created_by_company_user_id"`);
    await queryRunner.query(`ALTER TABLE "employee_bank_accounts" DROP COLUMN "created_by_company_user_id"`);
    await queryRunner.query(`ALTER TABLE "payroll_audit_logs" DROP COLUMN "before_values"`);
    await queryRunner.query(`ALTER TABLE "payroll_audit_logs" DROP COLUMN "after_values"`);
    await queryRunner.query(`ALTER TABLE "payroll_audit_logs" DROP COLUMN "ip_address"`);
    await queryRunner.query(`ALTER TABLE "payroll_inputs" DROP COLUMN "created_by_company_user_id"`);
    await queryRunner.query(`ALTER TABLE "payroll_source_records" DROP COLUMN "created_by_company_user_id"`);
    await queryRunner.query(`DROP TABLE "probation_letter_templates"`);
    await queryRunner.query(`DROP TABLE "employee_employment_events"`);
  }
}

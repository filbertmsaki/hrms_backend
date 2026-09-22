import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeFinanceDocumentsGuarantorsSanctions1790200000000 implements MigrationInterface {
  name = 'AddEmployeeFinanceDocumentsGuarantorsSanctions1790200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "employee_finance_application_documents"
       ADD COLUMN IF NOT EXISTS "status" varchar(30) NOT NULL DEFAULT 'UPLOADED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_finance_application_documents"
       ADD COLUMN IF NOT EXISTS "verified_by_company_user_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_finance_application_documents"
       ADD COLUMN IF NOT EXISTS "verified_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_finance_application_documents"
       ADD COLUMN IF NOT EXISTS "metadata" jsonb`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "employee_finance_application_guarantors" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "application_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "guarantor_employee_id" integer NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'PENDING',
        "comments" text,
        "decided_by_company_user_id" integer,
        "decided_at" TIMESTAMP WITH TIME ZONE,
        "snapshot" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_finance_application_guarantors" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_finance_guarantor_employee" UNIQUE ("application_id", "guarantor_employee_id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "employee_finance_sanction_letters" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "application_id" integer NOT NULL,
        "account_id" integer,
        "letter_no" varchar(80) NOT NULL,
        "content" text NOT NULL,
        "snapshot" jsonb NOT NULL,
        "snapshot_hash" varchar(128) NOT NULL,
        "generated_by_company_user_id" integer,
        "generated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_finance_sanction_letters" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_finance_sanction_application" UNIQUE ("application_id")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "employee_finance_sanction_letters"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "employee_finance_application_guarantors"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_finance_application_documents"
       DROP COLUMN IF EXISTS "metadata"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_finance_application_documents"
       DROP COLUMN IF EXISTS "verified_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_finance_application_documents"
       DROP COLUMN IF EXISTS "verified_by_company_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_finance_application_documents"
       DROP COLUMN IF EXISTS "status"`,
    );
  }
}

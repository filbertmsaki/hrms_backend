import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmployeeDocumentRequirements1796400000000 implements MigrationInterface {
  name = 'CreateEmployeeDocumentRequirements1796400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "employee_document_requirements" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "document_type_code" varchar(100) NOT NULL,
        "label" varchar(160) NOT NULL,
        "applicability" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "effective_from" date NULL,
        "effective_to" date NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_by_company_user_id" integer NULL REFERENCES "company_users"("id") ON DELETE SET NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_employee_document_requirement_effective_dates"
          CHECK ("effective_to" IS NULL OR "effective_from" IS NULL OR "effective_to" >= "effective_from"),
        CONSTRAINT "UQ_employee_document_requirement_company_code"
          UNIQUE ("company_id", "document_type_code")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_employee_document_requirement_company_active" ON "employee_document_requirements" ("company_id", "is_active")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP TABLE IF EXISTS "employee_document_requirements"',
    );
  }
}

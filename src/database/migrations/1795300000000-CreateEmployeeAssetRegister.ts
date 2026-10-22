import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmployeeAssetRegister1795300000000 implements MigrationInterface {
  name = 'CreateEmployeeAssetRegister1795300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "employee_assets" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
        "asset_type" varchar(40) NOT NULL,
        "asset_label" varchar(180) NOT NULL,
        "asset_identifier" varchar(120),
        "issued_at" date NOT NULL,
        "condition_at_issue" varchar(50),
        "issued_by_company_user_id" integer REFERENCES "company_users"("id") ON DELETE SET NULL,
        "status" varchar(20) NOT NULL DEFAULT 'ACTIVE',
        "metadata" jsonb,
        "created_at" timestamp NOT NULL DEFAULT now(),
        "updated_at" timestamp NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_employee_asset_company_employee_status" ON "employee_assets" ("company_id", "employee_id", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_employee_asset_identifier" ON "employee_assets" ("company_id", "asset_identifier")',
    );
    await queryRunner.query(
      'ALTER TABLE "offboarding_asset_returns" ADD "employee_asset_id" integer REFERENCES "employee_assets"("id") ON DELETE SET NULL',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_offboarding_asset_return_source_asset" ON "offboarding_asset_returns" ("offboarding_request_id", "employee_asset_id") WHERE "employee_asset_id" IS NOT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX "public"."UQ_offboarding_asset_return_source_asset"',
    );
    await queryRunner.query(
      'ALTER TABLE "offboarding_asset_returns" DROP COLUMN "employee_asset_id"',
    );
    await queryRunner.query('DROP TABLE "employee_assets"');
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnalyticsSavedReports1790400000000
  implements MigrationInterface
{
  name = 'AddAnalyticsSavedReports1790400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "analytics"."analytics_saved_reports" (
        "id" BIGSERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "owner_company_user_id" integer NOT NULL,
        "owner_employee_id" integer,
        "department_scope_id" integer,
        "name" character varying(180) NOT NULL,
        "description" text,
        "dataset_code" character varying(100) NOT NULL,
        "selected_dimensions" jsonb NOT NULL,
        "selected_measures" jsonb NOT NULL,
        "filters" jsonb,
        "sorting" jsonb,
        "grouping" jsonb,
        "visibility" character varying(30) NOT NULL DEFAULT 'PRIVATE',
        "status" character varying(30) NOT NULL DEFAULT 'ACTIVE',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_analytics_saved_reports" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_analytics_saved_report_company_owner_name"
          UNIQUE ("company_id", "owner_company_user_id", "name")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_analytics_saved_reports_company_visibility"
        ON "analytics"."analytics_saved_reports" ("company_id", "visibility")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_analytics_saved_reports_company_dataset"
        ON "analytics"."analytics_saved_reports" ("company_id", "dataset_code")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_analytics_saved_reports_department_scope"
        ON "analytics"."analytics_saved_reports" ("company_id", "department_scope_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "analytics"."IDX_analytics_saved_reports_department_scope"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "analytics"."IDX_analytics_saved_reports_company_dataset"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "analytics"."IDX_analytics_saved_reports_company_visibility"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "analytics"."analytics_saved_reports"
    `);
  }
}

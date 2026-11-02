import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateManagerRecommendations1796300000000 implements MigrationInterface {
  name = 'CreateManagerRecommendations1796300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "manager_recommendations" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "employee_id" integer NOT NULL REFERENCES "employees"("id") ON DELETE CASCADE,
        "submitted_by_company_user_id" integer NOT NULL REFERENCES "company_users"("id") ON DELETE RESTRICT,
        "recommendation_type" varchar(24) NOT NULL,
        "rationale" text NOT NULL,
        "proposal" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "proposed_effective_date" date NULL,
        "status" varchar(16) NOT NULL DEFAULT 'SUBMITTED',
        "reviewed_by_company_user_id" integer NULL REFERENCES "company_users"("id") ON DELETE SET NULL,
        "reviewed_at" timestamptz NULL,
        "reviewer_comment" text NULL,
        "demo_policy_version" varchar(32) NOT NULL,
        "metadata" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "CHK_manager_recommendations_type"
          CHECK ("recommendation_type" IN ('PROMOTION', 'TRANSFER', 'DISCIPLINARY')),
        CONSTRAINT "CHK_manager_recommendations_status"
          CHECK ("status" IN ('SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED', 'WITHDRAWN'))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_manager_recommendations_company_status" ON "manager_recommendations" ("company_id", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_manager_recommendations_submitter" ON "manager_recommendations" ("company_id", "submitted_by_company_user_id")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "manager_recommendations"');
  }
}

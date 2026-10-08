import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeKpiReviewsAndScores1791600000000 implements MigrationInterface {
  name = 'AddEmployeeKpiReviewsAndScores1791600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "performance_periods" ADD COLUMN "kpi_rating_bands" jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "kpi_templates" ADD COLUMN "applicable_role_ids" integer[] NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(`ALTER TABLE "employee_kpis"
      ADD COLUMN "scoring_type" varchar(24) NOT NULL DEFAULT 'NUMERIC_TARGET',
      ADD COLUMN "measurement_direction" varchar(24) NOT NULL DEFAULT 'HIGHER_IS_BETTER',
      ADD COLUMN "formula_config" jsonb,
      ADD COLUMN "source_template_id" integer,
      ADD COLUMN "kpi_definition_version_id" integer`);
    await queryRunner.query(`CREATE TABLE "employee_kpi_cycle_reviews" (
      "id" serial PRIMARY KEY,
      "company_id" integer NOT NULL,
      "performance_period_id" integer NOT NULL,
      "employee_id" integer NOT NULL,
      "employee_kpi_id" integer NOT NULL,
      "kind" varchar(12) NOT NULL,
      "status" varchar(24) NOT NULL DEFAULT 'PENDING',
      "self_rating" decimal(7,2),
      "self_comment" text,
      "self_submitted_at" timestamptz,
      "manager_rating" decimal(7,2),
      "manager_comment" text,
      "manager_submitted_at" timestamptz,
      "manager_on_behalf" boolean NOT NULL DEFAULT false,
      "dispute_comment" text,
      "disputed_at" timestamptz,
      "acknowledged_at" timestamptz,
      "weighted_score" decimal(9,4),
      "finalized_at" timestamptz,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_employee_kpi_cycle_review_kind" UNIQUE ("employee_kpi_id", "kind"),
      CONSTRAINT "FK_employee_kpi_cycle_review_kpi" FOREIGN KEY ("employee_kpi_id") REFERENCES "employee_kpis"("id") ON DELETE RESTRICT
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_kpi_cycle_review_company_status" ON "employee_kpi_cycle_reviews" ("company_id", "kind", "status")`,
    );
    await queryRunner.query(`CREATE TABLE "employee_kpi_cycle_scores" (
      "id" serial PRIMARY KEY,
      "company_id" integer NOT NULL,
      "performance_period_id" integer NOT NULL,
      "employee_id" integer NOT NULL,
      "total_weighted_score" decimal(9,4) NOT NULL,
      "final_rating_band" varchar(60) NOT NULL,
      "status" varchar(16) NOT NULL DEFAULT 'LOCKED',
      "finalized_at" timestamptz NOT NULL,
      "locked_at" timestamptz,
      "revision" integer NOT NULL DEFAULT 1,
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "updated_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_employee_kpi_cycle_score_employee_period" UNIQUE ("performance_period_id", "employee_id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_kpi_cycle_score_company_period" ON "employee_kpi_cycle_scores" ("company_id", "performance_period_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "employee_kpi_cycle_scores"`);
    await queryRunner.query(`DROP TABLE "employee_kpi_cycle_reviews"`);
    await queryRunner.query(
      `ALTER TABLE "employee_kpis" DROP COLUMN "kpi_definition_version_id", DROP COLUMN "source_template_id", DROP COLUMN "formula_config", DROP COLUMN "measurement_direction", DROP COLUMN "scoring_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "kpi_templates" DROP COLUMN "applicable_role_ids"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_periods" DROP COLUMN "kpi_rating_bands"`,
    );
  }
}

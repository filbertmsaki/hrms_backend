import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceRulesTemplatesAndAggregates1792300000002
  implements MigrationInterface
{
  name = 'AddPerformanceRulesTemplatesAndAggregates1792300000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "kpi_template_status_enum" AS ENUM (
        'DRAFT',
        'ACTIVE',
        'INACTIVE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "kpi_applicability_rule_status_enum" AS ENUM (
        'ACTIVE',
        'INACTIVE'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "kpi_templates" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "code" varchar(80) NOT NULL,
        "name" varchar(180) NOT NULL,
        "description" text,
        "status" "kpi_template_status_enum" NOT NULL DEFAULT 'DRAFT',
        "review_cycle" varchar(40),
        "metadata" jsonb,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kpi_templates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_kpi_template_company_code" UNIQUE ("company_id", "code")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_kpi_template_company_status"
      ON "kpi_templates" ("company_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "kpi_template_items" (
        "id" SERIAL NOT NULL,
        "template_id" integer NOT NULL,
        "kpi_definition_version_id" integer NOT NULL,
        "weight" decimal(7,2) NOT NULL,
        "target_value" decimal(14,4),
        "manual_entry_allowed" boolean NOT NULL DEFAULT true,
        "evidence_required" boolean NOT NULL DEFAULT false,
        "notes" text,
        CONSTRAINT "PK_kpi_template_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_kpi_template_item_template" FOREIGN KEY ("template_id")
          REFERENCES "kpi_templates"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_kpi_template_item_version" FOREIGN KEY ("kpi_definition_version_id")
          REFERENCES "kpi_definition_versions"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "kpi_applicability_rules" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "kpi_definition_version_id" integer NOT NULL,
        "name" varchar(100),
        "status" "kpi_applicability_rule_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "priority" integer NOT NULL DEFAULT 0,
        "financial_year_id" integer,
        "branch_id" integer,
        "department_id" integer,
        "position_id" integer,
        "grade_id" integer,
        "employment_type" varchar(40),
        "employee_id" integer,
        "review_cycle" varchar(40),
        "template_code" varchar(80),
        "weight_override" decimal(7,2),
        "target_override" decimal(14,4),
        "metadata" jsonb,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kpi_applicability_rules" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_kpi_applicability_rule_company_version_priority" UNIQUE ("company_id", "kpi_definition_version_id", "priority"),
        CONSTRAINT "FK_kpi_applicability_rule_version" FOREIGN KEY ("kpi_definition_version_id")
          REFERENCES "kpi_definition_versions"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_kpi_applicability_rule_company_status"
      ON "kpi_applicability_rules" ("company_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "performance_aggregates" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "financial_year_id" integer NOT NULL,
        "period_type" "performance_period_type_enum" NOT NULL,
        "sequence_number" integer NOT NULL,
        "name" varchar(100) NOT NULL,
        "aggregation_method" "performance_aggregation_method_enum" NOT NULL,
        "aggregate_score" decimal(9,4) NOT NULL,
        "rating_code" varchar(40),
        "source_review_hashes" jsonb NOT NULL,
        "calculation_snapshot" jsonb NOT NULL,
        "published_at" timestamptz,
        "locked_at" timestamptz,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_performance_aggregates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_aggregate_employee_period" UNIQUE (
          "company_id", "employee_id", "financial_year_id", "period_type", "sequence_number"
        ),
        CONSTRAINT "FK_performance_aggregate_employee" FOREIGN KEY ("employee_id")
          REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_performance_aggregate_financial_year" FOREIGN KEY ("financial_year_id")
          REFERENCES "performance_financial_years"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_performance_aggregate_company_type"
      ON "performance_aggregates" ("company_id", "period_type")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_aggregates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kpi_applicability_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kpi_template_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kpi_templates"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "kpi_applicability_rule_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "kpi_template_status_enum"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateKpiPerformanceManagement1792300000001
  implements MigrationInterface
{
  name = 'CreateKpiPerformanceManagement1792300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "performance_aggregation_method_enum" AS ENUM (
        'SIMPLE_MONTHLY_AVERAGE',
        'WEIGHTED_MONTHLY_AVERAGE',
        'QUARTERLY_ROLLUP',
        'ANNUAL_TARGET_ACHIEVEMENT',
        'MONTHLY_AVERAGE_WITH_ADJUSTMENTS'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "performance_period_type_enum" AS ENUM (
        'MONTHLY',
        'QUARTERLY',
        'HALF_YEARLY',
        'ANNUAL'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "performance_period_status_enum" AS ENUM (
        'DRAFT',
        'OPEN',
        'ACHIEVEMENT_ENTRY',
        'SELF_REVIEW',
        'MANAGER_REVIEW',
        'HR_REVIEW',
        'MODERATION',
        'APPROVED',
        'PUBLISHED',
        'LOCKED',
        'CANCELLED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "performance_plan_status_enum" AS ENUM (
        'DRAFT',
        'ACTIVE',
        'SUPERSEDED',
        'CLOSED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "performance_period_assignment_status_enum" AS ENUM (
        'OPEN',
        'EMPLOYEE_SUBMITTED',
        'MANAGER_REVIEW',
        'HR_REVIEW',
        'APPROVED',
        'PUBLISHED',
        'LOCKED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "kpi_measurement_direction_enum" AS ENUM (
        'HIGHER_IS_BETTER',
        'LOWER_IS_BETTER',
        'TARGET_MATCH',
        'RANGE',
        'BINARY',
        'MANUAL_RATING'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "kpi_scoring_formula_enum" AS ENUM (
        'PERCENT_TO_TARGET',
        'INVERSE_PERCENT_TO_TARGET',
        'TARGET_VARIANCE',
        'THRESHOLD_BANDS',
        'RANGE_COMPLIANCE',
        'BINARY_RESULT',
        'MANUAL_RATING'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "kpi_data_source_type_enum" AS ENUM (
        'MANUAL_EMPLOYEE',
        'MANUAL_MANAGER',
        'ATTENDANCE',
        'LEAVE',
        'DAILY_ACTIVITY',
        'FIELD_VISIT',
        'EXTERNAL_API',
        'FILE_IMPORT',
        'SYSTEM_CALCULATION'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "kpi_achievement_status_enum" AS ENUM (
        'NOT_STARTED',
        'DRAFT',
        'EMPLOYEE_SUBMITTED',
        'SYSTEM_CALCULATED',
        'MANAGER_VALIDATED',
        'RETURNED_FOR_CORRECTION',
        'HR_APPROVED',
        'PUBLISHED',
        'LOCKED',
        'NOT_APPLICABLE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "performance_review_status_enum" AS ENUM (
        'DRAFT',
        'OPEN',
        'SELF_REVIEW_PENDING',
        'MANAGER_REVIEW_PENDING',
        'HR_REVIEW_PENDING',
        'MODERATION_PENDING',
        'APPROVED',
        'PUBLISHED',
        'LOCKED',
        'APPEALED',
        'REOPENED',
        'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "performance_financial_years" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "code" varchar(30) NOT NULL,
        "name" varchar(100) NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "status" varchar(30) NOT NULL DEFAULT 'DRAFT',
        "annual_aggregation_method" "performance_aggregation_method_enum" NOT NULL DEFAULT 'SIMPLE_MONTHLY_AVERAGE',
        "aggregation_configuration" jsonb,
        "is_locked" boolean NOT NULL DEFAULT false,
        "locked_at" timestamptz,
        "locked_by_company_user_id" integer,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_performance_financial_years" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_financial_year_company_code" UNIQUE ("company_id", "code")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_performance_financial_year_company_status"
      ON "performance_financial_years" ("company_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "performance_periods" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "financial_year_id" integer NOT NULL,
        "period_type" "performance_period_type_enum" NOT NULL,
        "sequence_number" integer NOT NULL,
        "name" varchar(100) NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "status" "performance_period_status_enum" NOT NULL DEFAULT 'DRAFT',
        "achievement_entry_opens_at" timestamptz,
        "achievement_entry_closes_at" timestamptz,
        "self_review_due_at" timestamptz,
        "manager_review_due_at" timestamptz,
        "hr_review_due_at" timestamptz,
        "published_at" timestamptz,
        "locked_at" timestamptz,
        "generation_snapshot" jsonb,
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_performance_periods" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_period_year_type_sequence" UNIQUE ("financial_year_id", "period_type", "sequence_number"),
        CONSTRAINT "FK_performance_period_financial_year" FOREIGN KEY ("financial_year_id")
          REFERENCES "performance_financial_years"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_performance_period_company_status"
      ON "performance_periods" ("company_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_performance_period_dates"
      ON "performance_periods" ("start_date", "end_date")
    `);

    await queryRunner.query(`
      CREATE TABLE "performance_rating_scales" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "code" varchar(60) NOT NULL,
        "name" varchar(150) NOT NULL,
        "minimum_score" decimal(7,2) NOT NULL DEFAULT 0,
        "maximum_score" decimal(7,2) NOT NULL DEFAULT 100,
        "is_default" boolean NOT NULL DEFAULT false,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_performance_rating_scales" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_rating_scale_company_code" UNIQUE ("company_id", "code")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "performance_rating_bands" (
        "id" SERIAL NOT NULL,
        "rating_scale_id" integer NOT NULL,
        "code" varchar(40) NOT NULL,
        "label" varchar(100) NOT NULL,
        "minimum_score" decimal(7,2) NOT NULL,
        "maximum_score" decimal(7,2) NOT NULL,
        "display_order" integer NOT NULL DEFAULT 0,
        "requires_improvement_plan" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_performance_rating_bands" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_rating_band_scale_code" UNIQUE ("rating_scale_id", "code"),
        CONSTRAINT "FK_performance_rating_band_scale" FOREIGN KEY ("rating_scale_id")
          REFERENCES "performance_rating_scales"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "kpi_definitions" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "code" varchar(80) NOT NULL,
        "name" varchar(180) NOT NULL,
        "category" varchar(80),
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "current_version_id" integer,
        "created_by_company_user_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kpi_definitions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_kpi_definition_company_code" UNIQUE ("company_id", "code")
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "kpi_definition_versions" (
        "id" SERIAL NOT NULL,
        "kpi_definition_id" integer NOT NULL,
        "version_number" integer NOT NULL,
        "description" text NOT NULL,
        "measurement_unit" varchar(80) NOT NULL,
        "measurement_direction" "kpi_measurement_direction_enum" NOT NULL,
        "scoring_formula" "kpi_scoring_formula_enum" NOT NULL,
        "formula_configuration" jsonb,
        "data_source_type" "kpi_data_source_type_enum" NOT NULL,
        "data_source_configuration" jsonb,
        "default_target_value" decimal(14,4),
        "frequency" "performance_period_type_enum" NOT NULL DEFAULT 'MONTHLY',
        "approval_authority" varchar(50) NOT NULL DEFAULT 'HR',
        "manual_entry_allowed" boolean NOT NULL DEFAULT true,
        "evidence_required" boolean NOT NULL DEFAULT false,
        "applicability_snapshot" jsonb,
        "published_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kpi_definition_versions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_kpi_definition_version" UNIQUE ("kpi_definition_id", "version_number"),
        CONSTRAINT "FK_kpi_definition_version_definition" FOREIGN KEY ("kpi_definition_id")
          REFERENCES "kpi_definitions"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "employee_performance_plans" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "financial_year_id" integer NOT NULL,
        "template_id" integer,
        "version_number" integer NOT NULL DEFAULT 1,
        "status" "performance_plan_status_enum" NOT NULL DEFAULT 'DRAFT',
        "effective_from" date NOT NULL,
        "effective_to" date,
        "manager_employee_id" integer,
        "manager_company_user_id" integer,
        "employee_snapshot" jsonb NOT NULL,
        "assignment_snapshot_hash" varchar(128) NOT NULL,
        "assigned_at" timestamptz,
        "assigned_by_company_user_id" integer,
        "employee_acknowledged_at" timestamptz,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_performance_plans" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_employee_performance_plan_year" UNIQUE ("company_id", "employee_id", "financial_year_id", "version_number"),
        CONSTRAINT "FK_employee_performance_plan_employee" FOREIGN KEY ("employee_id")
          REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employee_performance_plan_financial_year" FOREIGN KEY ("financial_year_id")
          REFERENCES "performance_financial_years"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "employee_performance_plan_items" (
        "id" SERIAL NOT NULL,
        "plan_id" integer NOT NULL,
        "kpi_definition_version_id" integer NOT NULL,
        "weight" decimal(7,2) NOT NULL,
        "target_value" decimal(14,4),
        "manual_entry_allowed" boolean NOT NULL DEFAULT true,
        "evidence_required" boolean NOT NULL DEFAULT false,
        "notes" text,
        "kpi_snapshot" jsonb NOT NULL,
        CONSTRAINT "PK_employee_performance_plan_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employee_performance_plan_item_plan" FOREIGN KEY ("plan_id")
          REFERENCES "employee_performance_plans"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employee_performance_plan_item_kpi_version" FOREIGN KEY ("kpi_definition_version_id")
          REFERENCES "kpi_definition_versions"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "performance_period_assignments" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "performance_period_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "performance_plan_id" integer NOT NULL,
        "manager_employee_id" integer,
        "manager_company_user_id" integer,
        "status" "performance_period_assignment_status_enum" NOT NULL DEFAULT 'OPEN',
        "employee_snapshot" jsonb NOT NULL,
        "plan_snapshot" jsonb NOT NULL,
        "total_weight" decimal(7,2) NOT NULL,
        "submitted_at" timestamptz,
        "approved_at" timestamptz,
        "published_at" timestamptz,
        "locked_at" timestamptz,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_performance_period_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_period_assignment_employee" UNIQUE ("performance_period_id", "employee_id"),
        CONSTRAINT "FK_performance_assignment_period" FOREIGN KEY ("performance_period_id")
          REFERENCES "performance_periods"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_performance_assignment_plan" FOREIGN KEY ("performance_plan_id")
          REFERENCES "employee_performance_plans"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_performance_assignment_employee" FOREIGN KEY ("employee_id")
          REFERENCES "employees"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_performance_period_assignment_company_status"
      ON "performance_period_assignments" ("company_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "kpi_achievements" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "period_assignment_id" integer NOT NULL,
        "plan_item_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "target_value" decimal(14,4),
        "achievement_value" decimal(14,4),
        "raw_score" decimal(9,4),
        "capped_score" decimal(9,4),
        "weighted_score" decimal(9,4),
        "status" "kpi_achievement_status_enum" NOT NULL DEFAULT 'NOT_STARTED',
        "source_type" "kpi_data_source_type_enum" NOT NULL,
        "achievement_snapshot" jsonb NOT NULL,
        "evidence" jsonb,
        "manager_comment" text,
        "hr_comment" text,
        "override_reason" text,
        "submitted_at" timestamptz,
        "manager_validated_at" timestamptz,
        "hr_approved_at" timestamptz,
        "published_at" timestamptz,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_kpi_achievements" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_kpi_achievement_period_item" UNIQUE ("period_assignment_id", "plan_item_id"),
        CONSTRAINT "FK_kpi_achievement_assignment" FOREIGN KEY ("period_assignment_id")
          REFERENCES "performance_period_assignments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_kpi_achievement_plan_item" FOREIGN KEY ("plan_item_id")
          REFERENCES "employee_performance_plan_items"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_kpi_achievement_company_status"
      ON "kpi_achievements" ("company_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "performance_reviews" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "performance_period_id" integer NOT NULL,
        "period_assignment_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "manager_employee_id" integer,
        "manager_company_user_id" integer,
        "status" "performance_review_status_enum" NOT NULL DEFAULT 'DRAFT',
        "kpi_score" decimal(9,4),
        "competency_score" decimal(9,4),
        "adjustment_score" decimal(9,4) NOT NULL DEFAULT 0,
        "final_score" decimal(9,4),
        "rating_scale_id" integer,
        "rating_band_id" integer,
        "rating_code" varchar(40),
        "employee_self_review" jsonb,
        "manager_review" jsonb,
        "hr_review" jsonb,
        "calculation_snapshot" jsonb,
        "calculation_hash" varchar(128),
        "published_at" timestamptz,
        "locked_at" timestamptz,
        "revision_number" integer NOT NULL DEFAULT 1,
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_performance_reviews" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_review_period_employee" UNIQUE ("performance_period_id", "employee_id"),
        CONSTRAINT "FK_performance_review_assignment" FOREIGN KEY ("period_assignment_id")
          REFERENCES "performance_period_assignments"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_performance_review_company_status"
      ON "performance_reviews" ("company_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "performance_audit_logs" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "action" varchar(120) NOT NULL,
        "actor_company_user_id" integer,
        "employee_id" integer,
        "performance_review_id" integer,
        "kpi_achievement_id" integer,
        "before_values" jsonb,
        "after_values" jsonb,
        "request_id" varchar(120),
        "ip_address" varchar(80),
        "user_agent" text,
        "reason" text,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_performance_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_performance_audit_company_action"
      ON "performance_audit_logs" ("company_id", "action")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_performance_audit_created_at"
      ON "performance_audit_logs" ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_reviews"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kpi_achievements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_period_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_performance_plan_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_performance_plans"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kpi_definition_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "kpi_definitions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_rating_bands"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_rating_scales"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_periods"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_financial_years"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "performance_review_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "kpi_achievement_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "kpi_data_source_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "kpi_scoring_formula_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "kpi_measurement_direction_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "performance_period_assignment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "performance_plan_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "performance_period_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "performance_period_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "performance_aggregation_method_enum"`);
  }
}

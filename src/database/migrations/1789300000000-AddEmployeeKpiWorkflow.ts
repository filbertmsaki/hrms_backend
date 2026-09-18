import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeKpiWorkflow1789300000000 implements MigrationInterface {
  name = 'AddEmployeeKpiWorkflow1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "performance_periods" ADD COLUMN IF NOT EXISTS "description" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_periods" ADD COLUMN IF NOT EXISTS "created_by_company_user_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_periods" ADD COLUMN IF NOT EXISTS "created_at" TIMESTAMP NOT NULL DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_periods" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP NOT NULL DEFAULT now()`,
    );

    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "employee_kpi_measurement_type_enum" AS ENUM ('NUMBER', 'PERCENTAGE', 'CURRENCY', 'BOOLEAN', 'RATING', 'MANUAL'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "employee_kpi_progress_source_enum" AS ENUM ('MANUAL', 'APPROVED_ACTIVITIES', 'SYSTEM'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    );
    await queryRunner.query(
      `DO $$ BEGIN CREATE TYPE "employee_kpi_status_enum" AS ENUM ('DRAFT', 'SUBMITTED', 'PENDING_REVIEW', 'APPROVED', 'RETURNED', 'RESUBMITTED', 'REJECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "employee_kpis" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "performance_period_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "created_by_company_user_id" integer,
        "title" varchar(250) NOT NULL,
        "description" text NOT NULL,
        "measurement_type" "employee_kpi_measurement_type_enum" NOT NULL,
        "target_value" numeric(18,4),
        "actual_value" numeric(18,4),
        "unit" varchar(80),
        "weight" numeric(7,2) NOT NULL,
        "start_date" date,
        "due_date" date NOT NULL,
        "progress_source" "employee_kpi_progress_source_enum" NOT NULL DEFAULT 'MANUAL',
        "status" "employee_kpi_status_enum" NOT NULL DEFAULT 'DRAFT',
        "reviewer_employee_id" integer,
        "submitted_at" TIMESTAMP WITH TIME ZONE,
        "reviewed_by_company_user_id" integer,
        "reviewed_at" TIMESTAMP WITH TIME ZONE,
        "review_comment" text,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_kpis" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employee_kpis_period" FOREIGN KEY ("performance_period_id") REFERENCES "performance_periods"("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_employee_kpis_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_employee_kpis_reviewer" FOREIGN KEY ("reviewer_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL,
        CONSTRAINT "CHK_employee_kpis_weight" CHECK ("weight" > 0 AND "weight" <= 100),
        CONSTRAINT "CHK_employee_kpis_dates" CHECK ("start_date" IS NULL OR "due_date" >= "start_date")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_employee_kpi_company_period_employee" ON "employee_kpis" ("company_id", "performance_period_id", "employee_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_employee_kpi_company_status_reviewer" ON "employee_kpis" ("company_id", "status", "reviewer_employee_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_employee_kpi_due_date" ON "employee_kpis" ("due_date")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "employee_kpi_review_history" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_kpi_id" integer NOT NULL,
        "actor_company_user_id" integer,
        "actor_employee_id" integer,
        "from_status" varchar(40),
        "to_status" varchar(40) NOT NULL,
        "decision" varchar(30),
        "comment" text,
        "snapshot" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_employee_kpi_review_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_employee_kpi_review_history_kpi" FOREIGN KEY ("employee_kpi_id") REFERENCES "employee_kpis"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_employee_kpi_review_history_kpi_created" ON "employee_kpi_review_history" ("employee_kpi_id", "created_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "employee_kpi_id" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "expected_result" text`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "due_date" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "completion_date" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "origin" varchar(30) NOT NULL DEFAULT 'SELF_CREATED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "review_status" varchar(30) NOT NULL DEFAULT 'NOT_REQUIRED'`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD COLUMN IF NOT EXISTS "reviewed_by_company_user_id" integer`,
    );
    await queryRunner.query(
      `UPDATE "daily_activity_entries"
       SET "origin" = 'ASSIGNED'
       WHERE "task_reference" = 'MANAGER_ASSIGNED'
          OR "external_reference_type" = 'MANAGER_TASK'`,
    );
    await queryRunner.query(
      `UPDATE "daily_activity_entries"
       SET "due_date" = "planned_end_time"
       WHERE "due_date" IS NULL AND "planned_end_time" IS NOT NULL`,
    );
    await queryRunner.query(
      `UPDATE "daily_activity_entries"
       SET "completion_date" = COALESCE("actual_end_time", "updated_at")
       WHERE "completion_date" IS NULL AND "status" = 'COMPLETED'`,
    );
    await queryRunner.query(
      `UPDATE "daily_activity_entries" entry
       SET "review_status" = CASE
         WHEN entry."manager_validated" = true THEN 'APPROVED'
         WHEN report."status" = 'MANAGER_REVIEW_PENDING' AND entry."status" = 'COMPLETED' THEN 'PENDING'
         WHEN report."status" = 'RETURNED_FOR_CORRECTION' AND entry."status" = 'COMPLETED' THEN 'RETURNED'
         WHEN report."status" = 'REJECTED' AND entry."status" = 'COMPLETED' THEN 'REJECTED'
         ELSE entry."review_status"
       END
       FROM "daily_activity_reports" report
       WHERE report."id" = entry."daily_activity_report_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" ADD CONSTRAINT "FK_daily_activity_entry_employee_kpi" FOREIGN KEY ("employee_kpi_id") REFERENCES "employee_kpis"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_daily_activity_entry_employee_kpi" ON "daily_activity_entries" ("employee_kpi_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_daily_activity_entry_review_due" ON "daily_activity_entries" ("review_status", "due_date")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_daily_activity_entry_review_due"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_daily_activity_entry_employee_kpi"`,
    );
    await queryRunner.query(
      `ALTER TABLE "daily_activity_entries" DROP CONSTRAINT IF EXISTS "FK_daily_activity_entry_employee_kpi"`,
    );
    for (const column of [
      'reviewed_by_company_user_id',
      'reviewed_at',
      'review_status',
      'origin',
      'completion_date',
      'due_date',
      'expected_result',
      'employee_kpi_id',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "daily_activity_entries" DROP COLUMN IF EXISTS "${column}"`,
      );
    }
    await queryRunner.query(
      `DROP TABLE IF EXISTS "employee_kpi_review_history"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "employee_kpis"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "employee_kpi_status_enum"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "employee_kpi_progress_source_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "employee_kpi_measurement_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_periods" DROP COLUMN IF EXISTS "updated_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_periods" DROP COLUMN IF EXISTS "created_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_periods" DROP COLUMN IF EXISTS "created_by_company_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "performance_periods" DROP COLUMN IF EXISTS "description"`,
    );
  }
}

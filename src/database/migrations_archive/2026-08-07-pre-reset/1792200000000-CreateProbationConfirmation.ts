import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProbationConfirmation1792200000000
  implements MigrationInterface
{
  name = 'CreateProbationConfirmation1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."documents_entity_type_enum"
      ADD VALUE IF NOT EXISTS 'PROBATION_CASE'
    `);

    await queryRunner.query(`
      ALTER TYPE "public"."documents_module_enum"
      ADD VALUE IF NOT EXISTS 'PROBATION'
    `);

    await queryRunner.query(`
      CREATE TABLE "probation_policies" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "code" varchar(80) NOT NULL,
        "name" varchar(160) NOT NULL,
        "description" text,
        "employment_type" varchar(40),
        "branch_id" integer,
        "department_id" integer,
        "position_id" integer,
        "grade_id" integer,
        "probation_period_days" integer NOT NULL,
        "self_assessment_required" boolean NOT NULL DEFAULT false,
        "objectives_required" boolean NOT NULL DEFAULT true,
        "minimum_confirmation_score" decimal(5,2) NOT NULL DEFAULT 60,
        "maximum_extensions" integer NOT NULL DEFAULT 2,
        "default_extension_days" integer NOT NULL DEFAULT 90,
        "maximum_extension_days" integer NOT NULL DEFAULT 180,
        "reminder_days" jsonb,
        "manager_review_required" boolean NOT NULL DEFAULT true,
        "hr_approval_required" boolean NOT NULL DEFAULT true,
        "confirmation_letter_required" boolean NOT NULL DEFAULT true,
        "priority" integer NOT NULL DEFAULT 0,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "effective_from" date NOT NULL,
        "effective_to" date,
        "is_default" boolean NOT NULL DEFAULT false,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_probation_policies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_probation_policy_company_code" UNIQUE ("company_id", "code"),
        CONSTRAINT "FK_probation_policy_company" FOREIGN KEY ("company_id")
          REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_probation_policy_branch" FOREIGN KEY ("branch_id")
          REFERENCES "branches"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_probation_policy_department" FOREIGN KEY ("department_id")
          REFERENCES "departments"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_probation_policy_position" FOREIGN KEY ("position_id")
          REFERENCES "positions"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_probation_policy_grade" FOREIGN KEY ("grade_id")
          REFERENCES "employee_grades"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_probation_policy_company_status"
      ON "probation_policies" ("company_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "probation_policy_criteria" (
        "id" SERIAL NOT NULL,
        "policy_id" integer NOT NULL,
        "code" varchar(80) NOT NULL,
        "name" varchar(180) NOT NULL,
        "description" text,
        "weight" decimal(5,2) NOT NULL,
        "maximum_rating" decimal(5,2) NOT NULL DEFAULT 5,
        "self_rating_enabled" boolean NOT NULL DEFAULT false,
        "is_required" boolean NOT NULL DEFAULT true,
        "sort_order" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_probation_policy_criteria" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_probation_policy_criterion_code" UNIQUE ("policy_id", "code"),
        CONSTRAINT "FK_probation_policy_criterion_policy" FOREIGN KEY ("policy_id")
          REFERENCES "probation_policies"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "probation_number_sequences" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "sequence_year" integer NOT NULL,
        "next_number" integer NOT NULL DEFAULT 1,
        "updated_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_probation_number_sequences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_probation_number_company_year" UNIQUE ("company_id", "sequence_year")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "probation_cases" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "policy_id" integer,
        "case_no" varchar(60) NOT NULL,
        "status" varchar(40) NOT NULL DEFAULT 'DRAFT',
        "original_start_date" date NOT NULL,
        "original_due_date" date NOT NULL,
        "current_start_date" date NOT NULL,
        "current_due_date" date NOT NULL,
        "current_cycle_number" integer NOT NULL DEFAULT 1,
        "extension_count" integer NOT NULL DEFAULT 0,
        "manager_employee_id" integer,
        "manager_company_user_id" integer,
        "policy_snapshot" jsonb,
        "employee_snapshot" jsonb NOT NULL,
        "final_decision" varchar(40),
        "final_decision_reason" text,
        "confirmation_date" date,
        "finalized_by_company_user_id" integer,
        "finalized_at" timestamptz,
        "confirmation_document_id" integer,
        "latest_evidence_snapshot" jsonb,
        "latest_evidence_hash" varchar(128),
        "created_by_company_user_id" integer,
        "metadata" jsonb,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_probation_cases" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_probation_case_company_no" UNIQUE ("company_id", "case_no"),
        CONSTRAINT "FK_probation_case_employee" FOREIGN KEY ("employee_id")
          REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_probation_case_policy" FOREIGN KEY ("policy_id")
          REFERENCES "probation_policies"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_probation_case_company_status"
      ON "probation_cases" ("company_id", "status")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_probation_case_due_date"
      ON "probation_cases" ("current_due_date", "status")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_employee_active_probation_case"
      ON "probation_cases" ("company_id", "employee_id")
      WHERE "status" IN (
        'DRAFT', 'ACTIVE', 'OBJECTIVES_PENDING', 'SELF_ASSESSMENT_PENDING',
        'MANAGER_REVIEW_PENDING', 'HR_REVIEW_PENDING', 'EXTENDED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "probation_review_cycles" (
        "id" SERIAL NOT NULL,
        "probation_case_id" integer NOT NULL,
        "cycle_number" integer NOT NULL,
        "period_start_date" date NOT NULL,
        "period_end_date" date NOT NULL,
        "status" varchar(40) NOT NULL DEFAULT 'ACTIVE',
        "self_assessment_required" boolean NOT NULL DEFAULT false,
        "self_assessment" jsonb,
        "self_assessment_submitted_at" timestamptz,
        "manager_employee_id" integer,
        "manager_company_user_id" integer,
        "manager_recommendation" varchar(40),
        "manager_score" decimal(5,2),
        "manager_comments" text,
        "manager_reviewed_at" timestamptz,
        "hr_company_user_id" integer,
        "hr_decision" varchar(40),
        "hr_comments" text,
        "hr_reviewed_at" timestamptz,
        "evidence_snapshot" jsonb,
        "evidence_hash" varchar(128),
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_probation_review_cycles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_probation_case_cycle" UNIQUE ("probation_case_id", "cycle_number"),
        CONSTRAINT "FK_probation_review_cycle_case" FOREIGN KEY ("probation_case_id")
          REFERENCES "probation_cases"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "probation_review_ratings" (
        "id" SERIAL NOT NULL,
        "review_cycle_id" integer NOT NULL,
        "criterion_id" integer,
        "criterion_code" varchar(80) NOT NULL,
        "criterion_name" varchar(180) NOT NULL,
        "weight" decimal(5,2) NOT NULL,
        "maximum_rating" decimal(5,2) NOT NULL,
        "self_rating" decimal(5,2),
        "self_comment" text,
        "manager_rating" decimal(5,2),
        "manager_comment" text,
        "weighted_score" decimal(5,2),

        CONSTRAINT "PK_probation_review_ratings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_probation_cycle_criterion" UNIQUE ("review_cycle_id", "criterion_code"),
        CONSTRAINT "FK_probation_review_rating_cycle" FOREIGN KEY ("review_cycle_id")
          REFERENCES "probation_review_cycles"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "probation_objectives" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "probation_case_id" integer NOT NULL,
        "review_cycle_id" integer NOT NULL,
        "title" varchar(200) NOT NULL,
        "description" text,
        "expected_result" text,
        "weight" decimal(5,2) NOT NULL DEFAULT 0,
        "due_date" date,
        "status" varchar(30) NOT NULL DEFAULT 'NOT_STARTED',
        "employee_progress_comment" text,
        "employee_completion_percent" decimal(5,2) NOT NULL DEFAULT 0,
        "manager_rating" decimal(5,2),
        "manager_comment" text,
        "evidence_document_id" integer,
        "created_by_company_user_id" integer,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_probation_objectives" PRIMARY KEY ("id"),
        CONSTRAINT "FK_probation_objective_case" FOREIGN KEY ("probation_case_id")
          REFERENCES "probation_cases"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_probation_objective_cycle" FOREIGN KEY ("review_cycle_id")
          REFERENCES "probation_review_cycles"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_probation_objective_case_cycle"
      ON "probation_objectives" ("probation_case_id", "review_cycle_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "probation_cases"
      ADD COLUMN "last_reminder_at" timestamptz,
      ADD COLUMN "reminder_count" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE TABLE "probation_audit_logs" (
        "id" SERIAL NOT NULL,
        "probation_case_id" integer,
        "review_cycle_id" integer,
        "actor_company_user_id" integer,
        "action" varchar(80) NOT NULL,
        "description" text,
        "old_values" json,
        "new_values" json,
        "metadata" json,
        "ip_address" varchar(45),
        "user_agent" varchar(255),
        "created_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_probation_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_probation_audit_log_case" FOREIGN KEY ("probation_case_id")
          REFERENCES "probation_cases"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_probation_audit_case"
      ON "probation_audit_logs" ("probation_case_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_probation_audit_action"
      ON "probation_audit_logs" ("action")
    `);

    await queryRunner.query(`
      CREATE TABLE "probation_extensions" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "probation_case_id" integer NOT NULL,
        "review_cycle_id" integer NOT NULL,
        "extension_number" integer NOT NULL,
        "previous_end_date" date NOT NULL,
        "new_start_date" date NOT NULL,
        "new_end_date" date NOT NULL,
        "extension_days" integer NOT NULL,
        "reason" text NOT NULL,
        "improvement_plan" text,
        "approved_by_company_user_id" integer NOT NULL,
        "approved_at" timestamptz NOT NULL,
        "extension_document_id" integer,
        "created_at" timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT "PK_probation_extensions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_probation_case_extension_number" UNIQUE ("probation_case_id", "extension_number"),
        CONSTRAINT "FK_probation_extension_case" FOREIGN KEY ("probation_case_id")
          REFERENCES "probation_cases"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_probation_extension_cycle" FOREIGN KEY ("review_cycle_id")
          REFERENCES "probation_review_cycles"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      UPDATE "employees"
      SET "confirmation_status" = 'CONFIRMED'
      WHERE "confirmation_date" IS NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "employees"
      SET "confirmation_status" = 'PROBATION'
      WHERE "confirmation_date" IS NULL
        AND "probation_end_date" > CURRENT_DATE
        AND "employment_status" = 'active'
    `);

    await queryRunner.query(`
      UPDATE "employees"
      SET "confirmation_status" = 'CONFIRMATION_DUE'
      WHERE "confirmation_date" IS NULL
        AND "probation_end_date" <= CURRENT_DATE
        AND "probation_end_date" IS NOT NULL
        AND "employment_status" = 'active'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Probation/confirmation history is not automatically destroyed on
    // rollback. Only the schema objects created by this migration are
    // dropped; the `employees.version` column and confirmation_status
    // backfill are left in place intentionally.
    await queryRunner.query(`DROP TABLE IF EXISTS "probation_audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "probation_extensions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "probation_objectives"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "probation_review_ratings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "probation_review_cycles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "probation_cases"`);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "probation_number_sequences"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "probation_policy_criteria"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "probation_policies"`);
  }
}

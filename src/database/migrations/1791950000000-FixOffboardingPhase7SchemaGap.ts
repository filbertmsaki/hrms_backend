import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The Phase 7 offboarding entities (workflow versioning/locking, notice
 * periods, access-termination scheduling, task/workflow-step evidence
 * fields, and the offboarding_access_operations / offboarding_notice_policies /
 * offboarding_number_sequences tables) were added to the codebase without a
 * corresponding migration ever being written. Every one of those columns and
 * tables was missing from the real database. This migration closes that gap.
 */
export class FixOffboardingPhase7SchemaGap1791950000000
  implements MigrationInterface
{
  name = 'FixOffboardingPhase7SchemaGap1791950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // --- offboarding_requests: new status values ---
    const newStatusValues = [
      'pending_manager',
      'ready_for_termination',
      'termination_scheduled',
      'terminating_access',
      'access_termination_failed',
      'ready_for_finalization',
    ];
    for (const value of newStatusValues) {
      await queryRunner.query(`
        ALTER TYPE "public"."offboarding_requests_status_enum"
        ADD VALUE IF NOT EXISTS '${value}'
      `);
    }

    // --- offboarding_requests: workflow versioning, notice period,
    // access-termination scheduling, readiness and finalization columns ---
    await queryRunner.query(`
      CREATE TYPE "public"."offboarding_requests_access_termination_mode_enum" AS ENUM(
        'AT_LAST_WORKING_DAY', 'IMMEDIATE', 'MANUAL'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "offboarding_requests"
      ADD COLUMN IF NOT EXISTS "workflow_version" integer,
      ADD COLUMN IF NOT EXISTS "workflow_snapshot" jsonb,
      ADD COLUMN IF NOT EXISTS "notice_period_days" integer,
      ADD COLUMN IF NOT EXISTS "notice_period_shortfall_days" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "notice_period_excess_days" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "notice_period_waived" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "notice_period_waiver_reason" text,
      ADD COLUMN IF NOT EXISTS "access_termination_mode" "public"."offboarding_requests_access_termination_mode_enum" NOT NULL DEFAULT 'AT_LAST_WORKING_DAY',
      ADD COLUMN IF NOT EXISTS "access_termination_scheduled_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "access_termination_started_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "access_terminated_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "access_termination_failed_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "access_termination_failure_reason" text,
      ADD COLUMN IF NOT EXISTS "access_termination_attempt_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "access_termination_worker_id" varchar(150),
      ADD COLUMN IF NOT EXISTS "readiness_snapshot" jsonb,
      ADD COLUMN IF NOT EXISTS "readiness_checked_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "finalized_by_company_user_id" integer,
      ADD COLUMN IF NOT EXISTS "finalization_snapshot" jsonb,
      ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      ALTER TABLE "offboarding_requests"
      ADD CONSTRAINT "FK_offboarding_request_finalized_by_company_user"
      FOREIGN KEY ("finalized_by_company_user_id")
      REFERENCES "company_users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_offboarding_request_access_termination_schedule"
      ON "offboarding_requests" ("status", "access_termination_scheduled_at")
    `);

    // --- offboarding_workflows: versioning and locking ---
    await queryRunner.query(`
      ALTER TABLE "offboarding_workflows"
      ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "root_workflow_id" integer,
      ADD COLUMN IF NOT EXISTS "is_locked" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "locked_at" timestamptz
    `);

    await queryRunner.query(`
      ALTER TABLE "offboarding_workflows"
      ADD CONSTRAINT "FK_offboarding_workflow_root_workflow"
      FOREIGN KEY ("root_workflow_id")
      REFERENCES "offboarding_workflows"("id") ON DELETE SET NULL
    `);

    // --- offboarding_workflow_steps: evidence and system-operation columns ---
    await queryRunner.query(`
      CREATE TYPE "public"."offboarding_workflow_steps_system_operation_type_enum" AS ENUM(
        'DEACTIVATE_COMPANY_MEMBERSHIP', 'REVOKE_AUTH_SESSIONS', 'DEACTIVATE_GLOBAL_USER_IF_UNUSED',
        'END_BRANCH_ACCESS', 'END_DEPARTMENT_ACCESS', 'END_POSITION_ASSIGNMENTS', 'END_REPORTING_LINE',
        'REMOVE_ACCESS_GROUP_MEMBERSHIP', 'REMOVE_DEVICE_USER', 'REVOKE_ACCESS_CREDENTIALS',
        'CLOSE_ATTENDANCE_ASSIGNMENTS', 'CANCEL_FUTURE_LEAVE', 'GENERATE_RELIEVING_LETTER', 'GENERATE_SERVICE_LETTER'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "offboarding_workflow_steps"
      ADD COLUMN IF NOT EXISTS "completion_evidence_required" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "required_document_type_code" varchar(100),
      ADD COLUMN IF NOT EXISTS "is_system_operation" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "system_operation_type" "public"."offboarding_workflow_steps_system_operation_type_enum",
      ADD COLUMN IF NOT EXISTS "metadata" jsonb
    `);

    // --- offboarding_tasks: evidence, completion ownership, optimistic lock ---
    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      ADD COLUMN IF NOT EXISTS "is_required" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "completion_evidence_required" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "evidence_document_id" integer,
      ADD COLUMN IF NOT EXISTS "completion_data" jsonb,
      ADD COLUMN IF NOT EXISTS "completed_by_company_user_id" integer,
      ADD COLUMN IF NOT EXISTS "last_reminder_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "reminder_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "last_escalated_at" timestamptz,
      ADD COLUMN IF NOT EXISTS "escalation_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      ADD CONSTRAINT "FK_offboarding_task_completed_by_company_user"
      FOREIGN KEY ("completed_by_company_user_id")
      REFERENCES "company_users"("id") ON DELETE SET NULL
    `);

    // --- offboarding_access_operations (did not exist at all) ---
    await queryRunner.query(`
      CREATE TYPE "public"."offboarding_access_operations_operation_type_enum" AS ENUM(
        'DEACTIVATE_COMPANY_MEMBERSHIP', 'REVOKE_AUTH_SESSIONS', 'DEACTIVATE_GLOBAL_USER_IF_UNUSED',
        'END_BRANCH_ACCESS', 'END_DEPARTMENT_ACCESS', 'END_POSITION_ASSIGNMENTS', 'END_REPORTING_LINE',
        'REMOVE_ACCESS_GROUP_MEMBERSHIP', 'REMOVE_DEVICE_USER', 'REVOKE_ACCESS_CREDENTIALS',
        'CLOSE_ATTENDANCE_ASSIGNMENTS', 'CANCEL_FUTURE_LEAVE', 'GENERATE_RELIEVING_LETTER', 'GENERATE_SERVICE_LETTER'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."offboarding_access_operations_status_enum" AS ENUM(
        'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'SKIPPED'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "offboarding_access_operations" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "offboarding_request_id" integer NOT NULL,
        "operation_type" "public"."offboarding_access_operations_operation_type_enum" NOT NULL,
        "status" "public"."offboarding_access_operations_status_enum" NOT NULL DEFAULT 'PENDING',
        "scheduled_at" timestamptz,
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "failed_at" timestamptz,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "last_error" text,
        "metadata" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_offboarding_access_operations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_offboarding_access_operation_request" FOREIGN KEY ("offboarding_request_id")
          REFERENCES "offboarding_requests"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_access_operation_request"
      ON "offboarding_access_operations" ("offboarding_request_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_access_operation_status"
      ON "offboarding_access_operations" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_access_operation_due"
      ON "offboarding_access_operations" ("scheduled_at")
    `);

    // --- offboarding_notice_policies (did not exist at all) ---
    await queryRunner.query(`
      CREATE TABLE "offboarding_notice_policies" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "code" varchar(80) NOT NULL,
        "name" varchar(150) NOT NULL,
        "employment_type" varchar(40),
        "grade_id" integer,
        "position_id" integer,
        "confirmation_status" varchar(40),
        "notice_days" integer NOT NULL,
        "allow_waiver" boolean NOT NULL DEFAULT true,
        "calculate_calendar_days" boolean NOT NULL DEFAULT true,
        "priority" integer NOT NULL DEFAULT 0,
        "status" varchar(20) NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_offboarding_notice_policies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_offboarding_notice_policy_company_code" UNIQUE ("company_id", "code")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_offboarding_notice_policy_company"
      ON "offboarding_notice_policies" ("company_id")
    `);

    // --- offboarding_number_sequences (did not exist at all) ---
    await queryRunner.query(`
      CREATE TABLE "offboarding_number_sequences" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "sequence_year" integer NOT NULL,
        "next_number" integer NOT NULL DEFAULT 1,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_offboarding_number_sequences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_offboarding_number_company_year" UNIQUE ("company_id", "sequence_year")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "offboarding_number_sequences"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "offboarding_notice_policies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "offboarding_access_operations"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."offboarding_access_operations_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."offboarding_access_operations_operation_type_enum"`,
    );

    await queryRunner.query(`
      ALTER TABLE "offboarding_tasks"
      DROP CONSTRAINT IF EXISTS "FK_offboarding_task_completed_by_company_user",
      DROP COLUMN IF EXISTS "version",
      DROP COLUMN IF EXISTS "escalation_count",
      DROP COLUMN IF EXISTS "last_escalated_at",
      DROP COLUMN IF EXISTS "reminder_count",
      DROP COLUMN IF EXISTS "last_reminder_at",
      DROP COLUMN IF EXISTS "completed_by_company_user_id",
      DROP COLUMN IF EXISTS "completion_data",
      DROP COLUMN IF EXISTS "evidence_document_id",
      DROP COLUMN IF EXISTS "completion_evidence_required",
      DROP COLUMN IF EXISTS "is_required"
    `);

    await queryRunner.query(`
      ALTER TABLE "offboarding_workflow_steps"
      DROP COLUMN IF EXISTS "metadata",
      DROP COLUMN IF EXISTS "system_operation_type",
      DROP COLUMN IF EXISTS "is_system_operation",
      DROP COLUMN IF EXISTS "required_document_type_code",
      DROP COLUMN IF EXISTS "completion_evidence_required"
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."offboarding_workflow_steps_system_operation_type_enum"`,
    );

    await queryRunner.query(`
      ALTER TABLE "offboarding_workflows"
      DROP CONSTRAINT IF EXISTS "FK_offboarding_workflow_root_workflow",
      DROP COLUMN IF EXISTS "locked_at",
      DROP COLUMN IF EXISTS "is_locked",
      DROP COLUMN IF EXISTS "root_workflow_id",
      DROP COLUMN IF EXISTS "version"
    `);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_offboarding_request_access_termination_schedule"`,
    );
    await queryRunner.query(`
      ALTER TABLE "offboarding_requests"
      DROP CONSTRAINT IF EXISTS "FK_offboarding_request_finalized_by_company_user",
      DROP COLUMN IF EXISTS "version",
      DROP COLUMN IF EXISTS "finalization_snapshot",
      DROP COLUMN IF EXISTS "finalized_by_company_user_id",
      DROP COLUMN IF EXISTS "readiness_checked_at",
      DROP COLUMN IF EXISTS "readiness_snapshot",
      DROP COLUMN IF EXISTS "access_termination_worker_id",
      DROP COLUMN IF EXISTS "access_termination_attempt_count",
      DROP COLUMN IF EXISTS "access_termination_failure_reason",
      DROP COLUMN IF EXISTS "access_termination_failed_at",
      DROP COLUMN IF EXISTS "access_terminated_at",
      DROP COLUMN IF EXISTS "access_termination_started_at",
      DROP COLUMN IF EXISTS "access_termination_scheduled_at",
      DROP COLUMN IF EXISTS "access_termination_mode",
      DROP COLUMN IF EXISTS "notice_period_waiver_reason",
      DROP COLUMN IF EXISTS "notice_period_waived",
      DROP COLUMN IF EXISTS "notice_period_excess_days",
      DROP COLUMN IF EXISTS "notice_period_shortfall_days",
      DROP COLUMN IF EXISTS "notice_period_days",
      DROP COLUMN IF EXISTS "workflow_snapshot",
      DROP COLUMN IF EXISTS "workflow_version"
    `);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."offboarding_requests_access_termination_mode_enum"`,
    );

    // Note: added enum VALUEs on offboarding_requests_status_enum are not
    // reverted — Postgres does not support dropping individual enum values.
  }
}

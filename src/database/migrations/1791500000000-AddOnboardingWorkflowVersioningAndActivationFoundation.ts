import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOnboardingWorkflowVersioningAndActivationFoundation1791500000000 implements MigrationInterface {
  name = 'AddOnboardingWorkflowVersioningAndActivationFoundation1791500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'ready_for_activation'
            AND enumtypid = 'onboarding_requests_status_enum'::regtype
        ) THEN
          ALTER TYPE "public"."onboarding_requests_status_enum"
          ADD VALUE 'ready_for_activation' AFTER 'in_progress';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'activating'
            AND enumtypid = 'onboarding_requests_status_enum'::regtype
        ) THEN
          ALTER TYPE "public"."onboarding_requests_status_enum"
          ADD VALUE 'activating' AFTER 'ready_for_activation';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'activation_failed'
            AND enumtypid = 'onboarding_requests_status_enum'::regtype
        ) THEN
          ALTER TYPE "public"."onboarding_requests_status_enum"
          ADD VALUE 'activation_failed' AFTER 'activating';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'document'
            AND enumtypid = 'onboarding_workflow_steps_step_type_enum'::regtype
        ) THEN
          ALTER TYPE "public"."onboarding_workflow_steps_step_type_enum"
          ADD VALUE 'document' AFTER 'sign_off';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'acknowledgement'
            AND enumtypid = 'onboarding_workflow_steps_step_type_enum'::regtype
        ) THEN
          ALTER TYPE "public"."onboarding_workflow_steps_step_type_enum"
          ADD VALUE 'acknowledgement' AFTER 'document';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'system_action'
            AND enumtypid = 'onboarding_workflow_steps_step_type_enum'::regtype
        ) THEN
          ALTER TYPE "public"."onboarding_workflow_steps_step_type_enum"
          ADD VALUE 'system_action' AFTER 'acknowledgement';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'document'
            AND enumtypid = 'onboarding_tasks_task_type_enum'::regtype
        ) THEN
          ALTER TYPE "public"."onboarding_tasks_task_type_enum"
          ADD VALUE 'document' AFTER 'manager';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'asset'
            AND enumtypid = 'onboarding_tasks_task_type_enum'::regtype
        ) THEN
          ALTER TYPE "public"."onboarding_tasks_task_type_enum"
          ADD VALUE 'asset' AFTER 'document';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'induction'
            AND enumtypid = 'onboarding_tasks_task_type_enum'::regtype
        ) THEN
          ALTER TYPE "public"."onboarding_tasks_task_type_enum"
          ADD VALUE 'induction' AFTER 'asset';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'acknowledgement'
            AND enumtypid = 'onboarding_tasks_task_type_enum'::regtype
        ) THEN
          ALTER TYPE "public"."onboarding_tasks_task_type_enum"
          ADD VALUE 'acknowledgement' AFTER 'induction';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_enum
          WHERE enumlabel = 'system'
            AND enumtypid = 'onboarding_tasks_task_type_enum'::regtype
        ) THEN
          ALTER TYPE "public"."onboarding_tasks_task_type_enum"
          ADD VALUE 'system' AFTER 'acknowledgement';
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "onboarding_workflows"
      ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "root_workflow_id" integer,
      ADD COLUMN IF NOT EXISTS "is_locked" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "locked_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "created_by_company_user_id" integer
    `);

    await queryRunner.query(`
      ALTER TABLE "onboarding_workflow_steps"
      ADD COLUMN IF NOT EXISTS "task_type" "public"."onboarding_tasks_task_type_enum" NOT NULL DEFAULT 'general',
      ADD COLUMN IF NOT EXISTS "assigned_department_id" integer,
      ADD COLUMN IF NOT EXISTS "required_document_type_code" character varying(100),
      ADD COLUMN IF NOT EXISTS "requires_verified_document" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "completion_evidence_required" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "requires_employee_acknowledgement" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "metadata" json
    `);

    await queryRunner.query(`
      ALTER TABLE "onboarding_requests"
      ADD COLUMN IF NOT EXISTS "workflow_version" integer,
      ADD COLUMN IF NOT EXISTS "workflow_snapshot" json,
      ADD COLUMN IF NOT EXISTS "readiness_snapshot" json,
      ADD COLUMN IF NOT EXISTS "readiness_checked_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "employee_acknowledged_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "employee_acknowledged_by_user_id" integer,
      ADD COLUMN IF NOT EXISTS "employee_acknowledgement_version" character varying(50),
      ADD COLUMN IF NOT EXISTS "employee_acknowledgement_ip" character varying(45),
      ADD COLUMN IF NOT EXISTS "activation_requested_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "activation_started_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "activation_failed_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "activation_failure_reason" text,
      ADD COLUMN IF NOT EXISTS "activation_attempt_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "activation_worker_id" character varying(150),
      ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      ALTER TABLE "onboarding_tasks"
      ADD COLUMN IF NOT EXISTS "is_required" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "required_document_type_code" character varying(100),
      ADD COLUMN IF NOT EXISTS "requires_verified_document" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "completion_evidence_required" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "evidence_document_id" integer,
      ADD COLUMN IF NOT EXISTS "completion_data" json,
      ADD COLUMN IF NOT EXISTS "last_reminder_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "reminder_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "last_escalated_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "escalation_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      ALTER TABLE "onboarding_approvals"
      ADD COLUMN IF NOT EXISTS "original_approver_company_user_id" integer,
      ADD COLUMN IF NOT EXISTS "delegated_from_company_user_id" integer,
      ADD COLUMN IF NOT EXISTS "delegated_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "delegation_reason" text,
      ADD COLUMN IF NOT EXISTS "due_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "last_reminder_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "reminder_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "last_escalated_at" TIMESTAMP,
      ADD COLUMN IF NOT EXISTS "escalation_count" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_onboarding_workflow_step_department"
      ON "onboarding_workflow_steps" ("assigned_department_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "onboarding_number_sequences" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "sequence_year" integer NOT NULL,
        "next_number" integer NOT NULL DEFAULT 1,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_onboarding_number_sequences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_onboarding_number_company_year"
          UNIQUE ("company_id", "sequence_year")
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."onboarding_provisioning_operations_operation_type_enum" AS ENUM(
        'assign_roles',
        'assign_branch_access',
        'assign_shift',
        'assign_timetable',
        'assign_devices',
        'initialize_leave_balances',
        'send_account_invitation'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."onboarding_provisioning_operations_status_enum" AS ENUM(
        'pending',
        'processing',
        'completed',
        'failed',
        'skipped'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "onboarding_provisioning_operations" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "onboarding_request_id" integer NOT NULL,
        "operation_type" "public"."onboarding_provisioning_operations_operation_type_enum" NOT NULL,
        "resource_key" character varying(200) NOT NULL,
        "status" "public"."onboarding_provisioning_operations_status_enum" NOT NULL DEFAULT 'pending',
        "payload" json,
        "result" json,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "started_at" TIMESTAMP,
        "completed_at" TIMESTAMP,
        "failed_at" TIMESTAMP,
        "last_error" text,
        "next_retry_at" TIMESTAMP,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_onboarding_provisioning_operations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_onboarding_provisioning_operation"
          UNIQUE ("onboarding_request_id", "operation_type", "resource_key"),
        CONSTRAINT "FK_onboarding_provisioning_request"
          FOREIGN KEY ("onboarding_request_id")
          REFERENCES "onboarding_requests"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_onboarding_provisioning_request"
      ON "onboarding_provisioning_operations" ("onboarding_request_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_onboarding_provisioning_status"
      ON "onboarding_provisioning_operations" ("status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_onboarding_provisioning_status"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_onboarding_provisioning_request"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "onboarding_provisioning_operations"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."onboarding_provisioning_operations_status_enum"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."onboarding_provisioning_operations_operation_type_enum"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "onboarding_number_sequences"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_onboarding_workflow_step_department"
    `);

    await queryRunner.query(`
      ALTER TABLE "onboarding_approvals"
      DROP COLUMN IF EXISTS "version",
      DROP COLUMN IF EXISTS "escalation_count",
      DROP COLUMN IF EXISTS "last_escalated_at",
      DROP COLUMN IF EXISTS "reminder_count",
      DROP COLUMN IF EXISTS "last_reminder_at",
      DROP COLUMN IF EXISTS "due_at",
      DROP COLUMN IF EXISTS "delegation_reason",
      DROP COLUMN IF EXISTS "delegated_at",
      DROP COLUMN IF EXISTS "delegated_from_company_user_id",
      DROP COLUMN IF EXISTS "original_approver_company_user_id"
    `);

    await queryRunner.query(`
      ALTER TABLE "onboarding_tasks"
      DROP COLUMN IF EXISTS "version",
      DROP COLUMN IF EXISTS "escalation_count",
      DROP COLUMN IF EXISTS "last_escalated_at",
      DROP COLUMN IF EXISTS "reminder_count",
      DROP COLUMN IF EXISTS "last_reminder_at",
      DROP COLUMN IF EXISTS "completion_data",
      DROP COLUMN IF EXISTS "evidence_document_id",
      DROP COLUMN IF EXISTS "completion_evidence_required",
      DROP COLUMN IF EXISTS "requires_verified_document",
      DROP COLUMN IF EXISTS "required_document_type_code",
      DROP COLUMN IF EXISTS "is_required"
    `);

    await queryRunner.query(`
      ALTER TABLE "onboarding_requests"
      DROP COLUMN IF EXISTS "version",
      DROP COLUMN IF EXISTS "activation_worker_id",
      DROP COLUMN IF EXISTS "activation_attempt_count",
      DROP COLUMN IF EXISTS "activation_failure_reason",
      DROP COLUMN IF EXISTS "activation_failed_at",
      DROP COLUMN IF EXISTS "activation_started_at",
      DROP COLUMN IF EXISTS "activation_requested_at",
      DROP COLUMN IF EXISTS "employee_acknowledgement_ip",
      DROP COLUMN IF EXISTS "employee_acknowledgement_version",
      DROP COLUMN IF EXISTS "employee_acknowledged_by_user_id",
      DROP COLUMN IF EXISTS "employee_acknowledged_at",
      DROP COLUMN IF EXISTS "readiness_checked_at",
      DROP COLUMN IF EXISTS "readiness_snapshot",
      DROP COLUMN IF EXISTS "workflow_snapshot",
      DROP COLUMN IF EXISTS "workflow_version"
    `);

    await queryRunner.query(`
      ALTER TABLE "onboarding_workflow_steps"
      DROP COLUMN IF EXISTS "metadata",
      DROP COLUMN IF EXISTS "requires_employee_acknowledgement",
      DROP COLUMN IF EXISTS "completion_evidence_required",
      DROP COLUMN IF EXISTS "requires_verified_document",
      DROP COLUMN IF EXISTS "required_document_type_code",
      DROP COLUMN IF EXISTS "assigned_department_id",
      DROP COLUMN IF EXISTS "task_type"
    `);

    await queryRunner.query(`
      ALTER TABLE "onboarding_workflows"
      DROP COLUMN IF EXISTS "created_by_company_user_id",
      DROP COLUMN IF EXISTS "locked_at",
      DROP COLUMN IF EXISTS "is_locked",
      DROP COLUMN IF EXISTS "root_workflow_id",
      DROP COLUMN IF EXISTS "version"
    `);
  }
}

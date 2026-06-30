import { MigrationInterface, QueryRunner } from 'typeorm';

export class SimplifyOnboardingWorkflowStep1782812657963
  implements MigrationInterface
{
  name = 'SimplifyOnboardingWorkflowStep1782812657963';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add new columns
    await queryRunner.query(
      `ALTER TABLE "onboarding_workflow_steps"
       ADD COLUMN IF NOT EXISTS "step_order" integer,
       ADD COLUMN IF NOT EXISTS "name" character varying(120),
       ADD COLUMN IF NOT EXISTS "description" text,
       ADD COLUMN IF NOT EXISTS "step_type" character varying(20) NOT NULL DEFAULT 'sign_off',
       ADD COLUMN IF NOT EXISTS "assigned_role_id" integer,
       ADD COLUMN IF NOT EXISTS "assigned_user_id" integer,
       ADD COLUMN IF NOT EXISTS "due_days" integer`,
    );

    // 2. Copy existing data into new columns
    await queryRunner.query(
      `UPDATE "onboarding_workflow_steps"
       SET "step_order" = "approval_level",
           "name" = COALESCE("task_title", "step_name"),
           "description" = "task_description",
           "assigned_role_id" = CASE WHEN "approver_type" = 'role' THEN "role_id" ELSE NULL END,
           "assigned_user_id" = CASE WHEN "approver_type" = 'company_user' THEN "company_user_id" ELSE NULL END,
           "due_days" = "expected_duration_days",
           "step_type" = CASE
             WHEN "action_type" IN ('recommend', 'verify', 'approve') THEN 'sign_off'
             ELSE 'task'
           END`,
    );

    // 3. Make new required columns NOT NULL now that data is populated
    await queryRunner.query(
      `ALTER TABLE "onboarding_workflow_steps"
       ALTER COLUMN "step_order" SET NOT NULL,
       ALTER COLUMN "name" SET NOT NULL`,
    );

    // 4. Drop old unique constraint and indexes on removed columns
    await queryRunner.query(
      `ALTER TABLE "onboarding_workflow_steps"
       DROP CONSTRAINT IF EXISTS "UQ_onboarding_workflow_step_workflow_level"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_onboarding_workflow_step_role"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_onboarding_workflow_step_position"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_onboarding_workflow_step_company_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_onboarding_workflow_step_branch"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_onboarding_workflow_step_department"`,
    );

    // 5. Drop old FK constraints before dropping columns
    await queryRunner.query(
      `ALTER TABLE "onboarding_workflow_steps"
       DROP CONSTRAINT IF EXISTS "FK_onboarding_workflow_step_role",
       DROP CONSTRAINT IF EXISTS "FK_onboarding_workflow_step_position",
       DROP CONSTRAINT IF EXISTS "FK_onboarding_workflow_step_company_user",
       DROP CONSTRAINT IF EXISTS "FK_onboarding_workflow_step_branch",
       DROP CONSTRAINT IF EXISTS "FK_onboarding_workflow_step_department"`,
    );

    // 6. Drop removed columns
    await queryRunner.query(
      `ALTER TABLE "onboarding_workflow_steps"
       DROP COLUMN IF EXISTS "approval_level",
       DROP COLUMN IF EXISTS "step_name",
       DROP COLUMN IF EXISTS "task_title",
       DROP COLUMN IF EXISTS "task_description",
       DROP COLUMN IF EXISTS "task_type",
       DROP COLUMN IF EXISTS "assigned_branch_id",
       DROP COLUMN IF EXISTS "assigned_department_id",
       DROP COLUMN IF EXISTS "approver_type",
       DROP COLUMN IF EXISTS "role_id",
       DROP COLUMN IF EXISTS "position_id",
       DROP COLUMN IF EXISTS "company_user_id",
       DROP COLUMN IF EXISTS "action_type",
       DROP COLUMN IF EXISTS "expected_duration_days"`,
    );

    // 7. Add new unique constraint and indexes
    await queryRunner.query(
      `ALTER TABLE "onboarding_workflow_steps"
       ADD CONSTRAINT "UQ_onboarding_workflow_step_workflow_order"
       UNIQUE ("workflow_id", "step_order")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_onboarding_workflow_step_role"
       ON "onboarding_workflow_steps" ("assigned_role_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_onboarding_workflow_step_user"
       ON "onboarding_workflow_steps" ("assigned_user_id")`,
    );

    // 8. Add FK constraints for new columns
    await queryRunner.query(
      `ALTER TABLE "onboarding_workflow_steps"
       ADD CONSTRAINT "FK_onboarding_workflow_step_assigned_role"
       FOREIGN KEY ("assigned_role_id") REFERENCES "roles"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "onboarding_workflow_steps"
       ADD CONSTRAINT "FK_onboarding_workflow_step_assigned_user"
       FOREIGN KEY ("assigned_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse: restore removed columns, drop new ones
    await queryRunner.query(
      `ALTER TABLE "onboarding_workflow_steps"
       DROP CONSTRAINT IF EXISTS "FK_onboarding_workflow_step_assigned_role",
       DROP CONSTRAINT IF EXISTS "FK_onboarding_workflow_step_assigned_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_onboarding_workflow_step_role"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_onboarding_workflow_step_user"`,
    );
    await queryRunner.query(
      `ALTER TABLE "onboarding_workflow_steps"
       DROP CONSTRAINT IF EXISTS "UQ_onboarding_workflow_step_workflow_order"`,
    );

    await queryRunner.query(
      `ALTER TABLE "onboarding_workflow_steps"
       ADD COLUMN "approval_level" integer NOT NULL DEFAULT 0,
       ADD COLUMN "step_name" character varying(120) NOT NULL DEFAULT '',
       ADD COLUMN "task_title" character varying(255),
       ADD COLUMN "task_description" text,
       ADD COLUMN "task_type" character varying(20) NOT NULL DEFAULT 'general',
       ADD COLUMN "assigned_branch_id" integer,
       ADD COLUMN "assigned_department_id" integer,
       ADD COLUMN "approver_type" character varying(20) NOT NULL DEFAULT 'role',
       ADD COLUMN "role_id" integer,
       ADD COLUMN "position_id" integer,
       ADD COLUMN "company_user_id" integer,
       ADD COLUMN "action_type" character varying(20) NOT NULL DEFAULT 'approve',
       ADD COLUMN "expected_duration_days" integer`,
    );

    await queryRunner.query(
      `UPDATE "onboarding_workflow_steps"
       SET "approval_level" = "step_order",
           "step_name" = "name",
           "task_description" = "description",
           "role_id" = "assigned_role_id",
           "company_user_id" = "assigned_user_id",
           "expected_duration_days" = "due_days",
           "approver_type" = CASE WHEN "assigned_role_id" IS NOT NULL THEN 'role' ELSE 'company_user' END,
           "action_type" = 'approve'`,
    );

    await queryRunner.query(
      `ALTER TABLE "onboarding_workflow_steps"
       ADD CONSTRAINT "UQ_onboarding_workflow_step_workflow_level"
       UNIQUE ("workflow_id", "approval_level")`,
    );

    await queryRunner.query(
      `ALTER TABLE "onboarding_workflow_steps"
       DROP COLUMN IF EXISTS "step_order",
       DROP COLUMN IF EXISTS "name",
       DROP COLUMN IF EXISTS "description",
       DROP COLUMN IF EXISTS "step_type",
       DROP COLUMN IF EXISTS "assigned_role_id",
       DROP COLUMN IF EXISTS "assigned_user_id",
       DROP COLUMN IF EXISTS "due_days"`,
    );
  }
}

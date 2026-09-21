import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceWorkflowConfigs1789500000000 implements MigrationInterface {
  name = 'AddPerformanceWorkflowConfigs1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "performance_workflow_configs" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "code" varchar(80) NOT NULL,
        "name" varchar(160) NOT NULL,
        "description" text,
        "is_default" boolean NOT NULL DEFAULT false,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "applies_to_department_id" integer,
        "applies_to_position_id" integer,
        "review_type" varchar(60),
        "steps" jsonb NOT NULL,
        "created_by_company_user_id" integer,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_performance_workflow_configs" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_workflow_company_code" UNIQUE ("company_id", "code")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_performance_workflow_company_status_default"
       ON "performance_workflow_configs" ("company_id", "status", "is_default")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "performance_review_workflow_steps" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "performance_review_id" integer NOT NULL,
        "period_assignment_id" integer NOT NULL,
        "workflow_config_id" integer,
        "sequence_number" integer NOT NULL,
        "code" varchar(80) NOT NULL,
        "label" varchar(160) NOT NULL,
        "step_type" varchar(60) NOT NULL,
        "status" varchar(30) NOT NULL,
        "assigned_employee_id" integer,
        "assigned_company_user_id" integer,
        "acted_by_employee_id" integer,
        "acted_by_company_user_id" integer,
        "action_comment" text,
        "action_at" TIMESTAMPTZ,
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_performance_review_workflow_steps" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_review_workflow_step_sequence" UNIQUE ("performance_review_id", "sequence_number"),
        CONSTRAINT "FK_performance_review_workflow_review" FOREIGN KEY ("performance_review_id") REFERENCES "performance_reviews"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_performance_review_workflow_assignment" FOREIGN KEY ("period_assignment_id") REFERENCES "performance_period_assignments"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_performance_review_workflow_config" FOREIGN KEY ("workflow_config_id") REFERENCES "performance_workflow_configs"("id") ON DELETE SET NULL
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_performance_review_workflow_company_review"
       ON "performance_review_workflow_steps" ("company_id", "performance_review_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_performance_review_workflow_assigned_status"
       ON "performance_review_workflow_steps" ("company_id", "assigned_employee_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_performance_review_workflow_assigned_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_performance_review_workflow_company_review"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "performance_review_workflow_steps"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_performance_workflow_company_status_default"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "performance_workflow_configs"`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceDevelopmentPlans1789700000000 implements MigrationInterface {
  name = 'AddPerformanceDevelopmentPlans1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "performance_development_plans" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "manager_employee_id" integer,
        "source_review_id" integer,
        "title" varchar(160) NOT NULL,
        "description" text,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "start_date" date,
        "target_completion_date" date,
        "created_by_company_user_id" integer,
        "closed_at" TIMESTAMPTZ,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_performance_development_plans" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_performance_development_plan_company_status"
       ON "performance_development_plans" ("company_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_performance_development_plan_employee"
       ON "performance_development_plans" ("company_id", "employee_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "performance_development_goals" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "plan_id" integer NOT NULL,
        "carry_forward_from_goal_id" integer,
        "title" varchar(180) NOT NULL,
        "description" text,
        "category" varchar(60),
        "target_date" date,
        "status" varchar(30) NOT NULL DEFAULT 'OPEN',
        "progress_percent" integer NOT NULL DEFAULT 0,
        "success_measure" text,
        "support_required" text,
        "employee_comment" text,
        "manager_comment" text,
        "completed_at" TIMESTAMPTZ,
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_performance_development_goals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_performance_development_goal_plan" FOREIGN KEY ("plan_id") REFERENCES "performance_development_plans"("id") ON DELETE CASCADE
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_performance_development_goal_due_status"
       ON "performance_development_goals" ("company_id", "target_date", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_performance_development_goal_due_status"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "performance_development_goals"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_performance_development_plan_employee"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_performance_development_plan_company_status"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "performance_development_plans"`,
    );
  }
}

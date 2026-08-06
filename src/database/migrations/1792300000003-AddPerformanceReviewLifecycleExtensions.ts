import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceReviewLifecycleExtensions1792300000003
  implements MigrationInterface
{
  name = 'AddPerformanceReviewLifecycleExtensions1792300000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "performance_appeal_status_enum" AS ENUM (
        'SUBMITTED',
        'UNDER_REVIEW',
        'RESOLVED',
        'REJECTED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "performance_improvement_plan_status_enum" AS ENUM (
        'DRAFT',
        'ACTIVE',
        'COMPLETED',
        'CLOSED',
        'CANCELLED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "performance_improvement_milestone_status_enum" AS ENUM (
        'OPEN',
        'IN_PROGRESS',
        'REVIEWED',
        'COMPLETED',
        'OVERDUE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "performance_competency_category_enum" AS ENUM (
        'BEHAVIORAL',
        'MANAGERIAL',
        'TECHNICAL'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "performance_reviews"
      ADD COLUMN IF NOT EXISTS "moderation_snapshot" jsonb,
      ADD COLUMN IF NOT EXISTS "areas_of_strength" jsonb,
      ADD COLUMN IF NOT EXISTS "areas_for_improvement" jsonb,
      ADD COLUMN IF NOT EXISTS "training_needs" jsonb,
      ADD COLUMN IF NOT EXISTS "recommendations" jsonb,
      ADD COLUMN IF NOT EXISTS "appeal_deadline_at" timestamptz
    `);

    await queryRunner.query(`
      CREATE TABLE "competency_templates" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "code" varchar(80) NOT NULL,
        "name" varchar(180) NOT NULL,
        "description" text,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_competency_templates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_competency_template_company_code" UNIQUE ("company_id", "code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "competency_template_items" (
        "id" SERIAL NOT NULL,
        "template_id" integer NOT NULL,
        "code" varchar(60) NOT NULL,
        "name" varchar(180) NOT NULL,
        "description" text,
        "category" "performance_competency_category_enum" NOT NULL DEFAULT 'BEHAVIORAL',
        "weight" decimal(7,2) NOT NULL,
        "maximum_rating" decimal(7,2) NOT NULL DEFAULT 5,
        "sort_order" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_competency_template_items" PRIMARY KEY ("id"),
        CONSTRAINT "FK_competency_template_item_template" FOREIGN KEY ("template_id")
          REFERENCES "competency_templates"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "performance_competency_ratings" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "performance_review_id" integer NOT NULL,
        "template_item_code" varchar(60) NOT NULL,
        "template_item_name" varchar(180) NOT NULL,
        "category" "performance_competency_category_enum" NOT NULL DEFAULT 'BEHAVIORAL',
        "weight" decimal(7,2) NOT NULL,
        "maximum_rating" decimal(7,2) NOT NULL,
        "employee_rating" decimal(7,2),
        "manager_rating" decimal(7,2),
        "hr_rating" decimal(7,2),
        "manager_comment" text,
        "hr_comment" text,
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_performance_competency_ratings" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_competency_review_item" UNIQUE ("performance_review_id", "template_item_code")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_performance_competency_review"
      ON "performance_competency_ratings" ("performance_review_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "performance_review_moderations" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "performance_review_id" integer NOT NULL,
        "moderated_by_company_user_id" integer,
        "previous_final_score" decimal(9,4),
        "new_final_score" decimal(9,4),
        "reason" text NOT NULL,
        "snapshot" jsonb NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_performance_review_moderations" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_performance_review_moderation_review"
      ON "performance_review_moderations" ("performance_review_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "performance_improvement_plans" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "performance_review_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "manager_employee_id" integer,
        "status" "performance_improvement_plan_status_enum" NOT NULL DEFAULT 'DRAFT',
        "summary" text NOT NULL,
        "objectives" jsonb NOT NULL,
        "employee_acknowledged_at" timestamptz,
        "created_by_company_user_id" integer,
        "closed_at" timestamptz,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_performance_improvement_plans" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_improvement_plan_review" UNIQUE ("performance_review_id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_performance_improvement_plan_company_status"
      ON "performance_improvement_plans" ("company_id", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE "performance_improvement_milestones" (
        "id" SERIAL NOT NULL,
        "plan_id" integer NOT NULL,
        "title" varchar(180) NOT NULL,
        "description" text,
        "due_date" date NOT NULL,
        "status" "performance_improvement_milestone_status_enum" NOT NULL DEFAULT 'OPEN',
        "manager_comment" text,
        "reviewed_at" timestamptz,
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_performance_improvement_milestones" PRIMARY KEY ("id"),
        CONSTRAINT "FK_performance_improvement_milestone_plan" FOREIGN KEY ("plan_id")
          REFERENCES "performance_improvement_plans"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "performance_appeals" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "performance_review_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "status" "performance_appeal_status_enum" NOT NULL DEFAULT 'SUBMITTED',
        "reason" text NOT NULL,
        "requested_changes" jsonb,
        "resolution" jsonb,
        "resolved_by_company_user_id" integer,
        "resolved_at" timestamptz,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_performance_appeals" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_performance_appeal_review_status"
      ON "performance_appeals" ("performance_review_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_appeals"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_improvement_milestones"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_improvement_plans"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_review_moderations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "performance_competency_ratings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "competency_template_items"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "competency_templates"`);
    await queryRunner.query(`
      ALTER TABLE "performance_reviews"
      DROP COLUMN IF EXISTS "appeal_deadline_at",
      DROP COLUMN IF EXISTS "recommendations",
      DROP COLUMN IF EXISTS "training_needs",
      DROP COLUMN IF EXISTS "areas_for_improvement",
      DROP COLUMN IF EXISTS "areas_of_strength",
      DROP COLUMN IF EXISTS "moderation_snapshot"
    `);
    await queryRunner.query(`DROP TYPE IF EXISTS "performance_competency_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "performance_improvement_milestone_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "performance_improvement_plan_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "performance_appeal_status_enum"`);
  }
}

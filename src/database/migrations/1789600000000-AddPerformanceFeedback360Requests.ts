import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerformanceFeedback360Requests1789600000000 implements MigrationInterface {
  name = 'AddPerformanceFeedback360Requests1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "performance_feedback_360_relationship_enum" AS ENUM (
        'PEER', 'SUBORDINATE', 'MANAGER', 'STAKEHOLDER'
      )`,
    );
    await queryRunner.query(
      `CREATE TYPE "performance_feedback_360_status_enum" AS ENUM (
        'PENDING', 'SUBMITTED', 'DECLINED', 'EXPIRED'
      )`,
    );
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "performance_feedback_360_requests" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "performance_review_id" integer NOT NULL,
        "subject_employee_id" integer NOT NULL,
        "rater_employee_id" integer NOT NULL,
        "relationship_type" "performance_feedback_360_relationship_enum" NOT NULL,
        "status" "performance_feedback_360_status_enum" NOT NULL DEFAULT 'PENDING',
        "is_anonymous" boolean NOT NULL DEFAULT true,
        "due_date" date,
        "ratings" jsonb,
        "overall_score" numeric(6,2),
        "strengths" text,
        "improvement_areas" text,
        "comments" text,
        "decline_reason" text,
        "invited_by_company_user_id" integer,
        "submitted_at" TIMESTAMP WITH TIME ZONE,
        "version" integer NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_performance_feedback_360_requests" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_performance_feedback_360_review_rater" UNIQUE ("performance_review_id", "rater_employee_id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_performance_feedback_360_company_status"
       ON "performance_feedback_360_requests" ("company_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_performance_feedback_360_rater"
       ON "performance_feedback_360_requests" ("company_id", "rater_employee_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_performance_feedback_360_rater"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_performance_feedback_360_company_status"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "performance_feedback_360_requests"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "performance_feedback_360_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "performance_feedback_360_relationship_enum"`,
    );
  }
}

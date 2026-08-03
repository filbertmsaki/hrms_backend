import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeaveFinalizationFoundation1791700000000
  implements MigrationInterface
{
  name = 'AddLeaveFinalizationFoundation1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'leave_requests_duration_type_enum'
        ) THEN
          CREATE TYPE "public"."leave_requests_duration_type_enum"
          AS ENUM ('FULL_DAY', 'HALF_DAY', 'SHORT_LEAVE');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'leave_requests_half_day_session_enum'
        ) THEN
          CREATE TYPE "public"."leave_requests_half_day_session_enum"
          AS ENUM ('FIRST_HALF', 'SECOND_HALF');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'leave_policies_weekly_off_treatment_enum'
        ) THEN
          CREATE TYPE "public"."leave_policies_weekly_off_treatment_enum"
          AS ENUM ('EXCLUDE', 'INCLUDE', 'EMPLOYEE_SCHEDULE');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'leave_policies_holiday_treatment_enum'
        ) THEN
          CREATE TYPE "public"."leave_policies_holiday_treatment_enum"
          AS ENUM ('EXCLUDE', 'INCLUDE', 'EMPLOYEE_SCHEDULE');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      ADD COLUMN IF NOT EXISTS "duration_type" "public"."leave_requests_duration_type_enum" NOT NULL DEFAULT 'FULL_DAY',
      ADD COLUMN IF NOT EXISTS "half_day_session" "public"."leave_requests_half_day_session_enum",
      ADD COLUMN IF NOT EXISTS "start_time" TIME,
      ADD COLUMN IF NOT EXISTS "end_time" TIME,
      ADD COLUMN IF NOT EXISTS "requested_minutes" integer,
      ADD COLUMN IF NOT EXISTS "calculation_snapshot" jsonb,
      ADD COLUMN IF NOT EXISTS "calculation_hash" character varying(128),
      ADD COLUMN IF NOT EXISTS "calculation_version" integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "workflow_version" integer,
      ADD COLUMN IF NOT EXISTS "workflow_snapshot" jsonb,
      ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leave_number_sequences" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "sequence_year" integer NOT NULL,
        "next_number" integer NOT NULL DEFAULT 1,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_number_sequences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_leave_number_sequence_company_year"
          UNIQUE ("company_id", "sequence_year")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_policies"
      ADD COLUMN IF NOT EXISTS "applicable_branch_id" integer,
      ADD COLUMN IF NOT EXISTS "applicable_grade_id" integer,
      ADD COLUMN IF NOT EXISTS "applicable_employment_type" character varying(40),
      ADD COLUMN IF NOT EXISTS "applicable_confirmation_status" character varying(40),
      ADD COLUMN IF NOT EXISTS "allow_during_probation" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "weekly_off_treatment" "public"."leave_policies_weekly_off_treatment_enum" NOT NULL DEFAULT 'EMPLOYEE_SCHEDULE',
      ADD COLUMN IF NOT EXISTS "holiday_treatment" "public"."leave_policies_holiday_treatment_enum" NOT NULL DEFAULT 'EXCLUDE',
      ADD COLUMN IF NOT EXISTS "allow_half_day" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "allow_short_leave" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "minimum_short_leave_minutes" integer,
      ADD COLUMN IF NOT EXISTS "maximum_short_leave_minutes" integer,
      ADD COLUMN IF NOT EXISTS "minimum_notice_days" integer,
      ADD COLUMN IF NOT EXISTS "maximum_backdate_days" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "cancellation_requires_approval" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "cancellation_cutoff_days" integer NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "maximum_accumulation_days" numeric(8,2),
      ADD COLUMN IF NOT EXISTS "priority" integer NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_leave_policy_branch"
      ON "leave_policies" ("applicable_branch_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_leave_policy_grade"
      ON "leave_policies" ("applicable_grade_id")
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_policies"
      ADD CONSTRAINT "FK_leave_policies_applicable_branch"
      FOREIGN KEY ("applicable_branch_id") REFERENCES "branches"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_policies"
      ADD CONSTRAINT "FK_leave_policies_applicable_grade"
      FOREIGN KEY ("applicable_grade_id") REFERENCES "employee_grades"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_policy_types"
      ADD COLUMN IF NOT EXISTS "encashment_enabled" boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "maximum_encashment_days" numeric(8,2),
      ADD COLUMN IF NOT EXISTS "minimum_balance_after_encashment" numeric(8,2) NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS "encashment_requires_approval" boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS "maximum_accumulation_days" numeric(8,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_policy_types"
      DROP COLUMN IF EXISTS "maximum_accumulation_days",
      DROP COLUMN IF EXISTS "encashment_requires_approval",
      DROP COLUMN IF EXISTS "minimum_balance_after_encashment",
      DROP COLUMN IF EXISTS "maximum_encashment_days",
      DROP COLUMN IF EXISTS "encashment_enabled"
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_policies"
      DROP CONSTRAINT IF EXISTS "FK_leave_policies_applicable_grade"
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_policies"
      DROP CONSTRAINT IF EXISTS "FK_leave_policies_applicable_branch"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_leave_policy_grade"
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "public"."IDX_leave_policy_branch"
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_policies"
      DROP COLUMN IF EXISTS "priority",
      DROP COLUMN IF EXISTS "maximum_accumulation_days",
      DROP COLUMN IF EXISTS "cancellation_cutoff_days",
      DROP COLUMN IF EXISTS "cancellation_requires_approval",
      DROP COLUMN IF EXISTS "maximum_backdate_days",
      DROP COLUMN IF EXISTS "minimum_notice_days",
      DROP COLUMN IF EXISTS "maximum_short_leave_minutes",
      DROP COLUMN IF EXISTS "minimum_short_leave_minutes",
      DROP COLUMN IF EXISTS "allow_short_leave",
      DROP COLUMN IF EXISTS "allow_half_day",
      DROP COLUMN IF EXISTS "holiday_treatment",
      DROP COLUMN IF EXISTS "weekly_off_treatment",
      DROP COLUMN IF EXISTS "allow_during_probation",
      DROP COLUMN IF EXISTS "applicable_confirmation_status",
      DROP COLUMN IF EXISTS "applicable_employment_type",
      DROP COLUMN IF EXISTS "applicable_grade_id",
      DROP COLUMN IF EXISTS "applicable_branch_id"
    `);

    await queryRunner.query(`
      DROP TABLE IF EXISTS "leave_number_sequences"
    `);

    await queryRunner.query(`
      ALTER TABLE "leave_requests"
      DROP COLUMN IF EXISTS "version",
      DROP COLUMN IF EXISTS "workflow_snapshot",
      DROP COLUMN IF EXISTS "workflow_version",
      DROP COLUMN IF EXISTS "calculation_version",
      DROP COLUMN IF EXISTS "calculation_hash",
      DROP COLUMN IF EXISTS "calculation_snapshot",
      DROP COLUMN IF EXISTS "requested_minutes",
      DROP COLUMN IF EXISTS "end_time",
      DROP COLUMN IF EXISTS "start_time",
      DROP COLUMN IF EXISTS "half_day_session",
      DROP COLUMN IF EXISTS "duration_type"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."leave_policies_holiday_treatment_enum"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."leave_policies_weekly_off_treatment_enum"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."leave_requests_half_day_session_enum"
    `);

    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."leave_requests_duration_type_enum"
    `);
  }
}

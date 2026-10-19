import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttendanceRetentionGovernance1794100000000 implements MigrationInterface {
  name = 'CreateAttendanceRetentionGovernance1794100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendance_policies"
        ADD COLUMN "allow_offline_punches" boolean NOT NULL DEFAULT false,
        ADD COLUMN "offline_max_age_hours" integer NOT NULL DEFAULT 24,
        ADD CONSTRAINT "CHK_attendance_policy_offline_max_age"
          CHECK ("offline_max_age_hours" BETWEEN 1 AND 72)
    `);
    await queryRunner.query(`
      CREATE TABLE "attendance_data_retention_holds" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "category" character varying(32) NOT NULL,
        "record_id" integer NOT NULL,
        "active" boolean NOT NULL DEFAULT true,
        "reason" text NOT NULL,
        "created_by_company_user_id" integer,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "released_by_company_user_id" integer,
        "released_at" TIMESTAMP WITH TIME ZONE,
        "release_reason" text,
        CONSTRAINT "PK_attendance_data_retention_holds" PRIMARY KEY ("id"),
        CONSTRAINT "FK_attendance_retention_hold_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_attendance_retention_hold_active_record"
      ON "attendance_data_retention_holds" ("company_id", "category", "record_id")
      WHERE "active" = true
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_attendance_retention_holds_company_category_record_active"
      ON "attendance_data_retention_holds" ("company_id", "category", "record_id", "active")
    `);
    await queryRunner.query(`
      CREATE TABLE "attendance_retention_purge_approvals" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "category" character varying(32) NOT NULL,
        "retention_days" integer NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'PENDING',
        "reason" text NOT NULL,
        "requested_by_company_user_id" integer,
        "reviewed_by_company_user_id" integer,
        "review_note" text,
        "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "reviewed_at" TIMESTAMP WITH TIME ZONE,
        "executed_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attendance_retention_purge_approvals" PRIMARY KEY ("id"),
        CONSTRAINT "FK_attendance_retention_approval_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_attendance_retention_approval_days" CHECK ("retention_days" > 0)
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_attendance_retention_purge_company_category_status"
      ON "attendance_retention_purge_approvals" ("company_id", "category", "status")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_attendance_retention_purge_company_category_status"`,
    );
    await queryRunner.query(
      `DROP TABLE "attendance_retention_purge_approvals"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_attendance_retention_holds_company_category_record_active"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_attendance_retention_hold_active_record"`,
    );
    await queryRunner.query(`DROP TABLE "attendance_data_retention_holds"`);
    await queryRunner.query(`
      ALTER TABLE "attendance_policies"
        DROP CONSTRAINT "CHK_attendance_policy_offline_max_age",
        DROP COLUMN "offline_max_age_hours",
        DROP COLUMN "allow_offline_punches"
    `);
  }
}

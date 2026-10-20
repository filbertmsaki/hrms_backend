import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttendanceLocationPrivacyControls1794600000000 implements MigrationInterface {
  name = 'AddAttendanceLocationPrivacyControls1794600000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "attendance_data_retention_holds" DROP CONSTRAINT IF EXISTS "CHK_attendance_retention_hold_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_retention_purge_approvals" DROP CONSTRAINT IF EXISTS "CHK_attendance_retention_approval_category"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_mobile_punches" ADD COLUMN IF NOT EXISTS "location_anonymized_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_policies" ADD COLUMN IF NOT EXISTS "submission_timezone" varchar(80) NOT NULL DEFAULT 'UTC'`,
    );
    await queryRunner.query(`CREATE TABLE "attendance_location_access_logs" (
      "id" SERIAL NOT NULL, "company_id" integer NOT NULL, "actor_company_user_id" integer NOT NULL,
      "employee_id" integer NULL, "access_type" varchar(40) NOT NULL, "record_id" integer NULL,
      "record_count" integer NOT NULL DEFAULT 0, "date_from" date NULL, "date_to" date NULL,
      "purpose" text NOT NULL, "request_id" varchar(128) NULL, "ip_address" varchar(100) NULL,
      "user_agent" text NULL, "accessed_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "PK_attendance_location_access_logs" PRIMARY KEY ("id"),
      CONSTRAINT "FK_attendance_location_access_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_attendance_location_access_company_time" ON "attendance_location_access_logs" ("company_id", "accessed_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_attendance_location_access_employee_time" ON "attendance_location_access_logs" ("company_id", "employee_id", "accessed_at")`,
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_attendance_location_access_employee_time"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."IDX_attendance_location_access_company_time"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "attendance_location_access_logs"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_mobile_punches" DROP COLUMN IF EXISTS "location_anonymized_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_policies" DROP COLUMN IF EXISTS "submission_timezone"`,
    );
  }
}

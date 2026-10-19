import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttendanceWorkFromHomeRequests1793700000000 implements MigrationInterface {
  name = 'CreateAttendanceWorkFromHomeRequests1793700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."attendance_work_from_home_requests_status_enum"
      AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')
    `);
    await queryRunner.query(`
      CREATE TABLE "attendance_work_from_home_requests" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "start_date" date NOT NULL,
        "end_date" date NOT NULL,
        "reason" text NOT NULL,
        "status" "public"."attendance_work_from_home_requests_status_enum" NOT NULL DEFAULT 'PENDING',
        "reviewed_by_company_user_id" integer,
        "reviewed_at" TIMESTAMP WITH TIME ZONE,
        "review_comment" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attendance_work_from_home_requests" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_attendance_wfh_date_range" CHECK ("end_date" >= "start_date"),
        CONSTRAINT "FK_attendance_wfh_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_attendance_wfh_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_attendance_wfh_reviewer" FOREIGN KEY ("reviewed_by_company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_attendance_wfh_company_employee_dates"
      ON "attendance_work_from_home_requests" ("company_id", "employee_id", "start_date", "end_date")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_attendance_wfh_company_status"
      ON "attendance_work_from_home_requests" ("company_id", "status")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_attendance_wfh_company_status"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_attendance_wfh_company_employee_dates"`,
    );
    await queryRunner.query(`DROP TABLE "attendance_work_from_home_requests"`);
    await queryRunner.query(
      `DROP TYPE "public"."attendance_work_from_home_requests_status_enum"`,
    );
  }
}

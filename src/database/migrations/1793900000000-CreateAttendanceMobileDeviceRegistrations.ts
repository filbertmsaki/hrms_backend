import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttendanceMobileDeviceRegistrations1793900000000 implements MigrationInterface {
  name = 'CreateAttendanceMobileDeviceRegistrations1793900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "attendance_mobile_device_registrations" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer,
        "device_identifier" character varying(255) NOT NULL,
        "device_info" jsonb,
        "status" character varying(20) NOT NULL DEFAULT 'ACTIVE',
        "first_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "last_seen_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "last_employee_id" integer,
        "released_by_company_user_id" integer,
        "released_at" TIMESTAMP WITH TIME ZONE,
        "release_reason" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attendance_mobile_device_registrations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_attendance_mobile_device_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_attendance_mobile_device_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_attendance_mobile_device_reviewer" FOREIGN KEY ("released_by_company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_attendance_mobile_device_company_identifier"
      ON "attendance_mobile_device_registrations" ("company_id", "device_identifier")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_attendance_mobile_device_company_employee"
      ON "attendance_mobile_device_registrations" ("company_id", "employee_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_attendance_mobile_device_company_employee"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_attendance_mobile_device_company_identifier"`,
    );
    await queryRunner.query(
      `DROP TABLE "attendance_mobile_device_registrations"`,
    );
  }
}

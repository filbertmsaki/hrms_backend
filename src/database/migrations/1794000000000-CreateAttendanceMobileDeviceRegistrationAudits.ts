import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAttendanceMobileDeviceRegistrationAudits1794000000000 implements MigrationInterface {
  name = 'CreateAttendanceMobileDeviceRegistrationAudits1794000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "attendance_mobile_device_registration_audits" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "registration_id" integer NOT NULL,
        "device_identifier" character varying(255) NOT NULL,
        "action" character varying(20) NOT NULL,
        "previous_employee_id" integer,
        "employee_id" integer,
        "actor_company_user_id" integer,
        "reason" text,
        "device_info" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_attendance_mobile_device_registration_audits" PRIMARY KEY ("id"),
        CONSTRAINT "FK_attendance_mobile_device_audit_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_attendance_mobile_device_audit_registration" FOREIGN KEY ("registration_id") REFERENCES "attendance_mobile_device_registrations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_attendance_mobile_device_audit_previous_employee" FOREIGN KEY ("previous_employee_id") REFERENCES "employees"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_attendance_mobile_device_audit_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_attendance_mobile_device_audit_actor" FOREIGN KEY ("actor_company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_attendance_mobile_device_audits_company_registration"
      ON "attendance_mobile_device_registration_audits" ("company_id", "registration_id", "created_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_attendance_mobile_device_audits_company_registration"`,
    );
    await queryRunner.query(
      `DROP TABLE "attendance_mobile_device_registration_audits"`,
    );
  }
}

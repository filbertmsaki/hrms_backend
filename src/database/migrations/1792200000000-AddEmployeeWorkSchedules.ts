import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeWorkSchedules1792200000000 implements MigrationInterface {
  name = 'AddEmployeeWorkSchedules1792200000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "employee_work_schedules" ("id" SERIAL NOT NULL, "company_id" integer NOT NULL, "employee_id" integer NOT NULL, "schedule_date" date NOT NULL, "shift_id" integer, "timetable_id" integer, "timetable_day_shift_option_id" integer, "is_off_day" boolean NOT NULL DEFAULT false, "status" character varying(16) NOT NULL DEFAULT 'DRAFT', "source" character varying(32) NOT NULL DEFAULT 'MANUAL', "assigned_by" integer, "published_by" integer, "published_at" TIMESTAMP WITH TIME ZONE, "remarks" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_employee_work_schedules" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_employee_work_schedule_company_employee_date" ON "employee_work_schedules" ("company_id", "employee_id", "schedule_date")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_employee_work_schedule_publish_lookup" ON "employee_work_schedules" ("company_id", "employee_id", "schedule_date", "status")`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_work_schedules" ADD CONSTRAINT "FK_employee_work_schedules_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_work_schedules" ADD CONSTRAINT "FK_employee_work_schedules_employee" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_work_schedules" ADD CONSTRAINT "FK_employee_work_schedules_shift" FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_work_schedules" ADD CONSTRAINT "FK_employee_work_schedules_timetable" FOREIGN KEY ("timetable_id") REFERENCES "timetables"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_work_schedules" ADD CONSTRAINT "FK_employee_work_schedules_option" FOREIGN KEY ("timetable_day_shift_option_id") REFERENCES "timetable_day_shift_options"("id") ON DELETE SET NULL`,
    );
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "employee_work_schedules"`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttendanceScheduleAuditLogs1792300000000 implements MigrationInterface {
  name = 'AddAttendanceScheduleAuditLogs1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "attendance_schedule_audit_logs" ("id" SERIAL NOT NULL, "company_id" integer NOT NULL, "entity_type" character varying(40) NOT NULL, "entity_id" integer NOT NULL, "action" character varying(24) NOT NULL, "actor_user_id" integer, "before_state" jsonb, "after_state" jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_attendance_schedule_audit_logs" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_attendance_schedule_audit_company_entity" ON "attendance_schedule_audit_logs" ("company_id", "entity_type", "entity_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_schedule_audit_logs" ADD CONSTRAINT "FK_attendance_schedule_audit_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "attendance_schedule_audit_logs"`);
  }
}

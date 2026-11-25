import { MigrationInterface, QueryRunner } from 'typeorm';

export class FieldAttendanceIntegration1797900216000 implements MigrationInterface {
  name = 'FieldAttendanceIntegration1797900216000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "activity_policies" ADD COLUMN IF NOT EXISTS "field_attendance_mode" varchar(30) NOT NULL DEFAULT 'NONE'`,
    );
    await queryRunner.query(
      `ALTER TABLE "field_visit_location_events" ADD COLUMN IF NOT EXISTS "attendance_sync_status" varchar(30)`,
    );
    await queryRunner.query(
      `ALTER TABLE "field_visit_location_events" ADD COLUMN IF NOT EXISTS "attendance_sync_message" text`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "field_visit_location_events" DROP COLUMN IF EXISTS "attendance_sync_message"`,
    );
    await queryRunner.query(
      `ALTER TABLE "field_visit_location_events" DROP COLUMN IF EXISTS "attendance_sync_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "activity_policies" DROP COLUMN IF EXISTS "field_attendance_mode"`,
    );
  }
}

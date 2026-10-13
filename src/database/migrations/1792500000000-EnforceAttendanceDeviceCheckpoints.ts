import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceAttendanceDeviceCheckpoints1792500000000 implements MigrationInterface {
  name = 'EnforceAttendanceDeviceCheckpoints1792500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."attendance_processing_exceptions_exception_type_enum" ADD VALUE IF NOT EXISTS 'DEVICE_CHECKPOINT_NOT_SATISFIED'`,
    );
  }

  async down(): Promise<void> {
    // PostgreSQL does not support removing an enum value without rebuilding the type.
  }
}

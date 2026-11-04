import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmployeeAttendanceExemption1797000000000 implements MigrationInterface {
  name = 'AddEmployeeAttendanceExemption1797000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "attendance_exempt_from" date NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "employees" ADD COLUMN IF NOT EXISTS "attendance_exempt_reason" varchar(255) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "employees" DROP COLUMN IF EXISTS "attendance_exempt_reason"',
    );
    await queryRunner.query(
      'ALTER TABLE "employees" DROP COLUMN IF EXISTS "attendance_exempt_from"',
    );
  }
}

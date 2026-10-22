import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttendanceRegularizationPolicy1795700000000 implements MigrationInterface {
  name = 'AddAttendanceRegularizationPolicy1795700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "attendance_policies" ADD "regularization_backdate_days" integer',
    );
    await queryRunner.query(
      'ALTER TABLE "attendance_policies" ADD "regularization_monthly_request_limit" integer',
    );
    await queryRunner.query(
      'ALTER TABLE "attendance_policies" ADD "regularization_reason_required" boolean NOT NULL DEFAULT false',
    );
    await queryRunner.query(
      'ALTER TABLE "attendance_policies" ADD CONSTRAINT "CHK_attendance_policy_regularization_backdate" CHECK ("regularization_backdate_days" IS NULL OR "regularization_backdate_days" BETWEEN 0 AND 365)',
    );
    await queryRunner.query(
      'ALTER TABLE "attendance_policies" ADD CONSTRAINT "CHK_attendance_policy_regularization_monthly_limit" CHECK ("regularization_monthly_request_limit" IS NULL OR "regularization_monthly_request_limit" BETWEEN 1 AND 31)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "attendance_policies" DROP CONSTRAINT "CHK_attendance_policy_regularization_monthly_limit"',
    );
    await queryRunner.query(
      'ALTER TABLE "attendance_policies" DROP CONSTRAINT "CHK_attendance_policy_regularization_backdate"',
    );
    await queryRunner.query(
      'ALTER TABLE "attendance_policies" DROP COLUMN "regularization_reason_required"',
    );
    await queryRunner.query(
      'ALTER TABLE "attendance_policies" DROP COLUMN "regularization_monthly_request_limit"',
    );
    await queryRunner.query(
      'ALTER TABLE "attendance_policies" DROP COLUMN "regularization_backdate_days"',
    );
  }
}

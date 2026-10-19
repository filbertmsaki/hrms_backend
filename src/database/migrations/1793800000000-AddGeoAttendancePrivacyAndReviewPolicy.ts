import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGeoAttendancePrivacyAndReviewPolicy1793800000000 implements MigrationInterface {
  name = 'AddGeoAttendancePrivacyAndReviewPolicy1793800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendance_policies"
        ADD COLUMN "allow_location_exception_override" boolean NOT NULL DEFAULT false,
        ADD COLUMN "require_selfie_for_check_in" boolean NOT NULL DEFAULT false,
        ADD COLUMN "require_selfie_for_check_out" boolean NOT NULL DEFAULT false,
        ADD COLUMN "prevent_mobile_device_sharing" boolean NOT NULL DEFAULT false
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "attendance_policies"
        DROP COLUMN "prevent_mobile_device_sharing",
        DROP COLUMN "require_selfie_for_check_out",
        DROP COLUMN "require_selfie_for_check_in",
        DROP COLUMN "allow_location_exception_override"
    `);
  }
}

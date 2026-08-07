import { MigrationInterface, QueryRunner } from 'typeorm';

// Postgres cannot use a newly added enum value inside the same transaction that
// added it, so this migration only adds enum values; schema/column changes that
// reference them live in the following migration.
export class AddLeaveStatusEnumValues1786102000000 implements MigrationInterface {
  name = 'AddLeaveStatusEnumValues1786102000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."leave_requests_status_enum" ADD VALUE IF NOT EXISTS 'pending_department_manager'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."leave_requests_status_enum" ADD VALUE IF NOT EXISTS 'pending_hr'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."leave_requests_status_enum" ADD VALUE IF NOT EXISTS 'returned_for_correction'
    `);
    await queryRunner.query(`
      ALTER TYPE "public"."leave_request_approvals_status_enum" ADD VALUE IF NOT EXISTS 'returned'
    `);
  }

  public down(queryRunner: QueryRunner): Promise<void> {
    // Postgres does not support DROP VALUE on enum types; reverting these
    // values requires recreating the enum type, which is not safe to do
    // automatically once rows may reference them. Intentional no-op.
    void queryRunner;
    return Promise.resolve();
  }
}

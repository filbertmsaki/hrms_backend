import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProbationEmploymentType1795100000000 implements MigrationInterface {
  name = 'AddProbationEmploymentType1795100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."employees_employment_type_enum"
      ADD VALUE IF NOT EXISTS 'probation'
    `);
  }

  async down(): Promise<void> {
    // PostgreSQL enum values are intentionally retained on rollback to avoid data loss.
  }
}

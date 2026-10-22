import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeceasedEmploymentStatus1795200000000 implements MigrationInterface {
  name = 'AddDeceasedEmploymentStatus1795200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."employees_employment_status_enum"
      ADD VALUE IF NOT EXISTS 'deceased'
    `);
  }

  async down(): Promise<void> {
    // Keep the PostgreSQL enum label on rollback to avoid invalidating records.
  }
}

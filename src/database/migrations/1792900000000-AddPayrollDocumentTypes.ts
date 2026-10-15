import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayrollDocumentTypes1792900000000 implements MigrationInterface {
  name = 'AddPayrollDocumentTypes1792900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."documents_entity_type_enum" ADD VALUE IF NOT EXISTS 'PAYSLIP'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."documents_module_enum" ADD VALUE IF NOT EXISTS 'PAYROLL'`,
    );
  }

  async down(): Promise<void> {
    // PostgreSQL enum values are intentionally retained on rollback.
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class UniquePayrollPaymentImportReference1792700000000 implements MigrationInterface {
  name = 'UniquePayrollPaymentImportReference1792700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_payroll_payment_import_run_reference"
      ON "payroll_payment_imports" ("company_id", "payroll_run_id", "payment_reference")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_payroll_payment_import_run_reference"
    `);
  }
}

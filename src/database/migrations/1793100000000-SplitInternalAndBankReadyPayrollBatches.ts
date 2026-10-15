import { MigrationInterface, QueryRunner } from 'typeorm';

export class SplitInternalAndBankReadyPayrollBatches1793100000000 implements MigrationInterface {
  name = 'SplitInternalAndBankReadyPayrollBatches1793100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payroll_bank_batches" ADD COLUMN IF NOT EXISTS "batch_type" character varying(30) NOT NULL DEFAULT 'INTERNAL'`,
    );
    await queryRunner.query(
      `UPDATE "payroll_bank_batches" SET "batch_type" = 'BANK_READY' WHERE "snapshot"->>'encrypted' = 'true'`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_bank_batches" DROP CONSTRAINT IF EXISTS "UQ_payroll_bank_batch_run"`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_payroll_bank_batch_run_type" ON "payroll_bank_batches" ("company_id", "payroll_run_id", "batch_type")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const duplicateRuns = (await queryRunner.query(
      `SELECT 1 FROM "payroll_bank_batches" GROUP BY "company_id", "payroll_run_id" HAVING COUNT(*) > 1 LIMIT 1`,
    )) as unknown[];
    if (duplicateRuns.length > 0) {
      throw new Error(
        'Cannot revert batch types while an internal and bank-ready batch both exist for a payroll run.',
      );
    }
    await queryRunner.query(
      `DROP INDEX IF EXISTS "UQ_payroll_bank_batch_run_type"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_bank_batches" ADD CONSTRAINT "UQ_payroll_bank_batch_run" UNIQUE ("company_id", "payroll_run_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_bank_batches" DROP COLUMN IF EXISTS "batch_type"`,
    );
  }
}

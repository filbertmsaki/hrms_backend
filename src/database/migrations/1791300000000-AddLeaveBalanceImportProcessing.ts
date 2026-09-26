import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeaveBalanceImportProcessing1791300000000 implements MigrationInterface {
  name = 'AddLeaveBalanceImportProcessing1791300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "leave_balance_import_batches"
      ADD COLUMN "processed_rows" integer NOT NULL DEFAULT 0,
      ADD COLUMN "processing_context" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "leave_balance_import_batches"
      DROP COLUMN "processing_context",
      DROP COLUMN "processed_rows"`);
  }
}

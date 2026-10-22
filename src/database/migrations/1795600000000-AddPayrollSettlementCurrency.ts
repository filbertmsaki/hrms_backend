import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayrollSettlementCurrency1795600000000 implements MigrationInterface {
  name = 'AddPayrollSettlementCurrency1795600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payroll_final_settlements" ADD COLUMN IF NOT EXISTS "currency" character varying(10)`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payroll_final_settlements" DROP COLUMN IF EXISTS "currency"`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayrollRunGroup1789900000000 implements MigrationInterface {
  name = 'AddPayrollRunGroup1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payroll_runs" ADD COLUMN IF NOT EXISTS "payroll_group_id" integer`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_run_group"
       ON "payroll_runs" ("company_id", "payroll_group_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_payroll_run_group"`);
    await queryRunner.query(
      `ALTER TABLE "payroll_runs" DROP COLUMN IF EXISTS "payroll_group_id"`,
    );
  }
}

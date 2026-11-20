import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowDirectAccessReconciliation1797900090000 implements MigrationInterface {
  name = 'AllowDirectAccessReconciliation1797900090000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "access_reconciliation_operations" ALTER COLUMN "source_group_id" DROP NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "access_reconciliation_operations" ALTER COLUMN "employee_id" DROP NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "access_reconciliation_operations" ADD COLUMN "unresolved_employee_no" varchar(100)',
    );
    await queryRunner.query(
      'ALTER TABLE "access_reconciliation_operations" ADD COLUMN "effective_date" date',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      'SELECT COUNT(*) AS count FROM "access_reconciliation_operations" WHERE "source_group_id" IS NULL OR "employee_id" IS NULL',
    )) as Array<{ count: string }>;
    if (Number(rows[0].count))
      throw new Error(
        'Cannot revert while direct reconciliation records exist.',
      );
    await queryRunner.query(
      'ALTER TABLE "access_reconciliation_operations" ALTER COLUMN "source_group_id" SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "access_reconciliation_operations" ALTER COLUMN "employee_id" SET NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "access_reconciliation_operations" DROP COLUMN "unresolved_employee_no"',
    );
    await queryRunner.query(
      'ALTER TABLE "access_reconciliation_operations" DROP COLUMN "effective_date"',
    );
  }
}

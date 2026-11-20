import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccessReconciliationOperations1797900040000 implements MigrationInterface {
  name = 'CreateAccessReconciliationOperations1797900040000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "access_reconciliation_operations" ("id" SERIAL PRIMARY KEY, "company_id" integer NOT NULL, "employee_id" integer NOT NULL, "device_id" integer NOT NULL, "source_group_id" integer NOT NULL, "requested_by_company_user_id" integer, "reason" varchar(32) NOT NULL, "status" varchar(32) NOT NULL DEFAULT 'PENDING_REVIEW', "last_error" text, "created_at" timestamptz NOT NULL DEFAULT now(), "updated_at" timestamptz NOT NULL DEFAULT now())`,
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_access_reconciliation_company_status" ON "access_reconciliation_operations" ("company_id", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_access_reconciliation_employee_device" ON "access_reconciliation_operations" ("company_id", "employee_id", "device_id")',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    const rows = (await queryRunner.query(
      'SELECT COUNT(*) AS count FROM "access_reconciliation_operations"',
    )) as Array<{ count: string }>;
    if (Number(rows[0].count) > 0)
      throw new Error(
        'Cannot remove access reconciliation history while operations exist.',
      );
    await queryRunner.query('DROP TABLE "access_reconciliation_operations"');
  }
}

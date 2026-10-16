import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFinanceApplicationNumberSequence1791900000000 implements MigrationInterface {
  name = 'AddFinanceApplicationNumberSequence1791900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!queryRunner.isTransactionActive) {
      throw new Error(
        'Finance sequence initialization requires a transactional migration.',
      );
    }
    // Block legacy writers while the initial high-water mark is captured.
    await queryRunner.query(
      'LOCK TABLE "employee_finance_applications" IN SHARE ROW EXCLUSIVE MODE',
    );
    await queryRunner.query(`
      CREATE SEQUENCE "employee_finance_application_number_seq"
      AS bigint START WITH 1 INCREMENT BY 1 MINVALUE 1 NO CYCLE CACHE 1
    `);
    await queryRunner.query(`
      SELECT setval(
        'employee_finance_application_number_seq',
        GREATEST(COALESCE(MAX(substring("application_no" FROM '^EFAPP-[0-9]+-([0-9]+)$')::bigint), 0), 1),
        COALESCE(MAX(substring("application_no" FROM '^EFAPP-[0-9]+-([0-9]+)$')::bigint), 0) > 0
      )
      FROM "employee_finance_applications"
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP SEQUENCE "employee_finance_application_number_seq"',
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

const columns = [
  'previous_balance_days',
  'amount_days',
  'new_balance_days',
  'previous_pending_days',
  'pending_delta_days',
  'new_pending_days',
  'previous_used_days',
  'used_delta_days',
  'new_used_days',
];

export class LeaveLedgerFourDecimalPrecision1797900010000 implements MigrationInterface {
  name = 'LeaveLedgerFourDecimalPrecision1797900010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const column of columns) {
      await queryRunner.query(
        `ALTER TABLE "leave_balance_transactions" ALTER COLUMN "${column}" TYPE numeric(10,4)`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const fractions = columns
      .map((column) => `"${column}" <> round("${column}", 2)`)
      .join(' OR ');
    const rows = (await queryRunner.query(
      `SELECT count(*) AS count FROM "leave_balance_transactions" WHERE ${fractions}`,
    )) as Array<{ count: string }>;
    if (Number(rows[0].count) > 0)
      throw new Error(
        'Cannot reduce ledger precision: four-decimal entries exist',
      );
    for (const column of columns) {
      await queryRunner.query(
        `ALTER TABLE "leave_balance_transactions" ALTER COLUMN "${column}" TYPE numeric(8,2)`,
      );
    }
  }
}

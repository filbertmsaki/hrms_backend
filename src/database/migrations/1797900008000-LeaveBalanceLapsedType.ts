import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveBalanceLapsedType1797900008000 implements MigrationInterface {
  name = 'LeaveBalanceLapsedType1797900008000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TYPE "public"."leave_balance_transaction_type_enum" ADD VALUE IF NOT EXISTS 'LAPSED'`,
    );
  }

  down(): Promise<void> {
    // Postgres cannot drop an enum value; LAPSED rows are history only.
    return Promise.resolve();
  }
}

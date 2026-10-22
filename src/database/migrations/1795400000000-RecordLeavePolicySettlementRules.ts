import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecordLeavePolicySettlementRules1795400000000 implements MigrationInterface {
  name = 'RecordLeavePolicySettlementRules1795400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "leave_policy_types" ADD "encashment_rate_divisor" numeric(8,2)',
    );
    await queryRunner.query(
      'ALTER TABLE "leave_balances" ADD "policy_id" integer',
    );
    await queryRunner.query(
      'ALTER TABLE "leave_balances" ADD "policy_type_id" integer',
    );
    await queryRunner.query(
      'ALTER TABLE "leave_balances" ADD CONSTRAINT "FK_leave_balance_policy" FOREIGN KEY ("policy_id") REFERENCES "leave_policies"("id") ON DELETE SET NULL',
    );
    await queryRunner.query(
      'ALTER TABLE "leave_balances" ADD CONSTRAINT "FK_leave_balance_policy_type" FOREIGN KEY ("policy_type_id") REFERENCES "leave_policy_types"("id") ON DELETE SET NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "leave_balances" DROP CONSTRAINT "FK_leave_balance_policy_type"',
    );
    await queryRunner.query(
      'ALTER TABLE "leave_balances" DROP CONSTRAINT "FK_leave_balance_policy"',
    );
    await queryRunner.query(
      'ALTER TABLE "leave_balances" DROP COLUMN "policy_type_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "leave_balances" DROP COLUMN "policy_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "leave_policy_types" DROP COLUMN "encashment_rate_divisor"',
    );
  }
}

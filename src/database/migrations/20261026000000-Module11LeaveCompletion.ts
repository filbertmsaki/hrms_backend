import { MigrationInterface, QueryRunner } from 'typeorm';

export class Module11LeaveCompletion20261026000000 implements MigrationInterface {
  name = 'Module11LeaveCompletion20261026000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leave_encashment_requests" ADD COLUMN IF NOT EXISTS "payroll_period_code" varchar(30)`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_encashment_requests" ADD COLUMN IF NOT EXISTS "currency" varchar(3)`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_encashment_requests" ADD COLUMN IF NOT EXISTS "payable_amount" numeric(14,2)`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_encashment_requests" ADD COLUMN IF NOT EXISTS "payment_status" varchar(20) NOT NULL DEFAULT 'NOT_PAID'`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_encashment_requests" ADD COLUMN IF NOT EXISTS "paid_at" timestamp`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_encashment_requests" ADD COLUMN IF NOT EXISTS "payment_reference" varchar(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "requested_minutes" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "comp_off_enabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "comp_off_expiry_days" integer`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_types" ADD COLUMN IF NOT EXISTS "comp_off_requires_approval" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "leave_types" DROP COLUMN IF EXISTS "comp_off_requires_approval"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_types" DROP COLUMN IF EXISTS "comp_off_expiry_days"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_types" DROP COLUMN IF EXISTS "comp_off_enabled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "requested_minutes"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_encashment_requests" DROP COLUMN IF EXISTS "payment_reference"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_encashment_requests" DROP COLUMN IF EXISTS "paid_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_encashment_requests" DROP COLUMN IF EXISTS "payment_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_encashment_requests" DROP COLUMN IF EXISTS "payable_amount"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_encashment_requests" DROP COLUMN IF EXISTS "currency"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_encashment_requests" DROP COLUMN IF EXISTS "payroll_period_code"`,
    );
  }
}

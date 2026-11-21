import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Payroll rejection sends a run back to DRAFT; recalculating unchanged inputs
 * reproduces the same calculation hash. Approval decisions are therefore keyed
 * by calculation round (the run's started_at) as well as hash, so a stage can
 * be approved again and stale approvals never count toward lock.
 *
 * Existing decisions are backfilled with their run's current started_at, so
 * approvals already in progress stay valid.
 */
export class PayrollApprovalCalculationRound1797900041500 implements MigrationInterface {
  name = 'PayrollApprovalCalculationRound1797900041500';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payroll_run_approvals"
       ADD COLUMN IF NOT EXISTS "calculation_started_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `UPDATE "payroll_run_approvals" approval
       SET "calculation_started_at" = run."started_at"
       FROM "payroll_runs" run
       WHERE run."id" = approval."payroll_run_id"
         AND approval."calculation_started_at" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_run_approvals"
       DROP CONSTRAINT IF EXISTS "UQ_payroll_run_approval_stage_hash"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_run_approvals"
       ADD CONSTRAINT "UQ_payroll_run_approval_stage_hash_round"
       UNIQUE ("payroll_run_id", "stage", "calculation_hash", "calculation_started_at")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Rounds created after a rejection would violate the old constraint; keep
    // only the latest decision per (run, stage, hash) before restoring it.
    await queryRunner.query(
      `DELETE FROM "payroll_run_approvals" a
       USING "payroll_run_approvals" b
       WHERE a."payroll_run_id" = b."payroll_run_id"
         AND a."stage" = b."stage"
         AND a."calculation_hash" = b."calculation_hash"
         AND a."id" < b."id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_run_approvals"
       DROP CONSTRAINT IF EXISTS "UQ_payroll_run_approval_stage_hash_round"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_run_approvals"
       ADD CONSTRAINT "UQ_payroll_run_approval_stage_hash"
       UNIQUE ("payroll_run_id", "stage", "calculation_hash")`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_run_approvals" DROP COLUMN IF EXISTS "calculation_started_at"`,
    );
  }
}

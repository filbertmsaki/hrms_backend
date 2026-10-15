import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayrollGenerationSecurity1792600000000 implements MigrationInterface {
  name = 'AddPayrollGenerationSecurity1792600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "payroll_run_approvals"
      DROP CONSTRAINT IF EXISTS "UQ_payroll_run_approval_stage"
    `);
    await queryRunner.query(`
      ALTER TABLE "payroll_run_approvals"
      ADD CONSTRAINT "UQ_payroll_run_approval_stage_hash"
      UNIQUE ("payroll_run_id", "stage", "calculation_hash")
    `);
    await queryRunner.query(`
      CREATE TABLE "payroll_security_policies" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL,
        "allow_verified_login" boolean NOT NULL DEFAULT FALSE,
        "allow_fresh_authenticator" boolean NOT NULL DEFAULT TRUE,
        "updated_by_company_user_id" integer NULL,
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_payroll_security_policy_company" UNIQUE ("company_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "payroll_generation_challenges" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL,
        "actor_company_user_id" integer NOT NULL,
        "payroll_run_id" integer NOT NULL,
        "challenge_fingerprint" varchar(64) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_payroll_generation_challenge_actor_fingerprint"
          UNIQUE ("company_id", "actor_company_user_id", "challenge_fingerprint")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payroll_generation_challenge_expiry"
      ON "payroll_generation_challenges" ("expires_at")
    `);
    await queryRunner.query(`
      INSERT INTO "payroll_security_policies" (
        "company_id", "allow_verified_login", "allow_fresh_authenticator"
      )
      SELECT DISTINCT "company_id", FALSE, TRUE FROM "payroll_runs"
      ON CONFLICT ("company_id") DO NOTHING
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payroll_generation_challenge_expiry"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "payroll_generation_challenges"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_security_policies"`);
    await queryRunner.query(`
      ALTER TABLE "payroll_run_approvals"
      DROP CONSTRAINT IF EXISTS "UQ_payroll_run_approval_stage_hash"
    `);
    await queryRunner.query(`
      ALTER TABLE "payroll_run_approvals"
      ADD CONSTRAINT "UQ_payroll_run_approval_stage"
      UNIQUE ("payroll_run_id", "stage")
    `);
  }
}

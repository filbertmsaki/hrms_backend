import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Configurable payroll approval sequences (company, branch or payroll group).
 * With no row, runs keep the historical HR → Finance → Management sequence.
 */
export class PayrollApprovalWorkflows1797900043000 implements MigrationInterface {
  name = 'PayrollApprovalWorkflows1797900043000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_approval_workflows" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "scope" character varying(20) NOT NULL,
        "branch_id" integer NULL,
        "payroll_group_id" integer NULL,
        "name" character varying(120) NOT NULL,
        "stages" jsonb NOT NULL,
        "delegations" jsonb NULL,
        "version_number" integer NOT NULL DEFAULT 1,
        "status" character varying(20) NOT NULL DEFAULT 'ACTIVE',
        "created_by_company_user_id" integer NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_approval_workflows" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_approval_workflow_scope"
       ON "payroll_approval_workflows" ("company_id", "scope", "status")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "payroll_approval_workflows"`,
    );
  }
}

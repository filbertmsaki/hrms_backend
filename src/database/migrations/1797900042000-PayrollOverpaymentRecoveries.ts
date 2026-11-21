import { MigrationInterface, QueryRunner } from 'typeorm';

const PERMISSIONS: Array<[string, string, string, string]> = [
  [
    'payroll:recoveries:manage',
    'Manage payroll overpayment recoveries',
    'Raise overpayment recoveries, record refunds and cancel recoveries',
    'payroll:inputs',
  ],
  [
    'payroll:recoveries:approve',
    'Approve payroll overpayment recoveries',
    'Approve or reject overpayment recoveries independently of the requester',
    'payroll:runs:approve',
  ],
];

/**
 * Overpayment recovery for paid payroll: the original payroll is never
 * modified; recovery is tracked here and settled through later payroll
 * deductions, verified refunds or accounting adjustments.
 */
export class PayrollOverpaymentRecoveries1797900042000 implements MigrationInterface {
  name = 'PayrollOverpaymentRecoveries1797900042000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_overpayment_recoveries" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "original_payroll_run_id" integer NOT NULL,
        "correction_payroll_run_id" integer NULL,
        "overpaid_amount" numeric(18,2) NOT NULL,
        "recovered_amount" numeric(18,2) NOT NULL DEFAULT '0',
        "method" character varying(30) NOT NULL,
        "installment_amount" numeric(18,2) NULL,
        "legal_basis" character varying(30) NOT NULL,
        "consent_reference" text NULL,
        "reason" text NOT NULL,
        "status" character varying(30) NOT NULL DEFAULT 'PENDING_APPROVAL',
        "created_by_company_user_id" integer NULL,
        "approved_by_company_user_id" integer NULL,
        "approved_at" TIMESTAMP WITH TIME ZONE NULL,
        "decision_note" text NULL,
        "version" integer NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_overpayment_recoveries" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_recovery_company_employee_status"
       ON "payroll_overpayment_recoveries" ("company_id", "employee_id", "status")`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_overpayment_recovery_entries" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "recovery_id" integer NOT NULL,
        "entry_type" character varying(30) NOT NULL,
        "amount" numeric(18,2) NOT NULL,
        "payroll_run_id" integer NULL,
        "employee_payroll_result_id" integer NULL,
        "reference" character varying(120) NULL,
        "evidence" text NULL,
        "idempotency_key" character varying(160) NOT NULL,
        "created_by_company_user_id" integer NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_payroll_recovery_entry_idempotency" UNIQUE ("company_id", "idempotency_key"),
        CONSTRAINT "PK_payroll_overpayment_recovery_entries" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_recovery_entry_recovery"
       ON "payroll_overpayment_recovery_entries" ("recovery_id")`,
    );
    for (const [name, displayName, description, grantFrom] of PERMISSIONS) {
      await queryRunner.query(
        `INSERT INTO "permissions" ("name", "display_name", "description", "scope", "is_system_generated")
         VALUES ($1, $2, $3, 'company', true)
         ON CONFLICT ("name") DO NOTHING`,
        [name, displayName, description],
      );
      await queryRunner.query(
        `INSERT INTO "permission_role" ("rolesId", "permissionsId")
         SELECT DISTINCT grant_row."rolesId", permission."id"
         FROM "permission_role" grant_row
         JOIN "permissions" source_permission
           ON source_permission."id" = grant_row."permissionsId"
          AND source_permission."name" = $2
         JOIN "permissions" permission ON permission."name" = $1
         ON CONFLICT DO NOTHING`,
        [name, grantFrom],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const names = PERMISSIONS.map(([name]) => name);
    await queryRunner.query(
      `DELETE FROM "permission_role"
       WHERE "permissionsId" IN (SELECT "id" FROM "permissions" WHERE "name" = ANY($1))`,
      [names],
    );
    await queryRunner.query(
      `DELETE FROM "permissions" WHERE "name" = ANY($1)`,
      [names],
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "payroll_overpayment_recovery_entries"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS "payroll_overpayment_recoveries"`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
  removePermissions,
  revokePermissionsFromSystemRoles,
} from '../migration-helpers/role-permission-grants';

const PERMISSIONS = [
  {
    name: 'leave_balance_recalculation:preview',
    displayName: 'Preview Leave Balance Recalculation',
    description:
      'Run a leave balance recalculation preview (dry run, changes nothing)',
  },
  {
    name: 'leave_balance_recalculation:employee',
    displayName: 'Recalculate Employee Leave Balance',
    description:
      "Apply previewed corrections to one employee's leave balances (reason required, audited)",
  },
  {
    name: 'leave_balance_recalculation:bulk',
    displayName: 'Bulk Leave Balance Recalculation',
    description:
      'Preview and submit department, branch or company-wide leave balance recalculations',
  },
  {
    name: 'leave_balance_recalculation:approve',
    displayName: 'Approve Leave Balance Recalculation',
    description:
      'Approve bulk leave balance corrections submitted by someone else',
  },
  {
    name: 'leave_balance_recalculation:history',
    displayName: 'View Leave Balance Recalculation History',
    description: 'View recalculation runs, their lines and reports',
  },
];

const ALL = PERMISSIONS.map((p) => p.name);
const GRANTS: Record<string, string[]> = {
  COMPANY_ADMIN: ALL,
  HR_MANAGER: ALL,
  HR_OFFICER: [
    'leave_balance_recalculation:preview',
    'leave_balance_recalculation:employee',
    'leave_balance_recalculation:history',
  ],
  LEAVE_ADMIN: [
    'leave_balance_recalculation:preview',
    'leave_balance_recalculation:history',
  ],
};

/**
 * Leave accrual upgrade: per-leave-type accrual start basis (hire date /
 * probation completion), timing (in advance / in arrears), yearly
 * proration, weekly frequency, held-decrease flag, and balance
 * recalculation runs. Defaults reproduce the previous behaviour exactly, so
 * no balance changes until HR changes a policy or applies a recalculation.
 */
export class LeaveAccrualRecalculation1797900038000 implements MigrationInterface {
  name = 'LeaveAccrualRecalculation1797900038000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TYPE "leave_policies_accrual_method_enum" ADD VALUE IF NOT EXISTS 'weekly'`,
    );
    await q.query(
      `ALTER TABLE "leave_policy_types" ADD "accrual_start_basis" character varying(30) NOT NULL DEFAULT 'hire_date'`,
    );
    await q.query(
      `ALTER TABLE "leave_policy_types" ADD "accrual_timing" character varying(20) NOT NULL DEFAULT 'in_advance'`,
    );
    await q.query(
      `ALTER TABLE "leave_policy_types" ADD "accrual_prorate" boolean NOT NULL DEFAULT false`,
    );
    await q.query(
      `ALTER TABLE "leave_balances" ADD "accrual_review_required_at" TIMESTAMP WITH TIME ZONE`,
    );
    await q.query(
      `CREATE TABLE "leave_recalculation_runs" ("id" SERIAL NOT NULL, "company_id" integer NOT NULL, "reference" character varying(40) NOT NULL, "scope_type" character varying(20) NOT NULL, "scope_id" integer, "leave_type_id" integer, "scope_key" character varying(80) NOT NULL, "as_of_date" date NOT NULL, "trigger" character varying(20) NOT NULL, "status" character varying(30) NOT NULL DEFAULT 'queued', "reason" text, "initiated_by_company_user_id" integer, "submitted_by_company_user_id" integer, "submitted_at" TIMESTAMP WITH TIME ZONE, "approved_by_company_user_id" integer, "approved_at" TIMESTAMP WITH TIME ZONE, "completed_at" TIMESTAMP WITH TIME ZONE, "employees_total" integer NOT NULL DEFAULT '0', "employees_done" integer NOT NULL DEFAULT '0', "lines_changed" integer NOT NULL DEFAULT '0', "lines_applied" integer NOT NULL DEFAULT '0', "lines_failed" integer NOT NULL DEFAULT '0', "lines_skipped" integer NOT NULL DEFAULT '0', "error" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_f0d890e4dc9614ecd023c4a1ad4" PRIMARY KEY ("id"))`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_leave_recalc_run_active_scope" ON "leave_recalculation_runs" ("company_id", "scope_key") WHERE "status" IN ('queued', 'previewing', 'preview_ready', 'pending_approval', 'approved', 'applying')`,
    );
    await q.query(
      `CREATE INDEX "IDX_leave_recalc_run_company" ON "leave_recalculation_runs" ("company_id", "created_at")`,
    );
    await q.query(
      `CREATE TABLE "leave_recalculation_lines" ("id" SERIAL NOT NULL, "run_id" integer NOT NULL, "company_id" integer NOT NULL, "employee_id" integer NOT NULL, "leave_type_id" integer NOT NULL, "leave_balance_id" integer, "fiscal_year" character varying(20) NOT NULL, "entitlement_days" numeric(8,2) NOT NULL DEFAULT '0', "current_accrued_days" numeric(8,2) NOT NULL DEFAULT '0', "recalculated_accrued_days" numeric(8,2) NOT NULL DEFAULT '0', "current_available_days" numeric(8,2) NOT NULL DEFAULT '0', "recalculated_available_days" numeric(8,2) NOT NULL DEFAULT '0', "difference_days" numeric(8,2) NOT NULL DEFAULT '0', "used_days" numeric(8,2) NOT NULL DEFAULT '0', "pending_days" numeric(8,2) NOT NULL DEFAULT '0', "adjusted_days" numeric(8,2) NOT NULL DEFAULT '0', "policy_id" integer, "policy_version" integer, "accrual_frequency" character varying(20), "accrual_start_basis" character varying(30), "accrual_start_date" date, "hire_date" date, "probation_status" character varying(20), "probation_completion_date" date, "periods_evaluated" integer NOT NULL DEFAULT '0', "warnings" jsonb, "status" character varying(20) NOT NULL, "error" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_a09fa9ef610053aa8501e3620c0" PRIMARY KEY ("id"))`,
    );
    await q.query(
      `CREATE INDEX "IDX_leave_recalc_line_employee" ON "leave_recalculation_lines" ("company_id", "employee_id")`,
    );
    await q.query(
      `CREATE INDEX "IDX_leave_recalc_line_run" ON "leave_recalculation_lines" ("run_id", "status")`,
    );
    await q.query(
      `ALTER TABLE "leave_recalculation_lines" ADD CONSTRAINT "FK_dd8471268148b9d34bdd4453f54" FOREIGN KEY ("run_id") REFERENCES "leave_recalculation_runs"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await ensurePermissions(q, PERMISSIONS);
    await grantPermissionsToSystemRoles(q, GRANTS);
  }

  public async down(q: QueryRunner): Promise<void> {
    await revokePermissionsFromSystemRoles(q, GRANTS);
    await removePermissions(q, ALL);
    await q.query(`DROP TABLE IF EXISTS "leave_recalculation_lines"`);
    await q.query(`DROP TABLE IF EXISTS "leave_recalculation_runs"`);
    await q.query(
      `ALTER TABLE "leave_balances" DROP COLUMN IF EXISTS "accrual_review_required_at"`,
    );
    await q.query(
      `ALTER TABLE "leave_policy_types" DROP COLUMN IF EXISTS "accrual_prorate"`,
    );
    await q.query(
      `ALTER TABLE "leave_policy_types" DROP COLUMN IF EXISTS "accrual_timing"`,
    );
    await q.query(
      `ALTER TABLE "leave_policy_types" DROP COLUMN IF EXISTS "accrual_start_basis"`,
    );
    // Postgres cannot drop an enum value; policies set to weekly fall back
    // to monthly so the old code can read them.
    await q.query(
      `UPDATE "leave_policies" SET "accrual_method" = 'monthly' WHERE "accrual_method" = 'weekly'`,
    );
    await q.query(
      `UPDATE "leave_policy_types" SET "accrual_method" = 'monthly' WHERE "accrual_method" = 'weekly'`,
    );
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
  removePermissions,
  revokePermissionsFromSystemRoles,
} from '../migration-helpers/role-permission-grants';

/**
 * Leave policy engine, part 3: encashment ↔ payroll.
 * - Calculated encashment amounts (salary basis ÷ divisor × days) with an
 *   audited, permissioned override.
 * - Payment status follows the payroll result: IN_PAYROLL → PAID only when
 *   the payroll run is paid; REVERSED when payroll reverses it.
 * - The LEAVE_ENCASHMENT component is held back (finance_verified = false)
 *   until Finance confirms its GL, tax and pension treatment.
 */
const PERMISSIONS = [
  {
    name: 'leave_encashment:override_amount',
    displayName: 'Override a calculated leave encashment amount',
    description:
      'Replace the policy-calculated encashment amount (reason required, audited)',
  },
  {
    name: 'leave_encashment:finance_confirm',
    displayName: 'Confirm leave encashment payroll treatment',
    description:
      'Confirm the GL account, tax and pension treatment of the LEAVE_ENCASHMENT payroll component',
  },
];

const GRANTS: Record<string, string[]> = {
  COMPANY_ADMIN: [
    'leave_encashment:override_amount',
    'leave_encashment:finance_confirm',
  ],
  HR_MANAGER: ['leave_encashment:override_amount'],
  FINANCE: ['leave_encashment:finance_confirm'],
};

export class LeaveEncashmentPayrollSync1797900027000 implements MigrationInterface {
  name = 'LeaveEncashmentPayrollSync1797900027000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "leave_encashment_requests"
        ADD COLUMN IF NOT EXISTS "source" character varying(20) NOT NULL DEFAULT 'employee',
        ADD COLUMN IF NOT EXISTS "rollover_line_id" integer,
        ADD COLUMN IF NOT EXISTS "salary_basis" character varying(20),
        ADD COLUMN IF NOT EXISTS "salary_amount" numeric(14,2),
        ADD COLUMN IF NOT EXISTS "rate_divisor" numeric(8,2),
        ADD COLUMN IF NOT EXISTS "daily_rate" numeric(14,4),
        ADD COLUMN IF NOT EXISTS "calculated_amount" numeric(14,2),
        ADD COLUMN IF NOT EXISTS "calculation" jsonb,
        ADD COLUMN IF NOT EXISTS "amount_overridden" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "override_reason" text,
        ADD COLUMN IF NOT EXISTS "overridden_by_company_user_id" integer,
        ADD COLUMN IF NOT EXISTS "payroll_run_id" integer,
        ADD COLUMN IF NOT EXISTS "payroll_result_id" integer,
        ADD COLUMN IF NOT EXISTS "payment_confirmed_via" character varying(20),
        ADD COLUMN IF NOT EXISTS "payment_synced_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "reversed_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "reversal_reason" text,
        ADD CONSTRAINT "CHK_leave_encashment_source" CHECK ("source" IN ('employee','hr','rollover')),
        ADD CONSTRAINT "CHK_leave_encashment_payment_status" CHECK ("payment_status" IN ('NOT_PAID','IN_PAYROLL','PAID','FAILED','REVERSED'))
    `);
    await q.query(`
      UPDATE "payroll_components"
        SET "calculation_configuration" = COALESCE("calculation_configuration", '{}'::jsonb)
          || '{"finance_verified": false, "placeholder_gl": true}'::jsonb
      WHERE "code" = 'LEAVE_ENCASHMENT'
        AND "general_ledger_account_code" = '5045-LEAVE-ENCASHMENT'
        AND NOT COALESCE(("calculation_configuration" ->> 'finance_verified')::boolean, false)
    `);
    await ensurePermissions(q, PERMISSIONS);
    await grantPermissionsToSystemRoles(q, GRANTS);
  }

  async down(q: QueryRunner): Promise<void> {
    await revokePermissionsFromSystemRoles(q, GRANTS);
    await removePermissions(
      q,
      PERMISSIONS.map((item) => item.name),
    );
    await q.query(`
      UPDATE "payroll_components"
        SET "calculation_configuration" = "calculation_configuration" - 'finance_verified' - 'placeholder_gl'
      WHERE "code" = 'LEAVE_ENCASHMENT'
    `);
    await q.query(
      `UPDATE "leave_encashment_requests" SET "payment_status" = 'NOT_PAID' WHERE "payment_status" IN ('IN_PAYROLL','REVERSED')`,
    );
    await q.query(`
      ALTER TABLE "leave_encashment_requests"
        DROP CONSTRAINT IF EXISTS "CHK_leave_encashment_payment_status",
        DROP CONSTRAINT IF EXISTS "CHK_leave_encashment_source",
        DROP COLUMN IF EXISTS "reversal_reason",
        DROP COLUMN IF EXISTS "reversed_at",
        DROP COLUMN IF EXISTS "payment_synced_at",
        DROP COLUMN IF EXISTS "payment_confirmed_via",
        DROP COLUMN IF EXISTS "payroll_result_id",
        DROP COLUMN IF EXISTS "payroll_run_id",
        DROP COLUMN IF EXISTS "overridden_by_company_user_id",
        DROP COLUMN IF EXISTS "override_reason",
        DROP COLUMN IF EXISTS "amount_overridden",
        DROP COLUMN IF EXISTS "calculation",
        DROP COLUMN IF EXISTS "calculated_amount",
        DROP COLUMN IF EXISTS "daily_rate",
        DROP COLUMN IF EXISTS "rate_divisor",
        DROP COLUMN IF EXISTS "salary_amount",
        DROP COLUMN IF EXISTS "salary_basis",
        DROP COLUMN IF EXISTS "rollover_line_id",
        DROP COLUMN IF EXISTS "source"
    `);
  }
}

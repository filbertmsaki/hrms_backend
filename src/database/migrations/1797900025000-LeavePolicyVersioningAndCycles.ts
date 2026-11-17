import { MigrationInterface, QueryRunner } from 'typeorm';
import {
  ensurePermissions,
  grantPermissionsToSystemRoles,
  removePermissions,
  revokePermissionsFromSystemRoles,
} from '../migration-helpers/role-permission-grants';

/**
 * Leave policy engine, part 1:
 * - effective-dated policy versions (one lineage per policy_key);
 * - leave-year cycle settings (calendar / anniversary / custom);
 * - permissions for policy approval, rollover runs and statutory rules.
 * Existing policies become version 1, active, effective since always.
 */
const PERMISSIONS = [
  {
    name: 'leave_policies:approve',
    displayName: 'Approve and activate leave policy versions',
    description:
      'Approve a draft leave policy version and set the date it takes effect',
  },
  {
    name: 'leave_rollover:read',
    displayName: 'View leave year-end rollover runs',
    description: 'View rollover previews, results and reports',
  },
  {
    name: 'leave_rollover:manage',
    displayName: 'Prepare leave year-end rollover runs',
    description: 'Generate and refresh rollover previews and submit them',
  },
  {
    name: 'leave_rollover:approve',
    displayName: 'Approve and post leave year-end rollover runs',
    description:
      'Approve a rollover run and post carry-forward, encashment and lapse to the leave ledger',
  },
  {
    name: 'leave_statutory:read',
    displayName: 'View statutory leave rules',
    description: 'View jurisdiction statutory leave rule sets',
  },
  {
    name: 'leave_statutory:manage',
    displayName: 'Edit statutory leave rules',
    description: 'Create and edit draft statutory leave rule sets',
  },
  {
    name: 'leave_statutory:approve',
    displayName: 'Approve statutory leave rules',
    description:
      'Record legal verification and activate a statutory leave rule set',
  },
];

const ALL = PERMISSIONS.map((item) => item.name);
const GRANTS: Record<string, string[]> = {
  COMPANY_ADMIN: ALL,
  HR_MANAGER: ALL,
  HR_OFFICER: [
    'leave_rollover:read',
    'leave_rollover:manage',
    'leave_statutory:read',
  ],
  LEAVE_ADMIN: [
    'leave_rollover:read',
    'leave_rollover:manage',
    'leave_statutory:read',
  ],
  AUDITOR: ['leave_rollover:read', 'leave_statutory:read'],
  FINANCE: ['leave_rollover:read'],
};

export class LeavePolicyVersioningAndCycles1797900025000 implements MigrationInterface {
  name = 'LeavePolicyVersioningAndCycles1797900025000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "leave_policies"
        ADD COLUMN IF NOT EXISTS "policy_key" character varying(64),
        ADD COLUMN IF NOT EXISTS "version_no" integer NOT NULL DEFAULT 1,
        ADD COLUMN IF NOT EXISTS "lifecycle_status" character varying(20) NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS "effective_from" date,
        ADD COLUMN IF NOT EXISTS "effective_to" date,
        ADD COLUMN IF NOT EXISTS "change_reason" text,
        ADD COLUMN IF NOT EXISTS "supersedes_policy_id" integer,
        ADD COLUMN IF NOT EXISTS "created_by_company_user_id" integer,
        ADD COLUMN IF NOT EXISTS "submitted_by_company_user_id" integer,
        ADD COLUMN IF NOT EXISTS "approved_by_company_user_id" integer,
        ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "leave_year_type" character varying(20) NOT NULL DEFAULT 'calendar',
        ADD COLUMN IF NOT EXISTS "leave_year_start_month" smallint,
        ADD COLUMN IF NOT EXISTS "leave_year_start_day" smallint
    `);
    await q.query(
      `UPDATE "leave_policies" SET "policy_key" = 'policy-' || "id" WHERE "policy_key" IS NULL`,
    );
    await q.query(
      `ALTER TABLE "leave_policies" ALTER COLUMN "policy_key" SET NOT NULL`,
    );
    await q.query(`
      ALTER TABLE "leave_policies"
        ADD CONSTRAINT "CHK_leave_policy_lifecycle" CHECK ("lifecycle_status" IN ('draft','pending_approval','active','superseded','archived')),
        ADD CONSTRAINT "CHK_leave_policy_year_type" CHECK ("leave_year_type" IN ('calendar','anniversary','custom')),
        ADD CONSTRAINT "CHK_leave_policy_year_start" CHECK (
          "leave_year_type" <> 'custom' OR (
            "leave_year_start_month" BETWEEN 1 AND 12 AND "leave_year_start_day" BETWEEN 1 AND 31
          )
        ),
        ADD CONSTRAINT "CHK_leave_policy_effective_range" CHECK (
          "effective_to" IS NULL OR "effective_from" IS NULL OR "effective_to" >= "effective_from"
        )
    `);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_leave_policy_key_version" ON "leave_policies" ("company_id", "policy_key", "version_no")`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_leave_policy_effective" ON "leave_policies" ("company_id", "lifecycle_status", "effective_from", "effective_to")`,
    );
    await ensurePermissions(q, PERMISSIONS);
    await grantPermissionsToSystemRoles(q, GRANTS);
  }

  async down(q: QueryRunner): Promise<void> {
    await revokePermissionsFromSystemRoles(q, GRANTS);
    await removePermissions(q, ALL);
    await q.query(`DROP INDEX IF EXISTS "IDX_leave_policy_effective"`);
    await q.query(`DROP INDEX IF EXISTS "UQ_leave_policy_key_version"`);
    // Non-current versions only exist because of this migration's feature.
    await q.query(
      `DELETE FROM "leave_policies" WHERE "lifecycle_status" IN ('draft','pending_approval','superseded','archived') AND "version_no" > 1`,
    );
    await q.query(`
      ALTER TABLE "leave_policies"
        DROP CONSTRAINT IF EXISTS "CHK_leave_policy_effective_range",
        DROP CONSTRAINT IF EXISTS "CHK_leave_policy_year_start",
        DROP CONSTRAINT IF EXISTS "CHK_leave_policy_year_type",
        DROP CONSTRAINT IF EXISTS "CHK_leave_policy_lifecycle",
        DROP COLUMN IF EXISTS "leave_year_start_day",
        DROP COLUMN IF EXISTS "leave_year_start_month",
        DROP COLUMN IF EXISTS "leave_year_type",
        DROP COLUMN IF EXISTS "approved_at",
        DROP COLUMN IF EXISTS "approved_by_company_user_id",
        DROP COLUMN IF EXISTS "submitted_by_company_user_id",
        DROP COLUMN IF EXISTS "created_by_company_user_id",
        DROP COLUMN IF EXISTS "supersedes_policy_id",
        DROP COLUMN IF EXISTS "change_reason",
        DROP COLUMN IF EXISTS "effective_to",
        DROP COLUMN IF EXISTS "effective_from",
        DROP COLUMN IF EXISTS "lifecycle_status",
        DROP COLUMN IF EXISTS "version_no",
        DROP COLUMN IF EXISTS "policy_key"
    `);
  }
}

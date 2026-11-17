import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Leave policy engine, part 2: year-end rollover.
 * - Carry-forward method (all / limited / percentage), lapse switch,
 *   protected minimum, automatic encashment and salary basis per leave type.
 * - Rollover execution mode per policy (manual approval by default).
 * - Rollover runs and per-balance lines (preview → approval → posting).
 * - Balance markers: a closed source year, a frozen carried amount and
 *   retained days on the new year, so nightly recalculation cannot change
 *   posted results.
 * Defaults keep today's behaviour until HR changes a policy.
 */
export class LeaveRolloverEngine1797900026000 implements MigrationInterface {
  name = 'LeaveRolloverEngine1797900026000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE "leave_policy_types"
        ADD COLUMN IF NOT EXISTS "carry_forward_method" character varying(20),
        ADD COLUMN IF NOT EXISTS "carry_forward_percentage" numeric(5,2),
        ADD COLUMN IF NOT EXISTS "lapse_enabled" boolean NOT NULL DEFAULT true,
        ADD COLUMN IF NOT EXISTS "protected_minimum_days" numeric(8,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "auto_encash_enabled" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "auto_encash_method" character varying(20),
        ADD COLUMN IF NOT EXISTS "auto_encash_max_days" numeric(8,2),
        ADD COLUMN IF NOT EXISTS "auto_encash_percentage" numeric(5,2),
        ADD COLUMN IF NOT EXISTS "encashment_salary_basis" character varying(20) NOT NULL DEFAULT 'basic',
        ADD CONSTRAINT "CHK_leave_policy_type_cf_method" CHECK ("carry_forward_method" IS NULL OR "carry_forward_method" IN ('all','limited','percentage')),
        ADD CONSTRAINT "CHK_leave_policy_type_cf_pct" CHECK ("carry_forward_percentage" IS NULL OR ("carry_forward_percentage" >= 0 AND "carry_forward_percentage" <= 100)),
        ADD CONSTRAINT "CHK_leave_policy_type_ae_method" CHECK ("auto_encash_method" IS NULL OR "auto_encash_method" IN ('all','limited','percentage')),
        ADD CONSTRAINT "CHK_leave_policy_type_ae_pct" CHECK ("auto_encash_percentage" IS NULL OR ("auto_encash_percentage" >= 0 AND "auto_encash_percentage" <= 100)),
        ADD CONSTRAINT "CHK_leave_policy_type_protected" CHECK ("protected_minimum_days" >= 0),
        ADD CONSTRAINT "CHK_leave_policy_type_salary_basis" CHECK ("encashment_salary_basis" IN ('basic','gross'))
    `);
    await q.query(`
      ALTER TABLE "leave_policies"
        ADD COLUMN IF NOT EXISTS "rollover_execution_mode" character varying(20) NOT NULL DEFAULT 'manual_approval',
        ADD CONSTRAINT "CHK_leave_policy_rollover_mode" CHECK ("rollover_execution_mode" IN ('manual_approval','automatic'))
    `);
    await q.query(`
      ALTER TABLE "leave_balances"
        ADD COLUMN IF NOT EXISTS "retained_days" numeric(8,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "carry_forward_locked_days" numeric(8,2),
        ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMP WITH TIME ZONE,
        ADD COLUMN IF NOT EXISTS "closed_by_rollover_run_id" integer
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "leave_rollover_runs" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "from_leave_year" character varying(4) NOT NULL,
        "leave_type_id" integer,
        "status" character varying(24) NOT NULL DEFAULT 'draft',
        "execution_mode" character varying(20) NOT NULL DEFAULT 'manual_approval',
        "as_of_date" date NOT NULL,
        "totals" jsonb,
        "exception_count" integer NOT NULL DEFAULT 0,
        "notes" text,
        "error" text,
        "created_by_company_user_id" integer,
        "submitted_by_company_user_id" integer,
        "submitted_at" TIMESTAMP WITH TIME ZONE,
        "approved_by_company_user_id" integer,
        "approved_at" TIMESTAMP WITH TIME ZONE,
        "processing_started_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        "cancelled_at" TIMESTAMP WITH TIME ZONE,
        "cancel_reason" text,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_rollover_runs" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_leave_rollover_run_status" CHECK ("status" IN ('draft','previewed','pending_approval','approved','processing','completed','partially_failed','failed','cancelled')),
        CONSTRAINT "FK_leave_rollover_run_company" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE
      )
    `);
    // One open run per company, year and scope; finished or abandoned runs
    // do not block a new one.
    await q.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_leave_rollover_open_run"
        ON "leave_rollover_runs" ("company_id", "from_leave_year", COALESCE("leave_type_id", 0))
        WHERE "status" NOT IN ('cancelled','failed','completed','partially_failed')
    `);
    await q.query(`
      CREATE TABLE IF NOT EXISTS "leave_rollover_lines" (
        "id" SERIAL NOT NULL,
        "run_id" integer NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "leave_type_id" integer NOT NULL,
        "source_balance_id" integer NOT NULL,
        "target_balance_id" integer,
        "policy_id" integer,
        "policy_version_no" integer,
        "statutory_rule_set_id" integer,
        "opening_days" numeric(10,4) NOT NULL DEFAULT 0,
        "accrued_days" numeric(10,4) NOT NULL DEFAULT 0,
        "used_days" numeric(10,4) NOT NULL DEFAULT 0,
        "unused_days" numeric(10,4) NOT NULL DEFAULT 0,
        "protected_days" numeric(10,4) NOT NULL DEFAULT 0,
        "carry_forward_days" numeric(10,4) NOT NULL DEFAULT 0,
        "encash_days" numeric(10,4) NOT NULL DEFAULT 0,
        "lapse_days" numeric(10,4) NOT NULL DEFAULT 0,
        "retained_days" numeric(10,4) NOT NULL DEFAULT 0,
        "closing_days" numeric(10,4) NOT NULL DEFAULT 0,
        "encash_amount" numeric(14,2),
        "encash_daily_rate" numeric(14,4),
        "currency" character varying(3),
        "status" character varying(16) NOT NULL DEFAULT 'pending',
        "exceptions" jsonb NOT NULL DEFAULT '[]',
        "calculation" jsonb,
        "error" text,
        "encashment_request_id" integer,
        "posted_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_rollover_lines" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_leave_rollover_line_status" CHECK ("status" IN ('pending','posted','failed','skipped')),
        CONSTRAINT "UQ_leave_rollover_line" UNIQUE ("run_id", "employee_id", "leave_type_id"),
        CONSTRAINT "FK_leave_rollover_line_run" FOREIGN KEY ("run_id") REFERENCES "leave_rollover_runs"("id") ON DELETE CASCADE
      )
    `);
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_leave_rollover_line_balance" ON "leave_rollover_lines" ("source_balance_id")`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "leave_rollover_lines"`);
    await q.query(`DROP TABLE IF EXISTS "leave_rollover_runs"`);
    await q.query(`
      ALTER TABLE "leave_balances"
        DROP COLUMN IF EXISTS "closed_by_rollover_run_id",
        DROP COLUMN IF EXISTS "closed_at",
        DROP COLUMN IF EXISTS "carry_forward_locked_days",
        DROP COLUMN IF EXISTS "retained_days"
    `);
    await q.query(`
      ALTER TABLE "leave_policies"
        DROP CONSTRAINT IF EXISTS "CHK_leave_policy_rollover_mode",
        DROP COLUMN IF EXISTS "rollover_execution_mode"
    `);
    await q.query(`
      ALTER TABLE "leave_policy_types"
        DROP CONSTRAINT IF EXISTS "CHK_leave_policy_type_salary_basis",
        DROP CONSTRAINT IF EXISTS "CHK_leave_policy_type_protected",
        DROP CONSTRAINT IF EXISTS "CHK_leave_policy_type_ae_pct",
        DROP CONSTRAINT IF EXISTS "CHK_leave_policy_type_ae_method",
        DROP CONSTRAINT IF EXISTS "CHK_leave_policy_type_cf_pct",
        DROP CONSTRAINT IF EXISTS "CHK_leave_policy_type_cf_method",
        DROP COLUMN IF EXISTS "encashment_salary_basis",
        DROP COLUMN IF EXISTS "auto_encash_percentage",
        DROP COLUMN IF EXISTS "auto_encash_max_days",
        DROP COLUMN IF EXISTS "auto_encash_method",
        DROP COLUMN IF EXISTS "auto_encash_enabled",
        DROP COLUMN IF EXISTS "protected_minimum_days",
        DROP COLUMN IF EXISTS "lapse_enabled",
        DROP COLUMN IF EXISTS "carry_forward_percentage",
        DROP COLUMN IF EXISTS "carry_forward_method"
    `);
  }
}

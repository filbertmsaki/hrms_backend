import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLeaveBalanceLedger1785905000000 implements MigrationInterface {
  name = 'AddLeaveBalanceLedger1785905000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_balances"
      ADD COLUMN IF NOT EXISTS "company_id" integer NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_balances"
      ADD COLUMN IF NOT EXISTS "leave_year_start_date" date NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_balances"
      ADD COLUMN IF NOT EXISTS "leave_year_end_date" date NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_balances"
      ADD COLUMN IF NOT EXISTS "accrued_days" numeric(8,2) NOT NULL DEFAULT '0'
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_balances"
      ADD COLUMN IF NOT EXISTS "approved_future_days" numeric(8,2) NOT NULL DEFAULT '0'
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_balances"
      ADD COLUMN IF NOT EXISTS "last_transaction_id" integer NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_balances"
      ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      UPDATE "leave_balances" AS lb
      SET "company_id" = cu."company_id"
      FROM "employees" AS e
      INNER JOIN "company_users" AS cu ON cu."id" = e."company_user_id"
      WHERE lb."employee_id" = e."id"
      AND lb."company_id" IS NULL
    `);

    await queryRunner.query(`
      UPDATE "leave_balances"
      SET "leave_year_start_date" = CONCAT("fiscal_year", '-01-01')::date
      WHERE "leave_year_start_date" IS NULL
      AND "fiscal_year" ~ '^[0-9]{4}$'
    `);

    await queryRunner.query(`
      UPDATE "leave_balances"
      SET "leave_year_end_date" = CONCAT("fiscal_year", '-12-31')::date
      WHERE "leave_year_end_date" IS NULL
      AND "fiscal_year" ~ '^[0-9]{4}$'
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        CREATE TYPE "public"."leave_balance_transaction_type_enum" AS ENUM(
          'INITIAL_ALLOCATION',
          'ACCRUAL',
          'RECALCULATION',
          'ADJUSTMENT',
          'CARRY_FORWARD',
          'TAKEN',
          'RESERVED',
          'RESERVATION_RELEASED',
          'CANCELLED_REVERSAL',
          'EXPIRED',
          'MANUAL_CORRECTION',
          'ATTENDANCE_DEDUCTION'
        );
      EXCEPTION
        WHEN duplicate_object THEN NULL;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "leave_balance_transactions" (
        "id" SERIAL PRIMARY KEY,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "leave_type_id" integer NOT NULL,
        "leave_balance_id" integer NULL,
        "leave_request_id" integer NULL,
        "accrual_run_id" integer NULL,
        "recalculation_run_id" integer NULL,
        "transaction_type" "public"."leave_balance_transaction_type_enum" NOT NULL,
        "leave_year" character varying(20) NOT NULL,
        "effective_date" date NOT NULL,
        "previous_balance_days" numeric(8,2) NOT NULL DEFAULT '0',
        "amount_days" numeric(8,2) NOT NULL DEFAULT '0',
        "new_balance_days" numeric(8,2) NOT NULL DEFAULT '0',
        "previous_pending_days" numeric(8,2) NOT NULL DEFAULT '0',
        "pending_delta_days" numeric(8,2) NOT NULL DEFAULT '0',
        "new_pending_days" numeric(8,2) NOT NULL DEFAULT '0',
        "previous_used_days" numeric(8,2) NOT NULL DEFAULT '0',
        "used_delta_days" numeric(8,2) NOT NULL DEFAULT '0',
        "new_used_days" numeric(8,2) NOT NULL DEFAULT '0',
        "reason" text NULL,
        "idempotency_key" character varying(180) NOT NULL,
        "metadata" jsonb NULL,
        "created_by_company_user_id" integer NULL,
        "reversed_transaction_id" integer NULL,
        "is_reversal" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "FK_leave_balance_tx_company"
          FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_leave_balance_tx_employee"
          FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_leave_balance_tx_leave_type"
          FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_leave_balance_tx_balance"
          FOREIGN KEY ("leave_balance_id") REFERENCES "leave_balances"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_leave_balance_tx_request"
          FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_leave_balance_tx_company_user"
          FOREIGN KEY ("created_by_company_user_id") REFERENCES "company_users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_leave_balance_tx_reversed_transaction"
          FOREIGN KEY ("reversed_transaction_id") REFERENCES "leave_balance_transactions"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_leave_balance_transaction_idempotency"
      ON "leave_balance_transactions" ("company_id", "idempotency_key")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_leave_balance_tx_employee_type_year"
      ON "leave_balance_transactions" ("employee_id", "leave_type_id", "leave_year")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_leave_balance_tx_company_effective_date"
      ON "leave_balance_transactions" ("company_id", "effective_date")
    `);

    await queryRunner.query(`
      INSERT INTO "leave_balance_transactions" (
        "company_id",
        "employee_id",
        "leave_type_id",
        "leave_balance_id",
        "transaction_type",
        "leave_year",
        "effective_date",
        "previous_balance_days",
        "amount_days",
        "new_balance_days",
        "previous_pending_days",
        "pending_delta_days",
        "new_pending_days",
        "previous_used_days",
        "used_delta_days",
        "new_used_days",
        "reason",
        "idempotency_key",
        "metadata",
        "created_at"
      )
      SELECT
        lb."company_id",
        lb."employee_id",
        lb."leave_type_id",
        lb."id",
        'INITIAL_ALLOCATION',
        lb."fiscal_year",
        CASE
          WHEN lb."generated_at" IS NOT NULL THEN lb."generated_at"::date
          WHEN lb."fiscal_year" ~ '^[0-9]{4}$' THEN CONCAT(lb."fiscal_year", '-01-01')::date
          ELSE CURRENT_DATE
        END,
        '0.00',
        ROUND((
          COALESCE(lb."opening_balance_days", lb."carried_forward_days", 0) +
          COALESCE(lb."entitlement_days", lb."allocated_days", 0) +
          COALESCE(lb."adjusted_days", 0) -
          COALESCE(lb."used_days", 0) -
          COALESCE(lb."pending_days", 0) -
          COALESCE(lb."expired_days", 0) -
          COALESCE(lb."attendance_deduction_days", 0)
        )::numeric, 2),
        ROUND((
          COALESCE(lb."opening_balance_days", lb."carried_forward_days", 0) +
          COALESCE(lb."entitlement_days", lb."allocated_days", 0) +
          COALESCE(lb."adjusted_days", 0) -
          COALESCE(lb."used_days", 0) -
          COALESCE(lb."pending_days", 0) -
          COALESCE(lb."expired_days", 0) -
          COALESCE(lb."attendance_deduction_days", 0)
        )::numeric, 2),
        '0.00',
        COALESCE(lb."pending_days", 0),
        COALESCE(lb."pending_days", 0),
        '0.00',
        COALESCE(lb."used_days", 0),
        COALESCE(lb."used_days", 0),
        'Backfilled from legacy leave balance snapshot',
        CONCAT('legacy-balance:', lb."id", ':initial'),
        jsonb_build_object(
          'source', 'migration',
          'backfill_kind', 'legacy_snapshot',
          'leave_balance_id', lb."id"
        ),
        COALESCE(lb."generated_at", lb."updated_at", NOW())
      FROM "leave_balances" AS lb
      WHERE lb."company_id" IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM "leave_balance_transactions" AS tx
        WHERE tx."company_id" = lb."company_id"
        AND tx."idempotency_key" = CONCAT('legacy-balance:', lb."id", ':initial')
      )
    `);

    await queryRunner.query(`
      UPDATE "leave_balances" AS lb
      SET "last_transaction_id" = tx."id"
      FROM "leave_balance_transactions" AS tx
      WHERE tx."leave_balance_id" = lb."id"
      AND tx."idempotency_key" = CONCAT('legacy-balance:', lb."id", ':initial')
      AND lb."last_transaction_id" IS NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'FK_leave_balances_last_transaction'
        ) THEN
          ALTER TABLE "leave_balances"
          ADD CONSTRAINT "FK_leave_balances_last_transaction"
          FOREIGN KEY ("last_transaction_id")
          REFERENCES "leave_balance_transactions"("id")
          ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "leave_balances"
      DROP CONSTRAINT IF EXISTS "FK_leave_balances_last_transaction"
    `);
    await queryRunner.query(
      `DROP TABLE IF EXISTS "leave_balance_transactions"`,
    );
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_leave_balance_tx_company_effective_date"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_leave_balance_tx_employee_type_year"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "UQ_leave_balance_transaction_idempotency"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "public"."leave_balance_transaction_type_enum"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_balances" DROP COLUMN IF EXISTS "version"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_balances" DROP COLUMN IF EXISTS "last_transaction_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_balances" DROP COLUMN IF EXISTS "approved_future_days"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_balances" DROP COLUMN IF EXISTS "accrued_days"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_balances" DROP COLUMN IF EXISTS "leave_year_end_date"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_balances" DROP COLUMN IF EXISTS "leave_year_start_date"
    `);
    await queryRunner.query(`
      ALTER TABLE "leave_balances" DROP COLUMN IF EXISTS "company_id"
    `);
  }
}

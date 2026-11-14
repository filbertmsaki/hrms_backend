import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive Mainland ledger. Legacy leave_balance_transactions/leave_balances
 * are untouched; anniversary buckets, pay tiers and per-cycle provenance
 * cannot be represented safely in the calendar-year cache.
 */
export class LeaveMainlandLedger1797900014000 implements MigrationInterface {
  name = 'LeaveMainlandLedger1797900014000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "leave_ledger_entries" (
      "id" SERIAL PRIMARY KEY,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "employee_id" integer NOT NULL REFERENCES "employees"("id"),
      "leave_type_id" integer NOT NULL REFERENCES "leave_types"("id"),
      "family" varchar(20) NOT NULL CHECK ("family" IN ('annual','sick','maternity','paternity','compassionate','unpaid')),
      "entry_type" varchar(30) NOT NULL CHECK ("entry_type" IN ('OPENING_BALANCE','ENTITLEMENT','ACCRUAL','TRUE_UP','CARRY_OVER_OUT','CARRY_OVER_IN','RESERVED','RESERVATION_RELEASED','TAKEN','EXPIRY_FLAGGED','EXPIRY_EXTENDED','FORFEITED','PAYOUT','ADJUSTMENT','REVERSAL')),
      "dimension" varchar(12) NOT NULL DEFAULT 'balance' CHECK ("dimension" IN ('balance','reservation')),
      "cycle_start" date NOT NULL,
      "source_cycle_start" date NOT NULL,
      "bucket_expires_on" date NULL,
      "effective_date" date NOT NULL,
      "amount_days" numeric(12,4) NOT NULL,
      "pay_rate" numeric(5,4) NULL CHECK ("pay_rate" IS NULL OR ("pay_rate" >= 0 AND "pay_rate" <= 1)),
      "leave_request_id" integer NULL REFERENCES "leave_requests"("id"),
      "policy_revision_id" integer NULL REFERENCES "leave_policy_revisions"("id"),
      "reverses_entry_id" integer NULL UNIQUE REFERENCES "leave_ledger_entries"("id"),
      "idempotency_key" varchar(200) NOT NULL,
      "reason" text NULL,
      "metadata" jsonb NULL,
      "created_by_company_user_id" integer NULL REFERENCES "company_users"("id"),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_leave_ledger_idempotency" UNIQUE ("company_id", "idempotency_key"),
      CONSTRAINT "CHK_leave_ledger_reversal" CHECK (("entry_type" = 'REVERSAL') = ("reverses_entry_id" IS NOT NULL))
    )`);
    await q.query(
      'CREATE INDEX "IDX_leave_ledger_employee_family" ON "leave_ledger_entries" ("company_id", "employee_id", "family", "effective_date")',
    );
    await q.query(
      'CREATE INDEX "IDX_leave_ledger_request" ON "leave_ledger_entries" ("leave_request_id")',
    );
    await q.query(`CREATE OR REPLACE FUNCTION leave_ledger_append_only() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'leave_ledger_entries is append-only; post a REVERSAL'; END $$ LANGUAGE plpgsql`);
    await q.query(
      'CREATE TRIGGER "TRG_leave_ledger_append_only" BEFORE UPDATE OR DELETE ON "leave_ledger_entries" FOR EACH ROW EXECUTE FUNCTION leave_ledger_append_only()',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = (await q.query(
      'SELECT count(*) AS count FROM "leave_ledger_entries"',
    )) as Array<{ count: string }>;
    if (Number(rows[0].count) > 0)
      throw new Error('Cannot remove Mainland leave ledger history');
    await q.query('DROP TABLE "leave_ledger_entries"');
    await q.query('DROP FUNCTION leave_ledger_append_only()');
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveCutoverSnapshots1797900016000 implements MigrationInterface {
  name = 'LeaveCutoverSnapshots1797900016000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "leave_cutover_snapshots" (
      "id" SERIAL PRIMARY KEY,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "policy_id" integer NOT NULL REFERENCES "leave_policies"("id"),
      "policy_revision_id" integer NOT NULL REFERENCES "leave_policy_revisions"("id"),
      "cutover_date" date NOT NULL,
      "status" varchar(12) NOT NULL DEFAULT 'draft' CHECK ("status" IN ('draft','approved','posted','void','reversed')),
      "rows_sha256" varchar(64) NULL,
      "created_by_company_user_id" integer NOT NULL REFERENCES "company_users"("id"),
      "created_at" timestamptz NOT NULL DEFAULT now(),
      "approved_by_company_user_id" integer NULL REFERENCES "company_users"("id"),
      "approved_at" timestamptz NULL,
      "approval_reason" text NULL,
      "approval_evidence" text NULL,
      "posted_by_company_user_id" integer NULL REFERENCES "company_users"("id"),
      "posted_at" timestamptz NULL,
      "closed_at" timestamptz NULL,
      "close_reason" text NULL,
      CONSTRAINT "CHK_leave_cutover_approval" CHECK ("status" IN ('draft','void') OR ("approved_by_company_user_id" IS NOT NULL AND "rows_sha256" IS NOT NULL AND length(trim(coalesce("approval_reason", ''))) > 0))
    )`);
    await q.query(
      'CREATE INDEX "IDX_leave_cutover_company" ON "leave_cutover_snapshots" ("company_id", "cutover_date")',
    );
    await q.query(`CREATE TABLE "leave_cutover_rows" (
      "id" SERIAL PRIMARY KEY,
      "snapshot_id" integer NOT NULL REFERENCES "leave_cutover_snapshots"("id"),
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "employee_id" integer NOT NULL REFERENCES "employees"("id"),
      "leave_type_id" integer NOT NULL REFERENCES "leave_types"("id"),
      "family" varchar(20) NOT NULL CHECK ("family" IN ('annual','sick','compassionate')),
      "cycle_anchor" date NOT NULL,
      "cycle_start" date NOT NULL,
      "prior_cycle_start" date NULL,
      "prior_carry_days" numeric(12,4) NOT NULL DEFAULT 0,
      "carry_expires_on" date NULL,
      "accrued_days" numeric(12,4) NOT NULL DEFAULT 0,
      "taken_days" numeric(12,4) NOT NULL DEFAULT 0,
      "outstanding_days" numeric(12,4) NOT NULL DEFAULT 0,
      "proposed_days" numeric(12,4) NOT NULL,
      "override_days" numeric(12,4) NULL,
      "override_reason" text NULL,
      "exceptions" jsonb NOT NULL,
      "sources" jsonb NOT NULL,
      "source_fingerprint" varchar(64) NOT NULL,
      "resolved" boolean NOT NULL DEFAULT false,
      CONSTRAINT "UQ_leave_cutover_row" UNIQUE ("snapshot_id", "employee_id", "family"),
      CONSTRAINT "CHK_leave_cutover_override_reason" CHECK ("override_days" IS NULL OR length(trim(coalesce("override_reason", ''))) > 0)
    )`);
    await q.query(
      'CREATE INDEX "IDX_leave_cutover_row_snapshot" ON "leave_cutover_rows" ("snapshot_id", "employee_id")',
    );
    // Rows are editable (overrides/resolution) only while the snapshot is a draft.
    await q.query(`CREATE OR REPLACE FUNCTION leave_cutover_row_guard() RETURNS trigger AS $$
      DECLARE s varchar;
      BEGIN
        SELECT status INTO s FROM leave_cutover_snapshots WHERE id = COALESCE(NEW.snapshot_id, OLD.snapshot_id);
        IF s <> 'draft' THEN RAISE EXCEPTION 'cutover rows are frozen once the snapshot is approved'; END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await q.query(
      'CREATE TRIGGER "TRG_leave_cutover_row_guard" BEFORE INSERT OR UPDATE OR DELETE ON "leave_cutover_rows" FOR EACH ROW EXECUTE FUNCTION leave_cutover_row_guard()',
    );
    await q.query(`CREATE OR REPLACE FUNCTION leave_cutover_snapshot_guard() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'cutover snapshots are retained for audit'; END IF;
        IF OLD.status <> 'draft' AND (NEW.rows_sha256 IS DISTINCT FROM OLD.rows_sha256
            OR NEW.approved_by_company_user_id IS DISTINCT FROM OLD.approved_by_company_user_id
            OR NEW.approved_at IS DISTINCT FROM OLD.approved_at
            OR NEW.cutover_date IS DISTINCT FROM OLD.cutover_date
            OR NEW.policy_revision_id IS DISTINCT FROM OLD.policy_revision_id) THEN
          RAISE EXCEPTION 'approved cutover snapshot is sealed';
        END IF;
        IF NOT ((OLD.status = NEW.status) OR (OLD.status = 'draft' AND NEW.status IN ('approved','void'))
            OR (OLD.status = 'approved' AND NEW.status IN ('posted','void'))
            OR (OLD.status = 'posted' AND NEW.status = 'reversed')) THEN
          RAISE EXCEPTION 'invalid cutover status transition % -> %', OLD.status, NEW.status;
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await q.query(
      'CREATE TRIGGER "TRG_leave_cutover_snapshot_guard" BEFORE UPDATE OR DELETE ON "leave_cutover_snapshots" FOR EACH ROW EXECUTE FUNCTION leave_cutover_snapshot_guard()',
    );
    await q.query(
      'ALTER TABLE "leave_policy_assignments" ADD CONSTRAINT "FK_leave_policy_assignment_cutover" FOREIGN KEY ("cutover_snapshot_id") REFERENCES "leave_cutover_snapshots"("id")',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = (await q.query(
      'SELECT count(*) AS count FROM "leave_cutover_snapshots"',
    )) as Array<{ count: string }>;
    if (Number(rows[0].count) > 0)
      throw new Error('Cannot remove cutover snapshot history');
    await q.query('ALTER TABLE "leave_policy_assignments" DROP CONSTRAINT "FK_leave_policy_assignment_cutover"');
    await q.query('DROP TABLE "leave_cutover_rows"');
    await q.query('DROP TABLE "leave_cutover_snapshots"');
    await q.query('DROP FUNCTION leave_cutover_row_guard()');
    await q.query('DROP FUNCTION leave_cutover_snapshot_guard()');
  }
}

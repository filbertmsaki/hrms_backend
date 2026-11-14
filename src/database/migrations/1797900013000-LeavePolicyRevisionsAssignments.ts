import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeavePolicyRevisionsAssignments1797900013000
  implements MigrationInterface
{
  name = 'LeavePolicyRevisionsAssignments1797900013000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "leave_policy_revisions" (
      "id" SERIAL PRIMARY KEY,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "policy_id" integer NOT NULL REFERENCES "leave_policies"("id"),
      "jurisdiction" varchar(20) NOT NULL CHECK ("jurisdiction" IN ('mainland', 'zanzibar')),
      "effective_date" date NOT NULL,
      "rules" jsonb NOT NULL,
      "rules_sha256" varchar(64) NOT NULL,
      "source_draft_revision_id" integer NOT NULL REFERENCES "leave_policy_draft_revisions"("id"),
      "approved_by_company_user_id" integer NOT NULL REFERENCES "company_users"("id"),
      "approval_reason" text NOT NULL CHECK (length(trim("approval_reason")) > 0),
      "approved_at" timestamptz NOT NULL DEFAULT now(),
      "withdrawn_at" timestamptz NULL,
      "withdrawn_by_company_user_id" integer NULL REFERENCES "company_users"("id"),
      "withdrawal_reason" text NULL
    )`);
    await q.query(
      'CREATE INDEX "IDX_leave_policy_revision_effective" ON "leave_policy_revisions" ("company_id", "policy_id", "effective_date")',
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_leave_policy_revision_active_date" ON "leave_policy_revisions" ("policy_id", "effective_date") WHERE "withdrawn_at" IS NULL`,
    );
    // Immutability: only the withdrawal columns may change, once.
    await q.query(`CREATE OR REPLACE FUNCTION leave_policy_revision_guard() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'leave policy revisions are immutable'; END IF;
        IF NEW.rules IS DISTINCT FROM OLD.rules OR NEW.effective_date IS DISTINCT FROM OLD.effective_date
           OR NEW.policy_id IS DISTINCT FROM OLD.policy_id OR NEW.rules_sha256 IS DISTINCT FROM OLD.rules_sha256
           OR NEW.approved_by_company_user_id IS DISTINCT FROM OLD.approved_by_company_user_id
           OR OLD.withdrawn_at IS NOT NULL THEN
          RAISE EXCEPTION 'leave policy revisions are immutable';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await q.query(
      `CREATE TRIGGER "TRG_leave_policy_revision_guard" BEFORE UPDATE OR DELETE ON "leave_policy_revisions" FOR EACH ROW EXECUTE FUNCTION leave_policy_revision_guard()`,
    );

    await q.query(`CREATE TABLE "leave_policy_assignments" (
      "id" SERIAL PRIMARY KEY,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "employee_id" integer NOT NULL REFERENCES "employees"("id"),
      "policy_id" integer NOT NULL REFERENCES "leave_policies"("id"),
      "effective_date" date NOT NULL,
      "reason" text NOT NULL CHECK (length(trim("reason")) > 0),
      "cutover_snapshot_id" integer NULL,
      "created_by_company_user_id" integer NOT NULL REFERENCES "company_users"("id"),
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      'CREATE INDEX "IDX_leave_policy_assignment_effective" ON "leave_policy_assignments" ("company_id", "employee_id", "effective_date", "id")',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = (await q.query(
      `SELECT (SELECT count(*) FROM "leave_policy_revisions") + (SELECT count(*) FROM "leave_policy_assignments") AS count`,
    )) as Array<{ count: string }>;
    if (Number(rows[0].count) > 0)
      throw new Error('Cannot remove leave policy revision/assignment history');
    await q.query('DROP TABLE "leave_policy_assignments"');
    await q.query('DROP TRIGGER "TRG_leave_policy_revision_guard" ON "leave_policy_revisions"');
    await q.query('DROP FUNCTION leave_policy_revision_guard()');
    await q.query('DROP TABLE "leave_policy_revisions"');
  }
}

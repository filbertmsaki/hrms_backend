import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeavePolicyDraftRevisions1797900011000 implements MigrationInterface {
  name = 'LeavePolicyDraftRevisions1797900011000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "leave_policy_draft_revisions" (
      "id" SERIAL PRIMARY KEY,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "policy_id" integer NOT NULL REFERENCES "leave_policies"("id"),
      "proposed_effective_date" date NOT NULL,
      "rules" jsonb NOT NULL CHECK (jsonb_typeof("rules") = 'object'),
      "reason" text NOT NULL CHECK (length(trim("reason")) > 0),
      "created_by_company_user_id" integer NOT NULL REFERENCES "company_users"("id"),
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      'CREATE INDEX "IDX_leave_policy_draft_company_policy" ON "leave_policy_draft_revisions" ("company_id", "policy_id", "id")',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = (await q.query(
      'SELECT count(*) AS count FROM "leave_policy_draft_revisions"',
    )) as Array<{ count: string }>;
    if (Number(rows[0].count) > 0)
      throw new Error('Cannot remove stored policy draft history');
    await q.query('DROP TABLE "leave_policy_draft_revisions"');
  }
}

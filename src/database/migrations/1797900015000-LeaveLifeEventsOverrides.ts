import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveLifeEventsOverrides1797900015000 implements MigrationInterface {
  name = 'LeaveLifeEventsOverrides1797900015000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "leave_life_events" (
      "id" SERIAL PRIMARY KEY,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "employee_id" integer NOT NULL REFERENCES "employees"("id"),
      "event_type" varchar(30) NOT NULL CHECK ("event_type" IN ('birth','expected_birth','child_death','child_sickness','spouse_death','parent_death','grandparent_death','grandchild_death','sibling_death')),
      "event_date" date NOT NULL,
      "related_event_id" integer NULL REFERENCES "leave_life_events"("id"),
      "multiple_birth" boolean NOT NULL DEFAULT false,
      "historical_paid_maternity_term" boolean NOT NULL DEFAULT false,
      "nssf_reference" varchar(100) NULL,
      "document_id" integer NULL REFERENCES "leave_documents"("id"),
      "notes" text NULL,
      "created_by_company_user_id" integer NOT NULL REFERENCES "company_users"("id"),
      "verified_by_company_user_id" integer NULL REFERENCES "company_users"("id"),
      "verified_at" timestamptz NULL,
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      'CREATE INDEX "IDX_leave_life_event_employee" ON "leave_life_events" ("company_id", "employee_id", "event_date")',
    );
    await q.query(
      'ALTER TABLE "leave_requests" ADD COLUMN "leave_life_event_id" integer NULL REFERENCES "leave_life_events"("id")',
    );
    await q.query(`CREATE TABLE "leave_rule_overrides" (
      "id" SERIAL PRIMARY KEY,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "employee_id" integer NOT NULL REFERENCES "employees"("id"),
      "leave_request_id" integer NULL REFERENCES "leave_requests"("id"),
      "rule_code" varchar(60) NOT NULL,
      "applies_on" date NULL,
      "reason" text NOT NULL CHECK (length(trim("reason")) > 0),
      "certificate_document_id" integer NULL REFERENCES "leave_documents"("id"),
      "created_by_company_user_id" integer NOT NULL REFERENCES "company_users"("id"),
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      'CREATE INDEX "IDX_leave_rule_override_target" ON "leave_rule_overrides" ("company_id", "employee_id", "rule_code")',
    );
    await q.query(
      `CREATE TRIGGER "TRG_leave_rule_overrides_append_only" BEFORE UPDATE OR DELETE ON "leave_rule_overrides" FOR EACH ROW EXECUTE FUNCTION leave_ledger_append_only()`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = (await q.query(
      `SELECT (SELECT count(*) FROM "leave_life_events") + (SELECT count(*) FROM "leave_rule_overrides") AS count`,
    )) as Array<{ count: string }>;
    if (Number(rows[0].count) > 0)
      throw new Error('Cannot remove life event / override history');
    await q.query('DROP TABLE "leave_rule_overrides"');
    await q.query(
      'ALTER TABLE "leave_requests" DROP COLUMN "leave_life_event_id"',
    );
    await q.query('DROP TABLE "leave_life_events"');
  }
}

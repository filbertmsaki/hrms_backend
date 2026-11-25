import { MigrationInterface, QueryRunner } from 'typeorm';

export class FieldCheckoutCorrections1797900218000 implements MigrationInterface {
  name = 'FieldCheckoutCorrections1797900218000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE IF NOT EXISTS "field_visit_checkout_corrections" ("id" SERIAL PRIMARY KEY, "company_id" integer NOT NULL, "field_visit_id" integer NOT NULL, "employee_id" integer NOT NULL, "requested_checkout_at" timestamptz NOT NULL, "reason" text NOT NULL, "discussion_notes" text NOT NULL, "outcome" text NOT NULL, "status" varchar(20) NOT NULL DEFAULT 'PENDING', "review_comments" text, "reviewed_by_company_user_id" integer, "reviewed_at" timestamptz, "created_at" timestamptz NOT NULL DEFAULT now())`,
    );
    await q.query(
      `CREATE INDEX IF NOT EXISTS "IDX_field_checkout_correction_company_status" ON "field_visit_checkout_corrections" ("company_id", "status")`,
    );
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_field_checkout_correction_pending" ON "field_visit_checkout_corrections" ("company_id", "field_visit_id") WHERE "status" = 'PENDING'`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS "field_visit_checkout_corrections"`);
  }
}

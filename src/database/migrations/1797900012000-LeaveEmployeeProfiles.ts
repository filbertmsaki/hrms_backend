import { MigrationInterface, QueryRunner } from 'typeorm';

export class LeaveEmployeeProfiles1797900012000 implements MigrationInterface {
  name = 'LeaveEmployeeProfiles1797900012000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "leave_employee_profiles" (
      "id" SERIAL PRIMARY KEY,
      "company_id" integer NOT NULL REFERENCES "companies"("id"),
      "employee_id" integer NOT NULL REFERENCES "employees"("id"),
      "effective_date" date NOT NULL,
      "jurisdiction" varchar(20) NOT NULL CHECK ("jurisdiction" IN ('mainland', 'zanzibar')),
      "fte" numeric(5,4) NOT NULL CHECK ("fte" > 0 AND "fte" <= 1),
      "cycle_anchor_date" date NULL,
      "previous_employment_periods" jsonb NOT NULL CHECK (jsonb_typeof("previous_employment_periods") = 'array'),
      "reason" text NOT NULL CHECK (length(trim("reason")) > 0),
      "created_by_company_user_id" integer NOT NULL REFERENCES "company_users"("id"),
      "created_at" timestamptz NOT NULL DEFAULT now()
    )`);
    await q.query(
      'CREATE INDEX "IDX_leave_employee_profile_effective" ON "leave_employee_profiles" ("company_id", "employee_id", "effective_date", "id")',
    );
  }

  async down(q: QueryRunner): Promise<void> {
    const rows = (await q.query(
      'SELECT count(*) AS count FROM "leave_employee_profiles"',
    )) as Array<{ count: string }>;
    if (Number(rows[0].count) > 0)
      throw new Error('Cannot remove leave employee profile history');
    await q.query('DROP TABLE "leave_employee_profiles"');
  }
}

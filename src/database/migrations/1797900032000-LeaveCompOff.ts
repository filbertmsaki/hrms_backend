import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Compensatory-off foundation (FRS-11.1.09). Both tables start empty: no
 * company earns comp-off until HR records and approves a policy row.
 */
export class LeaveCompOff1797900032000 implements MigrationInterface {
  name = 'LeaveCompOff1797900032000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "leave_comp_off_policies" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "leave_type_id" integer NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'draft',
        "hours_per_day" numeric(6,2),
        "minimum_hours" numeric(6,2),
        "max_days_per_credit" numeric(6,2),
        "expiry_days" integer,
        "requires_approval" boolean NOT NULL DEFAULT true,
        "eligible_employment_types" jsonb,
        "allowed_sources" jsonb NOT NULL DEFAULT '["OVERTIME_REQUEST"]',
        "approved_by_company_user_id" integer,
        "approved_at" TIMESTAMP,
        "notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_comp_off_policies" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_leave_comp_off_policy_type" UNIQUE ("company_id", "leave_type_id")
      )`);
    await q.query(`
      CREATE TABLE "leave_comp_off_credits" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "leave_type_id" integer NOT NULL,
        "policy_id" integer NOT NULL,
        "source_type" character varying(40) NOT NULL,
        "source_reference" character varying(120) NOT NULL,
        "work_date" date NOT NULL,
        "hours" numeric(6,2) NOT NULL,
        "days" numeric(6,2) NOT NULL,
        "leave_year" character varying(20) NOT NULL,
        "expires_on" date,
        "status" character varying(20) NOT NULL,
        "expired_days" numeric(6,2) NOT NULL DEFAULT 0,
        "credit_transaction_id" integer,
        "closing_transaction_id" integer,
        "requested_by_company_user_id" integer,
        "approved_by_company_user_id" integer,
        "approved_at" TIMESTAMP,
        "closed_reason" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_leave_comp_off_credits" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_leave_comp_off_credit_source" UNIQUE ("company_id", "source_type", "source_reference")
      )`);
    await q.query(
      `CREATE INDEX "IDX_leave_comp_off_credit_employee" ON "leave_comp_off_credits" ("company_id", "employee_id", "leave_type_id", "status")`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "leave_comp_off_credits"`);
    await q.query(`DROP TABLE "leave_comp_off_policies"`);
  }
}

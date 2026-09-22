import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayrollSourcesPoliciesAssignments1790000000000 implements MigrationInterface {
  name = 'AddPayrollSourcesPoliciesAssignments1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payroll_group_assignments" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "payroll_group_id" integer NOT NULL,
        "employee_id" integer NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "metadata" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_group_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payroll_group_assignment_effective" UNIQUE ("company_id", "payroll_group_id", "employee_id", "effective_from")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_group_assignment_group_status"
       ON "payroll_group_assignments" ("company_id", "payroll_group_id", "status")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payroll_leave_rules" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "code" varchar(80) NOT NULL,
        "name" varchar(180) NOT NULL,
        "leave_type_code" varchar(80) NOT NULL,
        "paid_percentage" numeric(7,4) NOT NULL DEFAULT '100',
        "paid_days_cap" numeric(10,2),
        "half_pay_after_days" numeric(10,2),
        "unpaid_after_days" numeric(10,2),
        "carry_forward_cap_days" numeric(10,2),
        "effective_from" date NOT NULL,
        "effective_to" date,
        "status" varchar(30) NOT NULL DEFAULT 'ACTIVE',
        "configuration" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_leave_rules" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payroll_leave_rule_company_code" UNIQUE ("company_id", "code")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_leave_rule_type_status"
       ON "payroll_leave_rules" ("company_id", "leave_type_code", "status")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "payroll_source_records" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "payroll_period_id" integer NOT NULL,
        "employee_id" integer,
        "source_type" varchar(60) NOT NULL,
        "source_reference" varchar(150) NOT NULL,
        "scheme_code" varchar(80),
        "component_code" varchar(80) NOT NULL,
        "source_amount" numeric(18,2) NOT NULL DEFAULT '0',
        "quantity" numeric(18,6),
        "rate" numeric(18,6),
        "calculated_amount" numeric(18,2) NOT NULL DEFAULT '0',
        "currency" varchar(3) NOT NULL DEFAULT 'TZS',
        "status" varchar(30) NOT NULL DEFAULT 'DRAFT',
        "payload" jsonb,
        "generated_payroll_input_id" integer,
        "approved_by_company_user_id" integer,
        "approved_at" TIMESTAMP WITH TIME ZONE,
        "posted_by_company_user_id" integer,
        "posted_at" TIMESTAMP WITH TIME ZONE,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_source_records" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_payroll_source_company_reference" UNIQUE ("company_id", "source_type", "source_reference")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_source_company_period_status"
       ON "payroll_source_records" ("company_id", "payroll_period_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payroll_source_company_period_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_source_records"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payroll_leave_rule_type_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_leave_rules"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_payroll_group_assignment_group_status"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "payroll_group_assignments"`);
  }
}

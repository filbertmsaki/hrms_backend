import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Attendance deduction policies. No policy is created here: monetary
 * attendance deductions stay off until HR activates an approved policy.
 */
export class PayrollAttendanceDeductionPolicies1797900044000 implements MigrationInterface {
  name = 'PayrollAttendanceDeductionPolicies1797900044000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "payroll_attendance_deduction_policies" (
        "id" SERIAL NOT NULL,
        "company_id" integer NOT NULL,
        "name" character varying(120) NOT NULL,
        "effective_from" date NOT NULL,
        "effective_to" date NULL,
        "rules" jsonb NOT NULL,
        "status" character varying(20) NOT NULL DEFAULT 'DRAFT',
        "legal_review_reference" text NULL,
        "created_by_company_user_id" integer NULL,
        "approved_by_company_user_id" integer NULL,
        "approved_at" TIMESTAMP WITH TIME ZONE NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payroll_attendance_deduction_policies" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_payroll_attendance_deduction_policy_company"
       ON "payroll_attendance_deduction_policies" ("company_id", "status")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TABLE IF EXISTS "payroll_attendance_deduction_policies"`,
    );
  }
}
